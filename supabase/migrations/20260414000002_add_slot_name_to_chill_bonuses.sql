-- Add slot_name to chill_bonuses so each bonus is permanently tied to the slot it was for.
-- This prevents wrong counts when the chill session changes slots mid-session.

ALTER TABLE chill_bonuses ADD COLUMN IF NOT EXISTS slot_name text;

-- Backfill existing bonuses with their session's current slot_name
UPDATE chill_bonuses cb
SET slot_name = cs.slot_name
FROM chill_sessions cs
WHERE cb.session_id = cs.id AND cb.slot_name IS NULL;
