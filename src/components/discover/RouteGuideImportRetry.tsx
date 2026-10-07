import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RouteGuideJourneyTemplate } from '../../data/routeGuides';
import { radius, space } from '../../design-system';
import { useI18n } from '../../i18n';
import { applyRouteGuideTemplate } from '../../lib/routeGuideImport';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { routeGuideCopy } from './routeGuideCopy';

export function RouteGuideImportRetry({ theme, journeyId, template, onDone, onDismiss }: {
  theme: Theme; journeyId: string; template: RouteGuideJourneyTemplate; onDone: () => void; onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets(); const { resolved } = useI18n(); const c = routeGuideCopy[resolved];
  const busy = useRef(false); const [saving, setSaving] = useState(false);
  const retry = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try { await applyRouteGuideTemplate(journeyId, template); onDone(); }
    catch { /* Keep the created journey and retry affordance available. */ }
    finally { busy.current = false; setSaving(false); }
  };
  return <View style={[styles.notice, { bottom: insets.bottom + 104, backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
    <Text style={{ color: theme.text2, fontSize: 12, lineHeight: 21 }}>{c.importFailed}</Text>
    <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.sm }}>
      <Press disabled={saving} onPress={() => void retry()} accessibilityRole="button" style={styles.action}>{saving ? <ActivityIndicator color={theme.accent} size="small" /> : null}<Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>{c.retry}</Text></Press>
      <Press disabled={saving} onPress={onDismiss} accessibilityRole="button" style={styles.action}><Text style={{ color: theme.text2, fontSize: 13 }}>{c.close}</Text></Press>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  notice: { position: 'absolute', zIndex: 280, left: space.xl, right: space.xl, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
});
