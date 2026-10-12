// Horizontally scrolling plan comparison cards. Prices, strikethrough originals
// and the recommended tag are data-driven only: with no store data the cards
// show pricePending and no tag (docs/membership-and-quotas.md forbids invented
// prices while purchases are disabled).
import React from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { useI18n, type TKey } from '../../i18n';
import { layout, radius, space, type } from '../../design-system';
import { Press } from '../Press';
import type { Theme } from '../../theme/theme';
import type { MembershipStatus } from '../../lib/membership';

type Product = MembershipStatus['products'][number];

const planLabels: Record<Product['id'], TKey> = {
  monthly: 'membership.monthlyPlan', yearly: 'membership.yearlyPlan', lifetime: 'membership.lifetimePlan',
};
const planDescriptions: Record<Product['id'], TKey> = {
  monthly: 'membership.monthlyDescription', yearly: 'membership.yearlyDescription', lifetime: 'membership.lifetimeDescription',
};

function formatAmount(amountMinor: number, currency: string) {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

export function MembershipPlans({ theme, products, selectedPlan, onSelect }: {
  theme: Theme;
  products: Product[];
  selectedPlan: Product['id'];
  onSelect: (id: Product['id']) => void;
}) {
  const { t } = useI18n();
  const cardWidth = Math.min(252, Dimensions.get('window').width - space.xl * 2 - space.md);
  return (
    <View style={{ marginTop: layout.sectionGap }}>
      <Text style={[type.eyebrow, { color: theme.text3, textTransform: 'uppercase', paddingHorizontal: space.xl, marginBottom: space.xs }]}>
        {t('membership.plansTitle')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
        {products.map(product => {
          const selected = selectedPlan === product.id;
          return (
            <Press key={product.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              accessibilityLabel={t(planLabels[product.id])} onPress={() => onSelect(product.id)}
              style={{ width: cardWidth, padding: space.md, borderRadius: radius.feature, justifyContent: 'space-between',
                backgroundColor: selected ? theme.accentSofter : theme.surfaceTop }}>
              <View>
                {product.recommended ? <View style={{ alignSelf: 'flex-start', paddingHorizontal: space.xs, paddingVertical: space.xxs,
                  borderRadius: radius.pill, backgroundColor: theme.accentSoft, marginBottom: space.xs }}>
                  <Text style={[type.eyebrow, { color: theme.accent }]}>{t('membership.recommended')}</Text>
                </View> : null}
                <Text style={[type.cardTitle, { color: selected ? theme.accent : theme.text }]}>{t(planLabels[product.id])}</Text>
                <Text style={[type.hint, { color: theme.text2, marginTop: space.xxs }]}>{t(planDescriptions[product.id])}</Text>
              </View>
              {product.price ? <View style={{ marginTop: space.md }}>
                <Text style={[type.metric, { color: selected ? theme.accent : theme.text }]}>{formatAmount(product.price.amountMinor, product.price.currency)}</Text>
                {product.compareAtAmountMinor != null ? <Text style={[type.caption, { color: theme.text3, textDecorationLine: 'line-through', marginTop: space.xxs }]}>
                  {formatAmount(product.compareAtAmountMinor, product.price.currency)}
                </Text> : null}
              </View> : <Text style={[type.caption, { color: theme.text3, marginTop: space.md }]}>{t('membership.pricePending')}</Text>}
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}
