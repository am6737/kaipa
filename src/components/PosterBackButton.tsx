// PosterBackButton.tsx — bare back chevron for pages whose top bar sits on a
// poster image: no chip, white with a soft shadow so it reads on the photo.
import React from 'react';
import { StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { layout } from '../design-system';
import { useI18n } from '../i18n';
import { Press } from './Press';

export function PosterBackButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Press accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onPress} style={styles.back}>
      <ChevronLeft color="#FFFFFF" size={32} strokeWidth={2.2} style={styles.icon} />
    </Press>
  );
}

const styles = StyleSheet.create({
  back: { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  icon: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
});
