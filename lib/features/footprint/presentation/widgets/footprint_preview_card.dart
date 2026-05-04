import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../../../core/widgets/glass_container.dart';
import '../../../../core/widgets/diff_badge.dart';
import '../../domain/footprint_memory.dart';

class FootprintPreviewCard extends StatelessWidget {
  final FootprintMemory memory;
  final KaipaColors colors;
  final String photoUrl;
  final VoidCallback onTap;
  final VoidCallback onClose;

  const FootprintPreviewCard({
    super.key,
    required this.memory,
    required this.colors,
    required this.photoUrl,
    required this.onTap,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final t = memory.trip;
    final distStr = t.actualDistanceKm?.toStringAsFixed(1) ?? '--';
    final elevStr = t.actualElevationM?.toInt().toString() ?? '--';
    final durStr = t.actualDuration != null ? _fmtDur(t.actualDuration!) : '--';
    final hasPhoto = photoUrl.isNotEmpty;

    return GlassContainer(
      radius: 24,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24), topRight: Radius.circular(24),
            ),
            child: SizedBox(
              width: double.infinity, height: 150,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (hasPhoto)
                    Image.network(photoUrl, fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _placeholder()),
                  if (!hasPhoto) _placeholder(),
                  Positioned(
                    top: 10, left: 0, right: 0,
                    child: Center(
                      child: Container(
                        width: 36, height: 4,
                        decoration: BoxDecoration(
                          color: const Color.fromRGBO(255, 255, 255, 0.6),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(memory.dateLabel,
                  style: TextStyle(fontSize: 11, color: colors.inkMuted)),
                const SizedBox(height: 4),
                Text(memory.displayName,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700,
                    letterSpacing: -0.6, color: colors.ink)),
                const SizedBox(height: 6),
                Row(children: [
                  if (memory.routeDifficulty != null)
                    DiffBadge(level: memory.routeDifficulty!),
                  if (memory.routeDifficulty != null) const SizedBox(width: 8),
                  Expanded(
                    child: Text('$distStr 公里 · ↑$elevStr m · $durStr',
                      style: TextStyle(fontSize: 12, color: colors.inkMuted),
                      overflow: TextOverflow.ellipsis),
                  ),
                  if (memory.isManual)
                    Container(
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: colors.sand, borderRadius: BorderRadius.circular(99)),
                      child: Text('手动',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.ink)),
                    ),
                ]),
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: onTap,
                  child: Container(
                    width: double.infinity, height: 46,
                    decoration: BoxDecoration(
                      color: colors.moss,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [BoxShadow(
                        color: colorWithOpacity(colors.moss, 0.35),
                        blurRadius: 14, offset: const Offset(0, 4))],
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        KaipaIcon(name: KaipaIcons.mountain, size: 16, color: Colors.white),
                        SizedBox(width: 8),
                        Text('查看足迹回忆',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: colors.moss.withAlpha(30),
      child: Center(
        child: KaipaIcon(name: KaipaIcons.mountain, size: 40, color: colors.moss)),
    );
  }

  String _fmtDur(Duration d) {
    if (d.inHours > 0) {
      final m = d.inMinutes % 60;
      return m > 0 ? '${d.inHours} 小时 $m 分' : '${d.inHours} 小时';
    }
    return '${d.inMinutes} 分';
  }
}
