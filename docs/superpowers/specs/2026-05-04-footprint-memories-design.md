# Footprint Memories — 个人足迹回忆

## 概述

在地图上区分「社区分享路线」和「自己真实走过的路线」，点击走过的路线查看个人徒步回忆档案（笔记、照片、轨迹回放、天气装备回顾）。

## 视角切换

MapScreen 增加视角 toggle：
- **发现视角**（默认）：现有社区路线，逻辑不变
- **足迹视角**：展示自己走过的行程（来自 trips 表）
  - 关联路线的行程：圆形照片标记，外圈墨绿色区分
  - 手动录入行程：小旗子图标标记
  - 点击标记弹出预览卡片 → 点击卡片进入详情

切换控件放在搜索栏右侧，与上传/筛选按钮同一排。

## FootprintMemory 模型

```dart
class FootprintMemory {
  final TripModel trip;
  final String? routeName;
  final String? routeDifficulty;
  final double? routeDistanceKm;
  final double? routeElevationM;
  final bool isManual;
  final double latitude;
  final double longitude;
}
```

不新增数据库表，trips 表现在有 photos、notes 字段即够用。

## FootprintDetailScreen

从上到下：
1. 顶部照片区（首张照片 / 无照片时轨迹缩略地图）
2. 路线名 + 日期 + 状态标签
3. 数据对比区（实际 vs 计划）
4. GPS 轨迹回放小地图
5. 天气回顾卡片
6. 装备回顾列表
7. 照片墙（可添加/删除）
8. 笔记编辑区
9. 底部操作栏（分享 / 删除）

同路线多次行程：默认最新，顶部行程切换器横向滑动。

## 文件结构

```
features/footprint/
  data/footprint_repository.dart
  domain/footprint_memory.dart
  presentation/footprint_detail_screen.dart
  presentation/widgets/
    footprint_preview_card.dart
    photo_wall.dart
    track_replay_map.dart
    trip_switcher.dart
```

MapScreen 改动：增加视角 toggle + 足迹 marker layer。
TripCompleteScreen 改动：增加笔记和照片录入。

## 数据层

- `FootprintRepository.fetchMemories(userId)` — trips JOIN routes，取已完成行程
- `FootprintRepository.updateMemory(tripId, notes, photos)` — 编辑笔记照片
