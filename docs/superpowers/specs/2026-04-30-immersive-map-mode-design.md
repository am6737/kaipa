# Immersive Map Mode (沉浸模式 · 纯地图)

## Summary

Add an immersive/fullscreen mode to the map screen that hides all UI chrome, leaving only the full-bleed map with route markers. This matches the prototype's "沉浸模式 · 纯地图" feature defined in `prototype/screen-map.jsx`.

## Trigger & Exit

### Enter
- A new fullscreen button (Material `fullscreen` icon) at the **top** of the existing right-side control column (above the zoom +/- and navigation buttons).
- Styled as a `_MapButton` consistent with existing controls.
- Tapping sets `immersiveModeProvider` to `true`.

### Exit
- In immersive mode, tapping anywhere on the map toggles a floating **exit button** into view.
- The exit button appears at the **top-right** of the screen (inside SafeArea), styled as a semi-transparent circular button with a `close_fullscreen` icon.
- The exit button auto-hides after **3 seconds** if not tapped.
- Tapping the exit button sets `immersiveModeProvider` to `false`.

## UI Visibility

### Hidden in immersive mode
- Top bar: search input, filter button, profile button
- Filter dropdown panel (if open, close it on enter)
- Right-side controls: zoom in, zoom out, navigation, fullscreen button itself
- Active route preview card (dismiss on enter)
- Bottom navigation bar (managed by `_AppShell`)

### Visible in immersive mode
- Full-bleed map tiles
- Route marker pins (remain interactive — tapping a pin does NOT exit immersive mode, but the preview card will not show until the user exits)
- Exit button (when toggled visible by a tap)

## Animations

| Element | Enter immersive | Exit immersive |
|---------|----------------|----------------|
| Top bar (search, filter, profile) | Slide up + fade out, 300ms ease-out | Slide down + fade in, 300ms ease-out |
| Right-side controls | Slide right + fade out, 300ms ease-out | Slide left + fade in, 300ms ease-out |
| Route preview card | Slide down + fade out, 250ms ease-out | N/A (dismissed on enter) |
| Bottom nav bar | Slide down + fade out, 300ms ease-out | Slide up + fade in, 300ms ease-out |
| Exit button (appear) | Fade in, 200ms | N/A |
| Exit button (auto-hide) | Fade out, 200ms (after 3s) | N/A |

## State Management

### New provider

File: `lib/features/discover/data/immersive_provider.dart`

```dart
final immersiveModeProvider = StateProvider<bool>((ref) => false);
```

A simple `StateProvider<bool>`. No persistence needed — immersive mode resets to `false` on app restart or navigation away.

### Consumers
- `MapScreen` — watches provider to show/hide its own overlays and the fullscreen/exit buttons.
- `_AppShell` (in `app_router.dart`) — watches provider to show/hide the `BottomNavBar`.

## Files Changed

| File | Change |
|------|--------|
| `lib/features/discover/data/immersive_provider.dart` | **New file.** Defines `immersiveModeProvider`. |
| `lib/features/discover/presentation/map_screen.dart` | Add fullscreen button to right-side controls. Watch `immersiveModeProvider`. Wrap top bar, right controls, and route preview in animated visibility. Add exit button overlay for immersive mode. Clear `_activeRoute` and `_showFilters` on enter. |
| `lib/core/router/app_router.dart` | Convert `_AppShell` to `ConsumerWidget`. Watch `immersiveModeProvider`. Wrap `BottomNavBar` in animated visibility. |

## Edge Cases

- **Filter panel open when entering immersive**: close the filter panel (`_showFilters = false`).
- **Route preview card open when entering immersive**: dismiss it (`_activeRoute = null`).
- **Navigate away from map while immersive**: the provider resets naturally since `MapScreen` is no longer visible. On return, the UI chrome reappears.
- **Marker tap in immersive mode**: the marker's `onTap` still fires and sets `_activeRoute`, but the preview card is hidden while immersive is active. When the user exits immersive mode, the preview card appears if `_activeRoute` is set.

## Out of Scope

- System UI hiding (status bar / Android navigation bar) — not needed for web-first Flutter app.
- Globe/trail zoom levels — current implementation only has region-level map.
- Keyboard shortcuts for immersive toggle.
