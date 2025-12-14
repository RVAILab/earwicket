// Database table names with earwicket_ prefix
export const TABLES = {
  ENVIRONMENTS: 'earwicket_environments',
  ZONES: 'earwicket_zones',
  SCHEDULES: 'earwicket_schedules',
  SONG_REQUESTS: 'earwicket_song_requests',
  PLAYBACK_STATE: 'earwicket_playback_state',
  SONOS_CREDENTIALS: 'earwicket_sonos_credentials',
  SPOTIFY_CREDENTIALS: 'earwicket_spotify_credentials',
  ADMIN_USERS: 'earwicket_admin_users',
  RATE_LIMITS: 'earwicket_rate_limits',
} as const;
