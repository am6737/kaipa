import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/route_model.dart';

class RouteFilter {
  final String? difficulty;
  final String? region;
  final double? minDistance;
  final double? maxDistance;
  final double? minRating;
  final bool? hasWaterSource;
  final String? sortBy;
  final bool ascending;
  final int limit;
  final int offset;

  const RouteFilter({
    this.difficulty,
    this.region,
    this.minDistance,
    this.maxDistance,
    this.minRating,
    this.hasWaterSource,
    this.sortBy,
    this.ascending = false,
    this.limit = 20,
    this.offset = 0,
  });
}

class RouteRepository {
  final SupabaseClient _client;

  RouteRepository(this._client);

  /// Get a paginated, optionally filtered list of published routes.
  Future<List<RouteModel>> getRoutes({RouteFilter? filter}) async {
    var query = _client
        .from('routes')
        .select()
        .eq('is_published', true);

    if (filter != null) {
      if (filter.difficulty != null) {
        query = query.eq('difficulty', filter.difficulty!);
      }
      if (filter.region != null) {
        query = query.eq('region', filter.region!);
      }
      if (filter.minDistance != null) {
        query = query.gte('distance_km', filter.minDistance!);
      }
      if (filter.maxDistance != null) {
        query = query.lte('distance_km', filter.maxDistance!);
      }
      if (filter.minRating != null) {
        query = query.gte('rating', filter.minRating!);
      }
      if (filter.hasWaterSource != null) {
        query = query.eq('has_water_source', filter.hasWaterSource!);
      }
    }

    final sortColumn = filter?.sortBy ?? 'created_at';
    final ascending = filter?.ascending ?? false;
    final limit = filter?.limit ?? 20;
    final offset = filter?.offset ?? 0;

    final data = await query
        .order(sortColumn, ascending: ascending)
        .range(offset, offset + limit - 1);

    return (data as List)
        .map((row) => RouteModel.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  /// Backwards-compatible fetch that accepts an optional difficulty string.
  Future<List<RouteModel>> fetchRoutes({String? difficulty}) async {
    var query = _client.from('routes').select();
    if (difficulty != null && difficulty.isNotEmpty) {
      query = query.eq('difficulty', difficulty);
    }
    final data = await query.order('rating', ascending: false);
    return (data as List)
        .map((e) => RouteModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Get a single route by ID.
  Future<RouteModel> getRouteById(String id) async {
    final data =
        await _client.from('routes').select().eq('id', id).single();
    return RouteModel.fromJson(data);
  }

  /// Alias for backwards compatibility.
  Future<RouteModel> fetchRouteById(String id) => getRouteById(id);

  /// Full-text search on route name and description.
  Future<List<RouteModel>> searchRoutes(String query) async {
    final data = await _client
        .from('routes')
        .select()
        .eq('is_published', true)
        .or('name.ilike.%$query%,description.ilike.%$query%')
        .order('rating', ascending: false)
        .limit(20);

    return (data as List)
        .map((row) => RouteModel.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<RouteModel> publishRoute({
    required String name,
    String? description,
    required double distanceKm,
    required double elevationGainM,
    required Duration estimatedDuration,
    required String difficulty,
    List<String> tags = const [],
    bool isPublished = true,
    required double latitude,
    required double longitude,
    String? region,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client.from('routes').insert({
      'creator_id': userId,
      'name': name,
      'description': description,
      'distance_km': distanceKm,
      'elevation_gain_m': elevationGainM,
      'estimated_duration': _durationToInterval(estimatedDuration),
      'difficulty': difficulty,
      'tags': tags,
      'is_published': isPublished,
      'latitude': latitude,
      'longitude': longitude,
      'region': region,
    }).select().single();
    return RouteModel.fromJson(data);
  }

  Future<void> createFeedItem({
    required String type,
    required Map<String, dynamic> content,
    String? routeId,
    String? tripId,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    await _client.from('feed_items').insert({
      'user_id': userId,
      'type': type,
      'content': content,
      'route_id': routeId,
      'trip_id': tripId,
    });
  }

  static String _durationToInterval(Duration d) {
    final parts = <String>[];
    if (d.inDays > 0) parts.add('${d.inDays} ${d.inDays == 1 ? 'day' : 'days'}');
    final hours = d.inHours % 24;
    if (hours > 0) parts.add('$hours ${hours == 1 ? 'hour' : 'hours'}');
    final minutes = d.inMinutes % 60;
    if (minutes > 0) parts.add('$minutes ${minutes == 1 ? 'minute' : 'minutes'}');
    if (parts.isEmpty) {
      final seconds = d.inSeconds % 60;
      parts.add('$seconds ${seconds == 1 ? 'second' : 'seconds'}');
    }
    return parts.join(' ');
  }

  /// Upload GPS track data to an existing route.
  Future<void> contributeTrack({
    required String routeId,
    required List<Map<String, dynamic>> waypoints,
    required List<Map<String, dynamic>> elevationProfile,
  }) async {
    await _client.rpc('contribute_route_track', params: {
      'p_route_id': routeId,
      'p_waypoints': waypoints,
      'p_elevation_profile': elevationProfile,
    });
  }
}

final routeRepositoryProvider = Provider<RouteRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return RouteRepository(client);
});

final allRoutesProvider = FutureProvider<List<RouteModel>>((ref) async {
  final repo = ref.watch(routeRepositoryProvider);
  return repo.fetchRoutes();
});

final routeByIdProvider =
    FutureProvider.family<RouteModel, String>((ref, id) async {
  final repo = ref.watch(routeRepositoryProvider);
  return repo.fetchRouteById(id);
});
