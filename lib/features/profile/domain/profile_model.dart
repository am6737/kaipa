class AchievementModel {
  final String id;
  final String name;
  final String? description;
  final String icon;
  final String conditionType;
  final Map<String, dynamic> conditionValue;
  final DateTime createdAt;

  const AchievementModel({
    required this.id,
    required this.name,
    this.description,
    required this.icon,
    required this.conditionType,
    required this.conditionValue,
    required this.createdAt,
  });

  factory AchievementModel.fromJson(Map<String, dynamic> json) {
    return AchievementModel(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      icon: json['icon'] as String,
      conditionType: json['condition_type'] as String,
      conditionValue: json['condition_value'] as Map<String, dynamic>? ?? {},
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'icon': icon,
      'condition_type': conditionType,
      'condition_value': conditionValue,
      'created_at': createdAt.toIso8601String(),
    };
  }

  AchievementModel copyWith({
    String? id,
    String? name,
    String? description,
    String? icon,
    String? conditionType,
    Map<String, dynamic>? conditionValue,
    DateTime? createdAt,
  }) {
    return AchievementModel(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      icon: icon ?? this.icon,
      conditionType: conditionType ?? this.conditionType,
      conditionValue: conditionValue ?? this.conditionValue,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class UserAchievementModel {
  final String id;
  final String userId;
  final String achievementId;
  final DateTime earnedAt;
  final String? tripId;

  const UserAchievementModel({
    required this.id,
    required this.userId,
    required this.achievementId,
    required this.earnedAt,
    this.tripId,
  });

  factory UserAchievementModel.fromJson(Map<String, dynamic> json) {
    return UserAchievementModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      achievementId: json['achievement_id'] as String,
      earnedAt: DateTime.parse(json['earned_at'] as String),
      tripId: json['trip_id'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'achievement_id': achievementId,
      'earned_at': earnedAt.toIso8601String(),
      'trip_id': tripId,
    };
  }

  UserAchievementModel copyWith({
    String? id,
    String? userId,
    String? achievementId,
    DateTime? earnedAt,
    String? tripId,
  }) {
    return UserAchievementModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      achievementId: achievementId ?? this.achievementId,
      earnedAt: earnedAt ?? this.earnedAt,
      tripId: tripId ?? this.tripId,
    );
  }
}

class ProfileModel {
  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String? bio;
  final String? difficultyPreference;
  final double totalDistanceKm;
  final double totalElevationM;
  final int totalTrips;
  final DateTime joinedAt;
  final DateTime updatedAt;

  const ProfileModel({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    this.bio,
    this.difficultyPreference,
    this.totalDistanceKm = 0,
    this.totalElevationM = 0,
    this.totalTrips = 0,
    required this.joinedAt,
    required this.updatedAt,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['display_name'] as String,
      avatarUrl: json['avatar_url'] as String?,
      bio: json['bio'] as String?,
      difficultyPreference: json['difficulty_preference'] as String?,
      totalDistanceKm: _parseDouble(json['total_distance_km']),
      totalElevationM: _parseDouble(json['total_elevation_m']),
      totalTrips: (json['total_trips'] as num?)?.toInt() ?? 0,
      joinedAt: DateTime.parse(json['joined_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'display_name': displayName,
      'avatar_url': avatarUrl,
      'bio': bio,
      'difficulty_preference': difficultyPreference,
      'total_distance_km': totalDistanceKm,
      'total_elevation_m': totalElevationM,
      'total_trips': totalTrips,
      'joined_at': joinedAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  ProfileModel copyWith({
    String? id,
    String? username,
    String? displayName,
    String? avatarUrl,
    String? bio,
    String? difficultyPreference,
    double? totalDistanceKm,
    double? totalElevationM,
    int? totalTrips,
    DateTime? joinedAt,
    DateTime? updatedAt,
  }) {
    return ProfileModel(
      id: id ?? this.id,
      username: username ?? this.username,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      bio: bio ?? this.bio,
      difficultyPreference: difficultyPreference ?? this.difficultyPreference,
      totalDistanceKm: totalDistanceKm ?? this.totalDistanceKm,
      totalElevationM: totalElevationM ?? this.totalElevationM,
      totalTrips: totalTrips ?? this.totalTrips,
      joinedAt: joinedAt ?? this.joinedAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  static double _parseDouble(dynamic value) {
    if (value == null) return 0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0;
    return 0;
  }
}
