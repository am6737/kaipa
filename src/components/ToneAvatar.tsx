// ToneAvatar.tsx — a small circular initials chip colored by a journey "tone".
// Shared by the host (HostShareSheet roster) and guest (NearbyJoinSheet) live-
// share surfaces so the two sides look consistent. The tone palette mirrors the
// identity tones used in the web guest flow.
import React from 'react';
import { View, Text } from 'react-native';

const TONE_COLORS: Record<string, string> = {
  river: '#0EAFB1',
  forest: '#2EB85C',
  dawn: '#FF9500',
  dusk: '#FF375F',
  night: '#5E5CE6',
  ridge: '#8E8E93',
  snow: '#0A84FF',
};

export const toneColor = (tone?: string) => (tone && TONE_COLORS[tone]) || '#0A84FF';

export function initialsFor(name: string): string {
  const s = (name || '').trim();
  if (!s) return '';
  return s.slice(0, /[a-zA-Z]/.test(s[0]) ? 2 : 1);
}

export function ToneAvatar({ name, tone, size = 30, ring }: { name: string; tone?: string; size?: number; ring?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: toneColor(tone),
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      <Text style={{ fontSize: Math.round(size * 0.42), fontWeight: '700', color: '#fff' }}>{initialsFor(name)}</Text>
    </View>
  );
}

/** Overlapping disc stack (social proof), matching the invite/guest-cover design. */
export function AvatarStack({ people, size = 32, ring = 'rgba(0,0,0,0.45)' }: { people: { name: string; tone?: string }[]; size?: number; ring?: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.map((p, i) => (
        <View key={i} style={{ marginLeft: i ? -Math.round(size * 0.3) : 0 }}>
          <ToneAvatar name={p.name} tone={p.tone} size={size} ring={ring} />
        </View>
      ))}
    </View>
  );
}
