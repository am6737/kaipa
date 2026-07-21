# Kaipa UI Design Rules

## Purpose

This document is the visual source of truth for Kaipa's gear experience. The redesigned **装备详情** and **套装详情** establish the canonical style for future gear pages and for the later optimization of the existing 装备、分类、套装列表页.

Use the existing theme, i18n, navigation, and shared components. Do not introduce a separate visual language for a new gear page without updating this document first.

## Design Character

- Calm, airy, editorial, and work-focused. The page should feel like a personal gear library, not a marketplace or marketing landing page.
- Prioritize scanning: one clear title, a small number of high-value facts, then progressively more detailed sections.
- Use restrained color. Theme text and accent colors carry meaning; decoration must not compete with the gear data.
- Preserve the existing Chinese copy and localization structure.

## Page Shell

- Detail pages use the shared `GearPushPage` full-screen shell with a horizontal slide-in transition.
- The back action is a floating circular button at the upper-left (`44x44`). Secondary actions sit at the upper-right as the same circular buttons.
- Hide scroll indicators. Keep bottom content clear of the safe area and bottom navigation (`insets.bottom + 120` is the current baseline).
- Light mode uses a clean white detail surface; dark mode uses `theme.bg`. Do not add a decorative hero gradient or a competing background panel.
- Content uses a constrained, centered column with `32px` horizontal padding on phone widths. Reduce only when necessary to prevent overflow on very narrow screens.

## Layout Rhythm

Use an 8-point rhythm, with these preferred values:

| Use | Value |
| --- | ---: |
| Page horizontal padding | 32px |
| Major section gap | 28-32px |
| Minor section gap | 14-18px |
| Detail card radius | 24px (maximum 24) |
| Small control radius | 10-20px depending on control shape |
| Hairline divider | `StyleSheet.hairlineWidth` |

Prefer open sections and unboxed lists. Use a card only when it frames a meaningful repeated group, empty state, or statistic block. Never put cards inside cards.

## Typography

- Page/entity title: `25-28px`, weight `800`, line height about `32-35px`, maximum two or three lines as appropriate.
- Statistic value: `25-30px`, weight `800`; labels are `15-15.5px` in `theme.text2`.
- Field label: `15-15.5px`; field value: `13-14px`, weight `700`.
- Section label: `12-12.5px`, weight `600-700`, uppercase treatment/letter spacing only for short structural labels.
- Supporting metadata: `10.5-11.5px`, preferably `MONO` for weight, price, counts, and percentages.
- Use `theme.text`, `theme.text2`, and `theme.text3` for hierarchy. Do not hard-code near-black text colors.
- Text must wrap or shrink inside its parent; no clipping or overlap. Do not use negative letter spacing.

## Surfaces, Color, and Data

- Reuse `theme.surfaceTop`, `theme.hairline`, `theme.accent`, `theme.accentSoft`, and `theme.danger`.
- Soft statistic fields may use a subtle theme-aware fill (roughly `rgba(0,0,0,0.045)` in light mode or `rgba(255,255,255,0.07)` in dark mode) with a hairline border.
- Use color accents to identify gear categories and chart segments. Keep tracks and dividers neutral.
- Monetary values use the existing yuan formatter; weights use the user's configured unit. Do not create page-specific formatting.

## Detail Page Templates

### 装备详情

1. Centered image/gallery.
2. Strong item name.
3. Two primary stat tiles (total weight and quantity).
4. Two-column metadata fields (category, value, status, unit facts).
5. Note and custom attributes.
6. Library-share bars and membership in sets.

Inline editing is allowed through press/long-press, but editing must preserve the same typography, spacing, and field geometry. Destructive deletion is confirmed through an action sheet.

### 套装详情

1. Strong set name.
2. Metric selector and a centered composition donut/chart.
3. Two primary stat tiles (focused/total weight and value).
4. Compact fact grid for item/category counts and pack-status weights.
5. Category groups with unboxed `GearItemRow` lists.
6. Share/export/settings actions belong in the upper-right menus, not in the content flow.

The set page may be denser than the item page because it is analytical, but it must retain the same shell, column width, title hierarchy, stat-tile language, and neutral surfaces.

## Components and Ownership

- Reuse `GearPushPage`, `GearCard`, `GearItemRow`, `SectionLabel`, `CircleBtn`, `ShareBar`, and shared formatters from `src/components/gear/parts.tsx`.
- If two pages need the same visual primitive, extract one shared component/token instead of copying local styles.
- Keep data behavior in hooks/data modules and visual behavior in components. New UI must remain strict TypeScript compatible.

## Interaction Rules

- Use familiar icons from the existing icon library inside icon buttons. Add a tooltip/accessibility label for unfamiliar icon-only actions.
- Use menus for secondary action groups and action sheets for destructive confirmation.
- Keep primary actions visually obvious through `theme.accent`; do not use large marketing-style buttons.
- Lists, rows, cards, and controls need stable dimensions so labels, images, and state changes do not shift surrounding content.

## Review Checklist

Before merging a gear-page change, verify:

- It uses the detail shell and the shared theme/component primitives.
- Its horizontal padding, title scale, section rhythm, and stat blocks match this document.
- Light and dark modes retain the same hierarchy and sufficient contrast.
- Chinese and English strings fit without clipping or overlap.
- Empty, loading, editing, and destructive-action states follow the same surface and spacing rules.
- `npx tsc --noEmit` passes.
