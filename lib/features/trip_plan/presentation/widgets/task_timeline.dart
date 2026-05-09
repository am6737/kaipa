import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../../../core/widgets/skeleton_card.dart';
import '../../data/trip_task_service.dart';
import '../../domain/trip_plan_task.dart';
import 'task_edit_sheet.dart';

final tripTasksProvider = FutureProvider.family<List<TripPlanTask>, String>((ref, planId) {
  final service = ref.watch(tripTaskServiceProvider);
  return service.getTasks(planId);
});

class TaskTimeline extends ConsumerWidget {
  final String planId;
  final int dayCount;
  final bool embedded;
  final bool showBottomAdd;
  final VoidCallback? onChanged;

  const TaskTimeline({super.key, required this.planId, this.dayCount = 1, this.embedded = false, this.showBottomAdd = true, this.onChanged});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasksAsync = ref.watch(tripTasksProvider(planId));

    return tasksAsync.when(
      loading: () => embedded ? const SizedBox.shrink() : const SkeletonTimelineCard(),
      error: (e, _) => const SizedBox.shrink(),
      data: (tasks) {
        if (tasks.isEmpty) return _buildEmpty(context, ref);
        return _buildTimeline(context, ref, tasks);
      },
    );
  }

  Widget _buildEmpty(BuildContext context, WidgetRef ref) {
    final colors = context.kaipaTokens.color;
    final content = Column(children: [
      KaipaIcon(name: KaipaIcons.clock, size: 28, color: colors.inkDim),
      const SizedBox(height: 8),
      Text('暂无行程时间线',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.inkMuted)),
      const SizedBox(height: 4),
      Text(showBottomAdd ? '可用 AI 生成，或添加事项' : '可用 AI 生成行程时间线',
          style: TextStyle(fontSize: 11, color: colors.inkDim)),
      if (showBottomAdd) ...[
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () => _showAddSheet(context, ref),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: colors.flare.withAlpha(15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: colors.flare.withAlpha(40)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.add, size: 14, color: colors.flare),
              const SizedBox(width: 4),
              Text('添加事项', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.flare)),
            ]),
          ),
        ),
      ],
    ]);

    if (embedded) return Padding(padding: const EdgeInsets.all(20), child: content);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: content,
    );
  }

  Widget _buildTimeline(BuildContext context, WidgetRef ref, List<TripPlanTask> tasks) {
    final colors = context.kaipaTokens.color;

    final hasMultipleDays = tasks.any((t) => t.suggestedDay != null && t.suggestedDay! > 1);

    final byDay = <int, List<TripPlanTask>>{};
    for (final t in tasks) {
      final day = t.suggestedDay ?? 0;
      byDay.putIfAbsent(day, () => []).add(t);
    }
    final sortedDays = byDay.keys.toList()..sort();

    final taskWidgets = sortedDays.expand((day) {
      final dayTasks = byDay[day]!;
      final byCategory = <TaskCategory, List<TripPlanTask>>{};
      for (final t in dayTasks) {
        byCategory.putIfAbsent(t.category, () => []).add(t);
      }
      return [
        if (hasMultipleDays)
          _DayHeader(day: day, colors: colors, embedded: embedded),
        ...byCategory.entries.map((entry) => _TaskGroup(
          category: entry.key,
          tasks: entry.value,
          colors: colors,
          showTimeDay: !hasMultipleDays,
          embedded: embedded,
          onToggle: (taskId, isDone) async {
            final service = ref.read(tripTaskServiceProvider);
            await service.toggleTask(taskId, isDone);
            ref.invalidate(tripTasksProvider(planId));
            onChanged?.call();
          },
          onEdit: (task) => _showEditSheet(context, ref, task),
          onDelete: (taskId) => _deleteTask(ref, taskId),
        )),
      ];
    }).toList();

    if (embedded) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ...taskWidgets,
        if (showBottomAdd)
          GestureDetector(
            onTap: () => _showAddSheet(context, ref),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: colors.line, width: 0.5)),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.add, size: 14, color: colors.flare),
                const SizedBox(width: 4),
                Text('添加事项', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.flare)),
              ]),
            ),
          ),
      ]);
    }

    final done = tasks.where((t) => t.isDone).length;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
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
      Container(
        height: 3,
        decoration: BoxDecoration(color: colors.surface, border: Border.all(color: colors.line, width: 0.5)),
        child: Row(children: [
          Container(width: MediaQuery.of(context).size.width * (tasks.isEmpty ? 0 : done / tasks.length) - 32,
              color: colors.flare),
        ]),
      ),
      ...taskWidgets,
      GestureDetector(
        onTap: () => _showAddSheet(context, ref),
        child: Container(
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border.all(color: colors.line, width: 0.5),
          ),
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.add, size: 14, color: colors.flare),
            const SizedBox(width: 4),
            Text('添加事项', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.flare)),
          ]),
        ),
      ),
      Container(height: 12, decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
        border: Border.all(color: colors.line, width: 0.5),
      )),
    ]);
  }

  Future<void> _showAddSheet(BuildContext context, WidgetRef ref) async {
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
    ref.invalidate(tripTasksProvider(planId));
    onChanged?.call();
  }

  Future<void> _showEditSheet(BuildContext context, WidgetRef ref, TripPlanTask task) async {
    final result = await showModalBottomSheet<TaskEditResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => TaskEditSheet(task: task, dayCount: dayCount),
    );
    if (result == null) return;
    final service = ref.read(tripTaskServiceProvider);
    await service.updateTask(
      taskId: task.id,
      category: result.category,
      title: result.title,
      description: result.description,
      suggestedTime: result.suggestedTime,
      suggestedDay: result.suggestedDay,
      customLabel: result.customCategoryName,
    );
    ref.invalidate(tripTasksProvider(planId));
    onChanged?.call();
  }

  Future<void> _deleteTask(WidgetRef ref, String taskId) async {
    final service = ref.read(tripTaskServiceProvider);
    await service.deleteTask(taskId);
    ref.invalidate(tripTasksProvider(planId));
    onChanged?.call();
  }
}

class _DayHeader extends StatelessWidget {
  final int day;
  final KaipaColors colors;
  final bool embedded;

  const _DayHeader({required this.day, required this.colors, this.embedded = false});

  @override
  Widget build(BuildContext context) {
    final label = day <= 0 ? '通用' : '第 $day 天';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: colors.flare.withAlpha(10),
        border: embedded
            ? Border(top: BorderSide(color: colors.line, width: 0.5))
            : Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(children: [
        Container(
          width: 6, height: 6,
          decoration: BoxDecoration(shape: BoxShape.circle, color: colors.flare),
        ),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: colors.flare)),
      ]),
    );
  }
}

class _TaskGroup extends StatelessWidget {
  final TaskCategory category;
  final List<TripPlanTask> tasks;
  final KaipaColors colors;
  final bool showTimeDay;
  final bool embedded;
  final Future<void> Function(String taskId, bool isDone) onToggle;
  final void Function(TripPlanTask task) onEdit;
  final void Function(String taskId) onDelete;

  const _TaskGroup({required this.category, required this.tasks, required this.colors, this.showTimeDay = true, this.embedded = false, required this.onToggle, required this.onEdit, required this.onDelete});

  String _groupLabel() {
    if (category == TaskCategory.custom) {
      final custom = tasks.where((t) => t.customLabel != null && t.customLabel!.isNotEmpty).firstOrNull;
      if (custom != null) return custom.customLabel!;
    }
    return category.label;
  }

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
      decoration: embedded
          ? BoxDecoration(border: Border(top: BorderSide(color: colors.line, width: 0.5)))
          : BoxDecoration(color: colors.surface, border: Border.all(color: colors.line, width: 0.5)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Category header
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(children: [
            Container(width: 24, height: 24,
              decoration: BoxDecoration(color: _catColor().withAlpha(20), borderRadius: BorderRadius.circular(6)),
              child: Center(child: KaipaIcon(name: category.icon, size: 12, color: _catColor()))),
            const SizedBox(width: 8),
            Text(_groupLabel(), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _catColor())),
          ]),
        ),
        // Task items
        ...tasks.map((task) => Dismissible(
          key: ValueKey(task.id),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            color: const Color(0xFFD4645A),
            child: const Icon(Icons.delete_outline, color: Colors.white, size: 20),
          ),
          onDismissed: (_) => onDelete(task.id),
          child: _TaskRow(task: task, color: _catColor(), colors: colors, showTimeDay: showTimeDay, onToggle: onToggle, onEdit: onEdit, onDelete: onDelete),
        )),
        const SizedBox(height: 4),
      ]),
    );
  }
}

class _TaskRow extends StatelessWidget {
  final TripPlanTask task;
  final Color color;
  final KaipaColors colors;
  final bool showTimeDay;
  final Future<void> Function(String taskId, bool isDone) onToggle;
  final void Function(TripPlanTask task) onEdit;
  final void Function(String taskId) onDelete;

  const _TaskRow({required this.task, required this.color, required this.colors, this.showTimeDay = true, required this.onToggle, required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onEdit(task),
      onLongPress: () => _showActions(context),
      behavior: HitTestBehavior.opaque,
      child: Padding(
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
                child: Text(_timeLabel(task),
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
        const SizedBox(width: 8),
        // More actions button
        GestureDetector(
          onTap: () => _showActions(context),
          child: Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(Icons.more_horiz, size: 18, color: colors.inkDim),
          ),
        ),
      ]),
    ));
  }

  void _showActions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined, size: 20),
              title: const Text('编辑'),
              onTap: () { Navigator.pop(ctx); onEdit(task); },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, size: 20, color: Color(0xFFD4645A)),
              title: const Text('删除', style: TextStyle(color: Color(0xFFD4645A))),
              onTap: () { Navigator.pop(ctx); onDelete(task.id); },
            ),
          ]),
        );
      },
    );
  }

  String _timeLabel(TripPlanTask t) {
    final time = _trimSeconds(t.suggestedTime!);
    if (showTimeDay && t.suggestedDay != null && t.suggestedDay! > 0) {
      return 'D${t.suggestedDay} $time';
    }
    return time;
  }

  String _trimSeconds(String time) {
    final parts = time.split(':');
    if (parts.length >= 2) return '${parts[0]}:${parts[1]}';
    return time;
  }

  String _deadlineText(DateTime deadline) {
    final diff = deadline.difference(DateTime.now());
    if (diff.inDays > 0) return '${diff.inDays}天后截止';
    if (diff.inHours > 0) return '${diff.inHours}小时后';
    return '即将截止';
  }
}
