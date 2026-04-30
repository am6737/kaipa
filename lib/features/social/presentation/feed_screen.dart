import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/feed_repository.dart';
import '../domain/feed_item_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final feedAsync = ref.watch(feedProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        title: Text('动态', style: TextStyle(color: colors.ink, fontWeight: FontWeight.w700)),
        backgroundColor: colors.bg,
      ),
      body: feedAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: colors.flare)),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.chat_bubble_outline, size: 48, color: colors.inkDim),
              const SizedBox(height: 12),
              Text('加载失败', style: TextStyle(color: colors.inkMuted)),
            ],
          ),
        ),
        data: (items) => items.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.people_outline, size: 48, color: colors.inkDim),
                    const SizedBox(height: 12),
                    Text('还没有动态', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: colors.ink)),
                    const SizedBox(height: 4),
                    Text('关注更多好友吧', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
                  ],
                ),
              )
            : RefreshIndicator(
                color: colors.flare,
                onRefresh: () async => ref.invalidate(feedProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _FeedCard(item: items[i], tokens: tokens),
                ),
              ),
      ),
    );
  }
}

class _FeedCard extends StatelessWidget {
  final FeedItemModel item;
  final KaipaTokens tokens;

  const _FeedCard({required this.item, required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    IconData icon;
    Color iconBg;
    String action;
    String detail;

    switch (item.type) {
      case 'trip_completed':
        icon = Icons.check_circle;
        iconBg = colors.moss;
        action = '完成了一次徒步';
        detail = item.content['summary'] as String? ?? '';
      case 'route_published':
        icon = Icons.add_location;
        iconBg = colors.flare;
        action = '发布了新路线';
        detail = item.content['name'] as String? ?? '';
      case 'achievement_earned':
        icon = Icons.emoji_events;
        iconBg = colors.sand;
        action = '解锁了成就';
        detail = item.content['achievement'] as String? ?? '';
      case 'review_posted':
        icon = Icons.star;
        iconBg = colors.sky;
        action = '发表了评价';
        detail = item.content['content'] as String? ?? '';
      default:
        icon = Icons.notifications;
        iconBg = colors.inkMuted;
        action = '有了新动态';
        detail = '';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: iconBg.withAlpha(30),
            ),
            child: Icon(icon, size: 20, color: iconBg),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(action, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink)),
                if (detail.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(detail, style: TextStyle(fontSize: 13, color: colors.inkMuted), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 6),
                Text(_relativeTime(item.createdAt), style: TextStyle(fontSize: 11, color: colors.inkDim)),
              ],
            ),
          ),
        ],
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
