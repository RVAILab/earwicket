import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * Simple test endpoint to play a playlist
 * Usage: /api/test/play-playlist?group_id=xxx&playlist_uri=spotify:playlist:xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('group_id');
    const playlistUri = searchParams.get('playlist_uri');

    if (!groupId || !playlistUri) {
      return NextResponse.json(
        {
          success: false,
          error: 'group_id and playlist_uri required',
          example: '/api/test/play-playlist?group_id=RINCON_xxx&playlist_uri=spotify:playlist:xxx'
        },
        { status: 400 }
      );
    }

    console.log('[TEST] Attempting to play playlist:', {
      groupId,
      playlistUri,
    });

    // Try to load the playlist
    try {
      await sonosClient.loadPlaylist(groupId, playlistUri, true);
      console.log('[TEST] Successfully loaded playlist');
    } catch (loadError: any) {
      console.error('[TEST] Load failed:', loadError);
      throw loadError;
    }

    // Check if it's actually playing now
    try {
      const status = await sonosClient.getPlaybackStatus(groupId);
      console.log('[TEST] Playback status after load:', {
        state: status.playbackState,
        queueVersion: status.queueVersion,
      });

      return NextResponse.json({
        success: true,
        message: 'Playlist loaded',
        data: {
          groupId,
          playlistUri,
          playbackState: status.playbackState,
        },
      });
    } catch (statusError) {
      console.error('[TEST] Could not get status:', statusError);
      return NextResponse.json({
        success: true,
        message: 'Playlist loaded (status unknown)',
        data: { groupId, playlistUri },
      });
    }
  } catch (error: any) {
    console.error('[TEST] Error playing playlist:', error);
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
