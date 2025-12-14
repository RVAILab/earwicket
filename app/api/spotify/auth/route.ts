import { NextResponse } from 'next/server';
import { spotifyClient } from '@/lib/spotify/client';

export async function GET() {
  try {
    const authUrl = spotifyClient.getAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Spotify auth:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initiate Spotify authentication' },
      { status: 500 }
    );
  }
}
