import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

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
    DateTime? forDate,
  }) async {
    if (cachedWeather != null && cachedAt != null) {
      final age = DateTime.now().difference(cachedAt);
      if (age < _staleThreshold) {
        return WeatherForecast.fromCacheJson(cachedWeather);
      }
    }

    final targetDate = forDate ?? DateTime.now();
    final forecast = await _fetchForecast(lat, lon, targetDate);

    if (planId != null) {
      await _planRepo.updateWeatherCache(
        planId: planId,
        weatherData: forecast.toCacheJson(),
      );
    }

    return forecast;
  }

  Future<WeatherForecast> _fetchForecast(
      double lat, double lon, DateTime forDate) async {
    final now = DateTime.now();
    final daysAhead = forDate.difference(now).inDays + 2;
    final forecastDays = math.max(2, math.min(daysAhead, 16));

    final uri = Uri.https('api.open-meteo.com', '/v1/forecast', {
      'latitude': lat.toStringAsFixed(4),
      'longitude': lon.toStringAsFixed(4),
      'hourly': 'temperature_2m,apparent_temperature,precipitation_probability,'
          'wind_speed_10m,weather_code,relative_humidity_2m',
      'timezone': 'Asia/Shanghai',
      'forecast_days': forecastDays.toString(),
    });

    final response = await http.get(uri);
    if (response.statusCode != 200) {
      // Fallback to demo data on API error
      return _demoForecast(forDate);
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final hourly = body['hourly'] as Map<String, dynamic>;
    final times = (hourly['time'] as List).cast<String>();
    final temps = (hourly['temperature_2m'] as List).cast<num>();
    final appTemps = (hourly['apparent_temperature'] as List).cast<num>();
    final pops = (hourly['precipitation_probability'] as List).cast<num>();
    final windSpeeds = (hourly['wind_speed_10m'] as List).cast<num>();
    final weatherCodes = (hourly['weather_code'] as List).cast<num>();
    final humidities = (hourly['relative_humidity_2m'] as List).cast<num>();

    final hourlyData = List.generate(times.length, (i) {
      final dateTime = DateTime.parse(times[i]);
      final code = weatherCodes[i].toInt();
      final weatherInfo = _wmoWeatherInfo(code);

      return HourlyWeather(
        dateTime: dateTime,
        tempC: temps[i].toDouble(),
        feelsLikeC: appTemps[i].toDouble(),
        humidity: humidities[i].toInt(),
        windSpeedMs: windSpeeds[i].toDouble(),
        weatherCode: code,
        weatherMain: weatherInfo.$1,
        weatherDescription: weatherInfo.$2,
        weatherIcon: weatherInfo.$3,
        pop: pops[i].toDouble() / 100.0,
      );
    });

    return WeatherForecast(hourly: hourlyData, fetchedAt: now);
  }

  WeatherForecast _demoForecast(DateTime forDate) {
    final start = DateTime(forDate.year, forDate.month, forDate.day, 8);
    final hourly = List.generate(48, (i) {
      final hour = start.add(Duration(hours: i));
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
        weatherIcon: i > 20 && i < 28 ? '10d' : '01d',
        pop: i > 20 && i < 28 ? 0.7 : 0.1,
      );
    });

    return WeatherForecast(hourly: hourly, fetchedAt: DateTime.now());
  }
}

/// Map WMO weather codes to (main, description, icon).
/// https://open-meteo.com/en/docs
(String, String, String) _wmoWeatherInfo(int code) {
  if (code == 0) return ('Clear', '晴', '01d');
  if (code <= 3) return ('Clouds', '多云', '02d');
  if (code <= 48) return ('Fog', '雾', '50d');
  if (code <= 55) return ('Drizzle', '毛毛雨', '09d');
  if (code <= 65) return ('Rain', '雨', '10d');
  if (code <= 77) return ('Snow', '雪', '13d');
  if (code <= 82) return ('Rain', '阵雨', '10d');
  if (code <= 86) return ('Snow', '阵雪', '13d');
  if (code >= 95) return ('Thunderstorm', '雷暴', '11d');
  return ('Clear', '晴', '01d');
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
