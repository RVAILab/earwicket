import { NextResponse } from 'next/server';
import { spotifyClient } from '@/lib/spotify/client';

export async function POST(request: Request) {
  try {
    const { playlistIds } = await request.json();

    if (!Array.isArray(playlistIds)) {
      return NextResponse.json(
        { success: false, error: 'playlistIds must be an array' },
        { status: 400 }
      );
    }

    const durations: Record<string, number> = {};

    for (const playlistId of playlistIds) {
      try {
        durations[playlistId] = await spotifyClient.getPlaylistDuration(playlistId);
      } catch (error) {
        console.error(`Error fetching duration for playlist ${playlistId}:`, error);
        durations[playlistId] = 0;
      }
    }

    return NextResponse.json({
      success: true,
      data: durations,
    });
  } catch (error: any) {
    console.error('Error fetching playlist durations:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch playlist durations',
      },
      { status: 500 }
    );
  }
}
