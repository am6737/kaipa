-- Add waypoints column to routes table for storing route path coordinates
ALTER TABLE routes ADD COLUMN waypoints jsonb;
