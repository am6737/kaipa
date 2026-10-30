// GearSetPreviewPage.tsx — 别人公开的装备清单预览，可以一键存为自己的清单。
// 内容全部来自 profile_gear_set RPC，服务端已经裁好可见范围，这里只排版。
import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import { copyGearSet, fetchGearSetPreview, type GearSetPreview, type GearSetPreviewItem } from '../../hooks/useSocial';
import { fmtItemWeight, fmtWeight, type WeightUnit } from '../../data/gear';
import { KPSpinner, KPState } from '../State';
import { Press } from '../Press';

export function GearSetPreviewPage({ theme, setId, onBack }: { theme: Theme; setId: string; onBack: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<GearSetPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchGearSetPreview(setId)
      .then((result) => { if (alive) setPreview(result); })
      .catch(() => { if (alive) setPreview(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [setId]);

  const groups = useMemo(() => groupByCategory(preview?.items ?? []), [preview]);
  const weightUnit = data.profile.gearWeightUnit || 'kg';

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await copyGearSet(setId);
      await data.refetchGear();
      nav.showToast(t('profile.savedAsMine'));
      onBack();
    } catch {
      nav.showToast(t('profile.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (loading && !preview) {
    body = <View style={{ paddingTop: 120, alignItems: 'center' }}><KPSpinner theme={theme} /></View>;
  } else if (!preview) {
    body = <KPState theme={theme} icon="gear" title={t('profile.gearSetUnavailable')} style={{ paddingTop: 100 }} />;
  } else {
    const mine = preview.ownerId === data.userId;
    body = (
      <>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: space.lg, paddingBottom: insets.bottom + 120 }}
        >
          <Text style={[type.pageTitle, { color: theme.text }]}>{preview.name}</Text>
          {preview.description ? (
            <Text style={[type.lead, { color: theme.text2, marginTop: space.sm }]}>{preview.description}</Text>
          ) : null}
          <Text style={[type.meta, { color: theme.text3, marginTop: space.sm }]}>
            {t('profile.gearSetMeta', { count: preview.itemCount, weight: fmtWeight(preview.weightKg, weightUnit, true) })}
          </Text>

          {groups.map((group) => (
            <View key={group.key} style={{ marginTop: space.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                {group.color ? (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
                ) : null}
                <Text numberOfLines={1} style={[type.gearCategory, { color: theme.text2 }]}>
                  {group.name || t('gear.uncategorized')}
                </Text>
              </View>
              {group.items.map((item, index) => (
                <ItemRow
                  key={`${item.name}-${index}`}
                  theme={theme}
                  item={item}
                  weightUnit={weightUnit}
                  optionalLabel={t('profile.gearOptional')}
                />
              ))}
            </View>
          ))}
        </ScrollView>
        {mine ? null : (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.pagePadding, paddingBottom: insets.bottom + space.md }}>
            <Press
              onPress={() => { void save(); }}
              disabled={busy}
              accessibilityRole="button"
              style={{
                height: layout.fieldHeight + 6,
                borderRadius: radius.control,
                backgroundColor: theme.accent,
                opacity: busy ? 0.6 : 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[type.chip, { color: '#fff' }]}>{t('profile.saveAsMine')}</Text>
            </Press>
          </View>
        )}
      </>
    );
  }

  return (
    <DetailPage theme={theme} onBack={onBack} scrollable={false}>
      {body}
    </DetailPage>
  );
}

type Group = { key: string; name: string; color: string | null; items: GearSetPreviewItem[] };

function groupByCategory(items: GearSetPreviewItem[]): Group[] {
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const item of items) {
    const key = item.category ?? '';
    let group = index.get(key);
    if (!group) {
      group = { key, name: item.category ?? '', color: item.categoryColor ?? null, items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function ItemRow({ theme, item, weightUnit, optionalLabel }: {
  theme: Theme;
  item: GearSetPreviewItem;
  weightUnit: WeightUnit;
  optionalLabel: string;
}) {
  const optional = item.status === 'optional';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Text numberOfLines={1} style={[type.planItem, { flexShrink: 1, color: optional ? theme.text3 : theme.text }]}>
          {item.name}
          {item.qty > 1 ? <Text style={{ color: theme.text2 }}> ×{item.qty}</Text> : null}
        </Text>
        {optional ? <Tag theme={theme} label={optionalLabel} /> : null}
      </View>
      {/* 备选照样标重量，只是变灰；它不计入上面的清单总重。 */}
      <Text style={[type.caption, { fontVariant: ['tabular-nums'], color: optional ? theme.text3 : theme.text2 }]}>
        {fmtItemWeight(item.weightKg * Math.max(1, item.qty), weightUnit, true)}
      </Text>
    </View>
  );
}

function Tag({ theme, label }: { theme: Theme; label: string }) {
  return (
    <View style={{ paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: theme.controlSurface }}>
      <Text style={[type.tiny, { color: theme.text3 }]}>{label}</Text>
    </View>
  );
}
