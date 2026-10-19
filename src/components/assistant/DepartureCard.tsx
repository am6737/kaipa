import React, { useState } from 'react';
import { ActivityIndicator, Pressable as Press, StyleSheet, Text, View } from 'react-native';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { getAgentLocation, type AgentLocation } from '../../lib/agentLocation';
import type { Theme } from '../../theme/theme';

const failureKeys: Partial<Record<AgentLocation['status'], TKey>> = {
  permission_denied: 'agent.departure.failed.permissionDenied',
  permission_required: 'agent.departure.failed.permissionDenied',
  services_disabled: 'agent.departure.failed.servicesDisabled',
};

type LocatedPlace = Extract<AgentLocation, { status: 'available' }> & { placeName: string };

// Answers the assistant's departure question in the conversation. Location is
// a device action: the permission prompt and the fix happen on the card, and a
// typed city goes through the composer instead.
export function DepartureCard({ theme, recents, disabled, onAnswer }: {
  theme: Theme;
  recents: string[];
  disabled: boolean;
  onAnswer: (place: string, location?: AgentLocation) => void;
}) {
  const { t } = useI18n();
  const [fix, setFix] = useState<LocatedPlace>();
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<TKey>();
  const busy = disabled || locating;

  const locate = async () => {
    if (busy) return;
    setLocating(true);
    setFailure(undefined);
    const location = await getAgentLocation('', 15_000, 'request_location');
    setLocating(false);
    if (location?.status === 'available' && location.placeName) {
      setFix({ ...location, placeName: location.placeName });
      return;
    }
    setFailure(location?.status === 'available' ? 'agent.departure.failed.noPlace'
      : (location && failureKeys[location.status]) || 'agent.departure.failed.unavailable');
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceTop }]}>
      {fix ? (
        <View style={styles.located}>
          <MapPin size={18} color={theme.text2} strokeWidth={2} />
          <Text style={[type.cardTitle, styles.place, { color: theme.text }]} numberOfLines={2}>{t('agent.departure.located', { place: fix.placeName })}</Text>
          <Press onPress={() => onAnswer(fix.placeName, fix)} disabled={busy} accessibilityRole="button"
            style={[styles.option, { backgroundColor: theme.accent, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[type.chip, { color: '#FFFFFF' }]}>{t('agent.departure.useThis')}</Text>
          </Press>
        </View>
      ) : null}
      {fix && !recents.some((recent) => recent !== fix.placeName) ? null : <View style={styles.options}>
        {fix ? null : (
          <Press onPress={() => void locate()} disabled={busy} accessibilityRole="button" accessibilityState={{ busy: locating, disabled: busy }}
            style={[styles.option, { backgroundColor: theme.accentSofter }]}>
            {locating ? <ActivityIndicator size="small" color={theme.text} /> : <LocateFixed size={16} color={theme.text} strokeWidth={2} />}
            <Text style={[type.chip, { color: theme.text }]}>{t(locating ? 'agent.departure.locating' : 'agent.departure.useLocation')}</Text>
          </Press>
        )}
        {recents.filter((recent) => recent !== fix?.placeName).map((recent) => (
          <Press key={recent} onPress={() => onAnswer(recent)} disabled={busy} accessibilityRole="button"
            style={[styles.option, { backgroundColor: theme.accentSofter }]}>
            <Text style={[type.chip, { color: theme.text }]} numberOfLines={1}>{recent}</Text>
          </Press>
        ))}
      </View>}
      {failure ? <Text style={[type.hint, { color: theme.danger }]}>{t(failure)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md, borderRadius: radius.feature, padding: space.md, gap: space.sm, boxShadow: '0px 12px 32px rgba(0,0,0,0.07)' },
  located: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  place: { flex: 1 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: { minHeight: 40, maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
