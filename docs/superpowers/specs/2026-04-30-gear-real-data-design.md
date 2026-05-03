# Gear Screens Real Data Integration

Replace all hardcoded demo data in the gear library, category, and item detail screens with real database-backed data and functional interactions.

## Database Changes

### gear_items table: add two columns

```sql
ALTER TABLE gear_items
  ADD COLUMN use_count integer NOT NULL DEFAULT 0,
  ADD COLUMN total_distance_km numeric NOT NULL DEFAULT 0;
```

### Seed data update

Back-fill `use_count` and `total_distance_km` for the 39 seed items based on the 3 existing trips:

| Trip | Route | Distance | Gear used |
|------|-------|----------|-----------|
| trip1 | jiankou | 13.1 km | gear1, gear4, gear5, gear8, gear10, gear37 |
| trip2 | xiangshan | 7.2 km | gear2, gear8 |
| trip3 | yunmeng | 15.8 km | gear1, gear3, gear5, gear8, gear9, gear10, gear13, gear34 |

Example results:
- gear1 (Speedgoat 5): use_count=2, total_distance_km=28.9
- gear8 (TNF ThermoBall): use_count=3, total_distance_km=36.1
- gear5 (FUGA EX 2): use_count=2, total_distance_km=28.9

No new tables needed. The `trips.gear_used` uuid[] column already links gear to trips.

## Model Changes

### GearItemModel

Add two fields:
- `useCount` (int, default 0)
- `totalDistanceKm` (double, default 0)

Update `fromJson`, `toJson`, and `copyWith`.

## Repository Changes

### GearRepository: new method

`getTripsForGearItem(String itemId)` — queries trips where `gear_used @> ARRAY[itemId]::uuid[]`, joins with routes to get route name, distance, difficulty. Returns a list of lightweight trip-with-route objects. Ordered by `started_at DESC`.

### Existing providers

- `gearItemByIdProvider` — no change, already fetches single item
- `gearItemsByCategoryProvider` — no change, already fetches by category
- `gearCategoriesProvider` — no change

### New provider

`tripsForGearItemProvider(String itemId)` — FutureProvider.family wrapping `getTripsForGearItem`.

## Screen Changes

### 1. GearLibraryScreen (gear_library_screen.dart)

**Current:** All data is hardcoded `_DemoCategory`, `_DemoPreset`, `_DonutSegment` lists.

**Change:** Replace with real data from `gearCategoriesProvider` + `allGearItemsProvider`.

- Category grid: show real categories with real item count and total weight per category (aggregate from items)
- Donut chart: compute segment values from real category totals (price sum per category)
- Stats row: compute real totals (total weight, total price, category count)
- Alert banner: keep static (decorative)
- Presets section: keep hardcoded (presets feature not yet implemented)
- Navigation: already fixed to `context.go('/gear/category/$index')` — change to use category ID: `context.go('/gear/category/${cat.id}')`
- Loading state: show shimmer while data loads
- Error state: show retry

### 2. GearCategoryScreen (gear_category_screen.dart)

**Current:** Hardcoded `_demoItems` list, hardcoded filter chips, static header.

**Change:** Use `gearItemsByCategoryProvider(categoryId)` + category info.

- Header: show real category name, item count, total weight, total price
- Filter chips: keep static for now (filtering not yet implemented)
- Sort row: show real item count
- Item cards: render from real `GearItemModel` data
  - Name, subtitle (brand + specs from notes), condition badge
  - Weight, use_count from model
  - Tags: derive from item condition + favorite status
  - Thumbnail: use gradient placeholder (no real photos yet)
- Navigation: already fixed to `context.go('/gear/item/$index')` — change to `context.go('/gear/item/${item.id}')`
- Loading/error states

### 3. GearItemDetailScreen (gear_item_detail_screen.dart)

**Current:** Loads item from `gearItemByIdProvider` but stats (use count, km, rating) and routes section use demo data. Tags are hardcoded.

**Change:**

- Stats card: show `item.useCount` and `item.totalDistanceKm` from model. Remove rating (per user decision).
- Tags: derive from item properties (condition label, "收藏" if favorite)
- Photo area: keep gradient placeholder with silhouette (no real photos)
- Specs section: already reads real data — no change
- Notes section: already reads real data — no change
- Routes section: replace `_demoRoutes` with data from `tripsForGearItemProvider(itemId)`. Show trip date, route name, distance, elevation. If no trips, show empty state.
- Favorite toggle: already functional — no change
- Delete: already functional — no change

## Data flow model for trip-with-route

Lightweight model for the detail screen's routes section:

```dart
class GearTripSummary {
  final String tripId;
  final String routeName;
  final DateTime startedAt;
  final double distanceKm;
  final int elevationM;
  final String difficulty;
}
```

Built from a Supabase query joining `trips` with `routes`:
```
select t.id, t.started_at, t.actual_distance_km, t.actual_elevation_m,
       r.name, r.difficulty
from trips t
join routes r on r.id = t.route_id
where t.gear_used @> array['<item_id>']::uuid[]
order by t.started_at desc
```

## Out of scope

- Presets feature (keep hardcoded in library screen)
- Filter/sort in category screen (keep static chips)
- Photo upload/management
- Rating/review of gear items
- Automatic sync of use_count/total_distance_km when trips are completed (will be added with trip completion flow)
