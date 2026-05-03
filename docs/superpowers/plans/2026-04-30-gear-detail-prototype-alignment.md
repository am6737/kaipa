# Gear Item Detail Screen — Prototype Alignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `gear_item_detail_screen.dart` UI to match the prototype in `prototype/screens-other.jsx` (ScreenGearItemDetail, lines 1163–1410). Missing data model fields use placeholder values.

**Architecture:** Single-file rewrite of the `_buildContent` method and helpers. The screen keeps its existing Riverpod state management, shimmer loading, error state, and delete logic. Only the visual layout changes. Uses existing shared widgets (`CircleButton`, `SectionTitle`, `StatWidget`, `KaipaIcon`).

**Tech Stack:** Flutter, Riverpod, existing Kaipa design tokens

---

## File Map

- **Modify:** `lib/features/gear/presentation/gear_item_detail_screen.dart` — full UI rewrite of content area

No new files needed. No model changes.

---

## Prototype → Flutter Mapping

| Prototype Section | Prototype Behavior | Flutter Implementation |
|---|---|---|
| Photo area (380px) | Dark bg, gradient placeholder, carousel shell | `Container` h=380, dark bg, single photo/placeholder, counter badge, dots, thumbnail strip |
| Top overlay buttons | back + share + more(...) | `CircleButton` (shared widget) × 3, positioned over photo |
| Photo counter | "1 / N" pill, centered top | `Container` with pill styling, `Text` |
| Page dots | Active dot wider, white | `Row` of `Container` circles |
| Thumbnail strip | 52×52 thumbnails with labels + add button | `Row` of `Container` + dashed border add button |
| Title row | Name (24px w700) + condition badge (pill, right-aligned) | `Row` with `Text` + condition pill |
| Subtitle | "GTX 中帮防水徒步鞋" (13px, inkMuted) | `Text` — use `item.brand ?? '--'` |
| Tags | Pill chips (防水, 中帮, etc.) | `Wrap` of `Container` pills — placeholder: empty (no tags field in model) |
| Stats card | 3-col grid: 使用次数 / 累计里程 / 自评 | `Container` with `Row` of 3 `StatWidget` — values: "--" placeholders |
| 规格 section | SectionTitle + table rows (品牌/型号/尺码/重量/价格/入手日期) | `SectionTitle` + `Container` with divider rows |
| 备注 section | SectionTitle + text block | `SectionTitle` + `Container` with `Text` |
| 参与过的路线 | SectionTitle + route cards | `SectionTitle` + placeholder empty state |
| More menu | ... button triggers actions | `CircleButton` with `showModalBottomSheet` for edit/delete |

---

### Task 1: Rewrite photo area with carousel shell

**Files:**
- Modify: `lib/features/gear/presentation/gear_item_detail_screen.dart:62-121`

- [ ] **Step 1: Replace the photo SliverToBoxAdapter**

Replace the current photo area (lines 65–121) with a 380px-height dark container matching the prototype. Keep existing `item.photoUrl` image loading. Add:
- Dark background (`#2A2118`)
- Photo counter badge centered top ("1 / 1")
- Page dots (single active dot)
- Thumbnail strip at bottom (single thumbnail + add button)
- Top overlay: back (left), share + more (right) using shared `CircleButton`

```dart
// Photo carousel shell
SliverToBoxAdapter(
  child: Container(
    width: screenWidth,
    height: 380,
    color: const Color(0xFF2A2118),
    child: Stack(
      children: [
        // Main photo or placeholder
        if (item.photoUrl != null)
          Positioned.fill(
            child: Image.network(
              item.photoUrl!,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _buildPhotoPlaceholder(colors),
            ),
          )
        else
          Positioned.fill(child: _buildPhotoPlaceholder(colors)),

        // Top overlay: back + share/more
        Positioned(
          top: MediaQuery.of(context).padding.top + 4,
          left: 12, right: 12,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              CircleButton(icon: KaipaIcons.back, onTap: () => context.pop(), size: 38, iconSize: 17),
              Row(
                children: [
                  CircleButton(icon: KaipaIcons.share, size: 38, iconSize: 15),
                  const SizedBox(width: 8),
                  CircleButton(icon: KaipaIcons.more, size: 38, iconSize: 15,
                    onTap: () => _showMoreMenu(context, colors, item)),
                ],
              ),
            ],
          ),
        ),

        // Photo counter badge
        Positioned(
          top: MediaQuery.of(context).padding.top + 4,
          left: 0, right: 0,
          child: Center(child: _photoCounterBadge(1, item.photoUrl != null ? 1 : 0)),
        ),

        // Page dots
        Positioned(
          bottom: 76, left: 0, right: 0,
          child: _buildPageDots(0, item.photoUrl != null ? 1 : 0),
        ),

        // Thumbnail strip
        Positioned(
          bottom: 12, left: 12, right: 12,
          child: _buildThumbnailStrip(colors, item),
        ),
      ],
    ),
  ),
),
```

- [ ] **Step 2: Add helper methods for photo area components**

```dart
Widget _photoCounterBadge(int current, int total) {
  if (total == 0) return const SizedBox.shrink();
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: const Color(0x73000000), // rgba(0,0,0,0.45)
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      '$current / $total',
      style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w600, letterSpacing: 0.3),
    ),
  );
}

Widget _buildPageDots(int activeIndex, int count) {
  if (count == 0) return const SizedBox.shrink();
  return Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: List.generate(count, (i) => Container(
      width: i == activeIndex ? 18 : 6, height: 6,
      margin: const EdgeInsets.symmetric(horizontal: 2.5),
      decoration: BoxDecoration(
        color: i == activeIndex ? Colors.white : const Color(0x80FFFFFF),
        borderRadius: BorderRadius.circular(99),
      ),
    )),
  );
}

Widget _buildThumbnailStrip(KaipaColors colors, GearItemModel item) {
  return Row(
    children: [
      if (item.photoUrl != null)
        Container(
          width: 52, height: 52,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white, width: 2),
            image: DecorationImage(image: NetworkImage(item.photoUrl!), fit: BoxFit.cover),
          ),
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text('主图', style: TextStyle(fontSize: 8, color: Colors.white, fontWeight: FontWeight.w600,
              shadows: [Shadow(color: Color(0x99000000), blurRadius: 2)])),
          ),
        ),
      const SizedBox(width: 6),
      // Add photo button
      GestureDetector(
        child: Container(
          width: 52, height: 52,
          decoration: BoxDecoration(
            color: const Color(0x33FFFFFF),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0x99FFFFFF), width: 1.5, strokeAlign: BorderSide.strokeAlignInside),
          ),
          child: const Center(child: KaipaIcon(name: KaipaIcons.plus, size: 16, color: Colors.white)),
        ),
      ),
    ],
  );
}
```

- [ ] **Step 3: Update _buildPhotoPlaceholder for dark background**

The placeholder should work on the dark carousel background:

```dart
Widget _buildPhotoPlaceholder(KaipaColors colors) {
  return Center(
    child: KaipaIcon(name: KaipaIcons.backpack, size: 80, color: const Color(0x40FFFFFF)),
  );
}
```

- [ ] **Step 4: Verify visually** — run the app, navigate to a gear item detail, confirm the photo area matches prototype layout.

- [ ] **Step 5: Commit**

```bash
git add lib/features/gear/presentation/gear_item_detail_screen.dart
git commit -m "refactor(gear): rewrite photo area to match prototype carousel layout"
```

---

### Task 2: Rewrite title row, subtitle, condition badge, and tags

**Files:**
- Modify: `lib/features/gear/presentation/gear_item_detail_screen.dart:124-152`

- [ ] **Step 1: Replace title/brand section with prototype layout**

Replace current title area with:
- Title row: item name (24px w700) + condition badge pill (right-aligned)
- Subtitle: brand or placeholder (13px, inkMuted)
- Tags row: placeholder — show nothing for now (model has no tags field)

```dart
// Title row with condition badge
Row(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.name, style: TextStyle(
            fontSize: 24, fontWeight: FontWeight.w700, color: colors.ink,
            letterSpacing: -0.6,
          )),
          const SizedBox(height: 4),
          Text(item.brand ?? '--', style: TextStyle(
            fontSize: 13, color: colors.inkMuted, letterSpacing: -0.2,
          )),
        ],
      ),
    ),
    const SizedBox(width: 10),
    _conditionBadge(item.condition, colors),
  ],
),

// Tags — placeholder, no tags in model yet
// (will render nothing if no tags)
```

- [ ] **Step 2: Add `_conditionBadge` helper**

```dart
Widget _conditionBadge(String? condition, KaipaColors colors) {
  final info = _conditionInfo(condition, colors);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: info.color.withAlpha(26),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(info.label, style: TextStyle(
      fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: info.color,
    )),
  );
}
```

- [ ] **Step 3: Verify visually** — confirm title row matches prototype.

- [ ] **Step 4: Commit**

```bash
git add lib/features/gear/presentation/gear_item_detail_screen.dart
git commit -m "refactor(gear): align title row and condition badge with prototype"
```

---

### Task 3: Replace specs grid with stats card + specs table

**Files:**
- Modify: `lib/features/gear/presentation/gear_item_detail_screen.dart:153-342`

- [ ] **Step 1: Add stats card (使用次数 / 累计里程 / 自评)**

Replace the current `_buildSpecsGrid` Wrap with a 3-column stats card using `StatWidget`:

```dart
// Stats card — placeholder values (fields not in model yet)
Container(
  padding: const EdgeInsets.all(16),
  decoration: BoxDecoration(
    color: colors.surface,
    border: Border.all(color: colors.line, width: 0.5),
    borderRadius: BorderRadius.circular(16),
  ),
  child: Row(
    children: [
      Expanded(child: StatWidget(value: '--', label: '使用次数')),
      Expanded(child: StatWidget(value: '--', unit: 'km', label: '累计里程')),
      Expanded(child: StatWidget(value: '--', label: '自评')),
    ],
  ),
),
```

- [ ] **Step 2: Add specs table section**

Use `SectionTitle` with "规格" title and "编辑" trailing text, followed by a table-like container:

```dart
SectionTitle(
  title: '规格',
  trailing: Text('编辑', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: colors.flare)),
  padding: const EdgeInsets.only(top: 22, bottom: 10),
),
Container(
  decoration: BoxDecoration(
    color: colors.surface,
    border: Border.all(color: colors.line, width: 0.5),
    borderRadius: BorderRadius.circular(16),
  ),
  clipBehavior: Clip.antiAlias,
  child: Column(
    children: _buildSpecRows(colors, item, dateFormat),
  ),
),
```

- [ ] **Step 3: Add `_buildSpecRows` helper**

```dart
List<Widget> _buildSpecRows(KaipaColors colors, GearItemModel item, DateFormat dateFormat) {
  final specs = [
    ('品牌', item.brand ?? '--'),
    ('型号', '--'),                // model field not in GearItemModel
    ('尺码', '--'),                // size field not in GearItemModel
    ('重量', item.weightG != null ? '${item.weightG!.toStringAsFixed(0)} g' : '--'),
    ('价格', item.price != null ? '¥${item.price!.toStringAsFixed(0)}' : '--'),
    ('入手日期', item.purchasedAt != null ? dateFormat.format(item.purchasedAt!) : '--'),
  ];

  return [
    for (var i = 0; i < specs.length; i++) ...[
      if (i > 0) Divider(height: 0.5, thickness: 0.5, color: colors.line),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(specs[i].$1, style: TextStyle(fontSize: 13, color: colors.inkMuted, letterSpacing: -0.1)),
            Text(specs[i].$2, style: TextStyle(
              fontSize: 13, color: colors.ink, fontWeight: FontWeight.w500, letterSpacing: -0.2,
              fontFamily: (specs[i].$1 == '价格' || specs[i].$1 == '重量') ? 'monospace' : null,
            )),
          ],
        ),
      ),
    ],
  ];
}
```

- [ ] **Step 4: Remove old `_buildSpecsGrid` method** — it's fully replaced.

- [ ] **Step 5: Verify visually** — confirm stats card and specs table match prototype.

- [ ] **Step 6: Commit**

```bash
git add lib/features/gear/presentation/gear_item_detail_screen.dart
git commit -m "refactor(gear): add stats card and specs table matching prototype"
```

---

### Task 4: Align notes section and add routes placeholder

**Files:**
- Modify: `lib/features/gear/presentation/gear_item_detail_screen.dart:168-256`

- [ ] **Step 1: Update notes section to use SectionTitle**

Replace the current inline Text header with `SectionTitle`:

```dart
if (item.notes != null && item.notes!.isNotEmpty) ...[
  SectionTitle(
    title: '备注',
    padding: const EdgeInsets.only(top: 22, bottom: 10),
  ),
  Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: colors.surface,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: colors.line, width: 0.5),
    ),
    child: Text(item.notes!, style: TextStyle(
      fontSize: 13, color: colors.ink, letterSpacing: -0.1, height: 1.55,
    )),
  ),
],
```

- [ ] **Step 2: Add "参与过的路线" placeholder section**

```dart
// Routes section — placeholder (no route-gear relationship in model yet)
SectionTitle(
  title: '参与过的路线',
  trailing: Text('--', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: colors.inkMuted)),
  padding: const EdgeInsets.only(top: 22, bottom: 10),
),
Container(
  width: double.infinity,
  padding: const EdgeInsets.all(20),
  decoration: BoxDecoration(
    color: colors.surface,
    borderRadius: BorderRadius.circular(14),
    border: Border.all(color: colors.line, width: 0.5),
  ),
  child: Center(
    child: Text('暂无记录', style: TextStyle(fontSize: 13, color: colors.inkDim)),
  ),
),
```

- [ ] **Step 3: Remove the edit/delete action buttons** — they move to the "more" menu.

- [ ] **Step 4: Add `_showMoreMenu` bottom sheet**

Replace the old favorite toggle with a bottom sheet triggered by the more button:

```dart
void _showMoreMenu(BuildContext context, KaipaColors colors, GearItemModel item) {
  showModalBottomSheet(
    context: context,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(width: 36, height: 4, decoration: BoxDecoration(
            color: colors.line, borderRadius: BorderRadius.circular(2))),
          ListTile(
            leading: KaipaIcon(name: KaipaIcons.heart, size: 20, color: colors.ink),
            title: Text(_isFavorite ? '取消收藏' : '收藏', style: TextStyle(color: colors.ink)),
            onTap: () { Navigator.pop(ctx); _toggleFavorite(item); },
          ),
          ListTile(
            leading: KaipaIcon(name: KaipaIcons.close, size: 20, color: colors.diff.extreme),
            title: Text('删除', style: TextStyle(color: colors.diff.extreme)),
            onTap: () { Navigator.pop(ctx); _showDeleteDialog(context, colors, item); },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}
```

- [ ] **Step 5: Verify visually** — confirm notes, routes, and more menu match prototype.

- [ ] **Step 6: Commit**

```bash
git add lib/features/gear/presentation/gear_item_detail_screen.dart
git commit -m "refactor(gear): align notes section, add routes placeholder, move actions to more menu"
```

---

### Task 5: Final cleanup and import updates

**Files:**
- Modify: `lib/features/gear/presentation/gear_item_detail_screen.dart`

- [ ] **Step 1: Update imports**

Add imports for shared widgets now used:
```dart
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/section_title.dart';
```

Remove unused imports if any (e.g., `shimmer` stays for loading state).

- [ ] **Step 2: Remove the private `_CircleButton` class** — replaced by shared `CircleButton`.

- [ ] **Step 3: Remove the old condition widget from `_buildSpecsGrid`** — condition is now shown as a badge next to the title.

- [ ] **Step 4: Verify the complete screen** — run app, check all sections render correctly, test loading/error states still work.

- [ ] **Step 5: Commit**

```bash
git add lib/features/gear/presentation/gear_item_detail_screen.dart
git commit -m "refactor(gear): cleanup imports and remove replaced private widgets"
```

---

## Summary of Prototype ↔ Implementation Decisions

| Decision | Rationale |
|---|---|
| Single photo shown in carousel shell | Model only has `photoUrl` (single). Layout is ready for multi-photo. |
| Stats card shows "--" for 使用次数/累计里程/自评 | Fields not in `GearItemModel`. Placeholder until schema update. |
| 型号 and 尺码 show "--" in specs table | Fields not in model. |
| Tags row omitted | No `tags` field in model. Space reserved in layout. |
| 参与过的路线 shows "暂无记录" | No gear-route relationship yet. |
| Edit/delete moved to more menu | Matches prototype (no visible action buttons). |
| Share button is non-functional | Placeholder — no share implementation yet. |
