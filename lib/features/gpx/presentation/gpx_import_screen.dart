import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

class GpxImportScreen extends ConsumerStatefulWidget {
  const GpxImportScreen({super.key});

  @override
  ConsumerState<GpxImportScreen> createState() => _GpxImportScreenState();
}

class _GpxImportScreenState extends ConsumerState<GpxImportScreen> {
  int _step = 0;
  String _routeName = '';
  String _difficulty = 'moderate';
  String _description = '';

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: Text('导入路线', style: TextStyle(color: colors.ink)),
        leading: IconButton(
          icon: Icon(Icons.close, color: colors.ink),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          // Step indicator
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(3, (i) => Container(
                width: i == _step ? 24 : 8,
                height: 8,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(4),
                  color: i == _step ? colors.flare : colors.line,
                ),
              )),
            ),
          ),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: _step == 0
                  ? _buildSourceStep(tokens, colors)
                  : _step == 1
                      ? _buildPreviewStep(tokens, colors)
                      : _buildSaveStep(tokens, colors),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSourceStep(KaipaTokens tokens, KaipaColors colors) {
    final sources = [
      {'icon': Icons.folder_open, 'label': '从文件选择', 'sub': 'GPX, KML, TCX', 'enabled': true},
      {'icon': Icons.share, 'label': 'Strava', 'sub': '同步你的活动', 'enabled': false},
      {'icon': Icons.watch, 'label': 'Apple Watch', 'sub': '导入健身记录', 'enabled': false},
      {'icon': Icons.explore, 'label': 'Garmin', 'sub': '同步设备数据', 'enabled': false},
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('选择来源', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: colors.ink)),
          const SizedBox(height: 6),
          Text('从以下来源导入你的徒步路线', style: TextStyle(fontSize: 14, color: colors.inkMuted)),
          const SizedBox(height: 24),
          ...sources.map((s) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GestureDetector(
              onTap: () {
                if (s['enabled'] as bool) {
                  setState(() {
                    _routeName = '导入的路线';
                    _step = 1;
                  });
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('${s['label']} 即将支持'), duration: const Duration(seconds: 1)),
                  );
                }
              },
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: colors.line, width: 0.5),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44, height: 44,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        color: (s['enabled'] as bool) ? colors.flareSoft : colors.line,
                      ),
                      child: Icon(s['icon'] as IconData, color: (s['enabled'] as bool) ? colors.flare : colors.inkDim, size: 22),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s['label'] as String, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)),
                          Text(s['sub'] as String, style: TextStyle(fontSize: 12, color: colors.inkMuted)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, color: colors.inkDim, size: 20),
                  ],
                ),
              ),
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildPreviewStep(KaipaTokens tokens, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('路线预览', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: colors.ink)),
          const SizedBox(height: 6),
          Text('确认解析的路线信息', style: TextStyle(fontSize: 14, color: colors.inkMuted)),
          const SizedBox(height: 20),
          // Map preview
          Container(
            height: 200,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            clipBehavior: Clip.hardEdge,
            child: FlutterMap(
              options: const MapOptions(
                initialCenter: LatLng(40.476, 116.561),
                initialZoom: 12,
              ),
              children: [
                TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Stats
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _previewStat('距离', '8.5 km', colors),
                _previewStat('爬升', '520 m', colors),
                _previewStat('时长', '~3:30', colors),
              ],
            ),
          ),
          const Spacer(),
          Row(
            children: [
              TextButton(
                onPressed: () => setState(() => _step = 0),
                child: Text('上一步', style: TextStyle(color: colors.inkMuted)),
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: () => setState(() => _step = 2),
                child: const Text('看起来不错'),
              ),
            ],
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildSaveStep(KaipaTokens tokens, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('保存路线', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: colors.ink)),
            const SizedBox(height: 6),
            Text('为路线命名并设置难度', style: TextStyle(fontSize: 14, color: colors.inkMuted)),
            const SizedBox(height: 24),
            Text('路线名称', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
            const SizedBox(height: 8),
            TextField(
              onChanged: (v) => _routeName = v,
              decoration: InputDecoration(
                hintText: '输入路线名称',
                filled: true,
                fillColor: colors.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line)),
              ),
            ),
            const SizedBox(height: 20),
            Text('难度', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [
                _diffOption('easy', '入门', colors),
                _diffOption('moderate', '中等', colors),
                _diffOption('hard', '困难', colors),
                _diffOption('expert', '专家', colors),
              ],
            ),
            const SizedBox(height: 20),
            Text('描述', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
            const SizedBox(height: 8),
            TextField(
              onChanged: (v) => _description = v,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: '添加路线描述...',
                filled: true,
                fillColor: colors.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line)),
              ),
            ),
            const SizedBox(height: 32),
            Row(
              children: [
                TextButton(
                  onPressed: () => setState(() => _step = 1),
                  child: Text('上一步', style: TextStyle(color: colors.inkMuted)),
                ),
                const Spacer(),
                ElevatedButton(
                  onPressed: () {
                    // TODO: save _routeName, _difficulty, _description to backend
                    debugPrint('Saving: $_routeName, $_difficulty, $_description');
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('路线已保存')),
                    );
                    context.pop();
                  },
                  child: const Text('保存路线'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _diffOption(String value, String label, KaipaColors colors) {
    final selected = _difficulty == value;
    return GestureDetector(
      onTap: () => setState(() => _difficulty = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: selected ? colors.flareSoft : colors.surface,
          border: Border.all(color: selected ? colors.flare : colors.line, width: selected ? 1.5 : 0.5),
        ),
        child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? colors.flare : colors.ink)),
      ),
    );
  }

  Widget _previewStat(String label, String value, KaipaColors colors) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: colors.ink)),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 11, color: colors.inkMuted)),
      ],
    );
  }
}
