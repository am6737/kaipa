import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../auth/data/auth_repository.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _presets = [
    {'id': 'meadow', 'label': '草地绿', 'hex': '#22C55E'},
    {'id': 'moss', 'label': '苔藓', 'hex': '#4A7C59'},
    {'id': 'citrus', 'label': '柑橘', 'hex': '#FF7A1A'},
    {'id': 'ember', 'label': '砖红', 'hex': '#A84228'},
    {'id': 'peach', 'label': '桃粉', 'hex': '#FF8FB1'},
    {'id': 'lake', 'label': '湖蓝', 'hex': '#2C5D7E'},
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final themePrefs = ref.watch(themePrefsProvider);
    final notifier = ref.read(themePrefsProvider.notifier);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        leading: IconButton(icon: Icon(Icons.arrow_back_ios, color: colors.ink), onPressed: () => context.pop()),
        title: Text('设置', style: TextStyle(color: colors.ink, fontWeight: FontWeight.w700)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Theme section
            _sectionTitle('外观', colors),
            const SizedBox(height: 12),
            // Light / Dark toggle
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Row(
                children: [
                  _modeBtn('light', '浅色', Icons.wb_sunny_outlined, themePrefs.mode, colors, notifier),
                  _modeBtn('dark', '深色', Icons.dark_mode_outlined, themePrefs.mode, colors, notifier),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('主题色', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
            const SizedBox(height: 12),
            // Color presets
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: _presets.map((p) {
                final selected = !themePrefs.useCustom && themePrefs.preset == p['id'];
                final color = hexToColor(p['hex']!);
                return GestureDetector(
                  onTap: () => notifier.setPreset(p['id']!),
                  child: Column(
                    children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: color,
                          border: selected ? Border.all(color: colors.ink, width: 2.5) : null,
                          boxShadow: selected ? [BoxShadow(color: color.withAlpha(80), blurRadius: 8, spreadRadius: 2)] : null,
                        ),
                        child: selected ? const Icon(Icons.check, color: Colors.white, size: 18) : null,
                      ),
                      const SizedBox(height: 6),
                      Text(p['label']!, style: TextStyle(fontSize: 10, color: selected ? colors.ink : colors.inkMuted)),
                    ],
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 28),

            // Account section
            _sectionTitle('账户', colors),
            const SizedBox(height: 8),
            _settingsTile('用户名', 'hiker_demo', colors),
            _settingsTile('邮箱', 'demo@kaipa.app', colors),
            _settingsTile('修改密码', '', colors),
            const SizedBox(height: 20),

            // General section
            _sectionTitle('通用', colors),
            const SizedBox(height: 8),
            _switchTile('通知', true, colors, (v) {}),
            _switchTile('离线地图', false, colors, (v) {}),
            _settingsTile('计量单位', '公制', colors),
            const SizedBox(height: 20),

            // About section
            _sectionTitle('关于', colors),
            const SizedBox(height: 8),
            _settingsTile('版本', 'v1.0.0', colors),
            _settingsTile('隐私政策', '', colors),
            _settingsTile('使用条款', '', colors),
            const SizedBox(height: 32),

            // Logout
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () {
                  ref.read(authRepositoryProvider).signOut();
                  context.go('/login');
                },
                child: Text('退出登录', style: TextStyle(color: colors.diff.extreme, fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.inkMuted, letterSpacing: 0.5)),
    );
  }

  Widget _modeBtn(String mode, String label, IconData icon, String current, KaipaColors colors, ThemePrefsNotifier notifier) {
    final selected = current == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () => notifier.setMode(mode),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? colors.flare : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: selected ? Colors.white : colors.inkMuted),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Colors.white : colors.inkMuted)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _settingsTile(String label, String value, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: colors.line, width: 0.5))),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 15, color: colors.ink)),
          const Spacer(),
          if (value.isNotEmpty) Text(value, style: TextStyle(fontSize: 14, color: colors.inkMuted)),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right, size: 18, color: colors.inkDim),
        ],
      ),
    );
  }

  Widget _switchTile(String label, bool value, KaipaColors colors, ValueChanged<bool> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: colors.line, width: 0.5))),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 15, color: colors.ink)),
          const Spacer(),
          Switch.adaptive(value: value, onChanged: onChanged, activeTrackColor: colors.flare),
        ],
      ),
    );
  }
}
