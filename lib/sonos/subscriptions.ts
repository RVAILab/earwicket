import db from '../db/client';
import { TABLES } from '../db/tables';

const SONOS_API_BASE = 'https://api.ws.sonos.com/control/api/v1';

/**
 * Subscribe to playback events for a group
 * This uses webhooks instead of polling
 */
export async function subscribeToPlayback(groupId: string): Promise<void> {
  const creds = await db.queryOne<{ access_token: string }>(
    `SELECT access_token FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
  );

  if (!creds) {
    throw new Error('Not authenticated with Sonos');
  }

  // Subscribe to playbackMetadata namespace (track changes)
  const response = await fetch(
    `${SONOS_API_BASE}/groups/${groupId}/playbackMetadata/subscription`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to subscribe to playbackMetadata: ${error}`);
  }

  console.log(`[SUBSCRIPTIONS] Subscribed to playbackMetadata for group ${groupId}`);

  // Also subscribe to playback namespace (play/pause state changes)
  const playbackResponse = await fetch(
    `${SONOS_API_BASE}/groups/${groupId}/playback/subscription`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
    }
  );

  if (!playbackResponse.ok) {
    const error = await playbackResponse.text();
    throw new Error(`Failed to subscribe to playback: ${error}`);
  }

  console.log(`[SUBSCRIPTIONS] Subscribed to playback for group ${groupId}`);
}

/**
 * Subscribe to all zones
 */
export async function subscribeToAllZones(): Promise<void> {
  const zones = await db.query<{ sonos_group_id: string; name: string }>(
    `SELECT sonos_group_id, name FROM ${TABLES.ZONES}`
  );

  console.log(`[SUBSCRIPTIONS] Subscribing to ${zones.length} zones`);

  for (const zone of zones) {
    try {
      await subscribeToPlayback(zone.sonos_group_id);
    } catch (error) {
      console.error(`[SUBSCRIPTIONS] Failed to subscribe to ${zone.name}:`, error);
    }
  }
}
