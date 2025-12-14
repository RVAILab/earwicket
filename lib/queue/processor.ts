import db from '../db/client';
import { TABLES } from '../db/tables';
import { sonosClient } from '../sonos/client';
import { getActiveSchedule } from '../scheduler';
import { PlaybackState, SongRequest, SonosPlaybackStatus } from '@/types';

/**
 * Process the visitor song queue for a specific zone
 * Called by cron job every minute
 */
export async function processZoneQueue(zoneId: string, sonosGroupId: string): Promise<void> {
  // Get current playback state
  const state = await db.queryOne<PlaybackState>(
    `SELECT * FROM ${TABLES.PLAYBACK_STATE} WHERE zone_id = $1`,
    [zoneId]
  );

  // Get pending requests for this zone
  const pendingRequests = await db.query<SongRequest>(
    `SELECT * FROM ${TABLES.SONG_REQUESTS}
     WHERE zone_id = $1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
    [zoneId]
  );

  // Get currently playing request
  const playingRequest = await db.queryOne<SongRequest>(
    `SELECT * FROM ${TABLES.SONG_REQUESTS}
     WHERE zone_id = $1 AND status = 'playing'
     LIMIT 1`,
    [zoneId]
  );

  // Check actual Sonos playback status
  const playbackStatus = await sonosClient.getPlaybackStatus(sonosGroupId);
  const isPlaying = playbackStatus.playbackState === 'PLAYBACK_STATE_PLAYING';

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
    console.log(`[QUEUE] Zone ${zoneId}: No interrupted schedule to resume, marking idle`);
    await db.execute(
      `UPDATE ${TABLES.PLAYBACK_STATE}
       SET current_activity = 'idle', last_updated = CURRENT_TIMESTAMP
       WHERE zone_id = $1`,
      [zoneId]
    );
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
    console.log(`[QUEUE] Zone ${zoneId}: Interrupted schedule no longer active, marking idle`);
    await db.execute(
      `UPDATE ${TABLES.PLAYBACK_STATE}
       SET current_activity = 'idle',
           interrupted_schedule_id = NULL,
           interrupted_at = NULL,
           last_updated = CURRENT_TIMESTAMP
       WHERE zone_id = $1`,
      [zoneId]
    );
  }
}
