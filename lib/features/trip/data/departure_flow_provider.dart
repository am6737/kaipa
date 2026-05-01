import 'package:flutter_riverpod/flutter_riverpod.dart';

class DepartureFlowState {
  final String routeId;
  final List<String> selectedGearIds;
  final String? selectedDate;
  final String? departureTime;
  final Map<String, bool> safetyToggles;
  final String? tripId;

  const DepartureFlowState({
    required this.routeId,
    this.selectedGearIds = const [],
    this.selectedDate,
    this.departureTime,
    this.safetyToggles = const {
      'location_sharing': true,
      'sos_enabled': true,
    },
    this.tripId,
  });

  DepartureFlowState copyWith({
    List<String>? selectedGearIds,
    String? selectedDate,
    String? departureTime,
    Map<String, bool>? safetyToggles,
    String? tripId,
  }) {
    return DepartureFlowState(
      routeId: routeId,
      selectedGearIds: selectedGearIds ?? this.selectedGearIds,
      selectedDate: selectedDate ?? this.selectedDate,
      departureTime: departureTime ?? this.departureTime,
      safetyToggles: safetyToggles ?? this.safetyToggles,
      tripId: tripId ?? this.tripId,
    );
  }
}

class DepartureFlowNotifier extends StateNotifier<DepartureFlowState> {
  DepartureFlowNotifier(String routeId)
      : super(DepartureFlowState(routeId: routeId));

  void setGear(List<String> ids) {
    state = state.copyWith(selectedGearIds: ids);
  }

  void setWeather(String date, String time) {
    state = state.copyWith(selectedDate: date, departureTime: time);
  }

  void setSafety(Map<String, bool> toggles) {
    state = state.copyWith(safetyToggles: toggles);
  }

  void setTripId(String id) {
    state = state.copyWith(tripId: id);
  }
}

final departureFlowProvider = StateNotifierProvider.autoDispose
    .family<DepartureFlowNotifier, DepartureFlowState, String>(
  (ref, routeId) => DepartureFlowNotifier(routeId),
);
