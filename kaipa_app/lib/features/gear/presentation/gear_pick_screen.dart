import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';
import '../../discover/data/route_repository.dart';
import '../../discover/domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ─── State management ────────────────────────────────────────────────

class GearPickState {
  final Set<String> selectedItemIds;
  final bool aiApplied;

  const GearPickState({
    this.selectedItemIds = const {},
    this.aiApplied = false,
  });

  GearPickState copyWith({
    Set<String>? selectedItemIds,
    bool? aiApplied,
  }) {
    return GearPickState(
      selectedItemIds: selectedItemIds ?? this.selectedItemIds,
      aiApplied: aiApplied ?? this.aiApplied,
    );
  }
}

class GearPickNotifier extends StateNotifier<GearPickState> {
  GearPickNotifier() : super(const GearPickState());

  void toggleItem(String itemId) {
    final current = Set<String>.from(state.selectedItemIds);
    if (current.contains(itemId)) {
      current.remove(itemId);
    } else {
      current.add(itemId);
    }
    state = state.copyWith(selectedItemIds: current);
  }

  void applyAiPick(List<GearItemModel> allItems) {
    if (state.aiApplied) {
      // Toggle off: clear selection
      state = state.copyWith(selectedItemIds: {}, aiApplied: false);
      return;
    }

    // AI smart pick: select favorites and essentials
    final selected = <String>{};
    for (final item in allItems) {
      if (item.isFavorite) {
        selected.add(item.id);
      }
    }

    // If fewer than 3 favorites, also add some non-favorites
    if (selected.length < 3 && allItems.length > selected.length) {
      final nonFav = allItems.where((i) => !i.isFavorite).toList();
      final rng = Random(42); // deterministic for consistent picks
      nonFav.shuffle(rng);
      for (final item in nonFav) {
        if (selected.length >= min(6, allItems.length)) break;
        selected.add(item.id);
      }
    }

    state = state.copyWith(selectedItemIds: selected, aiApplied: true);
  }

  void setSelection(Set<String> ids) {
    state = state.copyWith(selectedItemIds: ids);
  }
}

final gearPickProvider =
    StateNotifierProvider.autoDispose<GearPickNotifier, GearPickState>(
  (ref) => GearPickNotifier(),
);

// ─── Screen ──────────────────────────────────────────────────────────

class GearPickScreen extends ConsumerWidget {
  final String routeId;

  const GearPickScreen({
    super.key,
    required this.routeId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(routeId));
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final itemsAsync = ref.watch(allGearItemsProvider);
    final pickState = ref.watch(gearPickProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: KaipaIcon(
            name: KaipaIcons.back,
            size: 22,
            color: colors.ink,
          ),
        ),
        title: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '装备选择',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                color: colors.ink,
                letterSpacing: -0.3,
              ),
            ),
            routeAsync.when(
              data: (route) => Text(
                route.name,
                style: TextStyle(
                  fontSize: 12,
                  color: colors.inkMuted,
                  letterSpacing: -0.1,
                ),
              ),
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
      body: _buildBody(
        context,
        ref,
        colors,
        routeAsync,
        categoriesAsync,
        itemsAsync,
        pickState,
      ),
      bottomNavigationBar: itemsAsync.when(
        data: (items) {
          return _buildBottomBar(context, ref, colors, items, pickState);
        },
        loading: () => const SizedBox.shrink(),
        error: (_, _) => const SizedBox.shrink(),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    WidgetRef ref,
    KaipaColors colors,
    AsyncValue<RouteModel> routeAsync,
    AsyncValue<List<GearCategoryModel>> categoriesAsync,
    AsyncValue<List<GearItemModel>> itemsAsync,
    GearPickState pickState,
  ) {
    // If any critical data is loading, show shimmer
    if (categoriesAsync is AsyncLoading || itemsAsync is AsyncLoading) {
      return _buildShimmerLoading(colors);
    }

    // Error state
    if (categoriesAsync is AsyncError || itemsAsync is AsyncError) {
      final error = categoriesAsync.error ?? itemsAsync.error ?? 'Unknown error';
      return _buildErrorState(colors, error, ref);
    }

    final categories = categoriesAsync.valueOrNull ?? [];
    final items = itemsAsync.valueOrNull ?? [];
    final route = routeAsync.valueOrNull;

    // Group items by category
    final itemsByCategory = <String, List<GearItemModel>>{};
    for (final item in items) {
      itemsByCategory.putIfAbsent(item.categoryId, () => []).add(item);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
      children: [
        // AI Smart Pack card
        _AiSmartPackCard(
          colors: colors,
          aiApplied: pickState.aiApplied,
          selectedCount: pickState.selectedItemIds.length,
          onTap: () {
            ref.read(gearPickProvider.notifier).applyAiPick(items);
          },
        ),

        const SizedBox(height: 16),

        // Weather warnings
        if (route != null) _buildWeatherWarnings(colors, route),

        // Gear checklist grouped by category
        ...categories.where((cat) {
          final catItems = itemsByCategory[cat.id];
          return catItems != null && catItems.isNotEmpty;
        }).map((category) {
          final catItems = itemsByCategory[category.id]!;
          return _CategoryChecklist(
            category: category,
            items: catItems,
            selectedIds: pickState.selectedItemIds,
            colors: colors,
            onToggle: (itemId) {
              ref.read(gearPickProvider.notifier).toggleItem(itemId);
            },
          );
        }),
      ],
    );
  }

  Widget _buildWeatherWarnings(KaipaColors colors, RouteModel route) {
    final warnings = <_WarningData>[];

    if (!route.hasWaterSource) {
      warnings.add(_WarningData(
        text: '沿途无水源，请携带足够饮用水',
      ));
    }

    if (route.maxAltitudeM != null && route.maxAltitudeM! > 2000) {
      warnings.add(_WarningData(
        text: '海拔超过 ${route.maxAltitudeM!.toStringAsFixed(0)}m，注意高反',
      ));
    }

    if (route.difficulty == 'hard' || route.difficulty == 'expert') {
      warnings.add(_WarningData(
        text: '路线难度较高，建议携带急救装备',
      ));
    }

    if (route.estimatedDuration.inHours >= 8) {
      warnings.add(_WarningData(
        text: '预计耗时超过8小时，请携带头灯和备用电源',
      ));
    }

    if (warnings.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...warnings.map((w) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: colors.sand.withAlpha(26),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: colors.sand.withAlpha(51),
                    width: 0.5,
                  ),
                ),
                child: Row(
                  children: [
                    KaipaIcon(
                      name: KaipaIcons.shield,
                      size: 18,
                      color: colors.sand,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        w.text,
                        style: TextStyle(
                          fontSize: 13,
                          color: colors.ink,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            )),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildBottomBar(
    BuildContext context,
    WidgetRef ref,
    KaipaColors colors,
    List<GearItemModel> items,
    GearPickState pickState,
  ) {
    final selectedItems =
        items.where((i) => pickState.selectedItemIds.contains(i.id));
    final selectedCount = selectedItems.length;
    double totalWeight = 0;
    for (final item in selectedItems) {
      totalWeight += item.weightG ?? 0;
    }
    final totalWeightKg = totalWeight / 1000;

    return Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 16,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(
          top: BorderSide(color: colors.line, width: 0.5),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '已选 $selectedCount 件 · 总重 ${totalWeightKg.toStringAsFixed(1)} kg',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.ink,
                letterSpacing: -0.2,
              ),
            ),
          ),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: selectedCount > 0
                  ? () {
                      context.pop(pickState.selectedItemIds.toList());
                    }
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.flare,
                foregroundColor: Colors.white,
                disabledBackgroundColor: colors.lineSoft,
                disabledForegroundColor: colors.inkDim,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 32),
              ),
              child: const Text(
                '确认',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShimmerLoading(KaipaColors colors) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              height: 120,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            const SizedBox(height: 16),
            ...List.generate(
              5,
              (i) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(KaipaColors colors, Object error, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(
              name: KaipaIcons.alert,
              size: 48,
              color: colors.diff.extreme,
            ),
            const SizedBox(height: 16),
            Text(
              '加载失败',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              error.toString(),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: colors.inkMuted,
              ),
            ),
            const SizedBox(height: 20),
            TextButton(
              onPressed: () {
                ref.invalidate(gearCategoriesProvider);
                ref.invalidate(allGearItemsProvider);
                ref.invalidate(routeByIdProvider(routeId));
              },
              child: Text(
                '重试',
                style: TextStyle(
                  color: colors.flare,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Warning data ───────────────────────────────────────────────────

class _WarningData {
  final String text;

  const _WarningData({required this.text});
}

// ─── AI Smart Pack card ─────────────────────────────────────────────

class _AiSmartPackCard extends StatelessWidget {
  final KaipaColors colors;
  final bool aiApplied;
  final int selectedCount;
  final VoidCallback onTap;

  const _AiSmartPackCard({
    required this.colors,
    required this.aiApplied,
    required this.selectedCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colors.flareSoft,
            colors.surface,
          ],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: colors.flare.withAlpha(51),
          width: 0.5,
        ),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              KaipaIcon(
                name: KaipaIcons.sparkle,
                size: 22,
                color: colors.flare,
              ),
              const SizedBox(width: 8),
              Text(
                'AI 智能搭配',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: colors.flare.withAlpha(26),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'BETA',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: colors.flare,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '基于路线 + 天气 + 你的装备库',
            style: TextStyle(
              fontSize: 13,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
          const SizedBox(height: 16),
          if (aiApplied) ...[
            Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: colors.moss,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.check,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '已为你勾选 $selectedCount 件',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: colors.moss,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                SizedBox(
                  height: 36,
                  child: TextButton(
                    onPressed: onTap,
                    style: TextButton.styleFrom(
                      foregroundColor: colors.inkMuted,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                    child: const Text(
                      '清除',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ] else ...[
            SizedBox(
              width: double.infinity,
              height: 42,
              child: ElevatedButton(
                onPressed: onTap,
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  '一键搭配',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Category checklist ─────────────────────────────────────────────

class _CategoryChecklist extends StatelessWidget {
  final GearCategoryModel category;
  final List<GearItemModel> items;
  final Set<String> selectedIds;
  final KaipaColors colors;
  final ValueChanged<String> onToggle;

  const _CategoryChecklist({
    required this.category,
    required this.items,
    required this.selectedIds,
    required this.colors,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category header
          Row(
            children: [
              KaipaIcon(
                name: category.icon,
                size: 18,
                color: colors.flare,
              ),
              const SizedBox(width: 8),
              Text(
                category.name,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Item checkboxes
          Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Column(
              children: items.asMap().entries.map((entry) {
                final index = entry.key;
                final item = entry.value;
                final isSelected = selectedIds.contains(item.id);
                final isLast = index == items.length - 1;

                return Column(
                  children: [
                    GestureDetector(
                      onTap: () => onToggle(item.id),
                      behavior: HitTestBehavior.opaque,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        child: Row(
                          children: [
                            // Checkbox
                            Container(
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? colors.flare
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color:
                                      isSelected ? colors.flare : colors.inkDim,
                                  width: 1.5,
                                ),
                              ),
                              child: isSelected
                                  ? const Center(
                                      child: Icon(
                                        Icons.check,
                                        size: 14,
                                        color: Colors.white,
                                      ),
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 12),

                            // Item name
                            Expanded(
                              child: Text(
                                item.name,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: colors.ink,
                                  letterSpacing: -0.2,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),

                            const SizedBox(width: 8),

                            // Weight
                            if (item.weightG != null)
                              Text(
                                '${item.weightG!.toStringAsFixed(0)}g',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: colors.inkDim,
                                  letterSpacing: -0.1,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (!isLast)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        child: Divider(
                          height: 0.5,
                          thickness: 0.5,
                          color: colors.lineSoft,
                        ),
                      ),
                  ],
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
