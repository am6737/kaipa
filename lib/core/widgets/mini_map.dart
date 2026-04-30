import 'dart:math';
import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';

/// Decorative trail mini-map using CustomPainter.
///
/// Draws terrain contour lines, a trail path, and start/end dots.
/// Use `seed` param for visual variety.
class MiniMap extends StatelessWidget {
  final int seed;
  final double width;
  final double height;
  final KaipaTokens? tokens;

  const MiniMap({
    super.key,
    this.seed = 0,
    this.width = double.infinity,
    this.height = 80,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: width,
        height: height,
        child: CustomPaint(
          size: Size(width == double.infinity ? 300 : width, height),
          painter: _MiniMapPainter(tokens: t, seed: seed),
        ),
      ),
    );
  }
}

class _MiniMapPainter extends CustomPainter {
  final KaipaTokens tokens;
  final int seed;

  _MiniMapPainter({required this.tokens, required this.seed});

  @override
  void paint(Canvas canvas, Size size) {
    final c = tokens.color;
    final rng = Random(seed);
    final w = size.width;
    final h = size.height;

    // Background — terrain base
    final bgPaint = Paint()..color = c.terrain.base;
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), bgPaint);

    // Draw terrain elevation bands
    _drawTerrainBands(canvas, size, rng);

    // Draw contour lines
    _drawContours(canvas, size, rng);

    // Draw trail path
    _drawTrail(canvas, size, rng);
  }

  void _drawTerrainBands(Canvas canvas, Size size, Random rng) {
    final c = tokens.color;
    final w = size.width;
    final h = size.height;

    final colors = [
      c.terrain.lowland,
      c.terrain.mid,
      c.terrain.ridge,
      c.terrain.peak,
    ];

    for (int i = 0; i < colors.length; i++) {
      final paint = Paint()..color = colors[i];
      final yOffset = h * (0.8 - i * 0.18) + rng.nextDouble() * 8;
      final path = Path();

      path.moveTo(0, yOffset);

      // Generate organic curve
      final segments = 5 + rng.nextInt(3);
      for (int s = 0; s <= segments; s++) {
        final x = w * s / segments;
        final y = yOffset - rng.nextDouble() * h * 0.15 - i * 4;
        if (s == 0) {
          path.lineTo(x, y);
        } else {
          final prevX = w * (s - 1) / segments;
          final cpX = (prevX + x) / 2;
          path.quadraticBezierTo(cpX, y + rng.nextDouble() * 6 - 3, x, y);
        }
      }

      // Close at bottom
      path.lineTo(w, h);
      path.lineTo(0, h);
      path.close();

      canvas.drawPath(path, paint);
    }

    // Water area (optional, based on seed)
    if (seed % 3 == 0) {
      final waterPaint = Paint()..color = c.terrain.water;
      final waterPath = Path();
      final wx = w * (0.6 + rng.nextDouble() * 0.2);
      final wy = h * (0.5 + rng.nextDouble() * 0.2);
      waterPath.addOval(Rect.fromCenter(
        center: Offset(wx, wy),
        width: w * 0.18,
        height: h * 0.22,
      ));
      canvas.drawPath(waterPath, waterPaint);
    }

    // Forest patch
    if (seed % 2 == 0) {
      final forestPaint = Paint()..color = c.terrain.forest;
      final fx = w * (0.15 + rng.nextDouble() * 0.25);
      final fy = h * (0.4 + rng.nextDouble() * 0.2);
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(fx, fy),
          width: w * 0.25,
          height: h * 0.2,
        ),
        forestPaint,
      );
    }
  }

  void _drawContours(Canvas canvas, Size size, Random rng) {
    final c = tokens.color;
    final w = size.width;
    final h = size.height;

    final contourPaint = Paint()
      ..color = c.terrain.contour
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;

    final majorContourPaint = Paint()
      ..color = c.terrain.contourMajor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;

    // Draw 6-8 contour lines
    final lineCount = 6 + rng.nextInt(3);
    for (int i = 0; i < lineCount; i++) {
      final isMajor = i % 3 == 0;
      final paint = isMajor ? majorContourPaint : contourPaint;

      final path = Path();
      final baseY = h * (0.15 + i * 0.1) + rng.nextDouble() * 6;

      path.moveTo(0, baseY);
      final segments = 6 + rng.nextInt(3);
      for (int s = 1; s <= segments; s++) {
        final x = w * s / segments;
        final y = baseY + sin(s * 0.8 + seed) * h * 0.06 + rng.nextDouble() * 4 - 2;
        final cpX = w * (s - 0.5) / segments;
        final cpY = y + rng.nextDouble() * 6 - 3;
        path.quadraticBezierTo(cpX, cpY, x, y);
      }

      canvas.drawPath(path, paint);
    }
  }

  void _drawTrail(Canvas canvas, Size size, Random rng) {
    final c = tokens.color;
    final w = size.width;
    final h = size.height;

    // Trail line
    final trailPaint = Paint()
      ..color = c.flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final trailPath = Path();

    // Generate trail points
    final startX = w * 0.08;
    final startY = h * (0.65 + rng.nextDouble() * 0.15);
    final endX = w * 0.92;
    final endY = h * (0.25 + rng.nextDouble() * 0.15);

    trailPath.moveTo(startX, startY);

    // 3-4 control points for organic trail
    final midPoints = 3 + rng.nextInt(2);
    for (int i = 1; i <= midPoints; i++) {
      final t = i / (midPoints + 1);
      final x = startX + (endX - startX) * t;
      final baseY = startY + (endY - startY) * t;
      final y = baseY + (rng.nextDouble() - 0.5) * h * 0.3;
      final cpX = x - w * 0.08;
      final cpY = y + (rng.nextDouble() - 0.5) * h * 0.15;
      trailPath.quadraticBezierTo(cpX, cpY, x, y);
    }

    trailPath.quadraticBezierTo(
      endX - w * 0.05,
      endY + rng.nextDouble() * 6,
      endX,
      endY,
    );

    canvas.drawPath(trailPath, trailPaint);

    // Start dot — moss green
    final startDotPaint = Paint()..color = c.moss;
    canvas.drawCircle(Offset(startX, startY), 3.5, startDotPaint);
    final startBorderPaint = Paint()
      ..color = const Color(0xFFFFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawCircle(Offset(startX, startY), 3.5, startBorderPaint);

    // End dot — flare
    final endDotPaint = Paint()..color = c.flare;
    canvas.drawCircle(Offset(endX, endY), 3.5, endDotPaint);
    canvas.drawCircle(Offset(endX, endY), 3.5, startBorderPaint);
  }

  @override
  bool shouldRepaint(_MiniMapPainter oldDelegate) {
    return oldDelegate.seed != seed || oldDelegate.tokens != tokens;
  }
}
