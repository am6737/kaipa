import '../../discover/domain/route_model.dart';
import '../../gear/domain/gear_item_model.dart';

enum TripPlanStatus { draft, ready, departed, completed, cancelled }

class TripPlanGearItem {
  final String id;
  final String planId;
  final String gearItemId;
  final bool isPacked;
  final bool isRecommended;
  final String? recommendationReason;
  final DateTime addedAt;
  final GearItemModel? gearItem;

  const TripPlanGearItem({
    required this.id,
    required this.planId,
    required this.gearItemId,
    this.isPacked = false,
    this.isRecommended = false,
    this.recommendationReason,
    required this.addedAt,
    this.gearItem,
  });

  factory TripPlanGearItem.fromJson(Map<String, dynamic> json) {
    return TripPlanGearItem(
      id: json['id'] as String,
      planId: json['plan_id'] as String,
      gearItemId: json['gear_item_id'] as String,
      isPacked: json['is_packed'] as bool? ?? false,
      isRecommended: json['is_recommended'] as bool? ?? false,
      recommendationReason: json['recommendation_reason'] as String?,
      addedAt: DateTime.parse(json['added_at'] as String),
      gearItem: json['gear_items'] != null
          ? GearItemModel.fromJson(json['gear_items'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'plan_id': planId,
      'gear_item_id': gearItemId,
      'is_packed': isPacked,
      'is_recommended': isRecommended,
      'recommendation_reason': recommendationReason,
      'added_at': addedAt.toIso8601String(),
    };
  }

  TripPlanGearItem copyWith({
    String? id,
    String? planId,
    String? gearItemId,
    bool? isPacked,
    bool? isRecommended,
    String? recommendationReason,
    DateTime? addedAt,
    GearItemModel? gearItem,
  }) {
    return TripPlanGearItem(
      id: id ?? this.id,
      planId: planId ?? this.planId,
      gearItemId: gearItemId ?? this.gearItemId,
      isPacked: isPacked ?? this.isPacked,
      isRecommended: isRecommended ?? this.isRecommended,
      recommendationReason: recommendationReason ?? this.recommendationReason,
      addedAt: addedAt ?? this.addedAt,
      gearItem: gearItem ?? this.gearItem,
    );
  }
}

class TripPlanModel {
  final String id;
  final String userId;
  final String routeId;
  final DateTime plannedDate;
  final String? plannedStartTime;
  final TripPlanStatus status;
  final Map<String, dynamic>? weatherCache;
  final DateTime? weatherUpdatedAt;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final RouteModel? route;
  final List<TripPlanGearItem> gearItems;

  const TripPlanModel({
    required this.id,
    required this.userId,
    required this.routeId,
    required this.plannedDate,
    this.plannedStartTime,
    this.status = TripPlanStatus.draft,
    this.weatherCache,
    this.weatherUpdatedAt,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
    this.route,
    this.gearItems = const [],
  });

  int get packedCount => gearItems.where((g) => g.isPacked).length;
  int get totalGearCount => gearItems.length;
  double get totalWeightG => gearItems.fold(
      0, (sum, g) => sum + (g.gearItem?.weightG ?? 0));
  bool get isDepartureDay {
    final now = DateTime.now();
    return plannedDate.year == now.year &&
        plannedDate.month == now.month &&
        plannedDate.day == now.day;
  }

  factory TripPlanModel.fromJson(Map<String, dynamic> json) {
    return TripPlanModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      routeId: json['route_id'] as String,
      plannedDate: DateTime.parse(json['planned_date'] as String),
      plannedStartTime: json['planned_start_time'] as String?,
      status: _parseStatus(json['status'] as String?),
      weatherCache: json['weather_cache'] as Map<String, dynamic>?,
      weatherUpdatedAt: json['weather_updated_at'] != null
          ? DateTime.parse(json['weather_updated_at'] as String)
          : null,
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      route: json['routes'] != null
          ? RouteModel.fromJson(json['routes'] as Map<String, dynamic>)
          : null,
      gearItems: _parseGearItems(json['trip_plan_gear']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'route_id': routeId,
      'planned_date': plannedDate.toIso8601String().split('T').first,
      'planned_start_time': plannedStartTime,
      'status': status.name,
      'weather_cache': weatherCache,
      'weather_updated_at': weatherUpdatedAt?.toIso8601String(),
      'notes': notes,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  TripPlanModel copyWith({
    String? id,
    String? userId,
    String? routeId,
    DateTime? plannedDate,
    String? plannedStartTime,
    TripPlanStatus? status,
    Map<String, dynamic>? weatherCache,
    DateTime? weatherUpdatedAt,
    String? notes,
    DateTime? createdAt,
    DateTime? updatedAt,
    RouteModel? route,
    List<TripPlanGearItem>? gearItems,
  }) {
    return TripPlanModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      routeId: routeId ?? this.routeId,
      plannedDate: plannedDate ?? this.plannedDate,
      plannedStartTime: plannedStartTime ?? this.plannedStartTime,
      status: status ?? this.status,
      weatherCache: weatherCache ?? this.weatherCache,
      weatherUpdatedAt: weatherUpdatedAt ?? this.weatherUpdatedAt,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      route: route ?? this.route,
      gearItems: gearItems ?? this.gearItems,
    );
  }

  static TripPlanStatus _parseStatus(String? value) {
    switch (value) {
      case 'draft': return TripPlanStatus.draft;
      case 'ready': return TripPlanStatus.ready;
      case 'departed': return TripPlanStatus.departed;
      case 'completed': return TripPlanStatus.completed;
      case 'cancelled': return TripPlanStatus.cancelled;
      default: return TripPlanStatus.draft;
    }
  }

  static List<TripPlanGearItem> _parseGearItems(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      return value
          .map((e) => TripPlanGearItem.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return [];
  }
}
