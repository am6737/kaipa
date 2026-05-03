import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';

class CityData {
  final String name;
  final String letter;
  final double lat;
  final double lng;
  final double zoom;
  const CityData(this.name, this.letter, this.lat, this.lng, [this.zoom = 9.5]);
}

const _popularNames = ['北京', '成都', '杭州', '昆明', '拉萨', '丽江', '西安', '张家界'];

const _allCities = <CityData>[
  // A
  CityData('阿坝', 'A', 32.9, 101.7),
  CityData('安吉', 'A', 30.6, 119.7),
  CityData('安顺', 'A', 26.3, 105.9),
  CityData('鞍山', 'A', 41.1, 123.0),
  // B
  CityData('北京', 'B', 40.0, 116.4),
  CityData('保定', 'B', 38.9, 115.5),
  CityData('宝鸡', 'B', 34.4, 107.2),
  CityData('毕节', 'B', 27.3, 105.3),
  // C
  CityData('成都', 'C', 30.6, 104.1),
  CityData('重庆', 'C', 29.6, 106.5),
  CityData('长沙', 'C', 28.2, 112.9),
  CityData('承德', 'C', 41.0, 117.9),
  CityData('池州', 'C', 30.7, 117.5),
  CityData('郴州', 'C', 25.8, 113.0),
  // D
  CityData('大理', 'D', 25.6, 100.3),
  CityData('稻城', 'D', 29.0, 100.3),
  CityData('敦煌', 'D', 40.1, 94.7),
  CityData('大同', 'D', 40.1, 113.3),
  CityData('德宏', 'D', 24.4, 98.6),
  // E
  CityData('峨眉山', 'E', 29.6, 103.4),
  CityData('恩施', 'E', 30.3, 109.5),
  // F
  CityData('福州', 'F', 26.1, 119.3),
  CityData('抚州', 'F', 27.9, 116.4),
  // G
  CityData('广州', 'G', 23.1, 113.3),
  CityData('桂林', 'G', 25.3, 110.3),
  CityData('贵阳', 'G', 26.6, 106.7),
  CityData('甘南', 'G', 35.0, 102.9),
  CityData('甘孜', 'G', 31.6, 100.0),
  CityData('赣州', 'G', 25.8, 114.9),
  // H
  CityData('杭州', 'H', 30.3, 120.2),
  CityData('黄山', 'H', 30.1, 118.2),
  CityData('哈尔滨', 'H', 45.8, 126.5),
  CityData('合肥', 'H', 31.8, 117.2),
  CityData('呼伦贝尔', 'H', 49.2, 119.8),
  CityData('红河', 'H', 23.4, 103.4),
  // J
  CityData('九寨沟', 'J', 33.3, 103.9),
  CityData('吉林', 'J', 43.8, 126.6),
  CityData('济南', 'J', 36.7, 117.0),
  CityData('嘉兴', 'J', 30.8, 120.8),
  CityData('景德镇', 'J', 29.3, 117.2),
  // K
  CityData('昆明', 'K', 25.0, 102.7),
  CityData('喀什', 'K', 39.5, 76.0),
  // L
  CityData('拉萨', 'L', 29.7, 91.1),
  CityData('丽江', 'L', 26.9, 100.2),
  CityData('兰州', 'L', 36.1, 103.8),
  CityData('洛阳', 'L', 34.6, 112.5),
  CityData('林芝', 'L', 29.6, 94.4),
  CityData('乐山', 'L', 29.6, 103.8),
  CityData('六盘水', 'L', 26.6, 104.8),
  CityData('临沧', 'L', 23.9, 100.1),
  // M
  CityData('绵阳', 'M', 31.5, 104.7),
  CityData('梅州', 'M', 24.3, 116.1),
  // N
  CityData('南京', 'N', 32.1, 118.8),
  CityData('南宁', 'N', 22.8, 108.3),
  CityData('宁波', 'N', 29.9, 121.5),
  CityData('那曲', 'N', 31.5, 92.1),
  // P
  CityData('攀枝花', 'P', 26.6, 101.7),
  CityData('平遥', 'P', 37.2, 112.2),
  CityData('普洱', 'P', 22.8, 101.0),
  // Q
  CityData('青岛', 'Q', 36.1, 120.4),
  CityData('秦皇岛', 'Q', 39.9, 119.6),
  CityData('清远', 'Q', 23.7, 113.1),
  CityData('曲靖', 'Q', 25.5, 103.8),
  CityData('黔东南', 'Q', 26.6, 107.9),
  // R
  CityData('日喀则', 'R', 29.3, 88.9),
  CityData('日照', 'R', 35.4, 119.5),
  // S
  CityData('上海', 'S', 31.2, 121.5),
  CityData('深圳', 'S', 22.5, 114.1),
  CityData('三亚', 'S', 18.3, 109.5),
  CityData('苏州', 'S', 31.3, 120.6),
  CityData('神农架', 'S', 31.7, 110.7),
  CityData('韶关', 'S', 24.8, 113.6),
  CityData('松潘', 'S', 32.6, 103.6),
  // T
  CityData('天津', 'T', 39.1, 117.2),
  CityData('太原', 'T', 37.9, 112.6),
  CityData('腾冲', 'T', 25.0, 98.5),
  CityData('泰安', 'T', 36.2, 117.1),
  CityData('天水', 'T', 34.6, 105.7),
  CityData('铜仁', 'T', 27.7, 109.2),
  // W
  CityData('武汉', 'W', 30.6, 114.3),
  CityData('乌鲁木齐', 'W', 43.8, 87.6),
  CityData('武夷山', 'W', 27.8, 118.0),
  CityData('温州', 'W', 28.0, 120.7),
  CityData('婺源', 'W', 29.2, 117.9),
  CityData('文山', 'W', 23.4, 104.2),
  // X
  CityData('西安', 'X', 34.3, 108.9),
  CityData('西宁', 'X', 36.6, 101.8),
  CityData('西双版纳', 'X', 22.0, 100.8),
  CityData('厦门', 'X', 24.5, 118.1),
  CityData('香格里拉', 'X', 27.8, 99.7),
  CityData('湘西', 'X', 28.3, 109.7),
  // Y
  CityData('银川', 'Y', 38.5, 106.2),
  CityData('宜昌', 'Y', 30.7, 111.3),
  CityData('阳朔', 'Y', 24.8, 110.5),
  CityData('延安', 'Y', 36.6, 109.5),
  CityData('伊犁', 'Y', 43.9, 81.3),
  CityData('玉溪', 'Y', 24.4, 102.5),
  // Z
  CityData('张家界', 'Z', 29.1, 110.5),
  CityData('郑州', 'Z', 34.8, 113.7),
  CityData('遵义', 'Z', 27.7, 106.9),
  CityData('中卫', 'Z', 37.5, 105.2),
  CityData('舟山', 'Z', 30.0, 122.1),
];

class RegionPickerScreen extends ConsumerStatefulWidget {
  final String? currentCity;
  const RegionPickerScreen({super.key, this.currentCity});

  @override
  ConsumerState<RegionPickerScreen> createState() => _RegionPickerScreenState();
}

class _RegionPickerScreenState extends ConsumerState<RegionPickerScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  String _query = '';
  final Map<String, GlobalKey> _sectionKeys = {};
  String? _activeLetter;

  @override
  void initState() {
    super.initState();
    for (final letter in _letters) {
      _sectionKeys[letter] = GlobalKey();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  List<String> get _letters {
    final s = <String>{};
    for (final c in _allCities) {
      s.add(c.letter);
    }
    return s.toList()..sort();
  }

  List<CityData> get _filtered {
    if (_query.isEmpty) return _allCities;
    return _allCities.where((c) => c.name.contains(_query)).toList();
  }

  Map<String, List<CityData>> get _grouped {
    final map = <String, List<CityData>>{};
    for (final c in _filtered) {
      map.putIfAbsent(c.letter, () => []).add(c);
    }
    return map;
  }

  List<CityData> get _popularCities {
    return _allCities.where((c) => _popularNames.contains(c.name)).toList();
  }

  void _selectCity(CityData city) {
    context.pop(city);
  }

  void _scrollToLetter(String letter) {
    final key = _sectionKeys[letter];
    if (key?.currentContext != null) {
      Scrollable.ensureVisible(
        key!.currentContext!,
        alignment: 0,
        duration: const Duration(milliseconds: 200),
      );
    }
    setState(() => _activeLetter = letter);
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final grouped = _grouped;
    final letters = grouped.keys.toList()..sort();
    final isSearching = _query.isNotEmpty;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(colors),
            _buildSearchBar(colors),
            const SizedBox(height: 4),
            Expanded(
              child: Stack(
                children: [
                  ListView(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(18, 0, 36, 32),
                    children: [
                      if (!isSearching) ...[
                        const SizedBox(height: 12),
                        Text('热门城市', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.inkMuted, letterSpacing: 0.3)),
                        const SizedBox(height: 10),
                        _buildPopularGrid(colors),
                        const SizedBox(height: 24),
                      ],
                      for (final letter in letters) ...[
                        Container(
                          key: _sectionKeys[letter],
                          padding: const EdgeInsets.only(top: 12, bottom: 8),
                          child: Text(letter, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.inkMuted)),
                        ),
                        ...grouped[letter]!.map((city) => _buildCityTile(city, colors)),
                      ],
                    ],
                  ),
                  if (!isSearching)
                    Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      child: _LetterIndexStrip(
                        letters: _letters,
                        activeLetter: _activeLetter,
                        colors: colors,
                        onSelect: _scrollToLetter,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 18, 0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
            ),
          ),
          Text('选择城市', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3)),
        ],
      ),
    );
  }

  Widget _buildSearchBar(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
      child: Container(
        height: 42,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          children: [
            const SizedBox(width: 12),
            KaipaIcon(name: KaipaIcons.search, size: 16, color: colors.inkMuted),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _searchController,
                style: TextStyle(fontSize: 15, color: colors.ink),
                decoration: InputDecoration(
                  hintText: '搜索城市',
                  hintStyle: TextStyle(color: colors.inkMuted, fontSize: 15),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            if (_query.isNotEmpty)
              GestureDetector(
                onTap: () {
                  _searchController.clear();
                  setState(() => _query = '');
                },
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: KaipaIcon(name: KaipaIcons.close, size: 14, color: colors.inkMuted),
                ),
              ),
            if (_query.isEmpty) const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }

  Widget _buildPopularGrid(KaipaColors colors) {
    final popular = _popularCities;
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: popular.map((city) {
        final isActive = city.name == widget.currentCity;
        return GestureDetector(
          onTap: () => _selectCity(city),
          child: Container(
            width: 74,
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: isActive ? colors.flareSoft : colors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: isActive ? colors.flare : colors.line, width: 0.5),
            ),
            child: Center(
              child: Text(
                city.name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                  color: isActive ? colors.flare : colors.ink,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildCityTile(CityData city, KaipaColors colors) {
    final isActive = city.name == widget.currentCity;
    return GestureDetector(
      onTap: () => _selectCity(city),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 4),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.line, width: 0.5)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                city.name,
                style: TextStyle(
                  fontSize: 15,
                  color: isActive ? colors.flare : colors.ink,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            if (isActive)
              KaipaIcon(name: KaipaIcons.check, size: 16, color: colors.flare),
          ],
        ),
      ),
    );
  }
}

class _LetterIndexStrip extends StatefulWidget {
  final List<String> letters;
  final String? activeLetter;
  final KaipaColors colors;
  final ValueChanged<String> onSelect;

  const _LetterIndexStrip({
    required this.letters,
    required this.activeLetter,
    required this.colors,
    required this.onSelect,
  });

  @override
  State<_LetterIndexStrip> createState() => _LetterIndexStripState();
}

class _LetterIndexStripState extends State<_LetterIndexStrip> {
  final GlobalKey _columnKey = GlobalKey();

  String? _letterAtPosition(double dy) {
    final box = _columnKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return null;
    final local = box.globalToLocal(Offset(0, dy));
    final letterHeight = box.size.height / widget.letters.length;
    final index = (local.dy / letterHeight).floor().clamp(0, widget.letters.length - 1);
    return widget.letters[index];
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onVerticalDragUpdate: (d) {
        final letter = _letterAtPosition(d.globalPosition.dy);
        if (letter != null) widget.onSelect(letter);
      },
      onVerticalDragStart: (d) {
        final letter = _letterAtPosition(d.globalPosition.dy);
        if (letter != null) widget.onSelect(letter);
      },
      child: Center(
        child: Container(
          key: _columnKey,
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: widget.letters.map((letter) {
              final isActive = letter == widget.activeLetter;
              return GestureDetector(
                onTap: () => widget.onSelect(letter),
                child: SizedBox(
                  height: 18,
                  width: 18,
                  child: Center(
                    child: Text(
                      letter,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                        color: isActive ? widget.colors.flare : widget.colors.inkMuted,
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}
