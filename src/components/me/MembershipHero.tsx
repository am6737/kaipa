// Membership page hero: status badge, value headline, validity and campaign lines.
import React from 'react';
import { Text, View } from 'react-native';
import { useI18n } from '../../i18n';
import { radius, space, type } from '../../design-system';
import type { Theme } from '../../theme/theme';
import type { MembershipStatus } from '../../lib/membership';

export function MembershipHero({ theme, status, stale }: { theme: Theme; status: MembershipStatus; stale: boolean }) {
  const { t, resolved } = useI18n();
  const date = (value: string) => new Date(value).toLocaleDateString(resolved === 'zh' ? 'zh-CN' : 'en-US');
  const member = status.membershipPlan === 'member';
  const badge = member ? t('membership.subscribed') : status.campaign ? t('membership.experienceTitle') : t('membership.notSubscribed');
  return (
    <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xs }}>
      <View style={{ alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill,
        backgroundColor: member ? theme.accentSofter : theme.fieldSurface }}>
        <Text style={[type.eyebrow, { color: member ? theme.accent : theme.text2 }]}>{badge}</Text>
      </View>
      {member ? <Text style={[type.caption, { color: theme.text2, marginTop: space.sm }]}>
        {status.isLifetime ? t('membership.lifetimePlan') : `${t('membership.validUntil')} ${status.validUntil ? date(status.validUntil) : '—'}`}
      </Text> : null}
      {status.campaign?.startsAt ? <Text style={[type.caption, { color: theme.text3, lineHeight: 18, marginTop: space.sm }]}>{t('membership.campaignPeriod', {
        start: date(status.campaign.startsAt), end: status.campaign.endsAt ? date(status.campaign.endsAt) : t('membership.endDatePending'),
      })}</Text> : null}
      {stale ? <Text accessibilityRole="alert" style={[type.caption, { color: theme.text2, marginTop: space.sm }]}>{t('membership.stale')}</Text> : null}
    </View>
  );
}
