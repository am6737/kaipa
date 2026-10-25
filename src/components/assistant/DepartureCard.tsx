import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable as Press, StyleSheet, Text, TextInput, View } from 'react-native';
import { LocateFixed, MapPin, Pencil } from 'lucide-react-native';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { getAgentLocation, type AgentLocation } from '../../lib/agentLocation';
import { hasAmapGeocoding, searchDepartureRegions, type DepartureRegion } from '../../lib/amapGeocoding';
import type { Theme } from '../../theme/theme';

const failureKeys: Partial<Record<AgentLocation['status'], TKey>> = {
  permission_denied: 'agent.departure.failed.permissionDenied',
  permission_required: 'agent.departure.failed.permissionDenied',
  services_disabled: 'agent.departure.failed.servicesDisabled',
};

// Why a fix gave no usable departure, in the card's words.
export function departureFailureKey(location?: AgentLocation): TKey {
  return location?.status === 'available' ? 'agent.departure.failed.noPlace'
    : (location && failureKeys[location.status]) || 'agent.departure.failed.unavailable';
}

type LocatedPlace = Extract<AgentLocation, { status: 'available' }> & { placeName: string };

// Picks a departure inside the conversation: the device location, a recent
// one, or a typed city with AMap's 省市区 matches so 北京朝阳区 and 辽宁朝阳市
// stay apart. It appears when the plan could not locate the user, or when
// they change the origin it used. `failure` says why locating did not work
// and opens the typed entry straight away.
export function DepartureCard({ theme, recents, disabled, failure: initialFailure, onAnswer, onEditing }: {
  theme: Theme;
  recents: string[];
  disabled: boolean;
  failure?: TKey;
  onAnswer: (place: string, location?: AgentLocation) => void;
  onEditing?: () => void;
}) {
  const { t } = useI18n();
  const [fix, setFix] = useState<LocatedPlace>();
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<TKey | undefined>(initialFailure);
  const [typing, setTyping] = useState(Boolean(initialFailure));
  const [query, setQuery] = useState('');
  const [regions, setRegions] = useState<DepartureRegion[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const busy = disabled || locating;
  const typed = query.trim();

  useEffect(() => {
    setRegions([]);
    if (!typed || !hasAmapGeocoding()) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchDepartureRegions(typed.slice(0, 40), controller.signal)
        .then(setRegions)
        // The typed text still answers when the search does not.
        .catch(() => setRegions([]))
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

  const locate = async () => {
    if (busy) return;
    setLocating(true);
    setFailure(undefined);
    const location = await getAgentLocation('', 15_000, 'request_location');
    setLocating(false);
    if (location?.status === 'available' && location.placeName) {
      setFix({ ...location, placeName: location.placeName });
      setTyping(false);
      return;
    }
    setFailure(departureFailureKey(location));
    setTyping(true);
  };

  const openTyping = () => {
    setTyping(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submitTyped = () => {
    if (!busy && typed) onAnswer(typed.slice(0, 200));
  };

  const shownRecents = recents.filter((recent) => recent !== fix?.placeName);

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceTop }]}>
      {fix ? (
        <View style={styles.located}>
          <MapPin size={18} color={theme.text2} strokeWidth={2} />
          <Text style={[type.cardTitle, styles.grow, { color: theme.text }]} numberOfLines={2}>{t('agent.departure.located', { place: fix.placeName })}</Text>
          <Press onPress={() => onAnswer(fix.placeName, fix)} disabled={busy} accessibilityRole="button"
            style={[styles.option, { backgroundColor: theme.accent, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[type.chip, { color: '#FFFFFF' }]}>{t('agent.departure.useThis')}</Text>
          </Press>
        </View>
      ) : null}
      {fix && typing ? null : <View style={styles.options}>
        {fix ? null : (
          <Press onPress={() => void locate()} disabled={busy} accessibilityRole="button" accessibilityState={{ busy: locating, disabled: busy }}
            style={[styles.option, { backgroundColor: theme.accentSofter }]}>
            {locating ? <ActivityIndicator size="small" color={theme.text} /> : <LocateFixed size={16} color={theme.text} strokeWidth={2} />}
            <Text style={[type.chip, { color: theme.text }]}>{t(locating ? 'agent.departure.locating' : 'agent.departure.useLocation')}</Text>
          </Press>
        )}
        {typing ? null : (
          <Press onPress={openTyping} disabled={busy} accessibilityRole="button"
            style={[styles.option, { backgroundColor: theme.accentSofter }]}>
            <Pencil size={15} color={theme.text} strokeWidth={2} />
            <Text style={[type.chip, { color: theme.text }]}>{t('agent.departure.typeCity')}</Text>
          </Press>
        )}
      </View>}
      {typing ? (
        <View style={[styles.field, { backgroundColor: theme.controlSurface }]}>
          <TextInput ref={inputRef} value={query} onChangeText={setQuery} placeholder={t('agent.departure.placeholder')}
            placeholderTextColor={theme.text3} maxLength={40} autoCorrect={false} returnKeyType="done" editable={!disabled}
            onFocus={onEditing} onSubmitEditing={submitTyped} style={[styles.input, { color: theme.text }]} />
          {searching ? <ActivityIndicator size="small" color={theme.text2} /> : null}
          <Press onPress={submitTyped} disabled={busy || !typed} accessibilityRole="button"
            style={[styles.option, { backgroundColor: theme.accent, opacity: busy || !typed ? 0.4 : 1 }]}>
            <Text style={[type.chip, { color: '#FFFFFF' }]}>{t('common.confirm')}</Text>
          </Press>
        </View>
      ) : null}
      {typing && typed && regions.length ? (
        <View>
          {regions.map((region, index) => (
            <Press key={region.place} onPress={() => onAnswer(region.place)} disabled={busy} accessibilityRole="button"
              style={({ pressed }) => [styles.region, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }, pressed && { opacity: 0.6 }]}>
              <MapPin size={16} color={theme.text3} strokeWidth={2} />
              <Text style={[type.rowTitle, { color: theme.text }]} numberOfLines={1}>{region.name}</Text>
              {region.parent ? <Text style={[type.hint, styles.grow, { color: theme.text2 }]} numberOfLines={1}>{region.parent}</Text> : null}
            </Press>
          ))}
        </View>
      ) : null}
      {(!typing || !typed) && shownRecents.length ? <View style={styles.options}>
        {shownRecents.map((recent) => (
          <Press key={recent} onPress={() => onAnswer(recent)} disabled={busy} accessibilityRole="button"
            style={[styles.option, { backgroundColor: theme.accentSofter }]}>
            <Text style={[type.chip, { color: theme.text }]} numberOfLines={1}>{recent}</Text>
          </Press>
        ))}
      </View> : null}
      {failure ? <Text style={[type.hint, { color: theme.danger }]}>{t(failure)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md, borderRadius: radius.feature, padding: space.md, gap: space.sm, boxShadow: '0px 12px 32px rgba(0,0,0,0.07)' },
  located: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  grow: { flex: 1 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: { minHeight: 40, maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  field: { minHeight: 48, borderRadius: radius.pill, paddingLeft: space.md, paddingRight: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  region: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
