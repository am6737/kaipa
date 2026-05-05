class TripModel {
  final String id;
  final String userId;
  final String? routeId;
  final String source; // 'tracked' | 'manual'
  final DateTime startedAt;
  final DateTime? finishedAt;
  final double? actualDistanceKm;
  final double? actualElevationM;
  final Duration? actualDuration;
  final double? avgSpeedKmh;
  final double? maxAltitudeM;
  final double? caloriesBurned;
  final int? steps;
  final Map<String, dynamic>? trackGeojson;
  final List<String> photos;
  final List<String> gearUsed;
  final Map<String, dynamic>? weatherSummary;
  final Map<String, dynamic>? safetySettings;
  final String status;
  final int? rating;
  final String? notes;
  final DateTime createdAt;
  final String? routeName;
  final String? planId;
  final String? coverPhotoUrl;

  const TripModel({
    required this.id,
    required this.userId,
    this.routeId,
    this.source = 'tracked',
    required this.startedAt,
    this.finishedAt,
    this.actualDistanceKm,
    this.actualElevationM,
    this.actualDuration,
    this.avgSpeedKmh,
    this.maxAltitudeM,
    this.caloriesBurned,
    this.steps,
    this.trackGeojson,
    this.photos = const [],
    this.gearUsed = const [],
    this.weatherSummary,
    this.safetySettings,
    this.status = 'in_progress',
    this.rating,
    this.notes,
    required this.createdAt,
    this.routeName,
    this.planId,
    this.coverPhotoUrl,
  });

  factory TripModel.fromJson(Map<String, dynamic> json) {
    return TripModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      routeId: json['route_id'] as String?,
      source: json['source'] as String? ?? 'tracked',
      startedAt: DateTime.parse(json['started_at'] as String),
      finishedAt: json['finished_at'] != null
          ? DateTime.parse(json['finished_at'] as String)
          : null,
      actualDistanceKm: _parseNullableDouble(json['actual_distance_km']),
      actualElevationM: _parseNullableDouble(json['actual_elevation_m']),
      actualDuration: json['actual_duration'] != null
          ? _parseInterval(json['actual_duration'])
          : null,
      avgSpeedKmh: _parseNullableDouble(json['avg_speed_kmh']),
      maxAltitudeM: _parseNullableDouble(json['max_altitude_m']),
      caloriesBurned: _parseNullableDouble(json['calories_burned']),
      steps: (json['steps'] as num?)?.toInt(),
      trackGeojson: json['track_geojson'] as Map<String, dynamic>?,
      photos: _parseStringList(json['photos']),
      gearUsed: _parseStringList(json['gear_used']),
      weatherSummary: json['weather_summary'] as Map<String, dynamic>?,
      safetySettings: json['safety_settings'] as Map<String, dynamic>?,
      status: json['status'] as String? ?? 'in_progress',
      rating: (json['rating'] as num?)?.toInt(),
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      routeName: (json['routes'] as Map<String, dynamic>?)?['name'] as String?
          ?? json['route_name'] as String?,
      planId: json['plan_id'] as String?,
      coverPhotoUrl: json['cover_photo_url'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'route_id': routeId,
      'started_at': startedAt.toIso8601String(),
      'finished_at': finishedAt?.toIso8601String(),
      'actual_distance_km': actualDistanceKm,
      'actual_elevation_m': actualElevationM,
      'actual_duration': actualDuration != null
          ? _durationToInterval(actualDuration!)
          : null,
      'avg_speed_kmh': avgSpeedKmh,
      'max_altitude_m': maxAltitudeM,
      'calories_burned': caloriesBurned,
      'steps': steps,
      'track_geojson': trackGeojson,
      'photos': photos,
      'gear_used': gearUsed,
      'weather_summary': weatherSummary,
      'safety_settings': safetySettings,
      'status': status,
      'rating': rating,
      'notes': notes,
      'created_at': createdAt.toIso8601String(),
      'source': source,
      'route_name': routeName,
      'plan_id': planId,
      'cover_photo_url': coverPhotoUrl,
    };
  }

  TripModel copyWith({
    String? id,
    String? userId,
    String? routeId,
    String? source,
    DateTime? startedAt,
    DateTime? finishedAt,
    double? actualDistanceKm,
    double? actualElevationM,
    Duration? actualDuration,
    double? avgSpeedKmh,
    double? maxAltitudeM,
    double? caloriesBurned,
    int? steps,
    Map<String, dynamic>? trackGeojson,
    List<String>? photos,
    List<String>? gearUsed,
    Map<String, dynamic>? weatherSummary,
    Map<String, dynamic>? safetySettings,
    String? status,
    int? rating,
    String? notes,
    DateTime? createdAt,
    String? routeName,
    String? planId,
    String? coverPhotoUrl,
  }) {
    return TripModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      routeId: routeId ?? this.routeId,
      source: source ?? this.source,
      startedAt: startedAt ?? this.startedAt,
      finishedAt: finishedAt ?? this.finishedAt,
      actualDistanceKm: actualDistanceKm ?? this.actualDistanceKm,
      actualElevationM: actualElevationM ?? this.actualElevationM,
      actualDuration: actualDuration ?? this.actualDuration,
      avgSpeedKmh: avgSpeedKmh ?? this.avgSpeedKmh,
      maxAltitudeM: maxAltitudeM ?? this.maxAltitudeM,
      caloriesBurned: caloriesBurned ?? this.caloriesBurned,
      steps: steps ?? this.steps,
      trackGeojson: trackGeojson ?? this.trackGeojson,
      photos: photos ?? this.photos,
      gearUsed: gearUsed ?? this.gearUsed,
      weatherSummary: weatherSummary ?? this.weatherSummary,
      safetySettings: safetySettings ?? this.safetySettings,
      status: status ?? this.status,
      rating: rating ?? this.rating,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
      routeName: routeName ?? this.routeName,
      planId: planId ?? this.planId,
      coverPhotoUrl: coverPhotoUrl ?? this.coverPhotoUrl,
    );
  }

  static double? _parseNullableDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static List<String> _parseStringList(dynamic value) {
    if (value == null) return [];
    if (value is List) return value.cast<String>();
    return [];
  }

  static Duration _parseInterval(dynamic value) {
    if (value == null) return Duration.zero;
    if (value is int) return Duration(seconds: value);
    if (value is String) {
      final str = value.trim();

      final hmsMatch = RegExp(r'^(\d+):(\d+):(\d+)$').firstMatch(str);
      if (hmsMatch != null) {
        return Duration(
          hours: int.parse(hmsMatch.group(1)!),
          minutes: int.parse(hmsMatch.group(2)!),
          seconds: int.parse(hmsMatch.group(3)!),
        );
      }

      int days = 0;
      int hours = 0;
      int minutes = 0;
      int seconds = 0;

      final dayMatch = RegExp(r'(\d+)\s*days?').firstMatch(str);
      if (dayMatch != null) days = int.parse(dayMatch.group(1)!);

      final hourMatch = RegExp(r'(\d+)\s*hours?').firstMatch(str);
      if (hourMatch != null) hours = int.parse(hourMatch.group(1)!);

      final minMatch = RegExp(r'(\d+)\s*minutes?').firstMatch(str);
      if (minMatch != null) minutes = int.parse(minMatch.group(1)!);

      final secMatch = RegExp(r'(\d+)\s*seconds?').firstMatch(str);
      if (secMatch != null) seconds = int.parse(secMatch.group(1)!);

      return Duration(
        days: days,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
      );
    }
    return Duration.zero;
  }

  static String _durationToInterval(Duration d) {
    final parts = <String>[];
    if (d.inDays > 0) {
      parts.add('${d.inDays} ${d.inDays == 1 ? 'day' : 'days'}');
    }
    final hours = d.inHours % 24;
    if (hours > 0) {
      parts.add('$hours ${hours == 1 ? 'hour' : 'hours'}');
    }
    final minutes = d.inMinutes % 60;
    if (minutes > 0) {
      parts.add('$minutes ${minutes == 1 ? 'minute' : 'minutes'}');
    }
    if (parts.isEmpty) {
      final seconds = d.inSeconds % 60;
      parts.add('$seconds ${seconds == 1 ? 'second' : 'seconds'}');
    }
    return parts.join(' ');
  }
}
