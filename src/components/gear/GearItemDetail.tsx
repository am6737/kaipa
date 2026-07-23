// GearItemDetail.tsx — 装备详情. A calm, airy detail layout inspired by modern
// gear-library apps: floating chrome, centered product photo, generous whitespace,
// soft stat tiles, icon-led metadata, then secondary library context.
import React from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, useWindowDimensions, Modal, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet, UNCAT, itemStatus, itemWeight, itemPrice, WeightUnit, splitWeight, fmtWeight } from '../../data/gear';
import { GearItemImage, ShareBar, yuan, fmtKg } from './parts';
import { AppIconButton, AppSectionHeader, DetailPage, radius, space } from '../../design-system';
import { GearDeleteDialog } from './GearDeleteDialog';
import { GearWheelSelectSheet } from './GearWheelSelectSheet';

const softBg = (t: Theme) => t.fieldSurface;
const softBorder = (t: Theme) => t.fieldBorder;

const yuanWithGap = (value: number) => yuan(value).replace('¥', '¥ ');
const pageBg = (t: Theme) => t.featureSurface;

function StatTile({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, minHeight: 104, borderRadius: 24, backgroundColor: softBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: softBorder(theme), paddingHorizontal: 20, paddingVertical: 17, justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 15, color: theme.text2, letterSpacing: -0.1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 25, lineHeight: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.7 }}>{value}</Text>
        {unit ? <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function MetaCell({ theme, label, value, muted, fullWidth, multiline, onPress }: { theme: Theme; label: string; value?: string; muted?: boolean; fullWidth?: boolean; multiline?: boolean; onPress?: () => void }) {
  const hasValue = !!value;
  const content = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ height: 20, fontSize: 15.5, lineHeight: 20, includeFontPadding: false, color: hasValue ? theme.text2 : theme.text3, textAlign: 'left' }}>{label}</Text>
      {hasValue ? <Text numberOfLines={multiline ? undefined : 1} style={{ height: multiline ? undefined : 20, marginTop: 8, fontSize: 13, lineHeight: 20, includeFontPadding: false, fontWeight: '700', color: muted ? theme.text3 : theme.text, textAlign: 'left' }}>{value}</Text> : null}
    </View>
  );
  const style = { width: fullWidth ? '100%' as const : '50%' as const, height: 76, paddingVertical: 14, paddingRight: 18 };
  return onPress ? (
    <Press onPress={onPress} style={style}>
      {content}
    </Press>
  ) : (
    <View style={style}>
      {content}
    </View>
  );
}

function NoteCell({ theme, label, value, onPress }: { theme: Theme; label: string; value?: string; onPress?: () => void }) {
  const content = (
    <>
      <Text style={{ height: 20, fontSize: 15.5, lineHeight: 20, includeFontPadding: false, color: value ? theme.text2 : theme.text3, textAlign: 'left' }}>{label}</Text>
      <View style={{ marginTop: 8, minHeight: 60 }}>
        <Text style={{ fontSize: 13, lineHeight: 20, includeFontPadding: false, fontWeight: '700', color: value ? theme.text : theme.text3, textAlign: 'left' }}>
          {value || '暂无备注'}
        </Text>
      </View>
    </>
  );
  const style = { width: '100%' as const, minHeight: 96, paddingVertical: 14, paddingRight: 18 };
  return onPress ? <Press onPress={onPress} style={style}>{content}</Press> : <View style={style}>{content}</View>;
}

function EditableMetaCell({ theme, label, value, onPress }: { theme: Theme; label: string; value: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ width: '50%', height: 76, paddingVertical: 14, paddingRight: 18 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ height: 20, fontSize: 15.5, lineHeight: 20, includeFontPadding: false, color: theme.text2 }}>{label}</Text>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text numberOfLines={1} style={{ height: 20, flexShrink: 1, fontSize: 13, lineHeight: 20, includeFontPadding: false, fontWeight: '700', color: theme.text }}>{value}</Text>
          <Icon name="chevronR" color={theme.accent} size={13} strokeWidth={2.2} />
        </View>
      </View>
    </Press>
  );
}

function EditableValueCell({ theme, label, value, prefix, onChangeText }: { theme: Theme; label: string; value: string; prefix?: string; onChangeText: (value: string) => void }) {
  return (
    <View style={{ width: '50%', height: 76, paddingVertical: 14, paddingRight: 18 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ height: 20, fontSize: 15.5, lineHeight: 20, includeFontPadding: false, color: theme.text2 }}>{label}</Text>
        <View style={{ height: 20, marginTop: 8 }}>
          <TextInput
            value={`${prefix || ''}${value}`}
            onChangeText={(nextValue) => onChangeText(prefix ? nextValue.replace(prefix, '') : nextValue)}
            keyboardType="decimal-pad"
            style={{ width: '100%', height: 20, padding: 0, margin: 0, fontSize: 13, lineHeight: 20, fontWeight: '700', includeFontPadding: false, color: theme.text, textAlignVertical: 'center' }}
          />
        </View>
      </View>
    </View>
  );
}

function EditableMetric({ theme, label, value, unit, onChangeText, onBlur }: { theme: Theme; label: string; value: string; unit?: string; onChangeText: (value: string) => void; onBlur: () => void }) {
  return (
    <View style={{ flex: 1, minHeight: 104, borderRadius: 24, backgroundColor: softBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: softBorder(theme), paddingHorizontal: 20, paddingVertical: 17, justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 15, color: theme.text2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <TextInput
          autoFocus
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={{ flex: 1, minWidth: 44, padding: 0, fontSize: 25, lineHeight: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.7 }}
        />
        {unit ? <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function GearGallery({ theme, item, onOpenPhoto }: { theme: Theme; item: GearItem; onOpenPhoto: (index: number) => void }) {
  const { width } = useWindowDimensions();
  const photos = (item.photos || []).filter(Boolean);
  const [page, setPage] = React.useState(0);
  const galleryWidth = Math.min(380, Math.max(220, width - 64));
  const galleryHeight = Math.round(galleryWidth * 0.82);

  if (photos.length === 0) {
    return (
      <Pressable onPress={() => onOpenPhoto(0)}>
        <GearItemImage theme={theme} item={item} radius={18} style={{ width: galleryWidth, height: galleryHeight }} />
      </Pressable>
    );
  }

  return (
    <View style={{ alignItems: 'center', width: galleryWidth, height: galleryHeight }}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri, index) => `${uri}-${index}`}
        snapToInterval={galleryWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => {
          setPage(Math.round(event.nativeEvent.contentOffset.x / galleryWidth));
        }}
        renderItem={({ item: uri, index }) => (
          <Pressable onPress={() => onOpenPhoto(index)}>
            <Image
              source={{ uri }}
              contentFit="contain"
              transition={180}
              style={{ width: galleryWidth, height: galleryHeight, borderRadius: 18, backgroundColor: pageBg(theme) }}
            />
          </Pressable>
        )}
        style={{ width: galleryWidth, height: galleryHeight, borderRadius: 18 }}
      />
      {photos.length > 1 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          {photos.map((uri, index) => (
            <View
              key={`${uri}-dot-${index}`}
              style={{
                width: index === page ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === page ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
                opacity: 0.92,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GearPhotoViewer({ theme, item, index, onClose }: {
  theme: Theme;
  item: GearItem;
  index: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const photos = (item.photos || []).filter(Boolean);
  const pages = photos.length ? photos : [null];
  const initialIndex = Math.min(index, pages.length - 1);
  const [page, setPage] = React.useState(initialIndex);
  const fade = React.useRef(new Animated.Value(0)).current;
  const imageTop = insets.top + 52;
  const imageBottom = Math.max(insets.bottom, 14) + 18;
  const imageHeight = Math.max(1, height - imageTop - imageBottom);

  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);


  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.94)', opacity: fade }]}>
        <FlatList
          data={pages}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          keyExtractor={(uri, itemIndex) => uri ? `${uri}-${itemIndex}` : `fallback-${itemIndex}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item: uri }) => (
            <Pressable onPress={onClose} style={{ width, height }}>
              <View style={{ position: 'absolute', top: imageTop, left: 0, right: 0, height: imageHeight, alignItems: 'center', justifyContent: 'center' }}>
                {uri ? (
                  <Image source={{ uri }} contentFit="contain" transition={200} style={{ width, height: imageHeight }} />
                ) : (
                  <GearItemImage theme={theme} item={item} style={{ width, height: imageHeight }} />
                )}
              </View>
            </Pressable>
          )}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top + 8,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Press onPress={onClose} hitSlop={12} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 34, lineHeight: 34, fontWeight: '200' }}>×</Text>
          </Press>
          <View style={{ minWidth: 44, height: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>{`${page + 1}/${pages.length}`}</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function GearTitlePreview({ theme, title, onClose }: { theme: Theme; title: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.18)' }]}
      >
        <View
          style={{
            width: Math.min(width - 48, 420),
            paddingHorizontal: 22,
            paddingVertical: 20,
            borderRadius: 22,
            backgroundColor: theme.surfaceStrong,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            boxShadow: theme.dark ? '0px 12px 32px rgba(0,0,0,0.46)' : '0px 12px 32px rgba(0,0,0,0.18)',
          }}
        >
          <Text selectable style={{ fontSize: 20, lineHeight: 29, fontWeight: '700', color: theme.text, letterSpacing: -0.35 }}>
            {title}
          </Text>
        </View>
      </Pressable>
    </Modal>
  );
}

function GearItemDetailView({
  theme,
  item,
  cats,
  allItems,
  sets,
  weightUnit = 'kg',
  onBack,
  onOpenSet,
  onSave,
  onDelete,
}: {
  theme: Theme;
  item: GearItem;
  cats: GearCat[];
  allItems: GearItem[];
  sets: GearSet[];
  weightUnit?: WeightUnit;
  onBack: () => void;
  onOpenSet: (s: GearSet) => void;
  onSave: (next: GearItem) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { width: windowWidth } = useWindowDimensions();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<GearItem>(item);
  const [weightInput, setWeightInput] = React.useState(String(itemWeight(item) || ''));
  const [qtyInput, setQtyInput] = React.useState(String(item.qty || 1));
  const [priceInput, setPriceInput] = React.useState(String(item.p || ''));
  const [activeField, setActiveField] = React.useState<'weight' | 'qty' | null>(null);
  const [pickerField, setPickerField] = React.useState<'category' | 'status' | null>(null);
  const [photoViewerIndex, setPhotoViewerIndex] = React.useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [titleLineCount, setTitleLineCount] = React.useState(0);
  const [titlePreviewOpen, setTitlePreviewOpen] = React.useState(false);
  const currentItem = isEditing ? draft : item;
  const titleIsTruncated = titleLineCount > 2 || item.name.trim().length >= 20;
  const currentCat = cats.find((candidate) => candidate.id === currentItem.cat) || UNCAT;
  const qty = currentItem.qty || 1;
  const unitW = currentItem.w;
  const unitP = currentItem.p;
  const itemW = itemWeight(currentItem);
  const itemP = itemPrice(currentItem);

  React.useEffect(() => {
    if (!isEditing) setDraft(item);
  }, [isEditing, item]);

  const patchDraft = (patch: Partial<GearItem>) => setDraft((current) => ({ ...current, ...patch }));
  const beginEditing = () => {
    setDraft(item);
    setWeightInput(String(itemWeight(item) || ''));
    setQtyInput(String(item.qty || 1));
    setPriceInput(String(item.p || ''));
    setActiveField(null);
    setIsEditing(true);
  };
  const cancelEditing = () => {
    setDraft(item);
    setPickerField(null);
    setActiveField(null);
    setIsEditing(false);
  };
  const saveEditing = () => {
    const name = draft.name.trim();
    if (!name) return;
    const attrs = (draft.attrs || [])
      .map(([key, value]) => [key.trim(), value.trim()] as [string, string])
      .filter(([key, value]) => key && value);
    onSave({
      ...draft,
      name,
      qty: Math.max(1, draft.qty || 1),
      note: draft.note?.trim() || undefined,
      attrs: attrs.length ? attrs : undefined,
    });
    setPickerField(null);
    setActiveField(null);
    setIsEditing(false);
  };

  // ── real library context ──────────────────────────────────────────────────
  const libraryContext = React.useMemo(() => {
    const comparisonItems = allItems.map((candidate) => candidate.name === item.name ? currentItem : candidate);
    const catItems = comparisonItems.filter((candidate) => candidate.cat === currentItem.cat);
    return {
      totalW: comparisonItems.reduce((sum, candidate) => sum + itemWeight(candidate), 0) || itemW,
      totalP: comparisonItems.reduce((sum, candidate) => sum + itemPrice(candidate), 0) || itemP,
      catItems,
      catW: catItems.reduce((sum, candidate) => sum + itemWeight(candidate), 0) || itemW,
      wRank: catItems.slice().sort((a, b) => itemWeight(b) - itemWeight(a)).findIndex((candidate) => candidate.name === currentItem.name) + 1,
    };
  }, [allItems, currentItem, item.name, itemP, itemW]);
  const memberSetRows = React.useMemo(() => {
    return sets.filter((set) => set.items.includes(item.name)).map((set) => {
      const items = set.items
        .map((name) => allItems.find((candidate) => candidate.name === name))
        .filter(Boolean)
        .map((candidate) => {
          const gear = candidate as GearItem;
          const override = (gear.id != null ? set.overrides?.[String(gear.id)] : undefined) || set.overrides?.[gear.name];
          return override ? { ...gear, ...override } : gear;
        });
      return { set, count: items.length, weight: items.reduce((sum, gear) => sum + itemWeight(gear), 0) };
    });
  }, [allItems, item.name, sets]);
  const { totalW, totalP, catItems, catW, wRank } = libraryContext;

  const primaryAttrs = currentItem.attrs || [];
  const weightMain = splitWeight(itemW, weightUnit);
  const customAttrCardWidth = Math.floor((windowWidth - 32 * 2 - space.sm) / 2);

  return (
    <DetailPage
      theme={theme}
      onBack={isEditing ? cancelEditing : onBack}
      right={(
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <AppIconButton
            theme={theme}
            name={isEditing ? 'check' : 'edit'}
            onPress={isEditing ? saveEditing : beginEditing}
            active={isEditing}
            softShadow
            size={44}
          />
          <AppIconButton theme={theme} name="trash" danger onPress={() => setDeleteDialogOpen(true)} softShadow size={44} />
        </View>
      )}
      overlay={(
        <>
          {photoViewerIndex !== null ? (
            <GearPhotoViewer
              theme={theme}
              item={currentItem}
              index={photoViewerIndex}
              onClose={() => setPhotoViewerIndex(null)}
            />
          ) : null}
          {titlePreviewOpen ? <GearTitlePreview theme={theme} title={item.name} onClose={() => setTitlePreviewOpen(false)} /> : null}
          <GearDeleteDialog
            theme={theme}
            visible={deleteDialogOpen}
            title={t('gear.itemDetail.deleteConfirmTitle', { name: currentItem.name })}
            message={t('gear.itemDetail.deleteConfirmMessage')}
            confirmLabel={t('gear.itemDetail.deleteItem')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setDeleteDialogOpen(false)}
            onConfirm={() => {
              setDeleteDialogOpen(false);
              onDelete();
            }}
          />
        </>
      )}
    >
      <View style={{ paddingHorizontal: 32, paddingTop: 8 }}>
        {/* spacious product header */}
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 18 }}>
          <GearGallery theme={theme} item={currentItem} onOpenPhoto={setPhotoViewerIndex} />

          {isEditing ? (
            <TextInput
              value={draft.name}
              onChangeText={(name) => patchDraft({ name })}
              placeholder={t('gear.editor.namePlaceholder')}
              placeholderTextColor={theme.text3}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              style={{ minHeight: 64, marginTop: 28, alignSelf: 'stretch', padding: 0, fontSize: 25, fontWeight: '800', color: theme.text, letterSpacing: -0.6, lineHeight: 32, borderBottomWidth: 1, borderBottomColor: theme.accentSoft }}
            />
          ) : (
            <View style={{ marginTop: 28, alignSelf: 'stretch', position: 'relative' }}>
              <Pressable
                disabled={!titleIsTruncated}
                onPress={() => setTitlePreviewOpen(true)}
                onLongPress={() => setTitlePreviewOpen(true)}
                hitSlop={titleIsTruncated ? 8 : undefined}
              >
                <Text style={{ fontSize: 25, fontWeight: '800', color: theme.text, letterSpacing: -0.6, lineHeight: 32 }} numberOfLines={2}>
                  {currentItem.name}
                </Text>
              </Pressable>
              <Text
                accessible={false}
                pointerEvents="none"
                onTextLayout={(event) => {
                  const nextLineCount = event.nativeEvent.lines.length;
                  setTitleLineCount((current) => current === nextLineCount ? current : nextLineCount);
                }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0, fontSize: 25, fontWeight: '800', letterSpacing: -0.6, lineHeight: 32 }}
              >
                {currentItem.name}
              </Text>
            </View>
          )}
        </View>

        {/* key facts, large breathing-room cards */}
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 4 }}>
          {isEditing ? (
            <>
              <Press onPress={() => setActiveField('weight')} style={{ flex: 1 }}>
                {activeField === 'weight' ? (
                  <EditableMetric
                    theme={theme}
                    label={t('gear.spec.totalWeight')}
                    value={weightInput}
                    unit="kg"
                    onChangeText={(value) => {
                      const next = value.replace(/[^0-9.]/g, '');
                      setWeightInput(next);
                      patchDraft({ w: (Number(next) || 0) / qty });
                    }}
                    onBlur={() => setActiveField(null)}
                  />
                ) : <StatTile theme={theme} label={t('gear.spec.totalWeight')} value={weightMain.value} unit={weightMain.unit} />}
              </Press>
              <Press onPress={() => setActiveField('qty')} style={{ flex: 1 }}>
                {activeField === 'qty' ? (
                  <EditableMetric
                    theme={theme}
                    label={t('gear.spec.qty')}
                    value={qtyInput}
                    onChangeText={(value) => {
                      const next = value.replace(/\D/g, '');
                      setQtyInput(next);
                      const nextQty = Math.max(1, Number(next) || 1);
                      patchDraft({ qty: nextQty, w: (Number(weightInput) || 0) / nextQty });
                    }}
                    onBlur={() => setActiveField(null)}
                  />
                ) : <StatTile theme={theme} label={t('gear.spec.qty')} value={String(qty)} />}
              </Press>
            </>
          ) : (
            <>
              <StatTile theme={theme} label={t('gear.spec.totalWeight')} value={weightMain.value} unit={weightMain.unit} />
              <StatTile theme={theme} label={t('gear.spec.qty')} value={String(qty)} />
            </>
          )}
        </View>
        {/* icon metadata */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 42 }}>
          {isEditing ? (
            <>
              <EditableMetaCell theme={theme} label={t('gear.spec.category')} value={currentCat.name} onPress={() => setPickerField('category')} />
              <EditableValueCell
                theme={theme}
                label={t('gear.spec.value')}
                value={priceInput}
                prefix="¥ "
                onChangeText={(value) => {
                  const next = value.replace(/[^0-9.]/g, '');
                  setPriceInput(next);
                  patchDraft({ p: Number(next) || 0 });
                }}
              />
              <EditableMetaCell theme={theme} label={t('gear.spec.status')} value={t(`gear.status.${itemStatus(currentItem)}` as any)} onPress={() => setPickerField('status')} />
              {qty > 1 ? <MetaCell theme={theme} label={t('gear.spec.unitWeight')} value={fmtKg(unitW, weightUnit)} /> : <MetaCell theme={theme} label={t('gear.spec.unitValue')} value={yuanWithGap(unitP)} />}
            </>
          ) : (
            <>
              <MetaCell theme={theme} label={t('gear.spec.category')} value={currentCat.name} />
              <MetaCell theme={theme} label={t('gear.spec.value')} value={yuanWithGap(itemP)} />
              <MetaCell theme={theme} label={t('gear.spec.status')} value={t(`gear.status.${itemStatus(currentItem)}` as any)} />
              {qty > 1 ? <MetaCell theme={theme} label={t('gear.spec.unitWeight')} value={fmtKg(unitW, weightUnit)} /> : <MetaCell theme={theme} label={t('gear.spec.unitValue')} value={yuanWithGap(unitP)} />}
            </>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {isEditing ? (
            <View style={{ width: '100%', minHeight: 96, paddingVertical: 14, paddingRight: 18 }}>
              <Text style={{ height: 20, fontSize: 15.5, lineHeight: 20, includeFontPadding: false, color: theme.text2 }}>{t('gear.section.note')}</Text>
              <TextInput
                value={currentItem.note || ''}
                onChangeText={(note) => patchDraft({ note })}
                placeholder={t('gear.editor.notePlaceholder')}
                placeholderTextColor={theme.text3}
                multiline
                scrollEnabled={false}
                style={{ width: '100%', minHeight: 60, marginTop: 8, padding: 0, fontSize: 13, lineHeight: 20, fontWeight: '700', includeFontPadding: false, color: theme.text, textAlignVertical: 'top' }}
              />
            </View>
          ) : <NoteCell theme={theme} label={t('gear.section.note')} value={currentItem.note} />}
        </View>

        <View style={{ marginTop: 26, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: theme.text3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {`${t('gear.section.customAttrs')}${primaryAttrs.length > 0 ? ' · ' + primaryAttrs.length : ''}`}
            </Text>
            {isEditing ? (
              <Press onPress={() => patchDraft({ attrs: [...primaryAttrs, ['', '']] })} style={{ minHeight: 36, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.fieldSurface }}>
                <Icon name="plus" color={theme.accent} size={15} strokeWidth={2.2} />
                <Text style={{ marginLeft: space.xs, fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('gear.editor.addAttr')}</Text>
              </Press>
            ) : null}
          </View>
        </View>
        {isEditing ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {primaryAttrs.map(([key, value], index) => (
              <View key={index} style={{ width: customAttrCardWidth, minHeight: 84, paddingHorizontal: space.sm, paddingVertical: space.sm, paddingRight: space.xl, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
                <Press onPress={() => patchDraft({ attrs: primaryAttrs.filter((_, entryIndex) => entryIndex !== index) })} hitSlop={8} style={{ position: 'absolute', right: space.xs, top: space.xs, zIndex: 1, padding: space.xxs }}>
                  <Icon name="close" color={theme.text3} size={13} />
                </Press>
                <TextInput
                  value={key}
                  onChangeText={(nextKey) => patchDraft({ attrs: primaryAttrs.map((entry, entryIndex) => entryIndex === index ? [nextKey, entry[1]] : entry) })}
                  placeholder={t('gear.editor.attrNamePlaceholder')}
                  placeholderTextColor={theme.text3}
                  style={{ padding: 0, paddingRight: space.xs, fontSize: 14, fontWeight: '600', color: theme.text2 }}
                />
                <TextInput
                  value={value}
                  onChangeText={(nextValue) => patchDraft({ attrs: primaryAttrs.map((entry, entryIndex) => entryIndex === index ? [entry[0], nextValue] : entry) })}
                  placeholder={t('gear.editor.attrValuePlaceholder')}
                  placeholderTextColor={theme.text3}
                  multiline
                  style={{ minHeight: 30, marginTop: space.xs, padding: 0, fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: theme.text, textAlignVertical: 'top' }}
                />
              </View>
            ))}
            {primaryAttrs.length === 0 ? (
              <View style={{ width: '100%', paddingHorizontal: space.md, paddingVertical: space.lg, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: theme.text3 }}>暂无自定义属性，点击右侧添加</Text>
              </View>
            ) : null}
          </View>
        ) : primaryAttrs.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {primaryAttrs.map(([key, value], index) => (
              <MetaCell key={`${key}-${index}`} theme={theme} label={key} value={value} />
            ))}
          </View>
        ) : (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 13.5, color: theme.text3 }}>暂无自定义属性</Text>
          </View>
        )}

        {/* 库内占比 */}
        <AppSectionHeader theme={theme} text={t('gear.section.libraryShare')} marginTop={32} />
        <View style={{ paddingTop: 2 }}>
          <ShareBar theme={theme} label={t('gear.share.weightInCat')} pct={(itemW / catW) * 100} sub={`${currentCat.name} ${catItems.length} ${t('gear.unit.items')}`} color={currentCat.color} />
          <ShareBar theme={theme} label={t('gear.share.weightInAll')} pct={(itemW / totalW) * 100} sub={t('gear.share.subAllWeight', { value: fmtWeight(totalW, weightUnit, true) })} color={theme.text2} />
          <ShareBar theme={theme} label={t('gear.share.valueInAll')} pct={(itemP / totalP) * 100} sub={t('gear.share.subAllValue', { value: yuanWithGap(totalP) })} color={theme.text2} last />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Text style={{ fontSize: 13, color: theme.text2 }}>{t('gear.share.weightRank')}</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: '700', color: theme.text }}>{t('gear.share.rankValue', { rank: wRank, total: catItems.length })}</Text>
          </View>
        </View>

        {/* 所属清单 */}
        <AppSectionHeader theme={theme} text={`${t('gear.section.memberSets')}${memberSetRows.length > 0 ? ' · ' + memberSetRows.length : ''}`} marginTop={32} />
        {memberSetRows.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 13.5, color: theme.text3 }}>{t('gear.itemDetail.noMemberSets')}</Text>
          </View>
        ) : (
          <View>
            {memberSetRows.map(({ set: memberSet, count, weight }) => {
              const weightParts = splitWeight(weight, weightUnit, true);
              return (
                <Press
                  key={memberSet.id}
                  onPress={() => onOpenSet(memberSet)}
                  style={{ minHeight: 104, marginBottom: 10, paddingHorizontal: 17, paddingVertical: 15, borderRadius: 22, justifyContent: 'space-between', backgroundColor: softBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: softBorder(theme) }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text numberOfLines={2} style={{ flex: 1, fontSize: 15.5, lineHeight: 21, fontWeight: '700', color: theme.text }}>{memberSet.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 14 }}>
                    <View accessible accessibilityLabel={`${t('gear.stat.totalWeight')} ${weightParts.value} ${weightParts.unit}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Weight color={theme.text2} size={17} strokeWidth={1.8} />
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: '800', color: theme.text }}>{weightParts.value}</Text>
                        <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text2 }}>{weightParts.unit}</Text>
                      </View>
                    </View>
                    <View accessible accessibilityLabel={`${t('gear.stat.itemCount')} ${count}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Package color={theme.text2} size={17} strokeWidth={1.8} />
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: '800', color: theme.text }}>{count}</Text>
                        <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text2 }}>{t('gear.unit.items')}</Text>
                      </View>
                    </View>
                  </View>
                </Press>
              );
            })}
          </View>
        )}

      </View>
      {pickerField === 'category' ? (
        <GearWheelSelectSheet
          theme={theme}
          title={t('gear.spec.category')}
          value={currentItem.cat}
          data={cats.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
          onClose={() => setPickerField(null)}
          onConfirm={(cat) => {
            patchDraft({ cat });
            setPickerField(null);
          }}
        />
      ) : null}
      {pickerField === 'status' ? (
        <GearWheelSelectSheet
          theme={theme}
          title={t('gear.spec.status')}
          value={itemStatus(currentItem)}
          data={(['packed', 'worn', 'consumable', 'optional'] as const).map((status) => ({ value: status, label: t(`gear.status.${status}` as any) }))}
          onClose={() => setPickerField(null)}
          onConfirm={(status) => {
            patchDraft({ status: status as GearItem['status'] });
            setPickerField(null);
          }}
        />
      ) : null}
    </DetailPage>
  );
}

export const GearItemDetail = React.memo(GearItemDetailView, (previous, next) => (
  previous.theme === next.theme
  && previous.item === next.item
  && previous.cats === next.cats
  && previous.allItems === next.allItems
  && previous.sets === next.sets
  && previous.weightUnit === next.weightUnit
));
