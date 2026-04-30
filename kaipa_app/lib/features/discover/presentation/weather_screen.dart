import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/route_repository.dart';
import '../domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

class WeatherScreen extends ConsumerWidget {
  final String routeId;
  const WeatherScreen({super.key, required this.routeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(routeId));

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        leading: IconButton(icon: Icon(Icons.arrow_back_ios, color: colors.ink), onPressed: () => context.pop()),
        title: Text('天气', style: TextStyle(color: colors.ink)),
      ),
      body: routeAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: colors.flare)),
        error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
        data: (route) => _buildContent(route, tokens, colors),
      ),
    );
  }

  Widget _buildContent(RouteModel route, KaipaTokens tokens, KaipaColors colors) {
    final baseTemp = route.maxAltitudeM != null ? (22 - (route.maxAltitudeM! / 200)).round() : 18;
    final summitTemp = baseTemp - 8;
    final windSpeed = route.hasWaterSource ? 3 : 7;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(route.name, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: colors.ink)),
          Text(route.region ?? '', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
          const SizedBox(height: 20),

          // Current conditions
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Column(
              children: [
                Icon(Icons.wb_sunny, size: 48, color: colors.sand),
                const SizedBox(height: 8),
                Text('$baseTemp°', style: TextStyle(fontSize: 48, fontWeight: FontWeight.w300, color: colors.ink)),
                Text('晴', style: TextStyle(fontSize: 16, color: colors.inkMuted)),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _conditionItem('湿度', '45%', Icons.water_drop, colors),
                    _conditionItem('风力', '$windSpeed级', Icons.air, colors),
                    _conditionItem('紫外线', '强', Icons.wb_sunny_outlined, colors),
                    _conditionItem('体感', '${baseTemp - 2}°', Icons.thermostat, colors),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Hourly forecast
          Text('逐时预报', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 12),
          SizedBox(
            height: 100,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: 12,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final hour = (8 + i) % 24;
                final temp = baseTemp + (i < 6 ? i : 12 - i) - 3;
                return Container(
                  width: 56,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      Text('$hour:00', style: TextStyle(fontSize: 11, color: colors.inkMuted)),
                      Icon(hour >= 6 && hour <= 18 ? Icons.wb_sunny : Icons.dark_mode, size: 18, color: colors.sand),
                      Text('$temp°', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink)),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 20),

          // Multi-day forecast
          Text('5日预报', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 12),
          ...List.generate(5, (i) {
            final days = ['今天', '明天', '后天', '周四', '周五'];
            final icons = [Icons.wb_sunny, Icons.wb_cloudy, Icons.wb_sunny, Icons.cloud, Icons.wb_sunny];
            final high = baseTemp + 2 - i;
            final low = baseTemp - 6 - i;
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: colors.line, width: 0.5))),
              child: Row(
                children: [
                  SizedBox(width: 48, child: Text(days[i], style: TextStyle(fontSize: 14, color: colors.ink))),
                  Icon(icons[i], size: 20, color: colors.sand),
                  const Spacer(),
                  Text('$low°', style: TextStyle(fontSize: 14, color: colors.inkDim)),
                  const SizedBox(width: 8),
                  Container(
                    width: 60, height: 4,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(2),
                      gradient: LinearGradient(colors: [colors.sky, colors.sand]),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('$high°', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink)),
                ],
              ),
            );
          }),
          const SizedBox(height: 20),

          // Elevation-based weather
          Text('海拔气象', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _elevCard('山脚', '$baseTemp°', '$windSpeed级', '45%', colors)),
              const SizedBox(width: 12),
              Expanded(child: _elevCard('山顶', '$summitTemp°', '${windSpeed + 2}级', '65%', colors)),
            ],
          ),

          // Safety warning
          if (windSpeed >= 6) ...[
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.diff.extreme.withAlpha(15),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.diff.extreme.withAlpha(60), width: 0.5),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber, color: colors.diff.extreme, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('山脊段阵风可达${windSpeed + 2}级，注意防风保暖',
                      style: TextStyle(fontSize: 13, color: colors.diff.extreme)),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _conditionItem(String label, String value, IconData icon, KaipaColors colors) {
    return Column(
      children: [
        Icon(icon, size: 18, color: colors.inkMuted),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink)),
        Text(label, style: TextStyle(fontSize: 10, color: colors.inkMuted)),
      ],
    );
  }

  Widget _elevCard(String label, String temp, String wind, String humidity, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 8),
          Text(temp, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w300, color: colors.ink)),
          const SizedBox(height: 8),
          Text('风力 $wind', style: TextStyle(fontSize: 12, color: colors.inkMuted)),
          Text('湿度 $humidity', style: TextStyle(fontSize: 12, color: colors.inkMuted)),
        ],
      ),
    );
  }
}
