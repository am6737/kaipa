import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../domain/trip_plan_task.dart';

class TaskEditSheet extends StatefulWidget {
  final TripPlanTask? task;
  final int dayCount;

  const TaskEditSheet({super.key, this.task, this.dayCount = 1});

  @override
  State<TaskEditSheet> createState() => _TaskEditSheetState();
}

class _TaskEditSheetState extends State<TaskEditSheet> {
  late TaskCategory _category;
  late TextEditingController _titleCtrl;
  late TextEditingController _descCtrl;
  late TextEditingController _customCatCtrl;
  TimeOfDay? _selectedTime;
  int _selectedDay = 1;
  late int _localDayCount;
  bool _hasTime = false;

  bool get _isEditing => widget.task != null;

  @override
  void initState() {
    super.initState();
    _category = widget.task?.category ?? TaskCategory.custom;
    _titleCtrl = TextEditingController(text: widget.task?.title ?? '');
    _descCtrl = TextEditingController(text: widget.task?.description ?? '');
    _customCatCtrl = TextEditingController(text: widget.task?.customLabel ?? '');
    _selectedDay = widget.task?.suggestedDay ?? 1;
    _localDayCount = widget.dayCount.clamp(1, 99);
    if (_selectedDay > _localDayCount) _localDayCount = _selectedDay;
    if (widget.task?.suggestedTime != null) {
      _hasTime = true;
      final parts = widget.task!.suggestedTime!.split(':');
      if (parts.length >= 2) {
        _selectedTime = TimeOfDay(hour: int.tryParse(parts[0]) ?? 7, minute: int.tryParse(parts[1]) ?? 0);
      }
    }
    _selectedTime ??= const TimeOfDay(hour: 7, minute: 0);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _customCatCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.kaipaTokens.color;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: colors.line, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              _isEditing ? '编辑事项' : '添加事项',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: colors.ink),
            ),
            const SizedBox(height: 16),
            // Category selector
            Text('分类', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: TaskCategory.values.map((cat) {
              final selected = _category == cat;
              return GestureDetector(
                onTap: () => setState(() => _category = cat),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: selected ? colors.flare.withAlpha(20) : colors.surfaceHi,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: selected ? colors.flare : colors.line, width: selected ? 1.5 : 0.5),
                  ),
                  child: Text(cat.label, style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: selected ? colors.flare : colors.inkMuted,
                  )),
                ),
              );
            }).toList()),
            if (_category == TaskCategory.custom) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _customCatCtrl,
                style: TextStyle(fontSize: 13, color: colors.ink),
                decoration: InputDecoration(
                  hintText: '自定义分类名称（可选）',
                  hintStyle: TextStyle(color: colors.inkDim),
                  filled: true,
                  fillColor: colors.surfaceHi,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                ),
              ),
            ],
            const SizedBox(height: 16),
            // Title
            TextField(
              controller: _titleCtrl,
              style: TextStyle(fontSize: 14, color: colors.ink),
              decoration: InputDecoration(
                hintText: '事项内容',
                hintStyle: TextStyle(color: colors.inkDim),
                filled: true,
                fillColor: colors.surfaceHi,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
            const SizedBox(height: 12),
            // Description
            TextField(
              controller: _descCtrl,
              style: TextStyle(fontSize: 13, color: colors.ink),
              maxLines: 2,
              decoration: InputDecoration(
                hintText: '备注（可选）',
                hintStyle: TextStyle(color: colors.inkDim),
                filled: true,
                fillColor: colors.surfaceHi,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
            const SizedBox(height: 16),
            // Time setting
            Row(children: [
              Text('设定时间', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted)),
              const Spacer(),
              CupertinoSwitch(
                value: _hasTime,
                activeTrackColor: colors.flare,
                onChanged: (v) => setState(() => _hasTime = v),
              ),
            ]),
            if (_hasTime) ...[
              const SizedBox(height: 12),
              // Day selector
              Row(children: [
                Text('第几天', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted)),
                const Spacer(),
                GestureDetector(
                  onTap: _localDayCount <= 1
                      ? null
                      : () => setState(() {
                            _localDayCount--;
                            if (_selectedDay > _localDayCount) _selectedDay = _localDayCount;
                          }),
                  child: Container(
                    width: 28, height: 28,
                    decoration: BoxDecoration(
                      color: _localDayCount <= 1 ? colors.surfaceHi : colors.flare.withAlpha(15),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: _localDayCount <= 1 ? colors.line : colors.flare.withAlpha(40), width: 0.5),
                    ),
                    child: Icon(Icons.remove, size: 14, color: _localDayCount <= 1 ? colors.inkDim : colors.flare),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text('$_localDayCount 天', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
                ),
                GestureDetector(
                  onTap: () => setState(() => _localDayCount++),
                  child: Container(
                    width: 28, height: 28,
                    decoration: BoxDecoration(
                      color: colors.flare.withAlpha(15),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: colors.flare.withAlpha(40), width: 0.5),
                    ),
                    child: Icon(Icons.add, size: 14, color: colors.flare),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              SizedBox(
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _localDayCount,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final day = i + 1;
                    final selected = _selectedDay == day;
                    return GestureDetector(
                      onTap: () => setState(() => _selectedDay = day),
                      child: Container(
                        width: 56,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: selected ? colors.flare : colors.surfaceHi,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: selected ? colors.flare : colors.line, width: selected ? 1.5 : 0.5),
                        ),
                        child: Text('D$day', style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700,
                          color: selected ? Colors.white : colors.inkMuted,
                        )),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
              // Time wheel picker
              Container(
                height: 120,
                decoration: BoxDecoration(
                  color: colors.surfaceHi,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: CupertinoTimerPicker(
                  mode: CupertinoTimerPickerMode.hm,
                  initialTimerDuration: Duration(hours: _selectedTime!.hour, minutes: _selectedTime!.minute),
                  onTimerDurationChanged: (duration) {
                    _selectedTime = TimeOfDay(hour: duration.inHours, minute: duration.inMinutes % 60);
                  },
                ),
              ),
            ],
            const SizedBox(height: 20),
            // Submit button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _titleCtrl.text.trim().isEmpty ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: Text(_isEditing ? '保存' : '添加', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  String? _formatTime() {
    if (!_hasTime || _selectedTime == null) return null;
    final h = _selectedTime!.hour.toString().padLeft(2, '0');
    final m = _selectedTime!.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  void _submit() {
    final customCat = _customCatCtrl.text.trim();
    Navigator.of(context).pop(TaskEditResult(
      category: _category,
      title: _titleCtrl.text.trim(),
      description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      suggestedTime: _formatTime(),
      suggestedDay: _hasTime ? _selectedDay : null,
      customCategoryName: _category == TaskCategory.custom && customCat.isNotEmpty ? customCat : null,
    ));
  }
}

class TaskEditResult {
  final TaskCategory category;
  final String title;
  final String? description;
  final String? suggestedTime;
  final int? suggestedDay;
  final String? customCategoryName;

  const TaskEditResult({
    required this.category,
    required this.title,
    this.description,
    this.suggestedTime,
    this.suggestedDay,
    this.customCategoryName,
  });
}
