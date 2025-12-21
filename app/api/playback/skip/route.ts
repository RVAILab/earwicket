import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { resolveZoneGroup } from '@/lib/sonos/groupResolver';
import { Zone } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { zone_id, group_id } = body; // Support both for backward compatibility

    let sonosGroupId: string;

    // Prefer zone_id, fall back to group_id for backward compatibility
    if (zone_id) {
      // New approach: resolve zone to group
      const zoneData = await db.queryOne<{
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
         WHERE z.id = $1`,
        [zone_id]
      );

      if (!zoneData) {
        return NextResponse.json(
          { success: false, error: 'Zone not found' },
          { status: 404 }
        );
      }

      // Parse device_player_ids if it's a string (JSONB from DB)
      let devicePlayerIds = zoneData.device_player_ids;
      if (typeof devicePlayerIds === 'string') {
        devicePlayerIds = JSON.parse(devicePlayerIds);
      }

      const zone: Zone = {
        id: zoneData.id,
        name: zoneData.name,
        environment_id: zoneData.environment_id,
        device_player_ids: devicePlayerIds || [],
        sonos_group_id: zoneData.sonos_group_id,
        group_id_cached_at: zoneData.group_id_cached_at,
        group_id_cache_ttl_minutes: zoneData.group_id_cache_ttl_minutes,
        created_at: new Date(),
      };

      const resolution = await resolveZoneGroup(zone, zoneData.household_id);
      sonosGroupId = resolution.groupId;
    } else if (group_id) {
      // Legacy approach: use group_id directly
      sonosGroupId = group_id;
    } else {
      return NextResponse.json(
        { success: false, error: 'zone_id or group_id required' },
        { status: 400 }
      );
    }

    // Get access token
    const creds = await db.queryOne<{ access_token: string }>(
      `SELECT access_token FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
    );

    if (!creds) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Call Sonos skip endpoint
    const response = await fetch(
      `https://api.ws.sonos.com/control/api/v1/groups/${sonosGroupId}/playback/skipToNextTrack`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to skip: ${error}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Skipped to next track',
    });
  } catch (error: any) {
    console.error('Error skipping:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
