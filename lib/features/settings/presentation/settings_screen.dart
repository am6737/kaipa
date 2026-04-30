import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/data/auth_repository.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/glass_container.dart';
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
      body: SafeArea(
        child: Column(
          children: [
            // ── Header ──────────────────────────────────────────
            _Header(colors: colors),
            // ── Scrollable content ──────────────────────────────
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 16),

                    // ── Appearance mode selector ────────────────
                    _AppearanceModeSelector(
                      currentMode: themePrefs.mode,
                      colors: colors,
                      onModeChanged: notifier.setMode,
                    ),
                    const SizedBox(height: 24),

                    // ── Theme color picker ──────────────────────
                    _SectionLabel(label: '主题色', colors: colors),
                    const SizedBox(height: 12),
                    _ThemeColorPicker(
                      presets: _presets,
                      selectedPreset: themePrefs.useCustom ? '' : themePrefs.preset,
                      colors: colors,
                      onPresetSelected: notifier.setPreset,
                    ),
                    const SizedBox(height: 8),
                    _ColorPreviewStrip(colors: colors),
                    const SizedBox(height: 28),

                    // ── General settings ────────────────────────
                    _SectionLabel(label: '通用', colors: colors),
                    const SizedBox(height: 8),
                    _SettingsGroup(
                      colors: colors,
                      children: [
                        _SettingRow(
                          icon: KaipaIcons.globe,
                          title: '语言',
                          detail: '中文',
                          colors: colors,
                          onTap: () {},
                        ),
                        _SettingRow(
                          icon: KaipaIcons.ruler,
                          title: '单位',
                          detail: '公制',
                          colors: colors,
                          onTap: () {},
                        ),
                        _SettingRow(
                          icon: KaipaIcons.download,
                          title: '离线地图',
                          colors: colors,
                          trailing: _SettingToggle(
                            value: false,
                            colors: colors,
                            onChanged: (_) {},
                          ),
                        ),
                        _SettingRow(
                          icon: KaipaIcons.bell,
                          title: '通知',
                          colors: colors,
                          trailing: _SettingToggle(
                            value: true,
                            colors: colors,
                            onChanged: (_) {},
                          ),
                        ),
                        _SettingRow(
                          icon: KaipaIcons.shield,
                          title: '隐私',
                          colors: colors,
                          onTap: () {},
                        ),
                        _SettingRow(
                          icon: KaipaIcons.cloud,
                          title: '数据同步',
                          colors: colors,
                          onTap: () {},
                          showBorder: false,
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),

                    // ── About section ───────────────────────────
                    _SectionLabel(label: '关于', colors: colors),
                    const SizedBox(height: 8),
                    _SettingsGroup(
                      colors: colors,
                      children: [
                        _SettingRow(
                          icon: KaipaIcons.chat,
                          title: '反馈',
                          colors: colors,
                          onTap: () {},
                        ),
                        _SettingRow(
                          icon: KaipaIcons.star,
                          title: '给我们评分',
                          colors: colors,
                          onTap: () {},
                        ),
                        _SettingRow(
                          icon: KaipaIcons.lock,
                          title: '法律信息',
                          colors: colors,
                          onTap: () {},
                          showBorder: false,
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),

                    // ── Logout button ──────────────────────────
                    SizedBox(
                      width: double.infinity,
                      child: GestureDetector(
                        onTap: () async {
                          await ref.read(authRepositoryProvider).signOut();
                          if (context.mounted) context.go('/login');
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: colors.surface,
                            borderRadius: BorderRadius.circular(KaipaRadius.lg),
                            border: Border.all(color: colors.line, width: 0.5),
                          ),
                          child: Center(
                            child: Text(
                              '退出登录',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: Colors.red.shade400,
                                letterSpacing: -0.2,
                              ),
                            ),
                          ),
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Back button left-aligned
          Align(
            alignment: Alignment.centerLeft,
            child: CircleButton(
              icon: KaipaIcons.back,
              size: 40,
              iconSize: 16,
              onTap: () => context.pop(),
            ),
          ),
          // Centered title
          Text(
            '设置',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.3,
            ),
          ),
        ],
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
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: colors.inkMuted,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

// ─── Appearance mode selector (3-option grid) ───────────────────────────
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
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          _ModeCard(
            icon: KaipaIcons.sun,
            label: '浅色',
            modeKey: 'light',
            isSelected: currentMode == 'light',
            colors: colors,
            onTap: () => onModeChanged('light'),
          ),
          const SizedBox(width: 6),
          _ModeCard(
            icon: KaipaIcons.moon,
            label: '深色',
            modeKey: 'dark',
            isSelected: currentMode == 'dark',
            colors: colors,
            onTap: () => onModeChanged('dark'),
          ),
          const SizedBox(width: 6),
          _ModeCard(
            icon: KaipaIcons.weather,
            label: '自动',
            modeKey: 'system',
            isSelected: currentMode == 'system',
            colors: colors,
            onTap: () => onModeChanged('system'),
          ),
        ],
      ),
    );
  }
}

class _ModeCard extends StatelessWidget {
  final String icon;
  final String label;
  final String modeKey;
  final bool isSelected;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _ModeCard({
    required this.icon,
    required this.label,
    required this.modeKey,
    required this.isSelected,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: isSelected ? colors.flareSoft : Colors.transparent,
            borderRadius: BorderRadius.circular(KaipaRadius.md),
            border: isSelected
                ? Border.all(color: colors.flare, width: 1.5)
                : Border.all(color: Colors.transparent, width: 1.5),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              KaipaIcon(
                name: icon,
                size: 22,
                color: isSelected ? colors.flare : colors.inkMuted,
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? colors.ink : colors.inkMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Theme color picker ─────────────────────────────────────────────────
class _ThemeColorPicker extends StatelessWidget {
  final List<Map<String, String>> presets;
  final String selectedPreset;
  final KaipaColors colors;
  final void Function(String) onPresetSelected;

  const _ThemeColorPicker({
    required this.presets,
    required this.selectedPreset,
    required this.colors,
    required this.onPresetSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: presets.map((p) {
        final id = p['id']!;
        final hex = p['hex']!;
        final isActive = selectedPreset == id;
        final color = hexToColor(hex);

        return GestureDetector(
          onTap: () => onPresetSelected(id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              border: isActive
                  ? Border.all(color: color, width: 2.5)
                  : null,
              boxShadow: isActive
                  ? [
                      BoxShadow(
                        color: colorWithOpacity(color, 0.50),
                        blurRadius: 12,
                        spreadRadius: 3,
                      ),
                    ]
                  : null,
            ),
            child: isActive
                ? const Center(
                    child: Icon(
                      Icons.check_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  )
                : null,
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.md),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          // Small button preview
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: colors.flare,
              borderRadius: BorderRadius.circular(KaipaRadius.sm),
            ),
            child: const Text(
              '按钮',
              style: TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Soft background chip preview
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: colors.flareSoft,
              borderRadius: BorderRadius.circular(KaipaRadius.sm),
            ),
            child: Text(
              '标签',
              style: TextStyle(
                color: colors.flare,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Progress bar preview
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '进度',
                  style: TextStyle(
                    fontSize: 10,
                    color: colors.inkMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: SizedBox(
                    height: 6,
                    child: Stack(
                      children: [
                        Container(color: colors.flareSoft),
                        FractionallySizedBox(
                          widthFactor: 0.65,
                          child: Container(
                            decoration: BoxDecoration(
                              color: colors.flare,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Circle accent preview
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.flareSoft,
              border: Border.all(color: colors.flare, width: 1.5),
            ),
            child: Center(
              child: KaipaIcon(
                name: KaipaIcons.heart,
                size: 13,
                color: colors.flare,
              ),
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
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(children: children),
    );
  }
}

// ─── Setting row ────────────────────────────────────────────────────────
class _SettingRow extends StatelessWidget {
  final String icon;
  final String title;
  final String? detail;
  final KaipaColors colors;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool showBorder;

  const _SettingRow({
    required this.icon,
    required this.title,
    required this.colors,
    this.detail,
    this.onTap,
    this.trailing,
    this.showBorder = true,
  });

  @override
  Widget build(BuildContext context) {
    final hasChevron = trailing == null;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: showBorder
              ? Border(
                  bottom: BorderSide(color: colors.lineSoft, width: 0.5),
                )
              : null,
        ),
        child: Row(
          children: [
            // Icon
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                borderRadius: BorderRadius.circular(KaipaRadius.sm),
              ),
              child: Center(
                child: KaipaIcon(
                  name: icon,
                  size: 16,
                  color: colors.flare,
                ),
              ),
            ),
            const SizedBox(width: 12),
            // Title
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: colors.ink,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            // Detail or trailing widget
            if (trailing != null) trailing!,
            if (detail != null && detail!.isNotEmpty) ...[
              Text(
                detail!,
                style: TextStyle(
                  fontSize: 14,
                  color: colors.inkMuted,
                ),
              ),
              const SizedBox(width: 4),
            ],
            if (hasChevron)
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
}

// ─── Setting toggle switch ──────────────────────────────────────────────
class _SettingToggle extends StatelessWidget {
  final bool value;
  final KaipaColors colors;
  final ValueChanged<bool> onChanged;

  const _SettingToggle({
    required this.value,
    required this.colors,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 28,
      child: Switch.adaptive(
        value: value,
        onChanged: onChanged,
        activeTrackColor: colors.flare,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}
