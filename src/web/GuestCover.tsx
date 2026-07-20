import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { SERIF } from '../theme/fonts';
import { PhotoTile } from '../components/PhotoTile';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';
import { makeIdentity, type GuestIdentity } from './IdentitySheet';
import type { JourneyData, HostData } from './useGuestData';

interface Props {
  theme: Theme;
  journey: JourneyData;
  host: HostData;
  identity: GuestIdentity | null;
  onJoin: (identity: GuestIdentity) => void;
}

// ── tiny stroke icons, sized for the meta row / input ──
function PersonIcon({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke={color} strokeWidth={1.8} />
      <Path d="M4.5 20c0-3.3 3.4-5.5 7.5-5.5s7.5 2.2 7.5 5.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 6.5A1.5 1.5 0 016 5h12a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0118 20H6a1.5 1.5 0 01-1.5-1.5v-12z" stroke={color} strokeWidth={1.7} />
      <Path d="M4.5 9.5h15M8.5 3.5v3M15.5 3.5v3" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}
function PinIcon({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}
function PencilIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6.3a1.4 1.4 0 012 0l.7.7a1.4 1.4 0 010 2L8.1 18.6l-3.6.9.9-3.6L15 6.3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

export function GuestCover({ theme, journey, host, identity, onJoin }: Props) {
  const { t } = useI18n();
  // pre-fill a returning guest's saved name; still editable
  const [name, setName] = useState(identity?.name ?? '');
  const joined = !!identity;
  const canJoin = name.trim().length > 0;
  const metaColor = 'rgba(255,255,255,0.78)';

  const handleJoin = () => {
    if (canJoin) onJoin(makeIdentity(name));
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {journey.coverUrl ? (
        <Image source={{ uri: journey.coverUrl }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <PhotoTile tone={journey.tone} seed={journey.name + 'cover'} resWidth={1200} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.04)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.94)']}
        locations={[0, 0.32, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.content}>
        {/* invited-by pill */}
        <View style={s.invitePill}>
          <PersonIcon color="rgba(255,255,255,0.9)" />
          <Text style={s.inviteText}>{t('guest.cover.invitedByShort', { name: host.display_name })}</Text>
        </View>

        {/* serif title */}
        <Text style={s.title}>{journey.name}</Text>

        {/* meta: date + region, icon-prefixed; long location wraps to its own line */}
        {(journey.date || journey.region) && (
          <View style={s.metaRow}>
            {!!journey.date && (
              <View style={s.metaItem}>
                <CalendarIcon color={metaColor} />
                <Text style={s.meta}>{journey.date}</Text>
              </View>
            )}
            {!!journey.region && (
              <View style={s.metaItem}>
                <PinIcon color={metaColor} />
                <Text style={s.meta}>{journey.region}</Text>
              </View>
            )}
          </View>
        )}

        {/* name input — pre-filled for returning guests */}
        <View style={s.inputWrap}>
          <PencilIcon color="rgba(255,255,255,0.5)" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('guest.identity.namePlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.45)"
            maxLength={16}
            returnKeyType="go"
            onSubmitEditing={handleJoin}
            style={s.input}
          />
        </View>

        {/* CTA */}
        <Press
          onPress={handleJoin}
          style={[
            s.cta,
            { backgroundColor: canJoin ? theme.accent : 'rgba(255,255,255,0.12)', shadowColor: theme.accent },
          ]}
        >
          <Text style={[s.ctaText, !canJoin && s.ctaTextDim]}>
            {joined ? t('guest.identity.enter') : t('guest.cover.joinCta')}
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
    alignItems: 'center',
  },
  invitePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: 18,
  },
  inviteText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 39,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 45,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 18,
    rowGap: 6,
    marginTop: 14,
    maxWidth: '100%',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  meta: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.3,
  },
  inputWrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  input: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
    color: '#fff',
  },
  cta: {
    marginTop: 14,
    alignSelf: 'stretch',
    height: 54,
    borderRadius: 27,
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
  ctaTextDim: {
    color: 'rgba(255,255,255,0.5)',
  },
});
