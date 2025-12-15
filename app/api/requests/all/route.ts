import { NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

// GET all requests across all zones (for admin)
export async function GET() {
  try {
    const requests = await db.query(
      `SELECT r.*, z.name as zone_name, e.name as environment_name
       FROM ${TABLES.SONG_REQUESTS} r
       JOIN ${TABLES.ZONES} z ON r.zone_id = z.id
       JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
       ORDER BY r.created_at DESC
       LIMIT 100`
    );

    return NextResponse.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('Error fetching all requests:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
