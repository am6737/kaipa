import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../discover/domain/route_model.dart';
import '../../gear/data/gear_repository.dart';
import '../../gear/domain/gear_item_model.dart';
import '../domain/gear_recommendation.dart';
import '../domain/weather_models.dart';
import 'trip_plan_repository.dart';

final gearRecommendationServiceProvider =
    Provider<GearRecommendationService>((ref) {
  return GearRecommendationService(
    ref.watch(gearRepositoryProvider),
    ref.watch(tripPlanRepositoryProvider),
  );
});

class GearRecommendationService {
  final GearRepository _gearRepo;
  final TripPlanRepository _planRepo;

  GearRecommendationService(this._gearRepo, this._planRepo);

  Future<List<GearRecommendation>> getRecommendations({
    required RouteModel route,
    WeatherForecast? weather,
  }) async {
    final recommendations = <GearRecommendation>[];
    final seenCategories = <String>{};

    final ruleRecs = _applyRules(route, weather);
    for (final rec in ruleRecs) {
      seenCategories.add(rec.categoryId);
      recommendations.add(rec);
    }

    try {
      final historyRecs = await _getHistoryRecommendations(seenCategories);
      for (final rec in historyRecs) {
        seenCategories.add(rec.categoryId);
      }
      recommendations.addAll(historyRecs);
    } catch (_) {}

    try {
      final communityRecs =
          await _getCommunityRecommendations(route.id, seenCategories);
      recommendations.addAll(communityRecs);
    } catch (_) {}

    final userItems = await _gearRepo.getAllUserItems();
    return _matchToUserGear(recommendations, userItems);
  }

  List<GearRecommendation> _applyRules(
      RouteModel route, WeatherForecast? weather) {
    final results = <GearRecommendation>[];

    for (final rule in gearRules) {
      final matches = rule.condition(
        maxAltitudeM: route.maxAltitudeM ?? route.elevationGainM,
        elevationGainM: route.elevationGainM,
        difficulty: route.difficulty,
        estimatedDuration: route.estimatedDuration,
        hasWaterSource: route.hasWaterSource,
        rainPop: weather?.maxPop,
        minTempC: weather?.minTempC,
      );

      if (matches) {
        results.add(GearRecommendation(
          categoryId: rule.categoryId,
          categoryName: rule.categoryName,
          reason: rule.reason,
          source: GearRecommendationSource.rule,
        ));
      }
    }

    return results;
  }

  Future<List<GearRecommendation>> _getHistoryRecommendations(
      Set<String> alreadySeen) async {
    final history = await _gearRepo.getUserTripGearHistory();
    history.sort((a, b) =>
        (b['use_count'] as int).compareTo(a['use_count'] as int));

    final results = <GearRecommendation>[];
    for (final entry in history) {
      final count = entry['use_count'] as int;
      if (count < 2) break; // Must have been used at least twice

      final itemId = entry['gear_item_id'] as String;
      try {
        final item = await _gearRepo.getItemById(itemId);
        if (alreadySeen.contains(item.categoryId)) continue;

        results.add(GearRecommendation(
          gearItemId: item.id,
          categoryId: item.categoryId,
          categoryName: item.name,
          reason: '你在过去 $count 次徒步中都携带了${item.name}',
          source: GearRecommendationSource.history,
        ));
        if (results.length >= 3) break; // Max 3 history recommendations
      } catch (_) {}
    }

    return results;
  }

  Future<List<GearRecommendation>> _getCommunityRecommendations(
      String routeId, Set<String> alreadySeen) async {
    final stats = await _planRepo.getCommunityGearStats(routeId);
    final results = <GearRecommendation>[];

    for (final stat in stats) {
      final catId = stat['category_id'] as String;
      if (alreadySeen.contains(catId)) continue;

      final userCount = (stat['user_count'] as num).toInt();
      if (userCount < 2) continue;

      results.add(GearRecommendation(
        categoryId: catId,
        categoryName: stat['category_name'] as String,
        reason: '$userCount位徒步者在此路线携带了此类装备',
        source: GearRecommendationSource.community,
      ));
    }

    return results;
  }

  List<GearRecommendation> _matchToUserGear(
      List<GearRecommendation> recs, List<GearItemModel> userItems) {
    return recs.map((rec) {
      final matching = userItems
          .where((item) => item.categoryId == rec.categoryId)
          .toList();

      if (matching.isEmpty) return rec;

      matching.sort((a, b) {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return b.useCount.compareTo(a.useCount);
      });

      return GearRecommendation(
        gearItemId: matching.first.id,
        categoryId: rec.categoryId,
        categoryName: rec.categoryName,
        reason: rec.reason,
        source: rec.source,
      );
    }).toList();
  }
}

final _gearRecommendationCache = <String, List<GearRecommendation>>{};

final gearRecommendationsProvider = FutureProvider.family<
    List<GearRecommendation>,
    ({RouteModel route, WeatherForecast? weather})>((ref, params) async {
  final cacheKey = '${params.route.id}_${params.weather?.hashCode ?? 'null'}';
  if (_gearRecommendationCache.containsKey(cacheKey)) {
    return _gearRecommendationCache[cacheKey]!;
  }
  final service = ref.watch(gearRecommendationServiceProvider);
  final result = await service.getRecommendations(
    route: params.route,
    weather: params.weather,
  );
  _gearRecommendationCache[cacheKey] = result;
  return result;
});
