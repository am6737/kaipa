import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../i18n';
import { radius, space } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { guideFilename, type GuideDocumentData } from '../../lib/routeGuideExport';
import { createMediaLibraryAsset, requestMediaLibraryPermissions } from '../../lib/mediaLibrary';
import { Press } from '../Press';
import { routeGuideCopy } from './routeGuideCopy';
import { GuideEquipmentColumns } from './GuideEquipmentColumns';

export function GuideDocument({ data, theme }: { data: GuideDocumentData; theme: Theme }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  return <View style={[styles.document, { backgroundColor: theme.surfaceTop }]}>
    <View style={styles.documentBrand}>
      <Text style={[styles.documentBrandText, { color: theme.text3 }]}>Kaipa 开爬</Text>
    </View>
    <Text style={[styles.title, { color: theme.text }]}>{data.title}</Text>
    <View style={styles.metricsRow}>
      <Text style={[styles.metric, { color: theme.text2 }]}>{resolved === 'zh' ? '距离' : 'Distance'} {data.distance || '—'}</Text>
      <Text style={[styles.metric, { color: theme.text2 }]}>{resolved === 'zh' ? '最高海拔' : 'Highest elevation'} {data.highestElevation || '—'}</Text>
    </View>
    <Text style={[styles.meta, { color: theme.text2 }]}>{data.author}    {data.date}</Text>
    {data.description ? <Text style={[styles.description, { color: theme.text2 }]}>{data.description}</Text> : null}
    <Text style={[styles.section, { color: theme.text }]}>{c.dayPlan}</Text>
    {data.days.map((day) => <View key={day.label} style={styles.day}> 
      <Text style={[styles.dayLabel, { color: theme.text }]}>{day.label}</Text>
      {day.summary ? <Text style={[styles.dayTitle, { color: theme.text }]}>{day.summary}</Text> : null}
      {day.items.map((item, index) => <Text key={`${day.label}-${index}`} style={[styles.item, { color: theme.text2 }]}>{String(index + 1).padStart(2, '0')}  {item}</Text>)}
    </View>)}
    <View style={[styles.gearHeader, { marginTop: 0, marginBottom: 10 }]}><Text style={[styles.section, { color: theme.text, marginTop: 0, marginBottom: 0 }]}>{c.gearTitle}</Text></View>
    <View style={styles.exportWeightStats}>{[
      [resolved === 'zh' ? '包重' : 'Pack', data.weightStats.pack],
      [resolved === 'zh' ? '基础' : 'Base', data.weightStats.base],
      [resolved === 'zh' ? '消耗' : 'Consumable', data.weightStats.consumable],
      [resolved === 'zh' ? '穿戴' : 'Worn', data.weightStats.worn],
    ].map(([label, value]) => <View key={String(label)} style={styles.exportWeightStat}><Text style={[styles.meta, { color: theme.text3 }]}>{label}</Text><Text style={[styles.group, { color: theme.text }]}>{Number(value) > 0 ? `${Number(value).toFixed(2)} kg` : '—'}</Text></View>)}</View>
    <GuideEquipmentColumns columns={2} groups={data.gearGroups} itemNames={(group) => group.items.map((item) => item.name)}
      renderGroup={(group) => <View key={group.title}>
        <Text style={[styles.group, { color: theme.text }]}>{group.title}</Text>
        {group.items.map((item) => <View key={item.name} style={styles.gearRow}>
          <Text style={[styles.item, styles.gearName, { color: theme.text2 }]}>{item.name}</Text>
          <Text style={[styles.gearWeight, { color: theme.text2 }]}>{item.weight || ''}</Text><Text style={[styles.gearQuantity, { color: theme.text2 }]}>{`×${item.quantity}`}</Text>
        </View>)}
      </View>} />
    <Text style={[styles.section, { color: theme.text }]}>{c.reviewTitle}</Text>
    <Text style={[styles.body, { color: theme.text2 }]}>{data.review}</Text>
  </View>;
}

export function RouteGuideExportSheet({ theme, doc, shotRef, captureReady, onClose, onToast }: { theme: Theme; doc: GuideDocumentData; shotRef: React.MutableRefObject<any>; captureReady: boolean; onClose: () => void; onToast: (message: string) => void }) {
  const { resolved, t } = useI18n();
  const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const exportWidth = Math.ceil(Dimensions.get('screen').width);
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null);
  const busy = busyAction !== null;
  const [savedNotice, setSavedNotice] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  const showSavedNotice = () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setSavedNotice(true);
    noticeTimer.current = setTimeout(() => setSavedNotice(false), 1900);
  };
  const run = async (name: 'share' | 'save', action: () => Promise<void>) => {
    if (busy) return;
    setBusyAction(name);
    try {
      await action();
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.warn('[RouteGuideExport]', error);
        onToast(c.exportFailed);
      }
    } finally {
      setBusyAction(null);
    }
  };
  const captureImage = async () => {
    if (!captureReady || !shotRef.current) throw new Error('Export view is not ready');
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    // iOS drawViewHierarchyInRect can fail on large views. This document uses
    // plain views and text, so renderInContext can capture its full height.
    return captureRef(shotRef, { format: 'png' as const, quality: 1, useRenderInContext: true });
  };
  const shareImage = () => run('share', async () => {
    const uri = await captureImage();
    if (!uri) throw new Error('Export image is empty');
    if (Platform.OS === 'web') { const link = document.createElement('a'); link.href = uri; link.download = guideFilename(doc.title, 'png'); link.click(); }
    else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: doc.title });
    else await Share.share({ title: doc.title, url: uri });
  });
  const saveImage = () => run('save', async () => {
    const uri = await captureImage();
    if (!uri) throw new Error('Export image is empty');
    if (Platform.OS === 'web') { const link = document.createElement('a'); link.href = uri; link.download = guideFilename(doc.title, 'png'); link.click(); }
    else {
      // This export only writes a new image, so request the photo write
      // permission explicitly instead of requiring read access to the library.
      const { status } = await requestMediaLibraryPermissions(true);
      if (status !== 'granted') { onToast(c.permissionRequired); return; }
      await createMediaLibraryAsset(uri);
    }
    showSavedNotice();
  });
  return <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.groupedBg }]}>
    <SafeAreaView edges={['top']} style={styles.topSafeArea}>
      <View style={styles.topBar}>
        <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.topAction}>
          <Text style={[styles.topActionText, { color: theme.text }]}>{t('common.cancel')}</Text>
        </Press>
      </View>
    </SafeAreaView>
    <ScrollView removeClippedSubviews={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}><View style={{ width: exportWidth, paddingHorizontal: space.lg }}><GuideDocument data={doc} theme={theme} /></View></ScrollView>
    <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.actionGroup}>
        <Press disabled={busy} onPress={shareImage} accessibilityRole="button" accessibilityLabel={c.shareText} accessibilityState={{ disabled: busy, busy: busyAction === 'share' }} style={styles.shareButton}>{busyAction === 'share' ? <ActivityIndicator color="#fff" /> : <Text style={styles.shareButtonText}>{c.shareText}</Text>}</Press>
        <Press disabled={busy} onPress={saveImage} accessibilityRole="button" accessibilityLabel={c.saveToAlbum} accessibilityState={{ disabled: busy, busy: busyAction === 'save' }} style={styles.saveButton}>{busyAction === 'save' ? <ActivityIndicator color="#000" /> : <Text style={styles.saveButtonText}>{c.saveToAlbum}</Text>}</Press>
      </View>
    </View>
    {savedNotice ? <View pointerEvents="none" style={styles.savedNotice}><Text style={styles.savedNoticeText}>✓  {c.saved}</Text></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { zIndex: 80 },
  topSafeArea: { flexShrink: 0 },
  topBar: { height: 58, paddingHorizontal: space.lg, justifyContent: 'center' },
  topAction: { alignSelf: 'flex-start', minWidth: 54, height: 44, justifyContent: 'center' },
  topActionText: { fontSize: 16, fontWeight: '700' },
  document: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 20, borderRadius: radius.card },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, marginTop: space.sm },
  meta: { fontSize: 10.5, lineHeight: 16, marginTop: space.sm },
  section: { fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  day: { marginBottom: 14 },
  dayLabel: { fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  dayTitle: { fontSize: 12, lineHeight: 19, fontWeight: '700', marginTop: 2 },
  body: { fontSize: 12, lineHeight: 19, marginTop: 4 },
  description: { fontSize: 12.5, lineHeight: 20, marginTop: 12 },
  item: { fontSize: 12, lineHeight: 19, marginTop: 2 },
  gearHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  gearRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginTop: 1 },
  gearName: { flex: 1, minWidth: 0, marginTop: 0, fontSize: 9.5, lineHeight: 14 },
  gearWeight: { width: 40, flexShrink: 0, fontSize: 8, lineHeight: 14, textAlign: 'right' },
  gearQuantity: { width: 14, flexShrink: 0, fontSize: 8, lineHeight: 14, textAlign: 'right' },
  exportWeightStats: { flexDirection: 'row', gap: space.xs, marginTop: 0, marginBottom: 10 },
  exportWeightStat: { flex: 1, gap: 3 },
  group: { fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  documentBrand: { position: 'absolute', top: 12, right: 16, zIndex: 1 },
  documentBrandText: { fontSize: 7.5, lineHeight: 11, fontWeight: '700', letterSpacing: 1.2 },
  metricsRow: { flexDirection: 'row', gap: space.xl, marginTop: 10 },
  metric: { fontSize: 10.5, lineHeight: 16 },
  actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  actionGroup: { flexDirection: 'row', gap: space.xs, padding: 5, borderRadius: radius.pill, backgroundColor: '#000000', shadowColor: '#000000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 8 },
  shareButton: { minWidth: 92, height: 46, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  shareButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  saveButton: { minWidth: 154, height: 46, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  savedNotice: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center', zIndex: 200 },
  savedNoticeText: { color: '#FFFFFF', backgroundColor: 'rgba(20,20,22,0.92)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11, fontSize: 13.5, fontWeight: '600' },
});
