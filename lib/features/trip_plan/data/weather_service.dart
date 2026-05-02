import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/weather_models.dart';
import 'trip_plan_repository.dart';

const _staleThreshold = Duration(hours: 3);

final weatherServiceProvider = Provider<WeatherService>((ref) {
  return WeatherService(ref.watch(tripPlanRepositoryProvider));
});

class WeatherService {
  final TripPlanRepository _planRepo;

  WeatherService(this._planRepo);

  Future<WeatherForecast> getForecast({
    required double lat,
    required double lon,
    String? planId,
    Map<String, dynamic>? cachedWeather,
    DateTime? cachedAt,
  }) async {
    if (cachedWeather != null && cachedAt != null) {
      final age = DateTime.now().difference(cachedAt);
      if (age < _staleThreshold) {
        return WeatherForecast.fromCacheJson(cachedWeather);
      }
    }

    final forecast = _demoForecast();

    if (planId != null) {
      await _planRepo.updateWeatherCache(
        planId: planId,
        weatherData: forecast.toCacheJson(),
      );
    }

    return forecast;
  }

  WeatherForecast _demoForecast() {
    final now = DateTime.now();
    final hourly = List.generate(48, (i) {
      final hour = now.add(Duration(hours: i));
      final isDay = hour.hour >= 6 && hour.hour < 18;
      final baseTemp = isDay ? 16.0 : 8.0;
      final variation = (i % 7) - 3.0;
      return HourlyWeather(
        dateTime: hour,
        tempC: baseTemp + variation,
        feelsLikeC: baseTemp + variation - 2,
        humidity: 60 + (i % 20),
        windSpeedMs: 2.0 + (i % 5) * 0.5,
        weatherCode: i > 20 && i < 28 ? 500 : 800,
        weatherMain: i > 20 && i < 28 ? 'Rain' : 'Clear',
        weatherDescription: i > 20 && i < 28 ? '小雨' : '晴',
        weatherIcon: i > 20 && i < 28
            ? '10${isDay ? 'd' : 'n'}'
            : '01${isDay ? 'd' : 'n'}',
        pop: i > 20 && i < 28 ? 0.7 : 0.1,
      );
    });

    return WeatherForecast(hourly: hourly, fetchedAt: now);
  }
}

final routeWeatherProvider = FutureProvider.family<WeatherForecast,
    ({double lat, double lon, String? planId, Map<String, dynamic>? cache, DateTime? cachedAt})>(
  (ref, params) async {
    final service = ref.watch(weatherServiceProvider);
    return service.getForecast(
      lat: params.lat,
      lon: params.lon,
      planId: params.planId,
      cachedWeather: params.cache,
      cachedAt: params.cachedAt,
    );
  },
);
