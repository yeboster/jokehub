import { NextRequest, NextResponse } from 'next/server';
import { fetchTopJokes } from '@/services/jokeService';

// GET /api/jokes/top?limit=10&minFunnyRate=5
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const minFunnyRate = parseInt(searchParams.get('minFunnyRate') || '5');
    
    const jokes = await fetchTopJokes({ limit, minFunnyRate });
    
    return NextResponse.json({ jokes }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching top jokes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
