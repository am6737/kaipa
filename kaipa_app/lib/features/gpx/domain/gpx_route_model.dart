class GpxPoint {
  final double latitude;
  final double longitude;
  final double? elevation;
  final DateTime? timestamp;

  const GpxPoint({
    required this.latitude,
    required this.longitude,
    this.elevation,
    this.timestamp,
  });

  factory GpxPoint.fromJson(Map<String, dynamic> json) {
    return GpxPoint(
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
      elevation: json['elevation'] != null
          ? _parseDouble(json['elevation'])
          : null,
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'elevation': elevation,
      'timestamp': timestamp?.toIso8601String(),
    };
  }

  GpxPoint copyWith({
    double? latitude,
    double? longitude,
    double? elevation,
    DateTime? timestamp,
  }) {
    return GpxPoint(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      elevation: elevation ?? this.elevation,
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

class GpxRouteStats {
  final double totalDistanceKm;
  final double totalElevationGainM;
  final double totalElevationLossM;
  final double maxElevationM;
  final double minElevationM;
  final Duration? totalDuration;
  final double? avgSpeedKmh;

  const GpxRouteStats({
    required this.totalDistanceKm,
    required this.totalElevationGainM,
    required this.totalElevationLossM,
    required this.maxElevationM,
    required this.minElevationM,
    this.totalDuration,
    this.avgSpeedKmh,
  });

  factory GpxRouteStats.fromJson(Map<String, dynamic> json) {
    return GpxRouteStats(
      totalDistanceKm: _parseDouble(json['total_distance_km']),
      totalElevationGainM: _parseDouble(json['total_elevation_gain_m']),
      totalElevationLossM: _parseDouble(json['total_elevation_loss_m']),
      maxElevationM: _parseDouble(json['max_elevation_m']),
      minElevationM: _parseDouble(json['min_elevation_m']),
      totalDuration: json['total_duration_seconds'] != null
          ? Duration(seconds: (json['total_duration_seconds'] as num).toInt())
          : null,
      avgSpeedKmh: json['avg_speed_kmh'] != null
          ? _parseDouble(json['avg_speed_kmh'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'total_distance_km': totalDistanceKm,
      'total_elevation_gain_m': totalElevationGainM,
      'total_elevation_loss_m': totalElevationLossM,
      'max_elevation_m': maxElevationM,
      'min_elevation_m': minElevationM,
      'total_duration_seconds': totalDuration?.inSeconds,
      'avg_speed_kmh': avgSpeedKmh,
    };
  }

  GpxRouteStats copyWith({
    double? totalDistanceKm,
    double? totalElevationGainM,
    double? totalElevationLossM,
    double? maxElevationM,
    double? minElevationM,
    Duration? totalDuration,
    double? avgSpeedKmh,
  }) {
    return GpxRouteStats(
      totalDistanceKm: totalDistanceKm ?? this.totalDistanceKm,
      totalElevationGainM: totalElevationGainM ?? this.totalElevationGainM,
      totalElevationLossM: totalElevationLossM ?? this.totalElevationLossM,
      maxElevationM: maxElevationM ?? this.maxElevationM,
      minElevationM: minElevationM ?? this.minElevationM,
      totalDuration: totalDuration ?? this.totalDuration,
      avgSpeedKmh: avgSpeedKmh ?? this.avgSpeedKmh,
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

class GpxRouteModel {
  final String? name;
  final String? description;
  final List<GpxPoint> points;
  final GpxRouteStats stats;
  final DateTime? createdAt;

  const GpxRouteModel({
    this.name,
    this.description,
    required this.points,
    required this.stats,
    this.createdAt,
  });

  factory GpxRouteModel.fromJson(Map<String, dynamic> json) {
    return GpxRouteModel(
      name: json['name'] as String?,
      description: json['description'] as String?,
      points: (json['points'] as List<dynamic>?)
              ?.map((p) => GpxPoint.fromJson(p as Map<String, dynamic>))
              .toList() ??
          [],
      stats: GpxRouteStats.fromJson(
          json['stats'] as Map<String, dynamic>? ?? {}),
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'description': description,
      'points': points.map((p) => p.toJson()).toList(),
      'stats': stats.toJson(),
      'created_at': createdAt?.toIso8601String(),
    };
  }

  GpxRouteModel copyWith({
    String? name,
    String? description,
    List<GpxPoint>? points,
    GpxRouteStats? stats,
    DateTime? createdAt,
  }) {
    return GpxRouteModel(
      name: name ?? this.name,
      description: description ?? this.description,
      points: points ?? this.points,
      stats: stats ?? this.stats,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
