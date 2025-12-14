-- Earwicket Database Schema
-- PostgreSQL / Neon

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Environments (e.g., Home, Office)
CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zones (Sonos groups within environments)
CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sonos_group_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sonos_group_id)
);

-- Schedules (playlist playback schedules)
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_schedules_zone_enabled ON schedules(zone_id, enabled);

-- Song Requests (visitor song queue)
CREATE TYPE request_status AS ENUM ('pending', 'playing', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS song_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    track_uri VARCHAR(500) NOT NULL,
    track_name VARCHAR(500) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    requested_by VARCHAR(255),
    status request_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    played_at TIMESTAMP
);

-- Create index for queue ordering
CREATE INDEX IF NOT EXISTS idx_song_requests_queue ON song_requests(zone_id, status, created_at);

-- Playback State (current activity per zone)
CREATE TYPE activity_type AS ENUM ('scheduled', 'visitor_request', 'idle');

CREATE TABLE IF NOT EXISTS playback_state (
    zone_id UUID PRIMARY KEY REFERENCES zones(id) ON DELETE CASCADE,
    current_activity activity_type DEFAULT 'idle',
    interrupted_schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
    interrupted_at TIMESTAMP,
    interrupted_track VARCHAR(500),
    interrupted_position_ms INTEGER,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sonos Credentials (singleton table, one row only)
CREATE TABLE IF NOT EXISTS sonos_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    household_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spotify Credentials (singleton table, one row only)
CREATE TABLE IF NOT EXISTS spotify_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rate Limits (for visitor requests)
CREATE TABLE IF NOT EXISTS rate_limits (
    ip_address VARCHAR(45) PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for rate limit cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sonos_credentials_updated_at BEFORE UPDATE ON sonos_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spotify_credentials_updated_at BEFORE UPDATE ON spotify_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
