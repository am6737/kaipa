import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;
  String _selectedDifficulty = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_page < 2) {
      _controller.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    } else {
      context.go('/discover');
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                children: [
                  _welcomePage(tokens, colors),
                  _difficultyPage(tokens, colors),
                  _permissionsPage(tokens, colors),
                ],
              ),
            ),
            // Page dots
            Padding(
              padding: const EdgeInsets.only(bottom: 40, top: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(3, (i) => Container(
                  width: i == _page ? 24 : 8,
                  height: 8,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(4),
                    color: i == _page ? colors.flare : colors.inkDim.withAlpha(60),
                  ),
                )),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _welcomePage(KaipaTokens tokens, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 100, height: 100,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.flareSoft,
            ),
            child: Icon(Icons.terrain, size: 56, color: colors.flare),
          ),
          const SizedBox(height: 32),
          Text('Kaipa', style: TextStyle(fontSize: 40, fontWeight: FontWeight.w800, color: colors.ink, letterSpacing: -1)),
          const SizedBox(height: 8),
          Text('探索每一座山', style: TextStyle(fontSize: 18, color: colors.flare, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          Text(
            '你的户外徒步伴侣，帮你发现路线、管理装备、记录每一次冒险。',
            style: TextStyle(fontSize: 15, color: colors.inkMuted, height: 1.5),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 40),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _nextPage,
              child: const Text('开始'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _difficultyPage(KaipaTokens tokens, KaipaColors colors) {
    final options = [
      {'id': 'easy', 'label': '入门', 'desc': '偶尔散步，想开始徒步', 'color': colors.moss},
      {'id': 'moderate', 'label': '中等', 'desc': '有一些徒步经验', 'color': colors.sand},
      {'id': 'hard', 'label': '困难', 'desc': '经常户外活动', 'color': colors.flare},
      {'id': 'expert', 'label': '专家', 'desc': '资深户外爱好者', 'color': colors.diff.extreme},
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 40),
          Text('你的徒步经验', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.5)),
          const SizedBox(height: 8),
          Text('我们会根据你的经验推荐合适的路线', style: TextStyle(fontSize: 14, color: colors.inkMuted)),
          const SizedBox(height: 32),
          ...options.map((o) {
            final selected = _selectedDifficulty == o['id'];
            final color = o['color'] as Color;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GestureDetector(
                onTap: () => setState(() => _selectedDifficulty = o['id'] as String),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: selected ? color.withAlpha(20) : colors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: selected ? color : colors.line, width: selected ? 1.5 : 0.5),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: color.withAlpha(25),
                        ),
                        child: Icon(Icons.terrain, color: color, size: 20),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(o['label'] as String, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: colors.ink)),
                            Text(o['desc'] as String, style: TextStyle(fontSize: 12, color: colors.inkMuted)),
                          ],
                        ),
                      ),
                      if (selected) Icon(Icons.check_circle, color: color, size: 22),
                    ],
                  ),
                ),
              ),
            );
          }),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _selectedDifficulty.isNotEmpty ? _nextPage : null,
              child: const Text('下一步'),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _permissionsPage(KaipaTokens tokens, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 40),
          Text('开启重要权限', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.5)),
          const SizedBox(height: 8),
          Text('这些权限帮助我们提供更好的服务', style: TextStyle(fontSize: 14, color: colors.inkMuted)),
          const SizedBox(height: 32),
          _permissionCard(
            icon: Icons.location_on,
            title: '位置权限',
            desc: '用于导航、记录轨迹和显示附近路线',
            colors: colors,
            tokens: tokens,
          ),
          const SizedBox(height: 12),
          _permissionCard(
            icon: Icons.notifications,
            title: '通知权限',
            desc: '接收天气预警、好友动态和安全提醒',
            colors: colors,
            tokens: tokens,
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => context.go('/discover'),
              child: const Text('完成'),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => context.go('/discover'),
              child: Text('稍后设置', style: TextStyle(color: colors.inkMuted)),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _permissionCard({
    required IconData icon,
    required String title,
    required String desc,
    required KaipaColors colors,
    required KaipaTokens tokens,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: colors.flareSoft,
            ),
            child: Icon(icon, color: colors.flare, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)),
                const SizedBox(height: 2),
                Text(desc, style: TextStyle(fontSize: 12, color: colors.inkMuted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$title 已开启'), duration: const Duration(seconds: 1)),
              );
            },
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(60, 34),
              textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            child: const Text('允许'),
          ),
        ],
      ),
    );
  }
}
