import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { Schedule } from '@/types';

// PATCH update schedule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { id } = await params;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const allowedFields = [
      'zone_id',
      'name',
      'playlist_uri',
      'playlist_name',
      'playlist_source',
      'days_of_week',
      'start_time',
      'end_time',
      'enabled',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      );
    }

    values.push(id);

    const schedule = await db.queryOne<Schedule>(
      `UPDATE ${TABLES.SCHEDULES}
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: schedule,
    });
  } catch (error: any) {
    console.error('Error updating schedule:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE schedule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.execute(
      `DELETE FROM ${TABLES.SCHEDULES} WHERE id = $1`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error: any) {
    console.error('Error deleting schedule:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
