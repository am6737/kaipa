import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/navigation_state_model.dart';

final navigationRepositoryProvider =
    Provider<NavigationRepository>((ref) {
  return NavigationRepository();
});

class NavigationRepository {
  StreamController<NavigationPosition>? _positionController;
  Timer? _timer;
  DateTime? _startTime;
  DateTime? _pauseTime;
  Duration _pausedDuration = Duration.zero;
  final List<NavigationPosition> _trackPoints = [];
  double _totalDistanceKm = 0;
  double _totalElevationGainM = 0;
  NavigationStatus _status = NavigationStatus.idle;

  /// Start tracking the user's position.
  ///
  /// Returns a stream of [NavigationPosition] updates.
  Stream<NavigationPosition> startTracking() {
    _positionController?.close();
    _positionController = StreamController<NavigationPosition>.broadcast();
    _trackPoints.clear();
    _totalDistanceKm = 0;
    _totalElevationGainM = 0;
    _startTime = DateTime.now();
    _pausedDuration = Duration.zero;
    _status = NavigationStatus.tracking;

    // Poll position at regular intervals.
    // In production this would use a platform location plugin.
    _timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_status != NavigationStatus.tracking) return;
      _emitCurrentPosition();
    });

    // Emit an initial position immediately
    _emitCurrentPosition();

    return _positionController!.stream;
  }

  /// Stop tracking and clean up resources.
  NavigationStateModel stopTracking() {
    _timer?.cancel();
    _timer = null;
    _status = NavigationStatus.finished;

    final state = buildCurrentState(distanceRemainingKm: 0);

    _positionController?.close();
    _positionController = null;

    return state;
  }

  /// Pause tracking (e.g. during a rest stop).
  void pauseTracking() {
    if (_status != NavigationStatus.tracking) return;
    _status = NavigationStatus.paused;
    _pauseTime = DateTime.now();
  }

  /// Resume tracking after a pause.
  void resumeTracking() {
    if (_status != NavigationStatus.paused) return;
    if (_pauseTime != null) {
      _pausedDuration += DateTime.now().difference(_pauseTime!);
    }
    _pauseTime = null;
    _status = NavigationStatus.tracking;
  }

  /// Get the current position once without starting continuous tracking.
  Future<NavigationPosition> getCurrentPosition() async {
    // In production, this would use a platform location plugin.
    // Returning a placeholder Beijing-area position for development.
    return NavigationPosition(
      latitude: 40.0 + _randomOffset(),
      longitude: 116.0 + _randomOffset(),
      altitude: 500 + _randomOffset() * 100,
      accuracy: 5.0,
      heading: 0,
      speed: 0,
      timestamp: DateTime.now(),
    );
  }

  /// Build a [NavigationStateModel] snapshot from current tracking data.
  NavigationStateModel buildCurrentState({
    double distanceRemainingKm = 0,
    String? routeId,
    String? tripId,
  }) {
    final elapsed = _startTime != null
        ? DateTime.now().difference(_startTime!) - _pausedDuration
        : Duration.zero;

    final avgSpeed = elapsed.inSeconds > 0
        ? _totalDistanceKm / (elapsed.inSeconds / 3600.0)
        : 0.0;

    final currentSpeed =
        _trackPoints.isNotEmpty ? (_trackPoints.last.speed ?? 0) * 3.6 : 0.0;

    final currentAltitude =
        _trackPoints.isNotEmpty ? (_trackPoints.last.altitude ?? 0) : 0.0;

    // Rough calorie estimate: ~60 cal per km for hiking
    final calories = _totalDistanceKm * 60;

    // Rough step estimate: ~1300 steps per km
    final steps = (_totalDistanceKm * 1300).toInt();

    return NavigationStateModel(
      status: _status,
      currentPosition: _trackPoints.isNotEmpty ? _trackPoints.last : null,
      trackPoints: List.unmodifiable(_trackPoints),
      elapsed: elapsed,
      distanceCoveredKm: _totalDistanceKm,
      distanceRemainingKm: distanceRemainingKm,
      elevationGainM: _totalElevationGainM,
      currentAltitudeM: currentAltitude,
      avgSpeedKmh: avgSpeed,
      currentSpeedKmh: currentSpeed,
      steps: steps,
      caloriesBurned: calories,
      routeId: routeId,
      tripId: tripId,
      startedAt: _startTime,
    );
  }

  void _emitCurrentPosition() {
    // Development stub: generates a simulated position.
    // In production, replace with platform location service calls.
    final position = NavigationPosition(
      latitude: 40.0 + _randomOffset(),
      longitude: 116.0 + _randomOffset(),
      altitude: 500 + _randomOffset() * 100,
      accuracy: 5.0 + _randomOffset(),
      heading: _randomOffset() * 360,
      speed: 1.0 + _randomOffset(),
      timestamp: DateTime.now(),
    );

    if (_trackPoints.isNotEmpty) {
      final prev = _trackPoints.last;
      final dist = _haversineDistance(
        prev.latitude,
        prev.longitude,
        position.latitude,
        position.longitude,
      );
      _totalDistanceKm += dist;

      if (position.altitude != null && prev.altitude != null) {
        final elevDiff = position.altitude! - prev.altitude!;
        if (elevDiff > 0) _totalElevationGainM += elevDiff;
      }
    }

    _trackPoints.add(position);
    _positionController?.add(position);
  }

  double _haversineDistance(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const earthRadiusKm = 6371.0;
    final dLat = _toRadians(lat2 - lat1);
    final dLon = _toRadians(lon2 - lon1);

    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRadians(lat1)) *
            math.cos(_toRadians(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);

    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  double _toRadians(double degrees) => degrees * math.pi / 180.0;

  double _randomOffset() {
    // Small random jitter for development simulation
    return (DateTime.now().microsecond % 100) / 10000.0;
  }
}
