import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../domain/weather_models.dart';

class WeatherPanel extends ConsumerWidget {
  final WeatherForecast forecast;
  final DateTime targetDate;

  const WeatherPanel({
    super.key,
    required this.forecast,
    required this.targetDate,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final hourly = forecast.forDate(targetDate);

    final keyHours = [7, 12, 15, 19];
    final keyForecasts = keyHours.map((targetHour) {
      return hourly.cast<HourlyWeather?>().firstWhere(
            (h) => h != null && h.dateTime.hour == targetHour,
            orElse: () => null,
          );
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '天气预报',
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              '实时更新',
              style: TextStyle(color: colors.flare, fontSize: 11),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            color: colors.surfaceSecondary,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (int i = 0; i < keyForecasts.length; i++)
                _buildHourColumn(
                  keyForecasts[i],
                  ['上午', '中午', '下午', '晚上'][i],
                  colors,
                ),
            ],
          ),
        ),
        if (forecast.hasRainRisk) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Text('⚠️', style: TextStyle(fontSize: 13)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _buildRainWarning(hourly),
                    style: TextStyle(color: Colors.orange.shade700, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildHourColumn(
      HourlyWeather? weather, String label, dynamic colors) {
    if (weather == null) {
      return Column(
        children: [
          const Text('--', style: TextStyle(fontSize: 16)),
          Text('--', style: TextStyle(color: colors.textSecondary, fontSize: 12)),
          Text(label, style: TextStyle(color: colors.textTertiary, fontSize: 10)),
        ],
      );
    }

    return Column(
      children: [
        Text(_weatherEmoji(weather.weatherCode), style: const TextStyle(fontSize: 18)),
        const SizedBox(height: 2),
        Text(
          '${weather.tempC.round()}°',
          style: TextStyle(color: colors.textPrimary, fontSize: 13),
        ),
        Text(label, style: TextStyle(color: colors.textTertiary, fontSize: 10)),
      ],
    );
  }

  String _buildRainWarning(List<HourlyWeather> hourly) {
    final rainyHours = hourly.where((h) => h.pop > 0.3).toList();
    if (rainyHours.isEmpty) return '';
    final firstRain = rainyHours.first.dateTime;
    final lastRain = rainyHours.last.dateTime;
    return '${firstRain.hour}:00-${lastRain.hour + 1}:00 有降雨风险，建议携带雨具';
  }

  static String _weatherEmoji(int code) {
    if (code >= 200 && code < 300) return '⛈';
    if (code >= 300 && code < 400) return '🌧';
    if (code >= 500 && code < 600) return '🌧';
    if (code >= 600 && code < 700) return '❄️';
    if (code >= 700 && code < 800) return '🌫';
    if (code == 800) return '☀️';
    if (code == 801) return '⛅';
    if (code >= 802) return '☁️';
    return '🌤';
  }
}
