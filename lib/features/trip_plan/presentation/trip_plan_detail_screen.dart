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
import '../../trip/data/trip_repository.dart';
import '../data/gear_recommendation_service.dart';
import '../data/trip_plan_repository.dart';
import '../data/weather_service.dart';
import '../domain/trip_plan_model.dart';
import '../domain/weather_models.dart';
import 'widgets/departure_confirm_sheet.dart';
import 'widgets/elevation_chart.dart';
import 'widgets/gear_checklist.dart';
import 'widgets/task_timeline.dart';
import '../data/trip_task_service.dart';
import '../domain/trip_plan_task.dart';

const _kDanger = Color(0xFFD4645A);

String _iconForCategory(String categoryId) {
  switch (categoryId) {
    case 'b0000000-0000-0000-0000-000000000001': return KaipaIcons.boot;
    case 'b0000000-0000-0000-0000-000000000002': return KaipaIcons.backpack;
    case 'b0000000-0000-0000-0000-000000000003': return KaipaIcons.jacket;
    case 'b0000000-0000-0000-0000-000000000004': return KaipaIcons.tent;
    case 'b0000000-0000-0000-0000-000000000005': return KaipaIcons.bottle;
    case 'b0000000-0000-0000-0000-000000000006': return KaipaIcons.battery;
    case 'b0000000-0000-0000-0000-000000000007': return KaipaIcons.light;
    case 'b0000000-0000-0000-0000-000000000008': return KaipaIcons.knife;
    case 'b0000000-0000-0000-0000-000000000009': return KaipaIcons.socks;
    case 'b0000000-0000-0000-0000-000000000010': return KaipaIcons.shield;
    case 'b0000000-0000-0000-0000-000000000011': return KaipaIcons.down;
    case 'b0000000-0000-0000-0000-000000000012': return KaipaIcons.tee;
    case 'b0000000-0000-0000-0000-000000000013': return KaipaIcons.fleece;
    case 'b0000000-0000-0000-0000-000000000014': return KaipaIcons.shield;
    case 'b0000000-0000-0000-0000-000000000015': return KaipaIcons.sleeping;
    case 'b0000000-0000-0000-0000-000000000016': return KaipaIcons.firstAid;
    case 'b0000000-0000-0000-0000-000000000017': return KaipaIcons.gloves;
    case 'b0000000-0000-0000-0000-000000000018': return KaipaIcons.flame;
    default: return KaipaIcons.backpack;
  }
}

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
              if (route != null) ...[
                const SizedBox(height: KaipaSpace.s5),
                _buildWeatherCard(
                  route: route,
                  planId: plan.id,
                  plannedDate: plan.plannedDate,
                ),
              ],
              if (route != null && route.elevationProfile.isNotEmpty) ...[
                const SizedBox(height: KaipaSpace.s5),
                _buildSectionHeader('海拔剖面', colors),
                const SizedBox(height: KaipaSpace.s2),
                _buildElevationCard(route, colors),
              ],
              const SizedBox(height: KaipaSpace.s5),
              _buildSectionHeader('行程时间线', colors),
              const SizedBox(height: KaipaSpace.s2),
              TaskTimeline(planId: plan.id, onChanged: () {
                ref.invalidate(tripPlanDetailProvider(widget.planId));
              }),
              const SizedBox(height: 8),
              _buildGenerateTimelineButton(plan, colors),
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
                  color: plan.isDepartureDay ? colors.flare : colors.inkMuted,
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
        if (plan.status == TripPlanStatus.draft ||
            plan.status == TripPlanStatus.ready) ...[
          const SizedBox(width: KaipaSpace.s2),
          _buildMoreMenu(plan, colors),
        ],
      ],
    );
  }

  Widget _buildMoreMenu(TripPlanModel plan, KaipaColors colors) {
    return PopupMenuButton<String>(
      icon: KaipaIcon(name: KaipaIcons.more, size: 20, color: colors.inkMuted),
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: colors.line, width: 0.5),
      ),
      offset: const Offset(0, 40),
      onSelected: (value) {
        if (value == 'cancel') {
          _confirmCancel(plan, colors);
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'cancel',
          child: Row(
            children: [
              KaipaIcon(name: KaipaIcons.close, size: 16, color: _kDanger),
              const SizedBox(width: 10),
              Text(
                '取消行程',
                style: TextStyle(
                  color: _kDanger,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _confirmCancel(TripPlanModel plan, KaipaColors colors) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        title: Text(
          '取消行程',
          style: TextStyle(
            color: colors.ink,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: Text(
          '确定要取消「${plan.route?.name ?? "此行程"}」吗？取消后可在行程列表中找回。',
          style: TextStyle(
            color: colors.inkMuted,
            fontSize: 14,
            height: 1.4,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              '再想想',
              style: TextStyle(
                color: colors.inkMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              '确认取消',
              style: TextStyle(
                color: _kDanger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await ref.read(tripPlanRepositoryProvider).updatePlan(
        plan.id,
        {'status': 'cancelled'},
      );
      ref.invalidate(tripPlanDetailProvider(widget.planId));
      ref.invalidate(tripPlanListProvider);
    }
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
        lineColor: colors.flare,
        fillColor: colors.flare,
        textColor: colors.inkDim,
      ),
    );
  }

  // ─── Gear section ────────────────────────────────────────────────────

  Widget _buildGearSection(TripPlanModel plan, KaipaColors colors) {
    final route = plan.route;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (plan.gearItems.isNotEmpty) ...[
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
        if (route != null)
          _GearPreRecommend(route: route, colors: colors),
        const SizedBox(height: KaipaSpace.s3),
        _buildSelectGearButton(plan, colors),
      ],
    );
  }

  Widget _buildGenerateTimelineButton(TripPlanModel plan, KaipaColors colors) {
    return Consumer(
      builder: (context, ref, _) {
        final tasksAsync = ref.watch(tripTasksProvider(widget.planId));
        final hasTasks = tasksAsync.valueOrNull?.isNotEmpty == true;

        return GestureDetector(
          onTap: hasTasks ? null : () => _generateTimeline(plan, ref),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              KaipaIcon(
                name: hasTasks ? KaipaIcons.check : KaipaIcons.light,
                size: 14,
                color: hasTasks ? colors.moss : colors.flare,
              ),
              const SizedBox(width: 8),
              Text(
                hasTasks ? 'AI 时间线已生成' : 'AI 生成行程时间线',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                    color: hasTasks ? colors.moss : colors.flare),
              ),
              if (!hasTasks) ...[
                const SizedBox(width: 4),
                Text('(基于天气+路线)', style: TextStyle(fontSize: 11, color: colors.inkDim)),
              ],
            ]),
          ),
        );
      },
    );
  }

  Future<void> _generateTimeline(TripPlanModel plan, WidgetRef ref) async {
    final route = plan.route;
    if (route == null) return;

    try {
      // Get weather first
      final weatherService = ref.read(weatherServiceProvider);
      final weather = await weatherService.getForecast(
        lat: route.latitude,
        lon: route.longitude,
        forDate: plan.plannedDate,
      );

      final taskService = ref.read(tripTaskServiceProvider);

      // Delete old tasks
      await taskService.deleteTasks(plan.id);

      // Generate via AI
      final dayCount = (route.estimatedDuration.inHours / 8).ceil().clamp(1, 14);
      final result = await taskService.generateTimeline(
        route: route,
        weather: weather,
        plannedDate: plan.plannedDate,
        dayCount: dayCount,
      );

      // Save tasks
      final tasks = result.tasks.asMap().entries.map((e) => {
        'category': e.value.category.jsonValue,
        'title': e.value.title,
        'description': e.value.description,
        'suggested_time': e.value.suggestedTime,
        'sort_order': e.key,
        'ai_generated': true,
      }).toList();

      await taskService.insertTasks(plan.id, tasks);

      // Show summary
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('✅ ${result.summary}')),
        );
      }

      ref.invalidate(tripTasksProvider(widget.planId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('生成失败: $e')),
        );
      }
    }
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
    if (plan.status == TripPlanStatus.completed ||
        plan.status == TripPlanStatus.cancelled) {
      return const SizedBox.shrink();
    }

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
          color: colors.flare,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: colors.flare.withAlpha(77),
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
        try {
          final tripRepo = ref.read(tripRepositoryProvider);
          final trip = await tripRepo.createTrip(
            routeId: plan.routeId,
            gearUsed: plan.gearItems.map((g) => g.gearItemId).toList(),
            planId: plan.id,
          );
          if (mounted) {
            context.go('/navigate/${plan.routeId}?tripId=${trip.id}&planId=${plan.id}');
          }
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('创建行程失败: $e')),
            );
          }
        }
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
        return colors.flare;
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

  // ─── Weather Card ──────────────────────────────────────────────────────

  Widget _buildWeatherCard({
    required RouteModel route,
    required String planId,
    required DateTime plannedDate,
  }) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    final weatherAsync = ref.watch(weatherForTripPlanProvider(
      (lat: route.latitude, lon: route.longitude, planId: planId, forDate: plannedDate),
    ));

    return weatherAsync.when(
      loading: () => _buildSectionHeader('天气预报', colors),
      error: (e, s) => const SizedBox.shrink(),
      data: (weather) => _buildWeatherContent(weather, colors),
    );
  }

  Widget _buildWeatherContent(WeatherForecast weather, KaipaColors colors) {
    final minT = weather.minTempC;
    final maxT = weather.maxTempC;
    final pop = weather.maxPop;
    final wind = weather.maxWindSpeedMs;

    String summary;
    if (pop > 0.5) {
      summary = '有较高降雨概率';
    } else if (pop > 0.2) {
      summary = '可能有小雨';
    } else {
      summary = '天气良好';
    }
    if (minT < 0) {
      summary += '，注意防寒';
    } else if (minT < 5) {
      summary += '，天气偏冷';
    } else if (maxT > 30) {
      summary += '，注意防暑';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('天气预报', colors),
        const SizedBox(height: KaipaSpace.s2),
        Container(
          padding: const EdgeInsets.all(KaipaSpace.s4),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Row(
            children: [
              // Summary
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      summary,
                      style: TextStyle(
                        color: colors.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${minT.round()}°C ~ ${maxT.round()}°C',
                      style: TextStyle(
                        color: colors.inkMuted,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              // Stats column
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _WeatherStat(
                    icon: KaipaIcons.drop,
                    value: '${(pop * 100).round()}%',
                    label: '降雨',
                    colors: colors,
                  ),
                  const SizedBox(height: 6),
                  _WeatherStat(
                    icon: KaipaIcons.weather,
                    value: '${wind.toStringAsFixed(1)} m/s',
                    label: '风速',
                    colors: colors,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _WeatherStat extends StatelessWidget {
  final String icon, value, label;
  final KaipaColors colors;

  const _WeatherStat({
    required this.icon,
    required this.value,
    required this.label,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        KaipaIcon(name: icon, size: 12, color: colors.inkMuted),
        const SizedBox(width: 4),
        Text(value,
            style: TextStyle(
                color: colors.ink, fontSize: 12, fontWeight: FontWeight.w500)),
        const SizedBox(width: 2),
        Text(label,
            style: TextStyle(color: colors.inkMuted, fontSize: 11)),
      ],
    );
  }
}

// ─── Gear Pre-Recommend ────────────────────────────────────────────────

class _GearPreRecommend extends ConsumerWidget {
  final RouteModel route;
  final KaipaColors colors;

  const _GearPreRecommend({required this.route, required this.colors});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recsAsync = ref.watch(gearRecommendationsProvider(
      (route: route, weather: null),
    ));

    return recsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (e, s) => const SizedBox.shrink(),
      data: (recs) {
        if (recs.isEmpty) return const SizedBox.shrink();
        final top = recs.take(6).toList();
        return Container(
          padding: const EdgeInsets.all(KaipaSpace.s4),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '路线推荐携带',
                style: TextStyle(
                    color: colors.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: top
                    .map((rec) => Chip(
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                          backgroundColor: colors.surfaceHi,
                          side: BorderSide.none,
                          label: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              KaipaIcon(
                                name: _iconForCategory(rec.categoryId),
                                size: 13,
                                color: colors.moss,
                              ),
                              const SizedBox(width: 5),
                              Text(rec.categoryName,
                                  style: TextStyle(
                                      color: colors.ink, fontSize: 12)),
                            ],
                          ),
                        ))
                    .toList(),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Weather Provider ───────────────────────────────────────────────────

final weatherForTripPlanProvider = FutureProvider.family<WeatherForecast, ({
  double lat,
  double lon,
  String planId,
  DateTime forDate,
})>((ref, params) async {
  final service = ref.watch(weatherServiceProvider);
  return service.getForecast(
    lat: params.lat,
    lon: params.lon,
    planId: params.planId,
    forDate: params.forDate,
  );
});
