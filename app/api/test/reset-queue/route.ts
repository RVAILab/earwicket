import { NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

/**
 * Reset all stuck "playing" requests back to pending or completed
 * Useful for cleaning up after debugging
 */
export async function POST() {
  try {
    // Mark all "playing" requests as completed (they're stuck)
    await db.execute(
      `UPDATE ${TABLES.SONG_REQUESTS}
       SET status = 'completed'
       WHERE status = 'playing'`
    );

    // Reset all playback states to idle
    await db.execute(
      `UPDATE ${TABLES.PLAYBACK_STATE}
       SET current_activity = 'idle',
           interrupted_schedule_id = NULL,
           interrupted_at = NULL
       WHERE current_activity = 'visitor_request'`
    );

    return NextResponse.json({
      success: true,
      message: 'Queue and playback state reset',
    });
  } catch (error: any) {
    console.error('Error resetting queue:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Allow GET for easy testing
export async function GET() {
  return POST();
}
