import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/login_screen.dart';
import '../../features/discover/presentation/map_screen.dart';
import '../../features/discover/presentation/search_screen.dart';
import '../../features/discover/presentation/weather_screen.dart';
import '../../features/discover/presentation/route_publish_screen.dart';
import '../../features/route_detail/presentation/route_detail_screen.dart';
import '../../features/gear/presentation/gear_library_screen.dart';
import '../../features/gear/presentation/gear_category_screen.dart';
import '../../features/gear/presentation/gear_item_detail_screen.dart';
import '../../features/gear/presentation/gear_pick_screen.dart';
import '../../features/navigation/presentation/navigate_screen.dart';
import '../../features/navigation/presentation/navigate_hud_screen.dart';
import '../../features/trip/presentation/trip_complete_screen.dart';
import '../../features/gpx/presentation/gpx_import_screen.dart';
import '../../features/social/presentation/feed_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../widgets/bottom_nav_bar.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/discover',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return _AppShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/discover',
              builder: (_, _) => const MapScreen(),
              routes: [
                GoRoute(
                  path: 'search',
                  builder: (_, _) => const SearchScreen(),
                ),
                GoRoute(
                  path: 'route/:id',
                  builder: (_, state) => RouteDetailScreen(
                    routeId: state.pathParameters['id']!,
                  ),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/gear',
              builder: (_, _) => const GearLibraryScreen(),
              routes: [
                GoRoute(
                  path: 'category/:id',
                  builder: (_, state) => GearCategoryScreen(
                    categoryId: state.pathParameters['id']!,
                  ),
                ),
                GoRoute(
                  path: 'item/:id',
                  builder: (_, state) => GearItemDetailScreen(
                    itemId: state.pathParameters['id']!,
                  ),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/feed',
              builder: (_, _) => const FeedScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/profile',
              builder: (_, _) => const ProfileScreen(),
            ),
          ]),
        ],
      ),
      GoRoute(
        path: '/gear/pick/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => GearPickScreen(
          routeId: state.pathParameters['routeId']!,
        ),
      ),
      GoRoute(
        path: '/navigate/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => NavigateScreen(
          routeId: state.pathParameters['routeId']!,
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
        path: '/gpx-import',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const GpxImportScreen(),
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
        builder: (_, _) => const RoutePublishScreen(),
      ),
      GoRoute(
        path: '/notifications',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, _) => const NotificationsScreen(),
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

class _AppShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const _AppShell({required this.navigationShell});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: BottomNavBar(
        currentIndex: navigationShell.currentIndex,
        onTap: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
      ),
    );
  }
}
