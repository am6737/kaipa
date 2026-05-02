-- Make route_id nullable for manual entries
ALTER TABLE trips ALTER COLUMN route_id DROP NOT NULL;

-- Add source column to distinguish tracked vs manual trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tracked'
  CHECK (source IN ('tracked', 'manual'));

-- Add route_name column for manual entries (no route FK to join on)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_name text;
