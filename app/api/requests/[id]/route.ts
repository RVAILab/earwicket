import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

// DELETE song request (admin only - add auth later)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Only allow deleting pending requests
    const result = await db.queryOne(
      `DELETE FROM ${TABLES.SONG_REQUESTS}
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id]
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Request not found or already playing/completed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error: any) {
    console.error('Error deleting request:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
