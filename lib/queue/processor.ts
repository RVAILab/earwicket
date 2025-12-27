import db from '../db/client';
import { TABLES } from '../db/tables';
import { sonosClient } from '../sonos/client';
import { resolveZoneGroup } from '../sonos/groupResolver';
import { getActiveSchedule } from '../scheduler';
import { PlaybackState, SongRequest, SonosPlaybackStatus, Zone } from '@/types';

/**
 * Refresh a zone's group ID is now handled by resolveZoneGroup
 * This is a deprecated legacy function - kept for reference but should not be used
 */

/**
 * Process the visitor song queue for a specific zone
 * Called by cron job every minute
 */
export async function processZoneQueue(zone: Zone, householdId: string): Promise<void> {
  const zoneId = zone.id;
  const zoneName = zone.name;

  console.log(`[QUEUE] Processing zone ${zoneName} (${zoneId})`);

  // Resolve zone to group ID
  let sonosGroupId: string;
  try {
    const resolution = await resolveZoneGroup(zone, householdId);
    sonosGroupId = resolution.groupId;

    if (resolution.isPartialGroup) {
      console.warn(`[QUEUE] Zone "${zoneName}": Using partial group (some devices offline)`);
    }
  } catch (error) {
    console.error(`[QUEUE] Zone "${zoneName}": Failed to resolve group:`, error);
    return; // Skip this zone
  }

  // Get current playback state
  const state = await db.queryOne<PlaybackState>(
    `SELECT * FROM ${TABLES.PLAYBACK_STATE} WHERE zone_id = $1`,
    [zoneId]
  );

  console.log(`[QUEUE] Zone ${zoneId} state:`, {
    activity: state?.current_activity,
    hasInterruptedSchedule: !!state?.interrupted_schedule_id,
  });

  // Get pending requests for this zone
  const pendingRequests = await db.query<SongRequest>(
    `SELECT * FROM ${TABLES.SONG_REQUESTS}
     WHERE zone_id = $1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
    [zoneId]
  );

  console.log(`[QUEUE] Zone ${zoneId}: ${pendingRequests.length} pending requests`);

  // Get currently playing request
  const playingRequest = await db.queryOne<SongRequest>(
    `SELECT * FROM ${TABLES.SONG_REQUESTS}
     WHERE zone_id = $1 AND status = 'playing'
     LIMIT 1`,
    [zoneId]
  );

  console.log(`[QUEUE] Zone ${zoneId}: ${playingRequest ? 'Has' : 'No'} playing request`);

  // Check actual Sonos playback status
  let playbackStatus: SonosPlaybackStatus;
  let isPlaying = false;
  let currentGroupId = sonosGroupId;

  try {
    playbackStatus = await sonosClient.getPlaybackStatus(currentGroupId);
    isPlaying = playbackStatus.playbackState === 'PLAYBACK_STATE_PLAYING';

    console.log(`[QUEUE] Zone ${zoneId} Sonos status:`, {
      state: playbackStatus.playbackState,
      isPlaying,
    });
  } catch (error: any) {
    console.error(`[QUEUE] Zone ${zoneId}: Failed to get playback status:`, error.message);
    // Note: Group resolution happens at the start, so 410 errors should be rare
    // If we can't get status, assume idle and continue
    playbackStatus = {
      playbackState: 'PLAYBACK_STATE_IDLE',
      queueVersion: '',
    };
  }

  // IMPORTANT: If Sonos is currently playing and there are no pending visitor requests,
  // leave it alone. We should never stop music that's already playing unless we have
  // a specific visitor request to play.
  if (isPlaying && pendingRequests.length === 0 && !playingRequest) {
    console.log(`[QUEUE] Zone ${zoneId}: Music is playing and no visitor requests - leaving playback alone`);
    return;
  }

  // Case 1: We have a pending request and no song is currently playing
  if (pendingRequests.length > 0 && !playingRequest) {
    const nextRequest = pendingRequests[0];

    console.log(`[QUEUE] Zone ${zoneId}: Loading visitor track "${nextRequest.track_name}"`);

    // If this is the FIRST visitor request and we're playing scheduled content, save state
    if (state?.current_activity === 'scheduled') {
      console.log(`[QUEUE] Zone ${zoneId}: Interrupting schedule, saving state`);

      // Get current playback info to resume later
      const currentTrack = playbackStatus.itemId || null;

      await db.execute(
        `UPDATE ${TABLES.PLAYBACK_STATE}
         SET current_activity = 'visitor_request',
             interrupted_at = CURRENT_TIMESTAMP,
             interrupted_track = $1,
             last_updated = CURRENT_TIMESTAMP
         WHERE zone_id = $2`,
        [currentTrack, zoneId]
      );
    } else if (!state || state.current_activity === 'idle') {
      // No scheduled content, just mark as visitor_request
      await db.execute(
        `INSERT INTO ${TABLES.PLAYBACK_STATE}
         (zone_id, current_activity)
         VALUES ($1, 'visitor_request')
         ON CONFLICT (zone_id)
         DO UPDATE SET current_activity = 'visitor_request', last_updated = CURRENT_TIMESTAMP`,
        [zoneId]
      );
    }

    // Pause current playback first (to avoid conflicts)
    try {
      await sonosClient.pause(sonosGroupId);
      console.log(`[QUEUE] Zone ${zoneId}: Paused current playback`);
    } catch (error) {
      console.log(`[QUEUE] Zone ${zoneId}: Could not pause (might already be paused)`);
    }

    // Wait a moment for pause to register
    await new Promise(resolve => setTimeout(resolve, 500));

    // Load and play the track
    await sonosClient.loadTrack(sonosGroupId, nextRequest.track_uri, true);

    // Mark as playing
    await db.execute(
      `UPDATE ${TABLES.SONG_REQUESTS}
       SET status = 'playing', played_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [nextRequest.id]
    );

    console.log(`[QUEUE] Zone ${zoneId}: Started playing "${nextRequest.track_name}"`);
  }

  // Case 2: Playing request finished, check for next
  if (playingRequest && !isPlaying) {
    console.log(`[QUEUE] Zone ${zoneId}: Track "${playingRequest.track_name}" finished`);

    // Mark as completed
    await db.execute(
      `UPDATE ${TABLES.SONG_REQUESTS}
       SET status = 'completed'
       WHERE id = $1`,
      [playingRequest.id]
    );

    // Check if there are more pending requests
    const nextPending = await db.queryOne<SongRequest>(
      `SELECT * FROM ${TABLES.SONG_REQUESTS}
       WHERE zone_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [zoneId]
    );

    if (nextPending) {
      // Load next visitor track
      console.log(`[QUEUE] Zone ${zoneId}: Loading next track "${nextPending.track_name}"`);
      await sonosClient.loadTrack(sonosGroupId, nextPending.track_uri, true);

      await db.execute(
        `UPDATE ${TABLES.SONG_REQUESTS}
         SET status = 'playing', played_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [nextPending.id]
      );
    } else {
      // No more visitor requests, resume scheduled content if any
      console.log(`[QUEUE] Zone ${zoneId}: No more visitor requests, checking for schedule to resume`);
      await resumeSchedule(zoneId, sonosGroupId, state);
    }
  }

  // Case 3: No visitor requests and idle - check if a schedule should be playing
  // Only start a schedule if nothing is currently playing on Sonos
  if (!playingRequest && pendingRequests.length === 0 && state?.current_activity !== 'scheduled' && !isPlaying) {
    console.log(`[QUEUE] Zone ${zoneId}: Idle and not playing, checking for active schedule`);
    await checkAndStartSchedule(zoneId, currentGroupId, state);
  }
}

/**
 * Check if there's an active schedule and start it if needed
 */
async function checkAndStartSchedule(
  zoneId: string,
  sonosGroupId: string,
  state: PlaybackState | null
): Promise<void> {
  // Get active schedule for this zone
  const activeSchedule = await getActiveSchedule(zoneId);

  if (!activeSchedule) {
    console.log(`[QUEUE] Zone ${zoneId}: No active schedule at this time`);
    return;
  }

  // If we're already on this schedule, don't restart
  if (state?.current_activity === 'scheduled' && state?.interrupted_schedule_id === activeSchedule.id) {
    console.log(`[QUEUE] Zone ${zoneId}: Already playing schedule "${activeSchedule.name}"`);
    return;
  }

  console.log(`[QUEUE] Zone ${zoneId}: Starting schedule "${activeSchedule.name}"`);

  try {
    // Load and play the scheduled playlist
    // Note: Group resolution happens at the start, so 410 errors should be rare
    await sonosClient.loadPlaylist(sonosGroupId, activeSchedule.playlist_uri, true);
  } catch (error: any) {
    console.error(`[QUEUE] Zone ${zoneId}: Failed to load playlist:`, error.message);
    return; // Give up on error - group was already resolved
  }

  // Update playback state
  await db.execute(
    `INSERT INTO ${TABLES.PLAYBACK_STATE}
     (zone_id, current_activity, interrupted_schedule_id)
     VALUES ($1, 'scheduled', $2)
     ON CONFLICT (zone_id)
     DO UPDATE SET
       current_activity = 'scheduled',
       interrupted_schedule_id = $2,
       interrupted_at = NULL,
       interrupted_track = NULL,
       interrupted_position_ms = NULL,
       last_updated = CURRENT_TIMESTAMP`,
    [zoneId, activeSchedule.id]
  );

  console.log(`[QUEUE] Zone ${zoneId}: Successfully started schedule`);
}

/**
 * Resume scheduled playlist after visitor queue is empty
 */
async function resumeSchedule(
  zoneId: string,
  sonosGroupId: string,
  state: PlaybackState | null
): Promise<void> {
  if (!state || !state.interrupted_schedule_id) {
    console.log(`[QUEUE] Zone ${zoneId}: No interrupted schedule to resume, checking for active schedule`);
    await checkAndStartSchedule(zoneId, sonosGroupId, state);
    return;
  }

  // Check if the interrupted schedule is still active
  const activeSchedule = await getActiveSchedule(zoneId);

  if (activeSchedule && activeSchedule.id === state.interrupted_schedule_id) {
    console.log(`[QUEUE] Zone ${zoneId}: Resuming schedule "${activeSchedule.name}"`);

    // Resume the playlist
    await sonosClient.loadPlaylist(sonosGroupId, activeSchedule.playlist_uri, true);

    // Update state
    await db.execute(
      `UPDATE ${TABLES.PLAYBACK_STATE}
       SET current_activity = 'scheduled',
           interrupted_schedule_id = $1,
           interrupted_at = NULL,
           interrupted_track = NULL,
           interrupted_position_ms = NULL,
           last_updated = CURRENT_TIMESTAMP
       WHERE zone_id = $2`,
      [activeSchedule.id, zoneId]
    );

    console.log(`[QUEUE] Zone ${zoneId}: Successfully resumed schedule`);
  } else {
    console.log(`[QUEUE] Zone ${zoneId}: Interrupted schedule no longer active, checking for new schedule`);
    await checkAndStartSchedule(zoneId, sonosGroupId, state);
  }
}
