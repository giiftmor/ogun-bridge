-- Migration: Add icon and is_public columns to group_services
-- Date: 2026-04-23
-- Description: Support dynamic service display in profile and invite emails

-- Add icon column
ALTER TABLE group_services ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT 'default';

-- Add is_public column (default false for security - admin must explicitly enable)
ALTER TABLE group_services ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Create index for public services query
CREATE INDEX IF NOT EXISTS idx_group_services_public ON group_services(is_active, is_public);

-- Set is_public = true for existing web services (assume they're intended to be visible)
UPDATE group_services 
SET is_public = true 
WHERE service_type = 'web' AND is_active = true;