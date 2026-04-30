import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../data/gear_repository.dart';
import '../../domain/gear_category_model.dart';
import 'icon_picker.dart';

class CreateCategorySheet extends ConsumerStatefulWidget {
  final List<GearCategoryModel> existingCategories;

  const CreateCategorySheet({super.key, required this.existingCategories});

  @override
  ConsumerState<CreateCategorySheet> createState() => _CreateCategorySheetState();
}

class _CreateCategorySheetState extends ConsumerState<CreateCategorySheet> {
  final _nameController = TextEditingController();
  String _selectedIcon = 'backpack';
  String _selectedIconType = 'svg';
  String? _errorText;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool get _isValid {
    final name = _nameController.text.trim();
    return name.isNotEmpty && name.length <= 10 && _errorText == null;
  }

  void _validate() {
    final name = _nameController.text.trim();
    String? error;
    if (name.isEmpty) {
      error = null;
    } else if (name.length > 10) {
      error = '名称最多 10 个字符';
    } else if (widget.existingCategories.any((c) => c.name == name)) {
      error = '分类名称已存在';
    }
    setState(() => _errorText = error);
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty || _isSubmitting) return;

    setState(() => _isSubmitting = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.createCategory(
        name: name,
        icon: _selectedIcon,
        iconType: _selectedIconType,
      );
      ref.invalidate(gearCategoriesProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('创建失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.inkDim,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            '新建分类',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            maxLength: 10,
            autofocus: true,
            onChanged: (_) => _validate(),
            style: TextStyle(fontSize: 16, color: colors.ink),
            decoration: InputDecoration(
              hintText: '分类名称',
              hintStyle: TextStyle(color: colors.inkMuted),
              errorText: _errorText,
              counterText: '${_nameController.text.length}/10',
              counterStyle: TextStyle(color: colors.inkDim, fontSize: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
          const SizedBox(height: 16),
          IconPicker(
            initialIcon: _selectedIcon,
            initialIconType: _selectedIconType,
            onChanged: (result) {
              setState(() {
                _selectedIcon = result.icon;
                _selectedIconType = result.iconType;
              });
            },
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _isValid && !_isSubmitting ? _submit : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.flare,
                disabledBackgroundColor: colorWithOpacity(colors.flare, 0.3),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Text(
                      '创建',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
