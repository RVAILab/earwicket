import db from '../db/client';
import { TABLES } from '../db/tables';
import { SonosCredentials, SonosGroup, SonosPlaybackStatus } from '@/types';

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

    // Fetch household ID
    await this.fetchHouseholdId();

    // Store in database
    await this.saveCredentials();
  }

  private async fetchHouseholdId(): Promise<void> {
    const response = await fetch(`${SONOS_API_BASE}/households`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch households');
    }

    const data = await response.json();
    if (data.households && data.households.length > 0) {
      this.householdId = data.households[0].id;
    } else {
      throw new Error('No households found');
    }
  }

  private async saveCredentials(): Promise<void> {
    // Delete existing credentials (singleton table)
    await db.execute(`DELETE FROM ${TABLES.SONOS_CREDENTIALS}`);

    // Insert new credentials
    await db.execute(
      `INSERT INTO ${TABLES.SONOS_CREDENTIALS} (access_token, refresh_token, expires_at, household_id)
       VALUES ($1, $2, $3, $4)`,
      [this.accessToken, this.refreshToken, this.expiresAt, this.householdId]
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
    await db.execute(
      `UPDATE ${TABLES.SONOS_CREDENTIALS}
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP`,
      [this.accessToken, this.refreshToken, this.expiresAt]
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
  async getGroups(): Promise<SonosGroup[]> {
    await this.ensureAuthenticated();

    const response = await fetch(`${SONOS_API_BASE}/households/${this.householdId}/groups`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch groups');
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
      throw new Error('Failed to fetch playback status');
    }

    return await response.json();
  }

  async loadPlaylist(groupId: string, playlistUri: string, playOnCompletion: boolean = true): Promise<void> {
    await this.ensureAuthenticated();

    // Extract playlist ID from Spotify URI (spotify:playlist:ID)
    const playlistId = playlistUri.split(':')[2];

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback/playlist/spotify:playlist:${playlistId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playOnCompletion,
          playModes: {
            shuffle: false,
            repeat: false,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to load playlist: ${error}`);
    }
  }

  async loadTrack(groupId: string, trackUri: string, playOnCompletion: boolean = true): Promise<void> {
    await this.ensureAuthenticated();

    // Extract track ID from Spotify URI (spotify:track:ID)
    const trackId = trackUri.split(':')[2];

    const response = await fetch(
      `${SONOS_API_BASE}/groups/${groupId}/playback/track/spotify:track:${trackId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playOnCompletion,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to load track: ${error}`);
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
}

// Export singleton instance
export const sonosClient = new SonosClient();
