import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ---------------------------------------------------------------------------
// Demo data models
// ---------------------------------------------------------------------------
class _StoryUser {
  final String name;
  final String initial;

  const _StoryUser({required this.name, required this.initial});
}

class _DemoPost {
  final String authorName;
  final String authorInitial;
  final String time;
  final String location;
  final String text;
  final String distance;
  final String elevation;
  final String duration;
  final String difficulty;
  final int likes;
  final int comments;
  final int mapSeed;

  const _DemoPost({
    required this.authorName,
    required this.authorInitial,
    required this.time,
    required this.location,
    required this.text,
    required this.distance,
    required this.elevation,
    required this.duration,
    required this.difficulty,
    required this.likes,
    required this.comments,
    required this.mapSeed,
  });
}

const _storyUsers = [
  _StoryUser(name: '你', initial: ''),
  _StoryUser(name: 'Sara', initial: 'S'),
  _StoryUser(name: '张磊', initial: '张'),
  _StoryUser(name: 'Lin', initial: 'L'),
  _StoryUser(name: 'Wei', initial: 'W'),
  _StoryUser(name: 'Bo', initial: 'B'),
];

const _demoPosts = [
  _DemoPost(
    authorName: 'Sara K.',
    authorInitial: 'S',
    time: '2 小时前',
    location: '海坨山纵走',
    text: '今天的雾凇绝了！山顶风很大但值得 ❄️',
    distance: '18.1km',
    elevation: '↑1240m',
    duration: '8:42',
    difficulty: 'expert',
    likes: 47,
    comments: 12,
    mapSeed: 1001,
  ),
  _DemoPost(
    authorName: '张磊',
    authorInitial: '张',
    time: '昨天',
    location: '云蒙山主峰',
    text: '带儿子第一次徒步，T3 难度刚刚好。山顶云海超治愈。',
    distance: '7.3km',
    elevation: '↑620m',
    duration: '4:15',
    difficulty: 'mod',
    likes: 23,
    comments: 5,
    mapSeed: 2002,
  ),
  _DemoPost(
    authorName: 'Lin M.',
    authorInitial: 'L',
    time: '3 天前',
    location: '十三陵水库环线',
    text: '春天的绿。水库旁开了大片二月兰，下次想夜爬试试。',
    distance: '14.2km',
    elevation: '↑480m',
    duration: '4:35',
    difficulty: 'easy',
    likes: 89,
    comments: 18,
    mapSeed: 3003,
  ),
];

// ---------------------------------------------------------------------------
// FeedScreen — aligned with design prototype
// ---------------------------------------------------------------------------
class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: CustomScrollView(
        slivers: [
          // Header
          SliverToBoxAdapter(
            child: _FeedHeader(tokens: tokens),
          ),
          // Story avatars row
          SliverToBoxAdapter(
            child: _StoryAvatarRow(tokens: tokens),
          ),
          // Post cards
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            sliver: SliverList.separated(
              itemCount: _demoPosts.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, i) =>
                  _PostCard(post: _demoPosts[i], tokens: tokens),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header: Title "动态" + search + plus CircleButtons
// ---------------------------------------------------------------------------
class _FeedHeader extends StatelessWidget {
  final KaipaTokens tokens;

  const _FeedHeader({required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 54, 16, 0),
      child: Row(
        children: [
          Text(
            '动态',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.7,
            ),
          ),
          const Spacer(),
          CircleButton(
            icon: KaipaIcons.search,
            size: 36,
            iconSize: 16,
            tokens: tokens,
            onTap: () {},
          ),
          const SizedBox(width: 8),
          CircleButton(
            icon: KaipaIcons.plus,
            size: 36,
            iconSize: 16,
            tokens: tokens,
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Story avatars row
// ---------------------------------------------------------------------------
class _StoryAvatarRow extends StatelessWidget {
  final KaipaTokens tokens;

  const _StoryAvatarRow({required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return Container(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: colors.line, width: 0.5),
        ),
      ),
      child: SizedBox(
        height: 94,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          itemCount: _storyUsers.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) {
            if (i == 0) {
              return _AddStoryCircle(tokens: tokens);
            }
            return _StoryAvatar(user: _storyUsers[i], tokens: tokens);
          },
        ),
      ),
    );
  }
}

class _AddStoryCircle extends StatelessWidget {
  final KaipaTokens tokens;

  const _AddStoryCircle({required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return SizedBox(
      width: 56,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: () {},
            child: CustomPaint(
              painter: _DashedCirclePainter(color: colors.line),
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors.surface,
                ),
                child: Center(
                  child: KaipaIcon(
                    name: KaipaIcons.plus,
                    size: 18,
                    color: colors.inkMuted,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '你',
            style: TextStyle(
              fontSize: 10.5,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}

class _DashedCirclePainter extends CustomPainter {
  final Color color;

  _DashedCirclePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final radius = (size.width - 1.5) / 2;
    final center = Offset(size.width / 2, size.height / 2);
    const dashCount = 16;
    const gapRatio = 0.4;
    const totalAngle = 2 * pi;
    const dashAngle = totalAngle / dashCount;
    const actualDash = dashAngle * (1 - gapRatio);

    for (int i = 0; i < dashCount; i++) {
      final startAngle = i * dashAngle - pi / 2;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        actualDash,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_DashedCirclePainter oldDelegate) =>
      oldDelegate.color != color;
}

class _StoryAvatar extends StatelessWidget {
  final _StoryUser user;
  final KaipaTokens tokens;

  const _StoryAvatar({required this.user, required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return SizedBox(
      width: 56,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: () {},
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [colors.flare, colors.mossDeep],
                ),
              ),
              padding: const EdgeInsets.all(2),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors.surface,
                  border: Border.all(color: colors.bg, width: 2),
                ),
                child: Center(
                  child: Text(
                    user.initial,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: colors.ink,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            user.name,
            style: TextStyle(
              fontSize: 10.5,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------
class _PostCard extends StatelessWidget {
  final _DemoPost post;
  final KaipaTokens tokens;

  const _PostCard({required this.post, required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Author header
          _AuthorHeader(post: post, tokens: tokens),
          // MiniMap preview
          _TerrainMapPreview(
            seed: post.mapSeed,
            distance: post.distance,
            elevation: post.elevation,
            duration: post.duration,
            tokens: tokens,
          ),
          // Post text
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
            child: Text(
              post.text,
              style: TextStyle(
                fontSize: 13.5,
                color: colors.ink,
                height: 1.5,
              ),
            ),
          ),
          // Action row
          _ActionRow(
            likes: post.likes,
            comments: post.comments,
            tokens: tokens,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Author header row
// ---------------------------------------------------------------------------
class _AuthorHeader extends StatelessWidget {
  final _DemoPost post;
  final KaipaTokens tokens;

  const _AuthorHeader({required this.post, required this.tokens});

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          // 38px gradient avatar
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [colors.flare, colors.mossDeep],
              ),
            ),
            child: Center(
              child: Text(
                post.authorInitial,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Name + location row
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  post.authorName,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    KaipaIcon(
                      name: KaipaIcons.navigate,
                      size: 9,
                      color: colors.flare,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      post.location,
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkMuted,
                      ),
                    ),
                    Text(
                      ' · ',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkMuted,
                      ),
                    ),
                    Text(
                      post.time,
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Ellipsis menu icon
          KaipaIcon(
            name: KaipaIcons.ellipsis,
            size: 16,
            color: colors.inkMuted,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Terrain map preview with route stats glass overlay
// ---------------------------------------------------------------------------
class _TerrainMapPreview extends StatelessWidget {
  final int seed;
  final String distance;
  final String elevation;
  final String duration;
  final KaipaTokens tokens;

  const _TerrainMapPreview({
    required this.seed,
    required this.distance,
    required this.elevation,
    required this.duration,
    required this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return SizedBox(
      height: 180,
      width: double.infinity,
      child: Stack(
        children: [
          // Terrain CustomPaint
          Positioned.fill(
            child: CustomPaint(
              painter: _TerrainPreviewPainter(
                tokens: tokens,
                seed: seed,
              ),
            ),
          ),
          // Glass stats overlay at bottom-left
          Positioned(
            left: 10,
            bottom: 10,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: colors.glass,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        distance,
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: colors.ink,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        elevation,
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: colors.ink,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        duration,
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: colors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Terrain preview painter — decorative terrain with route line
// ---------------------------------------------------------------------------
class _TerrainPreviewPainter extends CustomPainter {
  final KaipaTokens tokens;
  final int seed;

  _TerrainPreviewPainter({required this.tokens, required this.seed});

  @override
  void paint(Canvas canvas, Size size) {
    final c = tokens.color;
    final rng = Random(seed);
    final w = size.width;
    final h = size.height;

    // Background — terrain lowland
    final bgPaint = Paint()..color = c.terrain.lowland;
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), bgPaint);

    // Contour lines
    final contourPaint = Paint()
      ..color = c.terrain.contour
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.6;

    for (int i = 0; i < 10; i++) {
      final baseY = h * (0.08 + i * 0.09) + rng.nextDouble() * 8;
      final cPath = Path();
      cPath.moveTo(0, baseY);
      final segs = 7 + rng.nextInt(3);
      for (int s = 1; s <= segs; s++) {
        final x = w * s / segs;
        final y =
            baseY + sin(s * 0.9 + seed) * h * 0.04 + rng.nextDouble() * 4 - 2;
        final cpx = w * (s - 0.5) / segs;
        final cpy = y + rng.nextDouble() * 5 - 2.5;
        cPath.quadraticBezierTo(cpx, cpy, x, y);
      }
      canvas.drawPath(cPath, contourPaint);
    }

    // Ridge overlay (0.5 opacity)
    final ridgePaint = Paint()
      ..color = colorWithOpacity(c.terrain.ridge, 0.5);
    final ridgePath = Path();
    final ridgeBaseY = h * 0.35 + rng.nextDouble() * 10;
    ridgePath.moveTo(0, ridgeBaseY);
    final ridgeSegs = 6 + rng.nextInt(3);
    for (int s = 0; s <= ridgeSegs; s++) {
      final x = w * s / ridgeSegs;
      final y = ridgeBaseY - rng.nextDouble() * h * 0.12;
      if (s == 0) {
        ridgePath.lineTo(x, y);
      } else {
        final px = w * (s - 0.5) / ridgeSegs;
        ridgePath.quadraticBezierTo(px, y + rng.nextDouble() * 8 - 4, x, y);
      }
    }
    ridgePath.lineTo(w, h);
    ridgePath.lineTo(0, h);
    ridgePath.close();
    canvas.drawPath(ridgePath, ridgePaint);

    // Trail path (flare, 2px)
    final trailPaint = Paint()
      ..color = c.flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final sx = w * 0.06;
    final sy = h * (0.7 + rng.nextDouble() * 0.12);
    final ex = w * 0.94;
    final ey = h * (0.2 + rng.nextDouble() * 0.12);

    final trail = Path();
    trail.moveTo(sx, sy);

    final midPts = 3 + rng.nextInt(2);
    for (int i = 1; i <= midPts; i++) {
      final t = i / (midPts + 1);
      final x = sx + (ex - sx) * t;
      final bY = sy + (ey - sy) * t;
      final y = bY + (rng.nextDouble() - 0.5) * h * 0.3;
      final cpx = x - w * 0.07;
      final cpy = y + (rng.nextDouble() - 0.5) * h * 0.12;
      trail.quadraticBezierTo(cpx, cpy, x, y);
    }
    trail.quadraticBezierTo(
        ex - w * 0.04, ey + rng.nextDouble() * 5, ex, ey);
    canvas.drawPath(trail, trailPaint);

    // Start dot (moss)
    canvas.drawCircle(Offset(sx, sy), 4, Paint()..color = c.moss);

    // End dot (flare)
    canvas.drawCircle(Offset(ex, ey), 4, Paint()..color = c.flare);
  }

  @override
  bool shouldRepaint(_TerrainPreviewPainter old) =>
      old.seed != seed || old.tokens != tokens;
}

// ---------------------------------------------------------------------------
// Action row — heart + count, chat + count, share, spacer, "查看路线 →"
// ---------------------------------------------------------------------------
class _ActionRow extends StatelessWidget {
  final int likes;
  final int comments;
  final KaipaTokens tokens;

  const _ActionRow({
    required this.likes,
    required this.comments,
    required this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final colors = tokens.color;

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
      child: Row(
        children: [
          // Heart (flare) + count
          KaipaIcon(
            name: KaipaIcons.heart,
            size: 15,
            color: colors.flare,
          ),
          const SizedBox(width: 4),
          Text(
            '$likes',
            style: TextStyle(
              fontSize: 12.5,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(width: 18),
          // Chat (inkMuted) + count
          KaipaIcon(
            name: KaipaIcons.chat,
            size: 15,
            color: colors.inkMuted,
          ),
          const SizedBox(width: 4),
          Text(
            '$comments',
            style: TextStyle(
              fontSize: 12.5,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(width: 18),
          // Share (inkMuted)
          KaipaIcon(
            name: KaipaIcons.share,
            size: 15,
            color: colors.inkMuted,
          ),
          const Spacer(),
          // "查看路线 →"
          GestureDetector(
            onTap: () {},
            child: Text(
              '查看路线 →',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
                color: colors.flare,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
