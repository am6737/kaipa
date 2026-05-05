import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../data/trip_task_service.dart';
import '../../domain/trip_plan_task.dart';

final tripTasksProvider = FutureProvider.family<List<TripPlanTask>, String>((ref, planId) {
  final service = ref.watch(tripTaskServiceProvider);
  return service.getTasks(planId);
});

class TaskTimeline extends ConsumerWidget {
  final String planId;
  final VoidCallback? onChanged;

  const TaskTimeline({super.key, required this.planId, this.onChanged});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasksAsync = ref.watch(tripTasksProvider(planId));

    return tasksAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      ),
      error: (e, _) => const SizedBox.shrink(),
      data: (tasks) {
        if (tasks.isEmpty) return _buildEmpty(context);
        return _buildTimeline(context, ref, tasks);
      },
    );
  }

  Widget _buildEmpty(BuildContext context) {
    final colors = context.kaipaTokens.color;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(children: [
        KaipaIcon(name: KaipaIcons.clock, size: 28, color: colors.inkDim),
        const SizedBox(height: 8),
        Text('暂无行程时间线',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.inkMuted)),
        const SizedBox(height: 4),
        Text('点击下方按钮，AI 将根据路线和天气生成行程计划',
            style: TextStyle(fontSize: 11, color: colors.inkDim)),
      ]),
    );
  }

  Widget _buildTimeline(BuildContext context, WidgetRef ref, List<TripPlanTask> tasks) {
    final colors = context.kaipaTokens.color;
    final done = tasks.where((t) => t.isDone).length;

    // Group by category
    final byCategory = <TaskCategory, List<TripPlanTask>>{};
    for (final t in tasks) {
      byCategory.putIfAbsent(t.category, () => []).add(t);
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Progress header
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(children: [
          Text('行程时间线', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.ink)),
          const Spacer(),
          Text('$done/${tasks.length}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.flare)),
          const SizedBox(width: 4),
          Text('完成', style: TextStyle(fontSize: 12, color: colors.inkMuted)),
        ]),
      ),
      // Progress bar
      Container(
        height: 3,
        decoration: BoxDecoration(color: colors.surface, border: Border.all(color: colors.line, width: 0.5)),
        child: Row(children: [
          Container(width: MediaQuery.of(context).size.width * (tasks.isEmpty ? 0 : done / tasks.length) - 32,
              color: colors.flare),
        ]),
      ),
      // Tasks grouped by category
      ...byCategory.entries.map((entry) {
        return _TaskGroup(
          category: entry.key,
          tasks: entry.value,
          colors: colors,
          onToggle: (taskId, isDone) async {
            final service = ref.read(tripTaskServiceProvider);
            await service.toggleTask(taskId, isDone);
            ref.invalidate(tripTasksProvider(planId));
            onChanged?.call();
          },
        );
      }),
      // Bottom border close
      Container(height: 12, decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
        border: Border.all(color: colors.line, width: 0.5),
      )),
    ]);
  }
}

class _TaskGroup extends StatelessWidget {
  final TaskCategory category;
  final List<TripPlanTask> tasks;
  final KaipaColors colors;
  final Future<void> Function(String taskId, bool isDone) onToggle;

  const _TaskGroup({required this.category, required this.tasks, required this.colors, required this.onToggle});

  Color _catColor() {
    switch (category) {
      case TaskCategory.weather: return const Color(0xFFE67E22);
      case TaskCategory.safety: return const Color(0xFFD4645A);
      case TaskCategory.milestone: return colors.flare;
      case TaskCategory.camp: return colors.moss;
      case TaskCategory.prep: return colors.ink;
      case TaskCategory.gear: return const Color(0xFF7C6FF7);
      case TaskCategory.custom: return colors.inkMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: colors.surface,
          border: Border.all(color: colors.line, width: 0.5)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Category header
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(children: [
            Container(width: 24, height: 24,
              decoration: BoxDecoration(color: _catColor().withAlpha(20), borderRadius: BorderRadius.circular(6)),
              child: Center(child: KaipaIcon(name: category.icon, size: 12, color: _catColor()))),
            const SizedBox(width: 8),
            Text(category.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _catColor())),
          ]),
        ),
        // Task items
        ...tasks.map((task) => _TaskRow(task: task, color: _catColor(), colors: colors, onToggle: onToggle)),
        const SizedBox(height: 4),
      ]),
    );
  }
}

class _TaskRow extends StatelessWidget {
  final TripPlanTask task;
  final Color color;
  final KaipaColors colors;
  final Future<void> Function(String taskId, bool isDone) onToggle;

  const _TaskRow({required this.task, required this.color, required this.colors, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Checkbox
        GestureDetector(
          onTap: () => onToggle(task.id, !task.isDone),
          child: Container(
            width: 20, height: 20, margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: task.isDone ? color : null,
              border: task.isDone ? null : Border.all(color: colors.line, width: 1.5),
            ),
            child: task.isDone ? const Icon(Icons.check, size: 12, color: Colors.white) : null,
          ),
        ),
        const SizedBox(width: 12),
        // Content
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            if (task.suggestedTime != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(color: color.withAlpha(15), borderRadius: BorderRadius.circular(4)),
                child: Text(task.suggestedTime!,
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(child: Text(task.title,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                    color: task.isDone ? colors.inkDim : colors.ink,
                    decoration: task.isDone ? TextDecoration.lineThrough : null))),
            if (task.deadline != null) ...[
              const SizedBox(width: 6),
              KaipaIcon(name: 'clock', size: 11, color: const Color(0xFFD4645A)),
              const SizedBox(width: 2),
              Text(_deadlineText(task.deadline!),
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFD4645A))),
            ],
          ]),
          if (task.description != null) ...[
            const SizedBox(height: 2),
            Text(task.description!,
                style: TextStyle(fontSize: 11, color: colors.inkMuted, height: 1.3), maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
        ])),
      ]),
    );
  }

  String _deadlineText(DateTime deadline) {
    final diff = deadline.difference(DateTime.now());
    if (diff.inDays > 0) return '${diff.inDays}天后截止';
    if (diff.inHours > 0) return '${diff.inHours}小时后';
    return '即将截止';
  }
}
