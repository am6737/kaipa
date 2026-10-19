import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable as Press, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUp, LocateFixed, X } from 'lucide-react-native';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { getAgentLocation, type AgentLocation } from '../../lib/agentLocation';
import type { Theme } from '../../theme/theme';

const failureKeys: Partial<Record<AgentLocation['status'], TKey>> = {
  permission_denied: 'agent.departure.failed.permissionDenied',
  permission_required: 'agent.departure.failed.permissionDenied',
  services_disabled: 'agent.departure.failed.servicesDisabled',
};

// Asks for the trip's departure before a plan is requested, so planning runs
// once with a known origin. Location is a device action here: the permission
// prompt and the fix happen in place, and the result stays editable.
export function DeparturePicker({ theme, recents, onConfirm, onCancel }: {
  theme: Theme;
  recents: string[];
  onConfirm: (place: string, location?: AgentLocation) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<TextInput>(null);
  const [place, setPlace] = useState('');
  const [fix, setFix] = useState<Extract<AgentLocation, { status: 'available' }>>();
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<{ key: TKey; error: boolean }>();
  const trimmed = place.trim();

  const locate = async () => {
    if (locating) return;
    setLocating(true);
    setNotice(undefined);
    const location = await getAgentLocation('', 15_000, 'request_location');
    setLocating(false);
    if (location?.status === 'available' && location.placeName) {
      setFix(location);
      setPlace(location.placeName);
      setNotice({ key: 'agent.departure.located', error: false });
      return;
    }
    setNotice({ error: true, key: location?.status === 'available' ? 'agent.departure.failed.noPlace'
      : (location && failureKeys[location.status]) || 'agent.departure.failed.unavailable' });
    inputRef.current?.focus();
  };

  // Coordinates only describe the located place, not one the user typed over it.
  const confirm = (value = trimmed) => {
    if (!value || locating) return;
    onConfirm(value, fix?.placeName === value ? fix : undefined);
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.controlSurface }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{t('agent.departure.title')}</Text>
          <Text style={[type.hint, { color: theme.text3 }]}>{t('agent.departure.hint')}</Text>
        </View>
        <Press onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8} style={styles.close}>
          <X size={20} color={theme.text2} strokeWidth={2} />
        </Press>
      </View>
      <View style={styles.options}>
        <Press
          onPress={() => void locate()}
          disabled={locating}
          accessibilityRole="button"
          accessibilityState={{ busy: locating }}
          style={[styles.option, { backgroundColor: theme.accentSofter }]}
        >
          {locating ? <ActivityIndicator size="small" color={theme.text} /> : <LocateFixed size={16} color={theme.text} strokeWidth={2} />}
          <Text style={[type.chip, { color: theme.text }]}>{t(locating ? 'agent.departure.locating' : 'agent.departure.useLocation')}</Text>
        </Press>
        {recents.filter((recent) => recent !== trimmed).map((recent) => (
          <Press key={recent} onPress={() => confirm(recent)} disabled={locating} accessibilityRole="button" style={[styles.option, { backgroundColor: theme.accentSofter }]}>
            <Text style={[type.chip, { color: theme.text }]} numberOfLines={1}>{recent}</Text>
          </Press>
        ))}
      </View>
      <View style={[styles.field, { backgroundColor: theme.featureSurface }]}>
        <TextInput
          ref={inputRef}
          value={place}
          onChangeText={setPlace}
          placeholder={t('agent.departure.placeholder')}
          placeholderTextColor={theme.text3}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={() => confirm()}
          style={[styles.input, { color: theme.text }]}
        />
        <Press
          onPress={() => confirm()}
          disabled={!trimmed || locating}
          accessibilityRole="button"
          accessibilityLabel={t('agent.departure.confirm')}
          accessibilityState={{ disabled: !trimmed || locating }}
          style={[styles.confirm, { backgroundColor: trimmed && !locating ? theme.accent : theme.controlSurface }]}
        >
          <ArrowUp size={19} color={trimmed && !locating ? '#FFFFFF' : theme.text3} strokeWidth={2.4} />
        </Press>
      </View>
      {notice ? <Text style={[type.hint, styles.notice, { color: notice.error ? theme.danger : theme.text2 }]}>{t(notice.key)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.feature, padding: space.md, gap: space.sm, boxShadow: '0px 12px 30px rgba(0,0,0,0.08)' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  heading: { flex: 1, gap: space.xxs },
  close: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: { minHeight: 40, maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  field: { minHeight: layout.fieldHeight, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: space.xxs },
  input: { flex: 1, minHeight: 40, ...type.composerInput },
  confirm: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  notice: { paddingHorizontal: space.xxs },
});
