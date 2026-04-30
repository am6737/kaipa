import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../../../core/widgets/kaipa_icons.dart';

const List<String> kPresetGearIcons = [
  KaipaIcons.backpack,
  KaipaIcons.boot,
  KaipaIcons.jacket,
  KaipaIcons.tent,
  KaipaIcons.bottle,
  KaipaIcons.battery,
  KaipaIcons.light,
  KaipaIcons.knife,
  KaipaIcons.socks,
  KaipaIcons.shield,
  KaipaIcons.compass,
  KaipaIcons.map,
  KaipaIcons.flag,
  KaipaIcons.flame,
  KaipaIcons.drop,
  KaipaIcons.camera,
  KaipaIcons.firstAid,
  KaipaIcons.rope,
  KaipaIcons.gloves,
  KaipaIcons.hat,
  KaipaIcons.glasses,
  KaipaIcons.food,
  KaipaIcons.sleeping,
  KaipaIcons.pants,
  KaipaIcons.watch,
  KaipaIcons.radio,
  KaipaIcons.sun,
  KaipaIcons.moon,
  KaipaIcons.tree,
  KaipaIcons.mountain,
];

class IconPickerResult {
  final String icon;
  final String iconType;

  const IconPickerResult({required this.icon, required this.iconType});
}

class IconPicker extends StatefulWidget {
  final String? initialIcon;
  final String initialIconType;
  final ValueChanged<IconPickerResult> onChanged;

  const IconPicker({
    super.key,
    this.initialIcon,
    this.initialIconType = 'svg',
    required this.onChanged,
  });

  @override
  State<IconPicker> createState() => _IconPickerState();
}

class _IconPickerState extends State<IconPicker> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _selectedSvg;
  String _emojiText = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialIconType == 'emoji' ? 1 : 0,
    );
    if (widget.initialIconType == 'svg') {
      _selectedSvg = widget.initialIcon;
    } else {
      _emojiText = widget.initialIcon ?? '';
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        TabBar(
          controller: _tabController,
          labelColor: colors.flare,
          unselectedLabelColor: colors.inkMuted,
          indicatorColor: colors.flare,
          indicatorSize: TabBarIndicatorSize.label,
          labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          tabs: const [
            Tab(text: '预设图标'),
            Tab(text: 'Emoji'),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildSvgGrid(colors),
              _buildEmojiInput(colors),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSvgGrid(KaipaColors colors) {
    return GridView.builder(
      padding: EdgeInsets.zero,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 6,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: kPresetGearIcons.length,
      itemBuilder: (context, index) {
        final iconName = kPresetGearIcons[index];
        final isSelected = _selectedSvg == iconName;
        return GestureDetector(
          onTap: () {
            setState(() => _selectedSvg = iconName);
            widget.onChanged(IconPickerResult(icon: iconName, iconType: 'svg'));
          },
          child: Container(
            decoration: BoxDecoration(
              color: isSelected ? colors.flareSoft : colors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isSelected ? colors.flare : colors.line,
                width: isSelected ? 1.5 : 0.5,
              ),
            ),
            child: Center(
              child: KaipaIcon(
                name: iconName,
                size: 22,
                color: isSelected ? colors.flare : colors.inkMuted,
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildEmojiInput(KaipaColors colors) {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Center(
            child: Text(
              _emojiText.isEmpty ? '?' : _emojiText,
              style: TextStyle(
                fontSize: 32,
                color: _emojiText.isEmpty ? colors.inkDim : null,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: 200,
          child: TextField(
            maxLength: 8,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24),
            decoration: InputDecoration(
              hintText: '输入或粘贴 emoji',
              hintStyle: TextStyle(fontSize: 14, color: colors.inkMuted),
              counterText: '',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            onChanged: (value) {
              setState(() => _emojiText = value);
              if (value.isNotEmpty) {
                widget.onChanged(IconPickerResult(icon: value, iconType: 'emoji'));
              }
            },
          ),
        ),
      ],
    );
  }
}
