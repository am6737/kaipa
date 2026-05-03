import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';

// =============================================================================
// GPX Import Screen — 3-step wizard
// =============================================================================

class GpxImportScreen extends ConsumerStatefulWidget {
  const GpxImportScreen({super.key});

  @override
  ConsumerState<GpxImportScreen> createState() => _GpxImportScreenState();
}

class _GpxImportScreenState extends ConsumerState<GpxImportScreen> {
  int _step = 0;
  String _routeName = '箭扣长城 · 北京结—正北楼';
  String _selectedType = '徒步';
  String _visibility = 'friends';
  String _notes = '从西栅子村起步，经北京结向北至正北楼。沿途碎石较多，需注意防滑。建议携带手套和登山杖。';

  final _nameController = TextEditingController();
  final _notesController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _nameController.text = _routeName;
    _notesController.text = _notes;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _goToStep(int step) {
    setState(() => _step = step.clamp(0, 2));
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          Column(
            children: [
              // Sticky header
              _buildHeader(context, colors),
              // Step content
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  switchInCurve: Curves.easeOut,
                  switchOutCurve: Curves.easeIn,
                  child: _step == 0
                      ? _buildStep1(colors)
                      : _step == 1
                          ? _buildStep2(colors)
                          : _buildStep3(colors),
                ),
              ),
            ],
          ),
          // Footer
          _buildFooter(context, colors),
        ],
      ),
    );
  }

  // ─── Header ────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, KaipaColors colors) {
    final topPadding = MediaQuery.of(context).padding.top;
    const stepLabels = ['上传文件', '预览校验', '命名保存'];

    return Container(
      padding: EdgeInsets.only(top: topPadding + 8, bottom: 16),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(bottom: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: Column(
        children: [
          // Title row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                // Back button
                GestureDetector(
                  onTap: () => context.pop(),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: colors.surfaceHi,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: KaipaIcon(
                        name: KaipaIcons.chevronLeft,
                        size: 16,
                        color: colors.ink,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '导入 GPX 路线',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: colors.ink,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '从手表、佳明 Connect、两步路、Strava 等',
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
          ),
          const SizedBox(height: 16),
          // Step indicator
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: List.generate(5, (i) {
                // Indices 0, 2, 4 = steps; 1, 3 = connecting lines
                if (i.isOdd) {
                  final lineIndex = i ~/ 2; // 0 or 1
                  final done = lineIndex < _step;
                  return Expanded(
                    child: Container(
                      height: 2,
                      color: done ? colors.flare : colors.line,
                    ),
                  );
                }
                final stepIndex = i ~/ 2;
                final isDone = stepIndex < _step;
                final isCurrent = stepIndex == _step;
                return _buildStepCircle(colors, stepIndex, isDone, isCurrent);
              }),
            ),
          ),
          const SizedBox(height: 8),
          // Step labels
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(3, (i) {
                final isDone = i < _step;
                final isCurrent = i == _step;
                return Expanded(
                  child: Text(
                    stepLabels[i],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w400,
                      color: isDone
                          ? colors.flare
                          : isCurrent
                              ? colors.ink
                              : colors.inkMuted,
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepCircle(
    KaipaColors colors,
    int step,
    bool isDone,
    bool isCurrent,
  ) {
    if (isDone) {
      return Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: colors.flare,
          shape: BoxShape.circle,
        ),
        child: const Center(
          child: Icon(Icons.check, size: 13, color: Colors.white),
        ),
      );
    }
    if (isCurrent) {
      return Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: colors.flareSoft,
          shape: BoxShape.circle,
          border: Border.all(color: colors.flare, width: 1.5),
        ),
        child: Center(
          child: Text(
            '${step + 1}',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: colors.flare,
            ),
          ),
        ),
      );
    }
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: colors.surfaceHi,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          '${step + 1}',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: colors.inkDim,
          ),
        ),
      ),
    );
  }

  // ─── Footer ────────────────────────────────────────────────────────

  Widget _buildFooter(BuildContext context, KaipaColors colors) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final ctaLabels = ['选择文件 →', '继续 →', '保存路线'];

    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        padding: EdgeInsets.fromLTRB(16, 20, 16, bottomPadding + 16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              colors.bg.withAlpha(0),
              colors.bg,
            ],
            stops: const [0.0, 0.3],
          ),
        ),
        child: Row(
          children: [
            // Back button (step > 0)
            if (_step > 0) ...[
              Expanded(
                flex: 1,
                child: GestureDetector(
                  onTap: () => _goToStep(_step - 1),
                  child: Container(
                    height: 50,
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: colors.line, width: 0.5),
                    ),
                    child: Center(
                      child: Text(
                        '上一步',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: colors.ink,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
            ],
            // CTA button
            Expanded(
              flex: _step > 0 ? 2 : 1,
              child: GestureDetector(
                onTap: () {
                  if (_step < 2) {
                    _goToStep(_step + 1);
                  } else {
                    // Save action
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('路线已保存')),
                    );
                    context.pop();
                  }
                },
                child: Container(
                  height: 50,
                  decoration: BoxDecoration(
                    color: colors.flare,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: colors.flare.withAlpha(60),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      ctaLabels[_step],
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Step 1: Upload ────────────────────────────────────────────────

  Widget _buildStep1(KaipaColors colors) {
    return SingleChildScrollView(
      key: const ValueKey('step1'),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag-drop zone
          _buildDropZone(colors),
          const SizedBox(height: 24),
          // Section label
          Text(
            '或从这些来源导入',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: colors.inkMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 12),
          // Source buttons
          _buildSourceButton(
            colors,
            icon: KaipaIcons.cloud,
            name: '佳明 Connect',
            hint: '已连接 · 23 条新轨迹',
          ),
          const SizedBox(height: 8),
          _buildSourceButton(
            colors,
            icon: KaipaIcons.phone,
            name: '从本机文件',
            hint: 'iCloud · 文件夹',
          ),
          const SizedBox(height: 8),
          _buildSourceButton(
            colors,
            icon: KaipaIcons.download,
            name: '两步路 / 户外助手',
            hint: '粘贴分享链接',
          ),
          const SizedBox(height: 8),
          _buildSourceButton(
            colors,
            icon: KaipaIcons.globe,
            name: 'Strava',
            hint: '未连接',
          ),
        ],
      ),
    );
  }

  Widget _buildDropZone(KaipaColors colors) {
    return CustomPaint(
      painter: _DashedBorderPainter(
        color: colors.flare,
        strokeWidth: 1.5,
        borderRadius: 20,
        dashLength: 8,
        gapLength: 5,
      ),
      child: Container(
        width: double.infinity,
        height: 180,
        decoration: BoxDecoration(
          color: colors.flareSoft,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Upload icon circle
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withAlpha(20),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Center(
                child: KaipaIcon(
                  name: KaipaIcons.upload,
                  size: 22,
                  color: colors.flare,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '拖入或选择 .gpx 文件',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '支持 .gpx · .tcx · .fit · .kml',
              style: TextStyle(
                fontSize: 11,
                color: colors.inkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSourceButton(
    KaipaColors colors, {
    required String icon,
    required String name,
    required String hint,
  }) {
    return GestureDetector(
      onTap: () => _goToStep(1),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          children: [
            // Icon circle
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: colors.surfaceHi,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: KaipaIcon(
                  name: icon,
                  size: 18,
                  color: colors.ink,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: colors.ink,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    hint,
                    style: TextStyle(
                      fontSize: 11,
                      color: colors.inkMuted,
                    ),
                  ),
                ],
              ),
            ),
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

  // ─── Step 2: Preview ───────────────────────────────────────────────

  Widget _buildStep2(KaipaColors colors) {
    return SingleChildScrollView(
      key: const ValueKey('step2'),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // File info bar
          _buildFileInfoBar(colors),
          const SizedBox(height: 14),
          // Map preview
          _buildMapPreview(colors),
          const SizedBox(height: 14),
          // Stats grid
          _buildStatsGrid(colors),
          const SizedBox(height: 14),
          // Elevation profile
          _buildElevationProfile(colors),
          const SizedBox(height: 14),
          // Validation checklist
          _buildValidationChecklist(colors),
        ],
      ),
    );
  }

  Widget _buildFileInfoBar(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          // GPX icon
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colors.flareSoft,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                'GPX',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: colors.flare,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // File info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'jiankou-2024-03-15.gpx',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '247 KB · 2,341 个轨迹点',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          // Recognized badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFFE8F4EA),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '已识别',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: colors.moss,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapPreview(KaipaColors colors) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        width: double.infinity,
        height: 180,
        child: Stack(
          children: [
            // Terrain background with contour + track
            CustomPaint(
              size: const Size(double.infinity, 180),
              painter: _MapPreviewPainter(
                terrainColor: colors.terrain.base,
                contourColor: colors.terrain.contour,
                trackColor: colors.flare,
                mossColor: colors.moss,
              ),
            ),
            // Coordinate badge
            Positioned(
              top: 10,
              right: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'GCJ-02 · 已纠偏',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF333333),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsGrid(KaipaColors colors) {
    final stats = [
      _StatData('距离', '11.4', 'km'),
      _StatData('爬升', '+820', 'm'),
      _StatData('时长', '4:32', ''),
      _StatData('速度', '2.5', 'km/h'),
    ];

    return Row(
      children: stats.map((s) {
        return Expanded(
          child: Container(
            margin: EdgeInsets.only(
              right: s == stats.last ? 0 : 6,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      s.value,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: colors.ink,
                      ),
                    ),
                    if (s.unit.isNotEmpty)
                      Text(
                        s.unit,
                        style: TextStyle(
                          fontSize: 9,
                          color: colors.inkMuted,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  s.label,
                  style: TextStyle(
                    fontSize: 10,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildElevationProfile(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '海拔剖面',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.ink,
                ),
              ),
              Text(
                '120 → 770m',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.inkMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Chart
          SizedBox(
            width: double.infinity,
            height: 80,
            child: CustomPaint(
              size: const Size(double.infinity, 80),
              painter: _ElevationChartPainter(
                lineColor: colors.flare,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildValidationChecklist(KaipaColors colors) {
    final items = [
      _ValidationItem(
        ok: true,
        title: '坐标系自动转换',
        subtitle: 'WGS-84 → GCJ-02',
      ),
      _ValidationItem(
        ok: true,
        title: '去除 GPS 漂移点',
        subtitle: '剔除 23 个异常点',
      ),
      _ValidationItem(
        ok: true,
        title: '路线自动闭合检测',
        subtitle: '识别为单程往返',
      ),
      _ValidationItem(
        ok: false,
        title: '尾段信号丢失',
        subtitle: '最后 0.4km 用直线连接，可手动调整',
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: items.asMap().entries.map((entry) {
          final i = entry.key;
          final item = entry.value;
          return Column(
            children: [
              if (i > 0)
                Divider(height: 0.5, thickness: 0.5, color: colors.line),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    // Status circle
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: item.ok
                            ? const Color(0xFFE8F4EA)
                            : const Color(0xFFFEF1E2),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Icon(
                          item.ok ? Icons.check : Icons.error_outline,
                          size: 13,
                          color: item.ok
                              ? colors.moss
                              : const Color(0xFFE67E22),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: colors.ink,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            item.subtitle,
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
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  // ─── Step 3: Save ──────────────────────────────────────────────────

  Widget _buildStep3(KaipaColors colors) {
    return SingleChildScrollView(
      key: const ValueKey('step3'),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Route name
          _buildFieldLabel(colors, '路线名称'),
          TextField(
            controller: _nameController,
            onChanged: (v) => _routeName = v,
            style: TextStyle(
              fontSize: 14,
              color: colors.ink,
            ),
            decoration: InputDecoration(
              filled: true,
              fillColor: colors.surface,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line, width: 0.5),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line, width: 0.5),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Region
          _buildFieldLabel(colors, '所在区域'),
          GestureDetector(
            onTap: () {},
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Row(
                children: [
                  KaipaIcon(
                    name: KaipaIcons.navigate,
                    size: 16,
                    color: colors.ink,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '北京 · 怀柔区',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.ink,
                      ),
                    ),
                  ),
                  KaipaIcon(
                    name: KaipaIcons.chevronRight,
                    size: 16,
                    color: colors.inkDim,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Type
          _buildFieldLabel(colors, '活动类型'),
          _buildTypePills(colors),
          const SizedBox(height: 20),

          // Difficulty
          _buildFieldLabel(colors, '难度评估'),
          _buildDifficultyCard(colors),
          const SizedBox(height: 20),

          // Visibility
          _buildFieldLabel(colors, '可见范围'),
          _buildVisibilityOptions(colors),
          const SizedBox(height: 20),

          // Notes
          _buildFieldLabel(colors, '备注'),
          TextField(
            controller: _notesController,
            onChanged: (v) => _notes = v,
            maxLines: 4,
            style: TextStyle(
              fontSize: 14,
              color: colors.ink,
              height: 1.5,
            ),
            decoration: InputDecoration(
              filled: true,
              fillColor: colors.surface,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line, width: 0.5),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line, width: 0.5),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFieldLabel(KaipaColors colors, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: colors.inkMuted,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildTypePills(KaipaColors colors) {
    const types = ['徒步', '登山', '越野跑', '骑行', '溯溪'];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: types.map((type) {
        final selected = _selectedType == type;
        return GestureDetector(
          onTap: () => setState(() => _selectedType = type),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: selected ? colors.flare : colors.surface,
              borderRadius: BorderRadius.circular(999),
              border: selected
                  ? null
                  : Border.all(color: colors.line, width: 0.5),
            ),
            child: Text(
              type,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : colors.ink,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildDifficultyCard(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // T3 badge
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: colors.diff.mod,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'T3 · 中等',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '根据路线数据自动评估',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // T4-T0 progress bar
          Row(
            children: List.generate(5, (i) {
              const labels = ['T4', 'T3', 'T2', 'T1', 'T0'];
              final filled = i < 2;
              return Expanded(
                child: Column(
                  children: [
                    Container(
                      height: 6,
                      margin: EdgeInsets.only(right: i < 4 ? 3 : 0),
                      decoration: BoxDecoration(
                        color: filled ? colors.flare : colors.line,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      labels[i],
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: filled ? colors.flare : colors.inkDim,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildVisibilityOptions(KaipaColors colors) {
    final options = [
      _VisibilityOption(
        key: 'private',
        icon: KaipaIcons.lock,
        name: '仅自己',
        description: '只有你能看到这条路线',
      ),
      _VisibilityOption(
        key: 'friends',
        icon: KaipaIcons.users,
        name: '好友可见',
        description: '你的好友可以查看和下载',
      ),
      _VisibilityOption(
        key: 'public',
        icon: KaipaIcons.globe,
        name: '公开',
        description: '所有人可以发现这条路线',
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: options.asMap().entries.map((entry) {
          final i = entry.key;
          final opt = entry.value;
          final selected = _visibility == opt.key;

          return Column(
            children: [
              if (i > 0)
                Divider(height: 0.5, thickness: 0.5, color: colors.line),
              GestureDetector(
                onTap: () => setState(() => _visibility = opt.key),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: selected ? colors.flareSoft : null,
                    borderRadius: i == 0
                        ? const BorderRadius.vertical(
                            top: Radius.circular(14),
                          )
                        : i == options.length - 1
                            ? const BorderRadius.vertical(
                                bottom: Radius.circular(14),
                              )
                            : null,
                  ),
                  child: Row(
                    children: [
                      // Icon
                      KaipaIcon(
                        name: opt.icon,
                        size: 18,
                        color: selected ? colors.flare : colors.inkDim,
                      ),
                      const SizedBox(width: 12),
                      // Text
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              opt.name,
                              style: TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600,
                                color: colors.ink,
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              opt.description,
                              style: TextStyle(
                                fontSize: 10.5,
                                color: colors.inkMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Radio circle
                      Container(
                        width: 18,
                        height: 18,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: selected ? colors.flare : null,
                          border: selected
                              ? null
                              : Border.all(
                                  color: colors.line,
                                  width: 1.5,
                                ),
                        ),
                        child: selected
                            ? const Center(
                                child: Icon(
                                  Icons.check,
                                  size: 11,
                                  color: Colors.white,
                                ),
                              )
                            : null,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

// =============================================================================
// Data models
// =============================================================================

class _StatData {
  final String label;
  final String value;
  final String unit;
  const _StatData(this.label, this.value, this.unit);
}

class _ValidationItem {
  final bool ok;
  final String title;
  final String subtitle;
  const _ValidationItem({
    required this.ok,
    required this.title,
    required this.subtitle,
  });
}

class _VisibilityOption {
  final String key;
  final String icon;
  final String name;
  final String description;
  const _VisibilityOption({
    required this.key,
    required this.icon,
    required this.name,
    required this.description,
  });
}

// =============================================================================
// Custom painters
// =============================================================================

/// Dashed border painter for the drop zone
class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double strokeWidth;
  final double borderRadius;
  final double dashLength;
  final double gapLength;

  _DashedBorderPainter({
    required this.color,
    required this.strokeWidth,
    required this.borderRadius,
    required this.dashLength,
    required this.gapLength,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Radius.circular(borderRadius),
    );

    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics();

    for (final metric in metrics) {
      double distance = 0;
      while (distance < metric.length) {
        final end = (distance + dashLength).clamp(0.0, metric.length);
        final extractPath = metric.extractPath(distance, end);
        canvas.drawPath(extractPath, paint);
        distance += dashLength + gapLength;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.color != color || old.strokeWidth != strokeWidth;
}

/// Map preview with contour lines and track path
class _MapPreviewPainter extends CustomPainter {
  final Color terrainColor;
  final Color contourColor;
  final Color trackColor;
  final Color mossColor;

  _MapPreviewPainter({
    required this.terrainColor,
    required this.contourColor,
    required this.trackColor,
    required this.mossColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Terrain background
    canvas.drawRect(
      Rect.fromLTWH(0, 0, w, h),
      Paint()..color = const Color(0xFFE5DDD0),
    );

    // Contour lines
    final contourPaint = Paint()
      ..color = contourColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;

    for (int i = 0; i < 8; i++) {
      final path = Path();
      final yBase = h * 0.15 + i * h * 0.1;
      path.moveTo(0, yBase);
      for (double x = 0; x <= w; x += 10) {
        final y = yBase +
            math.sin(x / 40 + i * 0.7) * 12 +
            math.cos(x / 60 + i * 1.2) * 8;
        path.lineTo(x, y);
      }
      canvas.drawPath(path, contourPaint);
    }

    // Track path (glow)
    final trackPoints = _generateTrackPoints(w, h);
    final glowPath = Path();
    glowPath.moveTo(trackPoints[0].dx, trackPoints[0].dy);
    for (int i = 1; i < trackPoints.length; i++) {
      glowPath.lineTo(trackPoints[i].dx, trackPoints[i].dy);
    }
    canvas.drawPath(
      glowPath,
      Paint()
        ..color = trackColor.withAlpha(46) // 0.18 * 255
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Track path (line)
    canvas.drawPath(
      glowPath,
      Paint()
        ..color = trackColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Start circle
    final start = trackPoints.first;
    canvas.drawCircle(
      start,
      6,
      Paint()..color = Colors.white,
    );
    canvas.drawCircle(
      start,
      5,
      Paint()..color = mossColor,
    );

    // Start label
    final startTp = TextPainter(
      text: TextSpan(
        text: '起点',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: mossColor,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    startTp.paint(canvas, Offset(start.dx + 10, start.dy - 6));

    // End circle
    final end = trackPoints.last;
    canvas.drawCircle(
      end,
      6,
      Paint()..color = Colors.white,
    );
    canvas.drawCircle(
      end,
      5,
      Paint()..color = trackColor,
    );

    // End label
    final endTp = TextPainter(
      text: TextSpan(
        text: '终点',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: trackColor,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    endTp.paint(canvas, Offset(end.dx - endTp.width - 10, end.dy - 6));
  }

  List<Offset> _generateTrackPoints(double w, double h) {
    // Simulated track going from bottom-left to top-right with curves
    final points = <Offset>[];
    const count = 30;
    for (int i = 0; i <= count; i++) {
      final t = i / count;
      final x = w * 0.12 + t * w * 0.76;
      final y = h * 0.75 -
          t * h * 0.5 +
          math.sin(t * 5) * 15 +
          math.cos(t * 3) * 10;
      points.add(Offset(x, y));
    }
    return points;
  }

  @override
  bool shouldRepaint(_MapPreviewPainter old) => false;
}

/// Elevation profile chart
class _ElevationChartPainter extends CustomPainter {
  final Color lineColor;

  _ElevationChartPainter({required this.lineColor});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Elevation data points (simulated)
    final points = <Offset>[];
    const count = 40;
    for (int i = 0; i <= count; i++) {
      final t = i / count;
      final x = t * w;
      // Simulate: start low, climb to peak around 65%, then descend
      double elevation;
      if (t < 0.15) {
        elevation = 0.1 + t * 1.5;
      } else if (t < 0.65) {
        elevation = 0.325 + (t - 0.15) * 1.15;
      } else {
        elevation = 0.9 - (t - 0.65) * 1.2;
      }
      elevation += math.sin(t * 12) * 0.04;
      elevation = elevation.clamp(0.05, 0.95);
      final y = h - elevation * h;
      points.add(Offset(x, y));
    }

    // Gradient fill
    final fillPath = Path();
    fillPath.moveTo(0, h);
    for (final p in points) {
      fillPath.lineTo(p.dx, p.dy);
    }
    fillPath.lineTo(w, h);
    fillPath.close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          lineColor.withAlpha(89), // 0.35 * 255
          lineColor.withAlpha(0),
        ],
      ).createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawPath(fillPath, fillPaint);

    // Line stroke
    final linePath = Path();
    linePath.moveTo(points[0].dx, points[0].dy);
    for (int i = 1; i < points.length; i++) {
      linePath.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = lineColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Peak marker: find highest point
    Offset peak = points[0];
    for (final p in points) {
      if (p.dy < peak.dy) peak = p;
    }
    canvas.drawCircle(
      peak,
      4,
      Paint()..color = Colors.white,
    );
    canvas.drawCircle(
      peak,
      3,
      Paint()..color = lineColor,
    );
  }

  @override
  bool shouldRepaint(_ElevationChartPainter old) =>
      old.lineColor != lineColor;
}
