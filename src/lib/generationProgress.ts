export const GENERATION_STAGE_LABELS = {
  examples: 'Loading examples',
  generating: 'Writing six candidates',
  reviewing: 'Reviewing quality',
  selecting: 'Selecting three distinct jokes',
  repairing: 'Improving weak candidates',
  'reviewing-repair': 'Reviewing improved candidates',
  'selecting-repair': 'Comparing improved jokes',
  'repair-fallback': 'Keeping the reviewed original batch',
} as const;
export type GenerationStage = keyof typeof GENERATION_STAGE_LABELS;
export type GenerationProgress = { stage: GenerationStage; callCount: number };
export type GenerationFrame =
  | ({ type: 'progress'; requestId: string; elapsedMs: number } & GenerationProgress)
  | { type: 'heartbeat'; requestId: string; elapsedMs: number }
  | { type: 'result'; requestId: string; output: unknown }
  | { type: 'error'; requestId: string; error: string; code: string };

/** Incremental UTF-8/NDJSON reader. Terminal result required; no silent truncation. */
export async function readGenerationStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: GenerationFrame) => void,
): Promise<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal = false;
  let output: unknown;
  let requestId: string | undefined;
  function consume(line: string) {
    if (!line.trim()) return;
    const frame = JSON.parse(line) as GenerationFrame;
    if (!frame || typeof frame.requestId !== 'string' || !frame.requestId || terminal || (requestId && requestId !== frame.requestId)) throw new Error('Invalid generation progress response.');
    requestId = frame.requestId;
    if (frame.type === 'progress' && (!Object.hasOwn(GENERATION_STAGE_LABELS, frame.stage) || !Number.isFinite(frame.elapsedMs) || frame.elapsedMs < 0 || !Number.isInteger(frame.callCount) || frame.callCount < 0 || frame.callCount > 4)) throw new Error('Invalid generation stage.');
    if (frame.type === 'error' && (typeof frame.error !== 'string' || typeof frame.code !== 'string')) throw new Error('Invalid generation error.');
    if (!['progress', 'heartbeat', 'error', 'result'].includes(frame.type)) throw new Error('Invalid generation progress response.');
    if (frame.type === 'heartbeat' && (!Number.isFinite(frame.elapsedMs) || frame.elapsedMs < 0)) throw new Error('Invalid generation heartbeat.');
    onFrame(frame);
    if (frame.type === 'error') throw new Error(frame.error);
    if (frame.type === 'result') { terminal = true; output = frame.output; }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // Output categories have no schema length cap. Do not impose a transport
      // chunk/frame cap that rejects otherwise valid JSON results.
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      if (done || terminal) break;
    }
    if (buffer.trim() && !terminal) consume(buffer);
    if (!terminal) throw new Error('Generation connection interrupted. Please try again.');
    return output;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
