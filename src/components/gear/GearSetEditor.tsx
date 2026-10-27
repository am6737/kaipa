// GearSetEditor.tsx — 新建 / 编辑清单的全屏表单。
// 与「我的装备」同一套无背景版式：名称直接作为页面标题输入，重量和价值两个大数，
// 装备按分类列出；点一件装备从底部弹出面板调整携带方式、数量或移出。
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Info, Minus, Package, Plus } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { composeGearSet, type GearSetSuggestion } from '../../lib/gearSetCompose';
import {
  GearItem,
  GearCat,
  GearSet,
  GearSetOverride,
  GEAR_STATUS,
  GearCarryStatus,
  WeightUnit,
  fmtWeight,
  itemStatus,
  packStats,
  splitWeight,
} from '../../data/gear';
import { GearItemsList, ItemRow, ItemThumb, SummaryStat, formatItemValue } from './GearItemsList';
import type { MenuAnchor } from './AddGearMenu';
import { AppFilterSegmented, DetailPage, layout, motion, radius, space, type } from '../../design-system';

const BAR_HEIGHT = 54;

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
  openPicker = false,
}: {
  theme: Theme;
  mode: 'new' | 'edit';
  weightUnit?: WeightUnit;
  initial?: GearSet | null;
  allItems: GearItem[];
  catMap: Record<string, GearCat>;
  onCancel: () => void;
  /** toBuy: the suggested gear the user kept; saving creates it as 待购 items in the set. */
  onSave: (name: string, description: string | undefined, items: string[], overrides: Record<string, GearSetOverride>, toBuy: GearSetSuggestion[]) => void;
  onAddGear?: (onAdded: (item: GearItem) => void, anchor: MenuAnchor) => void;
  /** Start in gear selection, as an empty set's add card does. */
  openPicker?: boolean;
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
  const [pickerOpen, setPickerOpen] = useState(openPicker);
  const [weightInfoOpen, setWeightInfoOpen] = useState(false);
  const [sheetName, setSheetName] = useState<string | null>(null);
  // 按描述搭配. Everything here is a draft until the user saves the set.
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSummary, setComposeSummary] = useState<string | null>(null);
  const [aiPicked, setAiPicked] = useState<Set<string>>(() => new Set());
  const [suggestions, setSuggestions] = useState<(GearSetSuggestion & { on: boolean })[]>([]);
  // Gear the user took out stays out when they rebuild.
  const removedIds = useRef<Set<number>>(new Set());
  const composeRun = useRef(0);

  const keyFor = (item: GearItem) => item.id != null ? String(item.id) : item.name;
  const applyOverride = (item: GearItem): GearItem => ({ ...item, ...overrides[keyFor(item)] });
  const patchOverride = (item: GearItem, patch: GearSetOverride) => {
    const key = keyFor(item);
    forgetAiPick(item.name);
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
      weight: packStats(byCategory[id]).skinOut,
    }));
  }, [catMap, selectedItems, t, theme.text3]);
  const trimmedName = name.trim();
  const valid = trimmedName.length > 0;
  const hasItems = selectedItems.length > 0;
  const weightParts = splitWeight(selectedPack.skinOut, weightUnit, true);
  const sheetSource = sheetName != null ? allItems.find((item) => item.name === sheetName) : undefined;

  const forgetAiPick = (itemName: string) => setAiPicked((current) => {
    if (!current.has(itemName)) return current;
    const next = new Set(current);
    next.delete(itemName);
    return next;
  });
  const noteRemoved = (itemNames: Iterable<string>) => {
    for (const itemName of itemNames) {
      const id = allItems.find((item) => item.name === itemName)?.id;
      if (id != null) removedIds.current.add(id);
      forgetAiPick(itemName);
    }
  };
  const removeItem = (itemName: string) => {
    noteRemoved([itemName]);
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
    onSave(
      trimmedName,
      description.trim() || undefined,
      allItems.filter((item) => selectedNames.has(item.name)).map((item) => item.name),
      cleanOverrides,
      suggestions.filter((suggestion) => suggestion.on).map(({ on: _on, ...suggestion }) => suggestion),
    );
  };

  const trimmedDescription = description.trim();
  const ownedCount = allItems.filter((item) => item.id != null).length;
  const pickedCount = selectedItems.filter((item) => aiPicked.has(item.name)).length;
  const toBuyCount = suggestions.filter((suggestion) => suggestion.on).length;
  const compose = async () => {
    if (!trimmedDescription || composing) return;
    const run = ++composeRun.current;
    // A rebuild replaces the earlier AI picks the user left alone and keeps
    // everything they chose themselves.
    const kept = new Set([...selectedNames].filter((itemName) => !aiPicked.has(itemName)));
    const keepIds = allItems.filter((item) => kept.has(item.name) && item.id != null).map((item) => item.id!);
    setComposing(true);
    setComposeError(null);
    try {
      const result = await composeGearSet({
        description: trimmedDescription,
        name: trimmedName,
        cats: Object.values(catMap),
        items: allItems,
        keepIds,
        excludeIds: [...removedIds.current],
      });
      if (run !== composeRun.current) return;
      const picked = allItems.filter((item) => item.id != null && result.picks.includes(item.id)).map((item) => item.name);
      setSelectedNames(new Set([...kept, ...picked]));
      setAiPicked(new Set(picked));
      setSuggestions((current) => result.missing.map((suggestion) => ({
        ...suggestion,
        on: current.find((previous) => previous.name === suggestion.name)?.on ?? true,
      })));
      setComposeSummary([
        result.summary,
        result.missing.length
          ? t('gear.setEditor.composeResult', { picked: picked.length, missing: result.missing.length })
          : t('gear.setEditor.composeResultComplete', { picked: picked.length }),
      ].filter(Boolean).join(' '));
      if (!trimmedName && result.name) setName(result.name.slice(0, 24));
    } catch (error) {
      if (run !== composeRun.current) return;
      setComposeError(error instanceof Error && error.message ? error.message : t('gear.setEditor.composeFailed'));
    } finally {
      if (run === composeRun.current) setComposing(false);
    }
  };
  const stopCompose = () => {
    composeRun.current += 1;
    setComposing(false);
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
            noteRemoved([...selectedNames].filter((itemName) => !nextSelectedNames.has(itemName)));
            nextSelectedNames.forEach((itemName) => {
              const id = allItems.find((item) => item.name === itemName)?.id;
              if (id != null) removedIds.current.delete(id);
            });
            setSelectedNames(nextSelectedNames);
            setPickerOpen(false);
          },
          onAdd: onAddGear ? (anchor) => onAddGear((item) => {
            setSelectedNames((current) => new Set(current).add(item.name));
          }, anchor) : undefined,
        }}
      />
    </View>
  ) : null;

  // The three carried parts that add up to the big weight figure.
  const composition = [
    [t('gear.pack.base'), selectedPack.base],
    [t('gear.pack.worn'), selectedPack.worn],
    [t('gear.pack.consumable'), selectedPack.consumable],
  ] as const;
  const countCaption = [type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums' as const], color: theme.text3 }];

  return (
    <View style={{ flex: 1 }}>
      <DetailPage
      theme={theme}
      title={mode === 'edit' ? t('gear.setEditor.titleEdit') : t('gear.setEditor.titleNew')}
      onBack={onCancel}
      backgroundColor={theme.featureSurface}
      flatChrome
      overlay={(
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.pagePadding, paddingBottom: Math.max(insets.bottom, space.sm) + space.xxs }}>
            {!valid || toBuyCount ? (
              <Text style={[type.caption, { marginBottom: space.xs, textAlign: 'center', color: theme.text3 }]}>
                {!valid ? t('gear.setEditor.nameRequired') : t('gear.setEditor.toBuyOnCreate', { count: toBuyCount })}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Press
                onPress={() => setPickerOpen(true)}
                style={{ height: BAR_HEIGHT, paddingHorizontal: space.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: theme.controlSurface, boxShadow: theme.controlShadow }}
              >
                <Icon name={hasItems ? 'edit' : 'plus'} color={theme.text} size={17} strokeWidth={2.1} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>
                  {hasItems ? t('gear.setEditor.changeSelection') : t('gear.setEditor.chooseGear')}
                </Text>
              </Press>
              <Press
                onPress={submit}
                disabled={!valid}
                style={{ flex: 1, height: BAR_HEIGHT, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: valid ? theme.accent : theme.controlSurface, boxShadow: theme.controlShadow }}
              >
                <Icon name="check" color={valid ? '#FFFFFF' : theme.text3} size={18} strokeWidth={2.3} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: valid ? '#FFFFFF' : theme.text3 }}>
                  {mode === 'edit' ? t('gear.setEditor.saveChanges') : t('gear.setEditor.createSet')}
                </Text>
              </Press>
            </View>
          </View>
        </View>
      )}
    >
      <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs, paddingBottom: BAR_HEIGHT + space.xxxl * 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('gear.setEditor.namePlaceholder')}
            placeholderTextColor={theme.text3}
            maxLength={24}
            returnKeyType="done"
            accessibilityLabel={t('gear.setEditor.nameLabel')}
            style={[type.pageTitle, { flex: 1, minWidth: 0, padding: 0, color: theme.text }]}
          />
          <Text style={countCaption}>{name.length}/24</Text>
        </View>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('gear.setEditor.descriptionPlaceholder')}
          placeholderTextColor={theme.text3}
          accessibilityLabel={t('gear.setEditor.descriptionLabel')}
          multiline
          scrollEnabled={false}
          style={{ marginTop: space.lg, padding: 0, fontSize: 15, lineHeight: 22, color: theme.text2, textAlignVertical: 'top' }}
        />
        <ComposeEntry
          theme={theme}
          composing={composing}
          composed={composeSummary != null}
          enabled={trimmedDescription.length > 0}
          ownedCount={ownedCount}
          onCompose={compose}
          onStop={stopCompose}
        />
        {composeError ? (
          <Text style={[type.hint, { marginTop: space.sm, color: theme.danger }]}>{composeError}</Text>
        ) : composeSummary && !composing ? (
          <Text style={[type.body, { marginTop: space.md, lineHeight: 21, color: theme.text2 }]}>{composeSummary}</Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xxl }}>
          <SummaryStat theme={theme} label={t('gear.stat.weight')} value={weightParts.value} suffix={weightParts.unit} empty={!hasItems} />
          <SummaryStat theme={theme} label={t('gear.stat.value')} value={formatItemValue(selectedPack.price)} prefix="¥" empty={!hasItems} />
        </View>
        <Pressable
          onPress={() => setWeightInfoOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('gear.setEditor.weightInfoTitle')}
          style={({ pressed }) => ({ marginTop: space.sm, marginHorizontal: -space.xs, paddingHorizontal: space.xs, paddingVertical: space.xxs, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: pressed ? theme.fieldSurface : 'transparent' })}
        >
          {composition.map(([label, weight]) => (
            <Text key={label} numberOfLines={1} style={[type.caption, { color: theme.text3 }]}>
              {label}{' '}
              <Text style={{ fontFamily: MONO, fontVariant: ['tabular-nums'], fontWeight: '700', color: weight ? theme.text : theme.text3 }}>
                {weight ? fmtWeight(weight, weightUnit) : '—'}
              </Text>
            </Text>
          ))}
          <Info color={theme.text3} size={14} strokeWidth={1.8} style={{ marginLeft: 'auto' }} />
        </Pressable>
        {toBuyCount ? (
          <Text style={[type.caption, { marginTop: space.xxs, color: theme.text3 }]}>{t('gear.setEditor.toBuyExcluded', { count: toBuyCount })}</Text>
        ) : null}

        <View style={{ marginTop: space.xxl, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('gear.setEditor.itemsSection')}</Text>
          {hasItems ? <Text style={countCaption}>{selectedItems.length} {t('gear.unit.items')}</Text> : null}
        </View>

        {suggestions.length ? (
          <View>
            <View style={{ paddingTop: space.lg, paddingBottom: space.xxs, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
              <Text numberOfLines={1} style={[type.eyebrow, { flexShrink: 1, color: theme.accent }]}>{t('gear.setEditor.missingTitle', { count: suggestions.length })}</Text>
              <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, color: theme.text3 }]}>{t('gear.setEditor.missingHint')}</Text>
            </View>
            {suggestions.map((suggestion, index) => (
              <SuggestionRow
                key={suggestion.name}
                theme={theme}
                suggestion={suggestion}
                category={catMap[suggestion.categoryId]?.name}
                onToggle={() => setSuggestions((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, on: !entry.on } : entry))}
              />
            ))}
          </View>
        ) : null}

        {hasItems ? selectedGroups.map((group) => (
          <View key={group.category.id}>
            <View style={{ paddingTop: space.lg, paddingBottom: space.xxs, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
              <Text numberOfLines={1} style={[type.eyebrow, { flexShrink: 1, color: theme.text2 }]}>{group.category.name}</Text>
              <Text style={countCaption}>{group.items.length} {t('gear.unit.items')}  {fmtWeight(group.weight, weightUnit)}</Text>
            </View>
            {group.items.map((item) => (
              // Optional gear counts toward no weight, so it reads as set aside.
              <View key={item.id ?? item.name} style={{ opacity: itemStatus(item) === 'optional' ? 0.5 : 1 }}>
                <ItemRow
                  theme={theme}
                  item={item}
                  cat={catMap[item.cat]}
                  showCategory={false}
                  weightUnit={weightUnit}
                  onPress={() => setSheetName(item.name)}
                  selectMode={false}
                  selected={false}
                  showImage
                  showPhoto
                  loading={false}
                  showWeight
                  showValue
                  hint={aiPicked.has(item.name) ? t('gear.setEditor.aiPicked') : undefined}
                />
              </View>
            ))}
          </View>
        )) : (
          <Press
            onPress={() => setPickerOpen(true)}
            style={{ marginTop: space.md, minHeight: 150, borderRadius: radius.feature, alignItems: 'center', justifyContent: 'center', gap: space.xs, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border }}
          >
            <Package color={theme.text3} size={26} strokeWidth={1.6} />
            <Text style={[type.cardTitle, { color: theme.text }]}>{t('gear.setEditor.chooseGear')}</Text>
          </Press>
        )}
      </View>
      </DetailPage>
      {pickerPage}
      <WeightInfoSheet
        theme={theme}
        visible={weightInfoOpen}
        values={{
          base: fmtWeight(selectedPack.base, weightUnit, true),
          pack: fmtWeight(selectedPack.pack, weightUnit, true),
          skinOut: fmtWeight(selectedPack.skinOut, weightUnit, true),
        }}
        onClose={() => setWeightInfoOpen(false)}
      />
      <SetItemSheet
        theme={theme}
        item={sheetSource ? applyOverride(sheetSource) : null}
        cat={sheetSource ? catMap[sheetSource.cat] : undefined}
        weightUnit={weightUnit}
        onPatch={(patch) => { if (sheetSource) patchOverride(sheetSource, patch); }}
        onRemove={() => {
          if (sheetName != null) removeItem(sheetName);
          setSheetName(null);
        }}
        onClose={() => setSheetName(null)}
      />
    </View>
  );
}

// 按描述搭配 under the description: a solid accent pill, or a live progress line
// while the request runs. It needs a description to work from.
function ComposeEntry({ theme, composing, composed, enabled, ownedCount, onCompose, onStop }: {
  theme: Theme;
  composing: boolean;
  composed: boolean;
  enabled: boolean;
  ownedCount: number;
  onCompose: () => void;
  onStop: () => void;
}) {
  const { t } = useI18n();
  if (composing) {
    return (
      <View style={{ marginTop: space.xl, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text numberOfLines={1} style={[type.chip, { flex: 1, minWidth: 0, color: theme.text }]}>{t('gear.setEditor.composing', { count: ownedCount })}</Text>
        <Press onPress={onStop} hitSlop={space.xs} accessibilityRole="button" style={{ height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
          <Text style={[type.chip, { color: theme.text2 }]}>{t('gear.setEditor.composeStop')}</Text>
        </Press>
      </View>
    );
  }
  const label = composed ? t('gear.setEditor.recompose') : t('gear.setEditor.compose');
  const hint = !enabled || composed
    ? null
    : ownedCount ? t('gear.setEditor.composeHint', { count: ownedCount }) : t('gear.setEditor.composeHintEmpty');
  const color = !enabled ? theme.text3 : composed ? theme.text2 : '#FFFFFF';
  return (
    <View style={{ marginTop: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {hint
        ? <Text numberOfLines={1} style={[type.hint, { flex: 1, minWidth: 0, color: theme.text3 }]}>{hint}</Text>
        : <View style={{ flex: 1 }} />}
      <Press
        onPress={onCompose}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: composed ? theme.fieldSurface : enabled ? theme.accent : 'transparent' }}
      >
        <Text style={[type.chip, { fontWeight: composed ? '600' : '700', color }]}>{label}</Text>
      </Press>
    </View>
  );
}

// A piece of gear the set needs but the library lacks. Checked ones become
// 待购 items when the set is saved; the reason says why this trip needs it.
function SuggestionRow({ theme, suggestion, category, onToggle }: {
  theme: Theme;
  suggestion: GearSetSuggestion & { on: boolean };
  category?: string;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const tag = (label: string, color: string, backgroundColor: string) => (
    <View style={{ paddingHorizontal: space.xxs + 2, paddingVertical: 1, borderRadius: radius.control / 2, backgroundColor }}>
      <Text style={[type.micro, { fontWeight: '600', color }]}>{label}</Text>
    </View>
  );
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: suggestion.on }}
      accessibilityLabel={[suggestion.name, suggestion.reason].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ marginHorizontal: -space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: suggestion.on ? 1 : 0.45, backgroundColor: pressed ? theme.fieldSurface : 'transparent' })}
    >
      <ItemThumb theme={theme} color={theme.text3} showPhoto={false} iconSize={20} style={{ width: 52, height: 52, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border, backgroundColor: 'transparent' }} />
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        <Text numberOfLines={2} style={[type.cardTitle, { lineHeight: 20, color: theme.text }]}>{suggestion.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {tag(t('gear.setEditor.suggested'), theme.accent, theme.accentSofter)}
          {category ? tag(category, theme.text2, theme.fieldSurface) : null}
        </View>
        {suggestion.reason ? <Text style={[type.caption, { lineHeight: 17, color: theme.text2 }]}>{suggestion.reason}</Text> : null}
      </View>
      <View style={{ width: space.xl, height: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: suggestion.on ? 0 : 1.5, borderColor: theme.text3, backgroundColor: suggestion.on ? theme.accent : 'transparent' }}>
        {suggestion.on ? <Check color="#FFFFFF" size={15} strokeWidth={2.6} /> : null}
      </View>
    </Pressable>
  );
}

// Slide-up sheet shell shared by the item and weight-info sheets: the scrim
// fades in, and dragging the handle down dismisses it.
function BottomSheet({ theme, visible, onClose, children }: { theme: Theme; visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const travel = Math.min(560, height * 0.7);
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const latest = useRef({ visible, onClose, travel });
  latest.current = { visible, onClose, travel };

  useLayoutEffect(() => {
    progress.stopAnimation();
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? motion.standard : motion.quick,
      easing: visible ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, progress]);

  const requestClose = () => { if (latest.current.visible) latest.current.onClose(); };
  const restore = () => Animated.timing(progress, { toValue: 1, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => latest.current.visible && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => progress.stopAnimation(),
    onPanResponderMove: (_event, gesture) => progress.setValue(Math.max(0, 1 - Math.max(0, gesture.dy) / latest.current.travel)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 80 || gesture.vy > 0.5) requestClose();
      else restore();
    },
    onPanResponderTerminate: restore,
  })).current;

  if (!mounted && !visible) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={requestClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={requestClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={{ paddingHorizontal: space.lg, paddingBottom: Math.max(insets.bottom, space.md) + space.sm, borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, backgroundColor: theme.groupedBg, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }] }}>
          <View {...pan.panHandlers} style={{ paddingTop: space.sm, paddingBottom: space.md, alignItems: 'center' }}>
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, opacity: 0.45 }} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function SetItemSheet({
  theme,
  item,
  cat,
  weightUnit,
  onPatch,
  onRemove,
  onClose,
}: {
  theme: Theme;
  item: GearItem | null;
  cat?: GearCat;
  weightUnit: WeightUnit;
  onPatch: (patch: GearSetOverride) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  // Keep the last item on screen while the sheet slides away.
  const shown = useRef<{ item: GearItem; cat?: GearCat } | null>(null);
  if (item) shown.current = { item, cat };
  const statusOptions = useMemo(
    () => GEAR_STATUS.map((status) => [status.id, t(`gear.status.${status.id}`)] as const),
    [t],
  );
  if (!shown.current) return null;
  const { item: shownItem, cat: shownCat } = shown.current;
  const quantity = shownItem.qty || 1;
  const status = itemStatus(shownItem);
  const optional = status === 'optional';
  const toBuy = shownItem.owned === false;
  const label = (text: string) => (
    <Text style={[type.eyebrow, { marginTop: space.lg, marginBottom: space.xs, color: theme.text2 }]}>{text}</Text>
  );

  return (
    <BottomSheet theme={theme} visible={item != null} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: optional ? 0.5 : 1 }}>
        <ItemThumb theme={theme} photo={shownItem.photos?.[0]} color={shownCat?.color || theme.text3} showPhoto iconSize={20} style={{ width: 52, height: 52 }} />
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Text numberOfLines={2} style={[type.cardTitle, { lineHeight: 20, color: theme.text }]}>{shownItem.name}</Text>
          <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>
            {shownCat?.name || t('gear.uncategorized')}  {t('gear.setEditor.perUnit', { weight: fmtWeight(shownItem.w, weightUnit) })}
          </Text>
        </View>
        <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: space.xxs }}>
          <Text numberOfLines={1} style={[type.metric, { fontVariant: ['tabular-nums'], color: theme.text }]}>{toBuy ? '—' : fmtWeight(shownItem.w * quantity, weightUnit)}</Text>
          <Text numberOfLines={1} style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text2 }]}>{toBuy ? '—' : `¥${formatItemValue(shownItem.p * quantity)}`}</Text>
        </View>
      </View>

      {label(t('gear.spec.status'))}
      <AppFilterSegmented<GearCarryStatus> theme={theme} options={statusOptions} value={status} onChange={(next) => onPatch({ status: next })} />
      <Text style={[type.caption, { marginTop: space.xs, color: theme.text3 }]}>{t(`gear.setEditor.statusHint.${status}`)}</Text>

      {label(t('gear.stat.count'))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, padding: space.xxs, borderRadius: radius.pill, backgroundColor: theme.fieldSurface }}>
          <StepButton theme={theme} label={t('gear.setEditor.decrease')} disabled={quantity <= 1} onPress={() => onPatch({ qty: Math.max(1, quantity - 1) })}>
            <Minus color={quantity <= 1 ? theme.text3 : theme.text} size={18} strokeWidth={2.2} />
          </StepButton>
          <Text style={[type.metric, { minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'], color: theme.text }]}>{quantity}</Text>
          <StepButton theme={theme} label={t('gear.setEditor.increase')} onPress={() => onPatch({ qty: quantity + 1 })}>
            <Plus color={theme.text} size={18} strokeWidth={2.2} />
          </StepButton>
        </View>
        {quantity > 1 ? (
          <Text style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text3 }]}>{fmtWeight(shownItem.w, weightUnit)} × {quantity}</Text>
        ) : null}
      </View>

      <View style={{ marginTop: space.xl, flexDirection: 'row', gap: space.sm }}>
        <Press onPress={onRemove} style={{ height: BAR_HEIGHT, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceTop, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.danger }}>{t('gear.setEditor.removeFromSet')}</Text>
        </Press>
        <Press onPress={onClose} style={{ flex: 1, height: BAR_HEIGHT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{t('common.done')}</Text>
        </Press>
      </View>
    </BottomSheet>
  );
}

function StepButton({ theme, label, disabled, onPress, children }: { theme: Theme; label: string; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? 'transparent' : theme.surfaceTop }}>
      {children}
    </Press>
  );
}

function WeightInfoSheet({
  theme,
  visible,
  values,
  onClose,
}: {
  theme: Theme;
  visible: boolean;
  values: Record<'base' | 'pack' | 'skinOut', string>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const rows: { id: 'base' | 'pack' | 'skinOut'; label: string; description: string }[] = [
    { id: 'base', label: t('gear.pack.base'), description: t('gear.setEditor.baseWeightDefinition') },
    { id: 'pack', label: t('gear.pack.pack'), description: t('gear.setEditor.packWeightDefinition') },
    { id: 'skinOut', label: t('gear.pack.skinOut'), description: t('gear.setEditor.skinOutWeightDefinition') },
  ];

  return (
    <BottomSheet theme={theme} visible={visible} onClose={onClose}>
      <Text style={[type.sectionTitle, { color: theme.text }]}>{t('gear.setEditor.weightInfoTitle')}</Text>
      <Text style={[type.caption, { marginTop: space.xxs, color: theme.text2 }]}>{t('gear.setEditor.weightInfoIntro')}</Text>
      <View style={{ marginTop: space.md, gap: space.md }}>
        {rows.map((row) => (
          <View key={row.id}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[type.cardTitle, { flex: 1, color: theme.text }]}>{row.label}</Text>
              <Text style={[type.metric, { fontVariant: ['tabular-nums'], color: theme.text }]}>{values[row.id]}</Text>
            </View>
            <Text style={[type.caption, { marginTop: space.xxs, color: theme.text2 }]}>{row.description}</Text>
          </View>
        ))}
      </View>
      <Text style={[type.caption, { marginTop: space.lg, color: theme.text3 }]}>{t('gear.setEditor.optionalWeightDefinition')}</Text>
    </BottomSheet>
  );
}
