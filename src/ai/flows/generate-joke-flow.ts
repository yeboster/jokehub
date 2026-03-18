
'use server';
/**
 * @fileOverview AI flow for generating jokes.
 *
 * - generateJoke - A function that generates a joke and suggests a category.
 * - GenerateJokeInput - The input type for the generateJoke function.
 * - GenerateJokeOutput - The return type for the generateJoke function.
 */

import { ai } from '@/ai/ai-instance';
import { jokeGenerationPrompt, systemInstruction } from '@/ai/prompts/generate-joke-prompt';
import { z } from 'genkit';

const GenerateJokeInputSchema = z.object({
  topicHint: z.string().optional().describe('An optional topic or category hint for the joke.'),
  prefilledJokes: z.array(z.string()).optional().describe('A list of prefilled jokes to ensure the generated jokes are different.'),
  model: z.enum(['googleai/gemini-3.1-pro', 'googleai/gemini-3-flash']).optional().describe('The model to use for generation.'),
  temperature: z.number().min(0).max(2).optional().describe('Controls the randomness of the output. Higher values (e.g., 1.5) are more creative, lower values (e.g., 0.2) are more predictable.'),
});

export type GenerateJokeInput = z.infer<typeof GenerateJokeInputSchema>;

const JokeObjectSchema = z.object({
  jokeText: z.string().describe('The generated joke, including setup and punchline.'),
  category: z.string().describe('A suggested category for the joke (e.g., Animals, Puns, Work).'),
});

const GenerateJokeOutputSchema = z.object({
    jokes: z.array(JokeObjectSchema).describe('An array of three different jokes.'),
});
export type GenerateJokeOutput = z.infer<typeof GenerateJokeOutputSchema>;
export type JokeVariation = z.infer<typeof JokeObjectSchema>;


export async function generateJoke(input: GenerateJokeInput): Promise<GenerateJokeOutput> {
  return generateJokeFlow(input);
}

const generateJokeFlow = ai.defineFlow(
  {
    name: 'generateJokeFlow',
    inputSchema: GenerateJokeInputSchema,
    outputSchema: GenerateJokeOutputSchema,
  },
  async (input) => {
    const prompt = jokeGenerationPrompt(input.topicHint, input.prefilledJokes);

    const res = await ai.generate({
      prompt,
      model: input.model || 'googleai/gemini-3-flash', // Default to flash if not provided
      system: systemInstruction,
      output: { schema: GenerateJokeOutputSchema },
      config: {
        temperature: input.temperature,
      }
    });
    console.error(res)
    const output = res.output;
    if (!output || typeof output !== 'object') {
      throw new Error('AI failed to generate a joke. The output was empty.');
    }
    // Validate the output against the schema to be sure
    const parsedOutput = GenerateJokeOutputSchema.safeParse(output);
    if (!parsedOutput.success) {
        console.error("AI output validation error:", parsedOutput.error);
        throw new Error('AI returned data in an unexpected format.');
    }
    return parsedOutput.data;
  }
);
