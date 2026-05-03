# Immersive Map Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fullscreen/immersive mode to the map screen that hides all UI chrome, leaving only the full-bleed map with route markers.

**Architecture:** A Riverpod `StateProvider<bool>` drives visibility. `MapScreen` watches it to animate its overlays in/out and show an exit button. `_AppShell` watches it to animate the bottom nav bar.

**Tech Stack:** Flutter, Riverpod, go_router, flutter_map

---

## File Structure

| File | Role |
|------|------|
| `lib/features/discover/data/immersive_provider.dart` | **New.** Single `StateProvider<bool>` for immersive mode state. |
| `lib/features/discover/presentation/map_screen.dart` | **Modify.** Add fullscreen enter button, exit button overlay, animated visibility wrappers around top bar / right controls / route preview. |
| `lib/core/router/app_router.dart` | **Modify.** Convert `_AppShell` from `StatelessWidget` to `ConsumerWidget`, animate `BottomNavBar` visibility. |

---

### Task 1: Create immersive mode provider

**Files:**
- Create: `lib/features/discover/data/immersive_provider.dart`

- [ ] **Step 1: Create the provider file**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

final immersiveModeProvider = StateProvider<bool>((ref) => false);
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/discover/data/immersive_provider.dart
git commit -m "feat(map): add immersive mode state provider"
```

---

### Task 2: Add fullscreen enter button to map controls

**Files:**
- Modify: `lib/features/discover/presentation/map_screen.dart`

- [ ] **Step 1: Add import for the provider**

At the top of `map_screen.dart`, add:

```dart
import '../data/immersive_provider.dart';
```

- [ ] **Step 2: Add the fullscreen button to the right-side controls column**

In `_MapScreenState.build`, find the `Positioned` widget for right-side controls (the one with `right: 16, bottom: 120`). Add a fullscreen `_MapButton` at the **top** of the `Column`, before the zoom-in button:

```dart
Positioned(
  right: 16,
  bottom: 120,
  child: Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      // NEW: fullscreen enter button
      _MapButton(
        icon: Icons.fullscreen,
        colors: colors,
        onTap: () {
          setState(() {
            _showFilters = false;
            _activeRoute = null;
          });
          ref.read(immersiveModeProvider.notifier).state = true;
        },
      ),
      const SizedBox(height: 14),
      _MapButton(
        icon: Icons.add,
        // ... rest unchanged
```

The `onTap` does three things: closes filters, dismisses any active route preview, and enters immersive mode.

- [ ] **Step 3: Verify it builds**

Run: `cd /home/coder/workspaces/kaipa && flutter build web --no-tree-shake-icons 2>&1 | tail -5`
Expected: build succeeds (the button renders but immersive mode has no effect yet)

- [ ] **Step 4: Commit**

```bash
git add lib/features/discover/presentation/map_screen.dart
git commit -m "feat(map): add fullscreen enter button to right controls"
```

---

### Task 3: Animate map screen overlays based on immersive state

**Files:**
- Modify: `lib/features/discover/presentation/map_screen.dart`

- [ ] **Step 1: Watch the immersive provider in build()**

At the top of the `build` method, after `final routesAsync = ref.watch(allRoutesProvider);`, add:

```dart
final immersive = ref.watch(immersiveModeProvider);
```

- [ ] **Step 2: Wrap the top bar (SafeArea) in AnimatedSlide + AnimatedOpacity**

Replace the existing `SafeArea(bottom: false, child: Column(...))` widget (the second child of the Stack, after FlutterMap) with:

```dart
AnimatedSlide(
  duration: const Duration(milliseconds: 300),
  curve: Curves.easeOut,
  offset: immersive ? const Offset(0, -1) : Offset.zero,
  child: AnimatedOpacity(
    duration: const Duration(milliseconds: 300),
    curve: Curves.easeOut,
    opacity: immersive ? 0.0 : 1.0,
    child: IgnorePointer(
      ignoring: immersive,
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            // ... existing Padding + Row content unchanged
          ],
        ),
      ),
    ),
  ),
),
```

The `IgnorePointer` prevents taps on invisible widgets during immersive mode.

- [ ] **Step 3: Wrap the filter overlay and filter panel in immersive guard**

The two conditional children `if (_showFilters) Positioned.fill(...)` and `if (_showFilters) Positioned(top: ...)` should add `&& !immersive` to their conditions:

```dart
if (_showFilters && !immersive)
  Positioned.fill(
    // ... unchanged
  ),

if (_showFilters && !immersive)
  Positioned(
    // ... unchanged
  ),
```

- [ ] **Step 4: Wrap the right-side controls Positioned in AnimatedSlide + AnimatedOpacity**

Replace the `Positioned(right: 16, bottom: 120, child: Column(...))` with:

```dart
AnimatedSlide(
  duration: const Duration(milliseconds: 300),
  curve: Curves.easeOut,
  offset: immersive ? const Offset(1, 0) : Offset.zero,
  child: AnimatedOpacity(
    duration: const Duration(milliseconds: 300),
    curve: Curves.easeOut,
    opacity: immersive ? 0.0 : 1.0,
    child: IgnorePointer(
      ignoring: immersive,
      child: Positioned(
        right: 16,
        bottom: 120,
        child: Column(
          // ... existing column content unchanged
        ),
      ),
    ),
  ),
),
```

**Important:** `AnimatedSlide` cannot wrap `Positioned` directly inside a `Stack`. Instead, keep the `Positioned` and move the animation wrappers inside it:

```dart
Positioned(
  right: 16,
  bottom: 120,
  child: AnimatedSlide(
    duration: const Duration(milliseconds: 300),
    curve: Curves.easeOut,
    offset: immersive ? const Offset(1, 0) : Offset.zero,
    child: AnimatedOpacity(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      opacity: immersive ? 0.0 : 1.0,
      child: IgnorePointer(
        ignoring: immersive,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ... existing buttons unchanged
          ],
        ),
      ),
    ),
  ),
),
```

- [ ] **Step 5: Wrap the route preview card in immersive guard**

Change the condition on the route preview card from `if (_activeRoute != null)` to:

```dart
if (_activeRoute != null && !immersive)
```

- [ ] **Step 6: Verify it builds**

Run: `cd /home/coder/workspaces/kaipa && flutter build web --no-tree-shake-icons 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 7: Commit**

```bash
git add lib/features/discover/presentation/map_screen.dart
git commit -m "feat(map): animate overlays based on immersive state"
```

---

### Task 4: Add immersive mode exit button with auto-hide

**Files:**
- Modify: `lib/features/discover/presentation/map_screen.dart`

- [ ] **Step 1: Add state variables for exit button visibility**

In `_MapScreenState`, add two new state variables:

```dart
bool _showExitButton = false;
Timer? _exitButtonTimer;
```

And add the `dart:async` import at the top of the file:

```dart
import 'dart:async';
```

- [ ] **Step 2: Add dispose for the timer**

Add a `dispose` override to `_MapScreenState`:

```dart
@override
void dispose() {
  _exitButtonTimer?.cancel();
  super.dispose();
}
```

- [ ] **Step 3: Add a method to show the exit button with auto-hide**

```dart
void _showExitButtonBriefly() {
  setState(() => _showExitButton = true);
  _exitButtonTimer?.cancel();
  _exitButtonTimer = Timer(const Duration(seconds: 3), () {
    if (mounted) setState(() => _showExitButton = false);
  });
}
```

- [ ] **Step 4: Modify the map's onTap to handle immersive mode**

In the `MapOptions` `onTap` callback, change it from:

```dart
onTap: (_, _) {
  if (_activeRoute != null) {
    setState(() => _activeRoute = null);
  }
},
```

to:

```dart
onTap: (_, _) {
  final immersive = ref.read(immersiveModeProvider);
  if (immersive) {
    _showExitButtonBriefly();
  } else if (_activeRoute != null) {
    setState(() => _activeRoute = null);
  }
},
```

- [ ] **Step 5: Add the exit button overlay to the Stack**

Add this as the last child of the Stack (after the route preview card conditional), inside the `build` method:

```dart
if (immersive)
  Positioned(
    top: MediaQuery.of(context).padding.top + 16,
    right: 16,
    child: AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: _showExitButton ? 1.0 : 0.0,
      child: IgnorePointer(
        ignoring: !_showExitButton,
        child: GestureDetector(
          onTap: () {
            _exitButtonTimer?.cancel();
            setState(() => _showExitButton = false);
            ref.read(immersiveModeProvider.notifier).state = false;
          },
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.black.withAlpha(100),
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Icon(
                Icons.close_fullscreen,
                size: 20,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ),
    ),
  ),
```

- [ ] **Step 6: Reset exit button state when leaving immersive mode**

Add a `ref.listen` in the `build` method (after the `immersive` variable) to clear exit button state when exiting:

```dart
ref.listen(immersiveModeProvider, (prev, next) {
  if (prev == true && next == false) {
    _exitButtonTimer?.cancel();
    setState(() => _showExitButton = false);
  }
});
```

- [ ] **Step 7: Verify it builds**

Run: `cd /home/coder/workspaces/kaipa && flutter build web --no-tree-shake-icons 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 8: Commit**

```bash
git add lib/features/discover/presentation/map_screen.dart
git commit -m "feat(map): add exit button with 3s auto-hide in immersive mode"
```

---

### Task 5: Animate bottom nav bar visibility in AppShell

**Files:**
- Modify: `lib/core/router/app_router.dart`

- [ ] **Step 1: Add imports**

At the top of `app_router.dart`, add:

```dart
import '../../features/discover/data/immersive_provider.dart';
```

- [ ] **Step 2: Convert _AppShell from StatelessWidget to ConsumerWidget**

Change the class declaration and build method:

```dart
class _AppShell extends ConsumerWidget {
  final StatefulNavigationShell navigationShell;

  const _AppShell({required this.navigationShell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final immersive = ref.watch(immersiveModeProvider);

    return Scaffold(
      body: Stack(
        children: [
          navigationShell,
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              offset: immersive ? const Offset(0, 1) : Offset.zero,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOut,
                opacity: immersive ? 0.0 : 1.0,
                child: IgnorePointer(
                  ignoring: immersive,
                  child: BottomNavBar(
                    currentIndex: navigationShell.currentIndex,
                    onTap: (index) => navigationShell.goBranch(
                      index,
                      initialLocation: index == navigationShell.currentIndex,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd /home/coder/workspaces/kaipa && flutter build web --no-tree-shake-icons 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add lib/core/router/app_router.dart
git commit -m "feat(map): animate bottom nav bar hide/show for immersive mode"
```

---

### Task 6: Final build verification

- [ ] **Step 1: Full build**

Run: `cd /home/coder/workspaces/kaipa && flutter build web --no-tree-shake-icons 2>&1 | tail -10`
Expected: build succeeds with no errors

- [ ] **Step 2: Analyze**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze 2>&1 | tail -10`
Expected: no analysis errors (warnings are acceptable)

- [ ] **Step 3: Fix any issues found, then commit**

```bash
git add -A
git commit -m "feat(map): immersive mode — final cleanup"
```
