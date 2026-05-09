import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart' hide Path;
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../discover/data/route_repository.dart';
import '../data/gpx_repository.dart';
import '../domain/gpx_route_model.dart';

// =============================================================================
// GPX Import Screen — 3-step wizard
// =============================================================================

class GpxImportScreen extends ConsumerStatefulWidget {
  const GpxImportScreen({super.key});

  @override
  ConsumerState<GpxImportScreen> createState() => _GpxImportScreenState();
}

class _GpxImportScreenState extends ConsumerState<GpxImportScreen> {
  int _step = 0;
  bool _parsing = false;
  String? _error;
  GpxRouteModel? _parsedRoute;
  String _fileName = '';

  // Step 3 form state
  String _routeName = '';
  String _selectedType = '徒步';
  String _selectedDifficulty = 'moderate';
  String _selectedRegion = '';
  bool _regionLoading = false;
  String _visibility = 'public';
  String _notes = '';
  Uint8List? _coverImageBytes;
  String? _coverImageName;

  final _nameController = TextEditingController();
  final _regionController = TextEditingController();
  final _notesController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _regionController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _goToStep(int step) {
    setState(() => _step = step.clamp(0, 2));
  }

  Future<void> _pickAndParseFile() async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['gpx', 'kml'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.single;
      final bytes = file.bytes;
      if (bytes == null) return;

      setState(() {
        _parsing = true;
        _error = null;
        _fileName = file.name;
      });

      final content = utf8.decode(bytes, allowMalformed: true);
      final gpxRepo = ref.read(gpxRepositoryProvider);
      final parsed = gpxRepo.parseGpxContent(content, fileName: file.name);

      if (parsed.points.isEmpty) {
        setState(() {
          _parsing = false;
          _error = '文件中没有找到有效轨迹点';
        });
        return;
      }

      // Auto-fill step 3 fields
      _routeName = parsed.name ?? file.name.replaceAll(RegExp(r'\.[^.]+$'), '');

      setState(() {
        _parsedRoute = parsed;
        _parsing = false;
        _routeName = _routeName;
      });

      _nameController.text = _routeName;
      _goToStep(1);
      _reverseGeocodeRegion(parsed);
    } catch (e) {
      setState(() {
        _parsing = false;
        _error = '文件解析失败: $e';
      });
    }
  }

  Future<void> _reverseGeocodeRegion(GpxRouteModel route) async {
    if (route.points.isEmpty) return;
    setState(() => _regionLoading = true);
    try {
      final mid = route.points[route.points.length ~/ 2];
      final uri = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse?lat=${mid.latitude}&lon=${mid.longitude}&format=json&accept-language=zh&zoom=10',
      );
      final resp = await http.get(uri, headers: {'User-Agent': 'Kaipa/1.0'});
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body) as Map<String, dynamic>;
        final addr = data['address'] as Map<String, dynamic>?;
        if (addr != null) {
          final state = addr['state'] as String? ?? '';
          final city = addr['city'] as String? ?? addr['county'] as String? ?? '';
          final region = city.isNotEmpty ? '$state$city' : state;
          if (region.isNotEmpty && mounted) {
            setState(() {
              _selectedRegion = region;
              _regionController.text = region;
            });
          }
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _regionLoading = false);
  }

  Future<void> _openRegionMapPicker(KaipaColors colors) async {
    final route = _parsedRoute;
    if (route == null || route.points.isEmpty) return;

    final mid = route.points[route.points.length ~/ 2];
    final initialCenter = LatLng(mid.latitude, mid.longitude);

    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RegionMapPicker(
        initialCenter: initialCenter,
        colors: colors,
      ),
    );

    if (result != null && result.isNotEmpty && mounted) {
      setState(() {
        _selectedRegion = result;
        _regionController.text = result;
      });
    }
  }

  Future<void> _pickCoverImage() async {
    final result = await FilePicker.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    if (file.bytes == null) return;
    setState(() {
      _coverImageBytes = file.bytes;
      _coverImageName = file.name;
    });
  }

  Future<void> _saveRoute() async {
    if (_parsedRoute == null) return;
    try {
      final gpxRepo = ref.read(gpxRepositoryProvider);

      String? coverUrl;
      if (_coverImageBytes != null && _coverImageName != null) {
        coverUrl = await gpxRepo.uploadRouteCover(
          bytes: _coverImageBytes!,
          fileName: _coverImageName!,
        );
      }

      await gpxRepo.saveRoute(
        gpxRoute: _parsedRoute!,
        name: _routeName,
        description: _notes.isNotEmpty ? _notes : _parsedRoute!.description,
        difficulty: _selectedDifficulty,
        region: _selectedRegion.isNotEmpty ? _selectedRegion : null,
        coverImageUrl: coverUrl,
      );

      ref.invalidate(allRoutesProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('路线已保存')),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          Column(
            children: [
              _buildHeader(context, colors),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  switchInCurve: Curves.easeOut,
                  switchOutCurve: Curves.easeIn,
                  child: _step == 0
                      ? _buildStep1(colors)
                      : _step == 1
                          ? _buildStep2(colors)
                          : _buildStep3(colors),
                ),
              ),
            ],
          ),
          _buildFooter(context, colors),
        ],
      ),
    );
  }

  // ─── Header ────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, KaipaColors colors) {
    final topPadding = MediaQuery.of(context).padding.top;
    const stepLabels = ['上传文件', '预览校验', '命名保存'];

    return Container(
      padding: EdgeInsets.only(top: topPadding + 8, bottom: 16),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(bottom: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => context.pop(),
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: colors.surfaceHi,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: KaipaIcon(
                        name: KaipaIcons.chevronLeft,
                        size: 16,
                        color: colors.ink,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('导入 GPX 路线',
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
                      const SizedBox(height: 2),
                      Text('从手表、佳明 Connect、两步路、Strava 等',
                          style: TextStyle(fontSize: 11, color: colors.inkMuted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: List.generate(5, (i) {
                if (i.isOdd) {
                  return Expanded(
                    child: Container(
                      height: 2,
                      color: (i ~/ 2) < _step ? colors.flare : colors.line,
                    ),
                  );
                }
                final si = i ~/ 2;
                return _buildStepCircle(colors, si, si < _step, si == _step);
              }),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(3, (i) {
                final isCurrent = i == _step;
                return Expanded(
                  child: Text(stepLabels[i], textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12,
                        fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w400,
                        color: i < _step ? colors.flare : isCurrent ? colors.ink : colors.inkMuted)),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepCircle(KaipaColors colors, int step, bool isDone, bool isCurrent) {
    if (isDone) {
      return Container(width: 22, height: 22,
          decoration: BoxDecoration(color: colors.flare, shape: BoxShape.circle),
          child: const Center(child: Icon(Icons.check, size: 13, color: Colors.white)));
    }
    if (isCurrent) {
      return Container(width: 22, height: 22,
          decoration: BoxDecoration(color: colors.flareSoft, shape: BoxShape.circle,
              border: Border.all(color: colors.flare, width: 1.5)),
          child: Center(child: Text('${step + 1}',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.flare))));
    }
    return Container(width: 22, height: 22,
        decoration: BoxDecoration(color: colors.surfaceHi, shape: BoxShape.circle),
        child: Center(child: Text('${step + 1}',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.inkDim))));
  }

  // ─── Footer ────────────────────────────────────────────────────────

  Widget _buildFooter(BuildContext context, KaipaColors colors) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final ctaLabel = _parsing ? '解析中...' : _step == 0 ? '选择文件 →' : _step == 1 ? '继续 →' : '保存路线';

    return Positioned(
      left: 0, right: 0, bottom: 0,
      child: Container(
        padding: EdgeInsets.fromLTRB(16, 20, 16, bottomPadding + 16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [colors.bg.withAlpha(0), colors.bg],
            stops: const [0.0, 0.3],
          ),
        ),
        child: Row(children: [
          if (_step > 0) ...[
            Expanded(flex: 1, child: GestureDetector(
              onTap: () => _goToStep(_step - 1),
              child: Container(height: 50,
                decoration: BoxDecoration(color: colors.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: colors.line, width: 0.5)),
                child: Center(child: Text('上一步',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink)))),
            )),
            const SizedBox(width: 10),
          ],
          Expanded(flex: _step > 0 ? 2 : 1, child: GestureDetector(
            onTap: _parsing ? null : () {
              if (_step == 0) { _pickAndParseFile(); }
              else if (_step == 1) { _goToStep(2); }
              else { _saveRoute(); }
            },
            child: Container(height: 50,
              decoration: BoxDecoration(
                color: _parsing ? colors.inkDim : colors.flare,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: colors.flare.withAlpha(60), blurRadius: 12, offset: const Offset(0, 4))],
              ),
              child: Center(child: Text(ctaLabel,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)))),
          )),
        ]),
      ),
    );
  }

  // ─── Step 1: Upload ────────────────────────────────────────────────

  Widget _buildStep1(KaipaColors colors) {
    return SingleChildScrollView(
      key: const ValueKey('step1'),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF1E2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              const Icon(Icons.error_outline, size: 18, color: Color(0xFFE67E22)),
              const SizedBox(width: 8),
              Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12, color: Color(0xFFE67E22)))),
            ]),
          ),
        ],
        _buildDropZone(colors),
        const SizedBox(height: 24),
        Text('或从这些来源导入', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.inkMuted, letterSpacing: 0.5)),
        const SizedBox(height: 12),
        _buildSourceButton(colors, icon: KaipaIcons.phone, name: '从本机文件', hint: '.gpx · .kml · 选择文件', onTap: _pickAndParseFile),
        const SizedBox(height: 8),
        _buildSourceButton(colors, icon: KaipaIcons.cloud, name: '佳明 Connect', hint: '即将支持 · 23 条新轨迹', onTap: null),
        const SizedBox(height: 8),
        _buildSourceButton(colors, icon: KaipaIcons.download, name: '两步路 / 户外助手', hint: '即将支持 · 粘贴分享链接', onTap: null),
        const SizedBox(height: 8),
        _buildSourceButton(colors, icon: KaipaIcons.globe, name: 'Strava', hint: '即将支持 · 需连接账号', onTap: null),
      ]),
    );
  }

  Widget _buildDropZone(KaipaColors colors) {
    return GestureDetector(
      onTap: _pickAndParseFile,
      child: CustomPaint(
        painter: _DashedBorderPainter(color: colors.flare, strokeWidth: 1.5, borderRadius: 20, dashLength: 8, gapLength: 5),
        child: Container(
          width: double.infinity, height: 180,
          decoration: BoxDecoration(color: colors.flareSoft, borderRadius: BorderRadius.circular(20)),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(width: 56, height: 56,
              decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black.withAlpha(20), blurRadius: 12, offset: const Offset(0, 4))]),
              child: Center(child: KaipaIcon(name: _parsing ? KaipaIcons.light : KaipaIcons.upload, size: 22, color: colors.flare))),
            const SizedBox(height: 12),
            Text(_parsing ? '正在解析...' : '点击选择 .gpx 或 .kml 文件',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3)),
            const SizedBox(height: 4),
            Text('支持 .gpx · .kml', style: TextStyle(fontSize: 11, color: colors.inkMuted)),
          ]),
        ),
      ),
    );
  }

  Widget _buildSourceButton(KaipaColors colors,
      {required String icon, required String name, required String hint, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.line, width: 0.5)),
        child: Row(children: [
          Container(width: 38, height: 38,
            decoration: BoxDecoration(color: colors.surfaceHi, shape: BoxShape.circle),
            child: Center(child: KaipaIcon(name: icon, size: 18, color: colors.ink))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.ink)),
            const SizedBox(height: 1),
            Text(hint, style: TextStyle(fontSize: 11, color: colors.inkMuted)),
          ])),
          KaipaIcon(name: KaipaIcons.chevronRight, size: 16, color: colors.inkDim),
        ]),
      ),
    );
  }

  // ─── Step 2: Preview ───────────────────────────────────────────────

  Widget _buildStep2(KaipaColors colors) {
    final route = _parsedRoute;
    if (route == null) return const SizedBox.shrink();

    return SingleChildScrollView(
      key: const ValueKey('step2'),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _buildTrackMapPreview(colors, route),
        const SizedBox(height: 14),
        _buildFileInfoBar(colors, route),
        const SizedBox(height: 14),
        _buildStatsGrid(colors, route),
        const SizedBox(height: 14),
        _buildElevationPreview(colors, route),
      ]),
    );
  }

  Widget _buildTrackMapPreview(KaipaColors colors, GpxRouteModel route) {
    final trackPoints = route.points
        .map((p) => LatLng(p.latitude, p.longitude))
        .toList();
    if (trackPoints.isEmpty) return const SizedBox.shrink();

    double south = trackPoints.first.latitude;
    double north = south;
    double west = trackPoints.first.longitude;
    double east = west;
    for (final p in trackPoints) {
      if (p.latitude < south) south = p.latitude;
      if (p.latitude > north) north = p.latitude;
      if (p.longitude < west) west = p.longitude;
      if (p.longitude > east) east = p.longitude;
    }
    final bounds = LatLngBounds(LatLng(south, west), LatLng(north, east));
    final center = bounds.center;
    final latSpan = north - south;
    final lngSpan = east - west;
    final maxSpan = math.max(latSpan, lngSpan);
    double zoom = 13.0;
    if (maxSpan > 0) {
      zoom = (math.log(360 / maxSpan) / math.ln2).clamp(3.0, 17.0) - 0.5;
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 220,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: zoom,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
              userAgentPackageName: 'com.kaipa.app',
            ),
            PolylineLayer(polylines: [
              Polyline(points: trackPoints, color: colors.flare, strokeWidth: 3),
            ]),
            MarkerLayer(markers: [
              Marker(
                point: trackPoints.first, width: 20, height: 20,
                child: Container(decoration: BoxDecoration(
                  color: colors.moss, shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                )),
              ),
              Marker(
                point: trackPoints.last, width: 20, height: 20,
                child: Container(decoration: BoxDecoration(
                  color: colors.flare, shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                )),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _buildFileInfoBar(KaipaColors colors, GpxRouteModel route) {
    final ext = _fileName.endsWith('.kml') ? 'KML' : 'GPX';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5)),
      child: Row(children: [
        Container(width: 32, height: 32,
          decoration: BoxDecoration(color: colors.flareSoft, shape: BoxShape.circle),
          child: Center(child: Text(ext,
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: colors.flare)))),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_fileName, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.ink)),
          const SizedBox(height: 1),
          Text('${route.stats.totalDistanceKm.toStringAsFixed(1)} km · ${route.points.length} 个轨迹点',
              style: TextStyle(fontSize: 11, color: colors.inkMuted)),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: const Color(0xFFE8F4EA), borderRadius: BorderRadius.circular(999)),
          child: Text('已识别', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: colors.moss)),
        ),
      ]),
    );
  }

  Widget _buildStatsGrid(KaipaColors colors, GpxRouteModel route) {
    final s = route.stats;
    final durationMin = s.totalDuration?.inMinutes ?? ((s.totalDistanceKm / 3.0) * 60).round();
    final h = durationMin ~/ 60;
    final m = durationMin % 60;
    final durationStr = h > 0 ? '${h}h${m}m' : '${m}m';
    final speed = s.avgSpeedKmh ?? s.totalDistanceKm / (durationMin / 60);

    final stats = [
      _StatData('距离', s.totalDistanceKm.toStringAsFixed(1), 'km'),
      _StatData('爬升', '${s.totalElevationGainM.round()}', 'm'),
      _StatData('时长', durationStr, ''),
      _StatData('速度', speed.toStringAsFixed(1), 'km/h'),
    ];

    return Row(children: stats.map((st) {
      return Expanded(child: Container(
        margin: EdgeInsets.only(right: st == stats.last ? 0 : 6),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(10),
            border: Border.all(color: colors.line, width: 0.5)),
        child: Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic, children: [
            Text(st.value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.ink)),
            if (st.unit.isNotEmpty) Text(st.unit, style: TextStyle(fontSize: 9, color: colors.inkMuted)),
          ]),
          const SizedBox(height: 2),
          Text(st.label, style: TextStyle(fontSize: 10, color: colors.inkMuted)),
        ]),
      ));
    }).toList());
  }

  Widget _buildElevationPreview(KaipaColors colors, GpxRouteModel route) {
    final minElev = route.stats.minElevationM.round();
    final maxElev = route.stats.maxElevationM.round();
    final gain = route.stats.totalElevationGainM.round();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5)),
      child: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('海拔剖面', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.ink)),
          Row(children: [
            Text('$minElev → ${maxElev}m  ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted)),
            Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: colors.flareSoft, borderRadius: BorderRadius.circular(4)),
                child: Text('+$gain m', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: colors.flare))),
          ]),
        ]),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, height: 80,
          child: CustomPaint(size: const Size(double.infinity, 80),
            painter: _RealElevationPainter(lineColor: colors.flare, points: route.points))),
      ]),
    );
  }

  // ─── Step 3: Save ──────────────────────────────────────────────────

  Widget _buildStep3(KaipaColors colors) {
    String diffText(String d) {
      switch (d) {
        case 'easy': return '简单';
        case 'moderate': return '中等';
        case 'hard': return '困难';
        case 'expert': return '专家';
        default: return '中等';
      }
    }

    final route = _parsedRoute;
    final autoDiff = _autoDifficulty(route);

    return SingleChildScrollView(
      key: const ValueKey('step3'),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _buildFieldLabel(colors, '路线名称'),
        TextField(controller: _nameController,
            onChanged: (v) => _routeName = v,
            style: TextStyle(fontSize: 14, color: colors.ink),
            decoration: _inputDeco(colors)),
        const SizedBox(height: 20),
        _buildFieldLabel(colors, '封面图片'),
        _buildCoverImagePicker(colors),
        const SizedBox(height: 20),
        _buildFieldLabel(colors, '所在区域'),
        Row(children: [
          Expanded(child: TextField(
              controller: _regionController,
              onChanged: (v) => _selectedRegion = v,
              style: TextStyle(fontSize: 14, color: colors.ink),
              decoration: _inputDeco(colors).copyWith(
                hintText: _regionLoading ? '自动识别中…' : '点击右侧按钮选取位置',
                suffixIcon: _regionLoading
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: SizedBox(width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2)))
                    : _selectedRegion.isNotEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(14),
                            child: Icon(Icons.check_circle, size: 18, color: Color(0xFF4CAF50)))
                        : null,
              ))),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _openRegionMapPicker(colors),
            child: Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.map_outlined, color: Colors.white, size: 22),
            ),
          ),
        ]),
        const SizedBox(height: 20),
        _buildFieldLabel(colors, '活动类型'),
        _buildTypePills(colors),
        const SizedBox(height: 20),
        _buildFieldLabel(colors, '难度评估'),
        _buildDifficultyPicker(colors, autoDiff, diffText),
        const SizedBox(height: 20),
        _buildFieldLabel(colors, '可见范围'),
        _buildVisibilityOptions(colors),
        const SizedBox(height: 20),
        _buildFieldLabel(colors, '备注'),
        TextField(controller: _notesController,
            onChanged: (v) => _notes = v,
            maxLines: 4,
            style: TextStyle(fontSize: 14, color: colors.ink, height: 1.5),
            decoration: _inputDeco(colors)),
      ]),
    );
  }

  InputDecoration _inputDeco(KaipaColors colors) => InputDecoration(
    filled: true, fillColor: colors.surface,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line, width: 0.5)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line, width: 0.5)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.flare, width: 1)),
  );

  String _autoDifficulty(GpxRouteModel? route) {
    if (route == null) return 'moderate';
    final km = route.stats.totalDistanceKm;
    final gain = route.stats.totalElevationGainM;
    if (km > 50 || gain > 3000) return 'expert';
    if (km > 25 || gain > 1500) return 'hard';
    if (km > 10 || gain > 500) return 'moderate';
    return 'easy';
  }

  Widget _buildCoverImagePicker(KaipaColors colors) {
    if (_coverImageBytes != null) {
      return Stack(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.memory(_coverImageBytes!, width: double.infinity, height: 160, fit: BoxFit.cover),
        ),
        Positioned(top: 8, right: 8, child: GestureDetector(
          onTap: () => setState(() { _coverImageBytes = null; _coverImageName = null; }),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
            child: const Icon(Icons.close, color: Colors.white, size: 16),
          ),
        )),
        Positioned(bottom: 8, right: 8, child: GestureDetector(
          onTap: _pickCoverImage,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(999)),
            child: const Text('更换', style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        )),
      ]);
    }

    return GestureDetector(
      onTap: _pickCoverImage,
      child: Container(
        width: double.infinity, height: 120,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.add_photo_alternate_outlined, size: 32, color: colors.inkMuted),
          const SizedBox(height: 8),
          Text('点击上传封面图片', style: TextStyle(fontSize: 12, color: colors.inkMuted)),
          const SizedBox(height: 2),
          Text('建议比例 16:9', style: TextStyle(fontSize: 10, color: colors.inkDim)),
        ]),
      ),
    );
  }

  Widget _buildFieldLabel(KaipaColors colors, String label) {
    return Padding(padding: const EdgeInsets.only(bottom: 8),
      child: Text(label.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: colors.inkMuted, letterSpacing: 0.5)));
  }

  Widget _buildTypePills(KaipaColors colors) {
    const types = ['徒步', '登山', '越野跑', '骑行', '溯溪'];
    return Wrap(spacing: 8, runSpacing: 8, children: types.map((type) {
      final selected = _selectedType == type;
      return GestureDetector(
        onTap: () => setState(() => _selectedType = type),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? colors.flare : colors.surface,
            borderRadius: BorderRadius.circular(999),
            border: selected ? null : Border.all(color: colors.line, width: 0.5)),
          child: Text(type, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
              color: selected ? Colors.white : colors.ink)),
        ),
      );
    }).toList());
  }

  Widget _buildDifficultyPicker(KaipaColors colors, String auto, String Function(String) label) {
    final difficulties = ['easy', 'moderate', 'hard', 'expert'];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: colors.diff.mod, borderRadius: BorderRadius.circular(999)),
            child: Text('${_selectedDifficulty == auto ? '自动' : ''} ${label(_selectedDifficulty)}',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
          const SizedBox(width: 10),
          Expanded(child: Text('自动评估: ${label(auto)}', style: TextStyle(fontSize: 11, color: colors.inkMuted))),
        ]),
        const SizedBox(height: 12),
        Row(children: difficulties.map((d) {
          final selected = _selectedDifficulty == d;
          final isAuto = d == auto;
          return Expanded(child: GestureDetector(
            onTap: () => setState(() => _selectedDifficulty = d),
            child: Container(
              margin: EdgeInsets.only(right: d == difficulties.last ? 0 : 4),
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: selected ? colors.flare : colors.surfaceHi,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(children: [
                Text(label(d), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : colors.ink)),
                if (isAuto) Text('推荐', style: TextStyle(fontSize: 9, color: selected ? Colors.white70 : colors.moss)),
              ]),
            ),
          ));
        }).toList()),
      ]),
    );
  }

  Widget _buildVisibilityOptions(KaipaColors colors) {
    final options = [
      _VisOpt('private', KaipaIcons.lock, '仅自己', '只有你能看到这条路线'),
      _VisOpt('friends', KaipaIcons.users, '好友可见', '你的好友可以查看和下载'),
      _VisOpt('public', KaipaIcons.globe, '公开', '所有人可以发现这条路线'),
    ];

    return Container(
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5)),
      child: Column(children: options.asMap().entries.map((entry) {
        final i = entry.key;
        final opt = entry.value;
        final selected = _visibility == opt.key;
        return Column(children: [
          if (i > 0) Divider(height: 0.5, thickness: 0.5, color: colors.line),
          GestureDetector(
            onTap: () => setState(() => _visibility = opt.key),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: selected ? colors.flareSoft : null,
                borderRadius: i == 0 ? const BorderRadius.vertical(top: Radius.circular(14))
                    : i == options.length - 1 ? const BorderRadius.vertical(bottom: Radius.circular(14)) : null),
              child: Row(children: [
                KaipaIcon(name: opt.icon, size: 18, color: selected ? colors.flare : colors.inkDim),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(opt.name, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: colors.ink)),
                  const SizedBox(height: 1),
                  Text(opt.description, style: TextStyle(fontSize: 10.5, color: colors.inkMuted)),
                ])),
                Container(width: 18, height: 18,
                  decoration: BoxDecoration(shape: BoxShape.circle,
                    color: selected ? colors.flare : null,
                    border: selected ? null : Border.all(color: colors.line, width: 1.5)),
                  child: selected ? const Center(child: Icon(Icons.check, size: 11, color: Colors.white)) : null),
              ]),
            ),
          ),
        ]);
      }).toList()),
    );
  }
}

// =============================================================================
// Data models
// =============================================================================

class _StatData {
  final String label, value, unit;
  const _StatData(this.label, this.value, this.unit);
}

class _VisOpt {
  final String key, icon, name, description;
  const _VisOpt(this.key, this.icon, this.name, this.description);
}

// =============================================================================
// Custom painters
// =============================================================================

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double strokeWidth, borderRadius, dashLength, gapLength;

  _DashedBorderPainter({required this.color, required this.strokeWidth,
      required this.borderRadius, required this.dashLength, required this.gapLength});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = strokeWidth;
    final rrect = RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, size.width, size.height), Radius.circular(borderRadius));
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final end = (distance + dashLength).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, end), paint);
        distance += dashLength + gapLength;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) => old.color != color || old.strokeWidth != strokeWidth;
}

class _RealElevationPainter extends CustomPainter {
  final Color lineColor;
  final List<GpxPoint> points;

  _RealElevationPainter({required this.lineColor, required this.points});

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final w = size.width;
    final h = size.height;

    final elevations = points.map((p) => p.elevation ?? 0).toList();
    final minE = elevations.reduce(math.min);
    final maxE = elevations.reduce(math.max);
    final range = (maxE - minE) == 0 ? 1.0 : maxE - minE;

    final pts = <Offset>[];
    for (int i = 0; i < points.length; i++) {
      final x = (i / (points.length - 1)) * w;
      final y = h - ((elevations[i] - minE) / range) * h * 0.8 - h * 0.1;
      pts.add(Offset(x, y));
    }

    final fillPath = Path()..moveTo(0, h);
    for (final p in pts) { fillPath.lineTo(p.dx, p.dy); }
    fillPath.lineTo(w, h);
    fillPath.close();

    canvas.drawPath(fillPath, Paint()..shader = LinearGradient(
      begin: Alignment.topCenter, end: Alignment.bottomCenter,
      colors: [lineColor.withAlpha(89), lineColor.withAlpha(0)],
    ).createShader(Rect.fromLTWH(0, 0, w, h)));

    final linePath = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (int i = 1; i < pts.length; i++) { linePath.lineTo(pts[i].dx, pts[i].dy); }
    canvas.drawPath(linePath, Paint()..color = lineColor..style = PaintingStyle.stroke..strokeWidth = 1.5..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_RealElevationPainter old) =>
      old.lineColor != lineColor || old.points != points;
}

// =============================================================================
// Region Map Picker — pick a location on map to reverse-geocode region name
// =============================================================================

class _RegionMapPicker extends StatefulWidget {
  final LatLng initialCenter;
  final KaipaColors colors;

  const _RegionMapPicker({required this.initialCenter, required this.colors});

  @override
  State<_RegionMapPicker> createState() => _RegionMapPickerState();
}

class _RegionMapPickerState extends State<_RegionMapPicker> {
  late final MapController _mapController;
  String _placeName = '';
  bool _loading = false;
  LatLng? _currentCenter;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    _currentCenter = widget.initialCenter;
    _geocodeCenter(widget.initialCenter);
  }

  Future<void> _geocodeCenter(LatLng pos) async {
    setState(() => _loading = true);
    try {
      final uri = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse?lat=${pos.latitude}&lon=${pos.longitude}&format=json&accept-language=zh&zoom=10',
      );
      final resp = await http.get(uri, headers: {'User-Agent': 'Kaipa/1.0'});
      if (resp.statusCode == 200 && mounted) {
        final data = json.decode(resp.body) as Map<String, dynamic>;
        final addr = data['address'] as Map<String, dynamic>?;
        if (addr != null) {
          final state = addr['state'] as String? ?? '';
          final city = addr['city'] as String? ?? addr['county'] as String? ?? '';
          final region = city.isNotEmpty ? '$state$city' : state;
          setState(() => _placeName = region);
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(children: [
        const SizedBox(height: 8),
        Container(width: 36, height: 4,
          decoration: BoxDecoration(color: colors.line, borderRadius: BorderRadius.circular(2))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('选择所在区域', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.ink)),
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Icon(Icons.close, color: colors.inkMuted, size: 22),
            ),
          ]),
        ),
        Expanded(
          child: Stack(children: [
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: widget.initialCenter,
                initialZoom: 10,
                onPositionChanged: (pos, _) {
                  _currentCenter = pos.center;
                },
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                  userAgentPackageName: 'com.kaipa.app',
                ),
              ],
            ),
            Center(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 36),
                child: Icon(Icons.location_on, size: 36, color: colors.flare),
              ),
            ),
          ]),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Row(children: [
              Icon(Icons.place, size: 18, color: colors.flare),
              const SizedBox(width: 8),
              Expanded(child: Text(
                _loading ? '识别中…' : (_placeName.isNotEmpty ? _placeName : '移动地图选择位置'),
                style: TextStyle(fontSize: 14, color: _placeName.isNotEmpty ? colors.ink : colors.inkMuted),
              )),
              if (!_loading)
                GestureDetector(
                  onTap: () {
                    if (_currentCenter != null) _geocodeCenter(_currentCenter!);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: colors.flareSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('识别', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.flare)),
                  ),
                ),
            ]),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: SizedBox(
              width: double.infinity, height: 48,
              child: ElevatedButton(
                onPressed: _placeName.isNotEmpty ? () => Navigator.pop(context, _placeName) : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  disabledBackgroundColor: colors.line,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Text('确认选择', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                    color: _placeName.isNotEmpty ? Colors.white : colors.inkMuted)),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
