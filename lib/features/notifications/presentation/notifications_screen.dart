import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ─── Demo notification data model ────────────────────────────────────
class _DemoNotif {
  final String title;
  final String detail;
  final String time;
  final bool unread;
  final String icon;
  final Color Function(KaipaColors) iconColor;
  final String type; // for filtering: weather, social, system, achievement

  const _DemoNotif({
    required this.title,
    required this.detail,
    required this.time,
    this.unread = false,
    required this.icon,
    required this.iconColor,
    required this.type,
  });
}

class _DemoSection {
  final String label;
  final List<_DemoNotif> items;

  const _DemoSection({required this.label, required this.items});
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String _filter = '';

  // ─── Filter chip definitions ─────────────────────────────────────
  static const List<Map<String, String>> _filters = [
    {'id': '', 'label': '全部', 'icon': ''},
    {'id': 'weather', 'label': '天气', 'icon': 'weather'},
    {'id': 'social', 'label': '好友', 'icon': 'users'},
    {'id': 'system', 'label': '系统', 'icon': 'bell'},
  ];

  // ─── Hardcoded demo data ─────────────────────────────────────────
  static List<_DemoSection> _buildDemoData() {
    return [
      _DemoSection(
        label: '今天',
        items: [
          _DemoNotif(
            title: '天气预警 · 箭扣长城',
            detail: '明日午后雷阵雨概率 65%，建议调整出行时间',
            time: '2 小时前',
            unread: true,
            icon: KaipaIcons.weather,
            iconColor: (c) => c.sky,
            type: 'weather',
          ),
          _DemoNotif(
            title: 'Sara K. 赞了你的路线',
            detail: '箭扣长城 · 11.4km',
            time: '4 小时前',
            unread: true,
            icon: KaipaIcons.heart,
            iconColor: (c) => c.flare,
            type: 'social',
          ),
          _DemoNotif(
            title: '离线地图已更新',
            detail: '怀柔区地图包 v3.2 · 248MB',
            time: '5 小时前',
            unread: false,
            icon: KaipaIcons.download,
            iconColor: (c) => c.moss,
            type: 'system',
          ),
        ],
      ),
      _DemoSection(
        label: '昨天',
        items: [
          _DemoNotif(
            title: '陈芳 开始了行程',
            detail: '十三陵水库环线 · 正在进行中',
            time: '昨天 14:20',
            unread: false,
            icon: KaipaIcons.users,
            iconColor: (c) => c.sand,
            type: 'social',
          ),
          _DemoNotif(
            title: '新成就解锁!',
            detail: '「百公里」— 累计徒步超过 100km',
            time: '昨天 11:30',
            unread: false,
            icon: KaipaIcons.flag,
            iconColor: (c) => c.flare,
            type: 'system',
          ),
        ],
      ),
      _DemoSection(
        label: '本周',
        items: [
          _DemoNotif(
            title: '本周末天气预报',
            detail: '周六多云 18°C，周日晴 22°C — 适合出行',
            time: '周三',
            unread: false,
            icon: KaipaIcons.sun,
            iconColor: (c) => c.sky,
            type: 'weather',
          ),
          _DemoNotif(
            title: '陈明 评论了你的路线',
            detail: '「鹰飞倒仰确实很险，下次一起去…」',
            time: '周二',
            unread: false,
            icon: KaipaIcons.chat,
            iconColor: (c) => c.moss,
            type: 'social',
          ),
          _DemoNotif(
            title: 'Kaipa 周报',
            detail: '本周 2 次出行 · 28.7km · 查看回顾 →',
            time: '周一',
            unread: false,
            icon: KaipaIcons.sparkle,
            iconColor: (c) => c.flare,
            type: 'system',
          ),
        ],
      ),
    ];
  }

  List<_DemoSection> _getFilteredData() {
    final allData = _buildDemoData();
    if (_filter.isEmpty) return allData;

    // Filter items within each section; keep sections that still have items
    final filtered = <_DemoSection>[];
    for (final section in allData) {
      final items = section.items.where((n) {
        if (_filter == 'social') {
          return n.type == 'social';
        }
        return n.type == _filter;
      }).toList();
      if (items.isNotEmpty) {
        filtered.add(_DemoSection(label: section.label, items: items));
      }
    }
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final sections = _getFilteredData();

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            // --- Header ---
            _buildHeader(colors),
            const SizedBox(height: 12),

            // --- Filter chips ---
            _buildFilterChips(colors),
            const SizedBox(height: 8),

            // --- Notification list ---
            Expanded(
              child: sections.isEmpty
                  ? _buildEmptyState(colors)
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      itemCount: sections.length,
                      itemBuilder: (_, i) => _buildSection(
                        sections[i],
                        colors,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Header: GlassContainer back + title + "全部已读" ──────────────
  Widget _buildHeader(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          CircleButton(
            icon: KaipaIcons.back,
            onTap: () => context.pop(),
          ),
          const Spacer(),
          Text(
            '通知',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.5,
            ),
          ),
          const Spacer(),
          GestureDetector(
            onTap: () {
              // Mark all as read (demo: no-op)
            },
            child: Text(
              '全部已读',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: colors.flare,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Filter chips: 4 horizontal pills ──────────────────────────────
  Widget _buildFilterChips(KaipaColors colors) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: _filters.map((f) {
          final isActive = _filter == f['id'];
          final hasIcon = f['icon']!.isNotEmpty;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => setState(() => _filter = f['id']!),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: isActive ? colors.ink : colors.surface,
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(
                    color: isActive ? colors.ink : colors.line,
                    width: 0.5,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (hasIcon) ...[
                      KaipaIcon(
                        name: f['icon']!,
                        size: 13,
                        color: isActive ? colors.bg : colors.ink,
                      ),
                      const SizedBox(width: 5),
                    ],
                    Text(
                      f['label']!,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: isActive ? colors.bg : colors.ink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ─── Empty state ───────────────────────────────────────────────────
  Widget _buildEmptyState(KaipaColors colors) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          KaipaIcon(
            name: KaipaIcons.bell,
            size: 48,
            color: colors.inkDim,
          ),
          const SizedBox(height: 12),
          Text(
            '没有通知',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: colors.ink,
            ),
          ),
        ],
      ),
    );
  }

  // ─── Section: label + grouped surface container ────────────────────
  Widget _buildSection(_DemoSection section, KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section label
        Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8, left: 2),
          child: Text(
            section.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: colors.inkMuted,
              letterSpacing: 0.3,
            ),
          ),
        ),

        // Grouped surface container
        Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Column(
              children: List.generate(
                section.items.length * 2 - 1,
                (index) {
                  if (index.isOdd) {
                    // Divider between rows
                    return Divider(
                      height: 0.5,
                      thickness: 0.5,
                      color: colors.lineSoft,
                      indent: 0,
                      endIndent: 0,
                    );
                  }
                  final notif = section.items[index ~/ 2];
                  return _buildNotifRow(notif, colors);
                },
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ─── Single notification row ───────────────────────────────────────
  Widget _buildNotifRow(_DemoNotif notif, KaipaColors colors) {
    final typeColor = notif.iconColor(colors);

    return Container(
      color: notif.unread
          ? colorWithOpacity(colors.flareSoft, 0.30)
          : Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Icon circle: 36x36, borderRadius 10
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: colorWithOpacity(typeColor, 0.20),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: KaipaIcon(
                name: notif.icon,
                size: 17,
                color: typeColor,
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Content column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title row with unread dot
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        notif.title,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: notif.unread
                              ? FontWeight.w700
                              : FontWeight.w400,
                          color: colors.ink,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ),
                    if (notif.unread)
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.only(left: 8),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: colors.flare,
                        ),
                      ),
                  ],
                ),

                // Detail text
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    notif.detail,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: colors.inkMuted,
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),

                // Time text
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    notif.time,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      color: colors.inkDim,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
