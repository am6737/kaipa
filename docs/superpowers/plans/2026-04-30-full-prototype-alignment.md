# Full Prototype Alignment — Flutter App ↔ Design Prototypes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align every Flutter screen pixel-perfectly with the JSX design prototypes across all 7 categories.

**Architecture:** Each task modifies one Flutter screen file to match its JSX prototype counterpart. Changes are purely visual/structural — no backend or state management changes. Every screen follows the existing KaipaTokens theme system.

**Tech Stack:** Flutter/Dart, Riverpod, FlutterMap, CustomPaint

---

## Reference: Prototype ↔ Flutter File Mapping

| Category | Prototype Screen | Flutter File |
|----------|-----------------|--------------|
| 1. Discover+Search | `screen-map.jsx:ScreenMap` | `map_screen.dart` |
| 1. Discover+Search | `screens-new.jsx:ScreenSearch` | `search_screen.dart` |
| 2. Tab Bar | `screen-map.jsx:TabBar+DepartureSheet` | `bottom_nav_bar.dart` |
| 3. GPX Import | `screen-gpx-import.jsx:ScreenGPXImport` | `gpx_import_screen.dart` |
| 4. Immersive Mode | `screen-map.jsx:ScreenMap(immersive)` | `map_screen.dart` (already done) |
| 5. Trip Flow — Route Detail | `screen-route.jsx:ScreenRouteDetail` | `route_detail_screen.dart` |
| 5. Trip Flow — Gear Pick | `screens-other.jsx:ScreenGearPick` | `gear_pick_screen.dart` |
| 5. Trip Flow — Weather | `screens-new.jsx:ScreenWeather` | `weather_screen.dart` |
| 5. Trip Flow — Confirm | `screens-new.jsx:ScreenConfirm` | (new or weather_screen.dart) |
| 5. Trip Flow — Navigate | `screens-other.jsx:ScreenNavigate` | `navigate_screen.dart` |
| 5. Trip Flow — Navigate HUD | `screens-final.jsx:ScreenNavigateHUD` | `navigate_hud_screen.dart` |
| 5. Trip Flow — Trip Complete | `screens-final.jsx:ScreenTripComplete` | `trip_complete_screen.dart` |
| 6. Gear+Profile — Library | `screens-other.jsx:ScreenGearLibrary` | `gear_library_screen.dart` |
| 6. Gear+Profile — Category | `screens-other.jsx:ScreenGearCategory` | `gear_category_screen.dart` |
| 6. Gear+Profile — Item Detail | `screens-other.jsx:ScreenGearItemDetail` | `gear_item_detail_screen.dart` |
| 6. Gear+Profile — Profile | `screens-other.jsx:ScreenProfile` | `profile_screen.dart` |
| 6. Gear+Profile — Feed | `screens-new.jsx:ScreenFeed` | `feed_screen.dart` |
| 7. Onboarding | `screens-final.jsx:ScreenOnboarding` | `onboarding_screen.dart` |
| Settings | `screens-final.jsx:ScreenSettings` | `settings_screen.dart` |
| Notifications | `screens-final.jsx:ScreenNotifications` | `notifications_screen.dart` |
| Route Publish | `screens-final.jsx:ScreenRoutePublish` | `route_publish_screen.dart` |
| Login | (no prototype) | `login_screen.dart` |

---

## Category 1: 发现 + 搜索

### Task 1: Map Screen — Region/Trail View Alignment

**Files:**
- Modify: `lib/features/discover/presentation/map_screen.dart`

**Reference:** `prototype/screen-map.jsx:ScreenMap`

**Key gaps to fix:**
- Search bar: Prototype has Glass pill (height 46, radius 999) with search icon + placeholder text + profile button beside it. Flutter may not match exact sizing/styling.
- Filter chips: Prototype uses `<Pill active>附近 12km</Pill>` etc. — active pill has flare background. Flutter uses dropdown filter instead of horizontal pills.
- Right-side controls: Prototype has zoom-level toggle (globe/region/trail icons in vertical Glass pill) + layers button + navigate button. Flutter has zoom +/- instead.
- Bottom route preview card: Prototype has Glass card with difficulty color stripe on left, route name, DiffBadge, rating, user count, "查看路线→" button + bookmark button. Flutter may differ.
- Featured route card (no active pin): Prototype has large Glass card with route name (26px), distance/difficulty, mini elevation strip SVG, "查看完整路线" button.
- GPX import FAB: Prototype has upload FAB on region view (right side, bottom 220).

- [ ] **Step 1:** Replace filter dropdown with horizontal filter pill chips matching prototype (`附近 12km`, `T1—T2`, `一日往返`, `有水源`, `看日出`). Use GlassContainer with radius 999, active pill gets flare background.

- [ ] **Step 2:** Update search bar to height 46, radius 999, add profile CircleButton beside it. Placeholder changes based on map mode.

- [ ] **Step 3:** Replace zoom +/- controls with 3-level zoom selector (globe/region/trail icons in vertical glass container, radius 14, padding 4, each item 36px height). Add layers button and navigate button below.

- [ ] **Step 4:** Update active route preview card: Add 4px difficulty color stripe on left side. Add DiffBadge + rating + user count row. Replace action area with "查看路线→" button + bookmark button.

- [ ] **Step 5:** Update featured route card (no active pin state): Route name at 26px bold, add subtitle "距离你 X 公里", add mini elevation strip SVG (50px height, with gradient fill), add "查看完整路线" CTA button with navigate icon.

- [ ] **Step 6:** Add GPX import FAB on region view — 56px circle, flare background, upload icon, positioned right:16, bottom:220.

- [ ] **Step 7:** Add globe view support with dark theme Glass containers, featured destinations pill strip, and globe bottom sheet ("本月热门 · TRENDING" with destination cards).

- [ ] **Step 8:** Commit: `feat(map): align map screen with design prototype`

### Task 2: Search Screen Alignment

**Files:**
- Modify: `lib/features/discover/presentation/search_screen.dart`

**Reference:** `prototype/screens-new.jsx:ScreenSearch`

**Key gaps to fix:**
- Search bar: Prototype has back CircleBtn + search input (height 40, radius 12, with search icon + query text + result count "32 条" right-aligned in mono font).
- Filter pills: Prototype has `全部/入门/中等/困难/50km内` + `筛选` button with layers2 icon. Active pill: flareSoft bg, flare text, flare border.
- Sort row: "找到 32 条线路 · 距你 0–80km" left, "最近 >" right.
- Result cards: Prototype has 96×96 MiniMap on left, route name (15px bold), region + distance, stats in mono font (km, ↑m, duration), DiffBadge, rating "★ 4.7" in flare color.

- [ ] **Step 1:** Update search bar layout: CircleBtn back button (not icon button), search input at height 40, radius 12, with surface background + line border, result count at right in mono font.

- [ ] **Step 2:** Update filter chips: Replace with prototype's pill style — padding `7px 14px`, radius 999, active gets flareSoft bg + flare text + flare border. Add "筛选" button with layers2 icon at end.

- [ ] **Step 3:** Update sort row: "找到 X 条线路 · 距你 0–80km" on left, "最近 >" on right with forward icon.

- [ ] **Step 4:** Update result cards: 96×96 MiniMap on left (borderRadius 10), name at 15px bold, region + distance below, stats row in mono font, DiffBadge at bottom left, rating "★ X.X" at top right in flare color.

- [ ] **Step 5:** Commit: `feat(search): align search screen with design prototype`

---

## Category 2: Tab Bar · 探索 → 出发

### Task 3: Bottom Nav Bar + Departure Sheet

**Files:**
- Modify: `lib/core/widgets/bottom_nav_bar.dart`

**Reference:** `prototype/screen-map.jsx:TabBar+DepartureSheet`

**Key gaps to fix:**
- Tab bar: Glass pill 280×60, radius 999, horizontal padding 28px. Left tab = backpack icon + "装备", Right = user icon + "我". Active tab gets flareSoft background.
- Center button: 50px normally, scales to 54px when departing. Icon changes compass→hiker. Label changes "探索"→"出发". Shadow glow when departing. Spring animation.
- Departure sheet: Half-modal from bottom with AI input (sparkle icon, placeholder, mic button with flareSoft circle), example chips, "今天适合去" section with weather, recommendation cards (mini map + route name + tag + "选这条→" button).

- [ ] **Step 1:** Update tab icon sizes and labels to match prototype. Left: backpack icon size 20, label "装备" at fontSize 10. Right: user icon size 20, label "我".

- [ ] **Step 2:** Update center FAB: Normal 50px → departing 54px. Use cubic-bezier(0.34, 1.56, 0.64, 1) for animation. Shadow when departing: `0 6px 18px flare*0.66`. Label font: 8.5px bold, letterSpacing 0.3.

- [ ] **Step 3:** Create DepartureSheet widget as bottom sheet overlay. Include: drag handle (36×4px), AI input row (sparkle + placeholder + mic button), example chips (3), "今天适合去" header with sun icon + weather text, recommendation cards (3, horizontally scrollable).

- [ ] **Step 4:** Commit: `feat(nav): align tab bar and add departure sheet`

---

## Category 3: GPX 导入流程

### Task 4: GPX Import Screen — Full 3-Step Rewrite

**Files:**
- Modify: `lib/features/gpx/presentation/gpx_import_screen.dart`

**Reference:** `prototype/screen-gpx-import.jsx:ScreenGPXImport`

**Key gaps to fix:**
- Header: Back button (36px circle, surfaceHi bg) + title "导入 GPX 路线" + subtitle. Step indicator with circles + connecting lines (done=flare+check, current=flare border, pending=surfaceHi).
- Step 1: Drag-drop zone (180px, dashed flare border, flareSoft bg, 56px white circle with upload icon). Source buttons (4: 佳明 Connect, 本机文件, 两步路, Strava) with 38×38 icon circles.
- Step 2: File info bar (GPX badge, filename, size, "已识别" green badge). Map preview (180px, terrain bg, track line, start/end points). Stats grid (4 columns). Elevation profile SVG. Validation checklist (check/alert icons).
- Step 3: Form fields (route name input, region button, type pills, difficulty slider with T1-T5, visibility radio group, notes textarea).
- Footer: Previous + CTA buttons at bottom with gradient fade.

- [ ] **Step 1:** Rewrite GPX header: CircleBtn back button + title/subtitle + 3-step indicator with circles (22px), connecting lines, labels ("上传文件 · 预览校验 · 命名保存").

- [ ] **Step 2:** Rewrite Step 1 — Upload: Drag-drop zone at 180px height, dashed flare border (1.5px), flareSoft background. 56px white circle with upload icon + shadow. Title "拖入或选择 .gpx 文件" at 15px bold. Subtitle ".gpx · .tcx · .fit · .kml". Section label "或从这些来源导入". Source buttons (4 cards with 38×38 icon circles).

- [ ] **Step 3:** Rewrite Step 2 — Preview: File info bar with 32px flareSoft circle containing "GPX" text, filename, size, "已识别" green badge. Map preview with CustomPaint (terrain bg, contour lines, track path, start/end circles with labels). Stats grid (4 columns: distance/elevation/duration/speed). Elevation profile with CustomPaint (gradient fill, line stroke, peak marker). Validation checklist (4 items with check/alert icons).

- [ ] **Step 4:** Rewrite Step 3 — Save: Route name input field. Region button with navigate icon + forward arrow. Type pills (5: 徒步/登山/越野跑/骑行/溯溪, first selected). Difficulty with T2 badge + progress bar (T1-T5). Visibility radio group (3 options with icons + descriptions). Notes textarea.

- [ ] **Step 5:** Add footer CTA with gradient fade background, "上一步" button (step>0), primary CTA button.

- [ ] **Step 6:** Commit: `feat(gpx): rewrite GPX import to match design prototype`

---

## Category 5: 出发流程

### Task 5: Route Detail Screen Alignment

**Files:**
- Modify: `lib/features/route_detail/presentation/route_detail_screen.dart`

**Reference:** `prototype/screen-route.jsx:ScreenRouteDetail`

**Key gaps to fix:**
- Hero map: 360px height with gradient fade to bg at bottom. Top chrome: CircleBtn back + heart (flare color) + share.
- Content: Region "北京 · 怀柔区" (11px), title "箭扣长城" (32px bold), subtitle (14px muted).
- Stats card: 4-column grid, surface bg, radius 18, border, shadow. Uses `<Stat>` component.
- Tags row: DiffBadge + Pill components ("野长城", "非景区", "暴露段", "需手脚并用").
- Elevation profile: Section with full SVG chart (grid lines, gradient fill, line stroke, start/peak/end markers).
- Getting there: 3 access rows with icon circles (38×38, mossSoft bg), dividers.
- Gear grid: 4×2 grid with 52×52 icon boxes (surfaceHi bg, radius 14), last one dashed "更多".
- Photo spots: Horizontal scroll of 140×180 cards with PhotoStripe bg, gradient overlay, spot info.
- Reviews: User avatar (32px circle, mossSoft), name/date, rating stars.
- Sticky CTA: "准备出发 · 选择装备" button with navigate icon, gradient fade bg.

- [ ] **Step 1:** Update hero section: height to 360px, gradient fade. Top buttons as CircleBtn glass buttons.

- [ ] **Step 2:** Update content layout: Region at 11px, title at 32px bold, subtitle at 14px muted.

- [ ] **Step 3:** Update stats card: 4-column grid, surface bg, radius 18, border + shadow.

- [ ] **Step 4:** Add tags row with DiffBadge + Pill widgets.

- [ ] **Step 5:** Update elevation profile section with proper SVG-style CustomPaint (grid lines, gradient fill, stroke, 3 markers).

- [ ] **Step 6:** Add "如何抵达" section with 3 AccessRow items (icon in 38×38 mossSoft circle, title + badge + detail, forward icon).

- [ ] **Step 7:** Add "推荐装备" section: 4×2 grid of 52×52 icon boxes, last one dashed.

- [ ] **Step 8:** Update "拍照打卡" section: Horizontal scroll of 140×180 cards with terrain gradient bg, dark gradient overlay, spot name + distance.

- [ ] **Step 9:** Update "走过的人" reviews section: 32px avatar circles, user/date/rating layout.

- [ ] **Step 10:** Update sticky CTA: "准备出发 · 选择装备" with navigate icon, gradient fade background.

- [ ] **Step 11:** Commit: `feat(route): align route detail with design prototype`

### Task 6: Gear Pick Screen Alignment

**Files:**
- Modify: `lib/features/gear/presentation/gear_pick_screen.dart`

**Reference:** `prototype/screens-other.jsx:ScreenGearPick`

**Key gaps to fix:**
- Header: Close CircleBtn + "第 1 步 / 共 3 步" + ellipsis. Route context line. Title "选择今天带哪些装备" at 28px bold.
- AI Smart Pack card: Gradient bg (flareSoft→surface), decorative rays SVG, sparkle icon in 32px flare circle, "AI 智能搭配" + BETA badge, reasoning bullets (ok/warn/alert tones with colored dots), mini metrics grid (4 items), action buttons.
- Warning stack: Alert (red bg, "!" circle) and warn (orange bg) cards with title + body text.
- Gear categories: Section headers "鞋履 · Footwear" etc. Items in surface container with border. Each item: 40×40 icon circle (mossSoft/red), name + badges ("推荐" in flareSoft, "装备库缺" in red), specs, checkbox or "借/购" buttons for missing items.
- CTA: Dynamic text based on warnings.

- [ ] **Step 1:** Rewrite header to match prototype: Close button, step indicator, route context, title.

- [ ] **Step 2:** Add AI Smart Pack card widget with states (idle/analyzing/applied). Include decorative gradient bg, sparkle icon, status badge, reasoning bullets, mini metrics grid, action buttons.

- [ ] **Step 3:** Add warning stack component: Alert (red) and warn (orange) severity levels with "!" icon circle, colored title, body text.

- [ ] **Step 4:** Rewrite gear list: Category headers (13px bold), items in surface containers. Each item: 40×40 icon circle, name + "推荐"/"装备库缺" badges, specs text, checkbox (24px circle, flare when on) or "借/购" buttons for missing items.

- [ ] **Step 5:** Update CTA button: Dynamic text ("请先解决 X 个红色警告" disabled gray / "了解风险，仍要继续 →" / "下一步 · 天气与时间").

- [ ] **Step 6:** Commit: `feat(gear-pick): align gear pick with design prototype`

### Task 7: Weather Screen Alignment

**Files:**
- Modify: `lib/features/discover/presentation/weather_screen.dart`

**Reference:** `prototype/screens-new.jsx:ScreenWeather`

**Key gaps to fix:**
- Header: Back button + "第 2 步 / 共 3 步" + ellipsis. Route name. Title "选择出发时间" at 26px bold.
- Score card: 64px circle with score "87" + "分", gradient bg (flareSoft→surface), "非常适合出行" title, weather detail text.
- 3-day forecast: Surface container, 3 rows with weather icon, date, temp range (mono), description, score (colored: flare if >70, mod if >50, dim if <50). Selected row: flareSoft bg.
- Sun chart: SVG with quadratic curve (sunrise→sunset arc), gradient fill (water→flare→water), recommended departure marker.
- CTA: "下一步 · 安全确认" with forward icon.

- [ ] **Step 1:** Rewrite weather screen header matching prototype layout.

- [ ] **Step 2:** Add score card: 64px circle with border (2px flare), score number (22px bold), gradient background.

- [ ] **Step 3:** Add 3-day forecast table in surface container with proper row styling and score colors.

- [ ] **Step 4:** Add sun chart with CustomPaint: quadratic bezier arc, gradient fill, recommended departure marker.

- [ ] **Step 5:** Update CTA button: "下一步 · 安全确认" with gradient fade background.

- [ ] **Step 6:** Commit: `feat(weather): align weather screen with design prototype`

### Task 8: Navigate Screen Alignment

**Files:**
- Modify: `lib/features/navigation/presentation/navigate_screen.dart`

**Reference:** `prototype/screens-other.jsx:ScreenNavigate`

**Key gaps to fix:**
- Top HUD: Glass card with status dot (8px flare circle) + "进行中 · 02:14:33" + route name. 4-column stats grid below divider.
- Next waypoint card: 50×50 icon box (flareSoft bg, flare border), "下一个 · 340 米", waypoint name, elevation detail.
- Bottom action bar: Camera CircleBtn (56px) + "暂停" pill button (flex 1, 56px height, flare bg) + bell CircleBtn (56px).

- [ ] **Step 1:** Update top HUD to Glass card with status indicator + time + route name + 4-column stats.

- [ ] **Step 2:** Add next waypoint card: 50×50 icon box with flareSoft bg and flare border, waypoint info.

- [ ] **Step 3:** Update bottom action bar: Camera (56px) + pause pill (flare bg, full width) + bell (56px).

- [ ] **Step 4:** Commit: `feat(navigate): align navigate screen with design prototype`

### Task 9: Navigate HUD Screen Alignment

**Files:**
- Modify: `lib/features/navigation/presentation/navigate_hud_screen.dart`

**Reference:** `prototype/screens-final.jsx:ScreenNavigateHUD`

**Key gaps to fix:**
- Top ribbon: Glass card (radius 18) with back CircleBtn (32px), status line (6px flare dot + "进行中 · 02:14:33"), route name (13px bold), participant badge (mossSoft bg, users icon + count).
- Right rail: 3 separate Glass pills — zoom (+/−) (radius 14), navigate (flare color), layers.
- Left panel: Glass pill with "ELEV" label (9px mono), elevation strip sparkline SVG (56×38), range "0 — 11.4", "NOW" + current elevation "1312m".
- Bottom card: Glass (radius 20), next waypoint (44×44 icon box), "NEXT · 340m · 右后方" (10px mono), waypoint name. 4-column stats. Action row: "暂停" + "打卡" buttons (surfaceHi bg) + SOS button (46px, red, "SOS" text).

- [ ] **Step 1:** Update top ribbon: Glass container with back button (32px), status dot + time, route name, participant count badge.

- [ ] **Step 2:** Update right rail: 3 separate Glass pills (zoom, navigate, layers) with proper sizing.

- [ ] **Step 3:** Update left elevation panel: "ELEV" mono label, sparkline SVG (CustomPaint), range text, "NOW" divider, current elevation.

- [ ] **Step 4:** Update bottom card: Next waypoint (44×44 icon box with flareSoft bg + flare border), mono labels, waypoint name. 4-column stats with divider. Action row: pause + camera buttons (surfaceHi, 46px height, radius 14) + SOS button (46px square, red #C0392B, "SOS" text 11px bold).

- [ ] **Step 5:** Commit: `feat(navigate-hud): align HUD with design prototype`

### Task 10: Trip Complete Screen Alignment

**Files:**
- Modify: `lib/features/trip/presentation/trip_complete_screen.dart`

**Reference:** `prototype/screens-final.jsx:ScreenTripComplete`

**Key gaps to fix:**
- Hero: 300px gradient (mossDeep→flare with cc opacity). Decorative trail SVG (white, dashed + solid paths, 0.12 opacity). Bottom gradient fade. Check icon in 52px glass circle. "行程完成" label (12px, uppercase, white, letterSpacing 1). Route name (28px white bold). Date/time info.
- Stats card: Overlapping (-40px margin), surface bg, radius 20, shadow. 4-column stats (24px bold values). Mini elevation profile SVG with gradient + line + start/end markers. Range labels "730m起点 | 1410m最高 | 1180m终点".
- Achievements: 4-column grid, aspect ratio 1:1, radius 16. Unlocked: flareSoft icon circle + flare icon. Locked: 0.4 opacity.
- Photo timeline: Horizontal scroll, 130×170 cards with PhotoStripe bg, dark gradient overlay, time badge (glass dark, top), spot name (bottom).
- Share section: "KAIPA WRAPPED" gradient card (mossDeep→flare). Share + save buttons (grid 1fr 1fr).
- Rate section: 5 star circles (36px, flareSoft if filled, lineSoft if not), textarea.
- Bottom CTA: "完成 · 返回首页" with ink bg, bg text color.

- [ ] **Step 1:** Update hero: 300px gradient, decorative trail paths, bottom fade, centered content (check icon, label, route name, date).

- [ ] **Step 2:** Update stats card: -40px overlap, 4-column grid with 24px bold values + unit spans. Mini elevation profile CustomPaint. Range labels.

- [ ] **Step 3:** Update achievements: 4-column grid with aspect 1:1, radius 16, flareSoft icon circles, locked items at 0.4 opacity.

- [ ] **Step 4:** Update photo timeline: 130×170 cards with terrain gradient bg, dark gradient overlay, glass time badge, spot name.

- [ ] **Step 5:** Update share section: "KAIPA WRAPPED" gradient card. 2-column button grid (share flare + save outline).

- [ ] **Step 6:** Update rate section: 36px star circles + textarea placeholder.

- [ ] **Step 7:** Update bottom CTA: "完成 · 返回首页" with ink background.

- [ ] **Step 8:** Commit: `feat(trip-complete): align trip complete with design prototype`

---

## Category 6: 装备 + 我的

### Task 11: Gear Library Screen Alignment

**Files:**
- Modify: `lib/features/gear/presentation/gear_library_screen.dart`

**Reference:** `prototype/screens-other.jsx:ScreenGearLibrary`

**Key gaps to fix:**
- Header: "装备库" at 32px bold + CircleBtn plus icon with white color.
- Donut chart card: 136×136 SVG donut with 8 colored segments (gap between segments). Center text "44 件装备" (30px bold + 10px). Legend grid (2-column, 7px dots + category name + price). Stats row (3 columns: weight/value/categories). Alert banner (flare icon + text).
- Presets: "装备预设" section + "3 套". 3 horizontal cards (minWidth 150) with color dot, name (15px bold), spec text.
- Categories: 2-column grid with 36×36 mossSoft icon circles, category name (14.5px bold), count + weight info.

- [ ] **Step 1:** Update header: Title at 32px bold, plus button as CircleBtn with white color (flare bg).

- [ ] **Step 2:** Update donut chart card: Match 136×136 SVG dimensions, 8 colored segments with gaps, center text layout, 2-column legend with dots and prices, 3-column stats row, alert banner.

- [ ] **Step 3:** Update presets section: SectionTitle + horizontal scroll of cards with color dots, minWidth 150, proper spacing.

- [ ] **Step 4:** Update categories grid: 2-column, 36×36 icon circles (mossSoft bg), name at 14.5px bold, count + weight text. MinHeight 116.

- [ ] **Step 5:** Commit: `feat(gear-library): align gear library with design prototype`

### Task 12: Gear Category Screen Alignment

**Files:**
- Modify: `lib/features/gear/presentation/gear_category_screen.dart`

**Reference:** `prototype/screens-other.jsx:ScreenGearCategory`

**Key gaps to fix:**
- Header (sticky): Back button (36px circle, border, chevronLeft icon) + category name (17px bold) + item count/weight/price info (11px muted) + add button (36px flare circle).
- Filter chips: 6 chips ("全部 4", "使用中 2", "收藏 1", "雪线", "越野", "中帮"). Active chip: flareSoft bg, flare text. Others: surface bg, border.
- Sort row: "4 件 · 按使用次数" + grid/list toggle buttons (28×28, active gets flareSoft bg + flare icon).
- Item cards (list view): 12px padding, surface bg. Left: 84×84 gradient box with boot SVG silhouette + photo count badge (dark bg, camera icon + number). Right: Name (14px bold) + condition badge (colored pill, 9.5px bold) + subtitle (11.5px muted) + tags (pill badges) + stats row (weight | uses | divider).

- [ ] **Step 1:** Rewrite header: 36px back circle button (surface bg, line border, chevronLeft), category title (17px bold), summary info, 36px flare add button.

- [ ] **Step 2:** Add filter chips row matching prototype. Active: flareSoft bg + flare text, no border. Inactive: surface bg + line border.

- [ ] **Step 3:** Add sort row with item count + view toggle buttons (grid/list, 28×28).

- [ ] **Step 4:** Rewrite item cards: 84×84 gradient thumbnail (CustomPaint with boot silhouette), photo count badge. Name + condition badge (good=moss, worn=flare, new=#3D6A8C). Subtitle. Tags as small pills. Stats row in mono font with dividers.

- [ ] **Step 5:** Commit: `feat(gear-category): align gear category with design prototype`

### Task 13: Gear Item Detail Screen Alignment

**Files:**
- Modify: `lib/features/gear/presentation/gear_item_detail_screen.dart`

**Reference:** `prototype/screens-other.jsx:ScreenGearItemDetail`

**Key gaps to fix:**
- Photo carousel (380px, dark bg): Radial gradient background with boot SVG illustration. Top chrome: back/share/more as 38px white circles with shadow. Photo counter centered top. Page dots (active 18px wide). Thumbnail strip (52px pills with gradient bg, active has white border, labels at bottom). Add photo button (dashed border).
- Body: Title (24px bold) + condition badge (moss bg). Subtitle (13px muted). Tags as pills (surfaceHi bg + border). Stats grid (3 columns in surface container). Specs table (6 rows, key-value, mono font for price/weight). Notes section (13px, surface bg). Routes section with small route cards (28×28 flareSoft icon, name + date/km in mono).

- [ ] **Step 1:** Update photo carousel: 380px height, radial gradient bg, boot SVG (CustomPaint). Top buttons as 38px circles with white bg + shadow. Photo counter (dark pill, centered). Page dots (active 18px wide).

- [ ] **Step 2:** Add thumbnail strip at bottom of carousel: 52px gradient thumbnails with labels, active border, add button with dashed border.

- [ ] **Step 3:** Update body: Title (24px bold) + condition badge (pill, 10.5px, moss colors). Tags as pills with surfaceHi bg. Stats grid (3 columns in bordered container).

- [ ] **Step 4:** Update specs section: SectionTitle with "编辑" right text. 6 rows in bordered container, mono font for price/weight values.

- [ ] **Step 5:** Update routes section: SectionTitle with count. Small cards with 28×28 flareSoft icon circle, route name + date/km in mono.

- [ ] **Step 6:** Commit: `feat(gear-detail): align gear item detail with design prototype`

### Task 14: Profile Screen Alignment

**Files:**
- Modify: `lib/features/profile/presentation/profile_screen.dart`

**Reference:** `prototype/screens-other.jsx:ScreenProfile`

**Key gaps to fix:**
- Avatar: 68px circle with gradient (flare→sand), white text (26px bold), shadow.
- Name: 24px bold, "北京 · 走过 23 条线路" subtitle (12.5px muted). Ellipsis CircleBtn.
- Stats card: 4-column grid, surface bg, radius 18, border + shadow. Values from Stat component.
- Heatmap: "今年的足迹" + "42 次出行". 26 weeks × 7 days grid. 5 intensity levels (lineSoft, moss+35, moss+70, moss, flare). Month labels.
- Badges: "徽章" + "6 / 24". 4-column grid, aspect 1:1, radius 16. Unlocked: flare icon, 24px. Locked: 0.45 opacity.
- Recent routes: Cards with 44×44 terrain.lowland icon circle (mossDeep mountain icon), route name (14.5px bold), date + distance + elevation (11.5px muted), forward icon.

- [ ] **Step 1:** Update avatar: 68px, gradient (flare→sand), shadow. Name at 24px, subtitle at 12.5px. Add ellipsis CircleBtn.

- [ ] **Step 2:** Update stats card: Surface bg, radius 18, border + shadow. 4-column Stat layout.

- [ ] **Step 3:** Update heatmap: Proper 26×7 grid with 5 intensity levels. Month labels below.

- [ ] **Step 4:** Update badges: 4-column grid, aspect 1:1. Icons at 24px. Locked at 0.45 opacity.

- [ ] **Step 5:** Update recent routes: Cards with 44×44 terrain.lowland icon circles, proper text sizing and spacing.

- [ ] **Step 6:** Commit: `feat(profile): align profile with design prototype`

### Task 15: Social Feed Screen Alignment

**Files:**
- Modify: `lib/features/social/presentation/feed_screen.dart`

**Reference:** `prototype/screens-new.jsx:ScreenFeed`

**Key gaps to fix:**
- Header: Title "动态" at 26px bold + search + plus CircleBtns (36px).
- Story row: 56px avatars with gradient border (flare→mossDeep), 2px padding, inner circle (surface bg, initials). First avatar = add button with dashed border + plus icon. Names below (10.5px).
- Post cards: Surface bg, radius 16, border. Author row: 38px gradient avatar, name (13.5px bold), location with navigate icon + time (11px muted), ellipsis. Map preview (180px height). Glass stats overlay at bottom left (km, ↑m, duration in mono). Post text (13.5px). Action row: heart (flare) + count, comment + count, share, "查看路线→".

- [ ] **Step 1:** Update header: "动态" at 26px bold, CircleBtns at 36px.

- [ ] **Step 2:** Update story row: 56px avatars with gradient borders, dashed add button, names at 10.5px.

- [ ] **Step 3:** Update post cards: Author row (38px gradient avatar, name/location/time layout, ellipsis). MiniMap at 180px height. Glass stats overlay. Action row with heart/comment/share/view-route.

- [ ] **Step 4:** Commit: `feat(feed): align social feed with design prototype`

---

## Category 7: Onboarding

### Task 16: Onboarding Screen Alignment

**Files:**
- Modify: `lib/features/onboarding/presentation/onboarding_screen.dart`

**Reference:** `prototype/screens-final.jsx:ScreenOnboarding`

**Key gaps to fix:**
- Welcome: Hero landscape (360px, radius 24) with SVG layers (sky gradient, sun circles, 3 mountain ridges, figure on path, trail). "KAIPA · 开拔" label (11px mono, flare, letterSpacing 3). Title (32px bold). Description (14px muted).
- Level: "2 / 3" indicator (11px mono). Title "你最常走的距离？" (28px bold). 4 option cards with 44×44 icon circles (mossSoft bg for unselected, surface for selected), name (14.5px bold) + km range (10px mono), description, 22px radio circle (flare when selected + check icon).
- Safety: "3 / 3" indicator. Title + subtitle. SOS demo card (gradient bg flareSoft→surface, 52×52 red SOS button, title + description). Permissions list (4 items in surface container, 36×36 mossSoft icon circles, name + description, authorize pill button or check circle).
- Pagination: 3 dots (active 22px wide, others 6px, flare color).
- CTA: "上一步" (step>0, surface bg, line border, 54px) + "继续"/"开始探索" (flare bg, 54px, radius 16, shadow).

- [ ] **Step 1:** Update welcome page: Hero landscape CustomPaint at 360px with radius 24. Sun circles with proper opacity. Trail as dashed line. "KAIPA · 开拔" label with mono font and letterSpacing 3. Title at 32px. Padding 80px 28px.

- [ ] **Step 2:** Update level page: Step indicator "2 / 3" at top. Title at 28px. 4 cards with 44×44 icon circles, radio circles (22px, flare when selected). Padding 80px 24px.

- [ ] **Step 3:** Update safety page: Step indicator "3 / 3". SOS demo card with gradient bg, 52×52 red SOS button (radius 16, shadow). Permissions list in surface container with authorize pills.

- [ ] **Step 4:** Update pagination dots: Active dot 22px wide, others 6px. Positioned at bottom 130.

- [ ] **Step 5:** Update CTA buttons: Height 54px, radius 16. "上一步" with surface bg + line border. "继续"/"开始探索" with flare bg + shadow. Gap 10px.

- [ ] **Step 6:** Commit: `feat(onboarding): align onboarding with design prototype`

---

## Additional Screens

### Task 17: Settings Screen Alignment

**Files:**
- Modify: `lib/features/settings/presentation/settings_screen.dart`

**Reference:** `prototype/screens-final.jsx:ScreenSettings`

**Key gaps to fix:**
- Header: Back CircleBtn + "设置" at 20px bold.
- Appearance mode: Section label "外观模式" (12px uppercase, letterSpacing 0.3). 3-column grid of mode cards (padding 16×8, radius 16, icon 24px + label). Active: mossSoft bg + mossDeep border. Inactive: surface bg + line border.
- Theme color: Section label "主题色". Surface container (radius 18, border). 6-column color grid (42px circles). Active: ring shadow effect. Color names below (10px). Preview strip (40×40 flare icon box + "预览效果" text). Custom color row (conic-gradient wheel + forward icon).
- Settings groups: "通用" + "关于". Surface containers (radius 18). Setting rows with 34×34 icon circles (mossSoft, radius 9), title + detail, forward icon. Dividers between rows (lineSoft).
- Version footer: "Kaipa v1.0.0 (build 42)" centered (11px, inkDim, mono).

- [ ] **Step 1:** Update header: CircleBtn back + "设置" at 20px bold.

- [ ] **Step 2:** Update appearance mode: 3-column grid, mode cards with 24px icons. Active: mossSoft bg + mossDeep border (1.5px).

- [ ] **Step 3:** Update theme color picker: 6-column grid with 42px circles, ring shadow effect for active. Preview strip below. Custom color row with gradient wheel.

- [ ] **Step 4:** Update setting groups: 34×34 icon circles (radius 9), proper dividers (lineSoft).

- [ ] **Step 5:** Add version footer text.

- [ ] **Step 6:** Commit: `feat(settings): align settings with design prototype`

### Task 18: Notifications Screen Alignment

**Files:**
- Modify: `lib/features/notifications/presentation/notifications_screen.dart`

**Reference:** `prototype/screens-final.jsx:ScreenNotifications`

**Key gaps to fix:**
- Header: Back CircleBtn + "通知" at 20px bold + "全部已读" link (12px flare).
- Filter chips: 4 pills ("全部" active, "天气", "好友", "系统") with icons. Active: ink bg + bg text. Inactive: surface bg + line border.
- Sections: Group labels (12px bold, inkMuted, letterSpacing 0.3). Surface containers (radius 18, border). Notification rows: 36×36 icon circle (type-colored bg+20), title (13.5px, bold if unread), detail (12px muted), time (11px inkDim), unread dot (7px flare). Unread row: flareSoft+30 bg tint.

- [ ] **Step 1:** Update header: CircleBtn back + "通知" at 20px bold + "全部已读" link.

- [ ] **Step 2:** Update filter chips: Active chip uses ink bg + bg text color. Others: surface bg + line border. Icons for weather/users/bell.

- [ ] **Step 3:** Update notification sections: Group labels (12px, letterSpacing 0.3). Surface containers. Notification rows with proper icon circles, text sizing, unread indicator, time formatting.

- [ ] **Step 4:** Commit: `feat(notifications): align notifications with design prototype`

### Task 19: Route Publish Screen Alignment

**Files:**
- Modify: `lib/features/discover/presentation/route_publish_screen.dart`

**Reference:** `prototype/screens-final.jsx:ScreenRoutePublish`

**Key gaps to fix:**
- Top bar: Close CircleBtn + "发布路线" centered (13px bold) + "发布" pill button (flare bg).
- GPS source banner: mossSoft bg, navigate icon in 36×36 surface circle, "基于今日 GPS 轨迹" + detail, "更换→" link.
- Map preview: 160px height, MiniMap with stats overlay badge (glass bg, km + elevation in mono).
- Title input: Surface card (radius 14), "标题" label, title text (17px bold), "AI 已建议 · 改" flareSoft badge.
- Story: Surface card, "这次走得怎么样？" label, body text, hashtag pills (#野长城, #怀柔).
- Photos: "照片 · 6 张" + "+ 添加". Horizontal scroll of 96×120 photo tiles with terrain bands.
- Difficulty: "难度评级" + DiffBadge. T1-T5 segmented control (4px background, 7px padding, radius 7). Scale labels "初学←→挑战" in mono.
- Privacy toggles: 3 rows (公开/记入足迹/隐藏起点) with 30×30 icon circles, toggle switches.

- [ ] **Step 1:** Rewrite top bar: Close button + centered title + publish pill button.

- [ ] **Step 2:** Add GPS source banner with mossSoft bg, proper layout.

- [ ] **Step 3:** Add map preview (160px) with stats overlay badge.

- [ ] **Step 4:** Add title input card with AI suggestion badge.

- [ ] **Step 5:** Add story section with hashtag pills.

- [ ] **Step 6:** Add photos section with horizontal scroll tiles.

- [ ] **Step 7:** Add difficulty section with segmented T1-T5 control.

- [ ] **Step 8:** Add privacy toggles section.

- [ ] **Step 9:** Commit: `feat(route-publish): align route publish with design prototype`

---

## Design Token Updates

### Task 20: Update KaipaTokens for Prototype Alignment

**Files:**
- Modify: `lib/core/theme/kaipa_tokens.dart`

**Reference:** `prototype/tokens.js`

**Key gaps to fix:**
- Accent presets: Prototype uses moss (#4A7C59), forest (#2E5C3E), hunter (#1F4030), pine (#3A5F4A), juniper (#5C7A65), ember (#A84228), ochre (#A8762B), lake (#2C5D7E), midnight (#26334D), ink (#1F2A2D). Flutter app has different presets (Meadow, Moss, Citrus, Ember, Peach, Lake).
- Verify all color values match between tokens.js and kaipa_tokens.dart for light/dark modes.
- Verify radius tokens: sm=8, md=12, lg=18, xl=24, pill=9999.
- Verify spacing scale: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64].

- [ ] **Step 1:** Compare and update all light mode color values to match tokens.js exactly.

- [ ] **Step 2:** Compare and update all dark mode color values to match tokens.js exactly.

- [ ] **Step 3:** Update accent presets to match prototype's ACCENTS object.

- [ ] **Step 4:** Verify radius and spacing tokens match.

- [ ] **Step 5:** Commit: `fix(tokens): align design tokens with prototype`
