import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TasteRequestError, clearFeedback, createSample, deleteSample, listFeedback, listSamples, setFeedback, updateSample,
} from './tasteService';

const ID = 'c'.repeat(32);
const auth = { getIdToken: vi.fn(async () => 'id-token-1') };
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const feedback = { id: ID, jokeText: 'Joke', vote: 'up', saved: true, updatedAt: '2026-11-07T00:00:00.000Z' };
const sample = { id: ID, text: 'Sample', active: true, createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) };
};

describe('requests', () => {
  it('listFeedback sends the bearer token and optional limit, and parses the page', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { feedback: [feedback], counts: { liked: 1, disliked: 0 } }));
    expect(await listFeedback(auth)).toEqual({ feedback: [feedback], counts: { liked: 1, disliked: 0 } });
    expect(lastCall()).toMatchObject({ url: '/api/generated-joke-feedback', method: 'GET', headers: { Authorization: 'Bearer id-token-1' } });
    fetchMock.mockResolvedValueOnce(reply(200, { feedback: [], counts: { liked: 0, disliked: 0 } }));
    await listFeedback(auth, 20);
    expect(lastCall().url).toBe('/api/generated-joke-feedback?limit=20');
  });

  it('setFeedback POSTs JSON and returns the record or null', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true, feedback }));
    expect(await setFeedback(auth, { jokeText: 'Joke', vote: 'up', saved: true })).toEqual(feedback);
    expect(lastCall()).toMatchObject({
      url: '/api/generated-joke-feedback', method: 'POST', body: { jokeText: 'Joke', vote: 'up', saved: true },
      headers: { Authorization: 'Bearer id-token-1', 'Content-Type': 'application/json' },
    });
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true, feedback: null }));
    expect(await setFeedback(auth, { jokeText: 'Joke', vote: 'none', saved: false })).toBeNull();
    expect(lastCall().body).toEqual({ jokeText: 'Joke', vote: 'none', saved: false });
  });

  it('clearFeedback DELETEs and returns the count', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { deleted: 3 }));
    expect(await clearFeedback(auth)).toBe(3);
    expect(lastCall()).toMatchObject({ url: '/api/generated-joke-feedback', method: 'DELETE' });
  });

  it('sample CRUD uses the samples endpoint', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { samples: [sample] }));
    expect(await listSamples(auth)).toEqual([sample]);
    expect(lastCall()).toMatchObject({ url: '/api/joke-samples', method: 'GET' });

    fetchMock.mockResolvedValueOnce(reply(201, { sample, created: true }));
    expect(await createSample(auth, { text: 'Sample', note: 'n' })).toEqual({ sample, created: true });
    expect(lastCall()).toMatchObject({ url: '/api/joke-samples', method: 'POST', body: { text: 'Sample', note: 'n' } });

    fetchMock.mockResolvedValueOnce(reply(200, { sample: { ...sample, active: false } }));
    expect(await updateSample(auth, { id: ID, active: false })).toEqual({ ...sample, active: false });
    expect(lastCall()).toMatchObject({ url: '/api/joke-samples', method: 'PATCH', body: { id: ID, active: false } });

    fetchMock.mockResolvedValueOnce(reply(200, { deleted: true }));
    expect(await deleteSample(auth, ID)).toBe(true);
    expect(lastCall()).toMatchObject({ url: `/api/joke-samples?id=${ID}`, method: 'DELETE' });
  });
});

describe('errors', () => {
  it('throws TasteRequestError with the server message, code and status', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { error: 'You can keep up to 50 samples. Delete one to add another.', code: 'SAMPLE_LIMIT' }));
    const error = await createSample(auth, { text: 'Sample' }).catch(err => err);
    expect(error).toBeInstanceOf(TasteRequestError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: 'You can keep up to 50 samples. Delete one to add another.', code: 'SAMPLE_LIMIT', status: 409 });
  });

  it.each([
    ['a body without error', 500, {}],
    ['a non-JSON body', 502, '<html>Bad gateway</html>'],
  ])('falls back to "Request failed (<status>)" for %s', async (_name, status, body) => {
    fetchMock.mockResolvedValueOnce(reply(status, body));
    const error = await listSamples(auth).catch(err => err);
    expect(error).toBeInstanceOf(TasteRequestError);
    expect(error.message).toBe(`Request failed (${status})`);
    expect(error.code).toBeUndefined();
  });

  it('404 on update throws with NOT_FOUND', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, { error: 'Sample not found', code: 'NOT_FOUND' }));
    await expect(updateSample(auth, { id: ID, active: true })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('rejects an OK response that does not match the contract', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { samples: [{ id: 'nope' }] }));
    await expect(listSamples(auth)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  it('propagates token failures without calling fetch', async () => {
    auth.getIdToken.mockRejectedValueOnce(new Error('signed out'));
    await expect(listSamples(auth)).rejects.toThrow('signed out');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
