import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/theme_provider.dart';
import '../../discover/domain/route_model.dart';
import '../data/gear_recommendation_service.dart';
import '../data/trip_plan_repository.dart';
import '../data/weather_service.dart';
import '../domain/trip_plan_model.dart';
import 'widgets/departure_confirm_sheet.dart';
import 'widgets/elevation_chart.dart';
import 'widgets/gear_checklist.dart';
import 'widgets/weather_panel.dart';

class TripPlanDetailScreen extends ConsumerStatefulWidget {
  final String planId;

  const TripPlanDetailScreen({super.key, required this.planId});

  @override
  ConsumerState<TripPlanDetailScreen> createState() =>
      _TripPlanDetailScreenState();
}

class _TripPlanDetailScreenState extends ConsumerState<TripPlanDetailScreen> {
  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final planAsync = ref.watch(tripPlanDetailProvider(widget.planId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: planAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('加载失败: $e',
              style: TextStyle(color: colors.textSecondary)),
        ),
        data: (plan) => _buildContent(plan, colors),
      ),
    );
  }

  Widget _buildContent(TripPlanModel plan, dynamic colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(tripPlanDetailProvider(widget.planId));
          },
          child: ListView(
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 16,
              bottom: MediaQuery.of(context).padding.bottom + 100,
              left: 20,
              right: 20,
            ),
            children: [
              _buildHeader(plan, route, daysUntil, colors),
              if (route != null) ...[
                const SizedBox(height: 20),
                _buildStats(route, colors),
              ],
              if (route != null && route.elevationProfile.isNotEmpty) ...[
                const SizedBox(height: 20),
                _buildSection('海拔剖面', colors),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: colors.surfaceSecondary,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: ElevationChart(
                    profile: route.elevationProfile,
                    lineColor: colors.flare,
                    fillColor: colors.flare,
                    textColor: colors.textTertiary,
                  ),
                ),
              ],
              if (route != null) ...[
                const SizedBox(height: 20),
                _buildWeatherSection(plan, route, colors),
              ],
              const SizedBox(height: 20),
              GearChecklist(
                planId: plan.id,
                gearItems: plan.gearItems,
                onChanged: () {
                  ref.invalidate(tripPlanDetailProvider(widget.planId));
                },
              ),
              if (plan.gearItems.isEmpty) ...[
                const SizedBox(height: 12),
                _buildAddGearButton(plan, colors),
              ],
              const SizedBox(height: 20),
              _buildNotesField(plan, colors),
            ],
          ),
        ),
        _buildBottomBar(plan, colors),
      ],
    );
  }

  Widget _buildHeader(
      TripPlanModel plan, RouteModel? route, int daysUntil, dynamic colors) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => context.pop(),
          child: Icon(Icons.arrow_back, color: colors.textPrimary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                route?.name ?? '行程计划',
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                plan.isDepartureDay
                    ? '今天出发'
                    : daysUntil > 0
                        ? '$daysUntil天后出发'
                        : '已过出发日期',
                style: TextStyle(
                  color: plan.isDepartureDay
                      ? const Color(0xFF22C55E)
                      : colors.textSecondary,
                  fontSize: 14,
                  fontWeight:
                      plan.isDepartureDay ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: _statusColor(plan.status).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            _statusLabel(plan.status),
            style: TextStyle(
              color: _statusColor(plan.status),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStats(RouteModel route, dynamic colors) {
    return Row(
      children: [
        _buildStatCard(route.distanceKm.toStringAsFixed(0), '公里', colors),
        const SizedBox(width: 8),
        _buildStatCard('${route.elevationGainM.toInt()}', '爬升m', colors),
        const SizedBox(width: 8),
        _buildStatCard('${route.estimatedDuration.inHours}h', '预计', colors),
        const SizedBox(width: 8),
        _buildStatCard(
          _difficultyLabel(route.difficulty),
          '难度',
          colors,
          valueColor: _difficultyColor(route.difficulty),
        ),
      ],
    );
  }

  Widget _buildStatCard(String value, String label, dynamic colors,
      {Color? valueColor}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: colors.surfaceSecondary,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                color: valueColor ?? colors.flare,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(label,
                style: TextStyle(color: colors.textTertiary, fontSize: 10)),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, dynamic colors) {
    return Text(
      title,
      style: TextStyle(
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildWeatherSection(
      TripPlanModel plan, RouteModel route, dynamic colors) {
    final weatherAsync = ref.watch(routeWeatherProvider((
      lat: route.latitude,
      lon: route.longitude,
      planId: plan.id,
      cache: plan.weatherCache,
      cachedAt: plan.weatherUpdatedAt,
    )));

    return weatherAsync.when(
      loading: () => Container(
        height: 80,
        decoration: BoxDecoration(
          color: colors.surfaceSecondary,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (e, st) => const SizedBox.shrink(),
      data: (forecast) => WeatherPanel(
        forecast: forecast,
        targetDate: plan.plannedDate,
      ),
    );
  }

  Widget _buildAddGearButton(TripPlanModel plan, dynamic colors) {
    return GestureDetector(
      onTap: () => _applyRecommendations(plan),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: colors.flare, width: 1.5),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('✨', style: TextStyle(fontSize: 16)),
            const SizedBox(width: 6),
            Text(
              '智能推荐装备',
              style: TextStyle(
                color: colors.flare,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _applyRecommendations(TripPlanModel plan) async {
    if (plan.route == null) return;

    final recsAsync = ref.read(gearRecommendationsProvider((
      route: plan.route!,
      weather: null,
    )));

    final recs = recsAsync.valueOrNull ?? [];
    if (recs.isEmpty) return;

    final repo = ref.read(tripPlanRepositoryProvider);
    for (final rec in recs) {
      if (rec.gearItemId != null) {
        await repo.addGearItem(
          planId: plan.id,
          gearItemId: rec.gearItemId!,
          isRecommended: true,
          recommendationReason: rec.reason,
        );
      }
    }

    ref.invalidate(tripPlanDetailProvider(widget.planId));
  }

  Widget _buildNotesField(TripPlanModel plan, dynamic colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSection('备注', colors),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.surfaceSecondary,
            borderRadius: BorderRadius.circular(10),
          ),
          child: TextField(
            controller: TextEditingController(text: plan.notes ?? ''),
            maxLines: 3,
            style: TextStyle(color: colors.textPrimary, fontSize: 14),
            decoration: InputDecoration(
              hintText: '添加备注...',
              hintStyle: TextStyle(color: colors.textTertiary),
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
            onChanged: (value) {
              ref.read(tripPlanRepositoryProvider).updatePlan(
                plan.id,
                {'notes': value},
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildBottomBar(TripPlanModel plan, dynamic colors) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 16,
          bottom: MediaQuery.of(context).padding.bottom + 16,
        ),
        decoration: BoxDecoration(
          color: colors.bg,
          border: Border(top: BorderSide(color: colors.line, width: 0.5)),
        ),
        child: plan.isDepartureDay
            ? ElevatedButton(
                onPressed: () => _confirmDeparture(plan),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF22C55E),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  '确认出发',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              )
            : ElevatedButton(
                onPressed: () async {
                  await ref.read(tripPlanRepositoryProvider).updatePlan(
                    plan.id,
                    {'status': 'ready'},
                  );
                  ref.invalidate(tripPlanDetailProvider(widget.planId));
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  '准备就绪',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
      ),
    );
  }

  Future<void> _confirmDeparture(TripPlanModel plan) async {
    final confirmed = await DepartureConfirmSheet.show(
      context,
      plan: plan,
    );

    if (confirmed == true && mounted) {
      await ref.read(tripPlanRepositoryProvider).updatePlan(
        plan.id,
        {'status': 'departed'},
      );
      if (mounted) {
        context.push('/safety-confirm/${plan.routeId}');
      }
    }
  }

  Color _statusColor(TripPlanStatus status) {
    switch (status) {
      case TripPlanStatus.draft:
        return const Color(0xFF1E90FF);
      case TripPlanStatus.ready:
        return const Color(0xFF22C55E);
      case TripPlanStatus.departed:
        return Colors.orange;
      case TripPlanStatus.completed:
        return Colors.grey;
      case TripPlanStatus.cancelled:
        return Colors.red;
    }
  }

  String _statusLabel(TripPlanStatus status) {
    switch (status) {
      case TripPlanStatus.draft:
        return '规划中';
      case TripPlanStatus.ready:
        return '待出发';
      case TripPlanStatus.departed:
        return '进行中';
      case TripPlanStatus.completed:
        return '已完成';
      case TripPlanStatus.cancelled:
        return '已取消';
    }
  }

  String _difficultyLabel(String difficulty) {
    switch (difficulty) {
      case 'easy':
        return '简单';
      case 'moderate':
        return '中等';
      case 'hard':
        return '困难';
      case 'expert':
        return '专家';
      default:
        return difficulty;
    }
  }

  Color _difficultyColor(String difficulty) {
    switch (difficulty) {
      case 'easy':
        return const Color(0xFF22C55E);
      case 'moderate':
        return Colors.orange;
      case 'hard':
        return Colors.red;
      case 'expert':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }
}
