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
        .select()
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
}

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return TripRepository(client);
});

final recentTripsProvider = FutureProvider<List<TripModel>>((ref) async {
  final repo = ref.watch(tripRepositoryProvider);
  return repo.fetchRecentTrips(limit: 3);
});

final tripByIdProvider =
    FutureProvider.family<TripModel, String>((ref, id) async {
  final repo = ref.watch(tripRepositoryProvider);
  return repo.fetchTripById(id);
});
