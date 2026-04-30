class GearItemModel {
  final String id;
  final String userId;
  final String categoryId;
  final String name;
  final String? brand;
  final double? weightG;
  final double? price;
  final String? condition;
  final String? photoUrl;
  final String? notes;
  final bool isFavorite;
  final DateTime? purchasedAt;
  final DateTime createdAt;

  const GearItemModel({
    required this.id,
    required this.userId,
    required this.categoryId,
    required this.name,
    this.brand,
    this.weightG,
    this.price,
    this.condition,
    this.photoUrl,
    this.notes,
    this.isFavorite = false,
    this.purchasedAt,
    required this.createdAt,
  });

  factory GearItemModel.fromJson(Map<String, dynamic> json) {
    return GearItemModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      categoryId: json['category_id'] as String,
      name: json['name'] as String,
      brand: json['brand'] as String?,
      weightG: _parseNullableDouble(json['weight_g']),
      price: _parseNullableDouble(json['price']),
      condition: json['condition'] as String?,
      photoUrl: json['photo_url'] as String?,
      notes: json['notes'] as String?,
      isFavorite: json['is_favorite'] as bool? ?? false,
      purchasedAt: json['purchased_at'] != null
          ? DateTime.parse(json['purchased_at'] as String)
          : null,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'category_id': categoryId,
      'name': name,
      'brand': brand,
      'weight_g': weightG,
      'price': price,
      'condition': condition,
      'photo_url': photoUrl,
      'notes': notes,
      'is_favorite': isFavorite,
      'purchased_at': purchasedAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
    };
  }

  GearItemModel copyWith({
    String? id,
    String? userId,
    String? categoryId,
    String? name,
    String? brand,
    double? weightG,
    double? price,
    String? condition,
    String? photoUrl,
    String? notes,
    bool? isFavorite,
    DateTime? purchasedAt,
    DateTime? createdAt,
  }) {
    return GearItemModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      categoryId: categoryId ?? this.categoryId,
      name: name ?? this.name,
      brand: brand ?? this.brand,
      weightG: weightG ?? this.weightG,
      price: price ?? this.price,
      condition: condition ?? this.condition,
      photoUrl: photoUrl ?? this.photoUrl,
      notes: notes ?? this.notes,
      isFavorite: isFavorite ?? this.isFavorite,
      purchasedAt: purchasedAt ?? this.purchasedAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  static double? _parseNullableDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }
}
