
import { NextRequest, NextResponse } from 'next/server';
import { explainJoke } from '@/ai/flows/explain-joke-flow';
import { z } from 'zod';

// Zod schema for input validation
const ExplainJokeInputSchema = z.object({
  jokeId: z.string().optional(), // Keep jokeId optional for now
  jokeText: z.string().describe('The text of the joke to be explained.'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedInput = ExplainJokeInputSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    // Call the streaming function
    const stream = await explainJoke(parsedInput.data);

    // Return the stream directly to the client
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // This header is often required for Vercel to prevent buffering
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
