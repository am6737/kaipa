import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/auth/presentation/login_screen.dart';
import '../../features/discover/data/immersive_provider.dart';
import '../../features/discover/presentation/map_screen.dart';
import '../../features/discover/presentation/search_screen.dart';
import '../../features/discover/presentation/weather_screen.dart';
import '../../features/discover/presentation/route_publish_screen.dart';
import '../../features/route_detail/presentation/route_detail_screen.dart';
import '../../features/gear/presentation/gear_library_screen.dart';
import '../../features/gear/presentation/gear_category_screen.dart';
import '../../features/gear/presentation/gear_item_detail_screen.dart';
import '../../features/gear/presentation/gear_pick_screen.dart';
import '../../features/gear/presentation/category_management_screen.dart';
import '../../features/gear/presentation/preset_management_screen.dart';
import '../../features/gear/presentation/preset_detail_screen.dart';
import '../../features/navigation/presentation/navigate_screen.dart';
import '../../features/navigation/presentation/navigate_hud_screen.dart';
import '../../features/trip/presentation/manual_trip_entry_screen.dart';
import '../../features/trip/presentation/trip_complete_screen.dart';
import '../../features/trip/presentation/trip_history_screen.dart';
import '../../features/gpx/presentation/gpx_import_screen.dart';
import '../../features/discover/presentation/region_picker_screen.dart';
import '../../features/footprint/presentation/footprint_detail_screen.dart';
import '../../features/social/presentation/feed_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/trip_plan/presentation/trip_plan_list_screen.dart';
import '../../features/trip_plan/presentation/trip_plan_detail_screen.dart';
import '../../features/trip_plan/presentation/task_timeline_screen.dart';
import '../widgets/bottom_nav_bar.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

class _AuthNotifier extends ChangeNotifier {
  _AuthNotifier() {
    Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      notifyListeners();
    });
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = _AuthNotifier();
  ref.onDispose(authNotifier.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/discover',
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final loggedIn = Supabase.instance.client.auth.currentUser != null;
      final path = state.matchedLocation;

      const authRequired = ['/gear', '/trips', '/profile'];
      final needsAuth = authRequired.any((p) => path.startsWith(p));

      if (!loggedIn && needsAuth) {
        return '/login';
      }
      return null;
    },
    routes: [
      // 3-tab shell: gear | discover (center) | profile
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return _AppShell(navigationShell: navigationShell);
        },
        branches: [
          // Branch 0: Gear
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/gear',
              builder: (_, _) => const GearLibraryScreen(),
              routes: [
                GoRoute(
                  path: 'category/:id',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, state) => GearCategoryScreen(
                    categoryId: state.pathParameters['id']!,
                  ),
                ),
                GoRoute(
                  path: 'item/:id',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, state) => GearItemDetailScreen(
                    itemId: state.pathParameters['id']!,
                  ),
                ),
                GoRoute(
                  path: 'categories/manage',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, _) => const CategoryManagementScreen(),
                ),
                GoRoute(
                  path: 'presets/manage',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, _) => const PresetManagementScreen(),
                ),
                GoRoute(
                  path: 'preset/:id',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, state) => PresetDetailScreen(
                    presetId: state.pathParameters['id']!,
                  ),
                ),
              ],
            ),
          ]),
          // Branch 1: Trips
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/trips',
              builder: (_, _) => const TripPlanListScreen(),
            ),
          ]),
          // Branch 2: Discover (map — center tab)
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/discover',
              builder: (_, _) => const MapScreen(),
              routes: [
                GoRoute(
                  path: 'search',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, _) => const SearchScreen(),
                ),
                GoRoute(
                  path: 'route/:id',
                  parentNavigatorKey: _rootNavigatorKey,
                  builder: (_, state) => RouteDetailScreen(
                    routeId: state.pathParameters['id']!,
                  ),
                ),
              ],
            ),
          ]),
          // Branch 3: Notifications
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/notifications',
              builder: (_, _) => const NotificationsScreen(),
            ),
          ]),
          // Branch 4: Profile (me)
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/profile',
              builder: (_, _) => const ProfileScreen(),
            ),
          ]),
        ],
      ),
      // Modal routes (full-screen, no tab bar)
      GoRoute(
        path: '/profile/trip-history',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const TripHistoryScreen(),
      ),
      GoRoute(
        path: '/manual-trip-entry',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const ManualTripEntryScreen(),
      ),
      GoRoute(
        path: '/feed',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const FeedScreen(),
      ),
      GoRoute(
        path: '/gear/pick/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => GearPickScreen(
          routeId: state.pathParameters['routeId']!,
          planId: state.uri.queryParameters['planId'],
          immediate: state.uri.queryParameters['immediate'] == '1',
        ),
      ),
      GoRoute(
        path: '/navigate/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => NavigateScreen(
          routeId: state.pathParameters['routeId']!,
          tripId: state.uri.queryParameters['tripId'],
          planId: state.uri.queryParameters['planId'],
        ),
      ),
      GoRoute(
        path: '/navigate-hud/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => NavigateHudScreen(
          routeId: state.pathParameters['routeId']!,
        ),
      ),
      GoRoute(
        path: '/trip-complete/:tripId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => TripCompleteScreen(
          tripId: state.pathParameters['tripId']!,
        ),
      ),
      GoRoute(
        path: '/footprint/:tripId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => FootprintDetailScreen(
          tripId: state.pathParameters['tripId']!,
        ),
      ),
      GoRoute(
        path: '/gpx-import',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const GpxImportScreen(),
      ),
      GoRoute(
        path: '/region-picker',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => RegionPickerScreen(
          currentCity: state.uri.queryParameters['city'],
        ),
      ),
      GoRoute(
        path: '/weather/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => WeatherScreen(
          routeId: state.pathParameters['routeId']!,
        ),
      ),
      GoRoute(
        path: '/route-publish',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => RoutePublishScreen(
          tripId: state.uri.queryParameters['tripId'],
        ),
      ),
      GoRoute(
        path: '/gear/preset/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => PresetDetailScreen(
          presetId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/trip-plans',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const TripPlanListScreen(),
      ),
      GoRoute(
        path: '/trip-plans/:planId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => TripPlanDetailScreen(
          planId: state.pathParameters['planId']!,
          isNew: state.uri.queryParameters['isNew'] == '1',
          isImmediate: state.uri.queryParameters['immediate'] == '1',
        ),
      ),
      GoRoute(
        path: '/trip-plans/:planId/timeline',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => TaskTimelineScreen(
          planId: state.pathParameters['planId']!,
        ),
      ),
      GoRoute(
        path: '/settings',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/login',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const LoginScreen(),
      ),
    ],
  );
});

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
