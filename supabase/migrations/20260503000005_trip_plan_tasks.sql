-- Trip plan task timeline: AI-generated + user-editable checklist
-- Supports pre-departure prep, real-time milestones, and weather-driven alerts.

CREATE TABLE trip_plan_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  category        text NOT NULL DEFAULT 'milestone'
                  CHECK (category IN ('prep', 'milestone', 'weather', 'gear', 'safety', 'camp', 'custom')),
  title           text NOT NULL,
  description     text,
  suggested_time  time,         -- suggested clock time for this task
  deadline        timestamptz,  -- hard deadline (weather-driven)
  is_done         boolean NOT NULL DEFAULT false,
  done_at         timestamptz,
  sort_order      int NOT NULL DEFAULT 0,
  ai_generated    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trip_plan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_owner_access"
  ON trip_plan_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_tasks.plan_id
      AND trip_plans.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trip_plans
      WHERE trip_plans.id = trip_plan_tasks.plan_id
      AND trip_plans.user_id = auth.uid()
    )
  );
