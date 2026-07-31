import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { space, type } from '../../design-system';
import type { JourneyLocationMapProps } from './JourneyLocationMap';

let NativeMap: React.ComponentType<JourneyLocationMapProps> | null = null;
if ((process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '').trim()) {
  try {
    // Lazy require keeps Expo Go usable when the native Mapbox module is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    NativeMap = require('./JourneyLocationMap').default;
  } catch {
    NativeMap = null;
  }
}

class MapBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fallback({ theme, title, body }: { theme: Theme; title: string; body: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: theme.fieldSurface }]}>
      <View style={{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceTop }}>
        <Icon name="pin" size={23} color={theme.text2} />
      </View>
      <Text style={[type.cardTitle, { color: theme.text, marginTop: space.md, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { color: theme.text2, lineHeight: 21, marginTop: space.xs, textAlign: 'center' }]}>{body}</Text>
    </View>
  );
}

export function JourneyLocationMapHost(
  props: JourneyLocationMapProps & { fallbackTitle: string; fallbackBody: string },
) {
  const fallback = <Fallback theme={props.theme} title={props.fallbackTitle} body={props.fallbackBody} />;
  if (!NativeMap) return fallback;
  const Map = NativeMap;
  return (
    <MapBoundary fallback={fallback}>
      <View style={StyleSheet.absoluteFill}>
        <Map {...props} />
      </View>
    </MapBoundary>
  );
}
