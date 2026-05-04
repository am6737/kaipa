import 'package:flutter_riverpod/flutter_riverpod.dart';

enum MapPerspective { discover, footprint }

final mapPerspectiveProvider = StateProvider<MapPerspective>((ref) => MapPerspective.discover);
