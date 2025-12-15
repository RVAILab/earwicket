import SpotifyWebApi from 'spotify-web-api-node';
import db from '../db/client';
import { TABLES } from '../db/tables';
import { SpotifyCredentials, SpotifyPlaylist, SpotifyTrack } from '@/types';

export class SpotifyClient {
  private spotify: SpotifyWebApi;
  private expiresAt: Date | null = null;

  constructor() {
    this.spotify = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    });
  }

  // OAuth2 Methods
  getAuthorizationUrl(): string {
    const scopes = ['playlist-read-private', 'playlist-read-collaborative'];
    return this.spotify.createAuthorizeURL(scopes, 'spotify_auth');
  }

  async exchangeCodeForToken(code: string): Promise<void> {
    const data = await this.spotify.authorizationCodeGrant(code);

    this.spotify.setAccessToken(data.body.access_token);
    this.spotify.setRefreshToken(data.body.refresh_token);
    this.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);

    // Get user ID
    const me = await this.spotify.getMe();
    const userId = me.body.id;

    // Store in database
    await this.saveCredentials(
      data.body.access_token,
      data.body.refresh_token,
      this.expiresAt,
      userId
    );
  }

  private async saveCredentials(
    accessToken: string,
    refreshToken: string,
    expiresAt: Date,
    userId: string
  ): Promise<void> {
    // Delete existing credentials (singleton table)
    await db.execute(`DELETE FROM ${TABLES.SPOTIFY_CREDENTIALS}`);

    // Insert new credentials
    await db.execute(
      `INSERT INTO ${TABLES.SPOTIFY_CREDENTIALS} (access_token, refresh_token, expires_at, user_id)
       VALUES ($1, $2, $3, $4)`,
      [accessToken, refreshToken, expiresAt, userId]
    );
  }

  async loadCredentials(): Promise<boolean> {
    const creds = await db.queryOne<SpotifyCredentials>(
      `SELECT * FROM ${TABLES.SPOTIFY_CREDENTIALS} LIMIT 1`
    );

    if (!creds) {
      return false;
    }

    this.spotify.setAccessToken(creds.access_token);
    this.spotify.setRefreshToken(creds.refresh_token);
    this.expiresAt = new Date(creds.expires_at);

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
    const data = await this.spotify.refreshAccessToken();

    this.spotify.setAccessToken(data.body.access_token);
    this.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);

    // If we got a new refresh token, update it
    if (data.body.refresh_token) {
      this.spotify.setRefreshToken(data.body.refresh_token);
    }

    // Update database
    const refreshToken = data.body.refresh_token || this.spotify.getRefreshToken();
    await db.execute(
      `UPDATE ${TABLES.SPOTIFY_CREDENTIALS}
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP`,
      [data.body.access_token, refreshToken, this.expiresAt]
    );
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.spotify.getAccessToken()) {
      const loaded = await this.loadCredentials();
      if (!loaded) {
        throw new Error('Not authenticated with Spotify. Please complete OAuth flow.');
      }
    }

    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
  }

  // Spotify API Methods
  async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
    await this.ensureAuthenticated();

    const playlists: SpotifyPlaylist[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const data = await this.spotify.getUserPlaylists({ limit, offset });

      playlists.push(
        ...data.body.items.map((item) => ({
          id: item.id,
          name: item.name,
          uri: item.uri,
          images: item.images || [],
          tracks: {
            total: item.tracks.total,
          },
        }))
      );

      if (!data.body.next) break;
      offset += limit;
    }

    return playlists;
  }

  async searchTracks(query: string, limit: number = 20): Promise<SpotifyTrack[]> {
    await this.ensureAuthenticated();

    const data = await this.spotify.searchTracks(query, { limit });

    return data.body.tracks!.items.map((item) => ({
      id: item.id,
      name: item.name,
      uri: item.uri,
      artists: item.artists.map((artist) => ({ name: artist.name })),
      album: {
        name: item.album.name,
        images: item.album.images || [],
      },
      duration_ms: item.duration_ms,
    }));
  }

  async getTrack(trackId: string): Promise<SpotifyTrack> {
    await this.ensureAuthenticated();

    const data = await this.spotify.getTrack(trackId);

    return {
      id: data.body.id,
      name: data.body.name,
      uri: data.body.uri,
      artists: data.body.artists.map((artist) => ({ name: artist.name })),
      album: {
        name: data.body.album.name,
        images: data.body.album.images || [],
      },
      duration_ms: data.body.duration_ms,
    };
  }

  async getPlaylistDuration(playlistId: string): Promise<number> {
    await this.ensureAuthenticated();

    let totalDuration = 0;
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await this.spotify.getPlaylistTracks(playlistId, { limit, offset });

      for (const item of data.body.items) {
        if (item.track && !item.track.is_local) {
          totalDuration += item.track.duration_ms;
        }
      }

      if (!data.body.next) break;
      offset += limit;
    }

    return totalDuration;
  }
}

// Export singleton instance
export const spotifyClient = new SpotifyClient();
