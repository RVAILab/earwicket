import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { group_id } = body;

    if (!group_id) {
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

    // Call Sonos skip endpoint
    const response = await fetch(
      `https://api.ws.sonos.com/control/api/v1/groups/${group_id}/playback/skipToNextTrack`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to skip: ${error}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Skipped to next track',
    });
  } catch (error: any) {
    console.error('Error skipping:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
