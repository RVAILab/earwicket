import { NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { Zone } from '@/types';

// Public endpoint for visitors to see available zones
export async function GET() {
  try {
    const zones = await db.query<Zone>(
      `SELECT z.id, z.name, z.sonos_group_id, e.name as environment_name
       FROM ${TABLES.ZONES} z
       JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
       ORDER BY e.name, z.name ASC`
    );

    return NextResponse.json({
      success: true,
      data: zones,
    });
  } catch (error: any) {
    console.error('Error fetching public zones:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch zones' },
      { status: 500 }
    );
  }
}
