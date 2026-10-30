import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { radius, space, type } from '../../design-system';
import { Press } from '../Press';

/** 尺子/滚轮页的底部操作：值改动后才出现，「重置」回到进入时的值，「确认」提交。 */
export function PickerConfirmFooter({ theme, onReset, onConfirm }: {
  theme: Theme;
  onReset: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <View>
        <Press onPress={onReset} accessibilityRole="button" style={[styles.reset, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>
          <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>{t('common.reset')}</Text>
        </Press>
      </View>
      <View>
        <Press onPress={onConfirm} accessibilityRole="button" style={[styles.confirm, { backgroundColor: theme.accent }]}>
          <Text style={styles.confirmLabel}>{t('common.confirm')}</Text>
        </Press>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  reset: { minHeight: 44, minWidth: 92, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  confirm: { minWidth: 104, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
