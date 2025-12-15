import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * Simple test endpoint to play a track
 * Usage: /api/test/play-track?group_id=xxx&track_uri=spotify:track:xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('group_id');
    const trackUri = searchParams.get('track_uri');

    if (!groupId || !trackUri) {
      return NextResponse.json(
        {
          success: false,
          error: 'group_id and track_uri required',
          example: '/api/test/play-track?group_id=RINCON_xxx&track_uri=spotify:track:xxx'
        },
        { status: 400 }
      );
    }

    console.log('[TEST] Attempting to play track:', {
      groupId,
      trackUri,
    });

    // Try to load the track
    await sonosClient.loadTrack(groupId, trackUri, true);

    console.log('[TEST] Successfully loaded track');

    return NextResponse.json({
      success: true,
      message: 'Track loaded and playing',
      data: {
        groupId,
        trackUri,
      },
    });
  } catch (error: any) {
    console.error('[TEST] Error playing track:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
