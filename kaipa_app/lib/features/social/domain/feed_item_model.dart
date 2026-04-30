class FeedItemModel {
  final String id;
  final String userId;
  final String type;
  final Map<String, dynamic> content;
  final String? routeId;
  final String? tripId;
  final DateTime createdAt;

  const FeedItemModel({
    required this.id,
    required this.userId,
    required this.type,
    required this.content,
    this.routeId,
    this.tripId,
    required this.createdAt,
  });

  factory FeedItemModel.fromJson(Map<String, dynamic> json) {
    return FeedItemModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      type: json['type'] as String,
      content: json['content'] as Map<String, dynamic>? ?? {},
      routeId: json['route_id'] as String?,
      tripId: json['trip_id'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'type': type,
      'content': content,
      'route_id': routeId,
      'trip_id': tripId,
      'created_at': createdAt.toIso8601String(),
    };
  }

  FeedItemModel copyWith({
    String? id,
    String? userId,
    String? type,
    Map<String, dynamic>? content,
    String? routeId,
    String? tripId,
    DateTime? createdAt,
  }) {
    return FeedItemModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      type: type ?? this.type,
      content: content ?? this.content,
      routeId: routeId ?? this.routeId,
      tripId: tripId ?? this.tripId,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
