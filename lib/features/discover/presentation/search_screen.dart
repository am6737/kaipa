import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/route_repository.dart';
import '../domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/diff_badge.dart';


// ─── Search state providers ────────────────────────────────────────────

final _searchQueryProvider = StateProvider<String>((ref) => '北京 周末 一日');
final _searchDifficultyProvider = StateProvider<String?>((ref) => null);

final _searchResultsProvider = FutureProvider<List<RouteModel>>((ref) async {
  final query = ref.watch(_searchQueryProvider);
  final difficulty = ref.watch(_searchDifficultyProvider);
  final repo = ref.watch(routeRepositoryProvider);

  // If a difficulty filter is active, use filtered route listing
  if (difficulty != null && difficulty.isNotEmpty) {
    final filter = RouteFilter(difficulty: difficulty);
    final routes = await repo.getRoutes(filter: filter);
    if (query.isNotEmpty) {
      final q = query.toLowerCase();
      return routes
          .where((r) =>
              r.name.toLowerCase().contains(q) ||
              (r.description?.toLowerCase().contains(q) ?? false) ||
              (r.region?.toLowerCase().contains(q) ?? false))
          .toList();
    }
    return routes;
  }

  // Otherwise use full-text search
  if (query.isNotEmpty) {
    return repo.searchRoutes(query);
  }

  return repo.fetchRoutes();
});

// ─── Search Screen ─────────────────────────────────────────────────────

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late TextEditingController _searchController;

  static const _filters = <String, String?>{
    '全部': null,
    '入门': 'easy',
    '中等': 'mod',
    '困难': 'hard',
    '50km内': null,
  };

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(text: '北京 周末 一日');
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onSearch(String value) {
    ref.read(_searchQueryProvider.notifier).state = value;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final selectedDifficulty = ref.watch(_searchDifficultyProvider);
    final resultsAsync = ref.watch(_searchResultsProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Search header
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => context.pop(),
                    icon: Icon(Icons.arrow_back, color: colors.ink, size: 22),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      autofocus: true,
                      onSubmitted: _onSearch,
                      style: TextStyle(color: colors.ink, fontSize: 15),
                      decoration: InputDecoration(
                        hintText: '搜索线路、地区...',
                        hintStyle: TextStyle(color: colors.inkDim),
                        filled: true,
                        fillColor: colors.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        prefixIcon: Icon(
                          Icons.search,
                          color: colors.inkDim,
                          size: 20,
                        ),
                        suffixIcon: _searchController.text.isNotEmpty
                            ? IconButton(
                                icon: Icon(
                                  Icons.close,
                                  color: colors.inkDim,
                                  size: 18,
                                ),
                                onPressed: () {
                                  _searchController.clear();
                                  _onSearch('');
                                },
                              )
                            : null,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Filter pills
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _filters.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final entry = _filters.entries.elementAt(index);
                  final label = entry.key;
                  final diff = entry.value;
                  // Special handling: "全部" is selected when difficulty is null
                  // and we're not specifically on "50km内"
                  final isActive = label == '全部'
                      ? selectedDifficulty == null
                      : diff != null && diff == selectedDifficulty;

                  return GestureDetector(
                    onTap: () {
                      ref.read(_searchDifficultyProvider.notifier).state = diff;
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: isActive ? colors.flare : colors.surface,
                        borderRadius:
                            BorderRadius.circular(KaipaRadius.pill),
                        border: Border.all(
                          color: isActive ? colors.flare : colors.line,
                          width: 0.5,
                        ),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(
                          color: isActive ? Colors.white : colors.ink,
                          fontSize: 13,
                          fontWeight:
                              isActive ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),

            // Sort row / result count
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  resultsAsync.when(
                    data: (routes) => Text(
                      '找到 ${routes.length} 条线路',
                      style: TextStyle(
                        color: colors.inkMuted,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    loading: () => Text(
                      '搜索中...',
                      style: TextStyle(
                        color: colors.inkMuted,
                        fontSize: 13,
                      ),
                    ),
                    error: (_, _) => Text(
                      '搜索失败',
                      style: TextStyle(
                        color: colors.diff.extreme,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Icon(Icons.sort, color: colors.inkDim, size: 18),
                  const SizedBox(width: 4),
                  Text(
                    '评分排序',
                    style: TextStyle(
                      color: colors.inkDim,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),

            // Results list
            Expanded(
              child: resultsAsync.when(
                data: (routes) {
                  if (routes.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.search_off,
                            size: 48,
                            color: colors.inkDim,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            '未找到匹配的线路',
                            style: TextStyle(
                              color: colors.inkMuted,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '试试其他关键词',
                            style: TextStyle(
                              color: colors.inkDim,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: routes.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      return _SearchResultCard(
                        route: routes[index],
                        colors: colors,
                      );
                    },
                  );
                },
                loading: () => Center(
                  child: CircularProgressIndicator(
                    color: colors.flare,
                    strokeWidth: 2.5,
                  ),
                ),
                error: (error, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: colors.diff.extreme,
                          size: 40,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '加载失败',
                          style: TextStyle(
                            color: colors.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          error.toString(),
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 13,
                          ),
                          textAlign: TextAlign.center,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 16),
                        TextButton(
                          onPressed: () =>
                              ref.invalidate(_searchResultsProvider),
                          child: Text(
                            '重试',
                            style: TextStyle(color: colors.flare),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Search Result Card ────────────────────────────────────────────────

class _SearchResultCard extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;

  const _SearchResultCard({required this.route, required this.colors});

  String _formatDuration(Duration d) {
    if (d.inHours > 0) {
      final mins = d.inMinutes % 60;
      return mins > 0 ? '${d.inHours}h${mins}m' : '${d.inHours}h';
    }
    return '${d.inMinutes}m';
  }

  @override
  Widget build(BuildContext context) {
    final diffColor = colors.diff[route.difficulty];

    return GestureDetector(
      onTap: () => context.push('/discover/route/${route.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(KaipaRadius.lg),
          border: Border.all(color: colors.lineSoft, width: 0.5),
        ),
        child: Row(
          children: [
            // Mini map thumbnail placeholder
            Container(
              width: 100,
              height: 110,
              decoration: BoxDecoration(
                color: colors.terrain.base,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(KaipaRadius.lg),
                  bottomLeft: Radius.circular(KaipaRadius.lg),
                ),
              ),
              child: Stack(
                children: [
                  // Simplified terrain visualization
                  CustomPaint(
                    size: const Size(100, 110),
                    painter: _MiniTerrainPainter(
                      routeColor: diffColor,
                      terrainColors: colors.terrain,
                    ),
                  ),
                  // Region tag overlay
                  if (route.region != null)
                    Positioned(
                      left: 6,
                      top: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: colors.glassDark,
                          borderRadius:
                              BorderRadius.circular(KaipaRadius.sm),
                        ),
                        child: Text(
                          route.region!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Content
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Name
                    Text(
                      route.name,
                      style: TextStyle(
                        color: colors.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        letterSpacing: -0.3,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    // Stats row
                    Row(
                      children: [
                        Icon(Icons.straighten,
                            size: 13, color: colors.inkDim),
                        const SizedBox(width: 3),
                        Text(
                          '${route.distanceKm.toStringAsFixed(1)}km',
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Icon(Icons.trending_up,
                            size: 13, color: colors.inkDim),
                        const SizedBox(width: 3),
                        Text(
                          '${route.elevationGainM.toInt()}m',
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Icon(Icons.schedule,
                            size: 13, color: colors.inkDim),
                        const SizedBox(width: 3),
                        Text(
                          _formatDuration(route.estimatedDuration),
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    // Bottom row: difficulty + rating
                    Row(
                      children: [
                        DiffBadge(
                          level: route.difficulty,
                        ),
                        const Spacer(),
                        // Rating stars
                        ...List.generate(5, (i) {
                          return Icon(
                            i < route.rating.round()
                                ? Icons.star_rounded
                                : Icons.star_border_rounded,
                            color: colors.sand,
                            size: 14,
                          );
                        }),
                        const SizedBox(width: 4),
                        Text(
                          route.rating.toStringAsFixed(1),
                          style: TextStyle(
                            color: colors.ink,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Mini Terrain Painter ──────────────────────────────────────────────

class _MiniTerrainPainter extends CustomPainter {
  final Color routeColor;
  final KaipaTerrainColors terrainColors;

  _MiniTerrainPainter({
    required this.routeColor,
    required this.terrainColors,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;

    // Draw terrain layers
    paint.color = terrainColors.lowland;
    final terrainPath = Path()
      ..moveTo(0, size.height * 0.7)
      ..quadraticBezierTo(
        size.width * 0.3,
        size.height * 0.4,
        size.width * 0.5,
        size.height * 0.5,
      )
      ..quadraticBezierTo(
        size.width * 0.7,
        size.height * 0.6,
        size.width,
        size.height * 0.35,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(terrainPath, paint);

    paint.color = terrainColors.mid;
    final midPath = Path()
      ..moveTo(0, size.height * 0.8)
      ..quadraticBezierTo(
        size.width * 0.4,
        size.height * 0.55,
        size.width * 0.6,
        size.height * 0.65,
      )
      ..quadraticBezierTo(
        size.width * 0.8,
        size.height * 0.75,
        size.width,
        size.height * 0.55,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(midPath, paint);

    // Draw route line
    final routePaint = Paint()
      ..color = routeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    final routePath = Path()
      ..moveTo(size.width * 0.1, size.height * 0.75)
      ..quadraticBezierTo(
        size.width * 0.35,
        size.height * 0.45,
        size.width * 0.55,
        size.height * 0.55,
      )
      ..quadraticBezierTo(
        size.width * 0.75,
        size.height * 0.65,
        size.width * 0.9,
        size.height * 0.4,
      );
    canvas.drawPath(routePath, routePaint);

    // Start dot
    canvas.drawCircle(
      Offset(size.width * 0.1, size.height * 0.75),
      3,
      Paint()..color = routeColor,
    );
    // End dot
    canvas.drawCircle(
      Offset(size.width * 0.9, size.height * 0.4),
      3,
      Paint()..color = routeColor,
    );
  }

  @override
  bool shouldRepaint(covariant _MiniTerrainPainter oldDelegate) {
    return routeColor != oldDelegate.routeColor;
  }
}
