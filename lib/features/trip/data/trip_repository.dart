import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/supabase/supabase_provider.dart';
import '../domain/trip_model.dart';

class TripRepository {
  final SupabaseClient _client;

  TripRepository(this._client);

  Future<List<TripModel>> fetchUserTrips({int limit = 20}) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client
        .from('trips')
        .select('*, routes!left(name)')
        .eq('user_id', userId)
        .order('started_at', ascending: false)
        .limit(limit);
    return (data as List)
        .map((e) => TripModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TripModel>> fetchRecentTrips({int limit = 3}) async {
    return fetchUserTrips(limit: limit);
  }

  Future<TripModel> fetchTripById(String id) async {
    final data =
        await _client.from('trips').select().eq('id', id).single();
    return TripModel.fromJson(data);
  }

  Future<TripModel> createTrip({
    required String routeId,
    List<String> gearUsed = const [],
    Map<String, dynamic>? weatherSummary,
    Map<String, dynamic>? safetySettings,
    String? planId,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final insert = <String, dynamic>{
      'user_id': userId,
      'route_id': routeId,
      'gear_used': gearUsed,
      'weather_summary': weatherSummary,
      'safety_settings': safetySettings,
      'status': 'in_progress',
    };
    if (planId != null) insert['plan_id'] = planId;
    final data = await _client.from('trips').insert(insert).select().single();
    return TripModel.fromJson(data);
  }

  Future<TripModel> createManualTrip({
    required String routeName,
    required DateTime date,
    double? distanceKm,
    double? elevationM,
    Duration? duration,
    int? rating,
    String? notes,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');

    final data = await _client.from('trips').insert({
      'user_id': userId,
      'route_name': routeName,
      'started_at': date.toIso8601String(),
      'finished_at': date.toIso8601String(),
      'actual_distance_km': distanceKm,
      'actual_elevation_m': elevationM,
      'actual_duration': duration != null ? _durationToInterval(duration) : null,
      'rating': rating,
      'notes': notes,
      'status': 'completed',
      'source': 'manual',
    }).select().single();

    // Update profile stats
    await _client.from('profiles').select('total_trips, total_distance_km, total_elevation_m').eq('id', userId).single().then((profile) async {
      await _client.from('profiles').update({
        'total_trips': ((profile['total_trips'] as num?)?.toInt() ?? 0) + 1,
        'total_distance_km': ((profile['total_distance_km'] as num?)?.toDouble() ?? 0) + (distanceKm ?? 0),
        'total_elevation_m': ((profile['total_elevation_m'] as num?)?.toDouble() ?? 0) + (elevationM ?? 0),
      }).eq('id', userId);
    });

    return TripModel.fromJson(data);
  }

  Future<void> completeTrip(
    String tripId, {
    required double distanceKm,
    required double elevationM,
    required Duration duration,
    required double avgSpeedKmh,
  }) async {
    await _client.from('trips').update({
      'status': 'completed',
      'finished_at': DateTime.now().toIso8601String(),
      'actual_distance_km': distanceKm,
      'actual_elevation_m': elevationM,
      'actual_duration': _durationToInterval(duration),
      'avg_speed_kmh': avgSpeedKmh,
    }).eq('id', tripId);

    // Update profile stats
    final userId = _client.auth.currentUser?.id;
    if (userId != null) {
      final profile = await _client
          .from('profiles')
          .select('total_trips, total_distance_km, total_elevation_m')
          .eq('id', userId)
          .single();
      await _client.from('profiles').update({
        'total_trips': ((profile['total_trips'] as num?)?.toInt() ?? 0) + 1,
        'total_distance_km':
            ((profile['total_distance_km'] as num?)?.toDouble() ?? 0) + distanceKm,
        'total_elevation_m':
            ((profile['total_elevation_m'] as num?)?.toDouble() ?? 0) + elevationM,
      }).eq('id', userId);
    }
  }

  Future<void> rateTrip(String tripId, int rating, String? notes) async {
    await _client.from('trips').update({
      'rating': rating,
      'notes': notes,
    }).eq('id', tripId);
  }

  Future<void> deleteTrip(String tripId) async {
    await _client.from('trips').delete().eq('id', tripId);
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
}

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return TripRepository(client);
});

final recentTripsProvider = FutureProvider<List<TripModel>>((ref) async {
  final repo = ref.watch(tripRepositoryProvider);
  return repo.fetchRecentTrips(limit: 3);
});

final allTripsProvider = FutureProvider<List<TripModel>>((ref) async {
  final repo = ref.watch(tripRepositoryProvider);
  return repo.fetchUserTrips(limit: 500);
});

final tripByIdProvider =
    FutureProvider.family<TripModel, String>((ref, id) async {
  final repo = ref.watch(tripRepositoryProvider);
  return repo.fetchTripById(id);
});
