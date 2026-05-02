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

final gearRecommendationsProvider = FutureProvider.family<
    List<GearRecommendation>,
    ({RouteModel route, WeatherForecast? weather})>((ref, params) async {
  final service = ref.watch(gearRecommendationServiceProvider);
  return service.getRecommendations(
    route: params.route,
    weather: params.weather,
  );
});
