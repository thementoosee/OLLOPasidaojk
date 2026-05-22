-- Add per-casino logo scale
ALTER TABLE casinos ADD COLUMN IF NOT EXISTS logo_scale numeric DEFAULT 1;
