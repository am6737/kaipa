-- Add emergency contact to profiles (persists across trips)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb;

-- Add per-trip safety settings
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS safety_settings jsonb;
