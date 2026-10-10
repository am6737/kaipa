import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ArrowRight, ChartNoAxesColumn } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useMembership } from '../../membership/MembershipContext';
import { hexToRgb, type Theme } from '../../theme/theme';
import { Press } from '../Press';

function blend(accent: string, base: string, amount: number) {
  const foreground = hexToRgb(accent);
  const background = hexToRgb(base);
  return `rgb(${foreground.map((channel, index) => Math.round(channel * amount + background[index] * (1 - amount))).join(',')})`;
}

export function MembershipEntryCard({ theme, onPress, onUsage }: { theme: Theme; onPress: () => void; onUsage: () => void }) {
  const { t, resolved } = useI18n();
  const { status, loading, stale } = useMembership();
  const member = status?.membershipPlan === 'member';
  const current = status && !stale;
  const action = t(!current ? 'membership.viewDetails' : member ? 'membership.currentSubscription' : 'membership.viewPlans');
  const campaign = current && !member ? status.campaign : null;
  const startDate = campaign?.startsAt ? new Date(campaign.startsAt) : null;
  const campaignSubtitle = startDate ? t('membership.campaignSince', {
    date: `${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')}`,
  }) : null;
  const subtitle = !current
    ? t(loading ? 'membership.loading' : status ? 'membership.stale' : 'membership.unavailable')
    : member
      ? status.isLifetime ? t('membership.lifetimePlan') : status.validUntil
        ? `${t('membership.validUntil')} ${new Date(status.validUntil).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US')}`
        : t('membership.member')
      : campaignSubtitle ?? t('membership.entrySubtitle');
  const badge = current ? t(member ? 'membership.subscribed' : status.campaign ? 'membership.experienceTitle' : 'membership.notSubscribed')
    : t(loading ? 'membership.loading' : 'membership.usageUnavailable');
  const base = theme.dark ? theme.surfaceTop : '#FFFFFF';
  const cardStart = blend(theme.accent, base, theme.dark ? 0.16 : 0.045);
  const cardMid = blend(theme.accent, base, theme.dark ? 0.11 : 0.075);
  const cardEnd = blend(theme.accent, base, theme.dark ? 0.20 : 0.12);

  return (
    <LinearGradient colors={[cardStart, cardMid, cardEnd]} locations={[0, 0.52, 1]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.showcase, minHeight: 200, padding: space.lg, overflow: 'hidden', justifyContent: 'space-between',
        borderWidth: 1, borderColor: theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.88)' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: -90, right: -70, width: 250, height: 170, borderRadius: 160,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.50)', transform: [{ rotate: '-16deg' }] }} />
      <Press accessibilityRole="button" accessibilityLabel={`${t('membership.entryTitle')}，${badge}，${subtitle}`} onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <View style={{ flexShrink: 1, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill,
            backgroundColor: theme.dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.65)' }}>
            <Text style={[type.caption, { color: theme.text2 }]}>{badge}</Text>
          </View>
          <Text style={[type.pageTitle, { color: theme.text, flexShrink: 1, textAlign: 'right' }]}>{t('membership.entryTitle')}</Text>
        </View>
        <Text style={[type.body, { color: theme.text2, lineHeight: 20, marginTop: space.md }]}>{subtitle}</Text>
      </Press>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xl }}>
        <Press accessibilityRole="button" onPress={onPress}
          style={{ flex: 1, minWidth: 104, minHeight: 48, paddingHorizontal: space.sm, paddingVertical: space.sm,
            borderRadius: radius.pill, backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.64)',
            borderWidth: 1, borderColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.46)',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
          {loading && !current ? <ActivityIndicator size="small" color={theme.text} /> : null}
          <Text style={[type.cardTitle, { color: theme.text, flexShrink: 1 }]}>{action}</Text>
          <ArrowRight size={18} color={theme.text} />
        </Press>
        <Press accessibilityRole="button" onPress={onUsage}
          style={{ flex: 1, minWidth: 104, minHeight: 48, paddingHorizontal: space.sm, paddingVertical: space.sm,
            borderRadius: radius.pill, backgroundColor: theme.dark ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.34)',
            borderWidth: 1, borderColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.30)',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
          <ChartNoAxesColumn size={18} color={theme.text} />
          <Text style={[type.cardTitle, { color: theme.text, flexShrink: 1 }]}>{t('membership.viewUsage')}</Text>
        </Press>
      </View>
    </LinearGradient>
  );
}
