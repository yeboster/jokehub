import { NextRequest, NextResponse } from 'next/server';
import { addJoke } from '@/services/jokeService';
import { verifyApiToken } from '@/lib/auth';
import { z } from 'zod';

const AddJokeSchema = z.object({
  text: z.string().min(1).describe('The joke text'),
  category: z.string().min(1).describe('The category'),
  source: z.string().optional().describe('Source of the joke'),
});

// POST /api/jokes/add
export async function POST(request: NextRequest) {
  try {
    // Verify API token
    const authResult = await verifyApiToken(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsedInput = AddJokeSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    const { text, category, source } = parsedInput.data;
    
    // Use a system user ID for jokes added via API
    const systemUserId = 'api-user';
    
    const joke = await addJoke(
      { text, category, source: source || 'Jarvis AI' },
      systemUserId
    );

    return NextResponse.json({ joke }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding joke:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
