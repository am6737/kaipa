import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../theme/kaipa_theme.dart';

class SkeletonCard extends StatelessWidget {
  final double height;
  final double borderRadius;

  const SkeletonCard({super.key, this.height = 100, this.borderRadius = 16});

  @override
  Widget build(BuildContext context) {
    final colors = context.kaipaTokens.color;
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Container(
        height: height,
        width: double.infinity,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(borderRadius),
          border: Border.all(color: colors.line, width: 0.5),
        ),
      ),
    );
  }
}

class SkeletonWeatherCard extends StatelessWidget {
  const SkeletonWeatherCard({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.kaipaTokens.color;
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 14, width: 80, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(4))),
          const SizedBox(height: 12),
          Container(height: 12, width: 140, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(4))),
          const SizedBox(height: 16),
          Row(children: [
            for (int i = 0; i < 4; i++) ...[
              Expanded(child: Container(height: 48, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(8)))),
              if (i < 3) const SizedBox(width: 8),
            ],
          ]),
        ]),
      ),
    );
  }
}

class SkeletonTimelineCard extends StatelessWidget {
  const SkeletonTimelineCard({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.kaipaTokens.color;
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(height: 14, width: 90, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(4))),
            const Spacer(),
            Container(height: 14, width: 50, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(4))),
          ]),
          const SizedBox(height: 3),
          Container(height: 3, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 14),
          for (int i = 0; i < 3; i++) ...[
            Row(children: [
              Container(width: 20, height: 20, decoration: BoxDecoration(shape: BoxShape.circle, color: colors.surface)),
              const SizedBox(width: 12),
              Expanded(child: Container(height: 14, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(4)))),
            ]),
            if (i < 2) const SizedBox(height: 12),
          ],
        ]),
      ),
    );
  }
}

class SkeletonChipsCard extends StatelessWidget {
  final bool embedded;

  const SkeletonChipsCard({super.key, this.embedded = false});

  @override
  Widget build(BuildContext context) {
    final colors = context.kaipaTokens.color;
    final content = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(height: 14, width: 90, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(4))),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (int i = 0; i < 5; i++)
          Container(height: 28, width: 60.0 + (i % 3) * 16, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14))),
      ]),
    ]);

    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: embedded
          ? content
          : Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: content,
            ),
    );
  }
}
