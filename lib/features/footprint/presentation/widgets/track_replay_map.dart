import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import '../../../../core/theme/kaipa_tokens.dart';

class TrackReplayMap extends StatelessWidget {
  final Map<String, dynamic> trackGeojson;
  final KaipaColors colors;

  const TrackReplayMap({super.key, required this.trackGeojson, required this.colors});

  @override
  Widget build(BuildContext context) {
    final trackPoints = _extractTrackPoints();
    if (trackPoints.isEmpty) {
      return Center(child: Text('无轨迹数据', style: TextStyle(color: colors.inkDim)));
    }
    final bounds = _computeBounds(trackPoints);
    final center = LatLng(
      (bounds['north']! + bounds['south']!) / 2,
      (bounds['east']! + bounds['west']!) / 2,
    );

    return FlutterMap(
      options: MapOptions(
        initialCenter: center,
        initialZoom: 13.0,
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
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
          _endpointMarker(trackPoints.first, colors.moss),
          _endpointMarker(trackPoints.last, colors.flare),
        ]),
      ],
    );
  }

  Marker _endpointMarker(LatLng point, Color color) {
    return Marker(
      point: point, width: 24, height: 24,
      child: Container(
        decoration: BoxDecoration(color: color, shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2)),
      ),
    );
  }

  List<LatLng> _extractTrackPoints() {
    try {
      final type = trackGeojson['type'] as String?;
      dynamic coords;
      if (type == 'FeatureCollection') {
        final features = trackGeojson['features'] as List?;
        if (features == null || features.isEmpty) return [];
        for (final f in features) {
          final geom = (f as Map)['geometry'] as Map<String, dynamic>?;
          if (geom?['type'] == 'LineString') { coords = geom!['coordinates']; break; }
        }
      } else if (type == 'Feature') {
        coords = (trackGeojson['geometry'] as Map<String, dynamic>?)!['coordinates'];
      } else if (type == 'LineString') {
        coords = trackGeojson['coordinates'];
      }
      if (coords is List) {
        return coords.whereType<List>().where((c) => c.length >= 2)
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Map<String, double> _computeBounds(List<LatLng> points) {
    double north = -90, south = 90, east = -180, west = 180;
    for (final p in points) {
      if (p.latitude > north) north = p.latitude;
      if (p.latitude < south) south = p.latitude;
      if (p.longitude > east) east = p.longitude;
      if (p.longitude < west) west = p.longitude;
    }
    return {'north': north, 'south': south, 'east': east, 'west': west};
  }
}
