import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';
import { AppActionDialog, layout, radius, space, type } from '../../design-system';
import { useData } from '../../data/DataContext';
import type { Poi } from '../../data/pois';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { MePushPage } from '../me/MePushPage';
import { JourneyPlanCard } from './JourneyPlanCard';

export function JourneyTrashPage({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const { t } = useI18n();
  const data = useData();
  const nav = useNav();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const allSelected = data.trashedJourneys.length > 0 && selectedIds.size === data.trashedJourneys.length;

  useEffect(() => {
    const availableIds = new Set(data.trashedJourneys.map((journey) => journey.id));
    setSelectedIds((current) => new Set([...current].filter((id) => availableIds.has(id))));
  }, [data.trashedJourneys]);

  const toggleSelected = useCallback((id: string) => {
    if (busy) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [busy]);

  const restoreSelected = async () => {
    if (!selectedIds.size || busy) return;
    setBusy(true);
    const failedIds = new Set<string>();
    for (const id of selectedIds) {
      try {
        await data.restoreJourney(id);
        nav.clearRemovedJourney(id);
      } catch {
        failedIds.add(id);
      }
    }
    setSelectedIds(failedIds);
    setBusy(false);
    nav.showToast(t(failedIds.size ? 'journeyHome.trash.restoreFailed' : 'journeyHome.trash.restored'));
  };

  const permanentlyDeleteSelected = async () => {
    if (!selectedIds.size || busy) return;
    setBusy(true);
    const failedIds = new Set<string>();
    for (const id of selectedIds) {
      try {
        await data.permanentlyDeleteJourney(id);
      } catch {
        failedIds.add(id);
      }
    }
    setSelectedIds(failedIds);
    setBusy(false);
    setDeleteDialogOpen(false);
    nav.showToast(t(failedIds.size ? 'journeyHome.trash.deleteFailed' : 'journeyHome.trash.deleted'));
  };

  return (
    <>
      <MePushPage
        theme={theme}
        title={t('journeyHome.trash.title')}
        onBack={onBack}
        footer={data.trashedJourneys.length ? (
          <View style={styles.bottomBar}>
            <Press
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allSelected, disabled: busy }}
              accessibilityLabel={t(allSelected ? 'common.deselectAll' : 'common.selectAll')}
              onPress={() => setSelectedIds(allSelected ? new Set() : new Set(data.trashedJourneys.map((journey) => journey.id)))}
              scaleTo={1}
              style={[styles.selectAll, { backgroundColor: theme.controlSurface }]}
            >
              <SelectionCircle theme={theme} selected={allSelected} />
              <Text style={[styles.selectAllText, { color: theme.text }]}>{t(allSelected ? 'common.deselectAll' : 'common.selectAll')}</Text>
            </Press>
            <Press
              disabled={!selectedIds.size || busy}
              accessibilityRole="button"
              accessibilityLabel={t('journeyHome.trash.deletePermanently')}
              onPress={() => setDeleteDialogOpen(true)}
              scaleTo={1}
              style={[styles.secondaryAction, { backgroundColor: theme.controlSurface }]}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.bottomActionText, { color: selectedIds.size ? theme.danger : theme.text3 }]}>
                {t('journeyHome.trash.deletePermanently')}
              </Text>
            </Press>
            <Press
              disabled={!selectedIds.size || busy}
              accessibilityRole="button"
              accessibilityLabel={t('journeyHome.trash.restore')}
              onPress={() => void restoreSelected()}
              scaleTo={1}
              style={[styles.primaryAction, { backgroundColor: selectedIds.size ? theme.accent : theme.fieldSurface }]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : (
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.bottomActionText, { color: selectedIds.size ? '#FFFFFF' : theme.text3 }]}>
                  {t('journeyHome.trash.restore')}
                </Text>
              )}
            </Press>
          </View>
        ) : undefined}
      >
        <View style={styles.content}>
          {data.trashedJourneys.length ? (
            <View style={styles.list}>
              {data.trashedJourneys.map((journey) => (
                <TrashEntry
                  key={journey.id}
                  theme={theme}
                  journey={journey}
                  selected={selectedIds.has(journey.id)}
                  disabled={busy}
                  onToggle={toggleSelected}
                />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Trash2 color={theme.text3} size={30} strokeWidth={1.7} />
              <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journeyHome.trash.emptyTitle')}</Text>
              <Text style={[type.body, styles.emptyBody, { color: theme.text2 }]}>{t('journeyHome.trash.emptyBody')}</Text>
            </View>
          )}
        </View>
      </MePushPage>
      <AppActionDialog
        theme={theme}
        visible={deleteDialogOpen}
        title={t('journeyHome.trash.deleteTitle')}
        message={t('journeyHome.trash.deleteSelectedMessage', { count: selectedIds.size })}
        confirmLabel={t('journeyHome.trash.deletePermanently')}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={busy}
        confirmIcon="trash"
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void permanentlyDeleteSelected()}
      />
    </>
  );
}

const TrashEntry = React.memo(function TrashEntry({ theme, journey, selected, disabled, onToggle }: { theme: Theme; journey: Poi; selected: boolean; disabled: boolean; onToggle: (id: string) => void }) {
  const toggle = useCallback(() => onToggle(journey.id), [onToggle, journey.id]);
  return (
    <View style={styles.entry}>
      <Press
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        accessibilityLabel={journey.name}
        onPress={toggle}
        style={styles.selector}
      >
        <SelectionCircle theme={theme} selected={selected} />
      </Press>
      <View style={styles.cardWrap}>
        <JourneyPlanCard theme={theme} journey={journey} onPress={toggle} pressFeedback={false} showStatus={false} />
      </View>
    </View>
  );
});

function SelectionCircle({ theme, selected }: { theme: Theme; selected: boolean }) {
  return (
    <View style={[styles.selectionCircle, { borderColor: selected ? theme.accent : theme.fieldBorder, backgroundColor: selected ? theme.accent : 'transparent' }]}>
      {selected ? <Check color="#FFFFFF" size={15} strokeWidth={3} /> : null}
    </View>
  );
}

const floatShadow = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 };

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding },
  list: { marginTop: space.sm, gap: space.md },
  entry: { minHeight: 166, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  selector: { width: 32, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 23, height: 23, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cardWrap: { flex: 1, minWidth: 0 },
  bottomBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  selectAll: { height: 46, flexShrink: 0, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, ...floatShadow },
  selectAllText: { fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  secondaryAction: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, ...floatShadow },
  primaryAction: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, ...floatShadow },
  bottomActionText: { fontSize: 14, lineHeight: 19, fontWeight: '800', letterSpacing: 0 },
  empty: { paddingHorizontal: space.xl, paddingVertical: 90, alignItems: 'center', gap: space.sm },
  emptyBody: { textAlign: 'center', lineHeight: 21 },
});
