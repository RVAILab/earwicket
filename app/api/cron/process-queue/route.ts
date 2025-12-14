import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { processZoneQueue } from '@/lib/queue/processor';

/**
 * Vercel Cron Job: Process visitor song request queue
 * Runs every 1 minute
 */
export async function POST(request: NextRequest) {
  console.log('[QUEUE CRON] process-queue starting...');

  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all zones
    const zones = await db.query<{ id: string; name: string; sonos_group_id: string }>(
      `SELECT id, name, sonos_group_id FROM ${TABLES.ZONES}`
    );

    console.log(`[QUEUE CRON] Processing ${zones.length} zones`);

    for (const zone of zones) {
      try {
        await processZoneQueue(zone.id, zone.sonos_group_id);
      } catch (error: any) {
        console.error(`[QUEUE CRON] Error processing zone ${zone.name}:`, error.message);
        // Continue processing other zones even if one fails
      }
    }

    console.log('[QUEUE CRON] process-queue completed');

    return NextResponse.json({
      success: true,
      message: `Processed ${zones.length} zones`,
    });
  } catch (error: any) {
    console.error('[QUEUE CRON] process-queue error:', error);
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
