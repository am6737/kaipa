class HourlyWeather {
  final DateTime dateTime;
  final double tempC;
  final double feelsLikeC;
  final int humidity;
  final double windSpeedMs;
  final int weatherCode;
  final String weatherMain;
  final String weatherDescription;
  final String weatherIcon;
  final double pop;

  const HourlyWeather({
    required this.dateTime,
    required this.tempC,
    required this.feelsLikeC,
    required this.humidity,
    required this.windSpeedMs,
    required this.weatherCode,
    required this.weatherMain,
    required this.weatherDescription,
    required this.weatherIcon,
    required this.pop,
  });

  factory HourlyWeather.fromOwmJson(Map<String, dynamic> json) {
    final weather = (json['weather'] as List).first as Map<String, dynamic>;
    return HourlyWeather(
      dateTime: DateTime.fromMillisecondsSinceEpoch(
          (json['dt'] as num).toInt() * 1000),
      tempC: (json['temp'] as num).toDouble(),
      feelsLikeC: (json['feels_like'] as num).toDouble(),
      humidity: (json['humidity'] as num).toInt(),
      windSpeedMs: (json['wind_speed'] as num).toDouble(),
      weatherCode: (weather['id'] as num).toInt(),
      weatherMain: weather['main'] as String,
      weatherDescription: weather['description'] as String,
      weatherIcon: weather['icon'] as String,
      pop: (json['pop'] as num?)?.toDouble() ?? 0,
    );
  }

  factory HourlyWeather.fromCacheJson(Map<String, dynamic> json) {
    return HourlyWeather(
      dateTime: DateTime.parse(json['date_time'] as String),
      tempC: (json['temp_c'] as num).toDouble(),
      feelsLikeC: (json['feels_like_c'] as num).toDouble(),
      humidity: (json['humidity'] as num).toInt(),
      windSpeedMs: (json['wind_speed_ms'] as num).toDouble(),
      weatherCode: (json['weather_code'] as num).toInt(),
      weatherMain: json['weather_main'] as String,
      weatherDescription: json['weather_description'] as String,
      weatherIcon: json['weather_icon'] as String,
      pop: (json['pop'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toCacheJson() {
    return {
      'date_time': dateTime.toIso8601String(),
      'temp_c': tempC,
      'feels_like_c': feelsLikeC,
      'humidity': humidity,
      'wind_speed_ms': windSpeedMs,
      'weather_code': weatherCode,
      'weather_main': weatherMain,
      'weather_description': weatherDescription,
      'weather_icon': weatherIcon,
      'pop': pop,
    };
  }

  bool get hasRain => weatherCode >= 200 && weatherCode < 600;
  bool get hasSnow => weatherCode >= 600 && weatherCode < 700;
}

class WeatherForecast {
  final List<HourlyWeather> hourly;
  final DateTime fetchedAt;

  const WeatherForecast({
    required this.hourly,
    required this.fetchedAt,
  });

  double get minTempC =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.tempC).reduce((a, b) => a < b ? a : b);
  double get maxTempC =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.tempC).reduce((a, b) => a > b ? a : b);
  double get maxPop =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.pop).reduce((a, b) => a > b ? a : b);
  double get maxWindSpeedMs =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.windSpeedMs).reduce((a, b) => a > b ? a : b);
  bool get hasRainRisk => hourly.any((h) => h.pop > 0.3);

  List<HourlyWeather> forDate(DateTime date) {
    return hourly
        .where((h) =>
            h.dateTime.year == date.year &&
            h.dateTime.month == date.month &&
            h.dateTime.day == date.day)
        .toList();
  }

  factory WeatherForecast.fromCacheJson(Map<String, dynamic> json) {
    return WeatherForecast(
      hourly: (json['hourly'] as List)
          .map((h) => HourlyWeather.fromCacheJson(h as Map<String, dynamic>))
          .toList(),
      fetchedAt: DateTime.parse(json['fetched_at'] as String),
    );
  }

  Map<String, dynamic> toCacheJson() {
    return {
      'hourly': hourly.map((h) => h.toCacheJson()).toList(),
      'fetched_at': fetchedAt.toIso8601String(),
    };
  }
}
