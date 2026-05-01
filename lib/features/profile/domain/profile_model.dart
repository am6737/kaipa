class ProfileModel {
  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String? bio;
  final Map<String, dynamic>? emergencyContact;
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
    this.emergencyContact,
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
      emergencyContact: json['emergency_contact'] as Map<String, dynamic>?,
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
      'emergency_contact': emergencyContact,
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
    Map<String, dynamic>? emergencyContact,
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
      emergencyContact: emergencyContact ?? this.emergencyContact,
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
