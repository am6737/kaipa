# Trip Planning System Design

## Overview

A unified trip planning system that covers the full lifecycle from "want to go" to "depart." Users can plan trips days in advance (browse route → create plan → analyze conditions → prepare gear → pack checklist) and confirm departure on the day (final check → safety → go). Also supports spontaneous departure without advance planning.

## Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | New `trip_plan` feature module + enhanced departure flow | Advance planning needs its own data model; departure day reuses existing safety flow |
| Gear recommendation | Rule-based + personal history + community data | Rules for baseline, history for personalization, community for coverage |
| Weather | Real API (OpenWeatherMap free tier) | Recommendations need real data to be useful |
| Trip plan output | Checklist-style with packable items | Matches the natural pre-hike packing workflow |

## Data Model

### `trip_plans` table (new)

```sql
CREATE TABLE trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  route_id UUID NOT NULL REFERENCES routes(id),
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
```

### `trip_plan_gear` table (new)

```sql
CREATE TABLE trip_plan_gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  gear_item_id UUID NOT NULL REFERENCES gear_items(id),
  is_packed BOOLEAN NOT NULL DEFAULT false,
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  recommendation_reason TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, gear_item_id)
);
```

### `TripPlanModel` (Dart)

```dart
class TripPlanModel {
  final String id;
  final String userId;
  final String routeId;
  final DateTime plannedDate;
  final TimeOfDay? plannedStartTime;
  final TripPlanStatus status; // draft, ready, departed, completed, cancelled
  final Map<String, dynamic>? weatherCache;
  final DateTime? weatherUpdatedAt;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;

  // Joined data
  final RouteModel? route;
  final List<TripPlanGearItem>? gearItems;
}

class TripPlanGearItem {
  final String id;
  final String planId;
  final String gearItemId;
  final bool isPacked;
  final bool isRecommended;
  final String? recommendationReason;
  final DateTime addedAt;

  // Joined
  final GearItemModel? gearItem;
}
```

## Feature Modules

### 1. Route Analysis (enhanced `RouteDetailScreen`)

Enrich the existing route detail page with actionable analysis.

**Components:**
- **Elevation profile chart** — SVG/canvas visualization of `elevationProfile` data already in the route model. Show min/max altitude, total ascent/descent, steepest sections highlighted.
- **Real-time weather panel** — Fetch from OpenWeatherMap using route lat/lng. Show hourly forecast for planned date. Highlight risks (rain, extreme temps, high wind).
- **Difficulty breakdown** — Interpret the `difficulty` and `difficultyGrade` fields into a human-readable assessment: what makes this route this difficulty level, what to watch for.
- **Route conditions summary** — Water source availability, access method, estimated duration with buffer.

**Weather API integration:**
- Provider: OpenWeatherMap One Call API 3.0 (free tier: 1000 calls/day)
- Fetch: 48-hour hourly forecast + 8-day daily forecast
- Cache in `trip_plans.weather_cache`, refresh when >3 hours stale or on user pull-to-refresh
- For routes without a trip plan, fetch on-demand and don't cache

### 2. Smart Gear Recommendation

Three-layer recommendation engine, all running client-side with Supabase queries.

**Layer 1 — Rule-based (always active):**

Static rules mapping route conditions to gear categories:

| Condition | Recommended Gear |
|-----------|-----------------|
| Elevation > 2500m | Sun protection, warm layers, headlamp |
| Rain forecast > 30% | Rain jacket, pack cover, waterproof bag |
| Temperature < 5°C | Insulated jacket, warm hat, gloves |
| Duration > 6h | Headlamp, extra food, first aid |
| Difficulty = hard/expert | Trekking poles, helmet (if exposed terrain) |
| Has water source = false | Extra water capacity |

Rules are defined as a Dart constant map, keyed by `gear_categories.builtin_ref`. When generating recommendations, the engine matches rule output (category IDs) to the user's actual gear items in those categories. If the user has no items in a recommended category, the suggestion appears as a category-level prompt ("Consider bringing rain gear") rather than a specific item.

**Layer 2 — Personal history:**

Query user's past trips on routes with similar attributes (difficulty, elevation range, distance range). Rank gear items by frequency of use on similar trips. Boost items the user has marked as favorites.

```sql
SELECT gi.id, gi.name, COUNT(t.id) as use_count
FROM trips t, unnest(t.gear_used) AS used_id
JOIN gear_items gi ON gi.id = used_id
JOIN routes r ON r.id = t.route_id
WHERE t.user_id = :userId
  AND r.difficulty = :targetDifficulty
  AND r.elevation_gain_m BETWEEN :minElev AND :maxElev
GROUP BY gi.id, gi.name
ORDER BY use_count DESC;
```

**Layer 3 — Community data:**

Query other users' gear choices on the same route or similar routes. Since RLS restricts `gear_items` to the owning user, this requires a Supabase RPC function with `SECURITY DEFINER` that returns only aggregated category-level data (never individual items or user IDs).

```sql
-- Supabase RPC function (SECURITY DEFINER)
CREATE FUNCTION get_community_gear_stats(target_route_id UUID)
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
```

Community results surface as "X% of hikers brought [category]" without exposing individual data.

**Recommendation output:**

Each recommended item includes:
- `gearItemId` — matched to user's own gear when possible, otherwise category-level suggestion
- `isRecommended: true`
- `recommendationReason` — human-readable, e.g., "下午有雨 · 80%的徒步者携带了雨具"

User can accept/dismiss recommendations and add their own items freely.

### 3. Trip Plan Module (new feature)

**Screens:**

#### `TripPlanListScreen`
- Shows all user's trip plans grouped by status
- Upcoming plans sorted by `planned_date`
- Entry point: profile tab (under trip history section), accessible via "My Plans" button
- Quick actions: resume packing, view plan, cancel

#### `TripPlanDetailScreen`
- Single scrollable page with sections:
  1. Route summary (name, stats, mini-map)
  2. Elevation profile chart
  3. Weather forecast (auto-refreshing)
  4. Gear checklist (packable, with recommendations)
  5. Notes field
- Two visual states based on plan status:
  - **Planning mode** (`draft`/`ready`): focus on packing progress, gear adjustment
  - **Departure mode** (on planned date): focus on final confirmation checklist
- Bottom action bar:
  - Planning: "Save" / "Mark Ready"
  - Departure day: "Confirm & Depart"

#### `DepartureConfirmSheet`
- Bottom sheet triggered by "Confirm & Depart"
- Final checklist: all gear packed? weather reviewed? safety contact set?
- Flows into existing `SafetyConfirmScreen`
- On confirmation: creates a `Trip` record, transitions plan to `departed`, opens navigation

### 4. Spontaneous Departure Path

For users who don't plan ahead:
- `RouteDetailScreen` shows two CTAs: "Plan Trip" and "Depart Now"
- "Depart Now" creates a trip plan with `status: ready`, auto-populates rule-based gear recommendations, and immediately opens `DepartureConfirmSheet`
- Same flow, just compressed into one session

## Navigation / Routing

New routes to add to `app_router.dart`:

```
/trip-plans                     → TripPlanListScreen
/trip-plans/:planId             → TripPlanDetailScreen
/trip-plans/:planId/depart      → DepartureConfirmSheet
```

Entry points:
- Route detail page → "Plan Trip" / "Depart Now" buttons
- Profile tab or a new plans section → trip plan list
- Push notification (weather alert, departure reminder) → deep link to plan detail

## State Management

```
tripPlanListProvider        → AsyncNotifier<List<TripPlanModel>>
tripPlanDetailProvider(id)  → AsyncNotifier<TripPlanModel>
gearRecommendationProvider(routeId, plannedDate)
                            → FutureProvider<List<RecommendedGearItem>>
routeWeatherProvider(routeId, date)
                            → AsyncNotifier<WeatherForecast>
packingProgressProvider(planId)
                            → Provider<PackingProgress>  (computed from gear list)
```

## Implementation Phases

### Phase 1: Foundation
- `trip_plans` and `trip_plan_gear` tables + RLS
- `TripPlanModel` and `TripPlanGearItem` models
- `TripPlanRepository` with CRUD operations
- Basic `TripPlanDetailScreen` (route summary + manual gear selection + packing checklist)

### Phase 2: Route Analysis
- OpenWeatherMap API integration + `WeatherService`
- `routeWeatherProvider` with caching
- Elevation profile chart widget (using `fl_chart` or custom painter)
- Enhanced weather panel on plan detail and route detail screens

### Phase 3: Smart Gear Recommendation
- Rule engine (condition → gear category mapping)
- Personal history query
- Community data query
- Recommendation UI in plan detail (recommended items with reasons, accept/dismiss)

### Phase 4: Polish & Integration
- `TripPlanListScreen` with grouped display
- Spontaneous departure path from route detail
- Plan → Trip transition (create trip record on departure)
- Push notifications placeholder (weather alerts, departure reminders)

## Out of Scope

- Multi-day trip planning (timeline view) — future enhancement
- Offline gear recommendation — requires pre-computing, defer
- Social trip planning (invite friends) — future feature
- Navigation/GPS tracking improvements — separate initiative
