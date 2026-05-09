import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/trip_plan_repository.dart';
import '../domain/trip_plan_model.dart';

// Warm coral-red for destructive actions — brighter than diff.extreme (#7A2E2E).
const _kDanger = Color(0xFFD4645A);

// Tracks which card is currently swiped open (by plan ID).
final _openSwipeId = ValueNotifier<String?>(null);

// Selected tab filter.
final _selectedTab = ValueNotifier<_TabFilter>(_TabFilter.all);

// Batch selection mode state.
final _isSelectionMode = ValueNotifier<bool>(false);
final _selectedIds = ValueNotifier<Set<String>>({});

enum _TabFilter { all, planning, departed, completed, cancelled }

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
        child: GestureDetector(
          onTap: () => _openSwipeId.value = null,
          behavior: HitTestBehavior.translucent,
          child: plansAsync.when(
            loading: () => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildTitle(colors),
                const SizedBox(height: 16),
                Expanded(child: _buildShimmer(colors)),
              ],
            ),
            error: (e, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildTitle(colors),
                Expanded(
                  child: Center(
                    child: Text('加载失败',
                        style: TextStyle(color: colors.textSecondary)),
                  ),
                ),
              ],
            ),
            data: (plans) {
              if (plans.isEmpty) return _buildEmpty(context, colors);

              final heroPlan = _findHeroPlan(plans);

              return ValueListenableBuilder<bool>(
                valueListenable: _isSelectionMode,
                builder: (context, selectionMode, _) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (selectionMode)
                        _buildSelectionBar(context, ref, plans, colors, heroPlan)
                      else
                        _buildTitle(colors),
                      if (heroPlan != null && !selectionMode) ...[
                        const SizedBox(height: 12),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: GestureDetector(
                            onTap: () =>
                                context.push('/trip-plans/${heroPlan.id}'),
                            onLongPress: () =>
                                _enterSelectionMode(heroPlan.id),
                            child: _buildHeroCardInner(
                                context, ref, heroPlan, colors),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      _buildTabBar(colors),
                      const SizedBox(height: 12),
                      Expanded(
                        child: _buildFilteredList(
                            context, ref, plans, colors, heroPlan),
                      ),
                    ],
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }

  // ─── Tab bar ──────────────────────────────────────────────────────

  Widget _buildTitle(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Text(
        '行程',
        style: TextStyle(
          color: colors.ink,
          fontSize: 24,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
      ),
    );
  }

  // ─── Selection bar (batch mode) ────────────────────────────────

  Widget _buildSelectionBar(BuildContext context, WidgetRef ref,
      List<TripPlanModel> plans, KaipaColors colors,
      TripPlanModel? heroPlan) {
    return ValueListenableBuilder<Set<String>>(
      valueListenable: _selectedIds,
      builder: (context, selected, _) {
        final filtered = _filterPlans(plans, _selectedTab.value);
        final allSelected = filtered.isNotEmpty &&
            filtered.every((p) => selected.contains(p.id));

        return Padding(
          padding: const EdgeInsets.fromLTRB(8, 12, 12, 0),
          child: Row(
            children: [
              IconButton(
                onPressed: _exitSelectionMode,
                icon: Icon(Icons.close, color: colors.ink, size: 22),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
              ),
              const SizedBox(width: 4),
              Text(
                '已选 ${selected.length} 项',
                style: TextStyle(
                  color: colors.ink,
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.3,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  if (allSelected) {
                    _selectedIds.value = {};
                  } else {
                    _selectedIds.value = filtered.map((p) => p.id).toSet();
                  }
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(KaipaRadius.pill),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Text(
                    allSelected ? '取消全选' : '全选',
                    style: TextStyle(
                      color: colors.inkMuted,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: selected.isEmpty
                    ? null
                    : () => _handleBatchDelete(context, ref, colors),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: selected.isEmpty
                        ? colors.surface
                        : colorWithOpacity(_kDanger, 0.10),
                    borderRadius: BorderRadius.circular(KaipaRadius.pill),
                    border: Border.all(
                      color: selected.isEmpty
                          ? colors.line
                          : colorWithOpacity(_kDanger, 0.3),
                      width: 0.5,
                    ),
                  ),
                  child: Text(
                    '删除',
                    style: TextStyle(
                      color: selected.isEmpty ? colors.inkDim : _kDanger,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _exitSelectionMode() {
    _isSelectionMode.value = false;
    _selectedIds.value = {};
  }

  void _enterSelectionMode(String planId) {
    _openSwipeId.value = null;
    _isSelectionMode.value = true;
    _selectedIds.value = {planId};
  }

  void _toggleSelection(String planId) {
    final current = Set<String>.from(_selectedIds.value);
    if (current.contains(planId)) {
      current.remove(planId);
      if (current.isEmpty) {
        _exitSelectionMode();
        return;
      }
    } else {
      current.add(planId);
    }
    _selectedIds.value = current;
  }

  void _handleBatchDelete(
      BuildContext context, WidgetRef ref, KaipaColors colors) {
    final count = _selectedIds.value.length;
    _showConfirmDialog(
      context,
      colors,
      title: '批量删除',
      message: '确定要永久删除所选的 $count 个行程吗？此操作不可撤销。',
      confirmLabel: '删除 $count 项',
      onConfirm: () async {
        final repo = ref.read(tripPlanRepositoryProvider);
        await Future.wait(
          _selectedIds.value.map((id) => repo.deletePlan(id)),
        );
        _exitSelectionMode();
        ref.invalidate(tripPlanListProvider);
      },
    );
  }

  TripPlanModel? _findHeroPlan(List<TripPlanModel> plans) {
    final active = plans.where((p) =>
        p.status != TripPlanStatus.completed &&
        p.status != TripPlanStatus.cancelled);

    final departed = active
        .where((p) => p.status == TripPlanStatus.departed)
        .toList()
      ..sort((a, b) => a.plannedDate.compareTo(b.plannedDate));
    if (departed.isNotEmpty) return departed.first;

    final today = active.where((p) => p.isDepartureDay).toList();
    if (today.isNotEmpty) return today.first;

    final upcoming = active
        .where((p) =>
            p.status == TripPlanStatus.draft ||
            p.status == TripPlanStatus.ready)
        .toList()
      ..sort((a, b) => a.plannedDate.compareTo(b.plannedDate));
    return upcoming.isEmpty ? null : upcoming.first;
  }

  Widget _buildTabBar(KaipaColors colors) {
    return ValueListenableBuilder<_TabFilter>(
      valueListenable: _selectedTab,
      builder: (context, selected, _) {
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              _buildTabChip('全部', _TabFilter.all, selected, colors),
              const SizedBox(width: 8),
              _buildTabChip('计划中', _TabFilter.planning, selected, colors),
              const SizedBox(width: 8),
              _buildTabChip('进行中', _TabFilter.departed, selected, colors),
              const SizedBox(width: 8),
              _buildTabChip('已完成', _TabFilter.completed, selected, colors),
              const SizedBox(width: 8),
              _buildTabChip('已取消', _TabFilter.cancelled, selected, colors),
            ],
          ),
        );
      },
    );
  }

  Widget _buildTabChip(
      String label, _TabFilter tab, _TabFilter selected, KaipaColors colors) {
    final isActive = tab == selected;
    return GestureDetector(
      onTap: () => _selectedTab.value = tab,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? colors.flareSoft : colors.surface,
          borderRadius: BorderRadius.circular(KaipaRadius.pill),
          border: Border.all(
            color: isActive ? Colors.transparent : colors.line,
            width: 0.5,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isActive ? colors.flare : colors.inkMuted,
            fontSize: 13,
            fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }

  // ─── Shimmer loading ──────────────────────────────────────────────

  Widget _buildShimmer(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: List.generate(3, (i) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Container(
              height: i == 0 ? 160 : 100,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: colors.line, width: 0.5),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ─── Empty state ──────────────────────────────────────────────────

  Widget _buildEmpty(BuildContext context, KaipaColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                shape: BoxShape.circle,
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  KaipaIcon(
                    name: KaipaIcons.route,
                    size: 32,
                    color: colors.flare,
                  ),
                  Positioned(
                    right: 14,
                    top: 14,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: colors.flareSoft,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: KaipaIcon(
                          name: KaipaIcons.plus,
                          size: 10,
                          color: colors.flare,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(
              '还没有行程计划',
              style: TextStyle(
                color: colors.ink,
                fontSize: 17,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '去探索页面找条路线，开始你的下一次冒险吧',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.inkMuted,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            GestureDetector(
              onTap: () => context.go('/discover'),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                decoration: BoxDecoration(
                  color: colors.flareSoft,
                  borderRadius: BorderRadius.circular(KaipaRadius.pill),
                  border: Border.all(
                    color: colors.flare.withAlpha(38),
                    width: 0.5,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    KaipaIcon(
                      name: KaipaIcons.compass,
                      size: 16,
                      color: colors.flare,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '去探索',
                      style: TextStyle(
                        color: colors.flare,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Filtered list ─────────────────────────────────────────────────

  Widget _buildFilteredList(BuildContext context, WidgetRef ref,
      List<TripPlanModel> plans, KaipaColors colors,
      TripPlanModel? heroPlan) {
    return ValueListenableBuilder<_TabFilter>(
      valueListenable: _selectedTab,
      builder: (context, tab, _) {
        var filtered = _filterPlans(plans, tab);

        if (filtered.isEmpty) {
          return _buildEmptyFilter(colors, tab);
        }

        filtered.sort((a, b) => b.plannedDate.compareTo(a.plannedDate));

        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(tripPlanListProvider);
          },
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 140),
            itemCount: filtered.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              return _buildSwipeablePlanCard(
                  context, ref, filtered[index], colors);
            },
          ),
        );
      },
    );
  }

  List<TripPlanModel> _filterPlans(List<TripPlanModel> plans, _TabFilter tab) {
    switch (tab) {
      case _TabFilter.all:
        return plans.toList();
      case _TabFilter.planning:
        return plans
            .where((p) =>
                p.status == TripPlanStatus.draft ||
                p.status == TripPlanStatus.ready)
            .toList();
      case _TabFilter.departed:
        return plans
            .where((p) => p.status == TripPlanStatus.departed)
            .toList();
      case _TabFilter.completed:
        return plans
            .where((p) => p.status == TripPlanStatus.completed)
            .toList();
      case _TabFilter.cancelled:
        return plans
            .where((p) => p.status == TripPlanStatus.cancelled)
            .toList();
    }
  }

  Widget _buildEmptyFilter(KaipaColors colors, _TabFilter tab) {
    final label = switch (tab) {
      _TabFilter.all => '',
      _TabFilter.planning => '计划中',
      _TabFilter.departed => '进行中',
      _TabFilter.completed => '已完成',
      _TabFilter.cancelled => '已取消',
    };
    return Center(
      child: Text(
        '没有$label的行程',
        style: TextStyle(color: colors.inkMuted, fontSize: 14),
      ),
    );
  }

  // ─── Swipeable wrappers ───────────────────────────────────────────

  Widget _buildSwipeablePlanCard(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    return ValueListenableBuilder<bool>(
      valueListenable: _isSelectionMode,
      builder: (context, selectionMode, _) {
        if (selectionMode) {
          return ValueListenableBuilder<Set<String>>(
            valueListenable: _selectedIds,
            builder: (context, selected, _) {
              final isSelected = selected.contains(plan.id);
              return GestureDetector(
                onTap: () => _toggleSelection(plan.id),
                child: Row(
                  children: [
                    _buildCheckbox(isSelected, colors),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildPlanCardInner(
                          context, ref, plan, colors),
                    ),
                  ],
                ),
              );
            },
          );
        }

        final actions = _getSwipeActions(context, ref, plan, colors);
        final card = _buildPlanCardInner(context, ref, plan, colors);
        return GestureDetector(
          onLongPress: () => _enterSelectionMode(plan.id),
          child: actions.isEmpty
              ? card
              : _SwipeableCard(
                  planId: plan.id,
                  actions: actions,
                  child: card,
                ),
        );
      },
    );
  }

  Widget _buildCheckbox(bool isSelected, KaipaColors colors) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: isSelected ? colors.flare : Colors.transparent,
        shape: BoxShape.circle,
        border: Border.all(
          color: isSelected ? colors.flare : colors.inkDim,
          width: 1.5,
        ),
      ),
      child: isSelected
          ? const Icon(Icons.check, size: 14, color: Colors.white)
          : null,
    );
  }

  List<_SwipeAction> _getSwipeActions(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    switch (plan.status) {
      case TripPlanStatus.draft:
      case TripPlanStatus.ready:
        return [
          _SwipeAction(
            label: '改期',
            color: colors.sky,
            onTap: () => _handleReschedule(context, ref, plan, colors),
          ),
          _SwipeAction(
            label: '取消',
            color: colors.diff.extreme,
            onTap: () => _handleCancel(context, ref, plan, colors),
          ),
        ];
      case TripPlanStatus.departed:
        return [
          _SwipeAction(
            label: '删除',
            color: _kDanger,
            onTap: () => _handleDelete(context, ref, plan, colors),
          ),
        ];
      case TripPlanStatus.completed:
      case TripPlanStatus.cancelled:
        return [
          _SwipeAction(
            label: '再走',
            color: colors.flare,
            onTap: () => _handleReplan(context, ref, plan, colors),
          ),
          _SwipeAction(
            label: '删除',
            color: _kDanger,
            onTap: () => _handleDelete(context, ref, plan, colors),
          ),
        ];
    }
  }

  // ─── Hero card (next upcoming trip) ───────────────────────────────

  Widget _buildHeroCardInner(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;
    final dateStr = _formatDate(plan.plannedDate);

    return GestureDetector(
      onTap: () => context.push('/trip-plans/${plan.id}'),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: const Alignment(-1, -1),
            end: const Alignment(1, 1),
            colors: [
                    Color.lerp(colors.surface, colors.flare, 0.08)!,
                    colors.surface,
                  ],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: colors.flare.withAlpha(51),
            width: 0.5,
          ),
          boxShadow: [
            BoxShadow(
              color: colors.flare.withAlpha(13),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildStatusChip(plan.status, colors),
                _buildCountdown(plan, daysUntil, colors),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              route?.name ?? '行程计划',
              style: TextStyle(
                color: colors.ink,
                fontSize: 19,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.4,
                height: 1.2,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              dateStr,
              style: TextStyle(
                color: colors.inkMuted,
                fontSize: 13,
                letterSpacing: -0.1,
              ),
            ),
            if (route != null) ...[
              const SizedBox(height: 16),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: colors.bg.withAlpha(180),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    _buildStatItem(
                        KaipaIcons.ruler,
                        '${route.distanceKm.toStringAsFixed(1)}km',
                        colors),
                    _buildStatDivider(colors),
                    _buildStatItem(
                        KaipaIcons.altitude,
                        '${route.elevationGainM.toInt()}m',
                        colors),
                    _buildStatDivider(colors),
                    _buildStatLabel(
                        '装备 ${plan.totalGearCount}件',
                        colors),
                    if (plan.totalGearCount > 0) ...[
                      _buildStatDivider(colors),
                      _buildStatLabel(
                        '已打包 ${plan.packedCount}/${plan.totalGearCount}',
                        colors,
                        valueColor: plan.packedCount == plan.totalGearCount
                            ? colors.flare
                            : colors.inkMuted,
                      ),
                    ],
                  ],
                ),
              ),
            ],
            if (plan.totalGearCount > 0) ...[
              const SizedBox(height: 14),
              _buildPackingProgress(plan, colors),
            ],
          ],
        ),
      ),
    );
  }

  // ─── Regular plan card ────────────────────────────────────────────

  Widget _buildPlanCardInner(
    BuildContext context,
    WidgetRef ref,
    TripPlanModel plan,
    KaipaColors colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;

    return GestureDetector(
      onTap: _isSelectionMode.value
          ? null
          : () => context.push('/trip-plans/${plan.id}'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        route?.name ?? '行程计划',
                        style: TextStyle(
                          color: colors.ink,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.2,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _formatDate(plan.plannedDate),
                        style: TextStyle(
                          color: colors.inkDim,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (plan.status == TripPlanStatus.draft || plan.status == TripPlanStatus.ready)
                  _buildCountdown(plan, daysUntil, colors, compact: true)
                else
                  _buildStatusChip(plan.status, colors),
              ],
            ),
            if (route != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  _buildMiniStat(KaipaIcons.ruler,
                      '${route.distanceKm.toStringAsFixed(0)}km', colors),
                  const SizedBox(width: 16),
                  _buildMiniStat(KaipaIcons.altitude,
                      '${route.elevationGainM.toInt()}m', colors),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ─── Action handlers ──────────────────────────────────────────────

  void _handleReschedule(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    _openSwipeId.value = null;
    showDatePicker(
      context: context,
      initialDate: plan.plannedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(ctx).copyWith(
            colorScheme: ColorScheme.light(
              primary: colors.flare,
              onPrimary: Colors.white,
              surface: colors.surface,
              onSurface: colors.ink,
            ),
          ),
          child: child!,
        );
      },
    ).then((picked) async {
      if (picked != null) {
        await ref.read(tripPlanRepositoryProvider).updatePlan(
          plan.id,
          {'planned_date': picked.toIso8601String().split('T').first},
        );
        ref.invalidate(tripPlanListProvider);
      }
    });
  }

  void _handleCancel(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    _openSwipeId.value = null;
    _showConfirmDialog(
      context,
      colors,
      title: '取消行程',
      message: '确定要取消「${plan.route?.name ?? "此行程"}」吗？',
      confirmLabel: '取消行程',
      onConfirm: () async {
        await ref.read(tripPlanRepositoryProvider).updatePlan(
          plan.id,
          {'status': 'cancelled'},
        );
        ref.invalidate(tripPlanListProvider);
      },
    );
  }

  void _handleDelete(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    _openSwipeId.value = null;
    _showConfirmDialog(
      context,
      colors,
      title: '删除行程',
      message: '确定要永久删除「${plan.route?.name ?? "此行程"}」吗？此操作不可撤销。',
      confirmLabel: '删除',
      onConfirm: () async {
        await ref.read(tripPlanRepositoryProvider).deletePlan(plan.id);
        ref.invalidate(tripPlanListProvider);
      },
    );
  }

  void _handleReplan(BuildContext context, WidgetRef ref,
      TripPlanModel plan, KaipaColors colors) {
    _openSwipeId.value = null;
    showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 7)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: '选择新的出发日期',
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(ctx).copyWith(
            colorScheme: ColorScheme.light(
              primary: colors.flare,
              onPrimary: Colors.white,
              surface: colors.surface,
              onSurface: colors.ink,
            ),
          ),
          child: child!,
        );
      },
    ).then((picked) {
      if (picked != null) {
        ref.read(tripPlanRepositoryProvider).createPlan(
          routeId: plan.routeId,
          plannedDate: picked,
        ).then((newPlan) {
          ref.invalidate(tripPlanListProvider);
          if (context.mounted) {
            context.push('/trip-plans/${newPlan.id}?isNew=1');
          }
        });
      }
    });
  }

  void _showConfirmDialog(
    BuildContext context,
    KaipaColors colors, {
    required String title,
    required String message,
    required String confirmLabel,
    required VoidCallback onConfirm,
  }) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        title: Text(
          title,
          style: TextStyle(
            color: colors.ink,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: Text(
          message,
          style: TextStyle(
            color: colors.inkMuted,
            fontSize: 14,
            height: 1.4,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              '再想想',
              style: TextStyle(
                color: colors.inkMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              onConfirm();
            },
            child: Text(
              confirmLabel,
              style: TextStyle(
                color: _kDanger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Components ───────────────────────────────────────────────────

  Widget _buildStatusChip(TripPlanStatus status, KaipaColors colors) {
    final color = _statusColor(status, colors);
    final label = _statusLabel(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(KaipaRadius.pill),
        border: Border.all(color: color.withAlpha(38), width: 0.5),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.1,
        ),
      ),
    );
  }

  Widget _buildCountdown(
      TripPlanModel plan, int daysUntil, KaipaColors colors,
      {bool compact = false}) {
    if (plan.status == TripPlanStatus.departed) {
      final daysSinceDeparture =
          DateTime.now().difference(plan.plannedDate).inDays;
      final label = daysSinceDeparture <= 0 ? '今天出发' : '第${daysSinceDeparture + 1}天';
      return Text(
        label,
        style: TextStyle(
          color: colors.flare,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      );
    }

    if (plan.isDepartureDay) {
      if (compact) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: colorWithOpacity(colors.flare, 0.12),
            borderRadius: BorderRadius.circular(KaipaRadius.pill),
          ),
          child: Text(
            '今天',
            style: TextStyle(
              color: colors.flare,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        );
      }
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: colors.flare,
          borderRadius: BorderRadius.circular(KaipaRadius.pill),
          boxShadow: [
            BoxShadow(
              color: colors.flare.withAlpha(51),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(name: KaipaIcons.flag, size: 11, color: Colors.white),
            SizedBox(width: 4),
            Text(
              '今天出发',
              style: TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );
    }

    if (daysUntil > 0) {
      return Text(
        '$daysUntil天后',
        style: TextStyle(
          color: daysUntil <= 3 ? colors.flare : colors.inkDim,
          fontSize: 13,
          fontWeight: daysUntil <= 3 ? FontWeight.w600 : FontWeight.w400,
        ),
      );
    }

    return Text(
      '已过期',
      style: TextStyle(color: colors.inkDim, fontSize: 12),
    );
  }

  Widget _buildStatItem(String icon, String value, KaipaColors colors,
      {Color? valueColor}) {
    return Expanded(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          KaipaIcon(name: icon, size: 13, color: colors.inkDim),
          const SizedBox(width: 5),
          Text(
            value,
            style: TextStyle(
              color: valueColor ?? colors.inkMuted,
              fontSize: 12,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatLabel(String value, KaipaColors colors, {Color? valueColor}) {
    return Expanded(
      child: Center(
        child: Text(
          value,
          style: TextStyle(
            color: valueColor ?? colors.inkMuted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.2,
          ),
        ),
      ),
    );
  }

  Widget _buildStatDivider(KaipaColors colors) {
    return Container(
      width: 0.5,
      height: 14,
      color: colors.line,
      margin: const EdgeInsets.symmetric(horizontal: 4),
    );
  }

  Widget _buildMiniStat(String icon, String value, KaipaColors colors) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        KaipaIcon(name: icon, size: 12, color: colors.inkDim),
        const SizedBox(width: 4),
        Text(
          value,
          style: TextStyle(
              color: colors.inkDim, fontSize: 12, letterSpacing: -0.2),
        ),
      ],
    );
  }

  Widget _buildPackingProgress(TripPlanModel plan, KaipaColors colors) {
    final ratio = plan.totalGearCount == 0
        ? 0.0
        : plan.packedCount / plan.totalGearCount;
    final allPacked = plan.packedCount == plan.totalGearCount;
    final progressColor = colors.flare;

    return Row(
      children: [
        Text(
          allPacked ? '装备已齐全' : '装备打包',
          style: TextStyle(
            color: colors.inkMuted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ratio,
              backgroundColor: colors.line,
              color: progressColor,
              minHeight: 5,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(
          '${(ratio * 100).toInt()}%',
          style: TextStyle(
            color: progressColor,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }


  // ─── Helpers ──────────────────────────────────────────────────────

  String _formatDate(DateTime date) {
    final weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    final weekday = weekdays[date.weekday - 1];
    return '${date.month}月${date.day}日 $weekday';
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
        return _kDanger;
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

// ═════════════════════════════════════════════════════════════════════
// Swipe-to-reveal action card
// ═════════════════════════════════════════════════════════════════════

class _SwipeAction {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _SwipeAction({
    required this.label,
    required this.color,
    required this.onTap,
  });
}

class _SwipeableCard extends StatefulWidget {
  final String planId;
  final Widget child;
  final List<_SwipeAction> actions;

  const _SwipeableCard({
    required this.planId,
    required this.child,
    required this.actions,
  });

  @override
  State<_SwipeableCard> createState() => _SwipeableCardState();
}

class _SwipeableCardState extends State<_SwipeableCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late Animation<double> _slideAnim;
  double _dragExtent = 0;
  bool _isOpen = false;

  static const _actionWidth = 72.0;
  static const _gap = 6.0;

  double get _totalActionWidth =>
      widget.actions.length * _actionWidth +
      (widget.actions.length - 1) * _gap +
      8;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
    _slideAnim = Tween<double>(begin: 0, end: 0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic),
    );
    _openSwipeId.addListener(_onGlobalSwipeChanged);
  }

  @override
  void dispose() {
    _openSwipeId.removeListener(_onGlobalSwipeChanged);
    _ctrl.dispose();
    super.dispose();
  }

  void _onGlobalSwipeChanged() {
    if (_openSwipeId.value != widget.planId && _isOpen) {
      _animateTo(0);
      _isOpen = false;
    }
  }

  void _animateTo(double target) {
    _slideAnim = Tween<double>(begin: _dragExtent, end: target).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic),
    );
    _ctrl.forward(from: 0).then((_) {
      if (mounted) setState(() => _dragExtent = target);
    });
  }

  void _onDragUpdate(DragUpdateDetails details) {
    setState(() {
      _dragExtent =
          (_dragExtent + details.delta.dx).clamp(-_totalActionWidth, 0);
    });
  }

  void _onDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    final threshold = _totalActionWidth * 0.4;

    if (velocity < -300 || _dragExtent < -threshold) {
      _animateTo(-_totalActionWidth);
      _isOpen = true;
      _openSwipeId.value = widget.planId;
    } else {
      _animateTo(0);
      _isOpen = false;
      if (_openSwipeId.value == widget.planId) {
        _openSwipeId.value = null;
      }
    }
  }

  void _onActionTap(_SwipeAction action) {
    _animateTo(0);
    _isOpen = false;
    _openSwipeId.value = null;
    action.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragUpdate: _onDragUpdate,
      onHorizontalDragEnd: _onDragEnd,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Action buttons behind the card
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  for (int i = 0; i < widget.actions.length; i++) ...[
                    if (i > 0) const SizedBox(width: _gap),
                    _buildActionButton(widget.actions[i]),
                  ],
                  const SizedBox(width: 4),
                ],
              ),
            ),
          ),
          // Sliding foreground card
          AnimatedBuilder(
            animation: _ctrl,
            builder: (_, child) {
              final offset =
                  _ctrl.isAnimating ? _slideAnim.value : _dragExtent;
              return Transform.translate(
                offset: Offset(offset, 0),
                child: child,
              );
            },
            child: widget.child,
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(_SwipeAction action) {
    return GestureDetector(
      onTap: () => _onActionTap(action),
      child: Container(
        width: _actionWidth,
        decoration: BoxDecoration(
          color: colorWithOpacity(action.color, 0.10),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: colorWithOpacity(action.color, 0.15),
            width: 0.5,
          ),
        ),
        child: Center(
          child: Text(
            action.label,
            style: TextStyle(
              color: action.color,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
