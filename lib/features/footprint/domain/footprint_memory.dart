import '../../trip/domain/trip_model.dart';

class FootprintMemory {
  final TripModel trip;
  final String? routeName;
  final String? routeDifficulty;
  final double? routeDistanceKm;
  final double? routeElevationM;
  final bool isManual;
  final double latitude;
  final double longitude;

  const FootprintMemory({
    required this.trip,
    this.routeName,
    this.routeDifficulty,
    this.routeDistanceKm,
    this.routeElevationM,
    this.isManual = false,
    required this.latitude,
    required this.longitude,
  });

  String get displayName {
    if (trip.routeName != null && trip.routeName!.isNotEmpty) return trip.routeName!;
    final d = trip.startedAt;
    return '${d.month}月${d.day}日 徒步';
  }

  String get dateLabel {
    final d = trip.startedAt;
    return '${d.year}.${d.month.toString().padLeft(2, '0')}.${d.day.toString().padLeft(2, '0')}';
  }
}
