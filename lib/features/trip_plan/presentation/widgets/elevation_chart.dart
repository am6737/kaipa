import 'package:flutter/material.dart';

import '../../../discover/domain/route_model.dart';

class ElevationChart extends StatelessWidget {
  final List<ElevationPoint> profile;
  final Color lineColor;
  final Color fillColor;
  final Color textColor;

  const ElevationChart({
    super.key,
    required this.profile,
    required this.lineColor,
    required this.fillColor,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    if (profile.isEmpty) {
      return SizedBox(
        height: 120,
        child: Center(
          child: Text('暂无海拔数据', style: TextStyle(color: textColor, fontSize: 13)),
        ),
      );
    }

    return SizedBox(
      height: 120,
      child: CustomPaint(
        painter: _ElevationPainter(
          profile: profile,
          lineColor: lineColor,
          fillColor: fillColor,
          textColor: textColor,
        ),
        size: Size.infinite,
      ),
    );
  }
}

class _ElevationPainter extends CustomPainter {
  final List<ElevationPoint> profile;
  final Color lineColor;
  final Color fillColor;
  final Color textColor;

  _ElevationPainter({
    required this.profile,
    required this.lineColor,
    required this.fillColor,
    required this.textColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (profile.isEmpty) return;

    final w = size.width;
    final h = size.height;
    const chartTop = 8.0;
    final chartBottom = h - 24.0;
    final chartHeight = chartBottom - chartTop;

    final maxDist = profile.last.distance;
    final minElev = profile.map((p) => p.elevation).reduce((a, b) => a < b ? a : b);
    final maxElev = profile.map((p) => p.elevation).reduce((a, b) => a > b ? a : b);
    final elevRange = maxElev - minElev;
    final elevPadding = elevRange * 0.1;

    double xFor(double dist) => (dist / maxDist) * w;
    double yFor(double elev) =>
        chartTop +
        chartHeight -
        ((elev - minElev + elevPadding) / (elevRange + elevPadding * 2)) *
            chartHeight;

    final fillPath = Path();
    fillPath.moveTo(xFor(profile.first.distance), chartBottom);
    for (final p in profile) {
      fillPath.lineTo(xFor(p.distance), yFor(p.elevation));
    }
    fillPath.lineTo(xFor(profile.last.distance), chartBottom);
    fillPath.close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [fillColor.withValues(alpha: 0.4), fillColor.withValues(alpha: 0.05)],
      ).createShader(Rect.fromLTWH(0, chartTop, w, chartHeight));

    canvas.drawPath(fillPath, fillPaint);

    final linePath = Path();
    linePath.moveTo(xFor(profile.first.distance), yFor(profile.first.elevation));
    for (int i = 1; i < profile.length; i++) {
      linePath.lineTo(xFor(profile[i].distance), yFor(profile[i].elevation));
    }

    final linePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(linePath, linePaint);

    final peakIdx = profile.indexWhere((p) => p.elevation == maxElev);
    if (peakIdx >= 0) {
      final px = xFor(profile[peakIdx].distance);
      final py = yFor(maxElev);
      canvas.drawCircle(Offset(px, py), 4, Paint()..color = lineColor);
    }

    final labelStyle = TextStyle(color: textColor, fontSize: 10);
    _drawLabel(canvas, '${minElev.toInt()}m', Offset(4, chartBottom + 4), labelStyle);
    _drawLabel(canvas, '${maxElev.toInt()}m', Offset(w / 2 - 16, chartTop - 2), labelStyle);
    _drawLabel(canvas, '${maxDist.toStringAsFixed(1)}km', Offset(w - 40, chartBottom + 4), labelStyle);
  }

  void _drawLabel(Canvas canvas, String text, Offset offset, TextStyle style) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _ElevationPainter oldDelegate) {
    return oldDelegate.profile != profile;
  }
}
