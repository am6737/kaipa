import 'package:flutter/material.dart';
import '../../../trip/domain/trip_model.dart';
import '../../../../core/theme/kaipa_tokens.dart';

class TripSwitcher extends StatelessWidget {
  final List<TripModel> trips;
  final TripModel selected;
  final KaipaColors colors;
  final ValueChanged<TripModel> onSelect;

  const TripSwitcher({
    super.key,
    required this.trips,
    required this.selected,
    required this.colors,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (trips.length <= 1) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: trips.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final trip = trips[index];
          final isSelected = trip.id == selected.id;
          return GestureDetector(
            onTap: () => onSelect(trip),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isSelected ? colors.flare : colors.surface,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(
                  color: isSelected ? colors.flare : colors.line,
                  width: 0.5,
                ),
              ),
              child: Text(
                '${trip.startedAt.month}/${trip.startedAt.day}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? Colors.white : colors.ink,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
