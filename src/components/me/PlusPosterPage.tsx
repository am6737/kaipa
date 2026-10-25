// PlusPosterPage.tsx — poster page behind the 开爬 Plus starter card, shown
// while the account is in the free open-access campaign. Copy and numbers come
// from the membership status and the 会员与用量 keys, so it never promises more
// than the server grants; 查看会员详情 hands off to the real membership page.
import React, { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, ChevronRight, Cloud, Sparkles, type LucideIcon } from 'lucide-react-native';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import { useI18n, type TKey } from '../../i18n';
import { useMembership } from '../../membership/MembershipContext';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { PosterBackButton } from '../PosterBackButton';
import { makeMeTheme } from './appearance';
import { MeCard, MeSection } from './parts';
import { MembershipUsageCard } from './MembershipUsageCard';

type Benefit = { icon: LucideIcon; title: TKey; description: TKey; action?: { label: TKey; run: () => void } };

export function PlusPosterPage({
  theme: baseTheme,
  onClose,
  onAsk,
  onOpenGear,
  onOpenMembership,
}: {
  theme: Theme;
  onClose: () => void;
  onAsk: (prompt: string) => void;
  onOpenGear: () => void;
  onOpenMembership: () => void;
}) {
  const { t, resolved } = useI18n();
  const insets = useSafeAreaInsets();
  const theme = makeMeTheme(baseTheme);
  const { status, loading, refresh } = useMembership();
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const date = (value: string) => new Date(value).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US');
  const campaign = status?.campaign;
  const benefits: Benefit[] = [
    {
      icon: Sparkles, title: 'membership.intelligenceTitle', description: 'membership.intelligenceDescription',
      action: { label: 'membership.poster.tryAi', run: () => onAsk(t('journeyHome.emptyStart.cards.aiPrompt')) },
    },
    { icon: Cloud, title: 'membership.cloudTitle', description: 'membership.cloudDescription' },
    {
      icon: Archive, title: 'membership.collectionTitle', description: 'membership.collectionDescription',
      action: { label: 'membership.poster.tryGear', run: onOpenGear },
    },
  ];

  return (
    // Same poster layout as the route topic pages: the page owns its scroll
    // view, and the empty hero keeps DetailPage from padding for the top bar.
    <DetailPage theme={theme} onBack={onClose} scrollable={false} hero={<View />} left={<PosterBackButton onPress={onClose} />}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor: theme.groupedBg }} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <PhotoTile tone="dusk" seed="open-access" resWidth={900} style={[styles.poster, { paddingTop: insets.top + layout.topBarHeight }]}>
          <LinearGradient colors={['rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.62)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.posterCopy}>
            <View style={styles.posterTag}>
              <Text style={styles.posterTagText}>{t('membership.entryTitle')}</Text>
            </View>
            <Text style={styles.posterTitle}>{t('membership.poster.title')}</Text>
            <Text style={styles.posterBody}>{t('membership.openAccess')}</Text>
            {campaign?.startsAt ? (
              <Text style={styles.posterMeta}>
                {t('membership.campaignPeriod', { start: date(campaign.startsAt), end: campaign.endsAt ? date(campaign.endsAt) : t('membership.endDatePending') })}
              </Text>
            ) : null}
          </View>
        </PhotoTile>

        <View style={[styles.sheet, { backgroundColor: theme.groupedBg }]}>
          <MeSection theme={theme} title={t('membership.poster.benefitsTitle')} first>
            <MeCard theme={theme}>
              {benefits.map(({ icon: BenefitIcon, title, description, action }, index) => (
                <View key={title} style={[styles.benefit, index ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline } : null]}>
                  <View style={[styles.benefitIcon, { backgroundColor: theme.accentSofter }]}>
                    <BenefitIcon color={theme.accent} size={19} strokeWidth={2.2} />
                  </View>
                  <View style={styles.benefitCopy}>
                    <Text style={[type.cardTitle, { color: theme.text }]}>{t(title)}</Text>
                    <Text style={[type.hint, { color: theme.text2 }]}>{t(description)}</Text>
                    {action ? (
                      <Press accessibilityRole="button" onPress={action.run} style={styles.benefitAction}>
                        <Text style={[styles.benefitActionText, { color: theme.accent }]}>{t(action.label)}</Text>
                        <ChevronRight color={theme.accent} size={15} strokeWidth={2.4} />
                      </Press>
                    ) : null}
                  </View>
                </View>
              ))}
            </MeCard>
          </MeSection>

          {status ? (
            <MembershipUsageCard theme={theme} status={status} title={t('membership.resources')} />
          ) : (
            <Text style={[type.body, styles.statusNote, { color: theme.text2 }]}>{t(loading ? 'membership.loading' : 'membership.unavailable')}</Text>
          )}

          <Text style={[type.hint, styles.statusNote, { color: theme.text3 }]}>{t('membership.products')}</Text>

          <Press accessibilityRole="button" onPress={onOpenMembership} scaleTo={0.985} style={[styles.cta, { backgroundColor: theme.text }]}>
            <Text style={[styles.ctaText, { color: theme.groupedBg }]}>{t('membership.viewDetails')}</Text>
          </Press>
        </View>
      </ScrollView>
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  poster: { minHeight: 420, justifyContent: 'flex-end' },
  posterCopy: { paddingHorizontal: space.xl, paddingBottom: space.xxxl + space.xs },
  posterTag: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.88)' },
  posterTagText: { fontSize: 12.5, fontWeight: '700', color: '#2E2E2E' },
  posterTitle: { marginTop: space.sm, fontSize: 29, lineHeight: 38, fontWeight: '800', letterSpacing: 0, color: '#FFFFFF' },
  posterBody: { marginTop: space.xs, fontSize: 15, lineHeight: 23, color: 'rgba(255, 255, 255, 0.88)' },
  posterMeta: { marginTop: space.sm, fontSize: 13, fontWeight: '700', color: 'rgba(255, 255, 255, 0.78)' },
  // Rounded sheet that overlaps the poster's bottom edge.
  sheet: { marginTop: -space.xl, borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, paddingTop: space.xs },
  benefit: { flexDirection: 'row', gap: space.sm, padding: space.md },
  benefitIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  benefitCopy: { flex: 1, minWidth: 0, gap: space.xxs },
  benefitAction: { alignSelf: 'flex-start', marginTop: space.xxs, paddingVertical: space.xxs, flexDirection: 'row', alignItems: 'center', gap: 2 },
  benefitActionText: { fontSize: 13.5, fontWeight: '700' },
  statusNote: { paddingHorizontal: space.xl, marginTop: space.md },
  cta: { marginTop: space.xxl, marginHorizontal: space.xxxl, minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '600', letterSpacing: 0 },
});
