class ReviewModel {
  final String id;
  final String routeId;
  final String userId;
  final int rating;
  final String? content;
  final List<String> photos;
  final DateTime createdAt;

  const ReviewModel({
    required this.id,
    required this.routeId,
    required this.userId,
    required this.rating,
    this.content,
    this.photos = const [],
    required this.createdAt,
  });

  factory ReviewModel.fromJson(Map<String, dynamic> json) {
    return ReviewModel(
      id: json['id'] as String,
      routeId: json['route_id'] as String,
      userId: json['user_id'] as String,
      rating: (json['rating'] as num).toInt(),
      content: json['content'] as String?,
      photos: _parseStringList(json['photos']),
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'route_id': routeId,
      'user_id': userId,
      'rating': rating,
      'content': content,
      'photos': photos,
      'created_at': createdAt.toIso8601String(),
    };
  }

  ReviewModel copyWith({
    String? id,
    String? routeId,
    String? userId,
    int? rating,
    String? content,
    List<String>? photos,
    DateTime? createdAt,
  }) {
    return ReviewModel(
      id: id ?? this.id,
      routeId: routeId ?? this.routeId,
      userId: userId ?? this.userId,
      rating: rating ?? this.rating,
      content: content ?? this.content,
      photos: photos ?? this.photos,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  static List<String> _parseStringList(dynamic value) {
    if (value == null) return [];
    if (value is List) return value.cast<String>();
    return [];
  }
}
