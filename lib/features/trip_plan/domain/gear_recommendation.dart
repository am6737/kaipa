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
  static const down = 'b0000000-0000-0000-0000-000000000011';
  static const tee = 'b0000000-0000-0000-0000-000000000012';
  static const fleece = 'b0000000-0000-0000-0000-000000000013';
  static const trekkingPole = 'b0000000-0000-0000-0000-000000000014';
  static const sleepingBag = 'b0000000-0000-0000-0000-000000000015';
  static const firstAid = 'b0000000-0000-0000-0000-000000000016';
  static const gloves = 'b0000000-0000-0000-0000-000000000017';
  static const cooking = 'b0000000-0000-0000-0000-000000000018';
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
  // ── 安全必备 ──
  GearRule(
    categoryId: BuiltinCategories.firstAid,
    categoryName: '急救包',
    reason: '户外安全必备，应对擦伤、扭伤等突发状况',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => true,
  ),
  // ── 衣物层 ──
  GearRule(
    categoryId: BuiltinCategories.jacket,
    categoryName: '冲锋衣/外套',
    reason: '海拔较高，温差大，需防风保暖外层',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => maxAltitudeM > 2500 || (minTempC != null && minTempC < 10),
  ),
  GearRule(
    categoryId: BuiltinCategories.jacket,
    categoryName: '雨衣/雨具',
    reason: '有降雨风险，保持身体干燥防止失温',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => rainPop != null && rainPop > 0.3,
  ),
  GearRule(
    categoryId: BuiltinCategories.down,
    categoryName: '羽绒服',
    reason: '低海拔或高海拔需羽绒服保暖',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => (minTempC != null && minTempC < 5) || maxAltitudeM > 3000,
  ),
  GearRule(
    categoryId: BuiltinCategories.fleece,
    categoryName: '抓绒衣',
    reason: '大运动量徒步需要中间层调节体温',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => (minTempC != null && minTempC < 15) && elevationGainM > 500,
  ),
  GearRule(
    categoryId: BuiltinCategories.tee,
    categoryName: '速干衣',
    reason: '长时间运动需要排汗快干内层',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours > 3,
  ),
  GearRule(
    categoryId: BuiltinCategories.gloves,
    categoryName: '手套',
    reason: '低温环境需保护手部，防止冻伤',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => minTempC != null && minTempC < 5,
  ),
  // ── 鞋履护具 ──
  GearRule(
    categoryId: BuiltinCategories.boot,
    categoryName: '登山鞋',
    reason: '路线难度较高，需要抓地力强的专业登山鞋',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => difficulty == 'hard' || difficulty == 'expert',
  ),
  GearRule(
    categoryId: BuiltinCategories.trekkingPole,
    categoryName: '登山杖/护膝',
    reason: '大爬升需登山杖减轻膝盖冲击',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => elevationGainM > 800,
  ),
  GearRule(
    categoryId: BuiltinCategories.socks,
    categoryName: '备用袜子',
    reason: '多日或长距离徒步需要更换袜子保持足部干爽',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours >= 24,
  ),
  // ── 过夜装备 ──
  GearRule(
    categoryId: BuiltinCategories.tent,
    categoryName: '帐篷',
    reason: '多日路线需要过夜装备',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours >= 24,
  ),
  GearRule(
    categoryId: BuiltinCategories.sleepingBag,
    categoryName: '睡袋',
    reason: '过夜需要睡袋保暖',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => (minTempC != null && minTempC < 15) && estimatedDuration.inHours >= 24,
  ),
  GearRule(
    categoryId: BuiltinCategories.cooking,
    categoryName: '炉具/厨具',
    reason: '多日路线需要热食和热水补给',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours >= 24,
  ),
  // ── 补给续航 ──
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
    categoryId: BuiltinCategories.battery,
    categoryName: '充电宝',
    reason: '行程较长，确保手机续航',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => estimatedDuration.inHours >= 5,
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
    categoryId: BuiltinCategories.shield,
    categoryName: '防晒装备',
    reason: '高海拔紫外线强烈，需防晒保护',
    condition: ({
      required maxAltitudeM, required elevationGainM, required difficulty,
      required estimatedDuration, required hasWaterSource, required rainPop, required minTempC,
    }) => maxAltitudeM > 2500,
  ),
];
