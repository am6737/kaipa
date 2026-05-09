enum TaskCategory { prep, milestone, weather, gear, safety, camp, custom }

extension TaskCategoryX on TaskCategory {
  String get jsonValue => name;
  String get label {
    switch (this) {
      case TaskCategory.prep: return '出发前';
      case TaskCategory.milestone: return '里程碑';
      case TaskCategory.weather: return '天气提醒';
      case TaskCategory.gear: return '装备检查';
      case TaskCategory.safety: return '安全';
      case TaskCategory.camp: return '扎营';
      case TaskCategory.custom: return '自定义';
    }
  }
  String get icon {
    switch (this) {
      case TaskCategory.prep: return 'clock';
      case TaskCategory.milestone: return 'flag';
      case TaskCategory.weather: return 'cloud';
      case TaskCategory.gear: return 'backpack';
      case TaskCategory.safety: return 'shield';
      case TaskCategory.camp: return 'tent';
      case TaskCategory.custom: return 'check';
    }
  }

  static TaskCategory fromJson(String v) => TaskCategory.values.firstWhere((e) => e.name == v, orElse: () => TaskCategory.milestone);
}

class TripPlanTask {
  final String id;
  final String planId;
  final TaskCategory category;
  final String title;
  final String? description;
  final String? suggestedTime;
  final DateTime? deadline;
  final bool isDone;
  final DateTime? doneAt;
  final int sortOrder;
  final bool aiGenerated;
  final String? customLabel;
  final int? suggestedDay;
  final DateTime createdAt;

  const TripPlanTask({
    required this.id,
    required this.planId,
    required this.category,
    required this.title,
    this.description,
    this.suggestedTime,
    this.suggestedDay,
    this.deadline,
    this.isDone = false,
    this.doneAt,
    this.sortOrder = 0,
    this.aiGenerated = true,
    this.customLabel,
    required this.createdAt,
  });

  factory TripPlanTask.fromJson(Map<String, dynamic> json) {
    return TripPlanTask(
      id: json['id'] as String,
      planId: json['plan_id'] as String,
      category: TaskCategoryX.fromJson(json['category'] as String),
      title: json['title'] as String,
      description: json['description'] as String?,
      suggestedTime: json['suggested_time'] as String?,
      deadline: json['deadline'] != null ? DateTime.parse(json['deadline'] as String) : null,
      isDone: json['is_done'] as bool? ?? false,
      doneAt: json['done_at'] != null ? DateTime.parse(json['done_at'] as String) : null,
      sortOrder: json['sort_order'] as int? ?? 0,
      aiGenerated: json['ai_generated'] as bool? ?? true,
      customLabel: json['custom_label'] as String?,
      suggestedDay: json['suggested_day'] as int?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
    'plan_id': planId,
    'category': category.jsonValue,
    'title': title,
    'description': description,
    'suggested_time': suggestedTime,
    'deadline': deadline?.toIso8601String(),
    'is_done': isDone,
    'done_at': doneAt?.toIso8601String(),
    'sort_order': sortOrder,
    'ai_generated': aiGenerated,
    'custom_label': customLabel,
    'suggested_day': suggestedDay,
  };
}
