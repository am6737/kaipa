import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/profile_repository.dart';
import '../domain/profile_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/stat_widget.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final profileAsync = ref.watch(currentProfileProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: profileAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: colors.flare)),
        error: (e, _) => _buildDemoProfile(tokens, colors, context),
        data: (profile) => _buildProfile(profile, tokens, colors, context, ref),
      ),
    );
  }

  Widget _buildDemoProfile(KaipaTokens tokens, KaipaColors colors, BuildContext context) {
    return _buildProfileContent(
      tokens: tokens,
      colors: colors,
      context: context,
      displayName: '山行者',
      username: '@hiker_demo',
      bio: '热爱户外，每周末都要爬山',
      totalDistance: 342.5,
      totalElevation: 18720,
      totalTrips: 47,
    );
  }

  Widget _buildProfile(ProfileModel profile, KaipaTokens tokens, KaipaColors colors, BuildContext context, WidgetRef ref) {
    return _buildProfileContent(
      tokens: tokens,
      colors: colors,
      context: context,
      displayName: profile.displayName,
      username: '@${profile.username}',
      bio: profile.bio ?? '',
      totalDistance: profile.totalDistanceKm,
      totalElevation: profile.totalElevationM,
      totalTrips: profile.totalTrips.toDouble(),
    );
  }

  Widget _buildProfileContent({
    required KaipaTokens tokens,
    required KaipaColors colors,
    required BuildContext context,
    required String displayName,
    required String username,
    required String bio,
    required double totalDistance,
    required double totalElevation,
    required double totalTrips,
  }) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Action row
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  icon: Icon(Icons.notifications_outlined, color: colors.ink),
                  onPressed: () => context.push('/notifications'),
                ),
                IconButton(
                  icon: Icon(Icons.settings_outlined, color: colors.ink),
                  onPressed: () => context.push('/settings'),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Avatar
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.flare,
              ),
              child: Center(
                child: Text(
                  displayName.isNotEmpty ? displayName[0] : '?',
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(displayName, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.5)),
            const SizedBox(height: 4),
            Text(username, style: TextStyle(fontSize: 14, color: colors.inkMuted)),
            if (bio.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(bio, style: TextStyle(fontSize: 14, color: colors.inkMuted), textAlign: TextAlign.center),
            ],
            const SizedBox(height: 24),

            // Stats row
            Container(
              padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Row(
                children: [
                  Expanded(child: StatWidget(value: totalDistance.toStringAsFixed(1), unit: 'km', label: '总里程', tokens: tokens)),
                  Container(width: 0.5, height: 40, color: colors.line),
                  Expanded(child: StatWidget(value: '${totalElevation.round()}', unit: 'm', label: '总爬升', tokens: tokens)),
                  Container(width: 0.5, height: 40, color: colors.line),
                  Expanded(child: StatWidget(value: '${totalTrips.round()}', label: '总行程', tokens: tokens)),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Achievement badges
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('成就徽章', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _badge('首次登顶', Icons.flag, colors),
                        _badge('周末战士', Icons.terrain, colors),
                        _badge('百公里', Icons.route, colors),
                        _badge('万米爬升', Icons.trending_up, colors),
                        _badge('装备达人', Icons.backpack, colors),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Quick actions
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Column(
                children: [
                  _actionTile('导入 GPX 路线', Icons.file_upload_outlined, colors, () => context.push('/gpx-import')),
                  Divider(color: colors.line, height: 1),
                  _actionTile('发布路线', Icons.add_location_alt_outlined, colors, () => context.push('/route-publish')),
                  Divider(color: colors.line, height: 1),
                  _actionTile('我的装备', Icons.backpack_outlined, colors, () => context.go('/gear')),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _badge(String name, IconData icon, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.only(right: 16),
      child: Column(
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.flareSoft,
            ),
            child: Icon(icon, size: 22, color: colors.flare),
          ),
          const SizedBox(height: 6),
          Text(name, style: TextStyle(fontSize: 10, color: colors.inkMuted)),
        ],
      ),
    );
  }

  Widget _actionTile(String label, IconData icon, KaipaColors colors, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: colors.ink),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: TextStyle(fontSize: 15, color: colors.ink))),
            Icon(Icons.chevron_right, size: 18, color: colors.inkDim),
          ],
        ),
      ),
    );
  }
}
