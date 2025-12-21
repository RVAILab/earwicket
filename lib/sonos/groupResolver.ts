/**
 * Group Resolver - Core logic for device-based zone management
 *
 * This module resolves a zone's device configuration to an actual Sonos group ID.
 * It implements caching, group matching, and automatic group creation with partial group fallback.
 */

import { Zone, SonosGroup } from '@/types';
import { sonosClient } from './client';
import db from '../db/client';
import { TABLES } from '../db/tables';

export interface GroupResolutionResult {
  groupId: string;
  wasCreated: boolean; // true if we created a new group
  playerIds: string[]; // actual player IDs in the resolved group
  isPartialGroup: boolean; // true if some devices were offline
}

/**
 * Resolve a zone's device configuration to a Sonos group ID
 *
 * Strategy:
 * 1. Check if cached group ID is still valid and matches device config
 * 2. Search for existing group with exact device match
 * 3. Create new group with online devices only (partial group fallback)
 *
 * @param zone - The zone to resolve
 * @param householdId - Sonos household ID
 * @returns Resolution result with group ID and metadata
 */
export async function resolveZoneGroup(
  zone: Zone,
  householdId: string
): Promise<GroupResolutionResult> {

  // If zone has no device configuration, fall back to cached group ID (legacy support)
  if (!zone.device_player_ids || zone.device_player_ids.length === 0) {
    if (zone.sonos_group_id) {
      console.warn(`[GROUP-RESOLVER] Zone ${zone.name} has no device config, using legacy group ID: ${zone.sonos_group_id}`);
      return {
        groupId: zone.sonos_group_id,
        wasCreated: false,
        playerIds: [],
        isPartialGroup: false,
      };
    }
    throw new Error(`Zone ${zone.name} has no device configuration and no cached group ID`);
  }

  // Step 1: Check if cached group ID is still valid
  if (zone.sonos_group_id && isCacheValid(zone)) {
    const groups = await sonosClient.getGroups(householdId);
    const cachedGroup = groups.find(g => g.id === zone.sonos_group_id);

    if (cachedGroup && groupMatchesDevices(cachedGroup, zone.device_player_ids)) {
      console.log(`[GROUP-RESOLVER] Zone ${zone.name}: Using cached group ${zone.sonos_group_id}`);
      return {
        groupId: zone.sonos_group_id,
        wasCreated: false,
        playerIds: cachedGroup.playerIds,
        isPartialGroup: false,
      };
    } else {
      console.log(`[GROUP-RESOLVER] Zone ${zone.name}: Cache invalid or devices mismatch, re-resolving`);
    }
  }

  // Step 2: Search for existing group with matching devices
  const groups = await sonosClient.getGroups(householdId);
  const matchingGroup = groups.find(g =>
    groupMatchesDevices(g, zone.device_player_ids)
  );

  if (matchingGroup) {
    console.log(`[GROUP-RESOLVER] Zone ${zone.name}: Found existing matching group ${matchingGroup.id}`);
    // Update cache
    await updateGroupCache(zone.id, matchingGroup.id);
    return {
      groupId: matchingGroup.id,
      wasCreated: false,
      playerIds: matchingGroup.playerIds,
      isPartialGroup: false,
    };
  }

  // Step 3: Create new group with specified devices (with partial group fallback)
  try {
    // Filter to online devices only (partial group fallback)
    const onlinePlayerIds = await getOnlinePlayerIds(householdId, zone.device_player_ids);

    if (onlinePlayerIds.length === 0) {
      throw new Error(`No devices online for zone ${zone.name}. Cannot create group.`);
    }

    const isPartialGroup = onlinePlayerIds.length < zone.device_player_ids.length;

    if (isPartialGroup) {
      console.warn(
        `[GROUP-RESOLVER] Zone ${zone.name}: Using partial group (${onlinePlayerIds.length}/${zone.device_player_ids.length} devices online)`
      );
    }

    console.log(`[GROUP-RESOLVER] Zone ${zone.name}: Creating new group with devices:`, onlinePlayerIds);

    const newGroup = await sonosClient.createGroup(householdId, onlinePlayerIds);

    // Update cache
    await updateGroupCache(zone.id, newGroup.id);

    console.log(`[GROUP-RESOLVER] Zone ${zone.name}: Successfully created group ${newGroup.id}`);

    return {
      groupId: newGroup.id,
      wasCreated: true,
      playerIds: newGroup.playerIds,
      isPartialGroup,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GROUP-RESOLVER] Failed to create group for zone ${zone.name}:`, errorMessage);
    throw new Error(`Failed to create group for zone ${zone.name}: ${errorMessage}`);
  }
}

/**
 * Check if the cached group ID is still valid based on TTL
 */
function isCacheValid(zone: Zone): boolean {
  if (!zone.group_id_cached_at) {
    return false;
  }

  const cacheAgeMinutes = (Date.now() - zone.group_id_cached_at.getTime()) / 60000;
  const ttl = zone.group_id_cache_ttl_minutes || 30; // Default 30 minutes

  return cacheAgeMinutes < ttl;
}

/**
 * Check if a Sonos group exactly matches the specified device IDs
 * Order doesn't matter, but all devices must be present (no extras, no missing)
 */
function groupMatchesDevices(group: SonosGroup, deviceIds: string[]): boolean {
  if (group.playerIds.length !== deviceIds.length) {
    return false;
  }

  const groupSet = new Set(group.playerIds);
  return deviceIds.every(id => groupSet.has(id));
}

/**
 * Update the zone's cached group ID and timestamp
 */
async function updateGroupCache(zoneId: string, groupId: string): Promise<void> {
  await db.execute(
    `UPDATE ${TABLES.ZONES}
     SET sonos_group_id = $1, group_id_cached_at = NOW()
     WHERE id = $2`,
    [groupId, zoneId]
  );
}

/**
 * Filter requested player IDs to only those currently online
 * Uses group data to determine which players are online (they appear in groups)
 */
async function getOnlinePlayerIds(
  householdId: string,
  requestedPlayerIds: string[]
): Promise<string[]> {
  // Get all current groups (which include only online devices)
  const groups = await sonosClient.getGroups(householdId);

  // Extract all online player IDs from all groups
  const onlinePlayerIds = new Set<string>();
  groups.forEach(g => g.playerIds.forEach(id => onlinePlayerIds.add(id)));

  // Filter requested IDs to only those currently online
  const result = requestedPlayerIds.filter(id => onlinePlayerIds.has(id));

  if (result.length < requestedPlayerIds.length) {
    const offlineIds = requestedPlayerIds.filter(id => !onlinePlayerIds.has(id));
    console.warn(`[GROUP-RESOLVER] Offline devices detected:`, offlineIds);
  }

  return result;
}
