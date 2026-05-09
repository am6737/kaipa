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
import '../data/trip_task_service.dart';
import '../data/weather_service.dart';
import '../domain/trip_plan_model.dart';
import '../domain/weather_models.dart';
import '../../gear/data/ai_gear_service.dart';
import '../../gear/data/gear_repository.dart';
import 'widgets/departure_confirm_sheet.dart';
import 'widgets/elevation_chart.dart';
import 'widgets/gear_checklist.dart';
import 'widgets/task_timeline.dart';
import '../domain/trip_plan_task.dart';
import '../../../core/widgets/skeleton_card.dart';

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
  final bool isNew;
  final bool isImmediate;

  const TripPlanDetailScreen({
    super.key,
    required this.planId,
    this.isNew = false,
    this.isImmediate = false,
  });

  @override
  ConsumerState<TripPlanDetailScreen> createState() =>
      _TripPlanDetailScreenState();
}

class _TripPlanDetailScreenState extends ConsumerState<TripPlanDetailScreen> {
  bool _isDirty = false;
  bool _savedAndPopping = false;
  late TextEditingController _notesCtrl;
  bool _notesInitialized = false;
  bool _isTimelineGenerating = false;
  bool _isGearGenerating = false;

  void _markDirty() {
    if (!_isDirty) setState(() => _isDirty = true);
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<bool> _onWillPop(TripPlanModel plan) async {
    if (_savedAndPopping) return true;
    if (widget.isImmediate && plan.status == TripPlanStatus.draft) {
      await ref.read(tripPlanRepositoryProvider).deletePlan(plan.id);
      ref.invalidate(tripPlanListProvider);
      return true;
    }
    if (widget.isNew && plan.status == TripPlanStatus.draft && !_isDirty) {
      await ref.read(tripPlanRepositoryProvider).deletePlan(plan.id);
    } else if (_isDirty) {
      await _savePlan(plan);
    }
    ref.invalidate(tripPlanListProvider);
    return true;
  }

  Future<void> _savePlan(TripPlanModel plan) async {
    await ref.read(tripPlanRepositoryProvider).updatePlan(
      plan.id,
      {
        'status': 'ready',
        'notes': _notesCtrl.text.isNotEmpty ? _notesCtrl.text : null,
      },
    );
  }

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

    if (!_notesInitialized) {
      _notesCtrl = TextEditingController(text: plan.notes ?? '');
      _notesInitialized = true;
    }

    return PopScope(
      canPop: _savedAndPopping,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldPop = await _onWillPop(plan);
        if (shouldPop && mounted) {
          setState(() => _savedAndPopping = true);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) Navigator.of(context).pop();
          });
        }
      },
      child: Stack(
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
              _buildTimelineSummaryCard(plan, colors),
              const SizedBox(height: KaipaSpace.s5),
              _buildSectionHeader('装备清单', colors),
              const SizedBox(height: KaipaSpace.s2),
              _buildGearCard(plan, colors),
              const SizedBox(height: KaipaSpace.s5),
              _buildNotesCard(plan, colors),
            ],
          ),
        ),
        _buildBottomBar(plan, colors),
      ],
    ));
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
          onTap: () => Navigator.of(context).maybePop(),
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
          CircleButton(
            icon: KaipaIcons.ellipsis,
            onTap: () => _showPlanMenu(plan),
          ),
        ],
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
    return GestureDetector(
      onTap: () => context.push('/discover/route/${route.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: KaipaSpace.s4, vertical: KaipaSpace.s4),
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
            ),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: colors.line, width: 0.5)),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text('查看路线详情',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.flare)),
                const SizedBox(width: 4),
                KaipaIcon(
                    name: KaipaIcons.chevronRight, size: 12, color: colors.flare),
              ]),
            ),
          ],
        ),
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

  // ─── Timeline summary card ──────────────────────────────────────────

  Widget _buildTimelineSummaryCard(TripPlanModel plan, KaipaColors colors) {
    return Consumer(
      builder: (context, ref, _) {
        final tasksAsync = ref.watch(tripTasksProvider(widget.planId));

        void navigateToTimeline() async {
          await context.push('/trip-plans/${plan.id}/timeline');
          ref.invalidate(tripPlanDetailProvider(widget.planId));
          ref.invalidate(tripTasksProvider(widget.planId));
          _markDirty();
        }

        return Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          clipBehavior: Clip.antiAlias,
          child: tasksAsync.when(
            loading: () => Padding(
              padding: const EdgeInsets.all(20),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.flare,
                  ),
                ),
              ),
            ),
            error: (_, _) => _buildTimelineEmptyContent(plan, colors, navigateToTimeline),
            data: (tasks) => tasks.isEmpty
                ? _buildTimelineEmptyContent(plan, colors, navigateToTimeline)
                : _buildTimelinePreview(tasks, plan, colors, navigateToTimeline),
          ),
        );
      },
    );
  }

  Widget _buildTimelineAiPill(TripPlanModel plan, KaipaColors colors) {
    final hasRoute = plan.route != null;
    return GestureDetector(
      onTap: (_isTimelineGenerating || !hasRoute)
          ? null
          : () => _generateTimeline(plan),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: colors.flare,
          borderRadius: BorderRadius.circular(20),
          boxShadow: _isTimelineGenerating ? null : [
            BoxShadow(
              color: colors.flare.withAlpha(60),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (_isTimelineGenerating)
            const SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          else
            const KaipaIcon(name: KaipaIcons.sparkle, size: 12, color: Colors.white),
          const SizedBox(width: 5),
          Text(
            _isTimelineGenerating ? 'AI 生成中...' : 'AI 生成时间线',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white),
          ),
        ]),
      ),
    );
  }

  Widget _buildTimelineEmptyContent(TripPlanModel plan, KaipaColors colors, VoidCallback onNavigate) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
          child: Column(
            children: [
              KaipaIcon(
                  name: KaipaIcons.clock, size: 28, color: colors.inkDim),
              const SizedBox(height: 8),
              Text('暂无行程时间线',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.inkMuted)),
              const SizedBox(height: 12),
              _buildTimelineAiPill(plan, colors),
            ],
          ),
        ),
        GestureDetector(
          onTap: onNavigate,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: colors.line, width: 0.5)),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('编辑时间线',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.flare)),
              const SizedBox(width: 4),
              KaipaIcon(
                  name: KaipaIcons.chevronRight, size: 12, color: colors.flare),
            ]),
          ),
        ),
      ],
    );
  }

  Widget _buildTimelinePreview(
      List<TripPlanTask> tasks, TripPlanModel plan, KaipaColors colors, VoidCallback onNavigate) {
    final done = tasks.where((t) => t.isDone).length;
    final total = tasks.length;
    final progress = total > 0 ? done / total : 0.0;
    final preview = tasks.take(3).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: Row(
            children: [
              Text('$done/$total',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.flare)),
              const SizedBox(width: 4),
              Text('完成',
                  style: TextStyle(fontSize: 12, color: colors.inkMuted)),
              const Spacer(),
              GestureDetector(
                onTap: (_isTimelineGenerating || plan.route == null)
                    ? null
                    : () => _generateTimeline(plan),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: colors.flareSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    if (_isTimelineGenerating)
                      SizedBox(
                        width: 10,
                        height: 10,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5,
                          color: colors.flare,
                        ),
                      )
                    else
                      KaipaIcon(name: KaipaIcons.sparkle, size: 10, color: colors.flare),
                    const SizedBox(width: 3),
                    Text(
                      _isTimelineGenerating ? '生成中' : '重新生成',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: colors.flare),
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 3,
              backgroundColor: colors.line,
              valueColor: AlwaysStoppedAnimation(colors.flare),
            ),
          ),
        ),
        const SizedBox(height: 12),
        ...preview.map((task) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Container(
                    width: 16,
                    height: 16,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: task.isDone ? colors.flare : null,
                      border: task.isDone
                          ? null
                          : Border.all(color: colors.line, width: 1.5),
                    ),
                    child: task.isDone
                        ? const Icon(Icons.check,
                            size: 10, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(width: 10),
                  if (task.suggestedTime != null) ...[
                    Text(
                      _trimTime(task.suggestedTime!),
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: colors.inkDim),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(
                      task.title,
                      style: TextStyle(
                        fontSize: 13,
                        color: task.isDone ? colors.inkDim : colors.ink,
                        decoration:
                            task.isDone ? TextDecoration.lineThrough : null,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            )),
        if (tasks.length > 3)
          Padding(
            padding: const EdgeInsets.only(left: 42, bottom: 8),
            child: Text(
              '还有 ${tasks.length - 3} 项...',
              style: TextStyle(fontSize: 11, color: colors.inkDim),
            ),
          ),
        GestureDetector(
          onTap: onNavigate,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: colors.line, width: 0.5)),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('查看完整时间线',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.flare)),
              const SizedBox(width: 4),
              KaipaIcon(
                  name: KaipaIcons.chevronRight, size: 12, color: colors.flare),
            ]),
          ),
        ),
      ],
    );
  }

  String _trimTime(String time) {
    final parts = time.split(':');
    if (parts.length >= 2) return '${parts[0]}:${parts[1]}';
    return time;
  }

  // ─── Gear card (unified) ─────────────────────────────────────────────

  Widget _buildGearCard(TripPlanModel plan, KaipaColors colors) {
    final route = plan.route;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (route != null)
            _GearPreRecommendEmbedded(route: route, colors: colors),
          if (plan.gearItems.isEmpty && route != null)
            _buildGearEmptyAiPill(plan, colors),
          if (plan.gearItems.isNotEmpty)
            GearChecklist(
              planId: plan.id,
              gearItems: plan.gearItems,
              onChanged: () {
                ref.invalidate(tripPlanDetailProvider(widget.planId));
              },
            ),
          _buildGearFooter(plan, colors),
        ],
      ),
    );
  }

  Widget _buildGearEmptyAiPill(TripPlanModel plan, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Center(
        child: GestureDetector(
          onTap: _isGearGenerating ? null : () => _aiGearRecommend(plan),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: colors.flare,
              borderRadius: BorderRadius.circular(20),
              boxShadow: _isGearGenerating ? null : [
                BoxShadow(
                  color: colors.flare.withAlpha(60),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (_isGearGenerating)
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              else
                const KaipaIcon(name: KaipaIcons.sparkle, size: 12, color: Colors.white),
              const SizedBox(width: 5),
              Text(
                _isGearGenerating ? 'AI 搭配中...' : 'AI 智能搭配',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _buildGearFooter(TripPlanModel plan, KaipaColors colors) {
    return Container(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: Row(
        children: [
          if (plan.gearItems.isNotEmpty && plan.route != null)
            Expanded(
              child: GestureDetector(
                onTap: _isGearGenerating ? null : () => _aiGearRecommend(plan),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    if (_isGearGenerating)
                      SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2, color: colors.flare),
                      )
                    else
                      KaipaIcon(name: KaipaIcons.sparkle, size: 12, color: colors.flare),
                    const SizedBox(width: 4),
                    Text(
                      _isGearGenerating ? 'AI 搭配中...' : 'AI 智能搭配',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.flare),
                    ),
                  ]),
                ),
              ),
            ),
          if (plan.gearItems.isNotEmpty && plan.route != null)
            Container(width: 0.5, height: 20, color: colors.line),
          Expanded(
            child: GestureDetector(
              onTap: () async {
                final beforeIds = plan.gearItems.map((g) => g.gearItemId).toSet();
                await context.push('/gear/pick/${plan.routeId}?planId=${plan.id}');
                final updated = await ref.refresh(tripPlanDetailProvider(widget.planId).future);
                final afterIds = updated.gearItems.map((g) => g.gearItemId).toSet();
                if (beforeIds.length != afterIds.length || !beforeIds.containsAll(afterIds)) {
                  _markDirty();
                }
              },
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(
                    plan.gearItems.isEmpty ? '选择装备' : '调整装备',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.flare),
                  ),
                ]),
              ),
            ),
          ),
        ],
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
            controller: _notesCtrl,
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
            onChanged: (_) => _markDirty(),
          ),
        ),
      ],
    );
  }

  // ─── Bottom bar with gradient fade ───────────────────────────────────

  Widget _buildBottomBar(TripPlanModel plan, KaipaColors colors) {
    final isDraftOrReady = plan.status == TripPlanStatus.draft ||
        plan.status == TripPlanStatus.ready;
    final isDeparted = plan.status == TripPlanStatus.departed;

    if (!isDraftOrReady && !isDeparted) return const SizedBox.shrink();

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
        child: isDeparted
            ? _buildCompleteCta(plan, colors)
            : _buildDepartureCta(plan, colors),
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

  Widget _buildCompleteCta(TripPlanModel plan, KaipaColors colors) {
    return GestureDetector(
      onTap: () => _confirmComplete(plan),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: KaipaSpace.s4),
        decoration: BoxDecoration(
          color: colors.moss,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: colors.moss.withAlpha(64),
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
                name: KaipaIcons.check,
                size: 18,
                color: Colors.white,
              ),
              const SizedBox(width: KaipaSpace.s2),
              const Text(
                '完成行程',
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

  // ─── Plan menu ────────────────────────────────────────────────────────

  void _showPlanMenu(TripPlanModel plan) {
    final colors = ref.read(kaipaTokensProvider).color;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 36, height: 4, decoration: BoxDecoration(color: colors.line, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          SizedBox(width: double.infinity, child: ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _confirmCancel(plan);
            },
            style: ElevatedButton.styleFrom(backgroundColor: colors.diff.extreme, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
            child: const Text('取消行程', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          )),
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: OutlinedButton(
            onPressed: () => Navigator.pop(ctx),
            style: OutlinedButton.styleFrom(foregroundColor: colors.inkMuted, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: BorderSide(color: colors.line)),
            child: const Text('返回', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          )),
        ]),
      ),
    );
  }

  // ─── Departure confirmation ───────────────────────────────────────────

  Future<void> _confirmCancel(TripPlanModel plan) async {
    final colors = ref.read(kaipaTokensProvider).color;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 36, height: 4, decoration: BoxDecoration(color: colors.line, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          Text('取消行程？', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.ink)),
          const SizedBox(height: 8),
          Text('确定要取消「${plan.route?.name ?? "此行程"}」吗？', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: colors.diff.extreme, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
            child: const Text('取消行程', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          )),
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: OutlinedButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: OutlinedButton.styleFrom(foregroundColor: colors.inkMuted, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: BorderSide(color: colors.line)),
            child: const Text('再想想', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          )),
        ]),
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

  Future<void> _confirmDeparture(TripPlanModel plan) async {
    final confirmed = await DepartureConfirmSheet.show(
      context,
      plan: plan,
    );

    if (confirmed == true && mounted) {
      final repo = ref.read(tripPlanRepositoryProvider);
      await repo.updatePlan(plan.id, {
        'status': 'departed',
        if (_notesCtrl.text.isNotEmpty) 'notes': _notesCtrl.text,
      });
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

  Future<void> _confirmComplete(TripPlanModel plan) async {
    final colors = ref.read(kaipaTokensProvider).color;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 36, height: 4, decoration: BoxDecoration(color: colors.line, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          Text('完成行程？', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.ink)),
          const SizedBox(height: 8),
          Text('确认「${plan.route?.name ?? "此行程"}」已完成？', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: colors.moss, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
            child: const Text('确认完成', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          )),
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: OutlinedButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: OutlinedButton.styleFrom(foregroundColor: colors.inkMuted, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: BorderSide(color: colors.line)),
            child: const Text('继续行程', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          )),
        ]),
      ),
    );

    if (confirmed == true && mounted) {
      await ref.read(tripPlanRepositoryProvider).updatePlan(
        plan.id,
        {'status': 'completed'},
      );
      ref.invalidate(tripPlanDetailProvider(widget.planId));
      ref.invalidate(tripPlanListProvider);
    }
  }

  // ─── AI Generate Timeline ─────────────────────────────────────────────

  Future<void> _generateTimeline(TripPlanModel plan) async {
    final route = plan.route;
    if (route == null) return;
    setState(() => _isTimelineGenerating = true);
    try {
      final weatherService = ref.read(weatherServiceProvider);
      final weather = await weatherService.getForecast(
        lat: route.latitude,
        lon: route.longitude,
        forDate: plan.plannedDate,
      );

      final taskService = ref.read(tripTaskServiceProvider);
      await taskService.deleteTasks(plan.id);

      final dayCount =
          (route.estimatedDuration.inHours / 8).ceil().clamp(1, 14);
      final result = await taskService.generateTimeline(
        route: route,
        weather: weather,
        plannedDate: plan.plannedDate,
        dayCount: dayCount,
      );

      final tasks = result.tasks.asMap().entries.map((e) => {
            'category': e.value.category.jsonValue,
            'title': e.value.title,
            'description': e.value.description,
            'suggested_time': e.value.suggestedTime,
            'suggested_day': e.value.suggestedDay,
            'sort_order': e.key,
            'ai_generated': true,
          }).toList();

      await taskService.insertTasks(plan.id, tasks);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.summary)),
        );
      }

      ref.invalidate(tripTasksProvider(widget.planId));
      ref.invalidate(tripPlanDetailProvider(widget.planId));
      _markDirty();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('生成失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isTimelineGenerating = false);
    }
  }

  // ─── AI Gear Recommend ──────────────────────────────────────────────

  Future<void> _aiGearRecommend(TripPlanModel plan) async {
    final route = plan.route;
    if (route == null) return;
    setState(() => _isGearGenerating = true);
    try {
      final categories = await ref.read(gearCategoriesProvider.future);
      final allItems = await ref.read(allGearItemsProvider.future);

      if (allItems.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('装备库为空，请先添加装备')),
          );
        }
        return;
      }

      final weatherService = ref.read(weatherServiceProvider);
      final weather = await weatherService.getForecast(
        lat: route.latitude,
        lon: route.longitude,
        forDate: plan.plannedDate,
      );

      final aiService = ref.read(aiGearServiceProvider);
      final result = await aiService.getRecommendations(
        route: route,
        gearItems: allItems,
        categories: categories,
        weather: weather,
      );

      final repo = ref.read(tripPlanRepositoryProvider);
      await repo.syncGearItems(
        planId: plan.id,
        gearItemIds: result.selectedItemIds,
      );

      ref.invalidate(tripPlanDetailProvider(widget.planId));
      _markDirty();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已选择 ${result.selectedItems.length} 件装备')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AI 推荐失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isGearGenerating = false);
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
        return '草稿';
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
    String? planId,
    required DateTime plannedDate,
  }) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    final weatherAsync = ref.watch(weatherForTripPlanProvider(
      (lat: route.latitude, lon: route.longitude, planId: planId, forDate: plannedDate),
    ));

    return weatherAsync.when(
      loading: () => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _buildSectionHeader('天气预报', colors),
        const SizedBox(height: KaipaSpace.s2),
        const SkeletonWeatherCard(),
      ]),
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

class _GearPreRecommendEmbedded extends ConsumerWidget {
  final RouteModel route;
  final KaipaColors colors;

  const _GearPreRecommendEmbedded({required this.route, required this.colors});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recsAsync = ref.watch(gearRecommendationsProvider(
      (route: route, weather: null),
    ));

    return recsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: SkeletonChipsCard(embedded: true),
      ),
      error: (e, s) => const SizedBox.shrink(),
      data: (recs) {
        if (recs.isEmpty) return const SizedBox.shrink();
        final top = recs.take(6).toList();
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '路线推荐携带',
                style: TextStyle(color: colors.inkMuted, fontSize: 11),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: top
                    .map((rec) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: colors.surfaceHi,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              KaipaIcon(
                                name: _iconForCategory(rec.categoryId),
                                size: 12,
                                color: colors.moss,
                              ),
                              const SizedBox(width: 4),
                              Text(rec.categoryName,
                                  style: TextStyle(color: colors.ink, fontSize: 11)),
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
  String? planId,
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
