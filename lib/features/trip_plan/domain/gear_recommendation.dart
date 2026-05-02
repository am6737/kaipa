class GearRecommendation {
  final String? gearItemId;
  final String categoryId;
  final String categoryName;
  final String reason;
  final GearRecommendationSource source;

  const GearRecommendation({
    this.gearItemId,
    required this.categoryId,
    required this.categoryName,
    required this.reason,
    required this.source,
  });
}

enum GearRecommendationSource { rule, history, community }

class BuiltinCategories {
  static const boot = 'b0000000-0000-0000-0000-000000000001';
  static const backpack = 'b0000000-0000-0000-0000-000000000002';
  static const jacket = 'b0000000-0000-0000-0000-000000000003';
  static const tent = 'b0000000-0000-0000-0000-000000000004';
  static const bottle = 'b0000000-0000-0000-0000-000000000005';
  static const battery = 'b0000000-0000-0000-0000-000000000006';
  static const light = 'b0000000-0000-0000-0000-000000000007';
  static const knife = 'b0000000-0000-0000-0000-000000000008';
  static const socks = 'b0000000-0000-0000-0000-000000000009';
  static const shield = 'b0000000-0000-0000-0000-000000000010';
}

class GearRule {
  final String categoryId;
  final String categoryName;
  final String reason;
  final bool Function({
    required double maxAltitudeM,
    required double elevationGainM,
    required String difficulty,
    required Duration estimatedDuration,
    required bool hasWaterSource,
    required double? rainPop,
    required double? minTempC,
  }) condition;

  const GearRule({
    required this.categoryId,
    required this.categoryName,
    required this.reason,
    required this.condition,
  });
}

final gearRules = <GearRule>[
  GearRule(
    categoryId: BuiltinCategories.jacket,
    categoryName: '冲锋衣/外套',
    reason: '海拔较高，温差大',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => maxAltitudeM > 2500 || (minTempC != null && minTempC < 10),
  ),
  GearRule(
    categoryId: BuiltinCategories.jacket,
    categoryName: '雨衣/雨具',
    reason: '有降雨风险',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => rainPop != null && rainPop > 0.3,
  ),
  GearRule(
    categoryId: BuiltinCategories.light,
    categoryName: '头灯',
    reason: '行程较长，可能天黑前无法完成',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours >= 6,
  ),
  GearRule(
    categoryId: BuiltinCategories.boot,
    categoryName: '登山鞋',
    reason: '路线难度较高，需要抓地力好的鞋',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => difficulty == 'hard' || difficulty == 'expert',
  ),
  GearRule(
    categoryId: BuiltinCategories.bottle,
    categoryName: '水壶/水袋',
    reason: '沿途无水源，需自带充足饮水',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => !hasWaterSource,
  ),
  GearRule(
    categoryId: BuiltinCategories.shield,
    categoryName: '防晒装备',
    reason: '高海拔紫外线强烈',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => maxAltitudeM > 2500,
  ),
  GearRule(
    categoryId: BuiltinCategories.battery,
    categoryName: '充电宝',
    reason: '行程较长，确保手机续航',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours >= 5,
  ),
];
