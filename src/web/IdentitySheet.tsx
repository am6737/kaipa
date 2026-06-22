import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';

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
  const valid = name.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    onDone({ name: name.trim(), ini: iniOf(name.trim()), tone: 'river' });
  };

  return (
    <View style={[StyleSheet.absoluteFill, s.overlay]}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.dialog, { backgroundColor: theme.dark ? '#1c1c1e' : theme.bg }]}>
        <Text style={[s.title, { color: theme.text }]}>{t('guest.identity.title')}</Text>
        <Text style={[s.subtitle, { color: theme.text2 }]}>
          {t('guest.identity.subtitle', { host: hostName })}
        </Text>

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
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
    // @ts-ignore – web-only
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
  dialog: {
    width: '85%',
    maxWidth: 340,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 22,
  },
  input: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  enterBtn: {
    marginTop: 18,
    width: '100%',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
