// Shared TypeScript types for Earwicket

export interface Environment {
  id: string;
  name: string;
  timezone: string;
  created_at: Date;
}

export interface Zone {
  id: string;
  environment_id: string;
  name: string;
  device_player_ids: string[]; // Persistent list of player IDs that define this zone
  sonos_group_id: string | null; // Cached Sonos group ID, may be stale
  group_id_cached_at: Date | null; // When the group ID was last resolved
  group_id_cache_ttl_minutes: number; // Cache validity period (default: 30)
  created_at: Date;
}

export interface Schedule {
  id: string;
  zone_id: string;
  name: string;
  playlist_uri: string;
  playlist_name: string;
  playlist_source: 'spotify' | 'apple_music' | 'amazon_music';
  days_of_week: number[]; // 0-6, Sunday=0
  start_time: string; // HH:MM:SS format
  end_time: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export type RequestStatus = 'pending' | 'playing' | 'completed' | 'failed';

export interface SongRequest {
  id: string;
  zone_id: string;
  track_uri: string;
  track_name: string;
  artist_name: string;
  requested_by: string | null;
  status: RequestStatus;
  created_at: Date;
  played_at: Date | null;
}

export type ActivityType = 'scheduled' | 'visitor_request' | 'idle';

export interface PlaybackState {
  zone_id: string;
  current_activity: ActivityType;
  interrupted_schedule_id: string | null;
  interrupted_at: Date | null;
  interrupted_track: string | null;
  interrupted_position_ms: number | null;
  last_updated: Date;
}

export interface SonosCredentials {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  household_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface SpotifyCredentials {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  created_at: Date;
}

export interface RateLimit {
  ip_address: string;
  request_count: number;
  window_start: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Sonos API types
export interface SonosGroup {
  id: string;
  name: string;
  coordinatorId: string;
  playerIds: string[];
}

export interface SonosPlayer {
  id: string;
  name: string;
  websocketUrl?: string;
  softwareVersion?: string;
  apiVersion?: string;
  minApiVersion?: string;
  capabilities?: string[];
  deviceIds?: string[];
}

export interface SonosPlaybackStatus {
  playbackState: 'PLAYBACK_STATE_IDLE' | 'PLAYBACK_STATE_PAUSED' | 'PLAYBACK_STATE_PLAYING' | 'PLAYBACK_STATE_BUFFERING';
  queueVersion: string;
  itemId?: string;
}

// Spotify API types
export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  images: Array<{ url: string }>;
  tracks: {
    total: number;
  };
  duration_ms?: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
  duration_ms: number;
}
