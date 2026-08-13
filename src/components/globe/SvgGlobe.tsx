// SvgGlobe.tsx — stylized fallback globe (ported from the prototype's globe.jsx),
// upgraded to place POIs by real orthographic projection so they sit
// geographically. Used when no Mapbox token is configured (e.g. Expo Go).
import React from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Polyline, ClipPath, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { GlobeProps } from './types';
import { project, graticule } from './projection';
import { PhotoPin, PHOTO_PIN_ANCHOR_Y, PHOTO_PIN_HEIGHT, PHOTO_PIN_WIDTH } from './PhotoPin';

export default function SvgGlobe({ theme, size, pois, activePoiId, onPoiPress, center, focusCoords, focusSegments, focusBoundaries, selectionPin, focusConnector, onRouteBoundaryPress, onMapCoordinatePress, pin }: GlobeProps) {
  const t = theme;
  const R = size / 2;
  const cx = R;
  const cy = R;
  const lon0 = center?.lon ?? 100;
  const lat0 = center?.lat ?? 32;

  const lines = graticule(lon0, lat0, R - 1, cx, cy);
  const route = (focusCoords || []).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

  if (route.length >= 2) {
    const meanLat = route.reduce((sum, [, lat]) => sum + lat, 0) / route.length;
    const lonScale = Math.max(0.2, Math.cos((meanLat * Math.PI) / 180));
    const normalized = route.map(([lon, lat]) => [lon * lonScale, lat] as const);
    const xs = normalized.map(([x]) => x);
    const ys = normalized.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 30;
    const spanX = Math.max(maxX - minX, 0.0001);
    const spanY = Math.max(maxY - minY, 0.0001);
    const scale = Math.min((size - padding * 2) / spanX, (size - padding * 2) / spanY);
    const drawnWidth = spanX * scale;
    const drawnHeight = spanY * scale;
    const offsetX = (size - drawnWidth) / 2;
    const offsetY = (size - drawnHeight) / 2;
    const routePoints = normalized.map(([x, y]) => `${offsetX + (x - minX) * scale},${offsetY + (maxY - y) * scale}`).join(' ');
    const [startX, startY] = routePoints.split(' ')[0].split(',').map(Number);
    const [endX, endY] = routePoints.split(' ').at(-1)!.split(',').map(Number);

    return (
      <View style={{ width: size, height: size, borderRadius: 28, overflow: 'hidden', backgroundColor: theme.featureSurface, borderWidth: 1, borderColor: theme.hairline }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Rect
            x={0}
            y={0}
            width={size}
            height={size}
            fill={theme.featureSurface}
            onPress={(event) => {
              if (!onMapCoordinatePress) return;
              const locationX = Number(event.nativeEvent.locationX);
              const locationY = Number(event.nativeEvent.locationY);
              if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;
              const normalizedX = minX + (locationX - offsetX) / scale;
              const latitude = maxY - (locationY - offsetY) / scale;
              onMapCoordinatePress([normalizedX / lonScale, latitude]);
            }}
          />
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <G key={ratio}>
              <Line x1={size * ratio} y1={0} x2={size * ratio} y2={size} stroke={theme.globeGrid} strokeWidth={0.7} />
              <Line x1={0} y1={size * ratio} x2={size} y2={size * ratio} stroke={theme.globeGrid} strokeWidth={0.7} />
            </G>
          ))}
          <Polyline points={routePoints} fill="none" stroke={focusSegments?.length ? theme.trailFaint : theme.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          {focusSegments?.map((segment) => {
            const points = segment.coordinates.map(([lon, lat]) => {
              const x = lon * lonScale;
              return `${offsetX + (x - minX) * scale},${offsetY + (maxY - lat) * scale}`;
            }).join(' ');
            return <Polyline key={segment.id} points={points} fill="none" stroke={segment.color} strokeOpacity={segment.active ? 1 : 0.26} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />;
          })}
          {focusConnector ? (() => {
            const points = focusConnector.coordinates.map(([lon, lat]) => {
              const x = lon * lonScale;
              return `${offsetX + (x - minX) * scale},${offsetY + (maxY - lat) * scale}`;
            }).join(' ');
            return <Polyline points={points} fill="none" stroke={focusConnector.color} strokeOpacity={0.72} strokeWidth={2.2} strokeDasharray="4 4" />;
          })() : null}
          {focusBoundaries?.map((boundary) => {
            const x = boundary.coordinate[0] * lonScale;
            const px = offsetX + (x - minX) * scale;
            const py = offsetY + (maxY - boundary.coordinate[1]) * scale;
            return (
              <G key={boundary.id} opacity={boundary.active ? 1 : 0.4} onPress={() => onRouteBoundaryPress?.(boundary.groupKey)}>
                <Circle cx={px} cy={py} r={boundary.pending ? 6 : 5} fill={boundary.pending ? theme.featureSurface : boundary.color} stroke={boundary.color} strokeWidth={2.5} />
                <SvgText x={px} y={py - 10} textAnchor="middle" fontSize={9} fontWeight="700" fill={boundary.color}>{`${boundary.title} ${boundary.distance}`}</SvgText>
              </G>
            );
          })}
          {selectionPin ? (() => {
            const pinX = selectionPin.coordinate[0] * lonScale;
            const px = offsetX + (pinX - minX) * scale;
            const py = offsetY + (maxY - selectionPin.coordinate[1]) * scale;
            return (
              <G>
                <Circle cx={px} cy={py - 7} r={9} fill="#FFFFFF" stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
                <Circle cx={px} cy={py - 7} r={3.2} fill={theme.text2} />
                <Circle cx={px} cy={py} r={4} fill={selectionPin.color} stroke="#FFFFFF" strokeWidth={1.8} />
              </G>
            );
          })() : null}
          <Circle cx={startX} cy={startY} r={6} fill="#34C759" stroke="#FFFFFF" strokeWidth={2.5} />
          <Circle cx={endX} cy={endY} r={6} fill={theme.danger} stroke="#FFFFFF" strokeWidth={2.5} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* atmosphere */}
      <View
        style={{
          position: 'absolute',
          left: -size * 0.06,
          top: -size * 0.06,
          width: size * 1.12,
          height: size * 1.12,
          borderRadius: size * 0.56,
          backgroundColor: t.globeAtmos,
          opacity: 0.5,
        }}
      />
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="globeBody" cx="34%" cy="28%" r="75%">
            <Stop offset="0%" stopColor={t.globeStops[0]} />
            <Stop offset="45%" stopColor={t.globeStops[1]} />
            <Stop offset="80%" stopColor={t.globeStops[2]} />
            <Stop offset="100%" stopColor={t.globeStops[3]} />
          </RadialGradient>
          <RadialGradient id="globeHi" cx="32%" cy="26%" r="60%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <Stop offset="60%" stopColor="rgba(255,255,255,0)" />
          </RadialGradient>
          <ClipPath id="globeClip">
            <Circle cx={cx} cy={cy} r={R} />
          </ClipPath>
        </Defs>
        <Circle cx={cx} cy={cy} r={R} fill="url(#globeBody)" />
        <G clipPath="url(#globeClip)">
          {lines.map((pts, i) => (
            <Polyline key={i} points={pts} fill="none" stroke={t.globeGrid} strokeWidth={0.6} />
          ))}
          <Circle cx={cx} cy={cy} r={R} fill="url(#globeHi)" />
        </G>
        <Circle cx={cx} cy={cy} r={R} fill="none" stroke={t.globeRim} strokeWidth={1} />
      </Svg>

      {/* projected, tappable POIs — rounded photos with capsule labels */}
      {pois.map((p) => {
        const pr = project(p.lng, p.lat, lon0, lat0, R - 4, cx, cy);
        if (!pr.visible) return null;
        const active = activePoiId != null && p.id === activePoiId;
        const pinTop = pr.y - PHOTO_PIN_HEIGHT * PHOTO_PIN_ANCHOR_Y;
        return (
          <Pressable
            key={p.id}
            onPress={() => onPoiPress && onPoiPress(p.id)}
            style={{
              position: 'absolute',
              left: pr.x - PHOTO_PIN_WIDTH / 2,
              top: pinTop,
              width: PHOTO_PIN_WIDTH,
              height: PHOTO_PIN_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={p.label}
            hitSlop={6}
          >
            <PhotoPin theme={t} poi={p} active={active} />
          </Pressable>
        );
      })}

      {/* current-location pin */}
      {pin &&
        (() => {
          const pr = project(pin.lng, pin.lat, lon0, lat0, R - 4, cx, cy);
          if (!pr.visible) return null;
          return (
            <View
              style={{
                position: 'absolute',
                left: pr.x - 7,
                top: pr.y - 7,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: t.dotCore,
                borderWidth: 3,
                borderColor: t.dotRing,
              }}
            />
          );
        })()}
    </View>
  );
}
