import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { AccountActionDialog } from './AccountActionDialog';
import { MePushPage } from './MePushPage';
import { Press } from '../Press';
import { radius, type } from '../../design-system';

const REASONS = ['notUsed', 'privacy', 'dissatisfied', 'ads', 'other'] as const;
type Reason = (typeof REASONS)[number];

export function DeleteAccountReasonsPage({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const [selected, setSelected] = useState<Reason[]>([]);
  const [details, setDetails] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const labels = useMemo(() => REASONS.map((id) => ({ id, label: t(`account.delete.reasons.${id}` as never) })), [t]);
  const toggle = (reason: Reason) => setSelected((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]);
  const continueDelete = () => {
    if (selected.length) setDialogOpen(true);
  };

  return (
    <MePushPage theme={theme} title="" showTitle={false} onBack={onBack} footer={
      <Press onPress={continueDelete} disabled={!selected.length} accessibilityRole="button" scaleTo={0.98} opacityTo={0.85}
        style={{ width: '100%', height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.danger, opacity: selected.length ? 1 : 0.35 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>{t('account.delete.reasonsContinue')}</Text>
      </Press>
    }>
      <View style={{ paddingHorizontal: 34, paddingTop: 24 }}>
        <Text style={[type.pageTitle, { color: theme.text, fontSize: 28, lineHeight: 36, letterSpacing: -0.8 }]}>{t('account.delete.reasonsTitle')}</Text>
        <Text style={{ color: theme.text2, fontSize: 17, lineHeight: 25, marginTop: 10 }}>{t('account.delete.reasonsSubtitle')}</Text>
        <View style={{ gap: 8, marginTop: 32 }}>
          {labels.map(({ id, label }) => {
            const isSelected = selected.includes(id);
            return (
              <Press key={id} onPress={() => toggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} scaleTo={0.985} opacityTo={0.82}
                style={{ minHeight: 64, borderRadius: 20, paddingHorizontal: 26, paddingVertical: 14, backgroundColor: theme.dark ? theme.surface : '#FFFFFF', borderWidth: 1, borderColor: theme.fieldBorder, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: '700' }}>{label}</Text>
                <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, borderColor: isSelected ? theme.accent : theme.fieldBorder, alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: theme.accent }} /> : null}
                </View>
              </Press>
            );
          })}
        </View>
        <View style={{ height: 180, marginTop: 24, borderRadius: 20, backgroundColor: theme.dark ? theme.surface : '#FFFFFF', borderWidth: 1, borderColor: theme.fieldBorder, padding: 22 }}>
          <TextInput value={details} onChangeText={setDetails} multiline maxLength={200} placeholder={t('account.delete.reasonsPlaceholder')} placeholderTextColor={theme.text3}
            style={{ flex: 1, color: theme.text, fontSize: 17, lineHeight: 24, padding: 0, textAlignVertical: 'top' }} />
          <Text style={{ alignSelf: 'flex-end', color: theme.text3, fontSize: 15 }}>{details.length}/200</Text>
        </View>
      </View>
      <AccountActionDialog theme={theme} visible={dialogOpen} title={t('account.delete.title')} message={t('account.delete.message')} confirmPhrase={t('account.delete.confirmPhrase')} confirmPlaceholder={t('account.delete.confirmPlaceholder')} confirmLabel={t('account.delete.action')} cancelLabel={t('common.cancel')} confirming={deleting}
        onCancel={() => { if (!deleting) setDialogOpen(false); }} onConfirm={() => { if (deleting) return; setDeleting(true); void nav.auth.deleteAccount().catch(() => setDeleting(false)); }} />
    </MePushPage>
  );
}
