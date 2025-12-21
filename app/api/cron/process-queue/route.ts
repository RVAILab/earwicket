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

    // Get all zones with environment data (needed for group resolution)
    const zones = await db.query<{
      id: string;
      name: string;
      environment_id: string;
      device_player_ids: any;
      sonos_group_id: string | null;
      group_id_cached_at: Date | null;
      group_id_cache_ttl_minutes: number;
      household_id: string;
    }>(
      `SELECT z.*, e.household_id
       FROM ${TABLES.ZONES} z
       JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
       ORDER BY z.name ASC`
    );

    console.log(`[QUEUE CRON] Processing ${zones.length} zones`);

    for (const zone of zones) {
      try {
        // Parse device_player_ids if it's a string (JSONB from DB)
        let devicePlayerIds = zone.device_player_ids;
        if (typeof devicePlayerIds === 'string') {
          devicePlayerIds = JSON.parse(devicePlayerIds);
        }

        const zoneObject = {
          id: zone.id,
          name: zone.name,
          environment_id: zone.environment_id,
          device_player_ids: devicePlayerIds || [],
          sonos_group_id: zone.sonos_group_id,
          group_id_cached_at: zone.group_id_cached_at,
          group_id_cache_ttl_minutes: zone.group_id_cache_ttl_minutes,
          created_at: new Date(),
        };

        await processZoneQueue(zoneObject, zone.household_id);
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
