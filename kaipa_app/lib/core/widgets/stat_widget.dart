import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';

/// Stat display widget matching Stat from screen-map.jsx.
///
/// Shows a large value (22px, w600) with optional unit suffix and
/// a small label below.
class StatWidget extends StatelessWidget {
  final String value;
  final String? unit;
  final String label;
  final KaipaTokens? tokens;

  const StatWidget({
    super.key,
    required this.value,
    this.unit,
    required this.label,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: c.ink,
                letterSpacing: -0.5,
                height: 1,
              ),
            ),
            if (unit != null) ...[
              const SizedBox(width: 2),
              Text(
                unit!,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: c.inkDim,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: c.inkMuted,
            letterSpacing: -0.1,
          ),
        ),
      ],
    );
  }
}
