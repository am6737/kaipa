class GearTripSummary {
  final String tripId;
  final String routeName;
  final DateTime startedAt;
  final double distanceKm;
  final int elevationM;
  final String difficulty;

  const GearTripSummary({
    required this.tripId,
    required this.routeName,
    required this.startedAt,
    required this.distanceKm,
    required this.elevationM,
    required this.difficulty,
  });

  factory GearTripSummary.fromJson(Map<String, dynamic> json) {
    final route = json['routes'] as Map<String, dynamic>? ?? {};
    return GearTripSummary(
      tripId: json['id'] as String,
      routeName: route['name'] as String? ?? '未知路线',
      startedAt: DateTime.parse(json['started_at'] as String),
      distanceKm: (json['actual_distance_km'] as num?)?.toDouble() ?? 0,
      elevationM: (json['actual_elevation_m'] as num?)?.toInt() ?? 0,
      difficulty: route['difficulty'] as String? ?? 'moderate',
    );
  }
}
