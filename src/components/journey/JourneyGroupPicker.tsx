import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import type { JourneyGroupChoice } from '../../lib/journeyGroupChoices';
import { journeyDayOrdinal } from '../../lib/journeyDays';
import { Icon } from '../Icon';
import { Press } from '../Press';

export function JourneyGroupPicker({ theme, data, title, value, maxHeight, busyValue, errorMessage, embedded = false, onChange }: {
  theme: Theme;
  data: JourneyGroupChoice[];
  title: string;
  value?: string;
  maxHeight: number;
  busyValue?: string;
  errorMessage?: string;
  embedded?: boolean;
  onChange: (value: string) => void;
}) {
  const ordinal = value == null ? undefined : journeyDayOrdinal(value);
  const selected = data.find((item) => item.value === value)?.value
    ?? data.find((item) => ordinal != null && journeyDayOrdinal(item.value) === ordinal)?.value;
  const busy = busyValue != null;
  return (
    <View style={embedded ? undefined : { borderRadius: 22, padding: 8, backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.4)' : '0px 8px 24px rgba(0,0,0,0.14)' }}>
      {embedded ? null : <Text style={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8, fontSize: 12, fontWeight: '600', color: theme.text3 }}>{title}</Text>}
      {errorMessage ? <Text accessibilityRole="alert" numberOfLines={3} style={{ paddingHorizontal: 10, paddingBottom: 8, fontSize: 12, lineHeight: 18, color: theme.danger }}>{errorMessage}</Text> : null}
      <ScrollView style={{ maxHeight: Math.max(48, maxHeight - (embedded ? 0 : 48) - (errorMessage ? 62 : 0)) }} keyboardShouldPersistTaps="always" keyboardDismissMode="none" nestedScrollEnabled>
        {data.map((item) => {
          const checked = item.value === selected;
          return (
            <Press
              key={item.value}
              onPress={() => onChange(item.value)}
              disabled={busy}
              accessibilityRole={value == null ? 'button' : 'radio'}
              accessibilityState={{ ...(value == null ? {} : { checked }), disabled: busy, busy: busyValue === item.value }}
              accessibilityLabel={`${item.label}, ${item.summary}`}
              style={{ minHeight: 60, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: checked || busyValue === item.value ? theme.accentSofter : 'transparent' }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 20, fontWeight: '700', color: theme.text }}>{item.label}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, marginTop: 3, color: theme.text2 }}>{item.summary}</Text>
              </View>
              <View style={{ width: 18, alignItems: 'center' }}>
                {busyValue === item.value ? <ActivityIndicator size="small" color={theme.accent} /> : checked ? <Icon name="check" size={17} color={theme.accent} /> : null}
              </View>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}
