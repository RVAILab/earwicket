import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { sonosClient } from '@/lib/sonos/client';
import { resolveZoneGroup } from '@/lib/sonos/groupResolver';
import { Zone } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zoneId = searchParams.get('zone_id');
    const groupId = searchParams.get('group_id');

    let sonosGroupId: string;

    // Prefer zone_id, fall back to group_id for backward compatibility
    if (zoneId) {
      // Resolve zone to group
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
        [zoneId]
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
    } else if (groupId) {
      // Legacy approach: use group_id directly
      sonosGroupId = groupId;
    } else {
      return NextResponse.json(
        { success: false, error: 'zone_id or group_id required' },
        { status: 400 }
      );
    }

    // Fetch volume from Sonos API
    const volumeData = await sonosClient.getGroupVolume(sonosGroupId);

    return NextResponse.json({
      success: true,
      data: {
        volume: volumeData.volume,
        muted: volumeData.muted,
        // Convert to UI scale (0-10)
        volumeUI: Math.round(volumeData.volume / 10),
      },
    });
  } catch (error: any) {
    console.error('Error fetching volume:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { zone_id, group_id, volume, volumeUI, muted } = body;

    let sonosGroupId: string;

    // Prefer zone_id, fall back to group_id for backward compatibility
    if (zone_id) {
      // Resolve zone to group
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

    // Handle mute/unmute
    if (typeof muted === 'boolean') {
      await sonosClient.setMute(sonosGroupId, muted);
      return NextResponse.json({
        success: true,
        message: muted ? 'Muted' : 'Unmuted',
      });
    }

    // Handle volume change
    // Support both direct volume (0-100) and volumeUI (0-10)
    let targetVolume: number;
    if (typeof volumeUI === 'number') {
      // Convert UI scale (0-10) to API scale (0-100)
      targetVolume = volumeUI * 10;
    } else if (typeof volume === 'number') {
      targetVolume = volume;
    } else {
      return NextResponse.json(
        { success: false, error: 'volume or volumeUI required' },
        { status: 400 }
      );
    }

    await sonosClient.setVolume(sonosGroupId, targetVolume);

    return NextResponse.json({
      success: true,
      message: 'Volume updated',
      volume: targetVolume,
      volumeUI: Math.round(targetVolume / 10),
    });
  } catch (error: any) {
    console.error('Error setting volume:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
