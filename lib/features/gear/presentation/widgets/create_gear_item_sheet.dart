import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../data/gear_repository.dart';
import '../../domain/gear_category_model.dart';

class CreateGearItemSheet extends ConsumerStatefulWidget {
  final String? initialCategoryId;

  const CreateGearItemSheet({super.key, this.initialCategoryId});

  @override
  ConsumerState<CreateGearItemSheet> createState() =>
      _CreateGearItemSheetState();
}

class _CreateGearItemSheetState extends ConsumerState<CreateGearItemSheet> {
  final _nameController = TextEditingController();
  final _brandController = TextEditingController();
  final _weightController = TextEditingController();
  final _priceController = TextEditingController();
  String? _selectedCategoryId;
  String _condition = 'new';
  bool _isSubmitting = false;

  static const _conditions = [
    ('new', '全新'),
    ('good', '良好'),
    ('fair', '一般'),
    ('worn', '磨损'),
  ];

  @override
  void initState() {
    super.initState();
    _selectedCategoryId = widget.initialCategoryId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _brandController.dispose();
    _weightController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  bool get _isValid =>
      _nameController.text.trim().isNotEmpty && _selectedCategoryId != null;

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty || _selectedCategoryId == null || _isSubmitting) return;

    setState(() => _isSubmitting = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.createItem(
        categoryId: _selectedCategoryId!,
        name: name,
        brand: _brandController.text.trim().isEmpty
            ? null
            : _brandController.text.trim(),
        weightG: double.tryParse(_weightController.text.trim()),
        price: double.tryParse(_priceController.text.trim()),
        condition: _condition,
      );
      ref.invalidate(gearCategoriesProvider);
      ref.invalidate(allGearItemsProvider);
      ref.invalidate(gearItemsByCategoryProvider(_selectedCategoryId!));
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
    final categoriesAsync = ref.watch(gearCategoriesProvider);

    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    // Clear the floating bottom nav bar when keyboard is hidden;
    // when keyboard is open the nav bar is behind it.
    final bottomPadding = keyboardHeight > 0 ? keyboardHeight + 20 : 100.0;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: bottomPadding,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ─── Drag handle ────────────────────────────────────
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

            // ─── Title ──────────────────────────────────────────
            Text(
              '添加装备',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 20),

            // ─── Name field (required) ──────────────────────────
            _buildLabel('装备名称', colors, required: true),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _nameController,
              hint: '例如：大容量重装背包 65L',
              colors: colors,
              autofocus: true,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),

            // ─── Category picker (required) ─────────────────────
            if (widget.initialCategoryId == null) ...[
              _buildLabel('装备分类', colors, required: true),
              const SizedBox(height: 8),
              categoriesAsync.when(
                loading: () => const SizedBox(height: 44),
                error: (_, _) => const SizedBox.shrink(),
                data: (categories) =>
                    _buildCategoryChips(categories, colors),
              ),
              const SizedBox(height: 16),
            ],

            // ─── Divider ────────────────────────────────────────
            Container(height: 0.5, color: colors.line),
            const SizedBox(height: 16),

            // ─── Brand field ────────────────────────────────────
            _buildLabel('品牌', colors),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _brandController,
              hint: '例如：鱼鹰, 始祖鸟',
              colors: colors,
            ),
            const SizedBox(height: 16),

            // ─── Weight & Price row ─────────────────────────────
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildLabel('重量', colors),
                      const SizedBox(height: 8),
                      _buildTextField(
                        controller: _weightController,
                        hint: '0',
                        colors: colors,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(
                              RegExp(r'^\d*\.?\d*$')),
                        ],
                        suffixText: 'g',
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildLabel('价格', colors),
                      const SizedBox(height: 8),
                      _buildTextField(
                        controller: _priceController,
                        hint: '0',
                        colors: colors,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(
                              RegExp(r'^\d*\.?\d*$')),
                        ],
                        prefixText: '¥',
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // ─── Condition picker ───────────────────────────────
            _buildLabel('使用状态', colors),
            const SizedBox(height: 8),
            _buildConditionChips(colors),
            const SizedBox(height: 24),

            // ─── Submit button ──────────────────────────────────
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _isValid && !_isSubmitting ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  disabledBackgroundColor: colorWithOpacity(colors.flare, 0.3),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(KaipaRadius.md),
                  ),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text(
                        '添加',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ─── Section label ──────────────────────────────────────────────────

  Widget _buildLabel(String text, KaipaColors colors, {bool required = false}) {
    return Row(
      children: [
        Text(
          text,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: colors.inkMuted,
            letterSpacing: -0.1,
          ),
        ),
        if (required) ...[
          const SizedBox(width: 4),
          Text(
            '*',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.flare,
            ),
          ),
        ],
      ],
    );
  }

  // ─── Text field ─────────────────────────────────────────────────────

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    required KaipaColors colors,
    bool autofocus = false,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    ValueChanged<String>? onChanged,
    String? prefixText,
    String? suffixText,
  }) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      onChanged: onChanged,
      style: TextStyle(fontSize: 16, color: colors.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: colors.inkDim),
        prefixText: prefixText,
        prefixStyle: TextStyle(
          fontSize: 16,
          color: colors.inkMuted,
          fontWeight: FontWeight.w500,
        ),
        suffixText: suffixText,
        suffixStyle: TextStyle(
          fontSize: 14,
          color: colors.inkMuted,
          fontWeight: FontWeight.w500,
        ),
        filled: true,
        fillColor: colors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KaipaRadius.md),
          borderSide: BorderSide(color: colors.line, width: 0.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KaipaRadius.md),
          borderSide: BorderSide(color: colors.line, width: 0.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KaipaRadius.md),
          borderSide: BorderSide(color: colors.flare, width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }

  // ─── Category chips (horizontal scroll) ─────────────────────────────

  Widget _buildCategoryChips(
      List<GearCategoryModel> categories, KaipaColors colors) {
    if (categories.isEmpty) {
      return Container(
        height: 44,
        alignment: Alignment.centerLeft,
        child: Text(
          '暂无分类，请先创建',
          style: TextStyle(fontSize: 14, color: colors.inkDim),
        ),
      );
    }

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final category = categories[index];
          final selected = _selectedCategoryId == category.id;
          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => setState(() => _selectedCategoryId = category.id),
              borderRadius: BorderRadius.circular(KaipaRadius.md),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: selected
                      ? colorWithOpacity(colors.flare, 0.12)
                      : colors.surface,
                  borderRadius: BorderRadius.circular(KaipaRadius.md),
                  border: Border.all(
                    color: selected ? colors.flare : colors.line,
                    width: selected ? 1.5 : 0.5,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (category.iconType == 'emoji')
                      Text(category.icon,
                          style: const TextStyle(fontSize: 16))
                    else
                      KaipaIcon(
                        name: category.icon,
                        size: 16,
                        color: selected ? colors.flare : colors.inkMuted,
                      ),
                    const SizedBox(width: 8),
                    Text(
                      category.name,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                        color: selected ? colors.flare : colors.ink,
                        letterSpacing: -0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ─── Condition chips ────────────────────────────────────────────────

  Widget _buildConditionChips(KaipaColors colors) {
    return Row(
      children: _conditions.map((entry) {
        final (value, label) = entry;
        final selected = _condition == value;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              right: value != _conditions.last.$1 ? 8 : 0,
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => setState(() => _condition = value),
                borderRadius: BorderRadius.circular(KaipaRadius.md),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  height: 44,
                  decoration: BoxDecoration(
                    color: selected
                        ? colorWithOpacity(colors.flare, 0.12)
                        : colors.surface,
                    borderRadius: BorderRadius.circular(KaipaRadius.md),
                    border: Border.all(
                      color: selected ? colors.flare : colors.line,
                      width: selected ? 1.5 : 0.5,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight:
                            selected ? FontWeight.w600 : FontWeight.w500,
                        color: selected ? colors.flare : colors.ink,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
