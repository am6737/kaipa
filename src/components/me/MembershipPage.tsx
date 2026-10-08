import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { useI18n, type TKey } from '../../i18n';
import { useMembership } from '../../membership/MembershipContext';
import { AppCard, AppPropertyRow, AppSectionHeader, DetailPage, layout, space, type } from '../../design-system';
import { Press } from '../Press';
import type { Theme } from '../../theme/theme';

const resourceLabels: Record<string, TKey> = {
  storage_bytes: 'membership.storage', gear_items: 'membership.gearItems', gear_sets: 'membership.gearSets',
  journeys: 'membership.journeys', tracks: 'membership.tracks', ai_requests: 'membership.aiRequests',
  ai_plans: 'membership.aiPlans', gear_recognition: 'membership.recognition', gear_cutouts: 'membership.cutouts',
};
function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  return `${Math.ceil(value / 1024 ** 2)} MiB`;
}

export function MembershipPage({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const { t, resolved } = useI18n();
  const { status, loading, stale, refresh } = useMembership();
  useEffect(() => { void refresh(); }, [refresh]);
  const date = (value: string) => new Date(value).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US');
  return (
    <DetailPage theme={theme} onBack={onBack} title={t('membership.title')} right={
      <Press accessibilityRole="button" accessibilityLabel={t('membership.refresh')} disabled={loading} onPress={() => void refresh()}
        style={{ width: layout.iconButton, height: layout.iconButton, borderRadius: layout.iconButton / 2,
          backgroundColor: theme.controlSurface, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color={theme.text} /> : <RefreshCw size={20} color={theme.text} />}
      </Press>
    }>
      <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.lg, gap: space.lg }}>
        {!status ? <Text style={[type.body, { color: theme.text2 }]}>{t(loading ? 'membership.loading' : 'membership.unavailable')}</Text> : <>
          {stale ? <Text accessibilityRole="alert" style={[type.caption, { color: theme.text2 }]}>{t('membership.stale')}</Text> : null}
          <AppCard theme={theme} style={{ padding: 0 }}>
            <AppPropertyRow theme={theme} first label={t('membership.identity')} value={t(status.membershipPlan === 'member' ? 'membership.member' : 'membership.free')} />
            {status.membershipPlan === 'member' ? <AppPropertyRow theme={theme} label={t('membership.validUntil')}
              value={status.isLifetime ? t('membership.lifetime') : status.validUntil ? date(status.validUntil) : '—'} /> : null}
          </AppCard>
          {status.campaign ? <Text style={[type.body, { color: theme.text2 }]}>{status.campaign.endsAt
            ? t('membership.openUntil', { date: date(status.campaign.endsAt) }) : t('membership.openAccess')}</Text> : null}
          {status.transitionEndsAt ? <Text style={[type.body,{color:theme.text2}]}>{t('membership.transition',{date:date(status.transitionEndsAt)})}</Text> : null}
          <View>
            <AppSectionHeader theme={theme} text={t('membership.resources')} />
            <AppCard theme={theme} style={{ padding: 0 }}>
              {status.resources.filter((resource) => resourceLabels[resource.resource]).map((resource, index) => {
                const byteResource = resource.resource === 'storage_bytes';
                const used = byteResource ? formatBytes(resource.used + resource.reserved) : String(resource.used + resource.reserved);
                // During open access commercial quotas may only be observed.
                // Display the actual accepted ceiling, not a shadow threshold.
                const limit = byteResource ? formatBytes(resource.enforcedLimit) : String(resource.enforcedLimit);
                return <AppPropertyRow key={resource.resource} theme={theme} first={index === 0}
                  label={t(resourceLabels[resource.resource])}
                  value={resource.tracking === 'not_connected' ? t('membership.usageUnavailable') : t('membership.usage', { used, limit })} />;
              })}
            </AppCard>
          </View>
          <Text style={[type.caption, { color: theme.text2 }]}>{t('membership.sharedStorage')}</Text>
          <Text style={[type.caption, { color: theme.text2 }]}>{t('membership.products')}</Text>
          {status.meteringStartedAt ? <Text style={[type.caption,{color:theme.text2}]}>{t('membership.meteringStart',{date:date(status.meteringStartedAt)})}</Text> : null}
        </>}
      </View>
    </DetailPage>
  );
}
