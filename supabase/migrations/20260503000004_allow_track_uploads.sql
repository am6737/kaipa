-- RPC function to allow any authenticated user to contribute GPS track data
-- to an existing route. Bypasses RLS via SECURITY DEFINER.

CREATE OR REPLACE FUNCTION contribute_route_track(
  p_route_id uuid,
  p_waypoints jsonb,
  p_elevation_profile jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE routes
  SET
    waypoints = p_waypoints,
    elevation_profile = p_elevation_profile,
    updated_at = now()
  WHERE id = p_route_id;
END;
$$;
