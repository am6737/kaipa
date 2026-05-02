import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/trip_repository.dart';

class ManualTripEntryScreen extends ConsumerStatefulWidget {
  const ManualTripEntryScreen({super.key});

  @override
  ConsumerState<ManualTripEntryScreen> createState() =>
      _ManualTripEntryScreenState();
}

class _ManualTripEntryScreenState
    extends ConsumerState<ManualTripEntryScreen> {
  final _nameController = TextEditingController();
  final _distanceController = TextEditingController();
  final _elevationController = TextEditingController();
  final _hoursController = TextEditingController();
  final _minutesController = TextEditingController();
  final _notesController = TextEditingController();

  DateTime _selectedDate = DateTime.now();
  int _rating = 0;
  bool _saving = false;

  bool get _isValid => _nameController.text.trim().isNotEmpty;

  @override
  void dispose() {
    _nameController.dispose();
    _distanceController.dispose();
    _elevationController.dispose();
    _hoursController.dispose();
    _minutesController.dispose();
    _notesController.dispose();
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
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text(
          '手动记录',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: colors.ink,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              children: [
                _buildBasicInfoSection(colors),
                const SizedBox(height: 16),
                _buildDataSection(colors),
                const SizedBox(height: 16),
                _buildRatingSection(colors),
                const SizedBox(height: 100),
              ],
            ),
          ),
          _buildBottomCta(colors),
        ],
      ),
    );
  }

  // ─── Section 1: Basic Info ──────────────────────────────────────────
  Widget _buildBasicInfoSection(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '基本信息',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            onChanged: (_) => setState(() {}),
            style: TextStyle(fontSize: 14, color: colors.ink),
            decoration: InputDecoration(
              hintText: '线路名称，如：武功山穿越',
              hintStyle: TextStyle(fontSize: 14, color: colors.inkDim),
              filled: true,
              fillColor: colors.bg,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1),
              ),
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: _pickDate,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: colors.bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_selectedDate.year}.${_selectedDate.month.toString().padLeft(2, '0')}.${_selectedDate.day.toString().padLeft(2, '0')}',
                      style: TextStyle(fontSize: 14, color: colors.ink),
                    ),
                  ),
                  KaipaIcon(
                    name: KaipaIcons.clock,
                    size: 18,
                    color: colors.inkMuted,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickDate() async {
    final colors = ref.read(kaipaTokensProvider).color;
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.dark(
              primary: colors.flare,
              surface: colors.surface,
              onSurface: colors.ink,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  // ─── Section 2: Route Data ──────────────────────────────────────────
  Widget _buildDataSection(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '线路数据（选填）',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _numericField(
                  controller: _distanceController,
                  hint: '距离',
                  suffix: 'km',
                  colors: colors,
                  decimal: true,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _numericField(
                  controller: _elevationController,
                  hint: '累计爬升',
                  suffix: 'm',
                  colors: colors,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _numericField(
                  controller: _hoursController,
                  hint: '时',
                  suffix: '时',
                  colors: colors,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _numericField(
                  controller: _minutesController,
                  hint: '分',
                  suffix: '分',
                  colors: colors,
                ),
              ),
              const Spacer(),
            ],
          ),
        ],
      ),
    );
  }

  Widget _numericField({
    required TextEditingController controller,
    required String hint,
    required String suffix,
    required KaipaColors colors,
    bool decimal = false,
  }) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.numberWithOptions(decimal: decimal),
      inputFormatters: [
        FilteringTextInputFormatter.allow(
          decimal ? RegExp(r'[\d.]') : RegExp(r'\d'),
        ),
      ],
      style: TextStyle(fontSize: 14, color: colors.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(fontSize: 14, color: colors.inkDim),
        suffixText: suffix,
        suffixStyle: TextStyle(fontSize: 13, color: colors.inkMuted),
        filled: true,
        fillColor: colors.bg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.flare, width: 1),
        ),
      ),
    );
  }

  // ─── Section 3: Rating ──────────────────────────────────────────────
  Widget _buildRatingSection(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '评价（选填）',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _rating;
              return GestureDetector(
                onTap: () => setState(() => _rating = _rating == i + 1 ? 0 : i + 1),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: filled ? colors.flareSoft : colors.lineSoft,
                    ),
                    child: Center(
                      child: KaipaIcon(
                        name: KaipaIcons.star,
                        size: 18,
                        color: filled ? colors.flare : colors.inkDim,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _notesController,
            maxLines: 4,
            minLines: 2,
            style: TextStyle(fontSize: 12.5, color: colors.ink),
            decoration: InputDecoration(
              hintText: '记录一些感受或注意事项…',
              hintStyle: TextStyle(fontSize: 12.5, color: colors.inkDim),
              filled: true,
              fillColor: colors.bg,
              contentPadding: const EdgeInsets.all(12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Bottom CTA ─────────────────────────────────────────────────────
  Widget _buildBottomCta(KaipaColors colors) {
    return Container(
      padding: EdgeInsets.fromLTRB(
          20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton(
          onPressed: _isValid && !_saving ? _save : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: colors.flare,
            disabledBackgroundColor: colors.lineSoft,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: _saving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('保存记录'),
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final hours = int.tryParse(_hoursController.text) ?? 0;
      final minutes = int.tryParse(_minutesController.text) ?? 0;
      final duration = (hours > 0 || minutes > 0)
          ? Duration(hours: hours, minutes: minutes)
          : null;

      await ref.read(tripRepositoryProvider).createManualTrip(
            routeName: _nameController.text.trim(),
            date: _selectedDate,
            distanceKm: double.tryParse(_distanceController.text),
            elevationM: double.tryParse(_elevationController.text),
            duration: duration,
            rating: _rating > 0 ? _rating : null,
            notes: _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          );

      ref.invalidate(allTripsProvider);

      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
