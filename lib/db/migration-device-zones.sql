-- Migration: Device-Based Zone Management
-- This migration adds device configuration support to zones, making them resilient to Sonos group changes

-- Add device configuration and caching columns
ALTER TABLE earwicket_zones
ADD COLUMN IF NOT EXISTS device_player_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS group_id_cached_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS group_id_cache_ttl_minutes INT DEFAULT 30;

-- Make sonos_group_id nullable (it's now a cache, not the source of truth)
ALTER TABLE earwicket_zones
ALTER COLUMN sonos_group_id DROP NOT NULL;

-- Add GIN index for efficient JSONB array lookups
CREATE INDEX IF NOT EXISTS idx_zones_device_player_ids
ON earwicket_zones USING GIN (device_player_ids);

-- Add comment explaining the new architecture
COMMENT ON COLUMN earwicket_zones.device_player_ids IS
'Array of persistent Sonos player IDs that define which devices this zone controls. This is the source of truth, while sonos_group_id is a cache.';

COMMENT ON COLUMN earwicket_zones.sonos_group_id IS
'Cached Sonos group ID. Resolved dynamically from device_player_ids at runtime. May be stale.';

COMMENT ON COLUMN earwicket_zones.group_id_cached_at IS
'Timestamp when sonos_group_id was last resolved and cached.';

COMMENT ON COLUMN earwicket_zones.group_id_cache_ttl_minutes IS
'How long the cached group ID is considered valid before re-resolution. Default: 30 minutes.';
