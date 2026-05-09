import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:file_picker/file_picker.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/circle_button.dart';
import '../../trip/data/trip_repository.dart';
import '../../trip/domain/trip_model.dart';
import '../../gear/data/gear_repository.dart';
import '../../gear/domain/gear_item_model.dart';
import '../data/footprint_repository.dart';
import 'widgets/photo_wall.dart';
import 'widgets/track_replay_map.dart';
import 'widgets/trip_switcher.dart';

class FootprintDetailScreen extends ConsumerStatefulWidget {
  final String tripId;
  const FootprintDetailScreen({super.key, required this.tripId});

  @override
  ConsumerState<FootprintDetailScreen> createState() =>
      _FootprintDetailScreenState();
}

class _FootprintDetailScreenState extends ConsumerState<FootprintDetailScreen>
    with SingleTickerProviderStateMixin {
  final _notesController = TextEditingController();
  bool _editingNotes = false;
  TabController? _tabController;
  int _previousTabCount = -1;

  @override
  void dispose() {
    _notesController.dispose();
    _tabController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final tripAsync = ref.watch(tripByIdProvider(widget.tripId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: tripAsync.when(
        data: (trip) {
          if (_notesController.text.isEmpty) {
            _notesController.text = trip.notes ?? '';
          }
          return _buildContent(trip, colors);
        },
        loading: () => _buildLoadingSkeleton(colors),
        error: (_, _) => _buildError(colors),
      ),
    );
  }

  // ─── Loading Skeleton ─────────────────────────────────────────────────
  Widget _buildLoadingSkeleton(KaipaColors colors) {
    final headerH =
        (MediaQuery.of(context).size.height * 0.35).clamp(240.0, 320.0);
    return Column(
      children: [
        Container(height: headerH, color: colors.surfaceHi),
        const SizedBox(height: 16),
        SizedBox(
          height: 94,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: List.generate(
                4,
                (_) => Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: _shimmerBar(colors, 88, 94),
                    )),
          ),
        ),
        const SizedBox(height: 28),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _shimmerBar(colors, 100, 16),
                const SizedBox(height: 14),
                _shimmerBar(colors, double.infinity, 70),
                const SizedBox(height: 28),
                _shimmerBar(colors, 80, 16),
                const SizedBox(height: 14),
                _shimmerBar(colors, double.infinity, 120),
              ]),
        ),
      ],
    );
  }

  Widget _shimmerBar(KaipaColors colors, double width, double height) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: colors.surfaceHi,
        borderRadius: BorderRadius.circular(12),
      ),
    );
  }

  Widget _buildError(KaipaColors colors) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        KaipaIcon(name: KaipaIcons.alert, size: 40, color: colors.inkDim),
        const SizedBox(height: 12),
        Text('加载失败',
            style: TextStyle(fontSize: 15, color: colors.inkMuted)),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: () => ref.invalidate(tripByIdProvider(widget.tripId)),
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            decoration: BoxDecoration(
              color: colors.flare,
              borderRadius: BorderRadius.circular(99),
            ),
            child: const Text('重试',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white)),
          ),
        ),
      ]),
    );
  }

  // ─── Main Content ─────────────────────────────────────────────────────
  Widget _buildContent(TripModel trip, KaipaColors colors) {
    final hasTrack = trip.trackGeojson != null;
    final hasWeather = trip.weatherSummary != null;

    final tabSpecs = <_TabSpec>[
      const _TabSpec(label: '装备'),
      if (hasTrack) const _TabSpec(label: '轨迹'),
      if (hasWeather) const _TabSpec(label: '天气'),
      const _TabSpec(label: '照片'),
      const _TabSpec(label: '笔记'),
    ];

    if (_tabController == null || tabSpecs.length != _previousTabCount) {
      _tabController?.dispose();
      _tabController =
          TabController(length: tabSpecs.length, vsync: this);
      _previousTabCount = tabSpecs.length;
    }

    final tabContents = <Widget>[
      SingleChildScrollView(child: _buildGearSection(trip, colors)),
      if (hasTrack)
        SingleChildScrollView(child: _buildTrackSection(trip, colors)),
      if (hasWeather)
        SingleChildScrollView(child: _buildWeatherSection(trip, colors)),
      SingleChildScrollView(child: _buildPhotosSection(trip, colors)),
      SingleChildScrollView(child: _buildNotesSection(trip, colors)),
    ];

    return Stack(
      children: [
        RefreshIndicator(
          color: colors.flare,
          backgroundColor: colors.surface,
          onRefresh: () async {
            ref.invalidate(tripByIdProvider(widget.tripId));
          },
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _buildHeader(trip, colors),
              const SizedBox(height: 16),
              _buildStatsRow(trip, colors),
              if (trip.routeId != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: _buildSwitcherIfNeeded(trip, colors),
                ),
              const SizedBox(height: 20),
              _buildTabBar(tabSpecs, colors),
              SizedBox(
                height: _tabContentHeight(),
                child: TabBarView(
                  controller: _tabController,
                  children: tabContents,
                ),
              ),
            ],
          ),
        ),
        // Floating top chrome
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 12,
          right: 12,
          child: Row(
            children: [
              CircleButton(
                icon: KaipaIcons.back,
                onTap: () => context.pop(),
              ),
              const Spacer(),
              CircleButton(
                icon: KaipaIcons.trash,
                color: const Color(0xFFDC2626),
                onTap: () => _confirmDelete(trip, colors),
              ),
              const SizedBox(width: 8),
              CircleButton(
                icon: KaipaIcons.share,
                onTap: () => _shareTrip(trip),
              ),
            ],
          ),
        ),
      ],
    );
  }

  double _tabContentHeight() {
    final screenHeight = MediaQuery.of(context).size.height;
    final headerH =
        (screenHeight * 0.35).clamp(240.0, 320.0);
    final usedHeight = headerH + 16 + 100 + 20 + 48 + 40;
    return (screenHeight - usedHeight).clamp(280.0, 600.0);
  }

  // ─── Tab Bar ──────────────────────────────────────────────────────────
  Widget _buildTabBar(List<_TabSpec> tabs, KaipaColors colors) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.surfaceHi,
        borderRadius: BorderRadius.circular(12),
      ),
      child: TabBar(
        controller: _tabController,
        isScrollable: false,
        labelStyle:
            const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
        unselectedLabelStyle:
            const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
        labelColor: Colors.white,
        unselectedLabelColor: colors.inkDim,
        indicator: BoxDecoration(
          color: colors.flare,
          borderRadius: BorderRadius.circular(9),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerHeight: 0,
        labelPadding: EdgeInsets.zero,
        splashFactory: NoSplash.splashFactory,
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        tabs: tabs
            .map((t) => Tab(
                  height: 34,
                  child: Text(t.label),
                ))
            .toList(),
      ),
    );
  }

  // ─── Hero Header ─────────────────────────────────────────────────────
  Widget _buildHeader(TripModel trip, KaipaColors colors) {
    final headerHeight =
        (MediaQuery.of(context).size.height * 0.35).clamp(240.0, 320.0);
    final hasPhotos = trip.photos.isNotEmpty;
    final hasTrack = trip.trackGeojson != null;
    final coverUrl = trip.coverPhotoUrl;

    final background = coverUrl != null
        ? Image.network(coverUrl,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) =>
                _headerBackground(trip, colors, hasPhotos, hasTrack))
        : _headerBackground(trip, colors, hasPhotos, hasTrack);

    return SizedBox(
      height: headerHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          background,
          // Gradient overlay for readability
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0.0, 0.35, 0.55, 1.0],
                  colors: [
                    const Color(0x70000000),
                    Colors.transparent,
                    Colors.transparent,
                    const Color(0xA0000000),
                  ],
                ),
              ),
            ),
          ),
          // Title + date + badge overlay
          Positioned(
            left: 20,
            right: 64,
            bottom: 20,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withAlpha(25),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(
                        color: Colors.white.withAlpha(40), width: 0.5),
                  ),
                  child: const Text('已完成',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white)),
                ),
                const SizedBox(height: 10),
                Text(
                  trip.routeName ??
                      '${trip.startedAt.month}月${trip.startedAt.day}日 徒步',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    letterSpacing: -0.6,
                    shadows: [
                      Shadow(color: Color(0x50000000), blurRadius: 12)
                    ],
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  '${trip.startedAt.year}.${trip.startedAt.month.toString().padLeft(2, '0')}.${trip.startedAt.day.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.white.withAlpha(190),
                    shadows: const [
                      Shadow(color: Color(0x40000000), blurRadius: 6)
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Edit cover button
          Positioned(
            right: 16,
            bottom: 16,
            child: GestureDetector(
              onTap: () => _showCoverPicker(trip, colors, hasPhotos),
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(100),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withAlpha(30)),
                ),
                child: Center(
                  child: Icon(Icons.camera_alt_rounded,
                      color: Colors.white.withAlpha(200), size: 16),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _headerBackground(
      TripModel trip, KaipaColors colors, bool hasPhotos, bool hasTrack) {
    if (hasPhotos) {
      return Image.network(trip.photos.first,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _headerPlaceholder(colors, trip));
    }
    if (hasTrack) {
      return TrackReplayMap(
          trackGeojson: trip.trackGeojson!, colors: colors);
    }
    return _headerPlaceholder(colors, trip);
  }

  Widget _headerPlaceholder(KaipaColors colors, TripModel trip) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.mossDeep, colorWithOpacity(colors.flare, 0.7)],
        ),
      ),
      child: Center(
        child: KaipaIcon(
            name: KaipaIcons.mountain,
            size: 56,
            color: Colors.white.withAlpha(80)),
      ),
    );
  }

  // ─── Stats Row ────────────────────────────────────────────────────────
  Widget _buildStatsRow(TripModel trip, KaipaColors colors) {
    final stats = <_StatItem>[
      _StatItem(
          icon: KaipaIcons.ruler,
          value: trip.actualDistanceKm != null
              ? '${trip.actualDistanceKm!.toStringAsFixed(1)} km'
              : '--',
          label: '距离',
          tint: colors.sky),
      _StatItem(
          icon: KaipaIcons.altitude,
          value: trip.actualElevationM != null
              ? '${trip.actualElevationM!.toInt()} m'
              : '--',
          label: '爬升',
          tint: colors.moss),
      _StatItem(
          icon: KaipaIcons.clock,
          value: trip.actualDuration != null
              ? _fmtDur(trip.actualDuration!)
              : '--',
          label: '用时',
          tint: colors.sand),
      _StatItem(
          icon: KaipaIcons.hiker,
          value: trip.avgSpeedKmh != null
              ? trip.avgSpeedKmh!.toStringAsFixed(1)
              : '--',
          label: '均速 km/h',
          tint: colors.flare),
      if (trip.maxAltitudeM != null)
        _StatItem(
            icon: KaipaIcons.mountain,
            value: '${trip.maxAltitudeM!.toInt()} m',
            label: '最高海拔',
            tint: colors.sky),
      if (trip.caloriesBurned != null && trip.caloriesBurned! > 0)
        _StatItem(
            icon: KaipaIcons.flame,
            value: '${trip.caloriesBurned!.toInt()}',
            label: 'kcal',
            tint: colors.flare),
    ];

    return SizedBox(
      height: 100,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: stats.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, i) => _statChip(stats[i], colors),
      ),
    );
  }

  Widget _statChip(_StatItem item, KaipaColors colors) {
    return Container(
      width: 88,
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: colorWithOpacity(item.tint, 0.12),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Center(
              child: KaipaIcon(name: item.icon, size: 15, color: item.tint),
            ),
          ),
          const SizedBox(height: 8),
          Text(item.value,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.3),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(item.label,
              style: TextStyle(fontSize: 10, color: colors.inkDim),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  String _fmtDur(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    return '$h:${m.toString().padLeft(2, '0')}';
  }

  // ─── Trip Switcher ────────────────────────────────────────────────────
  Widget _buildSwitcherIfNeeded(TripModel trip, KaipaColors colors) {
    final tripsAsync = ref.watch(tripsByRouteProvider(trip.routeId!));
    return tripsAsync.when(
      data: (trips) {
        if (trips.length <= 1) return const SizedBox.shrink();
        return TripSwitcher(
          trips: trips,
          selected: trip,
          colors: colors,
          onSelect: (selected) {
            if (selected.id != trip.id) {
              context.pushReplacement('/footprint/${selected.id}');
            }
          },
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  // ─── Track Section ────────────────────────────────────────────────────
  Widget _buildTrackSection(TripModel trip, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: 200,
          child:
              TrackReplayMap(trackGeojson: trip.trackGeojson!, colors: colors),
        ),
      ),
    );
  }

  // ─── Gear Section ─────────────────────────────────────────────────────
  Widget _buildGearSection(TripModel trip, KaipaColors colors) {
    if (trip.gearUsed.isEmpty) {
      return _buildEmptyState(
          icon: KaipaIcons.backpack,
          message: '暂无装备记录',
          hint: '在装备库中挑选装备后\n会自动关联到此足迹',
          colors: colors,
          actionLabel: '前往装备库',
          onAction: () => context.push('/gear'));
    }

    final itemsAsync = ref.watch(gearItemsByIdsProvider(trip.gearUsed));
    final categoriesAsync = ref.watch(gearCategoriesProvider);

    return itemsAsync.when(
      data: (items) => categoriesAsync.when(
        data: (categories) {
          final categoryMap = {for (final c in categories) c.id: c.name};
          final grouped = <String, List<GearItemModel>>{};
          for (final item in items) {
            grouped.putIfAbsent(item.categoryId, () => []).add(item);
          }
          final totalWeight =
              items.fold<double>(0, (sum, i) => sum + (i.weightG ?? 0));

          return _buildGearList(
            items: items,
            grouped: grouped,
            categoryMap: categoryMap,
            totalWeight: totalWeight,
            colors: colors,
          );
        },
        loading: () => const Center(
            child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(strokeWidth: 2))),
        error: (_, _) => const SizedBox.shrink(),
      ),
      loading: () => const Center(
          child: Padding(
              padding: EdgeInsets.all(32),
              child: CircularProgressIndicator(strokeWidth: 2))),
      error: (_, _) => _buildEmptyState(
          icon: KaipaIcons.alert,
          message: '装备加载失败',
          hint: '请检查网络后重试',
          colors: colors),
    );
  }

  Widget _buildGearList({
    required List<GearItemModel> items,
    required Map<String, List<GearItemModel>> grouped,
    required Map<String, String> categoryMap,
    required double totalWeight,
    required KaipaColors colors,
  }) {
    final totalValue =
        items.fold<double>(0, (sum, i) => sum + (i.price ?? 0));

    String fmtPrice(double? price) {
      if (price == null || price == 0) return '';
      if (price >= 10000) return '¥${(price / 10000).toStringAsFixed(1)}w';
      return '¥${price.toInt()}';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Summary bar
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: colors.surfaceHi,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(children: [
                Text('${items.length} 件',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.inkMuted)),
                const SizedBox(width: 12),
                Text('${(totalWeight / 1000).toStringAsFixed(2)} kg',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: colors.ink)),
                if (totalValue > 0) ...[
                  const Spacer(),
                  Text(fmtPrice(totalValue),
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: colors.flare)),
                ],
              ]),
            ),
            const SizedBox(height: 14),
            for (final entry in grouped.entries) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 6, top: 4),
                child: Text(categoryMap[entry.key] ?? '其他',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: colors.inkDim)),
              ),
              ...entry.value.map((item) => GestureDetector(
                    onTap: () => context.push('/gear/item/${item.id}'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          vertical: 7, horizontal: 4),
                      child: Row(children: [
                        Container(
                          width: 6,
                          height: 6,
                          margin: const EdgeInsets.only(right: 10),
                          decoration: BoxDecoration(
                              color: colors.flare, shape: BoxShape.circle),
                        ),
                        Expanded(
                          child: Text(item.name,
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: colors.ink)),
                        ),
                        if (item.brand != null)
                          Text(item.brand!,
                              style: TextStyle(
                                  fontSize: 11, color: colors.inkDim)),
                        if (item.weightG != null) ...[
                          const SizedBox(width: 8),
                          Text('${item.weightG!.toInt()}g',
                              style: TextStyle(
                                  fontSize: 11, color: colors.inkMuted)),
                        ],
                        if (item.price != null && item.price! > 0) ...[
                          const SizedBox(width: 8),
                          Text(fmtPrice(item.price),
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: colors.flare)),
                        ],
                      ]),
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }

  // ─── Weather Section ──────────────────────────────────────────────────
  Widget _buildWeatherSection(TripModel trip, KaipaColors colors) {
    final w = trip.weatherSummary!;
    final temp = w['temperature']?.toString();
    final condition = w['condition']?.toString();
    final wind = w['wind']?.toString();

    final weatherItems = <_WeatherItem>[
      if (temp != null)
        _WeatherItem(icon: KaipaIcons.sun, value: '$temp°C', label: '温度'),
      if (condition != null)
        _WeatherItem(
            icon: KaipaIcons.weather, value: condition, label: '天气'),
      if (wind != null)
        _WeatherItem(icon: KaipaIcons.flag, value: wind, label: '风力'),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: weatherItems
            .map((item) => Expanded(
                  child: Container(
                    margin: EdgeInsets.only(
                        right: item == weatherItems.last ? 0 : 10),
                    padding: const EdgeInsets.symmetric(
                        vertical: 14, horizontal: 8),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: colors.line, width: 0.5),
                    ),
                    child: Column(
                      children: [
                        KaipaIcon(
                            name: item.icon,
                            size: 18,
                            color: colors.sky),
                        const SizedBox(height: 8),
                        Text(item.value,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: colors.ink),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(item.label,
                            style: TextStyle(
                                fontSize: 10, color: colors.inkDim)),
                      ],
                    ),
                  ),
                ))
            .toList(),
      ),
    );
  }

  // ─── Photos Section ───────────────────────────────────────────────────
  Widget _buildPhotosSection(TripModel trip, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: trip.photos.isEmpty
          ? _buildEmptyState(
              icon: KaipaIcons.camera,
              message: '还没有照片',
              hint: '上传照片记录旅途中的\n精彩瞬间和风景',
              colors: colors,
              actionLabel: '添加照片',
              onAction: () => _pickAndUploadPhotos(trip),
            )
          : PhotoWall(
              photos: trip.photos,
              colors: colors,
              onAdd: () => _pickAndUploadPhotos(trip),
              onDelete: (url) => _onRemovePhoto(trip, url),
              onTap: (url, index) => _viewPhoto(trip, index),
            ),
    );
  }

  void _viewPhoto(TripModel trip, int index) {
    showDialog(
      context: context,
      builder: (ctx) {
        final colors = ref.read(kaipaTokensProvider).color;
        return Stack(
          children: [
            GestureDetector(
              onTap: () => Navigator.pop(ctx),
              child: Container(color: Colors.black.withAlpha(230)),
            ),
            Center(
              child: InteractiveViewer(
                child: Image.network(trip.photos[index],
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => Container(
                        color: colors.surfaceHi,
                        child: Center(
                            child: KaipaIcon(
                                name: KaipaIcons.image,
                                size: 48,
                                color: colors.inkDim)))),
              ),
            ),
            Positioned(
              top: MediaQuery.of(ctx).padding.top + 12,
              left: 16,
              right: 16,
              child: Row(
                children: [
                  CircleButton(
                    icon: KaipaIcons.close,
                    dark: true,
                    onTap: () => Navigator.pop(ctx),
                  ),
                  const Spacer(),
                  Text('${index + 1} / ${trip.photos.length}',
                      style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 13,
                          fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  // ─── Notes Section ────────────────────────────────────────────────────
  Widget _buildNotesSection(TripModel trip, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Spacer(),
          GestureDetector(
            onTap: () {
              setState(() {
                if (_editingNotes) _saveNotes(trip);
                _editingNotes = !_editingNotes;
              });
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: _editingNotes ? colors.flare : colors.surface,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(
                    color: _editingNotes ? colors.flare : colors.line,
                    width: 0.5),
              ),
              child: Text(_editingNotes ? '保存' : '编辑',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: _editingNotes
                          ? Colors.white
                          : colors.flare)),
            ),
          ),
        ]),
        const SizedBox(height: 10),
        if (_editingNotes) ...[
          TextField(
            controller: _notesController,
            maxLines: 6,
            minLines: 4,
            style: TextStyle(fontSize: 14, color: colors.ink, height: 1.6),
            decoration: InputDecoration(
              hintText: '记录你的感受和回忆...',
              hintStyle: TextStyle(fontSize: 14, color: colors.inkDim),
              filled: true,
              fillColor: colors.surface,
              contentPadding: const EdgeInsets.all(14),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none),
              focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide:
                      BorderSide(color: colors.flare, width: 1.5)),
            ),
          ),
          const SizedBox(height: 8),
          Text('${_notesController.text.length} 字',
              style: TextStyle(fontSize: 11, color: colors.inkDim)),
        ] else if (trip.notes?.isNotEmpty == true)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Text(trip.notes!,
                style: TextStyle(
                    fontSize: 14,
                    color: colors.ink,
                    height: 1.6)),
          )
        else
          _buildEmptyState(
              icon: KaipaIcons.bookmark,
              message: '暂无笔记',
              hint: '记录旅途中的感受、见闻和回忆',
              colors: colors,
              compact: true,
              actionLabel: '写笔记',
              onAction: () => setState(() => _editingNotes = true)),
      ]),
    );
  }

  Future<void> _saveNotes(TripModel trip) async {
    try {
      await ref.read(footprintRepositoryProvider).updateMemory(
            tripId: trip.id,
            notes: _notesController.text,
          );
      ref.invalidate(tripByIdProvider(trip.id));
    } catch (_) {}
  }

  // ─── Empty State ──────────────────────────────────────────────────────
  Widget _buildEmptyState({
    required String icon,
    required String message,
    required String hint,
    required KaipaColors colors,
    String? actionLabel,
    VoidCallback? onAction,
    bool compact = false,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: compact ? 20 : 32),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: compact ? 44 : 52,
          height: compact ? 44 : 52,
          decoration: BoxDecoration(
            color: colors.surfaceHi,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Center(
            child: KaipaIcon(
                name: icon,
                size: compact ? 22 : 26,
                color: colors.inkDim),
          ),
        ),
        const SizedBox(height: 12),
        Text(message,
            style: TextStyle(
                fontSize: compact ? 14 : 15,
                fontWeight: FontWeight.w600,
                color: colors.inkMuted)),
        const SizedBox(height: 6),
        Text(hint,
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 12, color: colors.inkDim, height: 1.5)),
        if (actionLabel != null && onAction != null) ...[
          const SizedBox(height: 14),
          GestureDetector(
            onTap: onAction,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(color: colors.flare, width: 0.5),
              ),
              child: Text(actionLabel,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.flare)),
            ),
          ),
        ],
      ]),
    );
  }

  // ─── Cover Picker ─────────────────────────────────────────────────────
  void _showCoverPicker(TripModel trip, KaipaColors colors, bool hasPhotos) {
    showModalBottomSheet(
      context: context,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text('自定义封面',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: colors.ink)),
                const SizedBox(height: 16),
                if (hasPhotos) ...[
                  Text('从行程照片选择',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.inkDim)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 80,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: trip.photos.length + 1,
                      separatorBuilder: (_, _) => const SizedBox(width: 10),
                      itemBuilder: (_, i) {
                        if (i == trip.photos.length) {
                          return _uploadTile(colors, () {
                            Navigator.pop(ctx);
                            _pickAndUploadCover(trip);
                          });
                        }
                        return _photoTile(
                            trip.photos[i], trip, colors, ctx);
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (!hasPhotos)
                  _uploadRow(colors, () {
                    Navigator.pop(ctx);
                    _pickAndUploadCover(trip);
                  }),
                if (trip.coverPhotoUrl != null) ...[
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: () async {
                      await ref
                          .read(footprintRepositoryProvider)
                          .setCoverPhoto(
                            tripId: trip.id,
                            photoUrl: null,
                          );
                      ref.invalidate(tripByIdProvider(trip.id));
                      if (ctx.mounted) Navigator.pop(ctx);
                    },
                    icon: const Icon(Icons.refresh,
                        size: 16, color: Color(0xFFDC2626)),
                    label: const Text('恢复默认',
                        style: TextStyle(color: Color(0xFFDC2626))),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _photoTile(
      String url, TripModel trip, KaipaColors colors, BuildContext ctx) {
    final isSelected = url == trip.coverPhotoUrl;
    return GestureDetector(
      onTap: () async {
        await ref.read(footprintRepositoryProvider).setCoverPhoto(
              tripId: trip.id,
              photoUrl: url,
            );
        ref.invalidate(tripByIdProvider(trip.id));
        if (ctx.mounted) Navigator.pop(ctx);
      },
      child: Container(
        width: 80,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: isSelected ? colors.flare : colors.line,
              width: isSelected ? 2 : 0.5),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(9),
          child: Image.network(url,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) =>
                  Container(color: colors.surfaceHi)),
        ),
      ),
    );
  }

  Widget _uploadTile(KaipaColors colors, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 80,
        decoration: BoxDecoration(
          color: colors.surfaceHi,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: colors.line,
              width: 0.5,
              strokeAlign: BorderSide.strokeAlignInside),
        ),
        child: Center(
          child: KaipaIcon(
              name: KaipaIcons.plus, size: 22, color: colors.inkDim),
        ),
      ),
    );
  }

  Widget _uploadRow(KaipaColors colors, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surfaceHi,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(children: [
          KaipaIcon(
              name: KaipaIcons.upload, size: 18, color: colors.flare),
          const SizedBox(width: 10),
          Text('从设备上传',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: colors.ink)),
        ]),
      ),
    );
  }

  Future<void> _pickAndUploadCover(TripModel trip) async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
      );
      if (result == null || result.files.isEmpty) return;
      final filePath = result.files.single.path;
      final fileName = result.files.single.name;
      if (filePath == null) return;

      await ref.read(footprintRepositoryProvider).uploadCoverPhoto(
            tripId: trip.id,
            filePath: filePath,
            fileName: fileName,
          );
      ref.invalidate(tripByIdProvider(trip.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('封面已更新')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('上传失败: $e')));
      }
    }
  }

  // ─── Photo Upload ─────────────────────────────────────────────────────
  Future<void> _pickAndUploadPhotos(TripModel trip) async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
        allowMultiple: true,
      );
      if (result == null || result.files.isEmpty) return;

      final repo = ref.read(footprintRepositoryProvider);
      final newUrls = <String>[];
      for (final file in result.files) {
        if (file.path == null) continue;
        final url = await repo.uploadPhoto(
          tripId: trip.id,
          filePath: file.path!,
          fileName: file.name,
        );
        newUrls.add(url);
      }
      if (newUrls.isEmpty) return;

      final updatedPhotos = [...trip.photos, ...newUrls];
      await repo.updateMemory(tripId: trip.id, photos: updatedPhotos);
      ref.invalidate(tripByIdProvider(trip.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('已添加 ${newUrls.length} 张照片')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('上传失败: $e')));
      }
    }
  }

  Future<void> _onRemovePhoto(TripModel trip, String photoUrl) async {
    try {
      final updated = trip.photos.where((p) => p != photoUrl).toList();
      await ref.read(footprintRepositoryProvider).updateMemory(
            tripId: trip.id,
            photos: updated,
          );
      ref.invalidate(tripByIdProvider(trip.id));
    } catch (_) {}
  }

  // ─── Actions ──────────────────────────────────────────────────────────
  Future<void> _confirmDelete(TripModel trip, KaipaColors colors) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('删除足迹',
            style: TextStyle(
                color: colors.ink,
                fontSize: 17,
                fontWeight: FontWeight.w700)),
        content: Text(
            '确定要永久删除「${trip.routeName ?? "此足迹"}」吗？此操作不可撤销。',
            style: TextStyle(
                color: colors.inkMuted, fontSize: 14, height: 1.4)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('取消',
                style: TextStyle(
                    color: colors.inkMuted,
                    fontWeight: FontWeight.w600)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('删除',
                style: TextStyle(
                    color: Colors.red, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(tripRepositoryProvider).deleteTrip(trip.id);
      ref.invalidate(footprintMemoriesProvider);
      if (mounted) context.pop();
    }
  }

  Future<void> _shareTrip(TripModel trip) async {
    try {
      await ref.read(footprintRepositoryProvider).shareToFeed(
            tripId: trip.id,
            routeId: trip.routeId,
            content: {
              'route_name': trip.routeName ?? '',
              'distance_km':
                  trip.actualDistanceKm?.toStringAsFixed(1) ?? '',
              'elevation_m':
                  trip.actualElevationM?.toInt().toString() ?? '',
              'duration':
                  trip.actualDuration?.inHours.toString() ?? '',
              'notes': trip.notes ?? '',
              'photos': trip.photos,
            },
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('已分享到社区')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('分享失败: $e')));
      }
    }
  }
}

// ─── Private helpers ────────────────────────────────────────────────────
class _TabSpec {
  final String label;
  const _TabSpec({required this.label});
}

class _StatItem {
  final String icon;
  final String value;
  final String label;
  final Color tint;
  const _StatItem(
      {required this.icon,
      required this.value,
      required this.label,
      required this.tint});
}

class _WeatherItem {
  final String icon;
  final String value;
  final String label;
  const _WeatherItem(
      {required this.icon, required this.value, required this.label});
}
