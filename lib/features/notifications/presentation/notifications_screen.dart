import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/notification_repository.dart';
import '../domain/notification_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final notifsAsync = ref.watch(notificationsProvider(_filter.isEmpty ? null : _filter));

    final filters = [
      {'id': '', 'label': '全部'},
      {'id': 'weather', 'label': '天气'},
      {'id': 'social', 'label': '社交'},
      {'id': 'achievement', 'label': '成就'},
      {'id': 'system', 'label': '系统'},
    ];

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        leading: IconButton(icon: Icon(Icons.arrow_back_ios, color: colors.ink), onPressed: () => context.pop()),
        title: Text('通知', style: TextStyle(color: colors.ink, fontWeight: FontWeight.w700)),
      ),
      body: Column(
        children: [
          // Filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: filters.map((f) {
                final selected = _filter == f['id'];
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    selected: selected,
                    label: Text(f['label']!),
                    labelStyle: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: selected ? colors.flare : colors.ink,
                    ),
                    backgroundColor: colors.surface,
                    selectedColor: colors.flareSoft,
                    side: BorderSide(color: selected ? colors.flare : colors.line, width: 0.5),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                    onSelected: (_) => setState(() => _filter = f['id']!),
                  ),
                );
              }).toList(),
            ),
          ),
          // Notifications list
          Expanded(
            child: notifsAsync.when(
              loading: () => Center(child: CircularProgressIndicator(color: colors.flare)),
              error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
              data: (notifs) => notifs.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.notifications_none, size: 48, color: colors.inkDim),
                          const SizedBox(height: 12),
                          Text('没有通知', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: colors.ink)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      color: colors.flare,
                      onRefresh: () async => ref.invalidate(notificationsProvider(_filter.isEmpty ? null : _filter)),
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: notifs.length,
                        itemBuilder: (_, i) {
                          final showHeader = i == 0 || _timeGroup(notifs[i].createdAt) != _timeGroup(notifs[i - 1].createdAt);
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (showHeader) Padding(
                                padding: const EdgeInsets.only(top: 16, bottom: 8),
                                child: Text(_timeGroup(notifs[i].createdAt), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.inkMuted)),
                              ),
                              _NotifCard(notif: notifs[i], colors: colors, onTap: () {
                                ref.read(notificationRepositoryProvider).markAsRead(notifs[i].id);
                                ref.invalidate(notificationsProvider(_filter.isEmpty ? null : _filter));
                              }),
                              const SizedBox(height: 8),
                            ],
                          );
                        },
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  String _timeGroup(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final date = DateTime(dt.year, dt.month, dt.day);
    if (date == today) return '今天';
    if (date == today.subtract(const Duration(days: 1))) return '昨天';
    return '更早';
  }
}

class _NotifCard extends StatelessWidget {
  final NotificationModel notif;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _NotifCard({required this.notif, required this.colors, required this.onTap});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color iconColor;
    switch (notif.type) {
      case 'weather':
        icon = Icons.cloud;
        iconColor = colors.sky;
      case 'social':
        icon = Icons.people;
        iconColor = colors.flare;
      case 'achievement':
        icon = Icons.star;
        iconColor = colors.sand;
      case 'safety':
        icon = Icons.shield;
        iconColor = colors.diff.extreme;
      default:
        icon = Icons.notifications;
        iconColor = colors.inkMuted;
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: iconColor.withAlpha(25),
              ),
              child: Icon(icon, size: 18, color: iconColor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(notif.title, style: TextStyle(fontSize: 14, fontWeight: notif.isRead ? FontWeight.w500 : FontWeight.w700, color: colors.ink)),
                  if (notif.body != null) ...[
                    const SizedBox(height: 3),
                    Text(notif.body!, style: TextStyle(fontSize: 12, color: colors.inkMuted), maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                  const SizedBox(height: 4),
                  Text(_relativeTime(notif.createdAt), style: TextStyle(fontSize: 10, color: colors.inkDim)),
                ],
              ),
            ),
            if (!notif.isRead)
              Container(
                width: 8, height: 8,
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(shape: BoxShape.circle, color: colors.flare),
              ),
          ],
        ),
      ),
    );
  }

  String _relativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}分钟前';
    if (diff.inHours < 24) return '${diff.inHours}小时前';
    if (diff.inDays < 7) return '${diff.inDays}天前';
    return '${dt.month}月${dt.day}日';
  }
}
