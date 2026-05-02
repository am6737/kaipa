import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../domain/trip_plan_model.dart';
import '../../domain/weather_models.dart';

class DepartureConfirmSheet extends ConsumerWidget {
  final TripPlanModel plan;
  final WeatherForecast? weather;

  const DepartureConfirmSheet({
    super.key,
    required this.plan,
    this.weather,
  });

  static Future<bool?> show(
    BuildContext context, {
    required TripPlanModel plan,
    WeatherForecast? weather,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DepartureConfirmSheet(plan: plan, weather: weather),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final route = plan.route;

    final allPacked = plan.gearItems.every((g) => g.isPacked);
    final weatherOk = weather == null || !weather!.hasRainRisk;
    final dayForecast = weather?.forDate(plan.plannedDate) ?? [];

    return Container(
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.line,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            '出发前确认',
            style: TextStyle(
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 20),
          _buildCheckItem(
            icon: allPacked ? '✅' : '⚠️',
            label: '装备已全部打包',
            value: '${plan.packedCount}/${plan.totalGearCount}',
            isOk: allPacked,
            colors: colors,
          ),
          const SizedBox(height: 12),
          _buildCheckItem(
            icon: weatherOk ? '✅' : '⚠️',
            label: weatherOk ? '天气适宜出行' : '天气有风险',
            value: dayForecast.isEmpty
                ? '--'
                : '${weather!.minTempC.round()}~${weather!.maxTempC.round()}°C',
            isOk: weatherOk,
            colors: colors,
          ),
          const SizedBox(height: 12),
          _buildCheckItem(
            icon: '📍',
            label: route?.name ?? '路线',
            value:
                '${route?.distanceKm.toStringAsFixed(1)}km · ${route?.difficulty}',
            isOk: true,
            colors: colors,
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop(true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF22C55E),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                '确认出发',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(
                '暂不出发，继续准备',
                style: TextStyle(color: colors.textTertiary, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckItem({
    required String icon,
    required String label,
    required String value,
    required bool isOk,
    required dynamic colors,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceSecondary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: colors.textPrimary, fontSize: 14),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: isOk ? const Color(0xFF22C55E) : Colors.orange.shade700,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
