import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../domain/trip_plan_model.dart';

class DepartureConfirmSheet extends ConsumerWidget {
  final TripPlanModel plan;

  const DepartureConfirmSheet({
    super.key,
    required this.plan,
  });

  static Future<bool?> show(
    BuildContext context, {
    required TripPlanModel plan,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DepartureConfirmSheet(plan: plan),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final route = plan.route;
    final allPacked = plan.totalGearCount == 0 ||
        plan.packedCount == plan.totalGearCount;
    final hasGear = plan.totalGearCount > 0;

    return Container(
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: colors.line,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),

          // Header icon + title
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: colors.flareSoft,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: KaipaIcon(
                name: KaipaIcons.navigate,
                size: 26,
                color: colors.flare,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            '出发前确认',
            style: TextStyle(
              color: colors.ink,
              fontSize: 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            route?.name ?? '行程计划',
            style: TextStyle(
              color: colors.inkMuted,
              fontSize: 14,
              letterSpacing: -0.1,
            ),
          ),
          const SizedBox(height: 24),

          // Checklist
          Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Column(
              children: [
                _buildCheckRow(
                  icon: KaipaIcons.route,
                  label: '路线',
                  value: [
                    if (route != null) '${route.distanceKm.toStringAsFixed(1)}km',
                    if (route != null) '${route.elevationGainM.toInt()}m↑',
                  ].join(' · '),
                  status: _CheckStatus.ok,
                  colors: colors,
                ),
                Divider(height: 0.5, thickness: 0.5, color: colors.line,
                    indent: 52),
                if (hasGear) ...[
                  _buildCheckRow(
                    icon: KaipaIcons.backpack,
                    label: '装备打包',
                    value: '${plan.packedCount}/${plan.totalGearCount}',
                    status: allPacked ? _CheckStatus.ok : _CheckStatus.warn,
                    colors: colors,
                  ),
                  Divider(height: 0.5, thickness: 0.5, color: colors.line,
                      indent: 52),
                ],
                _buildCheckRow(
                  icon: KaipaIcons.clock,
                  label: '出发时间',
                  value: _formatTime(plan),
                  status: _CheckStatus.info,
                  colors: colors,
                ),
              ],
            ),
          ),

          // Warning banner if gear not packed
          if (hasGear && !allPacked) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFD4645A).withAlpha(15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: const Color(0xFFD4645A).withAlpha(38),
                  width: 0.5,
                ),
              ),
              child: Row(
                children: [
                  KaipaIcon(
                    name: KaipaIcons.alert,
                    size: 16,
                    color: const Color(0xFFD4645A),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '还有 ${plan.totalGearCount - plan.packedCount} 件装备未打包',
                      style: TextStyle(
                        color: colors.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 24),

          // Primary CTA
          GestureDetector(
            onTap: () => Navigator.of(context).pop(true),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: colors.flare.withAlpha(64),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  KaipaIcon(
                    name: KaipaIcons.navigate,
                    size: 18,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    '确认出发',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Secondary action
          GestureDetector(
            onTap: () => Navigator.of(context).pop(false),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                '继续准备',
                style: TextStyle(
                  color: colors.inkMuted,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckRow({
    required String icon,
    required String label,
    required String value,
    required _CheckStatus status,
    required KaipaColors colors,
  }) {
    final statusColor = switch (status) {
      _CheckStatus.ok => colors.flare,
      _CheckStatus.warn => const Color(0xFFD4645A),
      _CheckStatus.info => colors.inkDim,
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colorWithOpacity(statusColor, 0.10),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Center(
              child: KaipaIcon(name: icon, size: 16, color: statusColor),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: colors.ink,
                fontSize: 14,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.1,
              ),
            ),
          ),
          if (status == _CheckStatus.ok)
            KaipaIcon(name: KaipaIcons.check, size: 16, color: colors.flare)
          else
            Text(
              value,
              style: TextStyle(
                color: statusColor,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
        ],
      ),
    );
  }

  String _formatTime(TripPlanModel plan) {
    if (plan.plannedStartTime != null) return plan.plannedStartTime!;
    final now = TimeOfDay.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }
}

enum _CheckStatus { ok, warn, info }
