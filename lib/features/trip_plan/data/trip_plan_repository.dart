import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/trip_plan_model.dart';

final tripPlanRepositoryProvider = Provider<TripPlanRepository>((ref) {
  return TripPlanRepository(ref.watch(supabaseProvider));
});

class TripPlanRepository {
  final SupabaseClient _client;

  TripPlanRepository(this._client);

  String get _userId {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) throw Exception('Must be signed in');
    return uid;
  }

  static const _selectWithJoins =
      '*, routes(*), trip_plan_gear(*, gear_items(*))';

  Future<List<TripPlanModel>> getUserPlans() async {
    final uid = _userId;
    final data = await _client
        .from('trip_plans')
        .select(_selectWithJoins)
        .eq('user_id', uid)
        .order('planned_date', ascending: true);

    return (data as List)
        .map((row) => TripPlanModel.fromJson(row))
        .toList();
  }

  Future<TripPlanModel> getPlanById(String planId) async {
    final data = await _client
        .from('trip_plans')
        .select(_selectWithJoins)
        .eq('id', planId)
        .single();

    return TripPlanModel.fromJson(data);
  }

  Future<TripPlanModel> createPlan({
    required String routeId,
    required DateTime plannedDate,
    String? plannedStartTime,
  }) async {
    final uid = _userId;
    final row = await _client
        .from('trip_plans')
        .insert({
          'user_id': uid,
          'route_id': routeId,
          'planned_date': plannedDate.toIso8601String().split('T').first,
          'planned_start_time': plannedStartTime,
          'status': 'draft',
        })
        .select(_selectWithJoins)
        .single();

    return TripPlanModel.fromJson(row);
  }

  Future<TripPlanModel> updatePlan(
      String planId, Map<String, dynamic> updates) async {
    updates['updated_at'] = DateTime.now().toIso8601String();
    final row = await _client
        .from('trip_plans')
        .update(updates)
        .eq('id', planId)
        .select(_selectWithJoins)
        .single();

    return TripPlanModel.fromJson(row);
  }

  Future<void> deletePlan(String planId) async {
    await _client.from('trip_plans').delete().eq('id', planId);
  }

  Future<void> addGearItem({
    required String planId,
    required String gearItemId,
    bool isRecommended = false,
    String? recommendationReason,
  }) async {
    await _client.from('trip_plan_gear').insert({
      'plan_id': planId,
      'gear_item_id': gearItemId,
      'is_recommended': isRecommended,
      'recommendation_reason': recommendationReason,
    });
  }

  Future<void> removeGearItem({
    required String planId,
    required String gearItemId,
  }) async {
    await _client
        .from('trip_plan_gear')
        .delete()
        .eq('plan_id', planId)
        .eq('gear_item_id', gearItemId);
  }

  Future<void> togglePacked({
    required String planId,
    required String gearItemId,
    required bool isPacked,
  }) async {
    await _client
        .from('trip_plan_gear')
        .update({'is_packed': isPacked})
        .eq('plan_id', planId)
        .eq('gear_item_id', gearItemId);
  }

  Future<void> updateWeatherCache({
    required String planId,
    required Map<String, dynamic> weatherData,
  }) async {
    await _client.from('trip_plans').update({
      'weather_cache': weatherData,
      'weather_updated_at': DateTime.now().toIso8601String(),
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', planId);
  }

  Future<List<Map<String, dynamic>>> getCommunityGearStats(
      String routeId) async {
    final data = await _client.rpc('get_community_gear_stats', params: {
      'target_route_id': routeId,
    });
    return (data as List).cast<Map<String, dynamic>>();
  }
}

final tripPlanListProvider =
    FutureProvider<List<TripPlanModel>>((ref) async {
  final repo = ref.watch(tripPlanRepositoryProvider);
  return repo.getUserPlans();
});

final tripPlanDetailProvider =
    FutureProvider.family<TripPlanModel, String>((ref, planId) async {
  final repo = ref.watch(tripPlanRepositoryProvider);
  return repo.getPlanById(planId);
});
