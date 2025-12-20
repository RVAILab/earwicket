import { NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

/**
 * Refresh Sonos group IDs for all zones by fetching current groups from Sonos API
 */
export async function POST() {
  try {
    console.log('[REFRESH GROUPS] Fetching current groups from Sonos...');

    // Get current groups from Sonos
    const groups = await sonosClient.getGroups();

    console.log(`[REFRESH GROUPS] Found ${groups.length} groups from Sonos`);

    // Get all zones from database
    const zones = await db.query<{
      id: string;
      name: string;
      sonos_group_id: string;
    }>(`SELECT id, name, sonos_group_id FROM ${TABLES.ZONES}`);

    const updates: Array<{ zone: string; oldGroupId: string; newGroupId: string }> = [];
    const notFound: Array<{ zone: string; oldGroupId: string }> = [];

    // Try to match each zone to a current group
    for (const zone of zones) {
      // Try to find a matching group
      // First try exact match by group ID
      let matchingGroup = groups.find(g => g.id === zone.sonos_group_id);

      // If not found by exact ID, try to find by coordinator (the group ID might have changed but coordinator is the same)
      if (!matchingGroup) {
        // Extract coordinator from old group ID (format: RINCON_XXX:timestamp)
        const oldCoordinator = zone.sonos_group_id.split(':')[0];
        matchingGroup = groups.find(g => g.id.startsWith(oldCoordinator));
      }

      if (matchingGroup && matchingGroup.id !== zone.sonos_group_id) {
        // Update zone with new group ID
        await db.execute(
          `UPDATE ${TABLES.ZONES} SET sonos_group_id = $1 WHERE id = $2`,
          [matchingGroup.id, zone.id]
        );

        updates.push({
          zone: zone.name,
          oldGroupId: zone.sonos_group_id,
          newGroupId: matchingGroup.id,
        });

        console.log(`[REFRESH GROUPS] Updated ${zone.name}: ${zone.sonos_group_id} -> ${matchingGroup.id}`);
      } else if (!matchingGroup) {
        notFound.push({
          zone: zone.name,
          oldGroupId: zone.sonos_group_id,
        });

        console.log(`[REFRESH GROUPS] ⚠️  Could not find matching group for ${zone.name} (${zone.sonos_group_id})`);
      } else {
        console.log(`[REFRESH GROUPS] ${zone.name}: Group ID unchanged`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalGroups: groups.length,
        totalZones: zones.length,
        updated: updates,
        notFound: notFound,
        availableGroups: groups.map(g => ({
          id: g.id,
          name: g.name,
          coordinatorId: g.coordinatorId,
          playerIds: g.playerIds,
        })),
      },
    });
  } catch (error: any) {
    console.error('[REFRESH GROUPS] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
