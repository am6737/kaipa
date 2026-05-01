import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/widgets/glass_container.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../data/map_layer_provider.dart';

class LayerPicker extends StatelessWidget {
  final KaipaColors colors;
  final MapLayerPrefs prefs;
  final ValueChanged<String> onBaseMapChanged;
  final VoidCallback onToggleRoutes;
  final VoidCallback onClose;

  const LayerPicker({
    super.key,
    required this.colors,
    required this.prefs,
    required this.onBaseMapChanged,
    required this.onToggleRoutes,
    required this.onClose,
  });

  static const _thumbColors = {
    'voyager': Color(0xFFF2EDE4),
    'positron': Color(0xFFF0F0F0),
    'satellite': Color(0xFF2D4A2E),
    'topo': Color(0xFFE8DCC8),
  };

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      radius: KaipaRadius.lg,
      padding: const EdgeInsets.all(14),
      child: SizedBox(
        width: 186,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '地图图层',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: onClose,
                  child: KaipaIcon(
                    name: KaipaIcons.close,
                    size: 14,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _Thumb(
                  layer: mapLayers[0],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[0].key,
                  onTap: () => onBaseMapChanged(mapLayers[0].key),
                ),
                const SizedBox(width: 10),
                _Thumb(
                  layer: mapLayers[1],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[1].key,
                  onTap: () => onBaseMapChanged(mapLayers[1].key),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _Thumb(
                  layer: mapLayers[2],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[2].key,
                  onTap: () => onBaseMapChanged(mapLayers[2].key),
                ),
                const SizedBox(width: 10),
                _Thumb(
                  layer: mapLayers[3],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[3].key,
                  onTap: () => onBaseMapChanged(mapLayers[3].key),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(height: 0.5, color: colors.line),
            const SizedBox(height: 12),
            Text(
              '叠加图层',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.inkMuted,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: onToggleRoutes,
              behavior: HitTestBehavior.opaque,
              child: Row(
                children: [
                  KaipaIcon(
                    name: KaipaIcons.route,
                    size: 16,
                    color: prefs.showRoutes ? colors.flare : colors.inkMuted,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '路线标记',
                      style: TextStyle(
                        fontSize: 13,
                        color: colors.ink,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ),
                  _Toggle(
                    value: prefs.showRoutes,
                    activeColor: colors.flare,
                    trackColor: colors.line,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  final MapLayerDef layer;
  final KaipaColors colors;
  final bool isSelected;
  final VoidCallback onTap;

  const _Thumb({
    required this.layer,
    required this.colors,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final thumbColor =
        LayerPicker._thumbColors[layer.key] ?? const Color(0xFFE0E0E0);

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              height: 56,
              decoration: BoxDecoration(
                color: thumbColor,
                borderRadius: BorderRadius.circular(KaipaRadius.sm),
                border: Border.all(
                  color: isSelected ? colors.flare : colors.line,
                  width: isSelected ? 2 : 0.5,
                ),
              ),
              child: _thumbDecoration(layer.key),
            ),
            const SizedBox(height: 5),
            Text(
              layer.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? colors.flare : colors.inkMuted,
                letterSpacing: -0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbDecoration(String key) {
    final lineColor = key == 'satellite'
        ? const Color(0x20FFFFFF)
        : const Color(0x18000000);
    if (key == 'topo') {
      return CustomPaint(
        painter: _ContourPainter(lineColor: lineColor),
        size: Size.infinite,
      );
    }
    return CustomPaint(
      painter: _GridPainter(lineColor: lineColor),
      size: Size.infinite,
    );
  }
}

class _GridPainter extends CustomPainter {
  final Color lineColor;
  _GridPainter({required this.lineColor});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.5;
    for (var x = size.width * 0.33; x < size.width; x += size.width * 0.33) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = size.height * 0.5; y < size.height; y += size.height * 0.5) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) => old.lineColor != lineColor;
}

class _ContourPainter extends CustomPainter {
  final Color lineColor;
  _ContourPainter({required this.lineColor});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.8
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < 3; i++) {
      final r = 12.0 + i * 10;
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(size.width * 0.4, size.height * 0.6),
          width: r * 2,
          height: r * 1.3,
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_ContourPainter old) => old.lineColor != lineColor;
}

class _Toggle extends StatelessWidget {
  final bool value;
  final Color activeColor;
  final Color trackColor;

  const _Toggle({
    required this.value,
    required this.activeColor,
    required this.trackColor,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 36,
      height: 20,
      decoration: BoxDecoration(
        color: value ? activeColor : trackColor,
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(2),
      alignment: value ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        width: 16,
        height: 16,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
