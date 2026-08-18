import { NextRequest, NextResponse } from 'next/server';
import { verifyApiToken } from '@/lib/auth';
import { adminDb } from '@/lib/admin';
import { generateKeywords } from '@/lib/text';
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
      // 500 when the server itself is unconfigured (see `verifyApiToken`).
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: authResult.status ?? 401 });
    }

    const body = await request.json();
    const parsedInput = AddJokeSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsedInput.error.format() }, { status: 400 });
    }

    const { text, category, source } = parsedInput.data;

    const userId = process.env.JOKEHUB_JARVIS_USER_ID;
    if (!userId) {
      console.error('JOKEHUB_JARVIS_USER_ID env var is not set');
      return NextResponse.json({ error: 'Server misconfiguration: JOKEHUB_JARVIS_USER_ID is not set' }, { status: 500 });
    }

    // Generate keywords from text
    const keywords = generateKeywords(text);

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
      ratingSum: 0,
      dateAdded: FieldValue.serverTimestamp(),
      used: false,
      keywords,
    });

    return NextResponse.json({ id: jokeRef.id, text, category }, { status: 201 });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adminDb write failures surface as FirebaseError which extends Error but TS can't see `.message` on unknown in this branch.
    const err = error as any;
    console.error('Error adding joke:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
