// Member benefits as a checked list; copy comes from the existing i18n keys.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useI18n, type TKey } from '../../i18n';
import { space, type } from '../../design-system';
import { MeCard } from './parts';
import type { Theme } from '../../theme/theme';

const benefits: { title: TKey; description: TKey }[] = [
  { title: 'membership.intelligenceTitle', description: 'membership.intelligenceDescription' },
  { title: 'membership.cloudTitle', description: 'membership.cloudDescription' },
  { title: 'membership.collectionTitle', description: 'membership.collectionDescription' },
];

export function MembershipBenefits({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  return (
    <MeCard theme={theme}>
      {benefits.map((benefit, index) => (
        <View key={benefit.title} style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md,
          borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: theme.hairline }}>
          <Check size={18} color={theme.accent} strokeWidth={2.4} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[type.cardTitle, { color: theme.text }]}>{t(benefit.title)}</Text>
            <Text style={[type.hint, { color: theme.text2, marginTop: space.xxs }]}>{t(benefit.description)}</Text>
          </View>
        </View>
      ))}
    </MeCard>
  );
}
