import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../discover/domain/route_model.dart';
import '../data/trip_plan_repository.dart';
import '../data/trip_task_service.dart';
import '../data/weather_service.dart';
import '../domain/trip_plan_model.dart';
import '../domain/trip_plan_task.dart';
import 'widgets/task_edit_sheet.dart';
import 'widgets/task_timeline.dart';

class TaskTimelineScreen extends ConsumerStatefulWidget {
  final String planId;

  const TaskTimelineScreen({super.key, required this.planId});

  @override
  ConsumerState<TaskTimelineScreen> createState() => _TaskTimelineScreenState();
}

class _TaskTimelineScreenState extends ConsumerState<TaskTimelineScreen> {
  bool _isGenerating = false;

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
    final dayCount = route != null
        ? (route.estimatedDuration.inHours / 8).ceil().clamp(1, 14)
        : 1;
    final topPadding = MediaQuery.of(context).padding.top;
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Stack(
      children: [
        ListView(
          padding: EdgeInsets.only(
            top: topPadding + KaipaSpace.s4,
            bottom: bottomPadding + 24,
            left: KaipaSpace.s4,
            right: KaipaSpace.s4,
          ),
          children: [
            _buildHeader(plan, route, colors),
            const SizedBox(height: KaipaSpace.s4),
            _buildAiCard(plan, route, colors),
            const SizedBox(height: KaipaSpace.s4),
            _buildTaskList(plan, dayCount, colors),
          ],
        ),
        // Floating add button
        Positioned(
          right: 16,
          bottom: bottomPadding + 20,
          child: GestureDetector(
            onTap: () => _showAddSheet(plan.id, dayCount),
            child: Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: colors.flare.withAlpha(80),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add, size: 18, color: Colors.white),
                  const SizedBox(width: 6),
                  const Text(
                    '添加事项',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
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

  // ─── Header ──────────────────────────────────────────────────────────

  Widget _buildHeader(
      TripPlanModel plan, RouteModel? route, KaipaColors colors) {
    final parts = <String>[];
    if (route != null) {
      parts.add(route.name);
      parts.add(route.difficulty);
      parts.add('${route.distanceKm.toStringAsFixed(1)}km');
    }

    final tasksAsync = ref.watch(tripTasksProvider(widget.planId));
    final hasTasks = tasksAsync.valueOrNull?.isNotEmpty == true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            CircleButton(
              icon: KaipaIcons.chevronLeft,
              onTap: () => context.pop(),
            ),
            const Spacer(),
            if (hasTasks)
              GestureDetector(
                onTap: () => _confirmClearAll(plan.id, colors),
                child: Text(
                  '清空全部',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFFD4645A),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (parts.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              parts.join(' · '),
              style: TextStyle(
                fontSize: 12,
                color: colors.inkMuted,
                letterSpacing: -0.1,
              ),
            ),
          ),
        Text(
          '行程时间线',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.7,
            height: 1.15,
          ),
        ),
      ],
    );
  }

  // ─── AI Generate Card ─────────────────────────────────────────────────

  Widget _buildAiCard(
      TripPlanModel plan, RouteModel? route, KaipaColors colors) {
    final tasksAsync = ref.watch(tripTasksProvider(widget.planId));
    final hasTasks = tasksAsync.valueOrNull?.isNotEmpty == true;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: const Alignment(-0.3, -1),
          end: const Alignment(0.3, 1),
          stops: const [0.0, 0.7],
          colors: [colors.flareSoft, colors.surface],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.flare.withAlpha(77), width: 0.5),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Stack(
          children: [
            Positioned(
              top: -20,
              right: -20,
              width: 120,
              height: 120,
              child: Opacity(
                opacity: 0.3,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment.center,
                      radius: 0.7,
                      colors: [
                        colors.flare.withAlpha(102),
                        colors.flare.withAlpha(0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: colors.flare,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: colors.flare.withAlpha(140),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: KaipaIcon(
                            name: KaipaIcons.sparkle,
                            size: 16,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'AI 生成时间线',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: colors.ink,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '基于路线难度 + 天气 + 行程天数',
                              style: TextStyle(
                                fontSize: 10.5,
                                color: colors.inkMuted,
                                letterSpacing: -0.1,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  GestureDetector(
                    onTap: (_isGenerating || route == null)
                        ? null
                        : () => _generateTimeline(plan, route),
                    child: Container(
                      height: 40,
                      decoration: BoxDecoration(
                        color: _isGenerating
                            ? colors.flare.withAlpha(180)
                            : colors.flare,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: _isGenerating
                            ? null
                            : [
                                BoxShadow(
                                  color: colors.flare.withAlpha(77),
                                  blurRadius: 10,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (_isGenerating)
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          else
                            const KaipaIcon(
                              name: KaipaIcons.sparkle,
                              size: 14,
                              color: Colors.white,
                            ),
                          const SizedBox(width: 6),
                          Text(
                            _isGenerating
                                ? 'AI 分析中...'
                                : hasTasks
                                    ? '重新生成'
                                    : '一键生成时间线',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                              letterSpacing: -0.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Task List ──────────────────────────────────────────────────────

  Widget _buildTaskList(TripPlanModel plan, int dayCount, KaipaColors colors) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: TaskTimeline(
        planId: plan.id,
        dayCount: dayCount,
        embedded: true,
        showBottomAdd: false,
        onChanged: () {
          ref.invalidate(tripTasksProvider(widget.planId));
          ref.invalidate(tripPlanDetailProvider(widget.planId));
        },
      ),
    );
  }

  // ─── Actions ────────────────────────────────────────────────────────

  Future<void> _confirmClearAll(String planId, KaipaColors colors) async {
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
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: colors.line,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          Text('清空全部事项？',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: colors.ink)),
          const SizedBox(height: 8),
          Text('此操作不可撤销',
              style: TextStyle(fontSize: 13, color: colors.inkMuted)),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFD4645A),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: const Text('清空',
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.pop(ctx, false),
              style: OutlinedButton.styleFrom(
                foregroundColor: colors.inkMuted,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                side: BorderSide(color: colors.line),
              ),
              child: const Text('取消',
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
        ]),
      ),
    );

    if (confirmed == true) {
      final service = ref.read(tripTaskServiceProvider);
      await service.deleteTasks(planId);
      ref.invalidate(tripTasksProvider(widget.planId));
      ref.invalidate(tripPlanDetailProvider(widget.planId));
    }
  }

  Future<void> _showAddSheet(String planId, int dayCount) async {
    final result = await showModalBottomSheet<TaskEditResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => TaskEditSheet(dayCount: dayCount),
    );
    if (result == null) return;
    final service = ref.read(tripTaskServiceProvider);
    await service.addTask(
      planId: planId,
      category: result.category,
      title: result.title,
      description: result.description,
      suggestedTime: result.suggestedTime,
      suggestedDay: result.suggestedDay,
      customLabel: result.customCategoryName,
    );
    ref.invalidate(tripTasksProvider(widget.planId));
    ref.invalidate(tripPlanDetailProvider(widget.planId));
  }

  Future<void> _generateTimeline(TripPlanModel plan, RouteModel route) async {
    setState(() => _isGenerating = true);
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
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('生成失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isGenerating = false);
    }
  }
}
