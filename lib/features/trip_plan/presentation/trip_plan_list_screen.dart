import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/theme_provider.dart';
import '../data/trip_plan_repository.dart';
import '../domain/trip_plan_model.dart';

class TripPlanListScreen extends ConsumerWidget {
  const TripPlanListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final plansAsync = ref.watch(tripPlanListProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => context.pop(),
                    child: Icon(Icons.arrow_back, color: colors.textPrimary),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '我的行程计划',
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: plansAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text('加载失败',
                      style: TextStyle(color: colors.textSecondary)),
                ),
                data: (plans) => plans.isEmpty
                    ? _buildEmpty(colors)
                    : _buildList(context, ref, plans, colors),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(dynamic colors) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('📋', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          Text(
            '还没有行程计划',
            style: TextStyle(color: colors.textSecondary, fontSize: 15),
          ),
          const SizedBox(height: 4),
          Text(
            '去发现页面找条路线，开始规划吧',
            style: TextStyle(color: colors.textTertiary, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildList(BuildContext context, WidgetRef ref,
      List<TripPlanModel> plans, dynamic colors) {
    final upcoming = plans
        .where((p) =>
            p.status == TripPlanStatus.draft ||
            p.status == TripPlanStatus.ready)
        .toList();
    final past = plans
        .where((p) =>
            p.status == TripPlanStatus.completed ||
            p.status == TripPlanStatus.departed ||
            p.status == TripPlanStatus.cancelled)
        .toList();

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(tripPlanListProvider);
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        children: [
          if (upcoming.isNotEmpty) ...[
            _buildSectionHeader('即将出发', colors),
            const SizedBox(height: 8),
            for (final plan in upcoming) ...[
              _buildPlanCard(context, plan, colors),
              const SizedBox(height: 10),
            ],
          ],
          if (past.isNotEmpty) ...[
            const SizedBox(height: 16),
            _buildSectionHeader('历史计划', colors),
            const SizedBox(height: 8),
            for (final plan in past) ...[
              _buildPlanCard(context, plan, colors),
              const SizedBox(height: 10),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, dynamic colors) {
    return Text(
      title,
      style: TextStyle(
        color: colors.textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildPlanCard(
      BuildContext context, TripPlanModel plan, dynamic colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;

    return GestureDetector(
      onTap: () => context.push('/trip-plans/${plan.id}'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceSecondary,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    route?.name ?? '行程计划',
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  plan.isDepartureDay
                      ? '今天'
                      : daysUntil > 0
                          ? '${daysUntil}天后'
                          : '已过期',
                  style: TextStyle(
                    color: plan.isDepartureDay
                        ? const Color(0xFF22C55E)
                        : colors.textTertiary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            if (route != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    '🎒 ${plan.totalGearCount}件装备',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 12),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '📏 ${route.distanceKm.toStringAsFixed(0)}km',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 12),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '⛰ ${route.elevationGainM.toInt()}m',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 12),
                  ),
                ],
              ),
            ],
            if (plan.totalGearCount > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: plan.totalGearCount == 0
                            ? 0
                            : plan.packedCount / plan.totalGearCount,
                        backgroundColor: colors.line,
                        color: colors.flare,
                        minHeight: 4,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${plan.packedCount}/${plan.totalGearCount}',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 11),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
