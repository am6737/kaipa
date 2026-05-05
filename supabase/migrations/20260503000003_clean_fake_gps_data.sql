-- Clear fake waypoint and elevation profile data from seeded routes.
-- Route metadata (name, distance, elevation, difficulty, region) is based on
-- publicly known trail facts and stays. Real GPS tracks come from user uploads.

UPDATE routes
SET
  waypoints = NULL,
  elevation_profile = NULL,
  gpx_file_url = NULL
WHERE id::text LIKE 'a0000000-0000-0000-0000-%';
