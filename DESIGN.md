# Kaipa UI Design Rules

## Purpose

This document is the visual source of truth for the whole Kaipa app. The redesigned **装备概览、装备详情、装备列表、清单详情、清单列表** establish the canonical language for future journey, social, profile, settings, and other product pages.

Use the existing theme, i18n, navigation, and public design-system APIs. Do not introduce a separate visual language for a feature without updating this document first. Implementation APIs and examples live in [`docs/design-system.md`](docs/design-system.md).

## Design Character

- Calm, airy, restrained, and work-focused rather than promotional.
- Use clear hierarchy: one primary title, a small number of high-value facts, then progressively detailed sections.
- Favor neutral surfaces, generous spacing, rounded geometry, and lightweight borders.
- Use accent color only for primary actions, selection, progress, and meaningful data identity.
- Make numeric information easy to scan with consistent metric typography.
- Preserve existing Chinese copy and the localization structure.

## Foundations

New or substantially redesigned UI must use the public exports from `src/design-system/index.ts`.

- Use `space`, `radius`, `layout`, `type`, and `motion` instead of introducing one-off constants.
- Use semantic `Theme` fields instead of repeating light/dark color expressions.
- Import from `src/design-system`, not its internal component files.
- Keep feature data and domain-specific presentation in the feature directory.
- Promote a component to the global design system only when it is genuinely reusable across product domains.

## Page Shells

- Detail and pushed collection pages use the shared `DetailPage` shell.
- The back action is a floating `44x44` circular button at the upper-left. Secondary actions use matching buttons at the upper-right.
- Hide scroll indicators and keep bottom content clear of the safe area and bottom navigation.
- Use `theme.featureSurface` for clean detail canvases and `theme.groupedBg` for grouped collection pages.
- Use `AppHeaderSearch` for expanding top-bar search instead of placing an unrelated search field inside page content.
- Standard phone page padding comes from `layout.pagePadding` or `space`; immersive/detail content may use a wider content inset when the composition requires it.

## Layout Rhythm

Kaipa follows a restrained spacing scale rather than arbitrary pixel values.

| Use | Preferred token |
| --- | --- |
| Standard page padding | `layout.pagePadding` |
| Major section gap | `layout.sectionGap` / `space.xxl` |
| Standard content gap | `space.md` |
| Compact content gap | `space.xs` / `space.sm` |
| Standard card radius | `radius.card` |
| Feature card radius | `radius.feature` |
| Control radius | `radius.control` / `radius.pill` |
| Divider | `StyleSheet.hairlineWidth` |

Prefer open sections and unboxed lists. Use cards to frame meaningful repeated groups, statistics, forms, or states. Do not nest cards without a clear structural reason.

## Typography

- Use the semantic roles in `type`: page title, navigation title, section title, eyebrow, card title, body, caption, and metric.
- Use `theme.text`, `theme.text2`, and `theme.text3` for hierarchy.
- Weight, distance, money, duration, quantity, coordinates, and percentages should use the shared metric/monospace language where practical.
- Text must wrap, shrink, or truncate deliberately inside its parent; it must not overlap adjacent content.
- Do not introduce a new font scale in an individual screen when an existing role fits.
- Do not use middle dots (`·`), bullets, slashes, or similar punctuation as the default separator between independent metadata values. Prefer distinct icon-value groups, spacing, labels, rows, columns, or wrapping to express structure.
- Punctuation separators are acceptable only when they are part of natural language, a conventional data format, legal/brand copy, or another deliberate textual expression. Do not copy legacy middle-dot metadata patterns into new or redesigned UI; migrate them when that UI is touched.

## Surfaces and Color

- `theme.bg`: base application background.
- `theme.groupedBg`: grouped list and collection background.
- `theme.featureSurface`: high-contrast feature/detail surface.
- `theme.controlSurface`: floating controls.
- `theme.surfaceTop`: standard elevated card.
- `theme.fieldSurface` / `theme.fieldBorder`: fields, filters, and soft statistic blocks.
- `theme.progressTrack`: neutral progress track.
- `theme.accent` / `theme.danger`: primary emphasis and destructive actions.

Category, route, chart, and identity colors may communicate data meaning. Decorative color must not compete with content or reduce dark-mode contrast.

## Standard Components

Prefer these public primitives before creating page-local equivalents:

- `AppCard`
- `AppIconButton`
- `AppSectionHeader`
- `AppPropertyRow`
- `AppMetricStrip`
- `AppProgressBar`
- `AppHeaderSearch`
- `DetailPage`

Feature-specific components such as `GearItemRow` remain in their feature directory but should compose global tokens and primitives.

## Page Patterns

### Overview

1. Strong page title.
2. Compact high-value summary.
3. A small number of horizontally or vertically grouped feature cards.
4. Recent or actionable content before exhaustive data.
5. Clear links into complete collections.

### Collection/List

1. Shared top chrome and optional expanding search.
2. Sorting, filtering, selection, and layout controls remain secondary.
3. Stable list/grid geometry that does not shift as state changes.
4. Explicit empty, loading, and error states.

### Detail

1. Optional image or immersive hero.
2. Strong entity title.
3. Primary facts or metrics.
4. Progressively detailed metadata and related content.
5. Secondary actions in top-bar menus; destructive actions require confirmation.

### Form and Settings

1. Group related fields inside standard surfaces.
2. Use semantic field, divider, button, and error states.
3. Preserve the same page rhythm and title hierarchy as collection and detail pages.
4. Do not invent a separate settings aesthetic.

## Interaction Rules

- Use familiar icons from the existing icon library and provide accessibility labels for icon-only actions.
- Use menus for secondary actions and action sheets/alerts for destructive confirmation.
- Use `theme.accent` for primary state and action emphasis; avoid oversized marketing-style calls to action.
- Motion should explain hierarchy or continuity, not decorate the interface.
- Controls must have stable dimensions and usable touch targets.

## Review Checklist

Before merging UI work, verify:

- It follows this document and `docs/design-system.md`.
- It uses public design-system APIs and semantic theme values.
- Spacing, radii, typography, page chrome, and surface hierarchy match the Kaipa baseline.
- Light and dark modes retain the same hierarchy and sufficient contrast.
- Chinese and English strings fit without clipping or overlap.
- Empty, loading, error, editing, selection, and destructive states are considered.
- No business-specific component was promoted globally without a real cross-domain use case.
- `npx tsc --noEmit` passes.
