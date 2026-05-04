import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';
import '../../../core/widgets/glass_container.dart';
import '../../trip/data/trip_repository.dart';
import '../../trip/domain/trip_model.dart';
import '../data/footprint_repository.dart';
import 'widgets/photo_wall.dart';
import 'widgets/track_replay_map.dart';
import 'widgets/trip_switcher.dart';

class FootprintDetailScreen extends ConsumerStatefulWidget {
  final String tripId;
  const FootprintDetailScreen({super.key, required this.tripId});

  @override
  ConsumerState<FootprintDetailScreen> createState() => _FootprintDetailScreenState();
}

class _FootprintDetailScreenState extends ConsumerState<FootprintDetailScreen> {
  final _notesController = TextEditingController();
  bool _editingNotes = false;
  bool _sharing = false;

  @override
  void dispose() {
    _notesController.dispose();
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
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
      ),
    );
  }

  Widget _buildContent(TripModel trip, KaipaColors colors) {
    final hasPhotos = trip.photos.isNotEmpty;
    final hasTrack = trip.trackGeojson != null;

    return Stack(
      children: [
        CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _buildHeader(trip, colors, hasPhotos, hasTrack)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 16),
                    _buildTitle(trip, colors),
                    if (trip.routeId != null)
                      _buildSwitcherIfNeeded(trip, colors),
                    const SizedBox(height: 16),
                    _buildStatsCard(trip, colors),
                    const SizedBox(height: 16),
                    if (hasTrack) ...[
                      _buildTrackSection(trip, colors),
                      const SizedBox(height: 16),
                    ],
                    if (trip.weatherSummary != null) ...[
                      _buildWeatherCard(trip, colors),
                      const SizedBox(height: 16),
                    ],
                    _buildPhotoSection(trip, colors),
                    const SizedBox(height: 20),
                    _buildNotesSection(trip, colors),
                  ],
                ),
              ),
            ),
          ],
        ),
        Positioned(
          left: 0, right: 0, bottom: 0,
          child: _buildBottomBar(trip, colors),
        ),
        Positioned(
          top: MediaQuery.of(context).padding.top + 8, left: 8,
          child: GestureDetector(
            onTap: () => context.pop(),
            child: GlassContainer(
              radius: 99, padding: const EdgeInsets.all(8),
              child: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
            ),
          ),
        ),
      ],
    );
  }

  // ─── Header ────────────────────────────────────────────────────────
  Widget _buildHeader(TripModel trip, KaipaColors colors, bool hasPhotos, bool hasTrack) {
    return SizedBox(
      height: 260,
      child: hasPhotos
          ? Image.network(trip.photos.first, fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _headerPlaceholder(colors, trip))
          : hasTrack
              ? TrackReplayMap(trackGeojson: trip.trackGeojson!, colors: colors)
              : _headerPlaceholder(colors, trip),
    );
  }

  Widget _headerPlaceholder(KaipaColors colors, TripModel trip) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [colors.mossDeep, colorWithOpacity(colors.flare, 0.7)],
        ),
      ),
      child: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          KaipaIcon(name: KaipaIcons.mountain, size: 48,
            color: Colors.white.withAlpha(120)),
          const SizedBox(height: 12),
          Text(trip.routeName ?? '我的足迹',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white)),
        ]),
      ),
    );
  }

  // ─── Trip Switcher ─────────────────────────────────────────────────
  Widget _buildSwitcherIfNeeded(TripModel trip, KaipaColors colors) {
    final tripsAsync = ref.watch(tripsByRouteProvider(trip.routeId!));
    return tripsAsync.when(
      data: (trips) {
        if (trips.length <= 1) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: 12),
          child: TripSwitcher(
            trips: trips,
            selected: trip,
            colors: colors,
            onSelect: (selected) {
              if (selected.id != trip.id) {
                context.pushReplacement('/footprint/${selected.id}');
              }
            },
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  // ─── Title ─────────────────────────────────────────────────────────
  Widget _buildTitle(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
          child: Text(
            trip.routeName ?? '${trip.startedAt.month}月${trip.startedAt.day}日 徒步',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700,
              color: colors.ink, letterSpacing: -0.6),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: colors.moss.withAlpha(30),
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text('已完成',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.moss)),
        ),
      ]),
      const SizedBox(height: 4),
      Text(
        '${trip.startedAt.year}.${trip.startedAt.month.toString().padLeft(2, '0')}.${trip.startedAt.day.toString().padLeft(2, '0')}',
        style: TextStyle(fontSize: 13, color: colors.inkMuted)),
    ]);
  }

  // ─── Stats ─────────────────────────────────────────────────────────
  Widget _buildStatsCard(TripModel trip, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          KaipaIcon(name: KaipaIcons.altitude, size: 14, color: colors.inkMuted),
          const SizedBox(width: 4),
          Text('行程数据',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _stat('距离', '${trip.actualDistanceKm?.toStringAsFixed(1) ?? "--"} km', colors),
          _stat('爬升', '${trip.actualElevationM?.toInt().toString() ?? "--"} m', colors),
          _stat('用时', trip.actualDuration != null ? _fmtDur(trip.actualDuration!) : '--', colors),
          _stat('均速', '${trip.avgSpeedKmh?.toStringAsFixed(1) ?? "--"} km/h', colors),
        ]),
      ]),
    );
  }

  Widget _stat(String label, String value, KaipaColors colors) {
    return Expanded(
      child: Column(children: [
        Text(value,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700,
            color: colors.ink, letterSpacing: -0.3)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: 11, color: colors.inkDim)),
      ]),
    );
  }

  String _fmtDur(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    return '$h:${m.toString().padLeft(2, '0')}';
  }

  // ─── Track ─────────────────────────────────────────────────────────
  Widget _buildTrackSection(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle(title: 'GPS 轨迹', padding: EdgeInsets.zero),
      const SizedBox(height: 8),
      ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          height: 180,
          child: TrackReplayMap(trackGeojson: trip.trackGeojson!, colors: colors),
        ),
      ),
    ]);
  }

  // ─── Weather ───────────────────────────────────────────────────────
  Widget _buildWeatherCard(TripModel trip, KaipaColors colors) {
    final w = trip.weatherSummary!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          KaipaIcon(name: KaipaIcons.sun, size: 16, color: colors.flare),
          const SizedBox(width: 6),
          Text('天气回顾', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _chip('${w['temperature'] ?? '--'}°C', colors),
          _chip('${w['condition'] ?? '--'}', colors),
          _chip('风 ${w['wind'] ?? '--'}', colors),
        ]),
      ]),
    );
  }

  Widget _chip(String label, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: colors.surfaceHi, borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colors.lineSoft, width: 0.5),
      ),
      child: Text(label, style: TextStyle(fontSize: 12, color: colors.ink)),
    );
  }

  // ─── Photos ────────────────────────────────────────────────────────
  Widget _buildPhotoSection(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle(
        title: '照片', padding: EdgeInsets.zero,
        trailing: Text('${trip.photos.length} 张',
          style: TextStyle(fontSize: 11, color: colors.inkDim)),
      ),
      const SizedBox(height: 8),
      if (trip.photos.isEmpty)
        Text('还没有照片', style: TextStyle(fontSize: 12, color: colors.inkDim)),
      if (trip.photos.isNotEmpty)
        PhotoWall(photos: trip.photos, colors: colors,
          onAdd: () => _onAddPhotos()),
    ]);
  }

  void _onAddPhotos() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('照片选择功能将在后续版本支持')),
    );
  }

  // ─── Notes ─────────────────────────────────────────────────────────
  Widget _buildNotesSection(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: SectionTitle(title: '笔记', padding: EdgeInsets.zero)),
        GestureDetector(
          onTap: () {
            setState(() {
              if (_editingNotes) _saveNotes(trip);
              _editingNotes = !_editingNotes;
            });
          },
          child: Text(_editingNotes ? '保存' : '编辑',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.flare)),
        ),
      ]),
      const SizedBox(height: 8),
      if (_editingNotes)
        TextField(
          controller: _notesController,
          maxLines: 5, minLines: 3,
          style: TextStyle(fontSize: 13, color: colors.ink),
          decoration: InputDecoration(
            hintText: '记录你的感受和回忆…',
            hintStyle: TextStyle(fontSize: 13, color: colors.inkDim),
            filled: true, fillColor: colors.surface,
            contentPadding: const EdgeInsets.all(12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.flare, width: 1)),
          ),
        )
      else
        Text(
          trip.notes?.isNotEmpty == true ? trip.notes! : '暂无笔记',
          style: TextStyle(fontSize: 13,
            color: trip.notes?.isNotEmpty == true ? colors.ink : colors.inkDim),
        ),
    ]);
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

  // ─── Bottom Bar ────────────────────────────────────────────────────
  Widget _buildBottomBar(TripModel trip, KaipaColors colors) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: Row(children: [
        Expanded(
          child: SizedBox(height: 48,
            child: OutlinedButton.icon(
              onPressed: () => context.pop(),
              icon: KaipaIcon(name: KaipaIcons.back, size: 16, color: colors.ink),
              label: Text('返回', style: TextStyle(color: colors.ink)),
              style: OutlinedButton.styleFrom(
                backgroundColor: colors.surface,
                side: BorderSide(color: colors.line, width: 0.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: SizedBox(height: 48,
            child: ElevatedButton.icon(
              onPressed: _sharing ? null : () => _shareTrip(trip),
              icon: _sharing
                  ? const SizedBox(width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const KaipaIcon(name: KaipaIcons.share, size: 16, color: Colors.white),
              label: const Text('分享到社区',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.flare, elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Future<void> _shareTrip(TripModel trip) async {
    setState(() => _sharing = true);
    try {
      await ref.read(footprintRepositoryProvider).shareToFeed(
        tripId: trip.id,
        routeId: trip.routeId,
        content: {
          'route_name': trip.routeName ?? '',
          'distance_km': trip.actualDistanceKm?.toStringAsFixed(1) ?? '',
          'elevation_m': trip.actualElevationM?.toInt().toString() ?? '',
          'duration': trip.actualDuration?.inHours.toString() ?? '',
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
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }
}
