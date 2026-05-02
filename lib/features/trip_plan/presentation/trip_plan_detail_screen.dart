import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/diff_badge.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../discover/domain/route_model.dart';
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
        loading: () => Center(
          child: CircularProgressIndicator(color: colors.flare, strokeWidth: 2),
        ),
        error: (e, _) => Center(
          child: Text('加载失败: $e',
              style: TextStyle(color: colors.inkMuted, fontSize: 14)),
        ),
        data: (plan) => _buildContent(plan, colors),
      ),
    );
  }

  Widget _buildContent(TripPlanModel plan, KaipaColors colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;

    return Stack(
      children: [
        RefreshIndicator(
          color: colors.flare,
          onRefresh: () async {
            ref.invalidate(tripPlanDetailProvider(widget.planId));
          },
          child: ListView(
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + KaipaSpace.s4,
              bottom: MediaQuery.of(context).padding.bottom + 110,
              left: KaipaSpace.s4,
              right: KaipaSpace.s4,
            ),
            children: [
              _buildHeader(plan, route, daysUntil, colors),
              if (route != null) ...[
                const SizedBox(height: KaipaSpace.s4),
                _buildStatsCard(route, colors),
              ],
              if (route != null && route.elevationProfile.isNotEmpty) ...[
                const SizedBox(height: KaipaSpace.s5),
                _buildSectionHeader('海拔剖面', colors),
                const SizedBox(height: KaipaSpace.s2),
                _buildElevationCard(route, colors),
              ],
              if (route != null) ...[
                const SizedBox(height: KaipaSpace.s5),
                _buildWeatherSection(plan, route, colors),
              ],
              const SizedBox(height: KaipaSpace.s5),
              _buildGearSection(plan, colors),
              const SizedBox(height: KaipaSpace.s5),
              _buildNotesCard(plan, colors),
            ],
          ),
        ),
        _buildBottomBar(plan, colors),
      ],
    );
  }

  // ─── Header ──────────────────────────────────────────────────────────

  Widget _buildHeader(
      TripPlanModel plan, RouteModel? route, int daysUntil, KaipaColors colors) {
    final dateStr = _formatPlannedDate(plan.plannedDate);
    final daysStr = plan.isDepartureDay
        ? '今天出发'
        : daysUntil > 0
            ? '$dateStr · $daysUntil天后'
            : '$dateStr · 已过期';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        CircleButton(
          icon: KaipaIcons.chevronLeft,
          onTap: () => context.pop(),
        ),
        const SizedBox(width: KaipaSpace.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                route?.name ?? '行程计划',
                style: TextStyle(
                  color: colors.ink,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                  height: 1.1,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 3),
              Text(
                daysStr,
                style: TextStyle(
                  color: plan.isDepartureDay ? colors.moss : colors.inkMuted,
                  fontSize: 13,
                  fontWeight:
                      plan.isDepartureDay ? FontWeight.w600 : FontWeight.w400,
                  letterSpacing: -0.1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: KaipaSpace.s2),
        _buildStatusBadge(plan.status, colors),
      ],
    );
  }

  Widget _buildStatusBadge(TripPlanStatus status, KaipaColors colors) {
    final color = _statusColor(status, colors);
    final label = _statusLabel(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withAlpha(26),
        borderRadius: BorderRadius.circular(KaipaRadius.pill),
        border: Border.all(color: color.withAlpha(51), width: 0.5),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.1,
        ),
      ),
    );
  }

  // ─── Stats card ──────────────────────────────────────────────────────

  Widget _buildStatsCard(RouteModel route, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: KaipaSpace.s4, vertical: KaipaSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          Expanded(
            child: StatWidget(
              value: route.distanceKm.toStringAsFixed(1),
              unit: 'km',
              label: '距离',
            ),
          ),
          _buildStatDivider(colors),
          Expanded(
            child: StatWidget(
              value: route.elevationGainM.toInt().toString(),
              unit: 'm',
              label: '爬升',
            ),
          ),
          _buildStatDivider(colors),
          Expanded(
            child: StatWidget(
              value: '${route.estimatedDuration.inHours}',
              unit: 'h',
              label: '预计时长',
            ),
          ),
          _buildStatDivider(colors),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                DiffBadge(level: route.difficulty),
                const SizedBox(height: 4),
                Text(
                  '难度',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatDivider(KaipaColors colors) {
    return Container(
      width: 0.5,
      height: 36,
      color: colors.line,
      margin: const EdgeInsets.symmetric(horizontal: KaipaSpace.s2),
    );
  }

  // ─── Section header ──────────────────────────────────────────────────

  Widget _buildSectionHeader(String title, KaipaColors colors,
      {String? trailing}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: TextStyle(
            color: colors.ink,
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
          ),
        ),
        if (trailing != null)
          Text(
            trailing,
            style: TextStyle(
              color: colors.inkDim,
              fontSize: 12,
            ),
          ),
      ],
    );
  }

  // ─── Elevation card ──────────────────────────────────────────────────

  Widget _buildElevationCard(RouteModel route, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(KaipaSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: ElevationChart(
        profile: route.elevationProfile,
        lineColor: colors.moss,
        fillColor: colors.moss,
        textColor: colors.inkDim,
      ),
    );
  }

  // ─── Weather section ─────────────────────────────────────────────────

  Widget _buildWeatherSection(
      TripPlanModel plan, RouteModel route, KaipaColors colors) {
    final weatherAsync = ref.watch(routeWeatherProvider((
      lat: route.latitude,
      lon: route.longitude,
      planId: plan.id,
      cache: plan.weatherCache,
      cachedAt: plan.weatherUpdatedAt,
    )));

    return weatherAsync.when(
      loading: () => _buildWeatherShimmer(colors),
      error: (e, st) => const SizedBox.shrink(),
      data: (forecast) => Container(
        padding: const EdgeInsets.all(KaipaSpace.s4),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: WeatherPanel(
          forecast: forecast,
          targetDate: plan.plannedDate,
        ),
      ),
    );
  }

  Widget _buildWeatherShimmer(KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('天气预报', colors),
        const SizedBox(height: KaipaSpace.s2),
        Container(
          height: 88,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(
              4,
              (i) => Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: colors.line,
                      borderRadius: BorderRadius.circular(KaipaRadius.sm),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    width: 24,
                    height: 10,
                    decoration: BoxDecoration(
                      color: colors.line,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    width: 20,
                    height: 8,
                    decoration: BoxDecoration(
                      color: colors.lineSoft,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ─── Gear section ────────────────────────────────────────────────────

  Widget _buildGearSection(TripPlanModel plan, KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (plan.gearItems.isNotEmpty) ...[
          // GearChecklist renders its own header + progress + list.
          // Wrap in a card shell for visual consistency.
          Container(
            padding: const EdgeInsets.fromLTRB(
              KaipaSpace.s4,
              KaipaSpace.s4,
              KaipaSpace.s4,
              KaipaSpace.s1,
            ),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: GearChecklist(
              planId: plan.id,
              gearItems: plan.gearItems,
              onChanged: () {
                ref.invalidate(tripPlanDetailProvider(widget.planId));
              },
            ),
          ),
          const SizedBox(height: KaipaSpace.s3),
        ],
        _buildSelectGearButton(plan, colors),
      ],
    );
  }

  Widget _buildSelectGearButton(TripPlanModel plan, KaipaColors colors) {
    return GestureDetector(
      onTap: () async {
        await context.push('/gear/pick/${plan.routeId}?planId=${plan.id}');
        ref.invalidate(tripPlanDetailProvider(widget.planId));
      },
      child: Container(
        padding: const EdgeInsets.symmetric(
            vertical: KaipaSpace.s4, horizontal: KaipaSpace.s4),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: const Alignment(-0.5, -1),
            end: const Alignment(0.5, 1),
            stops: const [0.0, 0.7],
            colors: [
              colors.flareSoft,
              colors.surface,
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: colors.flare.withAlpha(77),
            width: 0.5,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.flare.withAlpha(26),
                borderRadius: BorderRadius.circular(KaipaRadius.sm),
              ),
              child: Center(
                child: KaipaIcon(
                  name: KaipaIcons.sparkle,
                  size: 18,
                  color: colors.flare,
                ),
              ),
            ),
            const SizedBox(width: KaipaSpace.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    plan.gearItems.isEmpty ? '选择装备' : '调整装备',
                    style: TextStyle(
                      color: colors.ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.2,
                    ),
                  ),
                  Text(
                    plan.gearItems.isEmpty
                        ? '根据路线推荐合适装备'
                        : '从装备库重新选取',
                    style: TextStyle(
                      color: colors.inkMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            KaipaIcon(
              name: KaipaIcons.chevronRight,
              size: 16,
              color: colors.inkDim,
            ),
          ],
        ),
      ),
    );
  }

  // ─── Notes card ──────────────────────────────────────────────────────

  Widget _buildNotesCard(TripPlanModel plan, KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('备注', colors),
        const SizedBox(height: KaipaSpace.s2),
        Container(
          padding: const EdgeInsets.all(KaipaSpace.s4),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: TextField(
            controller: TextEditingController(text: plan.notes ?? ''),
            maxLines: 4,
            minLines: 2,
            style: TextStyle(
              color: colors.ink,
              fontSize: 14,
              letterSpacing: -0.1,
              height: 1.5,
            ),
            decoration: InputDecoration(
              hintText: '添加备注、提醒或路线说明...',
              hintStyle: TextStyle(color: colors.inkDim, fontSize: 14),
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

  // ─── Bottom bar with gradient fade ───────────────────────────────────

  Widget _buildBottomBar(TripPlanModel plan, KaipaColors colors) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              colors.bg.withAlpha(0),
              colors.bg.withAlpha(220),
              colors.bg,
            ],
            stops: const [0.0, 0.35, 0.55],
          ),
        ),
        padding: EdgeInsets.only(
          left: KaipaSpace.s4,
          right: KaipaSpace.s4,
          top: KaipaSpace.s8,
          bottom: MediaQuery.of(context).padding.bottom + KaipaSpace.s4,
        ),
        child: plan.isDepartureDay
            ? _buildDepartureCta(plan, colors)
            : _buildReadyCta(plan, colors),
      ),
    );
  }

  Widget _buildDepartureCta(TripPlanModel plan, KaipaColors colors) {
    return GestureDetector(
      onTap: () => _confirmDeparture(plan),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: KaipaSpace.s4),
        decoration: BoxDecoration(
          color: colors.moss,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: colors.moss.withAlpha(77),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              KaipaIcon(
                name: KaipaIcons.navigate,
                size: 18,
                color: Colors.white,
              ),
              const SizedBox(width: KaipaSpace.s2),
              const Text(
                '确认出发',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReadyCta(TripPlanModel plan, KaipaColors colors) {
    return GestureDetector(
      onTap: () async {
        await ref.read(tripPlanRepositoryProvider).updatePlan(
          plan.id,
          {'status': 'ready'},
        );
        ref.invalidate(tripPlanDetailProvider(widget.planId));
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: KaipaSpace.s4),
        decoration: BoxDecoration(
          color: colors.flare,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: colors.flare.withAlpha(64),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Center(
          child: Text(
            '准备就绪',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
        ),
      ),
    );
  }

  // ─── Departure confirmation ───────────────────────────────────────────

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

  // ─── Helpers ─────────────────────────────────────────────────────────

  String _formatPlannedDate(DateTime date) {
    return '${date.month}月${date.day}日';
  }

  Color _statusColor(TripPlanStatus status, KaipaColors colors) {
    switch (status) {
      case TripPlanStatus.draft:
        return colors.sky;
      case TripPlanStatus.ready:
        return colors.moss;
      case TripPlanStatus.departed:
        return colors.flare;
      case TripPlanStatus.completed:
        return colors.inkDim;
      case TripPlanStatus.cancelled:
        return colors.diff.extreme;
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
}
