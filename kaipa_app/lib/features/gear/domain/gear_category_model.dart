class GearCategoryModel {
  final String id;
  final String name;
  final String icon;
  final int sortOrder;

  const GearCategoryModel({
    required this.id,
    required this.name,
    required this.icon,
    this.sortOrder = 0,
  });

  factory GearCategoryModel.fromJson(Map<String, dynamic> json) {
    return GearCategoryModel(
      id: json['id'] as String,
      name: json['name'] as String,
      icon: json['icon'] as String,
      sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'icon': icon,
      'sort_order': sortOrder,
    };
  }

  GearCategoryModel copyWith({
    String? id,
    String? name,
    String? icon,
    int? sortOrder,
  }) {
    return GearCategoryModel(
      id: id ?? this.id,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }
}
