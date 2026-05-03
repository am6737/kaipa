import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';

/// Difficulty badge matching DiffBadge from screen-map.jsx.
///
/// Shows a colored dot and a difficulty label. Labels:
/// - easy  -> '入门 T4'
/// - mod   -> '中等 T3'
/// - hard  -> '困难 T2'
/// - expert -> '专家 T1'
class DiffBadge extends StatelessWidget {
  final String level;
  final KaipaTokens? tokens;

  const DiffBadge({
    super.key,
    required this.level,
    this.tokens,
  });

  static const Map<String, String> _labels = {
    'easy': '入门 T4',
    'mod': '中等 T3',
    'moderate': '中等 T3',
    'hard': '困难 T2',
    'expert': '专家 T1',
    'extreme': '极限 T0',
  };

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;

    final color = c.diff[level];
    final label = _labels[level] ?? level;
    // Background: color at ~10% opacity (matching color + '1A' hex = 0.10)
    final bgColor = colorWithOpacity(color, 0.10);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
