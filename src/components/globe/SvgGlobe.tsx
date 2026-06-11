// SvgGlobe.tsx — stylized fallback globe (ported from the prototype's globe.jsx),
// upgraded to place POIs by real orthographic projection so they sit
// geographically. Used when no Mapbox token is configured (e.g. Expo Go).
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, Pressable } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Polyline, ClipPath, G } from 'react-native-svg';
import { GlobeProps, poiColor } from './types';
import { project, graticule } from './projection';

export default function SvgGlobe({ theme, size, pois, activePoiId, onPoiPress, center, pin }: GlobeProps) {
  const t = theme;
  const R = size / 2;
  const cx = R;
  const cy = R;
  const lon0 = center?.lon ?? 100;
  const lat0 = center?.lat ?? 32;

  const lines = graticule(lon0, lat0, R - 1, cx, cy);

  // gentle pulse for ongoing / active points
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.5, 0, 0] });

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

      {/* projected, tappable POIs */}
      {pois.map((p) => {
        const pr = project(p.lng, p.lat, lon0, lat0, R - 4, cx, cy);
        if (!pr.visible) return null;
        const active = activePoiId != null && p.id === activePoiId;
        const { fill, hollow } = poiColor(p, t);
        const isOngoing = p.status === 'ongoing';
        const r = active ? 7 : 6;
        return (
          <Pressable
            key={p.id}
            onPress={() => onPoiPress && onPoiPress(p.id)}
            style={{
              position: 'absolute',
              left: pr.x - 14,
              top: pr.y - 14,
              width: 28,
              height: 28,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            hitSlop={6}
          >
            {(isOngoing || active) && (
              <Animated.View
                style={{
                  position: 'absolute',
                  width: r * 2,
                  height: r * 2,
                  borderRadius: r,
                  borderWidth: 1.2,
                  borderColor: fill,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                }}
              />
            )}
            <View
              style={{
                width: r,
                height: r,
                borderRadius: r / 2,
                backgroundColor: hollow ? t.bg : fill,
                borderWidth: active ? 2 : 1.4,
                borderColor: hollow ? fill : t.dark ? '#000' : '#fff',
              }}
            />
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
