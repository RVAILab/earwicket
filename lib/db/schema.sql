-- Earwicket Database Schema (with earwicket_ prefix)
-- PostgreSQL / Neon

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Environments (e.g., Home, Office)
CREATE TABLE IF NOT EXISTS earwicket_environments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zones (Sonos groups within environments)
CREATE TABLE IF NOT EXISTS earwicket_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    environment_id UUID NOT NULL REFERENCES earwicket_environments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sonos_group_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sonos_group_id)
);

-- Schedules (playlist playback schedules)
CREATE TABLE IF NOT EXISTS earwicket_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES earwicket_zones(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    playlist_uri VARCHAR(500) NOT NULL,
    playlist_name VARCHAR(255) NOT NULL,
    playlist_source VARCHAR(50) NOT NULL DEFAULT 'spotify',
    days_of_week INTEGER[] NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for schedule lookups
CREATE INDEX IF NOT EXISTS idx_earwicket_schedules_zone_enabled ON earwicket_schedules(zone_id, enabled);

-- Song Requests (visitor song queue)
CREATE TYPE earwicket_request_status AS ENUM ('pending', 'playing', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS earwicket_song_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES earwicket_zones(id) ON DELETE CASCADE,
    track_uri VARCHAR(500) NOT NULL,
    track_name VARCHAR(500) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    requested_by VARCHAR(255),
    status earwicket_request_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    played_at TIMESTAMP
);

-- Create index for queue ordering
CREATE INDEX IF NOT EXISTS idx_earwicket_song_requests_queue ON earwicket_song_requests(zone_id, status, created_at);

-- Playback State (current activity per zone)
CREATE TYPE earwicket_activity_type AS ENUM ('scheduled', 'visitor_request', 'idle');

CREATE TABLE IF NOT EXISTS earwicket_playback_state (
    zone_id UUID PRIMARY KEY REFERENCES earwicket_zones(id) ON DELETE CASCADE,
    current_activity earwicket_activity_type DEFAULT 'idle',
    interrupted_schedule_id UUID REFERENCES earwicket_schedules(id) ON DELETE SET NULL,
    interrupted_at TIMESTAMP,
    interrupted_track VARCHAR(500),
    interrupted_position_ms INTEGER,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sonos Credentials (singleton table, one row only)
CREATE TABLE IF NOT EXISTS earwicket_sonos_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    household_id VARCHAR(255),  -- Nullable, can be set later via /api/sonos/households
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spotify Credentials (singleton table, one row only)
CREATE TABLE IF NOT EXISTS earwicket_spotify_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Users
CREATE TABLE IF NOT EXISTS earwicket_admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rate Limits (for visitor requests)
CREATE TABLE IF NOT EXISTS earwicket_rate_limits (
    ip_address VARCHAR(45) PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for rate limit cleanup
CREATE INDEX IF NOT EXISTS idx_earwicket_rate_limits_window ON earwicket_rate_limits(window_start);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION earwicket_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_earwicket_schedules_updated_at BEFORE UPDATE ON earwicket_schedules
    FOR EACH ROW EXECUTE FUNCTION earwicket_update_updated_at_column();

CREATE TRIGGER update_earwicket_sonos_credentials_updated_at BEFORE UPDATE ON earwicket_sonos_credentials
    FOR EACH ROW EXECUTE FUNCTION earwicket_update_updated_at_column();

CREATE TRIGGER update_earwicket_spotify_credentials_updated_at BEFORE UPDATE ON earwicket_spotify_credentials
    FOR EACH ROW EXECUTE FUNCTION earwicket_update_updated_at_column();
