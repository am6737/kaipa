// JourneyCodeEntrySheet.tsx — 使用旅程口令: manual entry for the 4-digit
// passphrase share channel. Complements the QR scanner (口令与二维码两条路径
// 分开): a friend who only got the code types it here. If several journeys
// share the same active code, the candidate list lets them pick the right one.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Poi } from '../../data/pois';
import { motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { joinJourneyBySlugCode, fetchJourneyPoiById } from '../../lib/journeyInvite';
import { joinJourneyByCode, type CodeJoinCandidate } from '../../lib/journeyShare';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

export function JourneyCodeEntrySheet({
  theme,
  onClose,
  onJoined,
}: {
  theme: Theme;
  onClose: () => void;
  onJoined: (journey: Poi) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const translateY = useRef(new Animated.Value(600)).current;
  const inputRef = useRef<TextInput>(null);
  const submittedCodeRef = useRef('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<CodeJoinCandidate[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
  }, [translateY]);

  // Android may ignore autoFocus while the sheet is mounting/animating. Focus
  // after the first layout so the soft keyboard is opened reliably.
  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 360);
    return () => clearTimeout(focusTimer);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: motion.quick, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
        }
      },
    }),
  ).current;

  const mapJoinError = useCallback((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : '';
    setError(
      message.includes('JOURNEY_FULL') ? t('qrLogin.errorJourneyFull')
        : message.includes('AUTH') ? t('passphrase.authRequired')
        : message.includes('LIMIT') ? t('passphrase.joinLimited')
        : message.includes('INVALID') ? t('passphrase.invalidCode')
        : t('passphrase.joinFailed'),
    );
  }, [t]);

  const submit = useCallback(async (nextCode: string) => {
    if (busy || nextCode.length !== 4) return;
    setBusy(true);
    setError('');
    setCandidates([]);
    try {
      const result = await joinJourneyByCode(nextCode);
      if (result.status === 'ambiguous') {
        setCandidates(result.candidates);
      } else {
        onJoined(await fetchJourneyPoiById(result.journeyId));
      }
    } catch (cause) {
      mapJoinError(cause);
      setTimeout(() => inputRef.current?.focus(), motion.quick);
    } finally {
      setBusy(false);
    }
  }, [busy, mapJoinError, onJoined]);

  useEffect(() => {
    if (code.length !== 4) {
      submittedCodeRef.current = '';
      return;
    }
    if (submittedCodeRef.current === code) return;
    submittedCodeRef.current = code;
    const id = setTimeout(() => void submit(code), motion.quick);
    return () => clearTimeout(id);
  }, [code, submit]);

  const changeCode = useCallback((value: string) => {
    const nextCode = value.replace(/\D/g, '').slice(0, 4);
    setCode(nextCode);
    setError('');
    setCandidates([]);
  }, []);

  const pickCandidate = useCallback(async (candidate: CodeJoinCandidate) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setJoiningId(candidate.journeyId);
    try {
      onJoined(await joinJourneyBySlugCode(candidate.slug, code.trim()));
    } catch (cause) {
      mapJoinError(cause);
      setTimeout(() => inputRef.current?.focus(), motion.quick);
    } finally {
      setBusy(false);
      setJoiningId(null);
    }
  }, [busy, code, mapJoinError, onJoined]);

  return (
    <KeyboardAvoidingView
      style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 70 }]}
      // Only compensate for the part of the sheet covered by the keyboard.
      behavior="translate-with-padding"
      automaticOffset
    >
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY }],
            backgroundColor: theme.groupedBg,
            borderColor: theme.border,
            minHeight: keyboardVisible ? undefined : '54%',
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        <View {...pan.panHandlers} style={styles.grabberArea}>
          <View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} />
        </View>

        <View style={styles.body}>
          <Text style={[type.pageTitle, styles.title, { color: theme.text }]}>{t('passphrase.entryTitle')}</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('passphrase.entryTitle')}
            onPress={() => inputRef.current?.focus()}
            style={styles.codeInput}
          >
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={changeCode}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              showSoftInputOnFocus
              caretHidden
              contextMenuHidden
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              style={styles.hiddenInput}
            />
            {[0, 1, 2, 3].map((index) => {
              return (
                <View
                  key={index}
                  style={[
                    styles.codeCell,
                    {
                      backgroundColor: theme.surfaceTop,
                    },
                  ]}
                >
                  <Text style={[styles.codeDigit, { color: theme.text }]}>{code[index] || ''}</Text>
                </View>
              );
            })}
          </Pressable>

          {busy ? (
            <ActivityIndicator
              accessibilityLabel={t('guest.loading')}
              color={theme.accent}
              size="small"
              style={styles.loading}
            />
          ) : null}

          {error ? <Text style={[type.caption, styles.error, { color: theme.danger }]}>{error}</Text> : null}

          {candidates.length ? (
            <View style={[styles.candidates, { backgroundColor: theme.surfaceTop, borderColor: theme.border }]}>
              <Text style={[type.caption, { color: theme.text2, marginBottom: space.xs }]}>{t('passphrase.ambiguousTitle')}</Text>
              {candidates.map((candidate) => (
                <Press
                  key={candidate.journeyId}
                  accessibilityRole="button"
                  accessibilityLabel={candidate.name}
                  onPress={() => void pickCandidate(candidate)}
                  style={styles.candidateRow}
                >
                  <Text numberOfLines={1} style={[type.body, styles.candidateName, { color: theme.text }]}>{candidate.name}</Text>
                  {joiningId === candidate.journeyId ? (
                    <ActivityIndicator size="small" color={theme.text3} />
                  ) : (
                    <Icon name="chevronR" color={theme.text3} size={16} strokeWidth={2} />
                  )}
                </Press>
              ))}
            </View>
          ) : null}

        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    minHeight: '54%',
    maxHeight: '92%',
    overflow: 'hidden',
    borderTopLeftRadius: radius.feature,
    borderTopRightRadius: radius.feature,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grabberArea: {
    paddingTop: space.sm,
    paddingBottom: space.xs,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
  },
  body: {
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
    paddingBottom: space.xxl,
  },
  title: {
    textAlign: 'center',
  },
  codeInput: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 280,
    marginTop: space.xxl,
    flexDirection: 'row',
    gap: space.sm,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0,
  },
  codeCell: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 62,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: '700',
  },
  loading: {
    marginTop: space.md,
  },
  error: {
    marginTop: space.sm,
    textAlign: 'center',
    lineHeight: 18,
  },
  candidates: {
    marginTop: space.md,
    borderRadius: radius.feature,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
  },
  candidateRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  candidateName: {
    flex: 1,
    marginRight: space.sm,
  },
});
