# Kaipa: React Prototype → Flutter + Supabase Real Implementation

**Date:** 2026-04-29
**Status:** Approved (user delegated design decisions)

## 1. Overview

Convert the Kaipa outdoor hiking app from a React/JSX design prototype (~7000 lines, 18 screens) into a production-ready Flutter application backed by Supabase. All data must flow through real database queries — mock/seed data is allowed but must be served through real Supabase logic.

## 2. Architecture

### Tech Stack
- **Frontend:** Flutter 3.x (iOS/Android/Web)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions + Realtime)
- **State Management:** Riverpod (flutter_riverpod + riverpod_annotation)
- **Routing:** GoRouter (go_router)
- **Architecture Pattern:** Feature-first with Repository pattern

### Project Structure
```
lib/
├── main.dart
├── app.dart                          # MaterialApp + GoRouter + theme
├── core/
│   ├── theme/
│   │   ├── tokens.dart               # Design tokens (from tokens.js)
│   │   ├── kaipa_theme.dart          # ThemeData builder
│   │   └── kaipa_colors.dart         # Color system
│   ├── supabase/
│   │   └── supabase_client.dart      # Supabase init + client
│   ├── router/
│   │   └── app_router.dart           # GoRouter config
│   └── widgets/                      # Shared widgets (Glass, CircleBtn, etc.)
│       ├── glass_container.dart
│       ├── ios_device_frame.dart
│       └── kaipa_icon.dart
├── features/
│   ├── auth/
│   │   ├── data/                     # AuthRepository
│   │   ├── domain/                   # User model
│   │   └── presentation/            # Login/Register screens
│   ├── discover/
│   │   ├── data/                     # RouteRepository
│   │   ├── domain/                   # Route, SearchFilter models
│   │   └── presentation/            # MapScreen, SearchScreen
│   ├── route_detail/
│   │   ├── data/                     # RouteDetailRepository, ReviewRepository
│   │   ├── domain/                   # RouteDetail, Review, PhotoSpot models
│   │   └── presentation/            # RouteDetailScreen
│   ├── gear/
│   │   ├── data/                     # GearRepository
│   │   ├── domain/                   # GearItem, GearCategory models
│   │   └── presentation/            # GearPickScreen, GearLibraryScreen, etc.
│   ├── navigation/
│   │   ├── data/                     # NavigationRepository (GPS tracking)
│   │   ├── domain/                   # NavigationState, Waypoint models
│   │   └── presentation/            # NavigateScreen, NavigateHUDScreen
│   ├── trip/
│   │   ├── data/                     # TripRepository
│   │   ├── domain/                   # Trip, TripStats, Achievement models
│   │   └── presentation/            # TripCompleteScreen
│   ├── gpx/
│   │   ├── data/                     # GPXRepository (parse + store)
│   │   ├── domain/                   # GPXRoute model
│   │   └── presentation/            # GPXImportScreen (3-step flow)
│   ├── social/
│   │   ├── data/                     # FeedRepository
│   │   ├── domain/                   # FeedItem, UserActivity models
│   │   └── presentation/            # FeedScreen
│   ├── profile/
│   │   ├── data/                     # ProfileRepository
│   │   ├── domain/                   # UserProfile, Achievement models
│   │   └── presentation/            # ProfileScreen
│   ├── notifications/
│   │   ├── data/                     # NotificationRepository
│   │   ├── domain/                   # AppNotification model
│   │   └── presentation/            # NotificationsScreen
│   ├── settings/
│   │   ├── data/                     # SettingsRepository (local prefs)
│   │   ├── domain/                   # AppSettings model
│   │   └── presentation/            # SettingsScreen
│   └── onboarding/
│       └── presentation/            # OnboardingScreen (3-step)
└── gen/                              # Generated code (riverpod, freezed)
```

## 3. Supabase Schema

### Tables

```sql
-- Users (extends Supabase Auth)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  difficulty_preference text check (difficulty_preference in ('easy','moderate','hard','expert')),
  total_distance_km numeric default 0,
  total_elevation_m numeric default 0,
  total_trips int default 0,
  joined_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Routes / Trails
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id),
  name text not null,
  description text,
  distance_km numeric not null,
  elevation_gain_m numeric not null,
  estimated_duration interval not null,
  difficulty text not null check (difficulty in ('easy','moderate','hard','expert')),
  difficulty_grade text,  -- e.g., 'T3'
  rating numeric(2,1) default 0,
  review_count int default 0,
  latitude numeric not null,
  longitude numeric not null,
  region text,
  max_altitude_m numeric,
  has_water_source boolean default false,
  access_method text,  -- how to get to trailhead
  gpx_file_url text,
  elevation_profile jsonb,  -- array of {distance, elevation} points
  photo_spots jsonb,        -- array of {km, name, description}
  tags text[],
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Route photos
create table public.route_photos (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.routes(id) on delete cascade,
  user_id uuid references public.profiles(id),
  url text not null,
  caption text,
  taken_at timestamptz,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.routes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  content text,
  photos text[],
  created_at timestamptz default now()
);

-- Gear categories
create table public.gear_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null,
  sort_order int default 0
);

-- Gear items (user's inventory)
create table public.gear_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  category_id uuid references public.gear_categories(id),
  name text not null,
  brand text,
  weight_g numeric,
  price numeric,
  condition text check (condition in ('new','good','fair','worn')),
  photo_url text,
  notes text,
  is_favorite boolean default false,
  purchased_at date,
  created_at timestamptz default now()
);

-- Trips (recorded hikes)
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  route_id uuid references public.routes(id),
  started_at timestamptz not null,
  finished_at timestamptz,
  actual_distance_km numeric,
  actual_elevation_m numeric,
  actual_duration interval,
  avg_speed_kmh numeric,
  max_altitude_m numeric,
  calories_burned int,
  steps int,
  track_geojson jsonb,  -- recorded GPS track
  photos text[],
  gear_used uuid[],     -- gear_item ids
  weather_summary jsonb,
  status text default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  rating int check (rating between 1 and 5),
  notes text,
  created_at timestamptz default now()
);

-- Achievements
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text not null,
  condition_type text not null,
  condition_value jsonb not null,
  created_at timestamptz default now()
);

-- User achievements
create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  achievement_id uuid references public.achievements(id),
  earned_at timestamptz default now(),
  trip_id uuid references public.trips(id)
);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('weather','social','achievement','system','safety')),
  title text not null,
  body text,
  data jsonb,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Feed (social activity)
create table public.feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('trip_completed','route_published','achievement_earned','review_posted')),
  content jsonb not null,
  route_id uuid references public.routes(id),
  trip_id uuid references public.trips(id),
  created_at timestamptz default now()
);

-- Follows (social graph)
create table public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);
```

### Row Level Security (RLS)
- Profiles: public read, own write
- Routes: public read, creator write
- Reviews: public read, own write
- Gear: own read/write only
- Trips: own read/write, friends can see completed trips
- Notifications: own read/write only
- Feed: visible to followers

### Seed Data
Populate via Supabase migrations with realistic Chinese hiking data:
- 5-8 routes (箭扣长城, 香山, 灵山, 海坨山, 云蒙山, etc.)
- 10 gear categories with sample items
- Sample reviews and feed items
- Achievement definitions
- A demo user with trip history

## 4. Screens (18 total, mapped from prototype)

| # | Screen | Source File | Priority |
|---|--------|------------|----------|
| 1 | Map (Globe/Region/Trail) | screen-map.jsx | P0 |
| 2 | Search | screens-new.jsx | P0 |
| 3 | Route Detail | screen-route.jsx | P0 |
| 4 | Gear Pick | screens-other.jsx | P1 |
| 5 | Gear Library | screens-other.jsx | P1 |
| 6 | Gear Category | screens-other.jsx | P2 |
| 7 | Gear Item Detail | screens-other.jsx | P2 |
| 8 | GPX Import (3-step) | screen-gpx-import.jsx | P2 |
| 9 | Weather | screens-new.jsx | P1 |
| 10 | Navigate | screens-other.jsx | P1 |
| 11 | Navigate HUD | screens-final.jsx | P1 |
| 12 | Trip Complete | screens-final.jsx | P1 |
| 13 | Feed | screens-new.jsx | P1 |
| 14 | Profile | screens-other.jsx | P0 |
| 15 | Notifications | screens-final.jsx | P1 |
| 16 | Settings | screens-final.jsx | P0 |
| 17 | Onboarding | screens-final.jsx | P0 |
| 18 | Route Publish | screens-final.jsx | P2 |

## 5. Design System

Port from tokens.js:
- **Colors:** Light/Dark mode with 10 accent presets, mapped to Flutter ColorScheme
- **Spacing:** Scale [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
- **Border radius:** sm(8), md(12), lg(18), xl(24), pill(9999)
- **Typography:** System font with weight/size hierarchy matching prototype
- **Glass morphism:** BackdropFilter + semi-transparent surfaces
- **Icons:** Port 81 custom SVG icons as Flutter CustomPaint or SVG assets

## 6. Key Features

- **Supabase Auth:** Email/password + social login
- **Real-time:** Supabase Realtime for notifications and feed
- **Offline-first:** Cache routes and gear data locally
- **Map:** flutter_map or mapbox_gl for trail/region views
- **GPX parsing:** gpx_parser package for import flow
- **Theme switching:** Riverpod-managed theme state persisted to SharedPreferences
- **Responsive:** iOS-first design matching prototype

## 7. What "100% Real" Means

- No hardcoded data in UI widgets — all data from Supabase queries
- Seed data inserted via SQL migrations (realistic Beijing hiking routes)
- Auth flow works with real Supabase Auth
- File uploads (photos, GPX) go to Supabase Storage
- Theme preferences persisted to local storage
- Navigation state tracks real GPS (falls back to simulated data on web/emulator)

## 8. Out of Scope (for initial build)

- Push notifications (requires native setup per platform)
- Payment / subscription features
- AI smart packing (backend ML) — UI exists but logic is placeholder
- Actual weather API integration (use seed weather data from DB)
- Map tile caching for true offline maps
