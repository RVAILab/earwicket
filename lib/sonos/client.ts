import db from '../db/client';
import { TABLES } from '../db/tables';
import { SonosCredentials, SonosGroup, SonosPlayer, SonosPlaybackStatus } from '@/types';

const SONOS_API_BASE = 'https://api.ws.sonos.com/control/api/v1';
const SONOS_AUTH_BASE = 'https://api.sonos.com';

export class SonosClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: Date | null = null;
  private householdId: string | null = null;

  constructor() {}

  // OAuth2 Methods
  getAuthorizationUrl(): string {
    // Note: Sonos uses the "Key" (SONOS_API_KEY) for authorization URL, not Client ID
    const apiKey = process.env.SONOS_API_KEY!;
    const redirectUri = process.env.SONOS_REDIRECT_URI!;
    const scope = 'playback-control-all';

    const params = new URLSearchParams({
      client_id: apiKey, // This is actually the "Key" from Sonos portal
      response_type: 'code',
      redirect_uri: redirectUri,
      scope,
      state: 'sonos_auth',
    });

    return `${SONOS_AUTH_BASE}/login/v3/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<void> {
    // Token exchange uses API Key (not Client ID) for Basic Auth
    const apiKey = process.env.SONOS_API_KEY!;
    const clientSecret = process.env.SONOS_CLIENT_SECRET!;
    const redirectUri = process.env.SONOS_REDIRECT_URI!;

    const response = await fetch(`${SONOS_AUTH_BASE}/login/v3/oauth/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${apiKey}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for token: ${error}`);
    }

    const data = await response.json();

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Try to fetch household ID, but don't fail if none found
    // (user can configure it later via /api/sonos/households)
    try {
      await this.fetchHouseholdId();
    } catch (error: any) {
      console.warn('[SONOS] Could not fetch household during auth:', error.message);
      console.warn('[SONOS] Credentials will be saved without household ID - configure via /api/sonos/households');
      this.householdId = null;
    }

    // Store in database
    await this.saveCredentials();
  }

  private async fetchHouseholdId(): Promise<void> {
    console.log('[SONOS] Fetching households...');

    const response = await fetch(`${SONOS_API_BASE}/households`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    const responseText = await response.text();
    console.log('[SONOS] Households response:', {
      status: response.status,
      ok: response.ok,
      body: responseText,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch households: ${response.status} - ${responseText}`);
    }

    const data = JSON.parse(responseText);
    if (data.households && data.households.length > 0) {
      // Store the first household by default
      // User can change this via /api/sonos/households if they have multiple
      this.householdId = data.households[0].id;
      console.log(`[SONOS] Found ${data.households.length} household(s), using: ${this.householdId}`);

      if (data.households.length > 1) {
        console.warn('[SONOS] Multiple households detected! You can switch via /api/sonos/households');
      }
    } else {
      throw new Error(`No households found. API response: ${responseText}`);
    }
  }

  private async saveCredentials(): Promise<void> {
    // Delete existing credentials (singleton table)
    await db.execute(`DELETE FROM ${TABLES.SONOS_CREDENTIALS}`);

    // Insert new credentials
    // Convert Date to ISO string to ensure consistent serialization across database drivers
    await db.execute(
      `INSERT INTO ${TABLES.SONOS_CREDENTIALS} (access_token, refresh_token, expires_at, household_id)
       VALUES ($1, $2, $3, $4)`,
      [this.accessToken, this.refreshToken, this.expiresAt?.toISOString(), this.householdId]
    );
  }

  async loadCredentials(): Promise<boolean> {
    const creds = await db.queryOne<SonosCredentials>(
      `SELECT * FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
    );

    if (!creds) {
      return false;
    }

    this.accessToken = creds.access_token;
    this.refreshToken = creds.refresh_token;
    this.expiresAt = new Date(creds.expires_at);
    this.householdId = creds.household_id;

    // Check if token needs refresh
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }

    return true;
  }

  private isTokenExpired(): boolean {
    if (!this.expiresAt) return true;
    // Refresh 5 minutes before expiry
    return Date.now() >= this.expiresAt.getTime() - 5 * 60 * 1000;
  }

  private async refreshAccessToken(): Promise<void> {
    // Token refresh also uses API Key (not Client ID) for Basic Auth
    const apiKey = process.env.SONOS_API_KEY!;
    const clientSecret = process.env.SONOS_CLIENT_SECRET!;

    const response = await fetch(`${SONOS_AUTH_BASE}/login/v3/oauth/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${apiKey}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken!,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh access token');
    }

    const data = await response.json();

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Update database
    // Convert Date to ISO string to ensure consistent serialization across database drivers
    await db.execute(
      `UPDATE ${TABLES.SONOS_CREDENTIALS}
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP`,
      [this.accessToken, this.refreshToken, this.expiresAt?.toISOString()]
    );
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken) {
      const loaded = await this.loadCredentials();
      if (!loaded) {
        throw new Error('Not authenticated with Sonos. Please complete OAuth flow.');
      }
    }

    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
  }

  // Sonos API Methods
  async getGroups(householdId?: string): Promise<SonosGroup[]> {
    await this.ensureAuthenticated();

    const targetHouseholdId = householdId || this.householdId;
    if (!targetHouseholdId) {
      throw new Error('No household ID available');
    }

    const response = await fetch(`${SONOS_API_BASE}/households/${targetHouseholdId}/groups`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.groups || [];
  }

  async getPlaybackStatus(groupId: string): Promise<SonosPlaybackStatus> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SONOS] Failed to fetch playback status for group ${groupId}: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to fetch playback status: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async loadPlaylist(groupId: string, playlistUri: string, playOnCompletion: boolean = true): Promise<void> {
    await this.ensureAuthenticated();

    // Extract playlist ID from Spotify URI (spotify:playlist:ID)
    const playlistId = playlistUri.split(':')[2];

    const payload = {
      type: 'PLAYLIST',
      id: {
        objectId: `spotify:playlist:${playlistId}`,
        serviceId: '9', // Spotify service ID (confirmed from metadata)
      },
      playbackAction: 'PLAY',
      playModes: {
        repeat: false,
        shuffle: false,
      },
    };

    console.log('[SONOS] loadPlaylist request:', {
      groupId,
      playlistUri,
      payload,
    });

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback/content`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const responseText = await response.text();
    console.log('[SONOS] loadPlaylist response:', {
      status: response.status,
      ok: response.ok,
      body: responseText,
    });

    if (!response.ok) {
      throw new Error(`Failed to load playlist: ${responseText}`);
    }
  }

  async loadTrack(groupId: string, trackUri: string, playOnCompletion: boolean = true): Promise<void> {
    await this.ensureAuthenticated();

    // Use the EXACT same format as playlist, just with track instead
    // Extract track ID from Spotify URI (spotify:track:ID)
    const trackId = trackUri.split(':')[2];

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback/content`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'TRACK',
          id: {
            objectId: `spotify:track:${trackId}`,
            serviceId: '9', // Spotify service ID (confirmed from metadata)
          },
          playbackAction: 'PLAY',
          playModes: {
            repeat: false,
            shuffle: false,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to load track: ${error}`);
    }

    // Explicitly call play after loading
    if (playOnCompletion) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for content to load
      await this.play(groupId);
    }
  }

  async play(groupId: string): Promise<void> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback/play`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to play');
    }
  }

  async pause(groupId: string): Promise<void> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback/pause`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to pause');
    }
  }

  /**
   * Get all players/devices in a household by extracting unique players from all groups
   * Note: Sonos API doesn't have a direct /players endpoint, so we derive it from groups
   */
  async getPlayers(householdId?: string): Promise<SonosPlayer[]> {
    await this.ensureAuthenticated();

    const targetHouseholdId = householdId || this.householdId;
    if (!targetHouseholdId) {
      throw new Error('No household ID available');
    }

    // Fetch all groups to extract player information
    const response = await fetch(
      `${SONOS_API_BASE}/households/${targetHouseholdId}/groups`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch groups for players: ${response.statusText}`);
    }

    const data = await response.json();
    const groups = data.groups || [];

    // Extract unique players from all groups
    const playerMap = new Map<string, SonosPlayer>();

    groups.forEach((group: SonosGroup) => {
      group.playerIds.forEach((playerId: string) => {
        if (!playerMap.has(playerId)) {
          // Create a basic player object
          // We can enhance this with more details if needed
          playerMap.set(playerId, {
            id: playerId,
            name: playerId, // Default to ID, can be enhanced with metadata
          });
        }
      });
    });

    return Array.from(playerMap.values());
  }

  /**
   * Create a new Sonos group from a list of player IDs
   * If players are in different groups, they will be automatically moved to the new group
   */
  async createGroup(householdId: string, playerIds: string[]): Promise<SonosGroup> {
    await this.ensureAuthenticated();

    if (!playerIds || playerIds.length === 0) {
      throw new Error('At least one player ID is required to create a group');
    }

    const response = await fetch(
      `${SONOS_API_BASE}/households/${householdId}/groups/createGroup`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerIds: playerIds,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SONOS] Failed to create group:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        playerIds,
      });
      throw new Error(`Failed to create group: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // The response should contain the group info
    // Structure may vary, but typically includes: { group: { id, coordinatorId, playerIds, ... } }
    const group = data.group || data;

    console.log('[SONOS] Successfully created group:', {
      groupId: group.id,
      playerIds: group.playerIds,
    });

    return group;
  }
}

// Export singleton instance
export const sonosClient = new SonosClient();
