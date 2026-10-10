import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react-native';
import { useI18n, type TKey } from '../../i18n';
import { useMembership } from '../../membership/MembershipContext';
import { AppProgressBar, layout, radius, space, type } from '../../design-system';
import { MePushPage } from './MePushPage';
import { MeCard, MeRow, MeSection } from './parts';
import { Press } from '../Press';
import type { Theme } from '../../theme/theme';
import type { MembershipStatus } from '../../lib/membership';

const resourceLabels: Record<string, TKey> = {
  storage_bytes: 'membership.storage', gear_items: 'membership.gearItems', gear_sets: 'membership.gearSets',
  journeys: 'membership.journeys', tracks: 'membership.tracks', ai_requests: 'membership.aiRequests',
  ai_plans: 'membership.aiPlans', gear_recognition: 'membership.recognition', gear_cutouts: 'membership.cutouts',
};
const planLabels: Record<string, TKey> = {
  monthly: 'membership.monthlyPlan', yearly: 'membership.yearlyPlan', lifetime: 'membership.lifetimePlan',
};
function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  return `${Math.ceil(value / 1024 ** 2)} MiB`;
}

export function MembershipPage({ theme, onBack, view = 'subscription' }: { theme: Theme; onBack: () => void; view?: 'subscription' | 'usage' }) {
  const { t, resolved } = useI18n();
  const { status, loading, stale, refresh } = useMembership();
  const [selectedPlan, setSelectedPlan] = useState<MembershipStatus['products'][number]['id']>('yearly');
  const [showUsage, setShowUsage] = useState(view === 'usage');
  useEffect(() => { void refresh(); }, [refresh]);
  const date = (value: string) => new Date(value).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US');
  const products = status?.products ?? [];
  const activePlan = products.find(p => p.id === selectedPlan) ?? products[0];
  const storage = status?.resources.find(r => r.resource === 'storage_bytes');
  const helperStyle = [type.caption, { color: theme.text3, lineHeight: 18, paddingHorizontal: space.xs, marginTop: space.sm }];
  const usageValue = (resource: MembershipStatus['resources'][number]) => {
    if (resource.tracking !== 'live') return t('membership.usageUnavailable');
    const bytes = resource.resource === 'storage_bytes';
    // Display the server-resolved allowance, including campaign and existing grant benefits.
    return t('membership.usage', {
      used: bytes ? formatBytes(resource.used + resource.reserved) : String(resource.used + resource.reserved),
      limit: bytes ? formatBytes(resource.limit) : String(resource.limit),
    });
  };
  return (
    <MePushPage theme={theme} onBack={onBack} title={t(view === 'usage' ? 'membership.resources' : status ? status.membershipPlan === 'member' ? 'membership.currentSubscription' : 'membership.plansTitle' : 'membership.title')} right={
      <Press accessibilityRole="button" accessibilityLabel={t('membership.refresh')} disabled={loading} onPress={() => void refresh()}
        style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator size="small" color={theme.text2} /> : <RefreshCw size={20} color={theme.text2} />}
      </Press>
    }>
      {!status ? <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
        <Text accessibilityRole={loading ? undefined : 'alert'} style={[type.body, { color: theme.text2 }]}>{t(loading ? 'membership.loading' : 'membership.unavailable')}</Text>
      </View> : <>
        {view !== 'usage' ? <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xs }}>
          <Text style={[type.pageTitle, { color: theme.text, marginTop: space.xs }]}>{t(status.membershipPlan === 'member' ? 'membership.member' : 'membership.free')}</Text>
          {status.membershipPlan === 'member' ? <Text style={[type.caption, { color: theme.text2, marginTop: space.xs }]}>
            {status.isLifetime ? t('membership.lifetimePlan') : `${t('membership.validUntil')} ${status.validUntil ? date(status.validUntil) : '—'}`}
          </Text> : null}
          {status.campaign ? <Text style={[type.caption, { color: theme.text2, lineHeight: 18, marginTop: space.sm }]}>{status.campaign.endsAt
            ? t('membership.openUntil', { date: date(status.campaign.endsAt) }) : t('membership.experienceTitle')}</Text> : null}
          {status.campaign?.startsAt ? <Text style={[type.caption, { color: theme.text3, lineHeight: 18, marginTop: space.xxs }]}>{t('membership.campaignPeriod', {
            start: date(status.campaign.startsAt), end: status.campaign.endsAt ? date(status.campaign.endsAt) : t('membership.endDatePending'),
          })}</Text> : null}
          {stale ? <Text accessibilityRole="alert" style={[type.caption, { color: theme.text2, marginTop: space.sm }]}>{t('membership.stale')}</Text> : null}
        </View> : null}
        {view === 'usage' && stale ? <Text accessibilityRole="alert" style={[type.caption, { color: theme.text2, paddingHorizontal: space.xl }]}>{t('membership.stale')}</Text> : null}

        {view !== 'usage' && status.membershipPlan !== 'member' && products.length ? <MeSection theme={theme} title={t('membership.plansTitle')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {products.map(product => {
              const selected = activePlan?.id === product.id;
              return <Press key={product.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                accessibilityLabel={t(planLabels[product.id])} onPress={() => setSelectedPlan(product.id)}
                style={{ flex: 1, minWidth: 80, minHeight: 56, paddingHorizontal: space.sm, paddingVertical: space.md,
                  borderRadius: radius.pill, backgroundColor: selected ? theme.accentSoft : theme.surfaceTop,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.cardTitle, { color: selected ? theme.accent : theme.text2, textAlign: 'center' }]}>{t(planLabels[product.id])}</Text>
              </Press>;
            })}
          </View>
          <Text style={helperStyle}>{t(status.purchaseEnabled ? 'membership.purchasePending' : 'membership.purchaseClosed')}</Text>
        </MeSection> : null}

        {view !== 'usage' ? <MeSection theme={theme} title={t('membership.benefitsTitle')}>
          <Text style={[type.body, { color: theme.text2, paddingHorizontal: space.xxs }]}>{t('membership.benefitsSummary')}</Text>
        </MeSection> : null}

        <MeSection theme={theme} title={view === 'usage' ? undefined : t('membership.resources')}>
          <MeCard theme={theme}>
            {storage ? <>
              <MeRow theme={theme} label={t('membership.storage')} detail={usageValue(storage)} />
              {storage.tracking === 'live' ? <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
                <AppProgressBar theme={theme} height={3} value={storage.limit > 0 ? (storage.used + storage.reserved) / storage.limit * 100 : 0} />
              </View> : null}
            </> : null}
            <Press accessibilityRole="button" accessibilityState={{ expanded: showUsage }} onPress={() => setShowUsage(!showUsage)}>
              <MeRow theme={theme} label={t(showUsage ? 'membership.hideUsage' : 'membership.showUsage')}
                trailing={showUsage ? <ChevronUp size={16} color={theme.text3} /> : <ChevronDown size={16} color={theme.text3} />} />
            </Press>
            {showUsage ? status.resources.filter(r => r.resource !== 'storage_bytes' && resourceLabels[r.resource]).map(resource =>
              <MeRow key={resource.resource} theme={theme} label={t(resourceLabels[resource.resource])} detail={usageValue(resource)} />
            ) : null}
          </MeCard>
          <Text style={helperStyle}>{t('membership.usageNote')}</Text>
          {showUsage && status.meteringStartedAt ? <Text style={helperStyle}>{t('membership.meteringStart', { date: date(status.meteringStartedAt) })}</Text> : null}
          {status.transitionEndsAt ? <Text style={helperStyle}>{t('membership.transition', { date: date(status.transitionEndsAt) })}</Text> : null}
        </MeSection>
      </>}
    </MePushPage>
  );
}
