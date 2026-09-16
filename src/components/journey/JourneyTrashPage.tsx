import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, DetailPage, layout, radius, space, type } from '../../design-system';
import { useData } from '../../data/DataContext';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { JourneyPlanCard } from './JourneyPlanCard';

export function JourneyTrashPage({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const { t } = useI18n();
  const data = useData();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const allSelected = data.trashedJourneys.length > 0 && selectedIds.size === data.trashedJourneys.length;

  useEffect(() => {
    const availableIds = new Set(data.trashedJourneys.map((journey) => journey.id));
    setSelectedIds((current) => new Set([...current].filter((id) => availableIds.has(id))));
  }, [data.trashedJourneys]);

  const toggleSelected = (id: string) => {
    if (busy) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      <DetailPage
        theme={theme}
        title={t('journeyHome.trash.title')}
        onBack={onBack}
        left={(
          <Press
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
            style={styles.backButton}
          >
            <Icon name="chevronL" color={theme.text} size={24} />
          </Press>
        )}
        backgroundColor={theme.groupedBg}
        overlay={data.trashedJourneys.length ? (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space.sm), backgroundColor: theme.groupedBg }]}>
            <Press
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allSelected, disabled: busy }}
              accessibilityLabel={t(allSelected ? 'common.deselectAll' : 'common.selectAll')}
              onPress={() => setSelectedIds(allSelected ? new Set() : new Set(data.trashedJourneys.map((journey) => journey.id)))}
              scaleTo={1}
              style={styles.selectAll}
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
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.bottomActionText, { color: selectedIds.size ? theme.text : theme.text3 }]}>
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
              {data.trashedJourneys.map((journey) => {
                const selected = selectedIds.has(journey.id);
                return (
                  <View key={journey.id} style={styles.entry}>
                    <Press
                      disabled={busy}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected, disabled: busy }}
                      accessibilityLabel={journey.name}
                      onPress={() => toggleSelected(journey.id)}
                      style={styles.selector}
                    >
                      <SelectionCircle theme={theme} selected={selected} />
                    </Press>
                    <View style={styles.cardWrap}>
                      <JourneyPlanCard
                        theme={theme}
                        journey={journey}
                        onPress={() => toggleSelected(journey.id)}
                        pressFeedback={false}
                        showStatus={false}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.empty}>
              <Trash2 color={theme.text3} size={30} strokeWidth={1.7} />
              <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journeyHome.trash.emptyTitle')}</Text>
              <Text style={[type.body, styles.emptyBody, { color: theme.text2 }]}>{t('journeyHome.trash.emptyBody')}</Text>
            </View>
          )}
        </View>
      </DetailPage>
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

function SelectionCircle({ theme, selected }: { theme: Theme; selected: boolean }) {
  return (
    <View style={[styles.selectionCircle, { borderColor: selected ? theme.accent : theme.fieldBorder, backgroundColor: selected ? theme.accent : 'transparent' }]}>
      {selected ? <Check color="#FFFFFF" size={15} strokeWidth={3} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding, paddingBottom: 88 },
  backButton: { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  list: { marginTop: space.sm, gap: space.md },
  entry: { minHeight: 166, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  selector: { width: 32, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  selectionCircle: { width: 23, height: 23, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cardWrap: { flex: 1, minWidth: 0 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 68, paddingTop: space.sm, paddingHorizontal: layout.pagePadding, flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  selectAll: { width: 96, height: 46, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  selectAllText: { fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  secondaryAction: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  primaryAction: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  bottomActionText: { fontSize: 14, lineHeight: 19, fontWeight: '800', letterSpacing: 0 },
  empty: { paddingHorizontal: space.xl, paddingVertical: 90, alignItems: 'center', gap: space.sm },
  emptyBody: { textAlign: 'center', lineHeight: 21 },
});
