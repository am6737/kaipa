-- Add plan_id to trips to link a trip back to its originating trip plan
ALTER TABLE trips ADD COLUMN plan_id uuid REFERENCES trip_plans(id) ON DELETE SET NULL;
CREATE INDEX idx_trips_plan ON trips(plan_id);
