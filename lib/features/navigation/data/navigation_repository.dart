import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../domain/navigation_state_model.dart';
import 'location_service.dart';

final locationServiceProvider = Provider<LocationService>((ref) {
  return LocationService();
});

final navigationRepositoryProvider =
    Provider<NavigationRepository>((ref) {
  return NavigationRepository(ref.watch(locationServiceProvider));
});

class NavigationRepository {
  final LocationService _locationService;

  NavigationRepository(this._locationService);

  StreamController<NavigationPosition>? _positionController;
  StreamSubscription<Position>? _positionSubscription;
  DateTime? _startTime;
  DateTime? _pauseTime;
  Duration _pausedDuration = Duration.zero;
  final List<NavigationPosition> _trackPoints = [];
  double _totalDistanceKm = 0;
  double _totalElevationGainM = 0;
  NavigationStatus _status = NavigationStatus.idle;

  /// Start tracking the user's position with real device GPS.
  ///
  /// Returns a stream of [NavigationPosition] updates.
  /// Checks and requests location permission before starting.
  Stream<NavigationPosition> startTracking() {
    _positionController?.close();
    _positionController = StreamController<NavigationPosition>.broadcast();
    _trackPoints.clear();
    _totalDistanceKm = 0;
    _totalElevationGainM = 0;
    _startTime = DateTime.now();
    _pausedDuration = Duration.zero;
    _status = NavigationStatus.tracking;

    _startPositionStream();

    return _positionController!.stream;
  }

  Future<void> _startPositionStream() async {
    // On Android, pre-check permission and GPS before subscribing.
    // On web, skip pre-checks — the browser prompts only when the stream
    // is actually subscribed.
    if (!kIsWeb) {
      var permission = await _locationService.checkPermission();
      if (permission == LocationPermissionStatus.denied ||
          permission == LocationPermissionStatus.unableToDetermine) {
        permission = await _locationService.requestPermission();
      }

      if (permission != LocationPermissionStatus.granted) {
        _positionController?.addError(
          Exception('Location permission not granted'),
        );
        return;
      }

      final enabled = await _locationService.isServiceEnabled;
      if (!enabled) {
        _positionController?.addError(
          Exception('Location service is disabled'),
        );
        return;
      }
    }

    // Subscribe to real GPS position stream
    _positionSubscription = _locationService
        .getPositionStream(distanceFilterMeters: 5)
        .listen(
      (position) {
        if (_status != NavigationStatus.tracking) return;
        _onPositionUpdate(position);
      },
      onError: (error) {
        _positionController?.addError(error);
      },
    );
  }

  /// Stop tracking and clean up resources.
  NavigationStateModel stopTracking() {
    _positionSubscription?.cancel();
    _positionSubscription = null;
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
    final position = await _locationService.getCurrentPosition();
    return _toNavigationPosition(position);
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

    final calories = _totalDistanceKm * 60;
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

  void _onPositionUpdate(Position position) {
    final navPosition = _toNavigationPosition(position);

    if (_trackPoints.isNotEmpty) {
      final prev = _trackPoints.last;
      final dist = _haversineDistance(
        prev.latitude,
        prev.longitude,
        navPosition.latitude,
        navPosition.longitude,
      );
      _totalDistanceKm += dist;

      if (navPosition.altitude != null && prev.altitude != null) {
        final elevDiff = navPosition.altitude! - prev.altitude!;
        if (elevDiff > 0) _totalElevationGainM += elevDiff;
      }
    }

    _trackPoints.add(navPosition);
    _positionController?.add(navPosition);
  }

  NavigationPosition _toNavigationPosition(Position position) {
    return NavigationPosition(
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: position.altitude,
      accuracy: position.accuracy,
      heading: position.heading,
      speed: position.speed,
      timestamp: position.timestamp,
    );
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
}
