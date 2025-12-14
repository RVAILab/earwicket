import { NextResponse } from 'next/server';
import { spotifyClient } from '@/lib/spotify/client';

export async function GET() {
  try {
    const playlists = await spotifyClient.getUserPlaylists();

    return NextResponse.json({
      success: true,
      data: playlists,
    });
  } catch (error: any) {
    console.error('Error fetching Spotify playlists:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Spotify playlists',
      },
      { status: 500 }
    );
  }
}
