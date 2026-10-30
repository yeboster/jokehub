// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { genkit, z } from 'genkit';

const fetchMock = vi.fn();
const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, name: `Name ${id}`, type: 'chat',
  capabilities: { structured_output: true, temperature: true },
  cost: { text: { input: { price: 0.15 }, output: { price: 0.5 } } },
  api: { 'chat-completions': { base_url: 'https://opencode.ai/inference/openai/v1' } },
  ...overrides,
});
const json = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });
async function load() { return import('./opencode'); }

beforeEach(() => {
  vi.resetModules(); fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENCODE_API_KEY', 'test-key');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('selectOpenCodeModels', () => {
  it('keeps low-cost structured-output chat-completions models, cheapest first', async () => {
    const { selectOpenCodeModels } = await load();
    const catalog = { data: [
      entry('pricier', { cost: { text: { input: { price: 0.3 }, output: { price: 1.2 } } } }),
      entry('cheap', { name: 'Cheap Flash' }),
    ] };
    expect(selectOpenCodeModels(catalog)).toEqual([
      { id: 'opencode/cheap', label: 'Cheap Flash (OpenCode)' },
      { id: 'opencode/pricier', label: 'Name pricier (OpenCode)' },
    ]);
  });
  it.each([
    // The free tier is reserved for the OpenCode client itself.
    ['free tier', entry('free', { cost: { text: { input: { price: 0 }, output: { price: 0 } } } })],
    ['expensive input', entry('big', { cost: { text: { input: { price: 0.51 }, output: { price: 1 } } } })],
    ['expensive output', entry('big', { cost: { text: { input: { price: 0.1 }, output: { price: 2.01 } } } })],
    ['missing price', entry('unknown', { cost: {} })],
    ['no structured output', entry('loose', { capabilities: { temperature: true } })],
    ['no temperature', entry('fixed', { capabilities: { structured_output: true } })],
    ['responses API only', entry('resp', { api: { responses: { base_url: 'https://opencode.ai/inference/openai/v1' } } })],
    ['foreign base URL', entry('elsewhere', { api: { 'chat-completions': { base_url: 'https://evil.example/v1' } } })],
    ['non-chat type', entry('embed', { type: 'embedding' })],
    ['unsafe id', entry('../x')],
  ])('drops %s', async (_, model) => {
    const { selectOpenCodeModels } = await load();
    expect(selectOpenCodeModels({ data: [model] })).toEqual([]);
  });
  it.each([null, 'nope', { data: 'x' }, { data: [null, 3] }])('tolerates malformed catalog %j', async catalog => {
    const { selectOpenCodeModels } = await load();
    expect(selectOpenCodeModels(catalog)).toEqual([]);
  });
});

describe('fetchOpenCodeModels', () => {
  it('lists nothing and skips the catalog when no API key is configured', async () => {
    vi.stubEnv('OPENCODE_API_KEY', '');
    const { fetchOpenCodeModels } = await load();
    expect(await fetchOpenCodeModels()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reads the public catalog once per 10 minutes and returns copies', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1000);
    fetchMock.mockResolvedValue(json({ data: [entry('cheap')] }));
    const { fetchOpenCodeModels } = await load();
    const first = await fetchOpenCodeModels(); first.pop();
    expect(await fetchOpenCodeModels()).toEqual([{ id: 'opencode/cheap', label: 'Name cheap (OpenCode)' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://opencode.ai/inference/v1/models');
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBeUndefined();
    vi.setSystemTime(1000 + 10 * 60_000);
    await fetchOpenCodeModels();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('degrades to no models on failure and retries after a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1000);
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(json({}, 503)).mockResolvedValue(json({ data: [entry('cheap')] }));
    const { fetchOpenCodeModels } = await load();
    expect(await fetchOpenCodeModels()).toEqual([]);
    expect(await fetchOpenCodeModels()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1000 + 60_000);
    expect(await fetchOpenCodeModels()).toEqual([]);
    vi.setSystemTime(1000 + 120_000);
    expect(await fetchOpenCodeModels()).toHaveLength(1);
  });
});

describe('opencode Genkit plugin', () => {
  const completion = (content: string) => json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5 } });
  async function generate(options: Record<string, unknown> = {}) {
    const { openCode } = await load();
    const ai = genkit({ plugins: [openCode()] });
    return ai.generate({ model: 'opencode/glm-5.3-flash', system: 'Be brief.', prompt: 'Tell one joke.', output: { schema: z.object({ joke: z.string() }) }, config: { temperature: 0.2 }, ...options });
  }
  it('calls OpenCode chat completions with a JSON schema and parses the structured output', async () => {
    fetchMock.mockResolvedValue(completion('{"joke":"I used to be a banker, but I lost interest."}'));
    const response = await generate();
    expect(response.output).toEqual({ joke: 'I used to be a banker, but I lost interest.' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://opencode.ai/inference/openai/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.headers['User-Agent']).toMatch(/^jokehub\//);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('glm-5.3-flash');
    expect(body.temperature).toBe(0.2);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be brief.' });
    expect(body.messages.at(-1).role).toBe('user');
    expect(body.messages.at(-1).content).toContain('Tell one joke.');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.properties.joke.type).toBe('string');
  });
  it('fails without echoing the provider response body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'SECRET prompt echo' }), text: async () => 'SECRET prompt echo' });
    await expect(generate()).rejects.toThrow(/401/);
    await expect(generate()).rejects.not.toThrow(/SECRET/);
  });
  it('refuses to call OpenCode without an API key', async () => {
    vi.stubEnv('OPENCODE_API_KEY', '');
    await expect(generate()).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
