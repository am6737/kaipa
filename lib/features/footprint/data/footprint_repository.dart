import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/supabase/supabase_provider.dart';
import '../domain/footprint_memory.dart';
import '../../trip/domain/trip_model.dart';

class FootprintRepository {
  final SupabaseClient _client;

  FootprintRepository(this._client);

  /// Fetch all completed trips with route info for footprint map display.
  Future<List<FootprintMemory>> fetchMemories() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');

    final data = await _client
        .from('trips')
        .select('*, routes!left(name, difficulty, distance_km, elevation_gain_m, latitude, longitude)')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('started_at', ascending: false)
        .limit(5);

    final memories = <FootprintMemory>[];
    for (final row in (data as List)) {
      final trip = TripModel.fromJson(row as Map<String, dynamic>);
      final routeData = row['routes'] as Map<String, dynamic>?;

      final double? lat;
      final double? lng;

      if (routeData != null && routeData['latitude'] != null) {
        lat = _parseDouble(routeData['latitude']);
        lng = _parseDouble(routeData['longitude']);
      } else if (trip.trackGeojson != null) {
        final c = _firstCoordFromGeojson(trip.trackGeojson!);
        lat = c?.$1;
        lng = c?.$2;
      } else {
        continue; // no coordinates available
      }

      if (lat == null || lng == null) continue;

      memories.add(FootprintMemory(
        trip: trip,
        routeName: trip.routeName ?? routeData?['name'] as String?,
        routeDifficulty: routeData?['difficulty'] as String?,
        routeDistanceKm: routeData != null ? _parseDouble(routeData['distance_km']) : null,
        routeElevationM: routeData != null ? _parseDouble(routeData['elevation_gain_m']) : null,
        isManual: trip.source == 'manual',
        latitude: lat,
        longitude: lng,
      ));
    }
    return memories;
  }

  /// Set the cover photo for a trip footprint.
  Future<String> uploadCoverPhoto({
    required String tripId,
    required String filePath,
    required String fileName,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final ext = fileName.split('.').last;
    final storagePath = '$userId/$tripId-${DateTime.now().millisecondsSinceEpoch}.$ext';
    await _client.storage.from('covers').upload(storagePath, File(filePath));
    final url = _client.storage.from('covers').getPublicUrl(storagePath);
    await _client.from('trips').update({'cover_photo_url': url}).eq('id', tripId);
    return url;
  }

  /// Set the cover photo from an existing trip photo URL.
  /// Pass null to reset to default.
  Future<void> setCoverPhoto({
    required String tripId,
    required String? photoUrl,
  }) async {
    await _client.from('trips').update({'cover_photo_url': photoUrl}).eq('id', tripId);
  }

  /// Upload a photo to the trip memory.
  Future<String> uploadPhoto({
    required String tripId,
    required String filePath,
    required String fileName,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final ext = fileName.split('.').last;
    final storagePath = '$userId/$tripId-${DateTime.now().millisecondsSinceEpoch}.$ext';
    await _client.storage.from('memories').upload(storagePath, File(filePath));
    final url = _client.storage.from('memories').getPublicUrl(storagePath);
    return url;
  }

  /// Update trip notes and photos.
  Future<void> updateMemory({
    required String tripId,
    String? notes,
    List<String>? photos,
  }) async {
    final updates = <String, dynamic>{};
    if (notes != null) updates['notes'] = notes;
    if (photos != null) updates['photos'] = photos;
    if (updates.isNotEmpty) {
      await _client.from('trips').update(updates).eq('id', tripId);
    }
  }

  /// Remove a photo URL from a trip's photos list.
  Future<void> removePhoto({
    required String tripId,
    required String photoUrl,
    required List<String> currentPhotos,
  }) async {
    final updated = currentPhotos.where((p) => p != photoUrl).toList();
    await _client.from('trips').update({'photos': updated}).eq('id', tripId);
  }

  /// Publish a trip memory to the community feed.
  Future<void> shareToFeed({
    required String tripId,
    String? routeId,
    required Map<String, dynamic> content,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    await _client.from('feed_items').insert({
      'user_id': userId,
      'type': 'trip_share',
      'content': content,
      'route_id': routeId,
      'trip_id': tripId,
    });
  }

  static double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  /// Fetch all completed trips for a specific route (for trip switcher).
  Future<List<TripModel>> fetchTripsByRouteId(String routeId) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client
        .from('trips')
        .select()
        .eq('user_id', userId)
        .eq('route_id', routeId)
        .eq('status', 'completed')
        .order('started_at', ascending: false)
        .limit(20);
    return (data as List).map((e) => TripModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Extract the first coordinate from a GeoJSON object.
  static (double, double)? _firstCoordFromGeojson(Map<String, dynamic> geojson) {
    try {
      final type = geojson['type'] as String?;
      dynamic coords;
      if (type == 'FeatureCollection') {
        final features = geojson['features'] as List?;
        if (features == null || features.isEmpty) return null;
        final geom = (features[0] as Map)['geometry'] as Map<String, dynamic>?;
        coords = geom?['coordinates'];
      } else if (type == 'Feature') {
        final geom = geojson['geometry'] as Map<String, dynamic>?;
        coords = geom?['coordinates'];
      } else if (type == 'LineString') {
        coords = geojson['coordinates'];
      }
      if (coords is List && coords.isNotEmpty) {
        final first = coords[0];
        if (first is List && first.length >= 2) {
          return (_parseDouble(first[0]) ?? 0, _parseDouble(first[1]) ?? 0);
        }
      }
    } catch (_) {}
    return null;
  }
}

final footprintRepositoryProvider = Provider<FootprintRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return FootprintRepository(client);
});

final footprintMemoriesProvider = FutureProvider<List<FootprintMemory>>((ref) async {
  final repo = ref.watch(footprintRepositoryProvider);
  return repo.fetchMemories();
});

final tripsByRouteProvider = FutureProvider.family<List<TripModel>, String>((ref, routeId) async {
  final repo = ref.watch(footprintRepositoryProvider);
  return repo.fetchTripsByRouteId(routeId);
});
