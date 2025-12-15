import { NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * List all Sonos groups and their playback status
 */
export async function GET() {
  try {
    console.log('[TEST] Fetching all groups...');

    const groups = await sonosClient.getGroups();

    console.log(`[TEST] Found ${groups.length} groups`);

    // Get playback status for each group
    const groupsWithStatus = await Promise.all(
      groups.map(async (group) => {
        try {
          const status = await sonosClient.getPlaybackStatus(group.id);
          return {
            id: group.id,
            name: group.name,
            coordinatorId: group.coordinatorId,
            playerIds: group.playerIds,
            playbackState: status.playbackState,
            isPlaying: status.playbackState === 'PLAYBACK_STATE_PLAYING',
          };
        } catch (error) {
          return {
            id: group.id,
            name: group.name,
            coordinatorId: group.coordinatorId,
            playerIds: group.playerIds,
            playbackState: 'ERROR',
            isPlaying: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: groupsWithStatus,
    });
  } catch (error: any) {
    console.error('[TEST] Error listing groups:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
