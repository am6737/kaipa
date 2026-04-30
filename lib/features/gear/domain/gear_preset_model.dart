class GearPresetModel {
  final String id;
  final String userId;
  final String name;
  final DateTime createdAt;
  final int itemCount;
  final double totalWeightG;

  const GearPresetModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.createdAt,
    this.itemCount = 0,
    this.totalWeightG = 0,
  });

  factory GearPresetModel.fromJson(Map<String, dynamic> json) {
    return GearPresetModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      name: json['name'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      itemCount: (json['item_count'] as num?)?.toInt() ?? 0,
      totalWeightG: (json['total_weight_g'] as num?)?.toDouble() ?? 0,
    );
  }

  GearPresetModel copyWith({
    String? id,
    String? userId,
    String? name,
    DateTime? createdAt,
    int? itemCount,
    double? totalWeightG,
  }) {
    return GearPresetModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      name: name ?? this.name,
      createdAt: createdAt ?? this.createdAt,
      itemCount: itemCount ?? this.itemCount,
      totalWeightG: totalWeightG ?? this.totalWeightG,
    );
  }
}
