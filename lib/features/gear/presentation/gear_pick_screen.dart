import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../discover/data/route_repository.dart';
import '../../trip/data/departure_flow_provider.dart';
import '../../trip_plan/data/trip_plan_repository.dart';
import '../data/gear_repository.dart';

// ─── Demo data models ───────────────────────────────────────────────

enum _GearStatus { on, off, missing }

class _DemoGearItem {
  final String id;
  final String name;
  final String icon;
  final String? specs;
  final bool recommended;
  final _GearStatus status;

  const _DemoGearItem({
    required this.id,
    required this.name,
    required this.icon,
    this.specs,
    this.recommended = false,
    this.status = _GearStatus.on,
  });
}

class _DemoCategory {
  final String title;
  final List<_DemoGearItem> items;

  const _DemoCategory({required this.title, required this.items});
}

const _kAlertColor = Color(0xFFC0392B);
const _kWarnColor = Color(0xFFC97A1F);

final _demoCategories = <_DemoCategory>[
  _DemoCategory(title: '鞋履', items: [
    _DemoGearItem(
      id: 'shoe1',
      name: '萨洛蒙 防水低帮徒步鞋',
      icon: KaipaIcons.boot,
      specs: '防水 · 395g',
      recommended: true,
    ),
    _DemoGearItem(
      id: 'sock1',
      name: '中厚羊毛户外袜',
      icon: KaipaIcons.socks,
      specs: '美利奴 · 中厚',
    ),
  ]),
  _DemoCategory(title: '背包', items: [
    _DemoGearItem(
      id: 'pack1',
      name: '鱼鹰 日用徒步背包',
      icon: KaipaIcons.backpack,
      specs: '33L · 890g',
      recommended: true,
    ),
  ]),
  _DemoCategory(title: '衣物', items: [
    _DemoGearItem(
      id: 'cloth1',
      name: '巴塔哥尼亚 轻量防水冲锋衣',
      icon: KaipaIcons.jacket,
      specs: '三层防水 · 460g',
      recommended: true,
    ),
    _DemoGearItem(
      id: 'cloth2',
      name: '始祖鸟 合成棉服',
      icon: KaipaIcons.jacket,
      specs: '保暖层 · 380g',
      status: _GearStatus.off,
    ),
  ]),
  _DemoCategory(title: '水补给', items: [
    _DemoGearItem(
      id: 'water1',
      name: '广口水壶 1L×2',
      icon: KaipaIcons.bottle,
      specs: '2L 总量',
    ),
    _DemoGearItem(
      id: 'fuel1',
      name: '能量胶×4',
      icon: KaipaIcons.food,
      specs: '128kcal/支',
    ),
  ]),
  _DemoCategory(title: '安全装备', items: [
    _DemoGearItem(
      id: 'safe1',
      name: '攀索 充电式头灯',
      icon: KaipaIcons.light,
      specs: '350流明 · 82g',
      recommended: true,
    ),
    _DemoGearItem(
      id: 'safe2',
      name: '急救包',
      icon: KaipaIcons.firstAid,
      specs: '基础型',
      status: _GearStatus.missing,
    ),
    _DemoGearItem(
      id: 'safe3',
      name: '防水袋 5L',
      icon: KaipaIcons.shield,
      specs: '卷口式',
      status: _GearStatus.missing,
    ),
  ]),
];

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
  GearPickNotifier()
      : super(GearPickState(
          // Start with all "on" items selected
          selectedItemIds: _demoCategories
              .expand((c) => c.items)
              .where((i) => i.status == _GearStatus.on)
              .map((i) => i.id)
              .toSet(),
        ));

  void toggleItem(String itemId) {
    final current = Set<String>.from(state.selectedItemIds);
    if (current.contains(itemId)) {
      current.remove(itemId);
    } else {
      current.add(itemId);
    }
    state = state.copyWith(selectedItemIds: current);
  }

  void applyAiPick([List<_DemoCategory>? categories]) {
    final cats = categories ?? _demoCategories;
    if (state.aiApplied) {
      state = state.copyWith(
        selectedItemIds: cats
            .expand((c) => c.items)
            .where((i) => i.status == _GearStatus.on)
            .map((i) => i.id)
            .toSet(),
        aiApplied: false,
      );
      return;
    }

    final selected = <String>{};
    for (final cat in cats) {
      for (final item in cat.items) {
        if (item.status != _GearStatus.missing) {
          selected.add(item.id);
        }
      }
    }
    state = state.copyWith(selectedItemIds: selected, aiApplied: true);
  }
}

final gearPickProvider =
    StateNotifierProvider.autoDispose<GearPickNotifier, GearPickState>(
  (ref) => GearPickNotifier(),
);

// ─── Warning data ───────────────────────────────────────────────────

enum _WarnLevel { alert, warn }

class _WarningData {
  final _WarnLevel level;
  final String title;
  final String body;

  const _WarningData({
    required this.level,
    required this.title,
    required this.body,
  });
}

const _demoWarnings = <_WarningData>[
  _WarningData(
    level: _WarnLevel.alert,
    title: '装备库缺 2 件关键装备',
    body: '急救包 · 防水袋 5L — 可借用或购买',
  ),
  _WarningData(
    level: _WarnLevel.warn,
    title: '夜间最低 4°C，建议加保暖中层',
    body: '当前已选硬壳，但缺羽绒/棉服中层...',
  ),
];

// ─── Screen ──────────────────────────────────────────────────────────

class GearPickScreen extends ConsumerStatefulWidget {
  final String routeId;
  final String? planId;

  const GearPickScreen({
    super.key,
    required this.routeId,
    this.planId,
  });

  @override
  ConsumerState<GearPickScreen> createState() => _GearPickScreenState();
}

class _GearPickScreenState extends ConsumerState<GearPickScreen> {
  bool get _isForPlan => widget.planId != null;
  List<_DemoCategory>? _realCategories;
  bool _realDataLoaded = false;

  @override
  void initState() {
    super.initState();
    if (_isForPlan) _loadRealData();
  }

  Future<void> _loadRealData() async {
    final categories = await ref.read(gearCategoriesProvider.future);
    final allItems = await ref.read(allGearItemsProvider.future);

    final result = <_DemoCategory>[];
    for (final cat in categories) {
      final items = allItems.where((i) =>
          i.categoryId == cat.id || i.categoryId == cat.builtinRef).toList();
      if (items.isEmpty) continue;
      result.add(_DemoCategory(
        title: cat.name,
        items: items.map((i) => _DemoGearItem(
          id: i.id,
          name: i.name,
          icon: KaipaIcons.backpack,
          specs: [
            if (i.brand != null) i.brand!,
            if (i.weightG != null) '${i.weightG!.toInt()}g',
          ].join(' · '),
          recommended: i.isFavorite,
        )).toList(),
      ));
    }

    if (mounted) {
      setState(() {
        _realCategories = result;
        _realDataLoaded = true;
      });
      ref.read(gearPickProvider.notifier).state = const GearPickState(
        selectedItemIds: {},
        aiApplied: false,
      );
    }
  }

  List<_DemoCategory> get _activeCategories =>
      _isForPlan ? (_realCategories ?? []) : _demoCategories;

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final pickState = ref.watch(gearPickProvider);

    if (_isForPlan && !_realDataLoaded) {
      return Scaffold(
        backgroundColor: colors.bg,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // Count alerts
    final alertCount = _isForPlan ? 0 :
        _demoWarnings.where((w) => w.level == _WarnLevel.alert).length;
    final warnCount = _isForPlan ? 0 :
        _demoWarnings.where((w) => w.level == _WarnLevel.warn).length;
    final hasAlert = alertCount > 0;
    final hasWarn = warnCount > 0;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          // Scrollable content
          ListView(
            padding: EdgeInsets.only(
              top: 0,
              bottom: MediaQuery.of(context).padding.bottom + 90,
            ),
            children: [
              // Header
              _buildHeader(context, colors),

              // AI Smart Pack card
              _buildAiCard(colors, pickState),

              // Warning stack
              if (!_isForPlan) _buildWarnings(colors),

              // Gear categories
              _buildGearCategories(colors, pickState),
            ],
          ),

          // CTA button at bottom
          _buildCta(context, colors, hasAlert, hasWarn, alertCount),
        ],
      ),
    );
  }

  // ─── Header ─────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, KaipaColors colors) {
    final topPadding = MediaQuery.of(context).padding.top;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, topPadding + 8, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row: close + step + ellipsis
          Row(
            children: [
              CircleButton(
                icon: KaipaIcons.close,
                onTap: () => context.pop(),
              ),
              const Spacer(),
              if (!_isForPlan)
                Text(
                  '第 1 步 / 共 3 步',
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),
              const Spacer(),
              CircleButton(
                icon: KaipaIcons.ellipsis,
                onTap: () {},
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Route context
          _buildRouteContext(ref, colors),

          // Title
          Text(
            _isForPlan ? '选择携带装备' : '选择今天带哪些装备',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.7,
              height: 1.15,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouteContext(WidgetRef ref, KaipaColors colors) {
    final routeAsync = ref.watch(routeByIdProvider(widget.routeId));
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: routeAsync.when(
        loading: () => const SizedBox(height: 16),
        error: (_, _) => const SizedBox.shrink(),
        data: (route) {
          final parts = <String>[route.name];
          if (route.difficultyGrade != null) {
            parts.add('${route.difficulty} ${route.difficultyGrade}');
          } else {
            parts.add(route.difficulty);
          }
          parts.add('${route.distanceKm.toStringAsFixed(1)} 公里');
          return Text(
            parts.join(' · '),
            style: TextStyle(
              fontSize: 12,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          );
        },
      ),
    );
  }

  // ─── AI Smart Pack card ─────────────────────────────────────────────

  Widget _buildAiCard(KaipaColors colors, GearPickState pickState) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment(-0.3, -1),
            end: Alignment(0.3, 1),
            stops: [0.0, 0.7],
            colors: [
              // flareSoft at 0%, surface at 70%
              // We approximate with the gradient below
              Color(0x1E5C8A4A), // flareSoft placeholder
              Color(0xFFFFFFFF), // surface placeholder
            ],
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: colors.flare.withAlpha(77), // flare+30
            width: 0.5,
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(
            children: [
              // Actual gradient background
              Positioned.fill(
                child: DecoratedBox(
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
                  ),
                ),
              ),

              // Decorative glow overlay (radial gradient, top-right)
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
                          colors.flare.withAlpha(102), // 0.4 opacity
                          colors.flare.withAlpha(0),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              // Content
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Sparkle icon circle + text row
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // 32x32 sparkle icon circle
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: colors.flare,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: colors.flare.withAlpha(140), // flare+55
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
                              // Title + BETA badge
                              Row(
                                children: [
                                  Text(
                                    'AI 智能搭配',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: colors.ink,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 5,
                                      vertical: 1.5,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(99),
                                      border: Border.all(
                                        color: colors.flare.withAlpha(102), // flare+40
                                        width: 0.5,
                                      ),
                                    ),
                                    child: Text(
                                      'BETA',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                        color: colors.flare,
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              // Subtitle
                              Text(
                                '基于路线 + 天气 + 你的装备库',
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

                    const SizedBox(height: 12),

                    // Reasoning bullet
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Dot indicator: 14px circle
                        Container(
                          width: 14,
                          height: 14,
                          margin: const EdgeInsets.only(top: 2),
                          decoration: BoxDecoration(
                            color: colors.mossDeep.withAlpha(51), // mossDeep+20
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Container(
                              width: 5,
                              height: 5,
                              decoration: BoxDecoration(
                                color: colors.mossDeep,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '点下方按钮，AI 根据路线难度、天气与你的装备库自动勾选',
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.ink,
                              height: 1.55,
                              letterSpacing: -0.1,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // Buttons row
                    Row(
                      children: [
                        // Primary: "一键智能搭配"
                        Expanded(
                          child: GestureDetector(
                            onTap: () {
                              ref.read(gearPickProvider.notifier).applyAiPick(_activeCategories);
                            },
                            child: Container(
                              height: 40,
                              decoration: BoxDecoration(
                                color: colors.flare,
                                borderRadius: BorderRadius.circular(12),
                                boxShadow: [
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
                                  const KaipaIcon(
                                    name: KaipaIcons.sparkle,
                                    size: 14,
                                    color: Colors.white,
                                  ),
                                  const SizedBox(width: 6),
                                  const Text(
                                    '一键智能搭配',
                                    style: TextStyle(
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
                        ),
                        const SizedBox(width: 8),
                        // Secondary: "手动选"
                        GestureDetector(
                          onTap: () {
                            // Already in manual mode, just scroll down
                          },
                          child: Container(
                            height: 40,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: colors.line,
                                width: 0.5,
                              ),
                            ),
                            child: Center(
                              child: Text(
                                '手动选',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: colors.ink,
                                  letterSpacing: -0.1,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── Warning stack ──────────────────────────────────────────────────

  Widget _buildWarnings(KaipaColors colors) {
    if (_demoWarnings.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        children: _demoWarnings.map((w) {
          final isAlert = w.level == _WarnLevel.alert;
          final color = isAlert ? _kAlertColor : _kWarnColor;

          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(
                color: color.withAlpha(18), // rgba(color, 0.07)
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: color.withAlpha(77), // color+30
                  width: 0.5,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Alert circle with "!"
                  Container(
                    width: 24,
                    height: 24,
                    margin: const EdgeInsets.only(top: 1),
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                    child: const Center(
                      child: Text(
                        '!',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          w.title,
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: color,
                            letterSpacing: -0.1,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Opacity(
                          opacity: 0.75,
                          child: Text(
                            w.body,
                            style: TextStyle(
                              fontSize: 11,
                              color: colors.ink,
                              letterSpacing: -0.1,
                              height: 1.4,
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
        }).toList(),
      ),
    );
  }

  // ─── Gear categories ────────────────────────────────────────────────

  Widget _buildGearCategories(KaipaColors colors, GearPickState pickState) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        children: _activeCategories.map((category) {
          return _buildCategorySection(colors, category, pickState);
        }).toList(),
      ),
    );
  }

  Widget _buildCategorySection(
    KaipaColors colors,
    _DemoCategory category,
    GearPickState pickState,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              category.title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.2,
              ),
            ),
          ),

          // Items container
          Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: colors.line,
                width: 0.5,
              ),
            ),
            child: Column(
              children: [
                for (int i = 0; i < category.items.length; i++) ...[
                  if (i > 0)
                    Divider(
                      height: 0.5,
                      thickness: 0.5,
                      color: colors.line,
                      indent: 14,
                      endIndent: 14,
                    ),
                  _buildItemRow(colors, category.items[i], pickState),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemRow(
    KaipaColors colors,
    _DemoGearItem item,
    GearPickState pickState,
  ) {
    final isSelected = pickState.selectedItemIds.contains(item.id);
    final isMissing = item.status == _GearStatus.missing;

    // Icon background color
    Color iconBg;
    if (isMissing) {
      iconBg = const Color.fromRGBO(192, 57, 43, 0.12);
    } else if (isSelected) {
      iconBg = colors.mossSoft;
    } else {
      iconBg = colors.surfaceHi;
    }

    return GestureDetector(
      onTap: isMissing ? null : () {
        ref.read(gearPickProvider.notifier).toggleItem(item.id);
      },
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            // Icon circle (40x40, borderRadius 11)
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Center(
                child: KaipaIcon(
                  name: item.icon,
                  size: 19,
                  color: isMissing
                      ? _kAlertColor
                      : isSelected
                          ? colors.moss
                          : colors.inkDim,
                ),
              ),
            ),
            const SizedBox(width: 12),

            // Center content: name + badges + specs
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name + badges
                  Row(
                    children: [
                      Flexible(
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
                      if (item.recommended && !isMissing) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1.5,
                          ),
                          decoration: BoxDecoration(
                            color: colors.flareSoft,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '推荐',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: colors.flare,
                              letterSpacing: -0.1,
                            ),
                          ),
                        ),
                      ],
                      if (isMissing) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1.5,
                          ),
                          decoration: BoxDecoration(
                            color: const Color.fromRGBO(192, 57, 43, 0.10),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            '装备库缺',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: _kAlertColor,
                              letterSpacing: -0.1,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (item.specs != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.specs!,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: colors.inkMuted,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),

            // Right: checkbox or borrow/buy buttons
            if (isMissing)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildSmallButton(colors, '借'),
                  const SizedBox(width: 6),
                  _buildSmallButton(colors, '购'),
                ],
              )
            else
              // Checkbox (24px circle)
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: isSelected ? colors.flare : Colors.transparent,
                  shape: BoxShape.circle,
                  border: isSelected
                      ? null
                      : Border.all(
                          color: colors.line,
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
          ],
        ),
      ),
    );
  }

  Widget _buildSmallButton(KaipaColors colors, String label) {
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: colors.line,
          width: 0.5,
        ),
      ),
      child: Center(
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.ink,
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }

  // ─── CTA button ─────────────────────────────────────────────────────

  Widget _buildCta(
    BuildContext context,
    KaipaColors colors,
    bool hasAlert,
    bool hasWarn,
    int alertCount,
  ) {
    // Determine CTA state
    String ctaText;
    Color ctaBg;
    Color ctaTextColor;
    Border? ctaBorder;
    List<BoxShadow>? ctaShadow;

    if (hasAlert || hasWarn) {
      ctaText = '了解风险，仍要继续 →';
      ctaBg = colors.flare;
      ctaTextColor = Colors.white;
    } else {
      ctaText = _isForPlan ? '确认选择' : '下一步 · 天气与时间  ›';
      ctaBg = colors.flare;
      ctaTextColor = Colors.white;
      ctaShadow = [
        BoxShadow(
          color: colors.flare.withAlpha(77),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ];
    }

    final bottomPadding = MediaQuery.of(context).padding.bottom;

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
        padding: EdgeInsets.fromLTRB(16, 24, 16, bottomPadding + 16),
        child: GestureDetector(
          onTap: () async {
            final gearIds = ref.read(gearPickProvider).selectedItemIds;
            if (widget.planId != null) {
              await ref.read(tripPlanRepositoryProvider).syncGearItems(
                planId: widget.planId!,
                gearItemIds: gearIds,
              );
              if (context.mounted) {
                ref.invalidate(tripPlanDetailProvider(widget.planId!));
                ref.invalidate(tripPlanListProvider);
                context.pop();
              }
              return;
            }
            ref.read(departureFlowProvider(widget.routeId).notifier).setGear(gearIds.toList());
            context.push('/weather/${widget.routeId}');
          },
          child: Container(
            height: 54,
            decoration: BoxDecoration(
              color: ctaBg,
              borderRadius: BorderRadius.circular(16),
              border: ctaBorder,
              boxShadow: ctaShadow,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  ctaText,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: ctaTextColor,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(width: 6),
                KaipaIcon(
                  name: KaipaIcons.forward,
                  size: 16,
                  color: ctaTextColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
