import { NextRequest, NextResponse } from 'next/server';
import { fetchTopJokes } from '@/services/jokeService';
import { verifyApiToken } from '@/lib/auth';

// GET /api/jokes/top?limit=10&minRating=4
export async function GET(request: NextRequest) {
  try {
    // Verify API token
    const authResult = await verifyApiToken(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const minRating = parseFloat(searchParams.get('minRating') || '4');
    
    const jokes = await fetchTopJokes({ limit, minRating });
    
    return NextResponse.json({ 
      jokes, 
      query: { limit, minRating },
      count: jokes.length 
    }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching top jokes:', error);
    // Check if it's a Firestore index error
    if (error.message?.includes('requires an index')) {
      return NextResponse.json({ 
        error: 'Firestore index required. Please create composite index on jokes.averageRating.',
        details: error.message 
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
