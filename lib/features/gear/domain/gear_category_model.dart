class GearCategoryModel {
  final String id;
  final String name;
  final String icon;
  final int sortOrder;
  final bool isBuiltin;
  final String? userId;
  final String iconType;
  final String? builtinRef;
  final String? originalName;

  const GearCategoryModel({
    required this.id,
    required this.name,
    required this.icon,
    this.sortOrder = 0,
    this.isBuiltin = false,
    this.userId,
    this.iconType = 'svg',
    this.builtinRef,
    this.originalName,
  });

  bool get isRenamed => builtinRef != null && originalName != null && originalName != name;
  bool get isUncategorized => id == 'b0000000-0000-0000-0000-000000000000';
  bool get isOverride => builtinRef != null;
  bool get isCustom => !isBuiltin && builtinRef == null;

  factory GearCategoryModel.fromJson(Map<String, dynamic> json) {
    return GearCategoryModel(
      id: json['id'] as String,
      name: json['name'] as String,
      icon: json['icon'] as String,
      sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      isBuiltin: json['is_builtin'] as bool? ?? false,
      userId: json['user_id'] as String?,
      iconType: json['icon_type'] as String? ?? 'svg',
      builtinRef: json['builtin_ref'] as String?,
      originalName: json['original_name'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'icon': icon,
      'sort_order': sortOrder,
      'is_builtin': isBuiltin,
      'user_id': userId,
      'icon_type': iconType,
      'builtin_ref': builtinRef,
      'original_name': originalName,
    };
  }

  GearCategoryModel copyWith({
    String? id,
    String? name,
    String? icon,
    int? sortOrder,
    bool? isBuiltin,
    String? userId,
    String? iconType,
    String? builtinRef,
    String? originalName,
  }) {
    return GearCategoryModel(
      id: id ?? this.id,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      sortOrder: sortOrder ?? this.sortOrder,
      isBuiltin: isBuiltin ?? this.isBuiltin,
      userId: userId ?? this.userId,
      iconType: iconType ?? this.iconType,
      builtinRef: builtinRef ?? this.builtinRef,
      originalName: originalName ?? this.originalName,
    );
  }
}
