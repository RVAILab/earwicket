import { NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

export async function GET() {
  try {
    // Check if Sonos credentials exist
    const sonosCreds = await db.queryOne(
      `SELECT id, expires_at FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
    );

    // Check if Spotify credentials exist
    const spotifyCreds = await db.queryOne(
      `SELECT id, expires_at FROM ${TABLES.SPOTIFY_CREDENTIALS} LIMIT 1`
    );

    const now = new Date();

    return NextResponse.json({
      success: true,
      data: {
        sonos: {
          connected: !!sonosCreds,
          expired: sonosCreds ? new Date(sonosCreds.expires_at) < now : false,
        },
        spotify: {
          connected: !!spotifyCreds,
          expired: spotifyCreds ? new Date(spotifyCreds.expires_at) < now : false,
        },
      },
    });
  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check status',
      },
      { status: 500 }
    );
  }
}
