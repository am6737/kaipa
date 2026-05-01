import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../discover/data/route_repository.dart';
import '../../profile/data/profile_repository.dart';
import '../data/departure_flow_provider.dart';
import '../data/trip_repository.dart';

class SafetyConfirmScreen extends ConsumerStatefulWidget {
  final String routeId;
  const SafetyConfirmScreen({super.key, required this.routeId});

  @override
  ConsumerState<SafetyConfirmScreen> createState() =>
      _SafetyConfirmScreenState();
}

class _SafetyConfirmScreenState extends ConsumerState<SafetyConfirmScreen> {
  bool _locationSharing = true;
  bool _sosEnabled = true;
  bool _isCreating = false;

  String? _contactName;
  String? _contactPhone;
  String? _contactRelation;

  @override
  void initState() {
    super.initState();
    _loadEmergencyContact();
  }

  Future<void> _loadEmergencyContact() async {
    try {
      final repo = ref.read(profileRepositoryProvider);
      final contact = await repo.getEmergencyContact();
      if (contact != null && mounted) {
        setState(() {
          _contactName = contact['name'] as String?;
          _contactPhone = contact['phone'] as String?;
          _contactRelation = contact['relationship'] as String?;
        });
      }
    } catch (_) {}
  }

  Future<void> _onStartNavigation() async {
    if (_isCreating) return;
    setState(() => _isCreating = true);

    try {
      if (_contactName != null && _contactPhone != null) {
        final profileRepo = ref.read(profileRepositoryProvider);
        await profileRepo.updateEmergencyContact({
          'name': _contactName,
          'phone': _contactPhone,
          'relationship': _contactRelation ?? '',
        });
      }

      final flow = ref.read(departureFlowProvider(widget.routeId));

      ref.read(departureFlowProvider(widget.routeId).notifier).setSafety({
        'location_sharing': _locationSharing,
        'sos_enabled': _sosEnabled,
      });

      final tripRepo = ref.read(tripRepositoryProvider);
      final trip = await tripRepo.createTrip(
        routeId: widget.routeId,
        gearUsed: flow.selectedGearIds,
        weatherSummary: flow.selectedDate != null
            ? {
                'date': flow.selectedDate,
                'departure_time': flow.departureTime,
              }
            : null,
        safetySettings: {
          'location_sharing': _locationSharing,
          'sos_enabled': _sosEnabled,
        },
      );

      ref.read(departureFlowProvider(widget.routeId).notifier)
          .setTripId(trip.id);

      if (mounted) {
        context.go('/navigate/${widget.routeId}?tripId=${trip.id}');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isCreating = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('创建行程失败: $e')),
        );
      }
    }
  }

  void _showEditContactSheet() {
    final nameCtrl = TextEditingController(text: _contactName ?? '');
    final phoneCtrl = TextEditingController(text: _contactPhone ?? '');
    final relationCtrl = TextEditingController(text: _contactRelation ?? '');
    final tokens = ref.read(kaipaTokensProvider);
    final colors = tokens.color;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '紧急联系人',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameCtrl,
              decoration: InputDecoration(
                labelText: '姓名',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: '电话',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: relationCtrl,
              decoration: InputDecoration(
                labelText: '关系',
                hintText: '如：妻子、父亲、朋友',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () {
                  setState(() {
                    _contactName = nameCtrl.text.isEmpty ? null : nameCtrl.text;
                    _contactPhone = phoneCtrl.text.isEmpty ? null : phoneCtrl.text;
                    _contactRelation = relationCtrl.text.isEmpty ? null : relationCtrl.text;
                  });
                  Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('保存'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(widget.routeId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              16, MediaQuery.of(context).padding.top + 12, 16, 120,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(colors),
                const SizedBox(height: 20),
                _buildEmergencyContactCard(colors),
                const SizedBox(height: 10),
                routeAsync.when(
                  data: (route) => _buildEtaCard(colors, route.estimatedDuration),
                  loading: () => _buildEtaCard(colors, const Duration(hours: 5)),
                  error: (_, _) => _buildEtaCard(colors, const Duration(hours: 5)),
                ),
                const SizedBox(height: 10),
                _buildToggleCard(
                  colors,
                  icon: KaipaIcons.pin,
                  title: '实时位置共享',
                  desc: '家人/朋友可查看实时位置',
                  value: _locationSharing,
                  onChanged: (v) => setState(() => _locationSharing = v),
                ),
                const SizedBox(height: 10),
                _buildCheckCard(
                  colors,
                  icon: KaipaIcons.map,
                  title: '离线地图已下载',
                  desc: '覆盖 60 km² · 32 MB',
                ),
                const SizedBox(height: 10),
                _buildToggleCard(
                  colors,
                  icon: KaipaIcons.alert,
                  title: '一键 SOS',
                  desc: '长按触发 · 拨打 110 + 通知紧急联系人',
                  value: _sosEnabled,
                  onChanged: (v) => setState(() => _sosEnabled = v),
                  isDanger: true,
                ),
              ],
            ),
          ),
          _buildCta(colors),
        ],
      ),
    );
  }

  Widget _buildHeader(KaipaColors colors) {
    return Row(
      children: [
        CircleButton(
          icon: KaipaIcons.back,
          size: 36,
          iconSize: 15,
          onTap: () => context.pop(),
        ),
        const Spacer(),
        Text(
          '第 3 步 / 共 3 步',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.inkMuted,
            letterSpacing: -0.1,
          ),
        ),
        const Spacer(),
        const SizedBox(width: 36),
      ],
    );
  }

  Widget _buildEmergencyContactCard(KaipaColors colors) {
    final hasContact = _contactName != null && _contactPhone != null;
    return GestureDetector(
      onTap: _showEditContactSheet,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: KaipaIcon(
                  name: KaipaIcons.users,
                  size: 18,
                  color: colors.flare,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '紧急联系人',
                    style: TextStyle(fontSize: 11, color: colors.inkMuted),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hasContact
                        ? '$_contactName · $_contactRelation'
                        : '请设置紧急联系人',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: hasContact ? colors.ink : colors.flare,
                      letterSpacing: -0.2,
                    ),
                  ),
                ],
              ),
            ),
            KaipaIcon(name: KaipaIcons.forward, size: 14, color: colors.inkMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildEtaCard(KaipaColors colors, Duration estimatedDuration) {
    final eta = DateTime.now().add(estimatedDuration);
    final weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    final weekday = weekdays[eta.weekday - 1];
    final timeStr = '${eta.hour.toString().padLeft(2, '0')}:${eta.minute.toString().padLeft(2, '0')}';

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
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.mossSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: KaipaIcon(name: KaipaIcons.clock, size: 18, color: colors.mossDeep),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('预计返回时间', style: TextStyle(fontSize: 11, color: colors.inkMuted)),
                const SizedBox(height: 2),
                Text(
                  '$weekday $timeStr',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
              ],
            ),
          ),
          Text('超时自动通知', style: TextStyle(fontSize: 11, color: colors.inkMuted)),
        ],
      ),
    );
  }

  Widget _buildToggleCard(
    KaipaColors colors, {
    required String icon,
    required String title,
    required String desc,
    required bool value,
    required ValueChanged<bool> onChanged,
    bool isDanger = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDanger ? const Color(0x0DC0392B) : colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDanger ? const Color(0x33C0392B) : colors.line,
          width: 0.5,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isDanger ? const Color(0x1AC0392B) : colors.mossSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: KaipaIcon(
                name: icon,
                size: 18,
                color: isDanger ? const Color(0xFFC0392B) : colors.mossDeep,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2)),
                const SizedBox(height: 2),
                Text(desc, style: TextStyle(fontSize: 11.5, color: colors.inkMuted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => onChanged(!value),
            child: Container(
              width: 42,
              height: 25,
              decoration: BoxDecoration(
                color: value ? (isDanger ? const Color(0xFFC0392B) : colors.flare) : colors.line,
                borderRadius: BorderRadius.circular(99),
              ),
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeInOut,
                alignment: value ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 21,
                  height: 21,
                  margin: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckCard(
    KaipaColors colors, {
    required String icon,
    required String title,
    required String desc,
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
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: colors.mossSoft, borderRadius: BorderRadius.circular(12)),
            child: Center(child: KaipaIcon(name: icon, size: 18, color: colors.mossDeep)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2)),
                const SizedBox(height: 2),
                Text(desc, style: TextStyle(fontSize: 11.5, color: colors.inkMuted)),
              ],
            ),
          ),
          Icon(Icons.check_circle_rounded, size: 22, color: colors.mossDeep),
        ],
      ),
    );
  }

  Widget _buildCta(KaipaColors colors) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [colors.bg.withAlpha(0), colors.bg],
            stops: const [0.0, 0.4],
          ),
        ),
        padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding + 16),
        child: GestureDetector(
          onTap: _isCreating ? null : _onStartNavigation,
          child: Container(
            height: 54,
            decoration: BoxDecoration(
              color: _isCreating ? colors.surfaceHi : colors.flare,
              borderRadius: BorderRadius.circular(16),
              boxShadow: _isCreating ? null : [
                BoxShadow(color: colors.flare.withAlpha(77), blurRadius: 12, offset: const Offset(0, 4)),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_isCreating)
                  SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: colors.inkMuted),
                  )
                else ...[
                  const Text('一切就绪 · 开始导航', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
                  const SizedBox(width: 6),
                  KaipaIcon(name: KaipaIcons.navigate, size: 16, color: Colors.white),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
