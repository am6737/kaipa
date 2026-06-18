import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { Avatar } from '../components/Avatar';
import { Press } from '../components/Press';
import { paletteFor, type Tone } from '../data/tones';
import { useI18n } from '../i18n';

const TONE_CHOICES: Tone[] = ['forest', 'dusk', 'river', 'rock', 'sand', 'night', 'moss', 'snow'];

export interface GuestIdentity {
  name: string;
  ini: string;
  tone: string;
}

interface Props {
  theme: Theme;
  hostName: string;
  onDone: (identity: GuestIdentity) => void;
  onClose: () => void;
}

function iniOf(name: string): string {
  const s = (name || '').trim();
  if (!s) return '';
  return s.slice(0, /[a-zA-Z]/.test(s[0]) ? 2 : 1);
}

export function IdentitySheet({ theme, hostName, onDone, onClose }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [tone, setTone] = useState<Tone>('river');
  const valid = name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    onDone({ name: name.trim(), ini: iniOf(name.trim()), tone });
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.sheetWrap}
      >
        <View style={[s.sheet, { backgroundColor: theme.dark ? '#1c1c1e' : theme.bg }]}>
          <View style={s.handle} />

          <View style={s.header}>
            <Text style={[s.headerTitle, { color: theme.text }]}>{t('guest.identity.title')}</Text>
            <Text style={[s.headerSub, { color: theme.text2 }]}>
              {t('guest.identity.subtitle', { host: hostName })}
            </Text>
          </View>

          {/* avatar preview */}
          <View style={s.avatarWrap}>
            <Avatar ini={iniOf(name) || '友'} tone={tone} size={84} />
          </View>
          <Text style={[s.avatarHint, { color: theme.text3 }]}>{t('guest.identity.avatarHint')}</Text>

          {/* name input */}
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('guest.identity.namePlaceholder')}
            placeholderTextColor={theme.text3}
            maxLength={16}
            autoFocus
            onSubmitEditing={submit}
            style={[s.input, {
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderColor: theme.hairline,
              color: theme.text,
            }]}
          />

          {/* tone color picker */}
          <View style={s.toneRow}>
            {TONE_CHOICES.map((tn) => {
              const p = paletteFor(tn);
              const on = tn === tone;
              return (
                <Press
                  key={tn}
                  onPress={() => setTone(tn)}
                  style={[s.toneDot, on && { borderWidth: 2.5, borderColor: theme.accent }]}
                >
                  <LinearGradient
                    colors={[p[0], p[1]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.toneGrad}
                  />
                </Press>
              );
            })}
          </View>

          {/* enter button */}
          <Press
            onPress={submit}
            style={[s.enterBtn, {
              backgroundColor: valid ? theme.accent : (theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
            }]}
          >
            <Text style={[s.enterText, { color: valid ? '#fff' : theme.text3 }]}>
              {t('guest.identity.enter')}
            </Text>
          </Press>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  header: {
    alignItems: 'center',
    marginBottom: 22,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 13,
    marginTop: 5,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarHint: {
    textAlign: 'center',
    fontSize: 11.5,
    marginBottom: 18,
  },
  input: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  toneRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  toneDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  toneGrad: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  enterBtn: {
    marginTop: 24,
    height: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
