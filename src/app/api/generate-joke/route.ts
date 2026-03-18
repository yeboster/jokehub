
import { NextRequest, NextResponse } from 'next/server';
import { generateJoke, type GenerateJokeInput, type GenerateJokeOutput } from '@/ai/flows/generate-joke-flow';
import { z } from 'zod';

// Define the expected input schema for the API request body
const ApiInputSchema = z.object({
  topicHint: z.string().optional(),
  prefilledJokes: z.array(z.string()).optional(),
  model: z.enum(['googleai/gemini-3-flash', 'googleai/gemini-3.1-pro']).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedInput = ApiInputSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    const { topicHint, prefilledJokes, model, temperature } = parsedInput.data;

    // Prepare the input for the Genkit flow
    const aiInput: GenerateJokeInput = { topicHint, prefilledJokes, model, temperature };
    
    // Call the server-side Genkit flow
    const aiOutput: GenerateJokeOutput = await generateJoke(aiInput);

    // Return the successful response
    return NextResponse.json(aiOutput, { status: 200 });

  } catch (error: any) {
    console.error('API Error generating joke:', error);
    
    let errorMessage = 'Failed to generate joke.';
    // If the error is an instance of Error, use its message
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // You could add more specific error handling here if needed,
    // for example, checking error.code for specific AI model errors.

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
