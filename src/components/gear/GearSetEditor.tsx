// GearSetEditor.tsx — 新建 / 编辑清单的全屏表单。
// 延续新版清单列表与详情页的浮动导航、克制表面和开放式分组节奏。
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info, JapaneseYen, Package, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import {
  GearItem,
  GearCat,
  GearSet,
  GearSetOverride,
  GEAR_STATUS,
  GearCarryStatus,
  WeightUnit,
  fmtWeight,
  itemWeight,
  packStats,
} from '../../data/gear';
import { GearItemImage, yuan } from './parts';
import { GearItemsList } from './GearItemsList';
import { AppCard, AppSectionHeader, DetailPage, layout, radius, space, type } from '../../design-system';

export function GearSetEditor({
  theme,
  mode,
  weightUnit = 'kg',
  initial,
  allItems,
  catMap,
  onCancel,
  onSave,
  onAddGear,
}: {
  theme: Theme;
  mode: 'new' | 'edit';
  weightUnit?: WeightUnit;
  initial?: GearSet | null;
  allItems: GearItem[];
  catMap: Record<string, GearCat>;
  onCancel: () => void;
  onSave: (name: string, description: string | undefined, items: string[], overrides: Record<string, GearSetOverride>) => void;
  onAddGear?: (onAdded: (item: GearItem) => void) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => new Set(initial?.items || []));
  const [overrides, setOverrides] = useState<Record<string, GearSetOverride>>(() => {
    const next: Record<string, GearSetOverride> = {};
    (initial?.items || []).forEach((itemName) => {
      const item = allItems.find((candidate) => candidate.name === itemName);
      const source = (item?.id != null ? initial?.overrides?.[String(item.id)] : undefined) || initial?.overrides?.[itemName];
      if (source) next[item?.id != null ? String(item.id) : itemName] = source;
    });
    return next;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [weightInfo, setWeightInfo] = useState<'base' | 'pack' | 'skinOut' | null>(null);

  const keyFor = (item: GearItem) => item.id != null ? String(item.id) : item.name;
  const getOverride = (item: GearItem) => overrides[keyFor(item)] || {};
  const applyOverride = (item: GearItem): GearItem => ({ ...item, ...getOverride(item) });
  const patchOverride = (item: GearItem, patch: GearSetOverride) => {
    const key = keyFor(item);
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const selectedItems = useMemo(
    () => allItems.filter((item) => selectedNames.has(item.name)).map(applyOverride),
    [allItems, overrides, selectedNames],
  );
  const selectedPack = packStats(selectedItems);
  const selectedGroups = useMemo(() => {
    const byCategory: Record<string, GearItem[]> = {};
    selectedItems.forEach((item) => { (byCategory[item.cat] = byCategory[item.cat] || []).push(item); });
    const ids = [...Object.keys(catMap), ...Object.keys(byCategory)]
      .filter((id, index, values) => values.indexOf(id) === index && byCategory[id]);
    return ids.map((id) => ({
      category: catMap[id] || { id, name: t('gear.uncategorized'), color: theme.text3, builtin: true },
      items: byCategory[id],
      weight: byCategory[id].reduce((sum, item) => sum + itemWeight(item), 0),
    }));
  }, [catMap, selectedItems, t, theme.text3]);
  const trimmedName = name.trim();
  const valid = trimmedName.length > 0;

  const removeItem = (itemName: string) => {
    setSelectedNames((current) => {
      const next = new Set(current);
      next.delete(itemName);
      return next;
    });
  };
  const submit = () => {
    if (!valid) return;
    const cleanOverrides: Record<string, GearSetOverride> = {};
    allItems.filter((item) => selectedNames.has(item.name)).forEach((item) => {
      const key = keyFor(item);
      if (overrides[key]) cleanOverrides[key] = overrides[key];
    });
    onSave(trimmedName, description.trim() || undefined, allItems.filter((item) => selectedNames.has(item.name)).map((item) => item.name), cleanOverrides);
  };

  const pickerPage = pickerOpen ? (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <GearItemsList
        theme={theme}
        items={allItems}
        catMap={catMap}
        weightUnit={weightUnit}
        onBack={() => setPickerOpen(false)}
        onOpenItem={() => {}}
        onAdd={() => {}}
        onAddCategory={() => {}}
        onEditCategory={() => {}}
        onDeleteCategory={() => {}}
        onDeleteItems={() => {}}
        picker={{
          selectedNames,
          onDone: (nextSelectedNames) => {
            setSelectedNames(nextSelectedNames);
            setPickerOpen(false);
          },
          onAdd: onAddGear ? () => onAddGear((item) => {
            setSelectedNames((current) => new Set(current).add(item.name));
          }) : undefined,
        }}
      />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <DetailPage
      theme={theme}
      title={mode === 'edit' ? t('gear.setEditor.titleEdit') : t('gear.setEditor.titleNew')}
      onBack={onCancel}
      backgroundColor={theme.groupedBg}
      flatChrome
      overlay={(
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingBottom: Math.max(insets.bottom, space.sm) + space.xxs }}>
            {!valid ? (
              <Text style={{ marginBottom: space.xs, textAlign: 'center', fontSize: 11.5, color: theme.text3 }}>
                {t('gear.setEditor.nameRequired')}
              </Text>
            ) : null}
            <Press
              onPress={submit}
              disabled={!valid}
              style={{ height: 54, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: valid ? theme.accent : theme.controlSurface, borderWidth: valid ? 0 : StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
            >
              <Icon name="check" color={valid ? '#FFFFFF' : theme.text3} size={18} strokeWidth={2.3} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: valid ? '#FFFFFF' : theme.text3 }}>
                {mode === 'edit' ? t('gear.setEditor.saveChanges') : t('gear.setEditor.createSet')}
              </Text>
            </Press>
          </View>
        </View>
      )}
    >
      <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs }}>
        <AppSectionHeader theme={theme} text={t('gear.setEditor.nameLabel')} marginTop={space.sm} />
        <AppCard theme={theme} radius={radius.feature} style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('gear.setEditor.namePlaceholder')}
            placeholderTextColor={theme.text3}
            maxLength={24}
            returnKeyType="done"
            style={{ minHeight: 34, padding: 0, fontSize: 19, lineHeight: 26, fontWeight: '800', letterSpacing: -0.35, color: theme.text }}
          />
          <Text style={{ marginTop: space.xs, fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{name.length}/24</Text>
        </AppCard>

        <AppSectionHeader theme={theme} text={t('gear.setEditor.descriptionLabel')} marginTop={space.xl} />
        <AppCard theme={theme} radius={radius.feature} style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('gear.setEditor.descriptionPlaceholder')}
            placeholderTextColor={theme.text3}
            multiline
            scrollEnabled={false}
            style={{ minHeight: 76, padding: 0, fontSize: 14.5, lineHeight: 22, color: theme.text, textAlignVertical: 'top' }}
          />
        </AppCard>

        <View style={{ marginTop: space.sm, flexDirection: 'row', gap: space.xs }}>
          <SummaryTile theme={theme} icon={<Weight color={theme.text2} size={16} strokeWidth={1.8} />} label={t('gear.pack.base')} value={fmtWeight(selectedPack.base, weightUnit, true)} onPress={() => setWeightInfo('base')} />
          <SummaryTile theme={theme} icon={<Package color={theme.text2} size={16} strokeWidth={1.8} />} label={t('gear.pack.pack')} value={fmtWeight(selectedPack.pack, weightUnit, true)} onPress={() => setWeightInfo('pack')} />
          <SummaryTile theme={theme} icon={<Weight color={theme.text2} size={16} strokeWidth={1.8} />} label={t('gear.pack.skinOut')} value={fmtWeight(selectedPack.skinOut, weightUnit, true)} onPress={() => setWeightInfo('skinOut')} />
        </View>

        <AppSectionHeader
          theme={theme}
          text={t('gear.setEditor.itemsTitle')}
          marginTop={space.xxl}
          trailing={selectedNames.size ? (
            <Press onPress={() => setPickerOpen(true)} style={{ minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.accentSoft }}>
              <Icon name="edit" color={theme.accent} size={14} strokeWidth={2.1} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.accent }}>{t('gear.setEditor.changeSelection')}</Text>
            </Press>
          ) : undefined}
        />
        <Text style={{ marginBottom: space.sm, fontSize: 12.5, lineHeight: 18, color: theme.text2 }}>{t('gear.setEditor.itemsHint')}</Text>
        {selectedItems.length ? (
          <View style={{ paddingBottom: space.xxxl }}>
            {selectedGroups.map((group, groupIndex) => (
              <View key={group.category.id}>
                <AppSectionHeader
                  theme={theme}
                  text={group.category.name}
                  marginTop={groupIndex === 0 ? space.sm : space.xl}
                  trailing={(
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3, backgroundColor: group.category.color }} />
                        <Text style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text3 }}>{group.items.length} {t('gear.unit.items')}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                        <Weight color={theme.text3} size={12} strokeWidth={1.8} />
                        <Text style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text3 }}>{fmtWeight(group.weight, weightUnit, true)}</Text>
                      </View>
                    </View>
                  )}
                />
                <AppCard theme={theme} radius={radius.feature} style={{ overflow: 'hidden' }}>
                  {group.items.map((item) => {
                    const sourceItem = allItems.find((candidate) => candidate.name === item.name) || item;
                    return (
                      <SelectedGearRow
                        key={item.id ?? item.name}
                        theme={theme}
                        item={sourceItem}
                        override={getOverride(sourceItem)}
                        weightUnit={weightUnit}
                        onRemove={() => removeItem(item.name)}
                        onPatch={(patch) => patchOverride(sourceItem, patch)}
                      />
                    );
                  })}
                </AppCard>
              </View>
            ))}
          </View>
        ) : (
          <Press onPress={() => setPickerOpen(true)} style={{ minHeight: 190, marginBottom: space.xxxl, borderRadius: radius.feature, alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
            <View style={{ width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}>
              <Package color={theme.accent} size={26} strokeWidth={1.6} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('gear.setEditor.chooseGear')}</Text>
            <Text style={{ fontSize: 12.5, color: theme.text2 }}>{t('gear.setEditor.noSelected')}</Text>
          </Press>
        )}
      </View>
      </DetailPage>
      {pickerPage}
      <WeightInfoSheet
        theme={theme}
        selected={weightInfo}
        values={{
          base: fmtWeight(selectedPack.base, weightUnit, true),
          pack: fmtWeight(selectedPack.pack, weightUnit, true),
          skinOut: fmtWeight(selectedPack.skinOut, weightUnit, true),
        }}
        onClose={() => setWeightInfo(null)}
      />
    </View>
  );
}

function SummaryTile({ theme, icon, label, value, onPress }: { theme: Theme; icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ flex: 1, minWidth: 0, minHeight: 82, paddingHorizontal: space.sm, paddingVertical: space.sm, borderRadius: radius.card, justifyContent: 'space-between', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        {icon}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, color: theme.text2 }}>{label}</Text>
        <Info color={theme.text3} size={11} strokeWidth={1.8} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 15, fontWeight: '800', color: theme.text }}>{value}</Text>
    </Press>
  );
}

function WeightInfoSheet({
  theme,
  selected,
  values,
  onClose,
}: {
  theme: Theme;
  selected: 'base' | 'pack' | 'skinOut' | null;
  values: Record<'base' | 'pack' | 'skinOut', string>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const rows: { id: 'base' | 'pack' | 'skinOut'; label: string; description: string }[] = [
    { id: 'base', label: t('gear.pack.base'), description: t('gear.setEditor.baseWeightDefinition') },
    { id: 'pack', label: t('gear.pack.pack'), description: t('gear.setEditor.packWeightDefinition') },
    { id: 'skinOut', label: t('gear.pack.skinOut'), description: t('gear.setEditor.skinOutWeightDefinition') },
  ];

  return (
    <Modal visible={selected !== null} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
        <View style={{ paddingTop: space.sm, paddingHorizontal: space.lg, paddingBottom: Math.max(insets.bottom, space.md) + space.sm, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: theme.groupedBg }}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, opacity: 0.45 }} />
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{t('gear.setEditor.weightInfoTitle')}</Text>
              <Text style={{ marginTop: space.xxs, fontSize: 12.5, lineHeight: 18, color: theme.text2 }}>{t('gear.setEditor.weightInfoIntro')}</Text>
            </View>
            <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ width: 38, height: 38, marginLeft: space.sm, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}>
              <Icon name="close" color={theme.text2} size={16} />
            </Press>
          </View>

          <View style={{ marginTop: space.sm, gap: space.xs }}>
            {rows.map((row) => {
              const active = row.id === selected;
              return (
                <View key={row.id} style={{ minHeight: 78, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, backgroundColor: active ? theme.accentSofter : theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? theme.accent : theme.fieldBorder }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '800', color: active ? theme.accent : theme.text }}>{row.label}</Text>
                    <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '800', color: theme.text }}>{values[row.id]}</Text>
                  </View>
                  <Text style={{ marginTop: space.xs, fontSize: 12, lineHeight: 18, color: theme.text2 }}>{row.description}</Text>
                </View>
              );
            })}
          </View>
          <Text style={{ marginTop: space.sm, paddingHorizontal: space.xs, fontSize: 11.5, lineHeight: 17, color: theme.text3 }}>{t('gear.setEditor.optionalWeightDefinition')}</Text>
        </View>
      </View>
    </Modal>
  );
}

function SelectedGearRow({
  theme,
  item,
  override,
  weightUnit,
  onRemove,
  onPatch,
}: {
  theme: Theme;
  item: GearItem;
  override: GearSetOverride;
  weightUnit: WeightUnit;
  onRemove: () => void;
  onPatch: (patch: GearSetOverride) => void;
}) {
  const { t } = useI18n();
  const quantity = override.qty || item.qty || 1;
  const status = override.status || item.status || 'packed';
  const statusIndex = GEAR_STATUS.findIndex((candidate) => candidate.id === status);
  const cycleStatus = () => onPatch({ status: GEAR_STATUS[(statusIndex + 1) % GEAR_STATUS.length].id as GearCarryStatus });

  return (
    <View>
      <View style={{ minHeight: layout.listRowMinHeight + 10, paddingLeft: space.md, paddingRight: 48, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <GearItemImage theme={theme} item={item} radius={radius.control} borderless style={{ width: 46, height: 46 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
          <View style={{ marginTop: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
              <Weight color={theme.text3} size={13} strokeWidth={1.8} />
              <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{fmtWeight(item.w * quantity, weightUnit, true)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
              <JapaneseYen color={theme.text3} size={13} strokeWidth={1.8} />
              <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{yuan(item.p * quantity)}</Text>
            </View>
          </View>
        </View>
        <Press onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.delete')} style={{ position: 'absolute', top: space.xs, right: space.xs, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
          <Icon name="close" color={theme.text2} size={15} strokeWidth={2.1} />
        </Press>
      </View>

      <View style={{ marginHorizontal: space.md, paddingTop: space.xxs, paddingBottom: space.md, flexDirection: 'row', alignItems: 'center' }}>
        <Press onPress={cycleStatus} style={{ height: 32, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.fieldSurface }}>
          <Text style={{ fontSize: 11, color: theme.text3 }}>{t('gear.spec.status')}</Text>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.text }}>{t(`gear.status.${status}` as any)}</Text>
          <Icon name="chevronR" color={theme.text3} size={12} strokeWidth={2} />
        </Press>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <SmallStepButton theme={theme} label="−" disabled={quantity <= 1} onPress={() => onPatch({ qty: Math.max(1, quantity - 1) })} />
          <Text style={{ minWidth: 28, textAlign: 'center', fontFamily: MONO, fontSize: 12, fontWeight: '800', color: theme.text }}>×{quantity}</Text>
          <SmallStepButton theme={theme} label="+" onPress={() => onPatch({ qty: quantity + 1 })} />
        </View>
      </View>
    </View>
  );
}

function SmallStepButton({ theme, label, disabled, onPress }: { theme: Theme; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} disabled={disabled} style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
      <Text style={{ fontSize: 17, lineHeight: 20, fontWeight: '700', color: disabled ? theme.text3 : theme.text }}>{label}</Text>
    </Press>
  );
}
