/**
 * OpenCode Zen models for joke generation, discovered from OpenCode's public
 * model catalog and exposed to Genkit as `opencode/<id>`.
 *
 * Only low-cost paid models are offered: OpenCode reserves its free tier for
 * the OpenCode client ("Free-tier chat models require OpenCode; use paid
 * models or Go from other clients"), so calling free models from JokeHub
 * would break those terms. Server-only: reads OPENCODE_API_KEY.
 */
import { genkitPluginV2, model } from 'genkit/plugin';
import type { GenerateRequest, GenerateResponseData, MessageData } from 'genkit/model';

export const OPENCODE_MODEL_PREFIX = 'opencode/';
export const OPENCODE_MODELS_URL = 'https://opencode.ai/inference/v1/models';
// Pinned: the API key is only ever sent here, never to a URL taken from the catalog.
export const OPENCODE_BASE_URL = 'https://opencode.ai/inference/openai/v1';
// USD per million tokens. A generate + critique batch is roughly 8k input and
// 2k output tokens, so models at this cap cost under a cent per batch.
const MAX_INPUT_PRICE = 0.5;
const MAX_OUTPUT_PRICE = 2;
const CATALOG_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MODEL_SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const USER_AGENT = 'jokehub/1.0';

export type OpenCodeModelOption = { id: string; label: string };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const price = (cost: unknown, side: 'input' | 'output') => record(record(record(cost).text)[side]).price;

export function isOpenCodeModelId(id: string): boolean {
  return id.startsWith(OPENCODE_MODEL_PREFIX) && MODEL_SLUG.test(id.slice(OPENCODE_MODEL_PREFIX.length));
}

/** Filters the raw catalog to models JokeHub may call, cheapest first. */
export function selectOpenCodeModels(catalog: unknown): OpenCodeModelOption[] {
  const data = record(catalog).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap(raw => {
    const entry = record(raw);
    const capabilities = record(entry.capabilities);
    const input = price(entry.cost, 'input');
    const output = price(entry.cost, 'output');
    const usable = typeof entry.id === 'string' && MODEL_SLUG.test(entry.id) && entry.type === 'chat'
      && capabilities.structured_output === true && capabilities.temperature === true
      && record(record(entry.api)['chat-completions']).base_url === OPENCODE_BASE_URL
      && typeof input === 'number' && typeof output === 'number'
      && input > 0 && output > 0 && input <= MAX_INPUT_PRICE && output <= MAX_OUTPUT_PRICE;
    if (!usable) return [];
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 60) : entry.id as string;
    return [{ id: `${OPENCODE_MODEL_PREFIX}${entry.id}`, label: `${name} (OpenCode)`, cost: input + output }];
  }).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id)).map(({ id, label }) => ({ id, label }));
}

let catalogCache: { expires: number; models: OpenCodeModelOption[] } | null = null;

/** Models offered in the picker; empty when OpenCode is not configured or unreachable. */
export async function fetchOpenCodeModels(): Promise<OpenCodeModelOption[]> {
  if (!process.env.OPENCODE_API_KEY) return [];
  if (catalogCache && Date.now() < catalogCache.expires) return catalogCache.models.map(m => ({ ...m }));
  let models: OpenCodeModelOption[] = [];
  let ttl = FAILURE_TTL_MS;
  try {
    const response = await fetch(OPENCODE_MODELS_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.ok) {
      models = selectOpenCodeModels(await response.json());
      ttl = CATALOG_TTL_MS;
    }
  } catch {
    // An unreachable catalog only hides the extra models.
  }
  catalogCache = { expires: Date.now() + ttl, models };
  return models.map(m => ({ ...m }));
}

function toChatMessages(messages: MessageData[]) {
  return messages.map(message => ({
    role: message.role === 'model' ? 'assistant' : message.role,
    content: message.content.map(part => part.text ?? '').join(''),
  }));
}

function finishReason(reason: unknown): GenerateResponseData['finishReason'] {
  if (reason === 'stop') return 'stop';
  if (reason === 'length') return 'length';
  if (reason === 'content_filter') return 'blocked';
  return 'other';
}

async function generateWithOpenCode(id: string, request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponseData> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) throw new Error('OpenCode is not configured.');
  const schema = request.output?.schema;
  const body = {
    model: id,
    messages: toChatMessages(request.messages),
    ...(typeof request.config?.temperature === 'number' ? { temperature: request.config.temperature } : {}),
    ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'output', schema } } }
      : request.output?.format === 'json' ? { response_format: { type: 'json_object' } } : {}),
  };
  const response = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(body),
    signal,
  });
  // Provider error bodies can echo prompts, so only the status is surfaced.
  if (!response.ok) throw new Error(`OpenCode request failed with status ${response.status}.`);
  const data = record(await response.json());
  const choice = record(Array.isArray(data.choices) ? data.choices[0] : undefined);
  const content = record(choice.message).content;
  const usage = record(data.usage);
  return {
    message: { role: 'model', content: [{ text: typeof content === 'string' ? content : '' }] },
    finishReason: finishReason(choice.finish_reason),
    usage: {
      inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
      outputTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined,
    },
  };
}

/** Resolves any `opencode/<slug>` model on demand; callers validate against the catalog. */
export function openCode() {
  return genkitPluginV2({
    name: 'opencode',
    resolve: (actionType, name) => {
      const id = name.startsWith(OPENCODE_MODEL_PREFIX) ? name.slice(OPENCODE_MODEL_PREFIX.length) : name;
      if (actionType !== 'model' || !MODEL_SLUG.test(id)) return undefined;
      return model({
        name: `${OPENCODE_MODEL_PREFIX}${id}`,
        label: `OpenCode ${id}`,
        supports: { multiturn: true, systemRole: true, tools: false, media: false, output: ['json', 'text'], constrained: 'no-tools' },
      }, (request, { abortSignal }) => generateWithOpenCode(id, request, abortSignal));
    },
  });
}
