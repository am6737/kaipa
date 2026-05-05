import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/gpx_route_model.dart';

final gpxRepositoryProvider = Provider<GpxRepository>((ref) {
  return GpxRepository(ref.watch(supabaseProvider));
});

class GpxRepository {
  final SupabaseClient _client;

  GpxRepository(this._client);

  /// Parse a GPX or KML file from [filePath] into a [GpxRouteModel].
  ///
  /// Detects format by file extension. Extracts track points, calculates
  /// distance, elevation gain/loss, and speed statistics.
  Future<GpxRouteModel> parseGpxFile(String filePath) async {
    final file = File(filePath);
    final content = await file.readAsString();
    if (filePath.toLowerCase().endsWith('.kml')) {
      return _parseKmlString(content);
    }
    return _parseGpxString(content);
  }

  /// Parse raw GPX XML content into a [GpxRouteModel].
  GpxRouteModel _parseGpxString(String gpxContent) {
    String? name;
    String? description;
    final points = <GpxPoint>[];

    // Extract metadata name
    final nameMatch = RegExp(r'<name>(.*?)</name>').firstMatch(gpxContent);
    if (nameMatch != null) {
      name = nameMatch.group(1);
    }

    // Extract metadata description
    final descMatch = RegExp(r'<desc>(.*?)</desc>').firstMatch(gpxContent);
    if (descMatch != null) {
      description = descMatch.group(1);
    }

    // Extract track points
    final trkptPattern = RegExp(
      r'<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(.*?)</trkpt>',
      dotAll: true,
    );

    for (final match in trkptPattern.allMatches(gpxContent)) {
      final lat = double.tryParse(match.group(1) ?? '') ?? 0;
      final lon = double.tryParse(match.group(2) ?? '') ?? 0;
      final inner = match.group(3) ?? '';

      double? elevation;
      final eleMatch = RegExp(r'<ele>(.*?)</ele>').firstMatch(inner);
      if (eleMatch != null) {
        elevation = double.tryParse(eleMatch.group(1) ?? '');
      }

      DateTime? timestamp;
      final timeMatch = RegExp(r'<time>(.*?)</time>').firstMatch(inner);
      if (timeMatch != null) {
        timestamp = DateTime.tryParse(timeMatch.group(1) ?? '');
      }

      points.add(GpxPoint(
        latitude: lat,
        longitude: lon,
        elevation: elevation,
        timestamp: timestamp,
      ));
    }

    final stats = _calculateStats(points);

    return GpxRouteModel(
      name: name,
      description: description,
      points: points,
      stats: stats,
      createdAt: DateTime.now(),
    );
  }

  /// Parse KML XML content into a [GpxRouteModel].
  GpxRouteModel _parseKmlString(String kmlContent) {
    String? name;
    String? description;
    final points = <GpxPoint>[];

    // Extract Document name
    final docNameMatch =
        RegExp(r'<Document>.*?<name>(.*?)</name>', dotAll: true)
            .firstMatch(kmlContent);
    if (docNameMatch != null) {
      name = docNameMatch.group(1);
    }

    // Extract description
    final descMatch =
        RegExp(r'<description>(.*?)</description>', dotAll: true)
            .firstMatch(kmlContent);
    if (descMatch != null) {
      description = descMatch.group(1);
    }

    // Try Placemark name as fallback
    name ??= RegExp(r'<Placemark>.*?<name>(.*?)</name>', dotAll: true)
        .firstMatch(kmlContent)
        ?.group(1);

    // Extract coordinates from all LineString elements
    // KML format: lon,lat,elev space lon,lat,elev ...
    final coordsPattern =
        RegExp(r'<coordinates>(.*?)</coordinates>', dotAll: true);

    for (final match in coordsPattern.allMatches(kmlContent)) {
      final coordBlock = match.group(1)?.trim() ?? '';
      final coordLines = coordBlock.split(RegExp(r'\s+'));

      for (final line in coordLines) {
        final parts = line.trim().split(',');
        if (parts.length < 2) continue;

        final lon = double.tryParse(parts[0]);
        final lat = double.tryParse(parts[1]);
        if (lat == null || lon == null) continue;

        final elevation =
            parts.length >= 3 ? double.tryParse(parts[2]) : null;

        points.add(GpxPoint(
          latitude: lat,
          longitude: lon,
          elevation: elevation,
        ));
      }
    }

    final stats = _calculateStats(points);

    return GpxRouteModel(
      name: name,
      description: description,
      points: points,
      stats: stats,
      createdAt: DateTime.now(),
    );
  }

  /// Calculate route statistics from a list of track points.
  GpxRouteStats _calculateStats(List<GpxPoint> points) {
    if (points.isEmpty) {
      return const GpxRouteStats(
        totalDistanceKm: 0,
        totalElevationGainM: 0,
        totalElevationLossM: 0,
        maxElevationM: 0,
        minElevationM: 0,
      );
    }

    double totalDistance = 0;
    double elevationGain = 0;
    double elevationLoss = 0;
    double maxElevation = points.first.elevation ?? 0;
    double minElevation = points.first.elevation ?? double.infinity;

    for (int i = 1; i < points.length; i++) {
      final prev = points[i - 1];
      final curr = points[i];

      totalDistance += _haversineDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );

      if (curr.elevation != null && prev.elevation != null) {
        final elevDiff = curr.elevation! - prev.elevation!;
        if (elevDiff > 0) {
          elevationGain += elevDiff;
        } else {
          elevationLoss += elevDiff.abs();
        }
      }

      if (curr.elevation != null) {
        if (curr.elevation! > maxElevation) maxElevation = curr.elevation!;
        if (curr.elevation! < minElevation) minElevation = curr.elevation!;
      }
    }

    if (minElevation == double.infinity) minElevation = 0;

    Duration? totalDuration;
    double? avgSpeed;

    if (points.first.timestamp != null && points.last.timestamp != null) {
      totalDuration =
          points.last.timestamp!.difference(points.first.timestamp!);
      if (totalDuration.inSeconds > 0) {
        avgSpeed = totalDistance / (totalDuration.inSeconds / 3600.0);
      }
    }

    return GpxRouteStats(
      totalDistanceKm: totalDistance,
      totalElevationGainM: elevationGain,
      totalElevationLossM: elevationLoss,
      maxElevationM: maxElevation,
      minElevationM: minElevation,
      totalDuration: totalDuration,
      avgSpeedKmh: avgSpeed,
    );
  }

  /// Calculate distance between two coordinates using the Haversine formula.
  /// Returns distance in kilometres.
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

  List<GpxPoint> _downsamplePoints(List<GpxPoint> points, int maxPoints) {
    if (points.length <= maxPoints) return points;
    final step = points.length / maxPoints;
    final result = <GpxPoint>[];
    for (int i = 0; i < maxPoints; i++) {
      result.add(points[(i * step).floor()]);
    }
    if (result.last != points.last) result.add(points.last);
    return result;
  }

  /// Save a parsed GPX route to the database as a new route.
  Future<void> saveRoute({
    required GpxRouteModel gpxRoute,
    required String name,
    String? description,
    required String difficulty,
    String? region,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to save a route');
    }

    final firstPoint = gpxRoute.points.isNotEmpty ? gpxRoute.points.first : null;

    final elevationProfile = gpxRoute.points
        .map((p) => {
              'distance': 0.0, // simplified; real impl would compute cumulative
              'elevation': p.elevation ?? 0,
            })
        .toList();

    final waypoints = _downsamplePoints(gpxRoute.points, 200)
        .map((p) => {'lat': p.latitude, 'lng': p.longitude})
        .toList();

    final routeData = {
      'creator_id': userId,
      'name': name,
      'description': description ?? gpxRoute.description,
      'distance_km': gpxRoute.stats.totalDistanceKm,
      'elevation_gain_m': gpxRoute.stats.totalElevationGainM,
      'estimated_duration':
          '${(gpxRoute.stats.totalDistanceKm / 3.0).ceil()} hours',
      'difficulty': difficulty,
      'latitude': firstPoint?.latitude ?? 0,
      'longitude': firstPoint?.longitude ?? 0,
      'region': region,
      'max_altitude_m': gpxRoute.stats.maxElevationM,
      'elevation_profile': elevationProfile,
      'waypoints': waypoints,
      'tags': <String>[],
    };

    await _client.from('routes').insert(routeData);
  }
}
