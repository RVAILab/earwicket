import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { sonosClient } from '@/lib/sonos/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zoneId = searchParams.get('zone_id');

    if (!zoneId) {
      return NextResponse.json(
        { success: false, error: 'zone_id required' },
        { status: 400 }
      );
    }

    // Get zone info
    const zone = await db.queryOne<{ sonos_group_id: string; name: string }>(
      `SELECT sonos_group_id, name FROM ${TABLES.ZONES} WHERE id = $1`,
      [zoneId]
    );

    if (!zone) {
      return NextResponse.json(
        { success: false, error: 'Zone not found' },
        { status: 404 }
      );
    }

    // Get playback state
    const state = await db.queryOne<{
      current_activity: string;
      interrupted_schedule_id: string | null;
    }>(
      `SELECT ps.current_activity, ps.interrupted_schedule_id
       FROM ${TABLES.PLAYBACK_STATE} ps
       WHERE ps.zone_id = $1`,
      [zoneId]
    );

    // Get current schedule if playing
    let currentSchedule = null;
    if (state?.current_activity === 'scheduled') {
      // When scheduled, the interrupted_schedule_id holds the current schedule
      const scheduleId = state.interrupted_schedule_id;
      if (scheduleId) {
        currentSchedule = await db.queryOne(
          `SELECT name, playlist_name FROM ${TABLES.SCHEDULES} WHERE id = $1`,
          [scheduleId]
        );
      }
    } else if (state?.interrupted_schedule_id) {
      // When interrupted, show what will resume
      currentSchedule = await db.queryOne(
        `SELECT name, playlist_name FROM ${TABLES.SCHEDULES} WHERE id = $1`,
        [state.interrupted_schedule_id]
      );
    }

    // Get Sonos playback status
    let playbackStatus = null;
    try {
      playbackStatus = await sonosClient.getPlaybackStatus(zone.sonos_group_id);
    } catch (error) {
      console.error('Failed to get playback status:', error);
    }

    // Get visitor queue
    const queue = await db.query(
      `SELECT track_name, artist_name, requested_by, status FROM ${TABLES.SONG_REQUESTS}
       WHERE zone_id = $1 AND status IN ('pending', 'playing')
       ORDER BY created_at ASC`,
      [zoneId]
    );

    return NextResponse.json({
      success: true,
      data: {
        zone: zone.name,
        activity: state?.current_activity || 'idle',
        schedule: currentSchedule,
        playbackStatus,
        queue,
      },
    });
  } catch (error: any) {
    console.error('Error fetching now playing:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
