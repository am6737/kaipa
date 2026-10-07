import type { TLRow } from '../data/timeline';
import type { ResolvedLang, TKey } from '../i18n';
import { journeyDayDisplayLabel, journeyDayOrdinal } from './journeyDays';
import { sortRowsWithinDay } from './journeyOrdering';

export type JourneyGroupChoice = { value: string; label: string; summary: string };

export function buildJourneyGroupChoices(rows: TLRow[], groups: string[], resolved: ResolvedLang, t: (key: TKey) => string): JourneyGroupChoice[] {
  const byIdentity = new Map<string, string>();
  for (const group of groups) {
    const value = group.trim();
    if (!value) continue;
    const ordinal = journeyDayOrdinal(value);
    const identity = ordinal != null ? `day:${ordinal}` : `group:${value}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, value);
  }
  return ['', ...byIdentity.values()].map((value) => {
    const ordinal = journeyDayOrdinal(value);
    const groupRows = sortRowsWithinDay(rows.filter((row) => row.day.trim() === value
      || (ordinal != null && journeyDayOrdinal(row.day) === ordinal)));
    const summary = groupRows.map((row) => row.title.trim() || row.location?.name || '').filter(Boolean).slice(0, 3).join(' → ');
    return {
      value,
      label: value ? journeyDayDisplayLabel(value, resolved) : t('journey.timeline.pendingGroup'),
      summary: summary || t(value ? 'journey.timeline.emptyTitle' : 'journey.timeline.pendingGroupHint'),
    };
  });
}

/** A destination must change at least one selected item's group. */
export function journeyMoveDestinations(choices: JourneyGroupChoice[], rows: TLRow[]): JourneyGroupChoice[] {
  return choices.filter((choice) => rows.some((row) => {
    const from = row.day.trim();
    if (from === choice.value) return false;
    const ordinal = journeyDayOrdinal(from);
    return ordinal == null || ordinal !== journeyDayOrdinal(choice.value);
  }));
}
