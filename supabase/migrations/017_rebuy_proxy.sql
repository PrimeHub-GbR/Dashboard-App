-- Add backup_proxy_url column to rebuy_settings
ALTER TABLE rebuy_settings ADD COLUMN IF NOT EXISTS backup_proxy_url TEXT;
