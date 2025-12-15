import { NextRequest, NextResponse } from 'next/server';
import { evaluateAllSchedules } from '@/lib/scheduler';
import { sonosClient } from '@/lib/sonos/client';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { PlaybackState } from '@/types';

/**
 * Vercel Cron Job: Check and trigger scheduled playlists
 * Runs every 5 minutes
 */
export async function POST(request: NextRequest) {
  console.log('[CRON] check-schedules starting...');

  try {
    // Verify cron secret (optional but recommended for security)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await evaluateAllSchedules();

    console.log(`[CRON] Evaluated ${results.length} zones`);

    for (const result of results) {
      const { zoneId, zoneName, sonosGroupId, schedule } = result;

      // Get current playback state
      const state = await db.queryOne<PlaybackState>(
        `SELECT * FROM ${TABLES.PLAYBACK_STATE} WHERE zone_id = $1`,
        [zoneId]
      );

      // If there's an active schedule
      if (schedule) {
        console.log(`[CRON] Zone "${zoneName}": Schedule "${schedule.name}" should be active`);

        // Don't interrupt visitor requests
        if (state?.current_activity === 'visitor_request') {
          console.log(`[CRON] Zone "${zoneName}": Skipping - visitor request in progress`);
          continue;
        }

        // Check if we need to start this schedule
        // Only start if: no state OR currently idle OR different schedule
        const needsToStart =
          !state ||
          (state.current_activity === 'idle') ||
          (state.current_activity === 'scheduled' && state.interrupted_schedule_id !== schedule.id);

        if (needsToStart) {
          console.log(`[CRON] Zone "${zoneName}": Starting schedule "${schedule.name}"`);

          try {
            // Load playlist via Sonos
            await sonosClient.loadPlaylist(sonosGroupId, schedule.playlist_uri, true);

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
              [zoneId, schedule.id]
            );

            console.log(`[CRON] Zone "${zoneName}": Successfully started schedule`);
          } catch (error) {
            console.error(`[CRON] Zone "${zoneName}": Failed to start schedule:`, error);
          }
        } else {
          console.log(`[CRON] Zone "${zoneName}": Schedule already playing`);
        }
      } else {
        // No active schedule for this zone
        console.log(`[CRON] Zone "${zoneName}": No active schedule`);

        // If currently playing scheduled content, mark as idle
        // BUT don't touch zones with visitor requests!
        if (state?.current_activity === 'scheduled') {
          // Check if there are any pending or playing visitor requests
          const hasVisitorRequests = await db.queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM ${TABLES.SONG_REQUESTS}
             WHERE zone_id = $1 AND status IN ('pending', 'playing')`,
            [zoneId]
          );

          if (hasVisitorRequests && parseInt(hasVisitorRequests.count) > 0) {
            console.log(`[CRON] Zone "${zoneName}": Has visitor requests, not changing state`);
          } else {
            await db.execute(
              `UPDATE ${TABLES.PLAYBACK_STATE}
               SET current_activity = 'idle', last_updated = CURRENT_TIMESTAMP
               WHERE zone_id = $1`,
              [zoneId]
            );
            console.log(`[CRON] Zone "${zoneName}": Marked as idle (schedule ended)`);
          }
        }
      }
    }

    console.log('[CRON] check-schedules completed');

    return NextResponse.json({
      success: true,
      message: `Evaluated ${results.length} zones`,
    });
  } catch (error: any) {
    console.error('[CRON] check-schedules error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}
