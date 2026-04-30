import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _presets = [
    {'id': 'moss', 'label': '苔藓', 'hex': '#4A7C59'},
    {'id': 'forest', 'label': '森林', 'hex': '#2E5C3E'},
    {'id': 'hunter', 'label': '猎人', 'hex': '#1F4030'},
    {'id': 'pine', 'label': '松柏', 'hex': '#3A5F4A'},
    {'id': 'juniper', 'label': '杜松', 'hex': '#5C7A65'},
    {'id': 'ember', 'label': '砖红', 'hex': '#A84228'},
    {'id': 'ochre', 'label': '赭石', 'hex': '#A8762B'},
    {'id': 'lake', 'label': '湖蓝', 'hex': '#2C5D7E'},
    {'id': 'midnight', 'label': '暗夜', 'hex': '#26334D'},
    {'id': 'ink', 'label': '墨色', 'hex': '#1F2A2D'},
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final themePrefs = ref.watch(themePrefsProvider);
    final notifier = ref.read(themePrefsProvider.notifier);

    return Scaffold(
      backgroundColor: colors.bg,
      body: Column(
        children: [
          // ── Header ──────────────────────────────────────────
          _Header(colors: colors),
          // ── Scrollable content ──────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Appearance mode selector ────────────────
                  _SectionLabel(label: '外观模式', colors: colors),
                  const SizedBox(height: 10),
                  _AppearanceModeSelector(
                    currentMode: themePrefs.mode,
                    colors: colors,
                    onModeChanged: notifier.setMode,
                  ),
                  const SizedBox(height: 22),

                  // ── Theme color picker ──────────────────────
                  _SectionLabel(label: '主题色', colors: colors),
                  const SizedBox(height: 10),
                  _ThemeColorSection(
                    presets: _presets,
                    selectedPreset: themePrefs.useCustom ? '' : themePrefs.preset,
                    colors: colors,
                    onPresetSelected: notifier.setPreset,
                  ),
                  const SizedBox(height: 22),

                  // ── General settings ────────────────────────
                  _SectionLabel(label: '通用', colors: colors),
                  const SizedBox(height: 10),
                  _SettingsGroup(
                    colors: colors,
                    children: [
                      _SettingRow(
                        iconData: Icons.language,
                        title: '语言',
                        detail: '简体中文',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.straighten,
                        title: '单位',
                        detail: '公制(km,m)',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.location_on,
                        title: '离线地图',
                        detail: '已下载3个区域·1.2GB',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.notifications,
                        title: '通知',
                        detail: '天气预警、好友动态',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.security,
                        title: '隐私',
                        detail: '仅好友可见轨迹',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.cloud,
                        title: '数据同步',
                        detail: 'iCloud·最近同步2分钟前',
                        colors: colors,
                        onTap: () {},
                        isLast: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),

                  // ── About section ───────────────────────────
                  _SectionLabel(label: '关于', colors: colors),
                  const SizedBox(height: 10),
                  _SettingsGroup(
                    colors: colors,
                    children: [
                      _SettingRow(
                        iconData: Icons.chat_bubble,
                        title: '反馈与帮助',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.star,
                        title: '给Kaipa评分',
                        colors: colors,
                        onTap: () {},
                      ),
                      _SettingRow(
                        iconData: Icons.lock,
                        title: '用户协议与隐私',
                        colors: colors,
                        onTap: () {},
                        isLast: true,
                      ),
                    ],
                  ),

                  // ── Version footer ──────────────────────────
                  const SizedBox(height: 24),
                  Center(
                    child: Text(
                      'Kaipa v1.0.0 (build 42)',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkDim,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Header ─────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final KaipaColors colors;
  const _Header({required this.colors});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 60, left: 16, right: 16),
      child: Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 24),
        child: Row(
          children: [
            CircleButton(
              icon: KaipaIcons.back,
              size: 40,
              iconSize: 16,
              onTap: () => context.pop(),
            ),
            const SizedBox(width: 12),
            Text(
              '设置',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Section label ──────────────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final String label;
  final KaipaColors colors;
  const _SectionLabel({required this.label, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: colors.inkMuted,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

// ─── Appearance mode selector (3-column grid) ───────────────────────────
class _AppearanceModeSelector extends StatelessWidget {
  final String currentMode;
  final KaipaColors colors;
  final void Function(String) onModeChanged;

  const _AppearanceModeSelector({
    required this.currentMode,
    required this.colors,
    required this.onModeChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ModeCard(
            iconData: Icons.wb_sunny_outlined,
            label: '浅色',
            modeKey: 'light',
            isSelected: currentMode == 'light',
            colors: colors,
            onTap: () => onModeChanged('light'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ModeCard(
            iconData: Icons.dark_mode,
            label: '深色',
            modeKey: 'dark',
            isSelected: currentMode == 'dark',
            colors: colors,
            onTap: () => onModeChanged('dark'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ModeCard(
            iconData: Icons.phone_iphone,
            label: '跟随系统',
            modeKey: 'system',
            isSelected: currentMode == 'system',
            colors: colors,
            onTap: () => onModeChanged('system'),
          ),
        ),
      ],
    );
  }
}

class _ModeCard extends StatelessWidget {
  final IconData iconData;
  final String label;
  final String modeKey;
  final bool isSelected;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _ModeCard({
    required this.iconData,
    required this.label,
    required this.modeKey,
    required this.isSelected,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        decoration: BoxDecoration(
          color: isSelected ? colors.mossSoft : colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? colors.mossDeep : colors.line,
            width: 1.5,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              iconData,
              size: 24,
              color: isSelected ? colors.mossDeep : colors.inkMuted,
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? colors.mossDeep : colors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Theme color section (container with picker + preview + custom) ─────
class _ThemeColorSection extends StatelessWidget {
  final List<Map<String, String>> presets;
  final String selectedPreset;
  final KaipaColors colors;
  final void Function(String) onPresetSelected;

  const _ThemeColorSection({
    required this.presets,
    required this.selectedPreset,
    required this.colors,
    required this.onPresetSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: [
          // ── Color grid (5x2 wrap) ──────────────────────────
          _ThemeColorGrid(
            presets: presets,
            selectedPreset: selectedPreset,
            colors: colors,
            onPresetSelected: onPresetSelected,
          ),

          // ── Preview strip ──────────────────────────────────
          const SizedBox(height: 16),
          _ColorPreviewStrip(colors: colors),

          // ── Custom color row ───────────────────────────────
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.only(top: 10),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(color: colors.lineSoft, width: 0.5),
              ),
            ),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {},
              child: Row(
                children: [
                  KaipaIcon(
                    name: KaipaIcons.sparkle,
                    size: 15,
                    color: colors.inkMuted,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '自定义颜色',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: colors.ink,
                      ),
                    ),
                  ),
                  // Conic gradient color wheel
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: colors.line, width: 1.5),
                      gradient: const SweepGradient(
                        colors: [
                          Color(0xFFFF0000),
                          Color(0xFFFFFF00),
                          Color(0xFF00FF00),
                          Color(0xFF00FFFF),
                          Color(0xFF0000FF),
                          Color(0xFFFF00FF),
                          Color(0xFFFF0000),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  KaipaIcon(
                    name: KaipaIcons.forward,
                    size: 14,
                    color: colors.inkDim,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Theme color grid (5x2 wrap) ────────────────────────────────────────
class _ThemeColorGrid extends StatelessWidget {
  final List<Map<String, String>> presets;
  final String selectedPreset;
  final KaipaColors colors;
  final void Function(String) onPresetSelected;

  const _ThemeColorGrid({
    required this.presets,
    required this.selectedPreset,
    required this.colors,
    required this.onPresetSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: presets.map((p) {
        final id = p['id']!;
        final hex = p['hex']!;
        final label = p['label']!;
        final isActive = selectedPreset == id;
        final color = hexToColor(hex);

        return GestureDetector(
          onTap: () => onPresetSelected(id),
          child: SizedBox(
            width: 52,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color,
                    boxShadow: isActive
                        ? [
                            BoxShadow(
                              color: colors.bg,
                              spreadRadius: 2.5,
                            ),
                            BoxShadow(
                              color: color,
                              spreadRadius: 4.5,
                            ),
                          ]
                        : [
                            BoxShadow(
                              color: colorWithOpacity(color, 0.30),
                              blurRadius: 6,
                              offset: const Offset(0, 2),
                            ),
                          ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                    color: isActive ? colors.ink : colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ─── Color preview strip ────────────────────────────────────────────────
class _ColorPreviewStrip extends StatelessWidget {
  final KaipaColors colors;
  const _ColorPreviewStrip({required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceHi,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.lineSoft, width: 0.5),
      ),
      child: Row(
        children: [
          // 40x40 flare-colored icon box
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.flare,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: Icon(
                Icons.terrain,
                size: 20,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '预览效果',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '当前主题色的预览展示',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
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

// ─── Settings group container ───────────────────────────────────────────
class _SettingsGroup extends StatelessWidget {
  final KaipaColors colors;
  final List<Widget> children;

  const _SettingsGroup({
    required this.colors,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(children: children),
    );
  }
}

// ─── Setting row ────────────────────────────────────────────────────────
class _SettingRow extends StatelessWidget {
  final IconData iconData;
  final String title;
  final String? detail;
  final KaipaColors colors;
  final VoidCallback? onTap;
  final bool isLast;

  const _SettingRow({
    required this.iconData,
    required this.title,
    required this.colors,
    this.detail,
    this.onTap,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: isLast
            ? null
            : BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: colors.lineSoft, width: 0.5),
                ),
              ),
        child: Row(
          children: [
            // 34x34 icon circle with mossSoft bg
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: colors.mossSoft,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Center(
                child: Icon(
                  iconData,
                  size: 16,
                  color: colors.mossDeep,
                ),
              ),
            ),
            const SizedBox(width: 12),
            // Title + optional detail
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: colors.ink,
                    ),
                  ),
                  if (detail != null && detail!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      detail!,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Forward icon
            Icon(
              Icons.chevron_right,
              size: 14,
              color: colors.inkDim,
            ),
          ],
        ),
      ),
    );
  }
}
