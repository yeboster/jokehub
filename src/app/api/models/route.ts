import { NextResponse } from 'next/server';
import { fetchOpenCodeModels } from '@/ai/opencode';

/**
 * Extra generation models discovered at runtime, beyond the built-in Gemini
 * list. The add-joke page loads this in the background after first render.
 */
export async function GET() {
  let models: Awaited<ReturnType<typeof fetchOpenCodeModels>> = [];
  try { models = await fetchOpenCodeModels(); } catch { /* Discovery is optional. */ }
  return NextResponse.json({ models }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
