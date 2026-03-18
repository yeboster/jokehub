import { NextRequest, NextResponse } from 'next/server';
import { verifyApiToken } from '@/lib/auth';
import { adminDb } from '@/lib/admin';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';

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
    
    // Use Marco's user ID for jokes added via API
    const userId = 'Zxb2vvsmjshTAyAxb31bEQOQVGs1';
    
    // Generate keywords from text
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map(word => word.replace(/[.,!?;:()"'`]/g, ''))
      .filter(word => word.length > 2);
    const keywords = Array.from(new Set(words));

    // Add joke using Admin SDK (bypasses security rules)
    const jokeRef = adminDb.collection('jokes').doc();
    await jokeRef.set({
      text,
      category,
      source: source || 'Jarvis AI',
      userId,
      funnyRate: 0,
      averageRating: 0,
      ratingCount: 0,
      dateAdded: FieldValue.serverTimestamp(),
      used: false,
      keywords,
    });

    return NextResponse.json({ id: jokeRef.id, text, category }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding joke:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
