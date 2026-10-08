// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readGenerationStream } from './generationProgress';
import { JokeVariationSchema } from '@/ai/flows/joke-selection';
const bytes = (text: string) => new TextEncoder().encode(text);
function stream(chunks: Uint8Array[]) { return new ReadableStream<Uint8Array>({ start(c) { chunks.forEach(chunk => c.enqueue(chunk)); c.close(); } }); }
describe('generation stream reader', () => {
  it('handles split UTF-8 and NDJSON frames, returning only terminal output', async () => {
    const frames = [
      { type: 'progress', requestId: 'r', stage: 'reviewing', elapsedMs: 0, callCount: 2 },
      { type: 'result', requestId: 'r', output: { jokes: ['caffè'] } },
    ];
    const raw = bytes(frames.map(frame => JSON.stringify(frame)).join('\n') + '\n');
    const seen: string[] = [];
    const output = await readGenerationStream(stream(Array.from(raw, byte => Uint8Array.of(byte))), frame => seen.push(frame.type));
    expect(output).toEqual({ jokes: ['caffè'] });
    expect(seen).toEqual(['progress', 'result']);
  });
  it('accepts identical frames coalesced or split regardless of transport chunk size', async () => {
    const heartbeat = JSON.stringify({ type: 'heartbeat', requestId: 'r', elapsedMs: 5000 }) + '\n';
    const result = JSON.stringify({ type: 'result', requestId: 'r', output: { jokes: ['done'] } }) + '\n';
    const lines = [...Array<string>(1200).fill(heartbeat), result];
    expect(bytes(lines.join('')).length).toBeGreaterThan(64_000);
    for (const chunks of [[bytes(lines.join(''))], lines.map(bytes)]) {
      const seen: string[] = [];
      await expect(readGenerationStream(stream(chunks), frame => seen.push(frame.type))).resolves.toEqual({ jokes: ['done'] });
      expect(seen.filter(type => type === 'heartbeat')).toHaveLength(1200);
      expect(seen.at(-1)).toBe('result');
    }
  });
  it('accepts schema-valid large categories in coalesced and fragmented result frames', async () => {
    const jokes = Array.from({ length: 3 }, (_, i) => ({ jokeText: `Joke ${i}`, category: 'x'.repeat(65_000) }));
    jokes.forEach(joke => expect(JokeVariationSchema.safeParse(joke).success).toBe(true));
    const raw = bytes(JSON.stringify({ type: 'result', requestId: 'r', output: { jokes } }) + '\n');
    const fragments = Array.from({ length: Math.ceil(raw.length / 1024) }, (_, i) => raw.slice(i * 1024, (i + 1) * 1024));
    for (const chunks of [[raw], fragments]) {
      await expect(readGenerationStream(stream(chunks), () => {})).resolves.toEqual({ jokes });
    }
  });
  it('rejects request ID changes and malformed frames before notifying UI', async () => {
    const progress = { type: 'progress', requestId: 'first', stage: 'generating', elapsedMs: 0, callCount: 1 };
    const output = { type: 'result', requestId: 'other', output: {} };
    await expect(readGenerationStream(stream([bytes(JSON.stringify(progress) + '\n' + JSON.stringify(output))]), () => {})).rejects.toThrow('Invalid generation');
    await expect(readGenerationStream(stream([bytes('{"type":"progress","requestId":"r","stage":"toString"}\n')]), () => {})).rejects.toThrow('Invalid generation');
  });
  it('cancels pending transport immediately after terminal result', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes('{"type":"result","requestId":"r","output":42}\n')); }, cancel() { cancelled = true; } });
    expect(await readGenerationStream(body, () => {})).toBe(42);
    expect(cancelled).toBe(true);
  });
});
