// Resource usage: a storage summary tile plus rows grouped by reset period
// (monthly allowances vs lifetime record capacity).
import React from 'react';
import { Text, View } from 'react-native';
import { useI18n, type TKey } from '../../i18n';
import { AppProgressBar, space, type } from '../../design-system';
import { MeCard, MeSection } from './parts';
import type { Theme } from '../../theme/theme';
import type { MembershipStatus } from '../../lib/membership';

const resourceLabels: Record<string, TKey> = {
  gear_items: 'membership.gearItems', gear_sets: 'membership.gearSets',
  journeys: 'membership.journeys', tracks: 'membership.tracks', ai_requests: 'membership.aiRequests',
  ai_plans: 'membership.aiPlans', gear_recognition: 'membership.recognition', gear_cutouts: 'membership.cutouts',
};

type Resource = MembershipStatus['resources'][number];

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  return `${Math.ceil(value / 1024 ** 2)} MiB`;
}

function UsageRow({ theme, resource }: { theme: Theme; resource: Resource }) {
  const { t } = useI18n();
  const live = resource.tracking === 'live';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.md }}>
      <Text style={[type.body, { color: theme.text, flex: 1 }]}>{t(resourceLabels[resource.resource])}</Text>
      {live ? <>
        <Text style={[type.metric, { color: theme.text }]}>{resource.used + resource.reserved}</Text>
        <Text style={[type.caption, { color: theme.text3 }]}>/ {resource.limit}</Text>
      </> : <Text style={[type.caption, { color: theme.text3 }]}>{t('membership.usageUnavailable')}</Text>}
    </View>
  );
}

export function MembershipUsageCard({ theme, status, title }: {
  theme: Theme;
  status: MembershipStatus;
  title?: string;
}) {
  const { t, resolved } = useI18n();
  const date = (value: string) => new Date(value).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US');
  const storage = status.resources.find(r => r.resource === 'storage_bytes');
  const others = status.resources.filter(r => r.resource !== 'storage_bytes' && resourceLabels[r.resource]);
  const monthly = others.filter(r => r.period === 'month');
  const capacity = others.filter(r => r.period !== 'month');
  const groupHeader = (label: string) => (
    <Text style={[type.eyebrow, { color: theme.text3, textTransform: 'uppercase', paddingHorizontal: space.md,
      paddingTop: space.md, paddingBottom: space.xxs }]}>{label}</Text>
  );
  return (
    <MeSection theme={theme} title={title}>
      <MeCard theme={theme}>
        {storage ? <View style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.md }}>
          <Text style={[type.eyebrow, { color: theme.text2 }]}>{t('membership.storage')}</Text>
          {storage.tracking === 'live' ? <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.xs }}>
              {/* Display the server-resolved allowance, including campaign and existing grant benefits. */}
              <Text style={[type.fieldValue, { color: theme.text }]}>{formatBytes(storage.used + storage.reserved)}</Text>
              <Text style={[type.caption, { color: theme.text3 }]}>/ {formatBytes(storage.limit)}</Text>
            </View>
            <View style={{ marginTop: space.sm }}>
              <AppProgressBar theme={theme} value={storage.limit > 0 ? (storage.used + storage.reserved) / storage.limit * 100 : 0} />
            </View>
          </> : <Text style={[type.caption, { color: theme.text3, marginTop: space.xs }]}>{t('membership.usageUnavailable')}</Text>}
        </View> : null}
        {monthly.length ? groupHeader(t('membership.quotaGroup')) : null}
        {monthly.map(resource => <UsageRow key={resource.resource} theme={theme} resource={resource} />)}
        {capacity.length ? groupHeader(t('membership.capacityGroup')) : null}
        {capacity.map(resource => <UsageRow key={resource.resource} theme={theme} resource={resource} />)}
      </MeCard>
      {status.transitionEndsAt ? <Text style={[type.caption, { color: theme.text3, lineHeight: 18, paddingHorizontal: space.xs, marginTop: space.sm }]}>
        {t('membership.transition', { date: date(status.transitionEndsAt) })}
      </Text> : null}
    </MeSection>
  );
}
