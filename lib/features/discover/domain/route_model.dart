class ElevationPoint {
  final double distance;
  final double elevation;

  const ElevationPoint({
    required this.distance,
    required this.elevation,
  });

  factory ElevationPoint.fromJson(Map<String, dynamic> json) {
    return ElevationPoint(
      distance: _parseDouble(json['distance']),
      elevation: _parseDouble(json['elevation']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'distance': distance,
      'elevation': elevation,
    };
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}

class PhotoSpot {
  final double latitude;
  final double longitude;
  final String name;
  final String? description;

  const PhotoSpot({
    required this.latitude,
    required this.longitude,
    required this.name,
    this.description,
  });

  factory PhotoSpot.fromJson(Map<String, dynamic> json) {
    return PhotoSpot(
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
      name: json['name'] as String,
      description: json['description'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'name': name,
      'description': description,
    };
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}

class RouteWaypoint {
  final double latitude;
  final double longitude;

  const RouteWaypoint({required this.latitude, required this.longitude});

  factory RouteWaypoint.fromJson(Map<String, dynamic> json) {
    return RouteWaypoint(
      latitude: _parseDouble(json['lat'] ?? json['latitude']),
      longitude: _parseDouble(json['lng'] ?? json['longitude']),
    );
  }

  Map<String, dynamic> toJson() => {'lat': latitude, 'lng': longitude};

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}

class RouteModel {
  final String id;
  final String creatorId;
  final String name;
  final String? description;
  final double distanceKm;
  final double elevationGainM;
  final Duration estimatedDuration;
  final String difficulty;
  final String? difficultyGrade;
  final double rating;
  final int reviewCount;
  final double latitude;
  final double longitude;
  final String? region;
  final double? maxAltitudeM;
  final bool hasWaterSource;
  final String? accessMethod;
  final String? gpxFileUrl;
  final List<ElevationPoint> elevationProfile;
  final List<PhotoSpot> photoSpots;
  final List<RouteWaypoint> waypoints;
  final List<String> tags;
  final bool isPublished;
  final DateTime createdAt;
  final DateTime updatedAt;

  const RouteModel({
    required this.id,
    required this.creatorId,
    required this.name,
    this.description,
    required this.distanceKm,
    required this.elevationGainM,
    required this.estimatedDuration,
    required this.difficulty,
    this.difficultyGrade,
    this.rating = 0,
    this.reviewCount = 0,
    required this.latitude,
    required this.longitude,
    this.region,
    this.maxAltitudeM,
    this.hasWaterSource = false,
    this.accessMethod,
    this.gpxFileUrl,
    this.elevationProfile = const [],
    this.photoSpots = const [],
    this.waypoints = const [],
    this.tags = const [],
    this.isPublished = true,
    required this.createdAt,
    required this.updatedAt,
  });

  factory RouteModel.fromJson(Map<String, dynamic> json) {
    return RouteModel(
      id: json['id'] as String,
      creatorId: json['creator_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      distanceKm: _parseDouble(json['distance_km']),
      elevationGainM: _parseDouble(json['elevation_gain_m']),
      estimatedDuration: _parseInterval(json['estimated_duration']),
      difficulty: json['difficulty'] as String,
      difficultyGrade: json['difficulty_grade'] as String?,
      rating: _parseDouble(json['rating']),
      reviewCount: (json['review_count'] as num?)?.toInt() ?? 0,
      latitude: _parseDouble(json['latitude']),
      longitude: _parseDouble(json['longitude']),
      region: json['region'] as String?,
      maxAltitudeM: json['max_altitude_m'] != null
          ? _parseDouble(json['max_altitude_m'])
          : null,
      hasWaterSource: json['has_water_source'] as bool? ?? false,
      accessMethod: json['access_method'] as String?,
      gpxFileUrl: json['gpx_file_url'] as String?,
      elevationProfile: _parseElevationProfile(json['elevation_profile']),
      photoSpots: _parsePhotoSpots(json['photo_spots']),
      waypoints: _parseWaypoints(json['waypoints']),
      tags: _parseStringList(json['tags']),
      isPublished: json['is_published'] as bool? ?? true,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'creator_id': creatorId,
      'name': name,
      'description': description,
      'distance_km': distanceKm,
      'elevation_gain_m': elevationGainM,
      'estimated_duration': _durationToInterval(estimatedDuration),
      'difficulty': difficulty,
      'difficulty_grade': difficultyGrade,
      'rating': rating,
      'review_count': reviewCount,
      'latitude': latitude,
      'longitude': longitude,
      'region': region,
      'max_altitude_m': maxAltitudeM,
      'has_water_source': hasWaterSource,
      'access_method': accessMethod,
      'gpx_file_url': gpxFileUrl,
      'elevation_profile':
          elevationProfile.map((e) => e.toJson()).toList(),
      'photo_spots': photoSpots.map((s) => s.toJson()).toList(),
      'waypoints': waypoints.map((w) => w.toJson()).toList(),
      'tags': tags,
      'is_published': isPublished,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  RouteModel copyWith({
    String? id,
    String? creatorId,
    String? name,
    String? description,
    double? distanceKm,
    double? elevationGainM,
    Duration? estimatedDuration,
    String? difficulty,
    String? difficultyGrade,
    double? rating,
    int? reviewCount,
    double? latitude,
    double? longitude,
    String? region,
    double? maxAltitudeM,
    bool? hasWaterSource,
    String? accessMethod,
    String? gpxFileUrl,
    List<ElevationPoint>? elevationProfile,
    List<PhotoSpot>? photoSpots,
    List<RouteWaypoint>? waypoints,
    List<String>? tags,
    bool? isPublished,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return RouteModel(
      id: id ?? this.id,
      creatorId: creatorId ?? this.creatorId,
      name: name ?? this.name,
      description: description ?? this.description,
      distanceKm: distanceKm ?? this.distanceKm,
      elevationGainM: elevationGainM ?? this.elevationGainM,
      estimatedDuration: estimatedDuration ?? this.estimatedDuration,
      difficulty: difficulty ?? this.difficulty,
      difficultyGrade: difficultyGrade ?? this.difficultyGrade,
      rating: rating ?? this.rating,
      reviewCount: reviewCount ?? this.reviewCount,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      region: region ?? this.region,
      maxAltitudeM: maxAltitudeM ?? this.maxAltitudeM,
      hasWaterSource: hasWaterSource ?? this.hasWaterSource,
      accessMethod: accessMethod ?? this.accessMethod,
      gpxFileUrl: gpxFileUrl ?? this.gpxFileUrl,
      elevationProfile: elevationProfile ?? this.elevationProfile,
      photoSpots: photoSpots ?? this.photoSpots,
      waypoints: waypoints ?? this.waypoints,
      tags: tags ?? this.tags,
      isPublished: isPublished ?? this.isPublished,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }

  static List<ElevationPoint> _parseElevationProfile(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      return value
          .map((e) => ElevationPoint.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  static List<PhotoSpot> _parsePhotoSpots(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      return value
          .map((s) => PhotoSpot.fromJson(s as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  static List<RouteWaypoint> _parseWaypoints(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      return value
          .map((w) => RouteWaypoint.fromJson(w as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  static List<String> _parseStringList(dynamic value) {
    if (value == null) return [];
    if (value is List) return value.cast<String>();
    return [];
  }

  /// Parses a PostgreSQL interval string into a Dart [Duration].
  ///
  /// Supports formats like:
  /// - "6 hours"
  /// - "2 hours 30 minutes"
  /// - "7 hours 15 minutes"
  /// - "2 days"
  /// - "1 day 3 hours"
  /// - "01:30:00" (HH:MM:SS)
  static Duration _parseInterval(dynamic value) {
    if (value == null) return Duration.zero;
    if (value is int) return Duration(seconds: value);
    if (value is String) {
      final str = value.trim();

      // Try HH:MM:SS format
      final hmsMatch = RegExp(r'^(\d+):(\d+):(\d+)$').firstMatch(str);
      if (hmsMatch != null) {
        return Duration(
          hours: int.parse(hmsMatch.group(1)!),
          minutes: int.parse(hmsMatch.group(2)!),
          seconds: int.parse(hmsMatch.group(3)!),
        );
      }

      // Parse textual interval
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

/// Alias used by route_repository and other layers.
typedef HikingRoute = RouteModel;
