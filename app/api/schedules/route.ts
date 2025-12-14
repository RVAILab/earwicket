import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { Schedule } from '@/types';

// GET all schedules (optionally filtered by zone)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zoneId = searchParams.get('zone_id');

    let schedules: Schedule[];

    if (zoneId) {
      schedules = await db.query<Schedule>(
        `SELECT s.*, z.name as zone_name, e.name as environment_name
         FROM ${TABLES.SCHEDULES} s
         JOIN ${TABLES.ZONES} z ON s.zone_id = z.id
         JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
         WHERE s.zone_id = $1
         ORDER BY s.start_time ASC`,
        [zoneId]
      );
    } else {
      schedules = await db.query<Schedule>(
        `SELECT s.*, z.name as zone_name, e.name as environment_name
         FROM ${TABLES.SCHEDULES} s
         JOIN ${TABLES.ZONES} z ON s.zone_id = z.id
         JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
         ORDER BY e.name, z.name, s.start_time ASC`
      );
    }

    return NextResponse.json({
      success: true,
      data: schedules,
    });
  } catch (error: any) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST create new schedule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      zone_id,
      name,
      playlist_uri,
      playlist_name,
      playlist_source = 'spotify',
      days_of_week,
      start_time,
      end_time,
      enabled = true,
    } = body;

    if (!zone_id || !name || !playlist_uri || !playlist_name || !days_of_week || !start_time) {
      return NextResponse.json(
        {
          success: false,
          error: 'zone_id, name, playlist_uri, playlist_name, days_of_week, and start_time required',
        },
        { status: 400 }
      );
    }

    // Validate days_of_week is an array of 0-6
    if (!Array.isArray(days_of_week) || days_of_week.some((d: number) => d < 0 || d > 6)) {
      return NextResponse.json(
        { success: false, error: 'days_of_week must be an array of integers 0-6' },
        { status: 400 }
      );
    }

    const schedule = await db.queryOne<Schedule>(
      `INSERT INTO ${TABLES.SCHEDULES}
       (zone_id, name, playlist_uri, playlist_name, playlist_source, days_of_week, start_time, end_time, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [zone_id, name, playlist_uri, playlist_name, playlist_source, days_of_week, start_time, end_time, enabled]
    );

    return NextResponse.json({
      success: true,
      data: schedule,
    });
  } catch (error: any) {
    console.error('Error creating schedule:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
