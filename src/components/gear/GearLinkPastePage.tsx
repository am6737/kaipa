// GearLinkPastePage.tsx — 粘贴链接 from the 添加装备 menu. One question and one
// field: paste a product link (or whole share text), recognize it here, then
// hand the filled item to the form for review.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { GearCat, GearItem } from '../../data/gear';
import { DetailPage, radius, space, type } from '../../design-system';
import { fetchGearLinkPreview } from '../../lib/gearLinkPreview';
import { firstLink, itemFromLinkPreview, providerLabel } from './gearRecognition';

export function GearLinkPastePage({ theme, cats, onCancel, onRecognized, onManual }: {
  theme: Theme;
  cats: GearCat[];
  onCancel: () => void;
  onRecognized: (item: GearItem, source: { label: string; url?: string }) => void;
  onManual: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Bumped on unmount so a late preview never opens the form after leaving.
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);

  const link = firstLink(text);
  const edit = (next: string) => {
    setText(next);
    setError('');
  };

  const paste = async () => {
    let next = '';
    try {
      next = await Clipboard.getStringAsync();
    } catch {
      next = '';
    }
    if (!firstLink(next)) {
      setError(t('gear.add.clipboardNoLink'));
      return;
    }
    edit(next);
  };

  const submit = async () => {
    if (!link || busy) return;
    const current = ++run.current;
    setBusy(true);
    setError('');
    try {
      const preview = await fetchGearLinkPreview(link, text);
      if (current !== run.current) return;
      onRecognized(itemFromLinkPreview(preview, cats), { label: providerLabel(preview.provider), url: preview.sourceUrl });
    } catch (failure) {
      if (current !== run.current) return;
      setBusy(false);
      setError(failure instanceof Error && failure.message ? failure.message : t('gear.add.linkFailed'));
    }
  };

  return (
    <DetailPage theme={theme} onBack={onCancel} backgroundColor={theme.groupedBg} flatChrome scrollable={false}>
      <View style={{ paddingHorizontal: space.xxl, paddingTop: space.lg }}>
        <Text style={[type.question, { color: theme.text }]}>{t('gear.add.linkQuestion')}</Text>

        <View style={{ minHeight: 56, marginTop: space.xxl, paddingLeft: space.lg, paddingRight: space.xs, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.featureSurface }}>
          <TextInput
            autoFocus
            value={text}
            onChangeText={edit}
            editable={!busy}
            placeholder={t('gear.add.linkPlaceholder')}
            placeholderTextColor={theme.text3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={submit}
            numberOfLines={1}
            style={{ flex: 1, paddingVertical: space.sm, fontSize: link ? 13 : 15, fontFamily: link ? MONO : undefined, color: theme.text }}
          />
          {busy ? (
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : link ? (
            <Press accessibilityRole="button" accessibilityLabel={t('gear.add.recognize')} onPress={submit} style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
              <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="arrowL" color="#FFFFFF" size={18} strokeWidth={2.3} /></View>
            </Press>
          ) : (
            <Press accessibilityRole="button" onPress={paste} style={{ minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('gear.add.paste')}</Text>
            </Press>
          )}
        </View>

        {busy ? (
          <Text accessibilityLiveRegion="polite" style={[type.hint, { marginTop: space.sm, paddingHorizontal: space.lg, color: theme.text2 }]}>{t('gear.add.readingLink')}</Text>
        ) : error ? (
          <View style={{ marginTop: space.sm, paddingHorizontal: space.lg }}>
            <Text accessibilityLiveRegion="polite" style={[type.hint, { color: theme.danger }]}>{error}</Text>
            <Press accessibilityRole="button" onPress={onManual} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: space.xs }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text2 }}>{t('gear.add.manual')}</Text>
            </Press>
          </View>
        ) : text.trim() && !link ? (
          <Text style={[type.hint, { marginTop: space.sm, paddingHorizontal: space.lg, color: theme.text3 }]}>{t('gear.add.noLinkInText')}</Text>
        ) : null}
      </View>
    </DetailPage>
  );
}
