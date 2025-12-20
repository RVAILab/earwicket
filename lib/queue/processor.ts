import db from '../db/client';
import { TABLES } from '../db/tables';
import { sonosClient } from '../sonos/client';
import { getActiveSchedule } from '../scheduler';
import { PlaybackState, SongRequest, SonosPlaybackStatus } from '@/types';

/**
 * Refresh a zone's group ID by fetching current groups from Sonos
 * Returns the new group ID or null if no groups are available
 */
async function refreshZoneGroupId(zoneId: string): Promise<string | null> {
  console.log(`[QUEUE] Zone ${zoneId}: Group ID is stale, refreshing...`);

  try {
    // Get the zone's household ID
    const zone = await db.queryOne<{ household_id: string }>(
      `SELECT e.household_id
       FROM ${TABLES.ZONES} z
       JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
       WHERE z.id = $1`,
      [zoneId]
    );

    if (!zone?.household_id) {
      console.error(`[QUEUE] Zone ${zoneId}: Could not find household_id`);
      return null;
    }

    // Fetch current groups for this household
    const groups = await sonosClient.getGroups();

    if (groups.length === 0) {
      console.error(`[QUEUE] Zone ${zoneId}: No groups available in Sonos`);
      return null;
    }

    // Pick the first available group (arbitrary choice as requested)
    const newGroupId = groups[0].id;

    // Update the zone's group ID
    await db.execute(
      `UPDATE ${TABLES.ZONES} SET sonos_group_id = $1 WHERE id = $2`,
      [newGroupId, zoneId]
    );

    console.log(`[QUEUE] Zone ${zoneId}: Updated group ID to ${newGroupId}`);
    return newGroupId;
  } catch (error: any) {
    console.error(`[QUEUE] Zone ${zoneId}: Failed to refresh group ID:`, error.message);
    return null;
  }
}

/**
 * Process the visitor song queue for a specific zone
 * Called by cron job every minute
 */
export async function processZoneQueue(zoneId: string, sonosGroupId: string): Promise<void> {
  console.log(`[QUEUE] Processing zone ${zoneId} (group: ${sonosGroupId})`);

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

    // If it's a 410 error, try to refresh the group ID
    if (error.message.includes('410')) {
      const newGroupId = await refreshZoneGroupId(zoneId);
      if (newGroupId) {
        currentGroupId = newGroupId;
        // Try again with new group ID
        try {
          playbackStatus = await sonosClient.getPlaybackStatus(currentGroupId);
          isPlaying = playbackStatus.playbackState === 'PLAYBACK_STATE_PLAYING';
          console.log(`[QUEUE] Zone ${zoneId}: Retry succeeded with new group ID`);
        } catch (retryError: any) {
          console.error(`[QUEUE] Zone ${zoneId}: Retry failed:`, retryError.message);
          playbackStatus = {
            playbackState: 'PLAYBACK_STATE_IDLE',
            queueVersion: '',
          };
        }
      } else {
        playbackStatus = {
          playbackState: 'PLAYBACK_STATE_IDLE',
          queueVersion: '',
        };
      }
    } else {
      // If we can't get status, assume not playing and continue
      playbackStatus = {
        playbackState: 'PLAYBACK_STATE_IDLE',
        queueVersion: '',
      };
    }
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
  if (!playingRequest && pendingRequests.length === 0 && state?.current_activity !== 'scheduled') {
    console.log(`[QUEUE] Zone ${zoneId}: Idle, checking for active schedule`);
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

  let currentGroupId = sonosGroupId;

  try {
    // Load and play the scheduled playlist
    await sonosClient.loadPlaylist(currentGroupId, activeSchedule.playlist_uri, true);
  } catch (error: any) {
    console.error(`[QUEUE] Zone ${zoneId}: Failed to load playlist:`, error.message);

    // If it's a 410 error, try to refresh the group ID and retry
    if (error.message.includes('410') || error.message.includes('ERROR_RESOURCE_GONE')) {
      const newGroupId = await refreshZoneGroupId(zoneId);
      if (newGroupId) {
        currentGroupId = newGroupId;
        console.log(`[QUEUE] Zone ${zoneId}: Retrying with new group ID...`);
        try {
          await sonosClient.loadPlaylist(currentGroupId, activeSchedule.playlist_uri, true);
          console.log(`[QUEUE] Zone ${zoneId}: Retry succeeded`);
        } catch (retryError: any) {
          console.error(`[QUEUE] Zone ${zoneId}: Retry failed:`, retryError.message);
          return; // Give up
        }
      } else {
        return; // Can't refresh, give up
      }
    } else {
      return; // Other error, give up
    }
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
