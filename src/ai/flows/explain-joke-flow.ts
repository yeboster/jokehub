
'use server';
/**
 * @fileOverview AI flow for explaining a joke.
 *
 * - explainJoke - A function that generates an explanation for a given joke and returns it as a stream.
 */
import { ai } from '@/ai/ai-instance';
import {z} from 'zod';

const ExplainJokeInputSchema = z.object({
  jokeText: z.string().describe('The text of the joke to be explained.'),
});
export type ExplainJokeInput = z.infer<typeof ExplainJokeInputSchema>;

const systemInstruction = `You are a senior comedian trying to explain the jokes to the audience. Your tone should be insightful, a bit world-weary but still passionate about the craft of comedy.

Break down the joke's structure, identify the pun or the source of the humor, and explain why it works (or why it's a "groaner"). Keep the explanation concise, like a quick, witty aside during a comedy show. Do not just repeat the joke. Start directly with the explanation.`;

/**
 * Generates an explanation for a joke and returns it as a stream.
 */
export async function explainJoke(input: ExplainJokeInput): Promise<ReadableStream<any>> {
  const { stream } = ai.generateStream({
    model: 'googleai/gemini-2.0-flash',
    system: systemInstruction,
    prompt: `Explain this joke: "${input.jokeText}"`,
  });

  // Pipe the Genkit stream to a standard ReadableStream
  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of stream) {
        if (chunk.content) {
          controller.enqueue(encoder.encode(chunk.text));
        }
      }
      controller.close();
    },
  });

  return readableStream;
}
