
import { NextRequest, NextResponse } from 'next/server';
import { explainJoke } from '@/ai/flows/explain-joke-flow';
import { adminDb } from '@/lib/admin';
import { z } from 'zod';

// Zod schema for input validation
const ExplainJokeInputSchema = z.object({
  jokeId: z.string().optional(),
  jokeText: z.string().describe('The text of the joke to be explained.'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedInput = ExplainJokeInputSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    const { jokeId, jokeText } = parsedInput.data;
    const sourceStream = await explainJoke({ jokeText });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullExplanation = '';

    // Preserve live streaming while retaining the complete response for persistence.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = sourceStream.getReader();
        let streamClosed = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            fullExplanation += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          const trailingChunk = decoder.decode();
          if (trailingChunk) {
            fullExplanation += trailingChunk;
            controller.enqueue(encoder.encode(trailingChunk));
          }

          if (jokeId) {
            try {
              await adminDb.collection('jokes').doc(jokeId).update({
                explanation: fullExplanation,
              });
            } catch (error) {
              console.warn('Failed to persist AI joke explanation:', error);
            }
          }

          controller.close();
          streamClosed = true;
        } catch (error) {
          if (!streamClosed) {
            controller.error(error);
          }
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS 4.4 catch-unknown narrows poorly with Firebase/HTTP error unions here; any keeps the existing Error-extraction logic working unchanged.
    const err = error as any;
    console.error('API Error explaining joke:', err);
    let errorMessage = 'Failed to get joke explanation.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
