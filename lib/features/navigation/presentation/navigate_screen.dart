import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../discover/data/route_repository.dart';
import '../../discover/data/immersive_provider.dart';
import '../../discover/data/map_layer_provider.dart';
import '../../discover/presentation/widgets/layer_picker.dart';
import '../../trip/data/trip_repository.dart';
import '../../trip/data/active_trip_provider.dart';
import '../../trip_plan/data/trip_plan_repository.dart';
import '../../trip_plan/domain/trip_plan_model.dart';
import '../../discover/domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../../core/widgets/kaipa_icons.dart';

class NavigateScreen extends ConsumerStatefulWidget {
  final String routeId;
  final String? tripId;
  final String? planId;

  const NavigateScreen({super.key, required this.routeId, this.tripId, this.planId});

  @override
  ConsumerState<NavigateScreen> createState() => _NavigateScreenState();
}

class _NavigateScreenState extends ConsumerState<NavigateScreen> {
  final MapController _mapController = MapController();
  Timer? _timer;
  int _elapsedSeconds = 0;
  int _zoomLevel = 2;
  bool _showLayerPicker = false;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _elapsedSeconds++);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatTime(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  void _showEndTripSheet() {
    final tokens = ref.read(kaipaTokensProvider);
    final colors = tokens.color;

    showModalBottomSheet(
      context: context,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '确定要结束行程吗？',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  Navigator.pop(ctx);
                  await _endTrip();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFC0392B),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('结束行程'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(
                  '继续',
                  style: TextStyle(color: colors.ink),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _endTrip() async {
    ref.read(activeTripProvider.notifier).state = null;

    final tripId = widget.tripId;
    if (tripId == null) {
      context.go('/discover');
      return;
    }

    try {
      final duration = Duration(seconds: _elapsedSeconds);
      final tripRepo = ref.read(tripRepositoryProvider);
      final route = ref.read(routeByIdProvider(widget.routeId)).valueOrNull;
      final distanceKm = route?.distanceKm ?? 0;
      final elevationM = route?.elevationGainM ?? 0;
      final avgSpeed = duration.inMinutes > 0
          ? distanceKm / (duration.inMinutes / 60.0)
          : 0.0;
      await tripRepo.completeTrip(
        tripId,
        distanceKm: distanceKm,
        elevationM: elevationM,
        duration: duration,
        avgSpeedKmh: avgSpeed,
      );
      if (widget.planId != null) {
        await ref.read(tripPlanRepositoryProvider).updatePlan(
          widget.planId!,
          {'status': 'completed'},
        );
      }
      if (mounted) {
        context.go('/trip-complete/$tripId');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('结束行程失败: $e')),
        );
      }
    }
  }

  void _showTripInfoSheet() {
    final tokens = ref.read(kaipaTokensProvider);
    final colors = tokens.color;

    showModalBottomSheet(
      context: context,
      backgroundColor: colors.bg,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.55,
        minChildSize: 0.3,
        maxChildSize: 0.85,
        expand: false,
        builder: (ctx, scrollController) => _TripInfoContent(
          planId: widget.planId!,
          colors: colors,
          scrollController: scrollController,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(widget.routeId));

    return Scaffold(
      body: routeAsync.when(
        loading: () => _buildLoading(colors),
        error: (error, stack) => _buildError(context, colors, error),
        data: (route) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (ref.read(activeTripProvider) == null) {
              ref.read(activeTripProvider.notifier).state = ActiveTrip(
                routeId: widget.routeId,
                tripId: widget.tripId,
                routeName: route.name,
                startedAt: DateTime.now(),
              );
            }
          });
          return _buildContent(context, tokens, colors, route);
        },
      ),
    );
  }

  Widget _buildLoading(KaipaColors colors) {
    return Container(
      color: colors.bg,
      child: Center(
        child: CircularProgressIndicator(
          color: colors.flare,
          strokeWidth: 2.5,
        ),
      ),
    );
  }

  Widget _buildError(BuildContext context, KaipaColors colors, Object error) {
    return Container(
      color: colors.bg,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              KaipaIcon(
                name: KaipaIcons.alert,
                size: 48,
                color: colors.diff.hard,
              ),
              const SizedBox(height: 16),
              Text(
                '加载路线失败',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: colors.ink,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                error.toString(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: colors.inkMuted,
                ),
              ),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () => context.pop(),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.flare,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '返回',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    KaipaTokens tokens,
    KaipaColors colors,
    RouteModel route,
  ) {
    final center = LatLng(route.latitude, route.longitude);
    final immersive = ref.watch(immersiveModeProvider);
    final layerPrefs = ref.watch(mapLayerPrefsProvider);
    final activeLayer = layerPrefs.activeLayer;
    final topPadding = MediaQuery.of(context).padding.top;
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Stack(
      children: [
        // Full-bleed map
        Positioned.fill(
          child: FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: center,
              initialZoom: 13.5,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all,
              ),
              onTap: (_, _) {
                if (immersive) {
                  ref.read(immersiveModeProvider.notifier).state = false;
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate: activeLayer.urlTemplate,
                userAgentPackageName: 'com.kaipa.app',
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: center,
                    width: 32,
                    height: 32,
                    child: Container(
                      decoration: BoxDecoration(
                        color: colors.flare,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2.5),
                        boxShadow: [
                          BoxShadow(color: colors.flare.withAlpha(80), blurRadius: 12, spreadRadius: 2),
                        ],
                      ),
                      child: const Center(child: KaipaIcon(name: KaipaIcons.flag, size: 14, color: Colors.white)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Back button
        Positioned(
          top: topPadding + 10,
          left: 16,
          child: AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(-1, 0) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: CircleButton(
                  icon: KaipaIcons.chevronLeft,
                  size: 40,
                  iconSize: 16,
                  tokens: tokens,
                  onTap: () => context.go('/discover'),
                ),
              ),
            ),
          ),
        ),

        // Gear & notes button
        if (widget.planId != null)
          Positioned(
            top: topPadding + 10,
            right: 16,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              offset: immersive ? const Offset(1, 0) : Offset.zero,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                opacity: immersive ? 0.0 : 1.0,
                child: IgnorePointer(
                  ignoring: immersive,
                  child: CircleButton(
                    icon: KaipaIcons.backpack,
                    size: 40,
                    iconSize: 18,
                    tokens: tokens,
                    onTap: _showTripInfoSheet,
                  ),
                ),
              ),
            ),
          ),

        // Right-side controls (same as explore page)
        Positioned(
          right: 16,
          top: 200,
          child: AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(1, 0) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _ZoomLevelSelector(
                      selected: _zoomLevel,
                      colors: colors,
                      onSelect: (level) {
                        setState(() => _zoomLevel = level);
                        final zooms = [4.0, 9.5, 14.0];
                        _mapController.move(_mapController.camera.center, zooms[level]);
                      },
                    ),
                    const SizedBox(height: 10),
                    CircleButton(
                      icon: KaipaIcons.layers,
                      size: 44,
                      iconSize: 18,
                      onTap: () => setState(() => _showLayerPicker = !_showLayerPicker),
                    ),
                    const SizedBox(height: 10),
                    CircleButton(
                      icon: KaipaIcons.navigate,
                      size: 44,
                      iconSize: 18,
                      color: colors.flare,
                      onTap: () => _mapController.move(center, 14.0),
                    ),
                    const SizedBox(height: 10),
                    CircleButton(
                      icon: KaipaIcons.fullscreen,
                      size: 44,
                      iconSize: 18,
                      onTap: () {
                        setState(() => _showLayerPicker = false);
                        ref.read(immersiveModeProvider.notifier).state = true;
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),

        // Layer picker popup
        if (_showLayerPicker && !immersive) ...[
          Positioned.fill(
            child: GestureDetector(
              onTap: () => setState(() => _showLayerPicker = false),
              behavior: HitTestBehavior.translucent,
              child: const SizedBox.expand(),
            ),
          ),
          Positioned(
            right: 68,
            top: 200,
            child: LayerPicker(
              colors: colors,
              prefs: layerPrefs,
              onBaseMapChanged: (key) => ref.read(mapLayerPrefsProvider.notifier).setBaseMap(key),
              onToggleRoutes: () => ref.read(mapLayerPrefsProvider.notifier).toggleShowRoutes(),
              onClose: () => setState(() => _showLayerPicker = false),
            ),
          ),
        ],

        // Top HUD
        Positioned(
          top: topPadding + 58,
          left: 16,
          right: 16,
          child: AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(0, -1) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: GlassContainer(
                  tokens: tokens,
                  radius: 20,
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: colors.flare)),
                          const SizedBox(width: 6),
                          Text(
                            '进行中 · ${_formatTime(_elapsedSeconds)}',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: colors.flare, letterSpacing: -0.1),
                          ),
                          const Spacer(),
                          Flexible(child: Text(route.name, style: TextStyle(fontSize: 12, color: colors.inkMuted), overflow: TextOverflow.ellipsis)),
                        ],
                      ),
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Container(height: 0.5, color: colors.line),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(child: StatWidget(value: route.distanceKm.toStringAsFixed(1), unit: 'km', label: '总距离', tokens: tokens)),
                          const SizedBox(width: 8),
                          Expanded(child: StatWidget(value: route.elevationGainM.toInt().toString(), unit: 'm', label: '爬升', tokens: tokens)),
                          const SizedBox(width: 8),
                          Expanded(child: StatWidget(value: '${route.estimatedDuration.inHours}h${route.estimatedDuration.inMinutes % 60 > 0 ? "${route.estimatedDuration.inMinutes % 60}m" : ""}', unit: '', label: '预计时长', tokens: tokens)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // Route info card
        Positioned(
          bottom: bottomPadding + 90,
          left: 16,
          right: 16,
          child: AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(0, 1) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: GlassContainer(
                  tokens: tokens,
                  radius: 16,
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        width: 50, height: 50,
                        decoration: BoxDecoration(
                          color: colors.flareSoft,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: colors.flare.withAlpha(77), width: 0.5),
                        ),
                        child: Center(child: KaipaIcon(name: KaipaIcons.route, size: 22, color: colors.flare)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(route.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3)),
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                '${route.distanceKm.toStringAsFixed(1)}km · ${route.elevationGainM.toInt()}m↑ · ${route.difficulty}',
                                style: TextStyle(fontSize: 12, color: colors.inkMuted),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // Bottom action bar
        Positioned(
          bottom: bottomPadding + 16,
          left: 16,
          right: 16,
          child: AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(0, 1) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: GestureDetector(
                  onTap: _showEndTripSheet,
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: colors.flare,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [BoxShadow(color: colors.flare.withAlpha(80), blurRadius: 16, offset: const Offset(0, 4))],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        KaipaIcon(name: KaipaIcons.check, size: 18, color: Colors.white),
                        const SizedBox(width: 8),
                        const Text('结束行程', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: -0.3)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TripInfoContent extends ConsumerWidget {
  final String planId;
  final KaipaColors colors;
  final ScrollController scrollController;

  const _TripInfoContent({
    required this.planId,
    required this.colors,
    required this.scrollController,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planAsync = ref.watch(tripPlanDetailProvider(planId));

    return planAsync.when(
      loading: () => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: CircularProgressIndicator(color: colors.flare, strokeWidth: 2),
        ),
      ),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text('加载失败', style: TextStyle(color: colors.inkMuted)),
        ),
      ),
      data: (plan) => _buildContent(plan),
    );
  }

  Widget _buildContent(TripPlanModel plan) {
    final gearItems = plan.gearItems;
    final notes = plan.notes;

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      children: [
        // Drag handle
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
        Text(
          '行程信息',
          style: TextStyle(
            color: colors.ink,
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),

        // Gear section
        if (gearItems.isNotEmpty) ...[
          const SizedBox(height: 20),
          Row(
            children: [
              KaipaIcon(name: KaipaIcons.backpack, size: 16, color: colors.flare),
              const SizedBox(width: 8),
              Text(
                '携带装备 · ${gearItems.length}件',
                style: TextStyle(
                  color: colors.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Column(
              children: [
                for (var i = 0; i < gearItems.length; i++) ...[
                  if (i > 0)
                    Divider(height: 0.5, thickness: 0.5, color: colors.line, indent: 56),
                  _GearItemTile(
                    item: gearItems[i],
                    colors: colors,
                  ),
                ],
              ],
            ),
          ),
        ],

        // Notes section
        if (notes != null && notes.isNotEmpty) ...[
          const SizedBox(height: 24),
          Row(
            children: [
              KaipaIcon(name: KaipaIcons.chat, size: 16, color: colors.flare),
              const SizedBox(width: 8),
              Text(
                '备注',
                style: TextStyle(
                  color: colors.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Text(
              notes,
              style: TextStyle(
                color: colors.ink,
                fontSize: 14,
                height: 1.5,
                letterSpacing: -0.1,
              ),
            ),
          ),
        ],

        // Empty state
        if (gearItems.isEmpty && (notes == null || notes.isEmpty))
          Padding(
            padding: const EdgeInsets.only(top: 40),
            child: Center(
              child: Text(
                '暂无装备和备注信息',
                style: TextStyle(color: colors.inkMuted, fontSize: 14),
              ),
            ),
          ),
      ],
    );
  }
}

class _GearItemTile extends StatelessWidget {
  final TripPlanGearItem item;
  final KaipaColors colors;

  const _GearItemTile({required this.item, required this.colors});

  @override
  Widget build(BuildContext context) {
    final gear = item.gearItem;
    final photoUrl = gear?.photoUrl;

    return GestureDetector(
      onTap: () {
        Navigator.of(context).pop();
        context.push('/gear/item/${item.gearItemId}');
      },
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              clipBehavior: Clip.antiAlias,
              child: photoUrl != null && photoUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: photoUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => Center(
                        child: KaipaIcon(name: KaipaIcons.backpack, size: 16, color: colors.flare),
                      ),
                      errorWidget: (_, _, _) => Center(
                        child: KaipaIcon(name: KaipaIcons.backpack, size: 16, color: colors.flare),
                      ),
                    )
                  : Center(
                      child: KaipaIcon(name: KaipaIcons.backpack, size: 16, color: colors.flare),
                    ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    gear?.name ?? '装备',
                    style: TextStyle(
                      color: colors.ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      letterSpacing: -0.1,
                    ),
                  ),
                  if ((gear?.weightG ?? 0) > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '${gear!.weightG!.toInt()}g',
                        style: TextStyle(color: colors.inkDim, fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
            KaipaIcon(name: KaipaIcons.chevronRight, size: 14, color: colors.inkDim),
          ],
        ),
      ),
    );
  }
}

class _ZoomLevelSelector extends StatelessWidget {
  final int selected;
  final KaipaColors colors;
  final ValueChanged<int> onSelect;

  const _ZoomLevelSelector({required this.selected, required this.colors, required this.onSelect});

  static const _icons = [KaipaIcons.compass, KaipaIcons.layers2, KaipaIcons.mountain];

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      radius: 14,
      padding: const EdgeInsets.all(4),
      child: SizedBox(
        width: 44,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final isActive = i == selected;
            return GestureDetector(
              onTap: () => onSelect(i),
              child: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: isActive ? colors.flare : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(child: KaipaIcon(name: _icons[i], size: 18, color: isActive ? Colors.white : colors.ink)),
              ),
            );
          }),
        ),
      ),
    );
  }
}
