# Kaipa Flutter + Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Kaipa outdoor hiking app from a React/JSX design prototype into a production Flutter application backed by Supabase, with all data flowing through real database queries.

**Architecture:** Feature-first Flutter project using Riverpod for state management, GoRouter for navigation, and Supabase for auth/data/storage. Each feature (discover, gear, trip, etc.) is self-contained with data/domain/presentation layers. Design tokens ported 1:1 from the React prototype.

**Tech Stack:** Flutter 3.x, Dart, Supabase (PostgreSQL + Auth + Storage), Riverpod, GoRouter, flutter_map, shared_preferences

---

## File Structure

```
kaipa_app/
├── pubspec.yaml
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── core/
│   │   ├── theme/
│   │   │   ├── kaipa_tokens.dart          # Color/spacing/radius tokens
│   │   │   ├── kaipa_theme.dart           # ThemeData builder
│   │   │   └── theme_provider.dart        # Riverpod theme state
│   │   ├── supabase/
│   │   │   └── supabase_provider.dart     # Supabase client init
│   │   ├── router/
│   │   │   └── app_router.dart            # GoRouter config
│   │   └── widgets/
│   │       ├── glass_container.dart        # Frosted glass widget
│   │       ├── circle_button.dart          # Round icon button
│   │       ├── stat_widget.dart            # Number + label stat
│   │       ├── diff_badge.dart             # Difficulty badge
│   │       ├── pill_widget.dart            # Rounded tag pill
│   │       ├── section_title.dart          # Section header
│   │       ├── mini_map.dart              # Decorative trail map SVG
│   │       ├── kaipa_icons.dart           # 81 custom icons
│   │       └── bottom_nav_bar.dart        # Tab navigation
│   ├── features/
│   │   ├── auth/
│   │   │   ├── data/auth_repository.dart
│   │   │   ├── domain/user_model.dart
│   │   │   └── presentation/login_screen.dart
│   │   ├── discover/
│   │   │   ├── data/route_repository.dart
│   │   │   ├── domain/route_model.dart
│   │   │   └── presentation/
│   │   │       ├── map_screen.dart
│   │   │       └── search_screen.dart
│   │   ├── route_detail/
│   │   │   ├── data/review_repository.dart
│   │   │   ├── domain/review_model.dart
│   │   │   └── presentation/route_detail_screen.dart
│   │   ├── gear/
│   │   │   ├── data/gear_repository.dart
│   │   │   ├── domain/
│   │   │   │   ├── gear_category_model.dart
│   │   │   │   └── gear_item_model.dart
│   │   │   └── presentation/
│   │   │       ├── gear_pick_screen.dart
│   │   │       ├── gear_library_screen.dart
│   │   │       ├── gear_category_screen.dart
│   │   │       └── gear_item_detail_screen.dart
│   │   ├── navigation/
│   │   │   ├── data/navigation_repository.dart
│   │   │   ├── domain/navigation_state_model.dart
│   │   │   └── presentation/
│   │   │       ├── navigate_screen.dart
│   │   │       └── navigate_hud_screen.dart
│   │   ├── trip/
│   │   │   ├── data/trip_repository.dart
│   │   │   ├── domain/trip_model.dart
│   │   │   └── presentation/trip_complete_screen.dart
│   │   ├── gpx/
│   │   │   ├── data/gpx_repository.dart
│   │   │   ├── domain/gpx_route_model.dart
│   │   │   └── presentation/gpx_import_screen.dart
│   │   ├── social/
│   │   │   ├── data/feed_repository.dart
│   │   │   ├── domain/feed_item_model.dart
│   │   │   └── presentation/feed_screen.dart
│   │   ├── profile/
│   │   │   ├── data/profile_repository.dart
│   │   │   ├── domain/profile_model.dart
│   │   │   └── presentation/profile_screen.dart
│   │   ├── notifications/
│   │   │   ├── data/notification_repository.dart
│   │   │   ├── domain/notification_model.dart
│   │   │   └── presentation/notifications_screen.dart
│   │   ├── settings/
│   │   │   ├── data/settings_repository.dart
│   │   │   ├── domain/settings_model.dart
│   │   │   └── presentation/settings_screen.dart
│   │   └── onboarding/
│   │       └── presentation/onboarding_screen.dart
│   └── supabase/
│       ├── migrations/
│       │   ├── 00001_schema.sql
│       │   └── 00002_seed.sql
│       └── config.toml
```

---

## Task 1: Environment Setup — Install Flutter & Create Project

**Files:**
- Create: `kaipa_app/pubspec.yaml`
- Create: `kaipa_app/lib/main.dart`
- Create: `kaipa_app/analysis_options.yaml`

- [ ] **Step 1: Install Flutter SDK**

```bash
cd /home/coder
git clone https://github.com/flutter/flutter.git --depth 1 -b stable /home/coder/flutter-sdk
export PATH="/home/coder/flutter-sdk/bin:$PATH"
flutter precache --web
flutter doctor
```

- [ ] **Step 2: Create Flutter project**

```bash
export PATH="/home/coder/flutter-sdk/bin:$PATH"
cd /home/coder/workspaces/kaipa
flutter create kaipa_app --org com.kaipa --project-name kaipa_app --platforms web
cd kaipa_app
```

- [ ] **Step 3: Add dependencies to pubspec.yaml**

Replace `kaipa_app/pubspec.yaml` with:

```yaml
name: kaipa_app
description: Kaipa — outdoor hiking companion app
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: ^3.8.0

dependencies:
  flutter:
    sdk: flutter
  supabase_flutter: ^2.10.0
  flutter_riverpod: ^2.6.1
  go_router: ^15.1.2
  shared_preferences: ^2.5.3
  flutter_map: ^7.0.2
  latlong2: ^0.9.1
  intl: ^0.20.2
  cached_network_image: ^3.4.1
  shimmer: ^3.0.0
  file_picker: ^9.2.4

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0

flutter:
  uses-material-design: true
```

- [ ] **Step 4: Get dependencies**

```bash
export PATH="/home/coder/flutter-sdk/bin:$PATH"
cd /home/coder/workspaces/kaipa/kaipa_app
flutter pub get
```

- [ ] **Step 5: Commit**

```bash
cd /home/coder/workspaces/kaipa
git add kaipa_app/
git commit -m "feat: initialize Flutter project with dependencies"
```

---

## Task 2: Design System — Tokens, Theme, Shared Widgets

**Files:**
- Create: `kaipa_app/lib/core/theme/kaipa_tokens.dart`
- Create: `kaipa_app/lib/core/theme/kaipa_theme.dart`
- Create: `kaipa_app/lib/core/theme/theme_provider.dart`
- Create: `kaipa_app/lib/core/widgets/glass_container.dart`
- Create: `kaipa_app/lib/core/widgets/circle_button.dart`
- Create: `kaipa_app/lib/core/widgets/stat_widget.dart`
- Create: `kaipa_app/lib/core/widgets/diff_badge.dart`
- Create: `kaipa_app/lib/core/widgets/pill_widget.dart`
- Create: `kaipa_app/lib/core/widgets/section_title.dart`
- Create: `kaipa_app/lib/core/widgets/mini_map.dart`
- Create: `kaipa_app/lib/core/widgets/kaipa_icons.dart`
- Create: `kaipa_app/lib/core/widgets/bottom_nav_bar.dart`

Reference: `/home/coder/workspaces/kaipa/tokens.js` for exact color values, spacing, radius tokens.
Reference: `/home/coder/workspaces/kaipa/icons.jsx` for all 81 icon SVG paths.
Reference: `/home/coder/workspaces/kaipa/screen-map.jsx` for Glass, Pill, Stat, DiffBadge, CircleBtn widget implementations.

- [ ] **Step 1: Create kaipa_tokens.dart**

Port the entire design token system from `tokens.js`. This includes:
- `KaipaTokens` class with factory `build({mode, accent})` matching `buildTokens()` in tokens.js
- `KaipaColors` class with ALL color properties: bg, surface, surfaceHi, line, lineSoft, ink, inkMuted, inkDim, flare, flareSoft, flareDeep, moss, mossSoft, mossDeep, sky, skySoft, sand, diff (easy/mod/hard/expert/extreme), terrain (base/lowland/mid/ridge/peak/water/waterDeep/contour/contourMajor/forest/snow), glass, glassDark
- Light AND dark mode color sets — exact hex values from tokens.js lines 37-113
- `KaipaSpacing` with scale [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
- `KaipaRadius` with sm=8, md=12, lg=18, xl=24, pill=9999
- 6 preset accents: meadow=#22C55E, moss=#4A7C59, citrus=#FF7A1A, ember=#A84228, peach=#FF8FB1, lake=#2C5D7E
- Helper: `hexToColor(String hex)`, `colorWithOpacity(Color c, double opacity)`, `mixColors(Color a, Color b, double t)`

```dart
import 'dart:ui';

class KaipaColors {
  final Color bg;
  final Color surface;
  final Color surfaceHi;
  final Color line;
  final Color lineSoft;
  final Color ink;
  final Color inkMuted;
  final Color inkDim;
  final Color flare;
  final Color flareSoft;
  final Color flareDeep;
  final Color moss;
  final Color mossSoft;
  final Color mossDeep;
  final Color sky;
  final Color skySoft;
  final Color sand;
  final KaipaDiffColors diff;
  final KaipaTerrainColors terrain;
  final Color glass;
  final Color glassDark;

  const KaipaColors({
    required this.bg, required this.surface, required this.surfaceHi,
    required this.line, required this.lineSoft,
    required this.ink, required this.inkMuted, required this.inkDim,
    required this.flare, required this.flareSoft, required this.flareDeep,
    required this.moss, required this.mossSoft, required this.mossDeep,
    required this.sky, required this.skySoft, required this.sand,
    required this.diff, required this.terrain,
    required this.glass, required this.glassDark,
  });
}
// ... full implementation using exact values from tokens.js
```

- [ ] **Step 2: Create kaipa_theme.dart**

Build `ThemeData` from `KaipaTokens`:
- `KaipaTheme.build(KaipaTokens tokens)` → `ThemeData`
- Map tokens to ColorScheme, TextTheme, AppBarTheme, CardTheme, etc.
- Typography: use system font (`.SF Pro` on iOS, `Roboto` on Android)

- [ ] **Step 3: Create theme_provider.dart**

Riverpod providers for theme state:
- `themePrefsProvider` — reads/writes mode + accent to SharedPreferences
- `kaipaTokensProvider` — computed KaipaTokens from current prefs
- `kaipaThemeProvider` — computed ThemeData from tokens

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

final sharedPrefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError());

class ThemePrefs {
  final String mode; // 'light' or 'dark'
  final String preset; // 'meadow','moss','citrus','ember','peach','lake'
  final String? customAccent;
  final bool useCustom;
  // constructor, copyWith, toJson, fromJson
}

final themePrefsProvider = StateNotifierProvider<ThemePrefsNotifier, ThemePrefs>((ref) {
  final prefs = ref.watch(sharedPrefsProvider);
  return ThemePrefsNotifier(prefs);
});

final kaipaTokensProvider = Provider<KaipaTokens>((ref) {
  final prefs = ref.watch(themePrefsProvider);
  final accent = prefs.useCustom ? prefs.customAccent! : KaipaTokens.presetHex(prefs.preset);
  return KaipaTokens.build(mode: prefs.mode, accent: accent);
});
```

- [ ] **Step 4: Create glass_container.dart**

Port the `Glass` component from `screen-map.jsx` line 9-22:
- Uses `ClipRRect` + `BackdropFilter` with `ImageFilter.blur(sigmaX: 28, sigmaY: 28)`
- Semi-transparent background from tokens (glass / glassDark)
- Inner highlight border + shadow matching the React version
- Parameters: `dark`, `radius`, `child`, `padding`

- [ ] **Step 5: Create circle_button.dart**

Port `CircleBtn` from `screen-map.jsx` line 74-81:
- Glass background, circular, configurable size (default 44), icon
- Parameters: `icon` (IconData), `onTap`, `dark`, `color`, `size`, `iconSize`

- [ ] **Step 6: Create stat_widget.dart**

Port `Stat` from `screen-map.jsx` line 40-56:
- Large value text (22px, w600) + optional unit suffix + small label below
- Uses KaipaTokens for colors

- [ ] **Step 7: Create diff_badge.dart**

Port `DiffBadge` from `screen-map.jsx` line 58-72:
- Colored dot + label based on difficulty level
- Difficulty colors from tokens.diff
- Labels: easy→'入门 T1', mod→'中等 T2', hard→'困难 T3', expert→'专家 T4'

- [ ] **Step 8: Create pill_widget.dart**

Port `Pill` from `screen-map.jsx` line 25-38:
- Glass background, pill-shaped (radius 999)
- Active state changes bg to flare, text to white

- [ ] **Step 9: Create section_title.dart**

Simple section header widget with title text in inkMuted, optional trailing action.

- [ ] **Step 10: Create kaipa_icons.dart**

Port all 81 icons from `icons.jsx`. Use `CustomPainter` to render SVG path data:
- Create `KaipaIcons` class with static `IconData`-like constants for each icon name
- Create `KaipaIcon` widget that paints the path data at given size and color
- All 81 icon paths from icons.jsx lines 5-60+

```dart
class KaipaIcon extends StatelessWidget {
  final String name;
  final double size;
  final Color? color;
  // renders via CustomPaint using the SVG path for this icon name
}
```

- [ ] **Step 11: Create mini_map.dart**

Port `MiniMap` from `screens-new.jsx` lines 6-33:
- Decorative SVG trail mini-map using CustomPaint
- Terrain contour lines + trail path + start/end dots
- Parameterized by seed for variety

- [ ] **Step 12: Create bottom_nav_bar.dart**

Bottom tab bar for main navigation:
- 4 tabs: 发现 (discover/map), 装备 (gear), 动态 (feed), 我的 (profile)
- Icons: compass, backpack, chat, user
- Glass-style background

- [ ] **Step 13: Commit**

```bash
git add kaipa_app/lib/core/
git commit -m "feat: add design system — tokens, theme, shared widgets"
```

---

## Task 3: Supabase Schema & Seed Data

**Files:**
- Create: `kaipa_app/lib/supabase/migrations/00001_schema.sql`
- Create: `kaipa_app/lib/supabase/migrations/00002_seed.sql`
- Create: `kaipa_app/lib/core/supabase/supabase_provider.dart`

- [ ] **Step 1: Create schema SQL**

Write `00001_schema.sql` with ALL tables from the design spec Section 3:
- profiles, routes, route_photos, reviews, gear_categories, gear_items, trips, achievements, user_achievements, notifications, feed_items, follows
- Include all constraints, defaults, foreign keys
- Add RLS policies for each table
- Add indexes for common queries (routes by region, gear by user, trips by user, etc.)

Use exact SQL from the design spec, plus add:
```sql
-- Enable RLS on all tables
alter table public.profiles enable row level security;
-- ... for each table

-- Profiles: anyone can read, only own profile can update
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
-- ... policies for each table
```

- [ ] **Step 2: Create seed data SQL**

Write `00002_seed.sql` with realistic Beijing hiking data:

```sql
-- Demo user (will be created via auth, this is the profile)
-- Use a fixed UUID for the demo user so we can reference it
DO $$
DECLARE demo_user_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

-- Insert demo profile
INSERT INTO public.profiles (id, username, display_name, avatar_url, bio, difficulty_preference, total_distance_km, total_elevation_m, total_trips)
VALUES (demo_user_id, 'hiker_demo', '山行者', null, '热爱户外，每周末都要爬山', 'hard', 342.5, 18720, 47);

-- Routes — 6 realistic Beijing-area trails
INSERT INTO public.routes (id, creator_id, name, description, distance_km, elevation_gain_m, estimated_duration, difficulty, difficulty_grade, rating, review_count, latitude, longitude, region, max_altitude_m, has_water_source, access_method, elevation_profile, photo_spots, tags) VALUES
('a0000000-0000-0000-0000-000000000001', demo_user_id, '箭扣长城', '西栅子 → 九眼楼，野长城最精华段，需手脚并用的攀爬路段', 11.4, 680, '5 hours 20 minutes', 'hard', 'T3', 4.7, 128, 40.476, 116.561, '北京·怀柔', 942, false,
 '东直门乘916至怀柔转H25路至西栅子村',
 '[{"distance":0,"elevation":420},{"distance":1.5,"elevation":580},{"distance":3,"elevation":720},{"distance":5,"elevation":860},{"distance":7,"elevation":942},{"distance":9,"elevation":780},{"distance":11.4,"elevation":650}]',
 '[{"km":3.2,"name":"鹰飞倒仰","description":"箭扣最险峻段，70度陡坡"},{"km":5.8,"name":"天梯","description":"连续攀爬，视野开阔"},{"km":8.5,"name":"九眼楼","description":"海拔最高敌楼，360度全景"}]',
 ARRAY['野长城','非景区','暴露段','需手脚并用']),

('a0000000-0000-0000-0000-000000000002', demo_user_id, '云蒙山主峰', '北京第二高峰，林间穿越与高山草甸交替', 7.3, 620, '4 hours', 'moderate', 'T2', 4.5, 86, 40.575, 116.848, '北京·密云', 1414, true,
 '东直门乘980路至密云转密60路',
 '[{"distance":0,"elevation":800},{"distance":2,"elevation":1000},{"distance":4,"elevation":1200},{"distance":5.5,"elevation":1414},{"distance":7.3,"elevation":900}]',
 '[{"km":2.5,"name":"云海观景台","description":"晨起可见云海"},{"km":5.5,"name":"主峰标志","description":"北京第二高峰标志碑"}]',
 ARRAY['森林','高山草甸','有水源']),

('a0000000-0000-0000-0000-000000000003', demo_user_id, '海坨山纵走', '北京最高峰大海坨，需两日重装', 18.1, 1240, '8 hours 30 minutes', 'expert', 'T4', 4.9, 42, 40.514, 115.846, '北京·延庆', 2241, false,
 '德胜门乘919路至延庆转920路',
 '[{"distance":0,"elevation":1000},{"distance":3,"elevation":1400},{"distance":7,"elevation":1800},{"distance":10,"elevation":2241},{"distance":14,"elevation":1900},{"distance":18.1,"elevation":1100}]',
 '[{"km":7,"name":"小海坨","description":"开阔草甸，适合扎营"},{"km":10,"name":"大海坨主峰","description":"北京最高点2241m"}]',
 ARRAY['重装','高海拔','两日行程','高山草甸']),

('a0000000-0000-0000-0000-000000000004', demo_user_id, '十三陵水库环线', '平缓的水库环线，适合新手入门', 14.2, 480, '4 hours 40 minutes', 'easy', 'T1', 4.2, 234, 40.254, 116.231, '北京·昌平', 520, true,
 '地铁昌平线至昌平西山口站',
 '[{"distance":0,"elevation":120},{"distance":4,"elevation":280},{"distance":7,"elevation":520},{"distance":10,"elevation":350},{"distance":14.2,"elevation":120}]',
 '[{"km":3,"name":"水库大坝","description":"开阔水面，适合拍照"},{"km":7,"name":"蟒山观景台","description":"俯瞰十三陵全景"}]',
 ARRAY['入门','水库','有水源','亲子友好']),

('a0000000-0000-0000-0000-000000000005', demo_user_id, '香山公园主峰', '经典短距离爬升，四季皆宜', 5.4, 380, '2 hours 30 minutes', 'easy', 'T1', 4.0, 892, 39.990, 116.189, '北京·海淀', 575, true,
 '地铁西郊线香山站',
 '[{"distance":0,"elevation":120},{"distance":1.5,"elevation":280},{"distance":3,"elevation":420},{"distance":4.2,"elevation":575},{"distance":5.4,"elevation":120}]',
 '[{"km":2,"name":"双清别墅","description":"毛主席故居"},{"km":4.2,"name":"香炉峰","description":"俗称鬼见愁，最高点"}]',
 ARRAY['入门','景区','四季皆宜','红叶']),

('a0000000-0000-0000-0000-000000000006', demo_user_id, '灵山穿越', '北京西部最高峰，高山花海', 12.8, 920, '6 hours 30 minutes', 'hard', 'T3', 4.6, 67, 39.980, 115.459, '北京·门头沟', 2303, false,
 '地铁苹果园站乘929路至灵山景区',
 '[{"distance":0,"elevation":1400},{"distance":3,"elevation":1800},{"distance":6,"elevation":2200},{"distance":8,"elevation":2303},{"distance":12.8,"elevation":1400}]',
 '[{"km":4,"name":"高山草甸","description":"6-8月野花遍地"},{"km":8,"name":"灵山主峰","description":"北京最高峰2303m"}]',
 ARRAY['高海拔','花海','风大','需防晒']);

-- Gear categories
INSERT INTO public.gear_categories (id, name, icon, sort_order) VALUES
('b0000000-0000-0000-0000-000000000001', '登山鞋', 'boot', 1),
('b0000000-0000-0000-0000-000000000002', '背包', 'backpack', 2),
('b0000000-0000-0000-0000-000000000003', '冲锋衣', 'jacket', 3),
('b0000000-0000-0000-0000-000000000004', '帐篷', 'tent', 4),
('b0000000-0000-0000-0000-000000000005', '水壶', 'bottle', 5),
('b0000000-0000-0000-0000-000000000006', '充电宝', 'battery', 6),
('b0000000-0000-0000-0000-000000000007', '头灯', 'light', 7),
('b0000000-0000-0000-0000-000000000008', '刀具', 'knife', 8),
('b0000000-0000-0000-0000-000000000009', '袜子', 'socks', 9),
('b0000000-0000-0000-0000-000000000010', '护具', 'shield', 10);

-- Gear items for demo user
INSERT INTO public.gear_items (user_id, category_id, name, brand, weight_g, price, condition, is_favorite) VALUES
(demo_user_id, 'b0000000-0000-0000-0000-000000000001', 'Kaha 2 GTX', 'HOKA', 498, 2299, 'good', true),
(demo_user_id, 'b0000000-0000-0000-0000-000000000001', 'X Ultra 4 GTX', 'Salomon', 420, 1099, 'fair', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000002', 'Aircontact Core 65+10', 'Deuter', 2380, 1899, 'good', true),
(demo_user_id, 'b0000000-0000-0000-0000-000000000002', 'Trail 25', 'Osprey', 680, 799, 'new', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000003', 'Beta AR', 'Arc''teryx', 455, 4599, 'good', true),
(demo_user_id, 'b0000000-0000-0000-0000-000000000003', 'Torrentshell 3L', 'Patagonia', 394, 1299, 'good', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000004', 'Hubba Hubba NX 2', 'MSR', 1540, 3699, 'good', true),
(demo_user_id, 'b0000000-0000-0000-0000-000000000005', 'Hydroflask 32oz', 'Hydro Flask', 397, 329, 'good', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000006', '25000mAh 户外版', 'Nitecore', 420, 499, 'new', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000007', 'Actik Core 600', 'Petzl', 82, 449, 'good', true),
(demo_user_id, 'b0000000-0000-0000-0000-000000000008', 'Bugout', 'Benchmade', 51, 1399, 'new', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000009', 'T3 中筒美利奴', 'Darn Tough', 85, 199, 'good', false),
(demo_user_id, 'b0000000-0000-0000-0000-000000000010', '碳纤维登山杖(对)', 'Black Diamond', 490, 899, 'good', true);

-- Reviews
INSERT INTO public.reviews (route_id, user_id, rating, content) VALUES
('a0000000-0000-0000-0000-000000000001', demo_user_id, 5, '箭扣是北京最值得走的长城段！鹰飞倒仰段确实需要手脚并用，但到达九眼楼时的景色绝对值得。建议穿抓地力好的登山鞋，带够水。'),
('a0000000-0000-0000-0000-000000000001', demo_user_id, 4, '风景绝美但体力消耗大，新手慎入。天梯段有几处需要攀岩，恐高的朋友要做好心理准备。');

-- Achievements
INSERT INTO public.achievements (id, name, description, icon, condition_type, condition_value) VALUES
('c0000000-0000-0000-0000-000000000001', '首次登顶', '完成第一次徒步', 'flag', 'trip_count', '{"min": 1}'),
('c0000000-0000-0000-0000-000000000002', '周末战士', '完成10次徒步', 'mountain', 'trip_count', '{"min": 10}'),
('c0000000-0000-0000-0000-000000000003', '百公里俱乐部', '累计徒步超过100公里', 'trail', 'total_distance', '{"min": 100}'),
('c0000000-0000-0000-0000-000000000004', '万米爬升', '累计爬升超过10000米', 'altitude', 'total_elevation', '{"min": 10000}'),
('c0000000-0000-0000-0000-000000000005', '装备达人', '装备库超过10件', 'backpack', 'gear_count', '{"min": 10}'),
('c0000000-0000-0000-0000-000000000006', '探路先锋', '发布第一条路线', 'compass', 'route_published', '{"min": 1}');

-- User achievements for demo user
INSERT INTO public.user_achievements (user_id, achievement_id, earned_at) VALUES
(demo_user_id, 'c0000000-0000-0000-0000-000000000001', now() - interval '340 days'),
(demo_user_id, 'c0000000-0000-0000-0000-000000000002', now() - interval '200 days'),
(demo_user_id, 'c0000000-0000-0000-0000-000000000003', now() - interval '150 days'),
(demo_user_id, 'c0000000-0000-0000-0000-000000000004', now() - interval '60 days'),
(demo_user_id, 'c0000000-0000-0000-0000-000000000005', now() - interval '30 days');

-- Trips for demo user
INSERT INTO public.trips (user_id, route_id, started_at, finished_at, actual_distance_km, actual_elevation_m, actual_duration, avg_speed_kmh, max_altitude_m, calories_burned, steps, status, rating) VALUES
(demo_user_id, 'a0000000-0000-0000-0000-000000000001', now() - interval '7 days', now() - interval '7 days' + interval '5 hours 35 minutes', 11.4, 695, '5 hours 35 minutes', 2.04, 942, 1820, 24350, 'completed', 5),
(demo_user_id, 'a0000000-0000-0000-0000-000000000002', now() - interval '14 days', now() - interval '14 days' + interval '4 hours 10 minutes', 7.5, 630, '4 hours 10 minutes', 1.8, 1414, 1240, 16800, 'completed', 4),
(demo_user_id, 'a0000000-0000-0000-0000-000000000005', now() - interval '21 days', now() - interval '21 days' + interval '2 hours 20 minutes', 5.4, 385, '2 hours 20 minutes', 2.3, 575, 680, 12400, 'completed', 4);

-- Notifications for demo user
INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at) VALUES
(demo_user_id, 'weather', '箭扣长城 · 天气预警', '明日阵风7级，山脊段风力更大，注意防风保暖', '{"route_id":"a0000000-0000-0000-0000-000000000001","severity":"warning"}', false, now() - interval '2 hours'),
(demo_user_id, 'achievement', '解锁成就：装备达人', '你的装备库已超过10件，继续充实你的户外装备吧！', '{"achievement_id":"c0000000-0000-0000-0000-000000000005"}', false, now() - interval '1 day'),
(demo_user_id, 'social', '小明 完成了 云蒙山主峰', '你的好友刚刚完成了一次徒步，去看看吧', '{"user_id":"friend1","trip_id":"x"}', true, now() - interval '2 days'),
(demo_user_id, 'system', '欢迎更新 v2.0', 'Kaipa 2.0 上线！新增行程总结、通知中心、装备库管理等功能', null, true, now() - interval '5 days'),
(demo_user_id, 'safety', '紧急联系人未设置', '设置紧急联系人，让你的安全更有保障', '{"action":"set_emergency_contact"}', false, now() - interval '3 days');

-- Feed items
INSERT INTO public.feed_items (user_id, type, content, route_id, trip_id, created_at) VALUES
(demo_user_id, 'trip_completed', '{"summary":"完成箭扣长城全程！5小时35分，累计爬升695m"}', 'a0000000-0000-0000-0000-000000000001', null, now() - interval '7 days'),
(demo_user_id, 'achievement_earned', '{"achievement":"装备达人","description":"装备库超过10件"}', null, null, now() - interval '1 day');

END $$;
```

- [ ] **Step 3: Create supabase_provider.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final supabaseProvider = Provider<SupabaseClient>((ref) {
  return Supabase.instance.client;
});
```

- [ ] **Step 4: Commit**

```bash
git add kaipa_app/lib/supabase/ kaipa_app/lib/core/supabase/
git commit -m "feat: add Supabase schema, seed data, and client provider"
```

---

## Task 4: Data Models — All Domain Models

**Files:**
- Create: `kaipa_app/lib/features/auth/domain/user_model.dart`
- Create: `kaipa_app/lib/features/discover/domain/route_model.dart`
- Create: `kaipa_app/lib/features/route_detail/domain/review_model.dart`
- Create: `kaipa_app/lib/features/gear/domain/gear_category_model.dart`
- Create: `kaipa_app/lib/features/gear/domain/gear_item_model.dart`
- Create: `kaipa_app/lib/features/trip/domain/trip_model.dart`
- Create: `kaipa_app/lib/features/social/domain/feed_item_model.dart`
- Create: `kaipa_app/lib/features/notifications/domain/notification_model.dart`
- Create: `kaipa_app/lib/features/profile/domain/profile_model.dart`
- Create: `kaipa_app/lib/features/settings/domain/settings_model.dart`
- Create: `kaipa_app/lib/features/gpx/domain/gpx_route_model.dart`
- Create: `kaipa_app/lib/features/navigation/domain/navigation_state_model.dart`

Each model class must:
- Be an immutable Dart class with `final` fields
- Have a `factory fromJson(Map<String, dynamic> json)` constructor
- Have a `Map<String, dynamic> toJson()` method
- Have a `copyWith(...)` method
- Match the Supabase schema columns exactly

Reference: `00001_schema.sql` for column names and types.

- [ ] **Step 1: Create all model files**

Every model maps 1:1 to a database table. Example for RouteModel:

```dart
class RouteModel {
  final String id;
  final String? creatorId;
  final String name;
  final String? description;
  final double distanceKm;
  final int elevationGainM;
  final Duration estimatedDuration;
  final String difficulty;
  final String? difficultyGrade;
  final double rating;
  final int reviewCount;
  final double latitude;
  final double longitude;
  final String? region;
  final int? maxAltitudeM;
  final bool hasWaterSource;
  final String? accessMethod;
  final String? gpxFileUrl;
  final List<ElevationPoint>? elevationProfile;
  final List<PhotoSpot>? photoSpots;
  final List<String> tags;
  final bool isPublished;
  final DateTime createdAt;

  const RouteModel({...});

  factory RouteModel.fromJson(Map<String, dynamic> json) => RouteModel(
    id: json['id'] as String,
    name: json['name'] as String,
    distanceKm: (json['distance_km'] as num).toDouble(),
    elevationGainM: (json['elevation_gain_m'] as num).toInt(),
    estimatedDuration: _parseDuration(json['estimated_duration'] as String),
    difficulty: json['difficulty'] as String,
    // ... all fields
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'distance_km': distanceKm,
    // ... all fields
  };
}

class ElevationPoint {
  final double distance;
  final double elevation;
  const ElevationPoint({required this.distance, required this.elevation});
  factory ElevationPoint.fromJson(Map<String, dynamic> json) => ...;
}

class PhotoSpot {
  final double km;
  final String name;
  final String? description;
  const PhotoSpot({required this.km, required this.name, this.description});
  factory PhotoSpot.fromJson(Map<String, dynamic> json) => ...;
}
```

Create similar model classes for ALL domain models: UserModel, ReviewModel, GearCategoryModel, GearItemModel, TripModel, FeedItemModel, NotificationModel, ProfileModel, SettingsModel, GpxRouteModel, NavigationStateModel.

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/*/domain/
git commit -m "feat: add all domain models matching Supabase schema"
```

---

## Task 5: Repositories — Supabase Data Access Layer

**Files:**
- Create: `kaipa_app/lib/features/auth/data/auth_repository.dart`
- Create: `kaipa_app/lib/features/discover/data/route_repository.dart`
- Create: `kaipa_app/lib/features/route_detail/data/review_repository.dart`
- Create: `kaipa_app/lib/features/gear/data/gear_repository.dart`
- Create: `kaipa_app/lib/features/trip/data/trip_repository.dart`
- Create: `kaipa_app/lib/features/social/data/feed_repository.dart`
- Create: `kaipa_app/lib/features/profile/data/profile_repository.dart`
- Create: `kaipa_app/lib/features/notifications/data/notification_repository.dart`
- Create: `kaipa_app/lib/features/settings/data/settings_repository.dart`
- Create: `kaipa_app/lib/features/gpx/data/gpx_repository.dart`
- Create: `kaipa_app/lib/features/navigation/data/navigation_repository.dart`

Each repository:
- Takes `SupabaseClient` via Riverpod provider
- Has a corresponding `Provider` for dependency injection
- Uses the Supabase client for CRUD operations
- Returns domain model objects

- [ ] **Step 1: Create all repository files**

Example for RouteRepository:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../domain/route_model.dart';
import '../../../core/supabase/supabase_provider.dart';

final routeRepositoryProvider = Provider<RouteRepository>((ref) {
  return RouteRepository(ref.watch(supabaseProvider));
});

class RouteRepository {
  final SupabaseClient _client;
  RouteRepository(this._client);

  Future<List<RouteModel>> getRoutes({String? difficulty, String? region}) async {
    var query = _client.from('routes').select();
    if (difficulty != null && difficulty != 'all') {
      query = query.eq('difficulty', difficulty);
    }
    if (region != null) {
      query = query.eq('region', region);
    }
    final data = await query.order('rating', ascending: false);
    return (data as List).map((e) => RouteModel.fromJson(e)).toList();
  }

  Future<RouteModel> getRouteById(String id) async {
    final data = await _client.from('routes').select().eq('id', id).single();
    return RouteModel.fromJson(data);
  }

  Future<List<RouteModel>> searchRoutes(String query) async {
    final data = await _client.from('routes').select().ilike('name', '%$query%');
    return (data as List).map((e) => RouteModel.fromJson(e)).toList();
  }
}
```

Create similar repositories for ALL features. Key methods per repository:

- **AuthRepository**: signUp, signIn, signOut, getCurrentUser, onAuthStateChange
- **RouteRepository**: getRoutes, getRouteById, searchRoutes, createRoute
- **ReviewRepository**: getReviewsByRoute, createReview
- **GearRepository**: getCategories, getItemsByCategory, getAllItems, createItem, updateItem, deleteItem
- **TripRepository**: getTrips, getTripById, startTrip, endTrip, getLatestTrip
- **FeedRepository**: getFeed (with pagination)
- **ProfileRepository**: getProfile, updateProfile, getAchievements
- **NotificationRepository**: getNotifications, markAsRead, getUnreadCount
- **SettingsRepository**: getSettings, updateSettings (via SharedPreferences)
- **GpxRepository**: uploadGpx, getGpxRoutes
- **NavigationRepository**: getCurrentPosition, startTracking, stopTracking

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/*/data/
git commit -m "feat: add all Supabase repositories with Riverpod providers"
```

---

## Task 6: App Shell — Router, Main, App Entry Point

**Files:**
- Create: `kaipa_app/lib/core/router/app_router.dart`
- Modify: `kaipa_app/lib/main.dart`
- Create: `kaipa_app/lib/app.dart`

- [ ] **Step 1: Create app_router.dart**

```dart
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// import all screens

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/discover',
    routes: [
      // Bottom nav shell
      StatefulShellRoute.indexedStack(
        builder: (context, state, child) => AppShell(child: child),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/discover', builder: (_, __) => const MapScreen(),
              routes: [
                GoRoute(path: 'search', builder: (_, __) => const SearchScreen()),
                GoRoute(path: 'route/:id', builder: (_, state) => RouteDetailScreen(routeId: state.pathParameters['id']!)),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/gear', builder: (_, __) => const GearLibraryScreen(),
              routes: [
                GoRoute(path: 'category/:id', builder: (_, state) => GearCategoryScreen(categoryId: state.pathParameters['id']!)),
                GoRoute(path: 'item/:id', builder: (_, state) => GearItemDetailScreen(itemId: state.pathParameters['id']!)),
                GoRoute(path: 'pick/:routeId', builder: (_, state) => GearPickScreen(routeId: state.pathParameters['routeId']!)),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/feed', builder: (_, __) => const FeedScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
          ]),
        ],
      ),
      // Full-screen routes (no bottom nav)
      GoRoute(path: '/navigate/:routeId', builder: (_, state) => NavigateScreen(routeId: state.pathParameters['routeId']!)),
      GoRoute(path: '/navigate-hud/:routeId', builder: (_, state) => NavigateHudScreen(routeId: state.pathParameters['routeId']!)),
      GoRoute(path: '/trip-complete/:tripId', builder: (_, state) => TripCompleteScreen(tripId: state.pathParameters['tripId']!)),
      GoRoute(path: '/gpx-import', builder: (_, __) => const GpxImportScreen()),
      GoRoute(path: '/weather/:routeId', builder: (_, state) => WeatherScreen(routeId: state.pathParameters['routeId']!)),
      GoRoute(path: '/route-publish', builder: (_, __) => const RoutePublishScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    ],
  );
});
```

- [ ] **Step 2: Create app.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/theme_provider.dart';
import 'core/theme/kaipa_theme.dart';

class KaipaApp extends ConsumerWidget {
  const KaipaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Kaipa',
      theme: KaipaTheme.build(tokens),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}

class AppShell extends ConsumerWidget {
  final Widget child;
  const AppShell({required this.child, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: child,
      bottomNavigationBar: const KaipaBottomNav(),
    );
  }
}
```

- [ ] **Step 3: Update main.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app.dart';
import 'core/theme/theme_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL', defaultValue: 'http://localhost:54321'),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: 'your-anon-key'),
  );

  final prefs = await SharedPreferences.getInstance();

  runApp(
    ProviderScope(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
      ],
      child: const KaipaApp(),
    ),
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add kaipa_app/lib/main.dart kaipa_app/lib/app.dart kaipa_app/lib/core/router/
git commit -m "feat: add app shell with GoRouter navigation and Riverpod setup"
```

---

## Task 7: Auth Feature — Login Screen

**Files:**
- Create: `kaipa_app/lib/features/auth/presentation/login_screen.dart`
- Create: `kaipa_app/lib/features/auth/data/auth_repository.dart`
- Create: `kaipa_app/lib/features/auth/domain/user_model.dart`

Reference: No direct prototype screen — this is new for the real app. Design it in the Kaipa style: clean, minimal, glass morphism, nature-themed.

- [ ] **Step 1: Build login screen**

Email/password login with:
- Kaipa logo/title at top
- Email text field
- Password text field
- "登录" (Login) button with flare accent
- "注册" (Register) link below
- "跳过" (Skip / Demo mode) option that auto-logs in as demo user
- Glass-container styled cards
- Background with subtle terrain gradient

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/auth/
git commit -m "feat: add auth feature — login screen with demo mode"
```

---

## Task 8: Discover Feature — Map Screen + Search Screen

**Files:**
- Create: `kaipa_app/lib/features/discover/presentation/map_screen.dart`
- Create: `kaipa_app/lib/features/discover/presentation/search_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screen-map.jsx` for MapScreen layout.
Reference: `/home/coder/workspaces/kaipa/screens-new.jsx` lines 37-170 for SearchScreen.

- [ ] **Step 1: Build map_screen.dart**

Port `ScreenMap` from screen-map.jsx:
- Full-bleed map using `flutter_map` with OpenStreetMap tiles
- Floating glass search bar at top with search icon + "探索路线" placeholder
- Filter pills below: 全部, 入门, 中等, 困难, 附近
- Bottom sheet with route cards (pulled from Supabase via routeRepositoryProvider)
- Tap search bar → navigate to /discover/search
- Tap route card → navigate to /discover/route/:id
- Center map on Beijing area (lat: 40.3, lng: 116.5) with route markers

- [ ] **Step 2: Build search_screen.dart**

Port `ScreenSearch` from screens-new.jsx lines 37-170:
- Back button + search input field (pre-filled with "北京 周末 一日")
- Horizontal filter pills: 全部, 入门, 中等, 困难, 50km内
- Sort row: "找到 N 条线路" + sort selector
- Scrollable list of route cards, each showing:
  - MiniMap thumbnail (left)
  - Route name, region, distance, elevation, duration, difficulty badge, rating
- All data from `routeRepositoryProvider`
- Filter by difficulty via `getRoutes(difficulty: filter)`
- Tap card → navigate to /discover/route/:id

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/discover/
git commit -m "feat: add discover feature — map screen and search screen"
```

---

## Task 9: Route Detail Feature

**Files:**
- Create: `kaipa_app/lib/features/route_detail/presentation/route_detail_screen.dart`
- Create: `kaipa_app/lib/features/route_detail/presentation/widgets/elevation_profile.dart`

Reference: `/home/coder/workspaces/kaipa/screen-route.jsx` for full layout.

- [ ] **Step 1: Build route_detail_screen.dart**

Port `ScreenRouteDetail` from screen-route.jsx:
- Hero map section (top 360px) with trail map + gradient fade
- Back button + heart (favorite) + share buttons floating on map
- Region + route name heading (大字标题, e.g., "箭扣长城")
- Subtitle (e.g., "西栅子 → 九眼楼 · 野长城段")
- Stats grid: 4 columns — distance (km), elevation (m), duration, difficulty
- Tag pills row: DiffBadge + route tags
- Elevation profile chart (custom paint): line chart from elevationProfile data
- Photo spots section: numbered list with km markers
- Access method section: how to reach trailhead
- Reviews section: user reviews from reviewRepositoryProvider
- Bottom CTA: "开始导航" button → navigate to /navigate/:routeId
- All data from `routeRepositoryProvider.getRouteById(routeId)`

- [ ] **Step 2: Build elevation_profile.dart**

Custom paint widget that draws:
- Filled area chart from elevation profile data points
- X axis = distance (km), Y axis = elevation (m)
- Gradient fill from flare color
- Grid lines for reference

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/route_detail/
git commit -m "feat: add route detail screen with elevation profile"
```

---

## Task 10: Gear Feature — 4 Screens

**Files:**
- Create: `kaipa_app/lib/features/gear/presentation/gear_library_screen.dart`
- Create: `kaipa_app/lib/features/gear/presentation/gear_category_screen.dart`
- Create: `kaipa_app/lib/features/gear/presentation/gear_item_detail_screen.dart`
- Create: `kaipa_app/lib/features/gear/presentation/gear_pick_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-other.jsx` for all gear screens.

- [ ] **Step 1: Build gear_library_screen.dart**

Port `ScreenGearLibrary` from screens-other.jsx:
- Title: "装备库"
- Summary stats row: total items, total weight, total value
- Category grid: 2-column grid of gear categories with icon + name + item count
- Each category card tappable → /gear/category/:id
- "添加装备" FAB button
- Data from gearRepositoryProvider

- [ ] **Step 2: Build gear_category_screen.dart**

Port `ScreenGearCategory`:
- Back button + category name title
- List of gear items in this category
- Each item: name, brand, weight, condition badge
- Tap → /gear/item/:id

- [ ] **Step 3: Build gear_item_detail_screen.dart**

Port `ScreenGearItemDetail`:
- Full item card with photo placeholder, name, brand
- Specs: weight, price, condition, purchase date
- Notes section
- Edit/Delete buttons

- [ ] **Step 4: Build gear_pick_screen.dart**

Port `ScreenGearPick` from screens-other.jsx:
- Title: "装备选择" with route context (e.g., for 箭扣长城)
- AI Smart Pack card at top (UI only, shows the card from AISmartPackCard)
- Warnings section: weather warnings, missing gear alerts
- Category-grouped checklist of gear items with checkboxes
- Bottom: selected count + total weight summary
- Data from gearRepositoryProvider + routeRepositoryProvider for context

- [ ] **Step 5: Commit**

```bash
git add kaipa_app/lib/features/gear/
git commit -m "feat: add gear feature — library, category, item detail, pick screens"
```

---

## Task 11: Navigation Feature — Navigate + HUD Screens

**Files:**
- Create: `kaipa_app/lib/features/navigation/presentation/navigate_screen.dart`
- Create: `kaipa_app/lib/features/navigation/presentation/navigate_hud_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-other.jsx` for ScreenNavigate.
Reference: `/home/coder/workspaces/kaipa/screens-final.jsx` lines 6-200 for ScreenNavigateHUD.

- [ ] **Step 1: Build navigate_screen.dart**

Simplified navigation page:
- Full-bleed map with trail overlay
- Route info bar at top
- Stats: distance remaining, elevation remaining, ETA
- "开始" (Start) button → /navigate-hud/:routeId

- [ ] **Step 2: Build navigate_hud_screen.dart**

Port `ScreenNavigateHUD` from screens-final.jsx:
- Full-bleed map background
- Top route ribbon (glass): back button, "进行中 · 02:14:33", route name, companion count
- Right rail: zoom +/-, center, layers buttons
- Left panel: live elevation strip (ELEV) + current altitude (NOW)
- Bottom card (glass):
  - Next waypoint with distance + ETA
  - Stats row: distance done, elevation done, avg speed
  - Pause + SOS buttons
- SOS button: red, prominent, triggers emergency flow
- Timer ticks using Timer.periodic for elapsed time display

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/navigation/
git commit -m "feat: add navigation feature — navigate and HUD screens"
```

---

## Task 12: Trip Feature — Trip Complete Screen

**Files:**
- Create: `kaipa_app/lib/features/trip/presentation/trip_complete_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-final.jsx` for ScreenTripComplete.

- [ ] **Step 1: Build trip_complete_screen.dart**

Port `ScreenTripComplete`:
- Confetti/celebration header
- Route name + completion time
- Stats grid: distance, elevation, duration, avg speed, calories, steps
- Elevation replay mini chart
- Achievements unlocked section (badges)
- Photo timeline placeholder
- "Wrapped" sharing card (glass, gradient, shareable summary)
- Rate this route (1-5 stars)
- "完成" (Done) button → back to discover
- Data from tripRepositoryProvider.getTripById(tripId)

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/trip/
git commit -m "feat: add trip complete screen with stats and achievements"
```

---

## Task 13: GPX Import Feature

**Files:**
- Create: `kaipa_app/lib/features/gpx/presentation/gpx_import_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screen-gpx-import.jsx` for the 3-step flow.

- [ ] **Step 1: Build gpx_import_screen.dart**

Port `ScreenGPXImport` — 3-step wizard:
- Step 1 - Source: Pick file source (文件, Strava, Apple Watch, Garmin)
  - File picker integration
- Step 2 - Preview: Show parsed route on map + stats (distance, elevation, duration)
  - Parse GPX XML, extract track points
- Step 3 - Save: Name the route, add difficulty tag, description
  - Save to Supabase via routeRepository
- Step indicator at top (1/2/3 dots)
- Back/Next navigation between steps

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/gpx/
git commit -m "feat: add GPX import feature — 3-step import wizard"
```

---

## Task 14: Social Feature — Feed Screen

**Files:**
- Create: `kaipa_app/lib/features/social/presentation/feed_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-new.jsx` for ScreenFeed.

- [ ] **Step 1: Build feed_screen.dart**

Port `ScreenFeed`:
- Title: "动态"
- Feed list with cards for each activity type:
  - trip_completed: user avatar + "完成了 [route]" + stats summary + mini-map
  - route_published: user + "发布了新路线 [route]" + preview
  - achievement_earned: user + badge icon + achievement name
  - review_posted: user + route name + rating stars + review snippet
- Each card: glass container, user avatar, timestamp (relative), action text
- Pull-to-refresh
- Data from feedRepositoryProvider

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/social/
git commit -m "feat: add social feed screen"
```

---

## Task 15: Profile Feature

**Files:**
- Create: `kaipa_app/lib/features/profile/presentation/profile_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-other.jsx` for ScreenProfile / ScreenProfilePlus.

- [ ] **Step 1: Build profile_screen.dart**

Port `ScreenProfilePlus`:
- User avatar + display name + bio
- Stats row: total distance, total elevation, total trips
- Achievement badges row (horizontal scroll)
- Recent trips list (last 3-5 trips with route name, date, stats)
- Action buttons: 设置, 通知, GPX导入
- Settings icon → /settings
- Bell icon → /notifications
- Data from profileRepositoryProvider + tripRepositoryProvider

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/profile/
git commit -m "feat: add profile screen with stats and achievements"
```

---

## Task 16: Notifications Feature

**Files:**
- Create: `kaipa_app/lib/features/notifications/presentation/notifications_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-final.jsx` for ScreenNotifications.

- [ ] **Step 1: Build notifications_screen.dart**

Port `ScreenNotifications`:
- Title: "通知" with unread count badge
- Filter tabs: 全部, 天气, 社交, 成就, 系统
- Grouped by time: 今天, 昨天, 更早
- Each notification card:
  - Icon by type (weather=cloud, social=users, achievement=star, system=bell, safety=shield)
  - Title + body text
  - Timestamp (relative)
  - Unread indicator (dot)
  - Tap to mark as read
- Data from notificationRepositoryProvider

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/notifications/
git commit -m "feat: add notifications screen with type filtering"
```

---

## Task 17: Settings Feature

**Files:**
- Create: `kaipa_app/lib/features/settings/presentation/settings_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-final.jsx` for ScreenSettings.

- [ ] **Step 1: Build settings_screen.dart**

Port `ScreenSettings`:
- Title: "设置"
- Theme section:
  - Light/Dark mode toggle (with sun/moon icons)
  - 6 color preset buttons (meadow, moss, citrus, ember, peach, lake) in a grid
  - Custom accent color picker
  - Live preview of color changes
- Account section: 用户名, 邮箱, 修改密码
- General section: 通知开关, 离线地图, 计量单位
- About section: 版本号, 隐私政策, 使用条款
- 退出登录 (Logout) button at bottom
- Theme changes persisted via themePrefsProvider

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/settings/
git commit -m "feat: add settings screen with theme customization"
```

---

## Task 18: Onboarding Feature

**Files:**
- Create: `kaipa_app/lib/features/onboarding/presentation/onboarding_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-final.jsx` for ScreenOnboarding.

- [ ] **Step 1: Build onboarding_screen.dart**

Port `ScreenOnboarding` — 3-step first-run flow:
- Step 1 - Welcome: Kaipa logo, "探索每一座山" tagline, nature illustration, "开始" button
- Step 2 - Difficulty: "你的徒步经验" title, 4 selectable cards (入门/中等/困难/专家) with descriptions
- Step 3 - Permissions: Location + notifications permission requests with explanation
- Page indicator dots at bottom
- Swipe or button to advance
- On complete: save difficulty_preference to profile, navigate to /discover

- [ ] **Step 2: Commit**

```bash
git add kaipa_app/lib/features/onboarding/
git commit -m "feat: add 3-step onboarding flow"
```

---

## Task 19: Weather Screen + Route Publish Screen

**Files:**
- Create: `kaipa_app/lib/features/discover/presentation/weather_screen.dart`
- Create: `kaipa_app/lib/features/discover/presentation/route_publish_screen.dart`

Reference: `/home/coder/workspaces/kaipa/screens-new.jsx` for ScreenWeather.
Reference: `/home/coder/workspaces/kaipa/screens-final.jsx` for ScreenRoutePublish.

- [ ] **Step 1: Build weather_screen.dart**

Port `ScreenWeather`:
- Route name + region at top
- Current conditions card: temp, humidity, wind, UV
- Hourly forecast (horizontal scroll)
- Multi-day forecast list
- Elevation-based weather breakdown (base camp vs. summit)
- Safety warnings if applicable
- Data: use seed weather data stored in route's weather_summary or generate static demo data from DB

- [ ] **Step 2: Build route_publish_screen.dart**

Port `ScreenRoutePublish`:
- Title: "发布路线"
- Route name text field
- Description text area
- Difficulty selector (4 options)
- Tags input (pill-style)
- Photo upload section (placeholder)
- Map preview of the route
- "发布" (Publish) button
- Creates route in Supabase + feed_item

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/discover/presentation/weather_screen.dart
git add kaipa_app/lib/features/discover/presentation/route_publish_screen.dart
git commit -m "feat: add weather screen and route publish screen"
```

---

## Task 20: Integration — Wire Everything Together & Verify Build

**Files:**
- Modify: `kaipa_app/lib/core/router/app_router.dart` (add all imports)
- Modify: `kaipa_app/lib/app.dart` (finalize)

- [ ] **Step 1: Verify all imports resolve**

```bash
export PATH="/home/coder/flutter-sdk/bin:$PATH"
cd /home/coder/workspaces/kaipa/kaipa_app
dart analyze
```

Fix any import errors, missing references, type mismatches.

- [ ] **Step 2: Run Flutter web build**

```bash
export PATH="/home/coder/flutter-sdk/bin:$PATH"
cd /home/coder/workspaces/kaipa/kaipa_app
flutter build web
```

Fix any compilation errors.

- [ ] **Step 3: Start dev server**

```bash
export PATH="/home/coder/flutter-sdk/bin:$PATH"
cd /home/coder/workspaces/kaipa/kaipa_app
flutter run -d web-server --web-port 8080 --web-hostname 0.0.0.0
```

- [ ] **Step 4: Final commit**

```bash
cd /home/coder/workspaces/kaipa
git add kaipa_app/
git commit -m "feat: complete Kaipa Flutter app — all 18 screens with Supabase integration"
```
