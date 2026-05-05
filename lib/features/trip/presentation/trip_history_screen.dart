import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';
import '../data/trip_repository.dart';
import '../domain/trip_model.dart';

class TripHistoryScreen extends ConsumerStatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  ConsumerState<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends ConsumerState<TripHistoryScreen> {
  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final tripsAsync = ref.watch(allTripsProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text(
          '线路历史',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: colors.ink,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: KaipaIcon(name: KaipaIcons.plus, size: 20, color: colors.ink),
            onPressed: () => context.push('/manual-trip-entry'),
          ),
        ],
      ),
      body: tripsAsync.when(
        data: (trips) {
          if (trips.isEmpty) {
            return Center(
              child: Text(
                '还没有行程记录',
                style: TextStyle(fontSize: 13, color: colors.inkMuted),
              ),
            );
          }

          final grouped = _groupByMonth(trips);

          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            itemCount: grouped.length,
            itemBuilder: (context, index) {
              final entry = grouped[index];
              return _MonthSection(
                label: entry.label,
                count: entry.trips.length,
                trips: entry.trips,
                colors: colors,
                tokens: tokens,
                onDelete: (trip) => _confirmDelete(context, trip, colors),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Text(
            '加载失败',
            style: TextStyle(fontSize: 13, color: colors.inkMuted),
          ),
        ),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, TripModel trip, KaipaColors colors) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: const Text('删除行程'),
        content: Text('确定要永久删除「${trip.routeName ?? "此行程"}」吗？此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('取消', style: TextStyle(color: colors.inkMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(tripRepositoryProvider).deleteTrip(trip.id);
      ref.invalidate(allTripsProvider);
    }
  }

  List<_MonthGroup> _groupByMonth(List<TripModel> trips) {
    final map = <String, List<TripModel>>{};
    for (final t in trips) {
      final key = '${t.startedAt.year}-${t.startedAt.month.toString().padLeft(2, '0')}';
      map.putIfAbsent(key, () => []).add(t);
    }
    final sorted = map.entries.toList()
      ..sort((a, b) => b.key.compareTo(a.key));

    return sorted.map((e) {
      final parts = e.key.split('-');
      final year = parts[0];
      final month = int.parse(parts[1]);
      return _MonthGroup(
        label: '$year年$month月',
        trips: e.value,
      );
    }).toList();
  }
}

class _MonthGroup {
  final String label;
  final List<TripModel> trips;
  const _MonthGroup({required this.label, required this.trips});
}

class _MonthSection extends StatelessWidget {
  final String label;
  final int count;
  final List<TripModel> trips;
  final KaipaColors colors;
  final KaipaTokens tokens;
  final void Function(TripModel) onDelete;

  const _MonthSection({
    required this.label,
    required this.count,
    required this.trips,
    required this.colors,
    required this.tokens,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 12),
        SectionTitle(
          title: label,
          padding: EdgeInsets.zero,
          tokens: tokens,
          trailing: Text(
            '$count次',
            style: TextStyle(fontSize: 11, color: colors.inkDim),
          ),
        ),
        const SizedBox(height: 8),
        ...trips.map((t) => Dismissible(
          key: Key(t.id),
          direction: DismissDirection.endToStart,
          confirmDismiss: (_) async {
            onDelete(t);
            return false;
          },
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: Colors.red,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Text('删除', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
          ),
          child: _TripCard(trip: t, colors: colors),
        )),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _TripCard extends StatelessWidget {
  final TripModel trip;
  final KaipaColors colors;

  const _TripCard({required this.trip, required this.colors});

  @override
  Widget build(BuildContext context) {
    final t = trip;
    final isManual = t.source == 'manual';
    final dateStr =
        '${t.startedAt.year}.${t.startedAt.month.toString().padLeft(2, '0')}.${t.startedAt.day.toString().padLeft(2, '0')}';
    final distStr = t.actualDistanceKm?.toStringAsFixed(1) ?? '–';
    final elevStr = t.actualElevationM?.round().toString() ?? '–';
    final title = t.routeName ?? '${t.startedAt.month}月${t.startedAt.day}日';
    final subtitle = t.routeName != null
        ? '$dateStr  ·  ${distStr}km  ·  ↑${elevStr}m'
        : '${distStr}km  ·  ↑${elevStr}m';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: isManual ? null : () => context.push('/discover/route/${t.routeId}'),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: colors.terrain.lowland,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: KaipaIcon(
                    name: KaipaIcons.mountain,
                    size: 20,
                    color: colors.mossDeep,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: colors.ink,
                              letterSpacing: -0.2,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isManual) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: colors.sand,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              '手动',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: colors.ink,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (!isManual)
                KaipaIcon(
                  name: KaipaIcons.forward,
                  size: 14,
                  color: colors.inkDim,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
