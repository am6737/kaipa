class NavigationPosition {
  final double latitude;
  final double longitude;
  final double? altitude;
  final double? accuracy;
  final double? heading;
  final double? speed;
  final DateTime timestamp;

  const NavigationPosition({
    required this.latitude,
    required this.longitude,
    this.altitude,
    this.accuracy,
    this.heading,
    this.speed,
    required this.timestamp,
  });

  factory NavigationPosition.fromJson(Map<String, dynamic> json) {
    return NavigationPosition(
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
      altitude: json['altitude'] != null
          ? _parseDouble(json['altitude'])
          : null,
      accuracy: json['accuracy'] != null
          ? _parseDouble(json['accuracy'])
          : null,
      heading: json['heading'] != null
          ? _parseDouble(json['heading'])
          : null,
      speed: json['speed'] != null
          ? _parseDouble(json['speed'])
          : null,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'altitude': altitude,
      'accuracy': accuracy,
      'heading': heading,
      'speed': speed,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  NavigationPosition copyWith({
    double? latitude,
    double? longitude,
    double? altitude,
    double? accuracy,
    double? heading,
    double? speed,
    DateTime? timestamp,
  }) {
    return NavigationPosition(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      altitude: altitude ?? this.altitude,
      accuracy: accuracy ?? this.accuracy,
      heading: heading ?? this.heading,
      speed: speed ?? this.speed,
      timestamp: timestamp ?? this.timestamp,
    );
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}

enum NavigationStatus {
  idle,
  tracking,
  paused,
  finished;

  static NavigationStatus fromString(String value) {
    switch (value) {
      case 'tracking':
        return NavigationStatus.tracking;
      case 'paused':
        return NavigationStatus.paused;
      case 'finished':
        return NavigationStatus.finished;
      default:
        return NavigationStatus.idle;
    }
  }
}

class NavigationStateModel {
  final NavigationStatus status;
  final NavigationPosition? currentPosition;
  final List<NavigationPosition> trackPoints;
  final Duration elapsed;
  final double distanceCoveredKm;
  final double distanceRemainingKm;
  final double elevationGainM;
  final double currentAltitudeM;
  final double avgSpeedKmh;
  final double currentSpeedKmh;
  final int steps;
  final double caloriesBurned;
  final String? routeId;
  final String? tripId;
  final DateTime? startedAt;

  const NavigationStateModel({
    this.status = NavigationStatus.idle,
    this.currentPosition,
    this.trackPoints = const [],
    this.elapsed = Duration.zero,
    this.distanceCoveredKm = 0,
    this.distanceRemainingKm = 0,
    this.elevationGainM = 0,
    this.currentAltitudeM = 0,
    this.avgSpeedKmh = 0,
    this.currentSpeedKmh = 0,
    this.steps = 0,
    this.caloriesBurned = 0,
    this.routeId,
    this.tripId,
    this.startedAt,
  });

  bool get isTracking => status == NavigationStatus.tracking;
  bool get isPaused => status == NavigationStatus.paused;
  bool get isIdle => status == NavigationStatus.idle;
  bool get isFinished => status == NavigationStatus.finished;

  factory NavigationStateModel.fromJson(Map<String, dynamic> json) {
    return NavigationStateModel(
      status: NavigationStatus.fromString(json['status'] as String? ?? 'idle'),
      currentPosition: json['current_position'] != null
          ? NavigationPosition.fromJson(
              json['current_position'] as Map<String, dynamic>)
          : null,
      trackPoints: (json['track_points'] as List<dynamic>?)
              ?.map(
                  (p) => NavigationPosition.fromJson(p as Map<String, dynamic>))
              .toList() ??
          [],
      elapsed: Duration(seconds: (json['elapsed_seconds'] as num?)?.toInt() ?? 0),
      distanceCoveredKm: _parseDouble(json['distance_covered_km']),
      distanceRemainingKm: _parseDouble(json['distance_remaining_km']),
      elevationGainM: _parseDouble(json['elevation_gain_m']),
      currentAltitudeM: _parseDouble(json['current_altitude_m']),
      avgSpeedKmh: _parseDouble(json['avg_speed_kmh']),
      currentSpeedKmh: _parseDouble(json['current_speed_kmh']),
      steps: (json['steps'] as num?)?.toInt() ?? 0,
      caloriesBurned: _parseDouble(json['calories_burned']),
      routeId: json['route_id'] as String?,
      tripId: json['trip_id'] as String?,
      startedAt: json['started_at'] != null
          ? DateTime.parse(json['started_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status.name,
      'current_position': currentPosition?.toJson(),
      'track_points': trackPoints.map((p) => p.toJson()).toList(),
      'elapsed_seconds': elapsed.inSeconds,
      'distance_covered_km': distanceCoveredKm,
      'distance_remaining_km': distanceRemainingKm,
      'elevation_gain_m': elevationGainM,
      'current_altitude_m': currentAltitudeM,
      'avg_speed_kmh': avgSpeedKmh,
      'current_speed_kmh': currentSpeedKmh,
      'steps': steps,
      'calories_burned': caloriesBurned,
      'route_id': routeId,
      'trip_id': tripId,
      'started_at': startedAt?.toIso8601String(),
    };
  }

  NavigationStateModel copyWith({
    NavigationStatus? status,
    NavigationPosition? currentPosition,
    List<NavigationPosition>? trackPoints,
    Duration? elapsed,
    double? distanceCoveredKm,
    double? distanceRemainingKm,
    double? elevationGainM,
    double? currentAltitudeM,
    double? avgSpeedKmh,
    double? currentSpeedKmh,
    int? steps,
    double? caloriesBurned,
    String? routeId,
    String? tripId,
    DateTime? startedAt,
  }) {
    return NavigationStateModel(
      status: status ?? this.status,
      currentPosition: currentPosition ?? this.currentPosition,
      trackPoints: trackPoints ?? this.trackPoints,
      elapsed: elapsed ?? this.elapsed,
      distanceCoveredKm: distanceCoveredKm ?? this.distanceCoveredKm,
      distanceRemainingKm: distanceRemainingKm ?? this.distanceRemainingKm,
      elevationGainM: elevationGainM ?? this.elevationGainM,
      currentAltitudeM: currentAltitudeM ?? this.currentAltitudeM,
      avgSpeedKmh: avgSpeedKmh ?? this.avgSpeedKmh,
      currentSpeedKmh: currentSpeedKmh ?? this.currentSpeedKmh,
      steps: steps ?? this.steps,
      caloriesBurned: caloriesBurned ?? this.caloriesBurned,
      routeId: routeId ?? this.routeId,
      tripId: tripId ?? this.tripId,
      startedAt: startedAt ?? this.startedAt,
    );
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}
