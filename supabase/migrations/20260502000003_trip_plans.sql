-- ============================================================
-- Trip Planning Tables
-- ============================================================

-- ============================================================
-- trip_plans
-- ============================================================
CREATE TABLE trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  planned_start_time TIME,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'departed', 'completed', 'cancelled')),
  weather_cache JSONB,
  weather_updated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_plans_own_select"
  ON trip_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "trip_plans_own_insert"
  ON trip_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trip_plans_own_update"
  ON trip_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trip_plans_own_delete"
  ON trip_plans FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_trip_plans_user ON trip_plans(user_id);
CREATE INDEX idx_trip_plans_status ON trip_plans(status);
CREATE INDEX idx_trip_plans_date ON trip_plans(planned_date DESC);

-- ============================================================
-- trip_plan_gear
-- ============================================================
CREATE TABLE trip_plan_gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  is_packed BOOLEAN NOT NULL DEFAULT false,
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  recommendation_reason TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, gear_item_id)
);

ALTER TABLE trip_plan_gear ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_plan_gear_own_select"
  ON trip_plan_gear FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_gear.plan_id
        AND trip_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_plan_gear_own_insert"
  ON trip_plan_gear FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_gear.plan_id
        AND trip_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_plan_gear_own_update"
  ON trip_plan_gear FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_gear.plan_id
        AND trip_plans.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_gear.plan_id
        AND trip_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_plan_gear_own_delete"
  ON trip_plan_gear FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_gear.plan_id
        AND trip_plans.user_id = auth.uid()
    )
  );

CREATE INDEX idx_trip_plan_gear_plan ON trip_plan_gear(plan_id);

-- ============================================================
-- Community gear stats RPC function
-- ============================================================
CREATE OR REPLACE FUNCTION get_community_gear_stats(target_route_id UUID)
RETURNS TABLE (category_id UUID, category_name TEXT, user_count BIGINT) AS $$
  SELECT gc.id, gc.name, COUNT(DISTINCT t.user_id)
  FROM trips t, unnest(t.gear_used) AS used_id
  JOIN gear_items gi ON gi.id = used_id
  JOIN gear_categories gc ON gc.id = gi.category_id
  WHERE t.route_id = target_route_id
    AND t.status = 'completed'
  GROUP BY gc.id, gc.name
  ORDER BY COUNT(DISTINCT t.user_id) DESC
  LIMIT 20;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- Seed demo trip plan for demo user
-- ============================================================
DO $$
DECLARE
  v_demo_user_id uuid;
  v_route_wugong_id uuid := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  -- Find demo user by username
  SELECT id INTO v_demo_user_id
  FROM profiles
  WHERE username = 'mountain_explorer'
  LIMIT 1;

  -- Only insert if demo user and the route exist
  IF v_demo_user_id IS NOT NULL THEN
    INSERT INTO trip_plans (
      id,
      user_id,
      route_id,
      planned_date,
      planned_start_time,
      status
    )
    SELECT
      'tp000000-0000-0000-0000-000000000001',
      v_demo_user_id,
      r.id,
      CURRENT_DATE + INTERVAL '3 days',
      '07:00',
      'draft'
    FROM routes r
    WHERE r.id = v_route_wugong_id
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
