-- ============================================================
-- Kaipa Outdoor Hiking App — Full PostgreSQL Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username              text UNIQUE NOT NULL,
  display_name          text NOT NULL,
  avatar_url            text,
  bio                   text,
  difficulty_preference text CHECK (difficulty_preference IN ('easy', 'moderate', 'hard', 'expert')),
  total_distance_km     numeric NOT NULL DEFAULT 0,
  total_elevation_m     numeric NOT NULL DEFAULT 0,
  total_trips           int NOT NULL DEFAULT 0,
  joined_at             timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_public_read"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_own_write"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- routes
-- ============================================================
CREATE TABLE routes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  distance_km         numeric NOT NULL,
  elevation_gain_m    numeric NOT NULL,
  estimated_duration  interval NOT NULL,
  difficulty          text NOT NULL CHECK (difficulty IN ('easy', 'moderate', 'hard', 'expert')),
  difficulty_grade    text,
  rating              numeric(2,1) NOT NULL DEFAULT 0,
  review_count        int NOT NULL DEFAULT 0,
  latitude            numeric NOT NULL,
  longitude           numeric NOT NULL,
  region              text,
  max_altitude_m      numeric,
  has_water_source    boolean NOT NULL DEFAULT false,
  access_method       text,
  gpx_file_url        text,
  elevation_profile   jsonb,
  photo_spots         jsonb,
  tags                text[] NOT NULL DEFAULT '{}',
  is_published        boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routes_public_read"
  ON routes FOR SELECT
  USING (true);

CREATE POLICY "routes_creator_insert"
  ON routes FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "routes_creator_update"
  ON routes FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "routes_creator_delete"
  ON routes FOR DELETE
  USING (auth.uid() = creator_id);

CREATE INDEX idx_routes_creator ON routes(creator_id);
CREATE INDEX idx_routes_difficulty ON routes(difficulty);
CREATE INDEX idx_routes_region ON routes(region);
CREATE INDEX idx_routes_rating ON routes(rating DESC);
CREATE INDEX idx_routes_created_at ON routes(created_at DESC);

-- ============================================================
-- route_photos
-- ============================================================
CREATE TABLE route_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  caption     text,
  taken_at    timestamptz,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE route_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_photos_public_read"
  ON route_photos FOR SELECT
  USING (true);

CREATE POLICY "route_photos_own_write"
  ON route_photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_route_photos_route ON route_photos(route_id);
CREATE INDEX idx_route_photos_user ON route_photos(user_id);

-- ============================================================
-- reviews
-- ============================================================
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content     text,
  photos      text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "reviews_own_insert"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews_own_update"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews_own_delete"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_reviews_route ON reviews(route_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- ============================================================
-- gear_categories
-- ============================================================
CREATE TABLE gear_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  icon        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0
);

ALTER TABLE gear_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gear_categories_public_read"
  ON gear_categories FOR SELECT
  USING (true);

-- ============================================================
-- gear_items
-- ============================================================
CREATE TABLE gear_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES gear_categories(id) ON DELETE CASCADE,
  name          text NOT NULL,
  brand         text,
  weight_g      numeric,
  price         numeric,
  condition     text CHECK (condition IN ('new', 'good', 'fair', 'worn')),
  photo_url     text,
  notes         text,
  is_favorite   boolean NOT NULL DEFAULT false,
  purchased_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gear_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gear_items_own_select"
  ON gear_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "gear_items_own_insert"
  ON gear_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gear_items_own_update"
  ON gear_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gear_items_own_delete"
  ON gear_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_gear_items_user ON gear_items(user_id);
CREATE INDEX idx_gear_items_category ON gear_items(category_id);

-- ============================================================
-- trips
-- ============================================================
CREATE TABLE trips (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  route_id            uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  actual_distance_km  numeric,
  actual_elevation_m  numeric,
  actual_duration     interval,
  avg_speed_kmh       numeric,
  max_altitude_m      numeric,
  calories_burned     numeric,
  steps               int,
  track_geojson       jsonb,
  photos              text[] NOT NULL DEFAULT '{}',
  gear_used           uuid[] NOT NULL DEFAULT '{}',
  weather_summary     jsonb,
  status              text NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  rating              int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips_own_select"
  ON trips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "trips_own_insert"
  ON trips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trips_own_update"
  ON trips FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trips_own_delete"
  ON trips FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_trips_user ON trips(user_id);
CREATE INDEX idx_trips_route ON trips(route_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_started_at ON trips(started_at DESC);

-- ============================================================
-- achievements
-- ============================================================
CREATE TABLE achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  icon            text NOT NULL,
  condition_type  text NOT NULL,
  condition_value jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_public_read"
  ON achievements FOR SELECT
  USING (true);

-- ============================================================
-- user_achievements
-- ============================================================
CREATE TABLE user_achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id  uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at       timestamptz NOT NULL DEFAULT now(),
  trip_id         uuid REFERENCES trips(id) ON DELETE SET NULL
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_achievements_public_read"
  ON user_achievements FOR SELECT
  USING (true);

CREATE POLICY "user_achievements_own_insert"
  ON user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement ON user_achievements(achievement_id);

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('weather', 'social', 'achievement', 'system', 'safety')),
  title       text NOT NULL,
  body        text,
  data        jsonb,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own_select"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_own_update"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_own_delete"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================
-- feed_items
-- ============================================================
CREATE TABLE feed_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('trip_completed', 'route_published', 'achievement_earned', 'review_posted')),
  content     jsonb NOT NULL,
  route_id    uuid REFERENCES routes(id) ON DELETE SET NULL,
  trip_id     uuid REFERENCES trips(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_items_public_read"
  ON feed_items FOR SELECT
  USING (true);

CREATE POLICY "feed_items_own_insert"
  ON feed_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_feed_items_user ON feed_items(user_id);
CREATE INDEX idx_feed_items_type ON feed_items(type);
CREATE INDEX idx_feed_items_route ON feed_items(route_id);
CREATE INDEX idx_feed_items_created_at ON feed_items(created_at DESC);

-- ============================================================
-- follows
-- ============================================================
CREATE TABLE follows (
  follower_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_public_read"
  ON follows FOR SELECT
  USING (true);

CREATE POLICY "follows_own_insert"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_own_delete"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
