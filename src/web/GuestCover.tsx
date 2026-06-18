import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';
import type { JourneyData, HostData, CompanionData } from './useGuestData';

interface GuestIdentity {
  name: string;
  ini: string;
  tone: string;
}

interface Props {
  theme: Theme;
  journey: JourneyData;
  host: HostData;
  companions: CompanionData[];
  momentCount: number;
  identity: GuestIdentity | null;
  onJoin: () => void;
  onEnter: () => void;
}

export function GuestCover({ theme, journey, host, companions, momentCount, identity, onJoin, onEnter }: Props) {
  const { t } = useI18n();
  const joined = !!identity;

  const companionAvatars = companions.map((c) => ({
    ini: c.ini,
    color: c.color,
    tone: c.tone || undefined,
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <PhotoTile tone={journey.tone} seed={journey.name + 'cover'} resWidth={1200} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.content}>
        {/* host line */}
        <View style={s.hostRow}>
          <Avatar ini={host.avatar_ini || host.display_name.slice(0, 1)} color={host.avatar_color} size={30} />
          <Text style={s.hostText}>
            <Text style={s.hostName}>{host.display_name}</Text>
            {' '}{t('guest.cover.invitedBy', { name: '' }).replace('{name} ', '')}
          </Text>
        </View>

        {/* title */}
        <Text style={s.title}>{journey.name}</Text>
        <Text style={s.meta}>
          {[journey.date, journey.region].filter(Boolean).join(' · ')}
        </Text>

        {/* companion stack + counts */}
        <View style={s.socialRow}>
          {companionAvatars.length > 0 && (
            <AvatarStack people={companionAvatars} size={32} max={4} ringColor="rgba(0,0,0,0.5)" />
          )}
          <Text style={s.socialText}>
            <Text style={s.socialNum}>{companions.length}</Text>
            {' '}{t('guest.cover.companions', { count: '' }).replace('{count} ', '')}
            <Text style={s.socialDot}> · </Text>
            <Text style={s.socialNum}>{momentCount}</Text>
            {' '}{t('guest.cover.moments', { count: '' }).replace('{count} ', '')}
          </Text>
        </View>

        {/* CTA */}
        <Press
          onPress={joined ? onEnter : onJoin}
          style={[s.cta, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
        >
          {joined && identity && (
            <Avatar ini={identity.ini} tone={identity.tone} size={26} ring />
          )}
          <Text style={s.ctaText}>
            {joined && identity
              ? t('guest.cover.enterAs', { name: identity.name })
              : t('guest.cover.joinCta')}
          </Text>
        </Press>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'flex-end',
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 16,
  },
  hostText: {
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.85)',
  },
  hostName: {
    fontWeight: '700',
    color: '#fff',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    lineHeight: 39,
  },
  meta: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 10,
    letterSpacing: 0.3,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
  },
  socialText: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  socialNum: {
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#fff',
  },
  socialDot: {
    opacity: 0.4,
  },
  cta: {
    marginTop: 26,
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaText: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#fff',
  },
});
