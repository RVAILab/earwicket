-- Add household_id to environments table
ALTER TABLE earwicket_environments
ADD COLUMN IF NOT EXISTS household_id VARCHAR(255);

-- Remove singleton constraint from sonos_credentials (we'll store tokens per household later)
-- For now, we'll keep global tokens but reference household_id from environments
