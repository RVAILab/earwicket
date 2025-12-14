import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { Zone } from '@/types';

// GET all zones (optionally filtered by environment)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const environmentId = searchParams.get('environment_id');

    let zones: Zone[];

    if (environmentId) {
      zones = await db.query<Zone>(
        `SELECT z.*, e.name as environment_name, e.timezone
         FROM ${TABLES.ZONES} z
         JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
         WHERE z.environment_id = $1
         ORDER BY z.created_at ASC`,
        [environmentId]
      );
    } else {
      zones = await db.query<Zone>(
        `SELECT z.*, e.name as environment_name, e.timezone
         FROM ${TABLES.ZONES} z
         JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
         ORDER BY e.name, z.name ASC`
      );
    }

    return NextResponse.json({
      success: true,
      data: zones,
    });
  } catch (error: any) {
    console.error('Error fetching zones:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST create new zone
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { environment_id, name, sonos_group_id } = body;

    if (!environment_id || !name || !sonos_group_id) {
      return NextResponse.json(
        { success: false, error: 'environment_id, name, and sonos_group_id required' },
        { status: 400 }
      );
    }

    const zone = await db.queryOne<Zone>(
      `INSERT INTO ${TABLES.ZONES} (environment_id, name, sonos_group_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [environment_id, name, sonos_group_id]
    );

    // Create initial playback_state for this zone
    await db.execute(
      `INSERT INTO ${TABLES.PLAYBACK_STATE} (zone_id, current_activity)
       VALUES ($1, 'idle')
       ON CONFLICT (zone_id) DO NOTHING`,
      [zone!.id]
    );

    return NextResponse.json({
      success: true,
      data: zone,
    });
  } catch (error: any) {
    console.error('Error creating zone:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
