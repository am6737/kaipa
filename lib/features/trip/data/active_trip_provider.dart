import 'package:flutter_riverpod/flutter_riverpod.dart';

class ActiveTrip {
  final String routeId;
  final String? tripId;
  final String routeName;
  final DateTime startedAt;

  const ActiveTrip({
    required this.routeId,
    this.tripId,
    required this.routeName,
    required this.startedAt,
  });
}

final activeTripProvider = StateProvider<ActiveTrip?>((ref) => null);
