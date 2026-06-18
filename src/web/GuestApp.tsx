import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme/AppearanceContext';
import { useI18n } from '../i18n';
import { GuestCover } from './GuestCover';
import { IdentitySheet, type GuestIdentity } from './IdentitySheet';
import { GuestWall } from './GuestWall';
import { useGuestData } from './useGuestData';

const ID_KEY = 'kaipa_guest_identity_v1';

function parseGuestPath(): { slug: string; code: string } | null {
  if (Platform.OS !== 'web') return null;
  const path = decodeURIComponent(window.location.pathname);
  const match = path.match(/^\/j\/(.+)-(\d{4})$/);
  if (!match) return null;
  return { slug: match[1], code: match[2] };
}

function loadIdentity(): GuestIdentity | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = localStorage.getItem(ID_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveIdentity(id: GuestIdentity) {
  if (Platform.OS !== 'web') return;
  try { localStorage.setItem(ID_KEY, JSON.stringify(id)); } catch {}
}

// ── Toast ──
function Toast({ msg, dark }: { msg: string; dark: boolean }) {
  if (!msg) return null;
  return (
    <View style={[s.toast, { backgroundColor: dark ? 'rgba(20,20,22,0.92)' : 'rgba(0,0,0,0.82)' }]}>
      <Text style={s.toastText}>✓ {msg}</Text>
    </View>
  );
}

// ── Error page ──
function ErrorPage({ theme }: { theme: any }) {
  const { t } = useI18n();
  return (
    <View style={[s.center, { backgroundColor: theme.bg }]}>
      <Text style={[s.errorTitle, { color: theme.text }]}>{t('guest.error.title')}</Text>
      <Text style={[s.errorBody, { color: theme.text2 }]}>{t('guest.error.body')}</Text>
    </View>
  );
}

// ── Loading ──
function LoadingPage({ theme }: { theme: any }) {
  const { t } = useI18n();
  return (
    <View style={[s.center, { backgroundColor: theme.bg }]}>
      <ActivityIndicator size="large" color={theme.accent} />
      <Text style={[s.loadingText, { color: theme.text2 }]}>{t('guest.loading')}</Text>
    </View>
  );
}

// ── Main ──
export function GuestApp() {
  const theme = useTheme();
  const parsed = useRef(parseGuestPath()).current;

  const [identity, setIdentity] = useState<GuestIdentity | null>(loadIdentity);
  const [stage, setStage] = useState<'cover' | 'joining' | 'wall'>('cover');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);

  const { loading, error, share, journey, host, companions, moments, addMoment, deleteMoment } =
    useGuestData(parsed?.slug || '', parsed?.code || '');

  if (!parsed) return <ErrorPage theme={theme} />;
  if (loading) return <LoadingPage theme={theme} />;
  if (error || !journey || !host || !share) return <ErrorPage theme={theme} />;

  const handleJoinDone = (id: GuestIdentity) => {
    setIdentity(id);
    saveIdentity(id);
    setStage('wall');
  };

  return (
    <View style={[s.root, { backgroundColor: '#000' }]}>
      <View style={s.device}>
        {stage === 'cover' && (
          <GuestCover
            theme={theme}
            journey={journey}
            host={host}
            companions={companions}
            momentCount={moments.length}
            identity={identity}
            onJoin={() => setStage('joining')}
            onEnter={() => setStage('wall')}
          />
        )}

        {stage === 'wall' && identity && (
          <GuestWall
            theme={theme}
            journey={journey}
            host={host}
            companions={companions}
            identity={identity}
            moments={moments}
            onAddMoment={addMoment}
            onDeleteMoment={deleteMoment}
            onToast={showToast}
          />
        )}

        {stage === 'joining' && (
          <IdentitySheet
            theme={theme}
            hostName={host.display_name}
            onDone={handleJoinDone}
            onClose={() => setStage('cover')}
          />
        )}

        <Toast msg={toast} dark={theme.dark} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  device: {
    width: '100%',
    maxWidth: 500,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 16,
  },
  toast: {
    position: 'absolute',
    left: '50%',
    bottom: 110,
    transform: [{ translateX: -100 }],
    zIndex: 200,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  toastText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#fff',
  },
});
