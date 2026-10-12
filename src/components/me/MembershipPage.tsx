import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useI18n } from '../../i18n';
import { useMembership } from '../../membership/MembershipContext';
import { space, type } from '../../design-system';
import { MePushPage } from './MePushPage';
import { MeSection } from './parts';
import { MembershipHero } from './MembershipHero';
import { MembershipPlans } from './MembershipPlans';
import { MembershipBenefits } from './MembershipBenefits';
import { MembershipUsageCard } from './MembershipUsageCard';
import type { Theme } from '../../theme/theme';
import type { MembershipStatus } from '../../lib/membership';

export function MembershipPage({ theme, onBack, view = 'subscription' }: {
  theme: Theme;
  onBack: () => void;
  view?: 'subscription' | 'usage';
}) {
  const { t } = useI18n();
  const { status, loading, stale, refresh } = useMembership();
  const [selectedPlan, setSelectedPlan] = useState<MembershipStatus['products'][number]['id']>('yearly');
  useEffect(() => { void refresh(); }, [refresh]);
  const products = status?.products ?? [];
  const activePlanId = (products.find(p => p.id === selectedPlan) ?? products[0])?.id ?? 'yearly';
  return (
    <MePushPage theme={theme} onBack={onBack} title={t(view === 'usage' ? 'membership.resources' : status ? status.membershipPlan === 'member' ? 'membership.currentSubscription' : 'membership.plansTitle' : 'membership.title')}>
      {!status ? <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
        <Text accessibilityRole={loading ? undefined : 'alert'} style={[type.body, { color: theme.text2 }]}>{t(loading ? 'membership.loading' : 'membership.unavailable')}</Text>
      </View> : <>
        {view !== 'usage' ? <MembershipHero theme={theme} status={status} stale={stale} /> : null}
        {view === 'usage' && stale ? <Text accessibilityRole="alert" style={[type.caption, { color: theme.text2, paddingHorizontal: space.xl }]}>{t('membership.stale')}</Text> : null}

        {view !== 'usage' && status.membershipPlan !== 'member' && products.length ? <MembershipPlans
          theme={theme} products={products} selectedPlan={activePlanId} onSelect={setSelectedPlan} /> : null}

        {view !== 'usage' ? <MeSection theme={theme} title={t('membership.benefitsTitle')}>
          <MembershipBenefits theme={theme} />
        </MeSection> : null}

        <MembershipUsageCard theme={theme} status={status} title={view === 'usage' ? undefined : t('membership.resources')} />
      </>}
    </MePushPage>
  );
}
