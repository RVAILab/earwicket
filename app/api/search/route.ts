import { NextRequest, NextResponse } from 'next/server';
import { spotifyClient } from '@/lib/spotify/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { success: false, error: 'Query parameter required' },
      { status: 400 }
    );
  }

  try {
    const tracks = await spotifyClient.searchTracks(query);

    return NextResponse.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    console.error('Error searching Spotify:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to search Spotify',
      },
      { status: 500 }
    );
  }
}
