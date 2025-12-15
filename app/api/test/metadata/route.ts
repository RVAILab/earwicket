import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

/**
 * Get playback metadata (what's actually playing)
 * This shows track name, artist, album art, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('group_id');

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: 'group_id required' },
        { status: 400 }
      );
    }

    // Get access token
    const creds = await db.queryOne<{ access_token: string }>(
      `SELECT access_token FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
    );

    if (!creds) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fetch playback metadata
    const response = await fetch(
      `https://api.ws.sonos.com/control/api/v1/groups/${groupId}/playbackMetadata`,
      {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch metadata: ${error}`);
    }

    const metadata = await response.json();

    console.log('[TEST] Playback metadata:', JSON.stringify(metadata, null, 2));

    return NextResponse.json({
      success: true,
      data: metadata,
    });
  } catch (error: any) {
    console.error('[TEST] Error fetching metadata:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
