import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

class RoutePublishScreen extends ConsumerStatefulWidget {
  const RoutePublishScreen({super.key});

  @override
  ConsumerState<RoutePublishScreen> createState() => _RoutePublishScreenState();
}

class _RoutePublishScreenState extends ConsumerState<RoutePublishScreen> {
  String _name = '';
  String _description = '';
  String _difficulty = 'moderate';
  final List<String> _tags = [];
  final _tagController = TextEditingController();

  @override
  void dispose() {
    _tagController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        leading: IconButton(icon: Icon(Icons.close, color: colors.ink), onPressed: () => context.pop()),
        title: Text('发布路线', style: TextStyle(color: colors.ink, fontWeight: FontWeight.w700)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _label('路线名称', colors),
            const SizedBox(height: 8),
            TextField(
              onChanged: (v) => _name = v,
              decoration: _inputDecor('输入路线名称', colors),
            ),
            const SizedBox(height: 20),

            _label('描述', colors),
            const SizedBox(height: 8),
            TextField(
              onChanged: (v) => _description = v,
              maxLines: 4,
              decoration: _inputDecor('添加路线描述...', colors),
            ),
            const SizedBox(height: 20),

            _label('难度', colors),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [
                _diffOption('easy', '入门', colors),
                _diffOption('moderate', '中等', colors),
                _diffOption('hard', '困难', colors),
                _diffOption('expert', '专家', colors),
              ],
            ),
            const SizedBox(height: 20),

            _label('标签', colors),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _tagController,
                    decoration: _inputDecor('输入标签', colors),
                    onSubmitted: (v) {
                      if (v.trim().isNotEmpty) {
                        setState(() => _tags.add(v.trim()));
                        _tagController.clear();
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: () {
                    if (_tagController.text.trim().isNotEmpty) {
                      setState(() => _tags.add(_tagController.text.trim()));
                      _tagController.clear();
                    }
                  },
                  icon: Icon(Icons.add_circle, color: colors.flare),
                ),
              ],
            ),
            if (_tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6, runSpacing: 6,
                children: _tags.map((t) => Chip(
                  label: Text(t, style: TextStyle(fontSize: 12, color: colors.ink)),
                  backgroundColor: colors.surface,
                  side: BorderSide(color: colors.line, width: 0.5),
                  deleteIcon: Icon(Icons.close, size: 14, color: colors.inkDim),
                  onDeleted: () => setState(() => _tags.remove(t)),
                )).toList(),
              ),
            ],
            const SizedBox(height: 20),

            // Photo upload placeholder
            _label('照片', colors),
            const SizedBox(height: 8),
            Row(
              children: [
                _photoPlaceholder(colors),
                const SizedBox(width: 8),
                _photoPlaceholder(colors),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('照片上传即将支持'), duration: Duration(seconds: 1)),
                  ),
                  child: Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      color: colors.surface,
                      border: Border.all(color: colors.line, width: 0.5),
                    ),
                    child: Icon(Icons.add, color: colors.inkDim, size: 28),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 40),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _name.isEmpty ? null : () {
                  // TODO: submit _name, _description, _difficulty, _tags to backend
                  debugPrint('Publishing: $_name, $_description, $_difficulty');
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('路线发布成功！')),
                  );
                  context.pop();
                },
                child: const Text('发布'),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _label(String text, KaipaColors colors) {
    return Text(text, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink));
  }

  InputDecoration _inputDecor(String hint, KaipaColors colors) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: colors.inkDim),
      filled: true,
      fillColor: colors.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: colors.flare)),
    );
  }

  Widget _diffOption(String value, String label, KaipaColors colors) {
    final selected = _difficulty == value;
    return GestureDetector(
      onTap: () => setState(() => _difficulty = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: selected ? colors.flareSoft : colors.surface,
          border: Border.all(color: selected ? colors.flare : colors.line, width: selected ? 1.5 : 0.5),
        ),
        child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? colors.flare : colors.ink)),
      ),
    );
  }

  Widget _photoPlaceholder(KaipaColors colors) {
    return Container(
      width: 80, height: 80,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: colors.surface,
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Icon(Icons.image, color: colors.inkDim, size: 28),
    );
  }
}
