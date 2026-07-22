// GearItemDetail.tsx — 装备详情. A calm, airy detail layout inspired by modern
// gear-library apps: floating chrome, centered product photo, generous whitespace,
// soft stat tiles, icon-led metadata, then secondary library context.
import React from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, useWindowDimensions, Modal, Pressable, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet, itemStatus, itemWeight, itemPrice, WeightUnit, splitWeight, fmtWeight, convertWeight } from '../../data/gear';
import { GearPushPage, GearCard, GearItemImage, SectionLabel, ShareBar, CircleBtn, yuan, fmtKg, useGearPushScroll } from './parts';

const softBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
const softBorder = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.035)');
const pageBg = (t: Theme) => (t.dark ? t.bg : '#FFFFFF');
const STATUS_OPTIONS: NonNullable<GearItem['status']>[] = ['packed', 'worn', 'consumable', 'optional'];

function StatTile({ theme, label, value, unit, onPress, editing, editValue, onChangeText, onSubmit }: { theme: Theme; label: string; value: string; unit?: string; onPress?: () => void; editing?: boolean; editValue?: string; onChangeText?: (value: string) => void; onSubmit?: () => void }) {
  const content = (
    <View style={{ flex: 1, minHeight: 104, borderRadius: 24, backgroundColor: softBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: softBorder(theme), paddingHorizontal: 20, paddingVertical: 17, justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 15, color: theme.text2, letterSpacing: -0.1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        {editing ? (
          <TextInput
            autoFocus
            selectTextOnFocus
            value={editValue}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            onBlur={onSubmit}
            keyboardType="decimal-pad"
            style={{ minWidth: 54, padding: 0, fontSize: 25, lineHeight: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.7 }}
          />
        ) : (
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 25, lineHeight: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.7 }}>{value}</Text>
        )}
        {unit ? <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{unit}</Text> : null}
      </View>
    </View>
  );
  return onPress ? <Press onPress={onPress} style={{ flex: 1 }}>{content}</Press> : content;
}

function MetaCell({ theme, label, value, muted, fullWidth, multiline, scrollOnFocus, onPress, onLongPress, editing, editValue, onChangeText, onSubmit, keyboardType = 'decimal-pad' }: { theme: Theme; label: string; value?: string; muted?: boolean; fullWidth?: boolean; multiline?: boolean; scrollOnFocus?: boolean; onPress?: () => void; onLongPress?: () => void; editing?: boolean; editValue?: string; onChangeText?: (value: string) => void; onSubmit?: () => void; keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'] }) {
  const hasValue = !!value;
  const longPressed = React.useRef(false);
  const scroll = useGearPushScroll();
  const cellWidth = fullWidth ? '100%' : '50%';
  const interactive = !!(onPress || onLongPress);
  const content = (
    <View style={{ width: interactive ? '100%' : cellWidth, paddingVertical: 14, paddingRight: 18 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15.5, color: hasValue ? theme.text2 : theme.text3, textAlign: 'left' }}>{label}</Text>
        {editing ? (
          <TextInput
            autoFocus
            selectTextOnFocus
            value={editValue}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            onBlur={onSubmit}
            onFocus={() => {
              if (scrollOnFocus) setTimeout(() => scroll?.scrollBy(140), 260);
            }}
            keyboardType={keyboardType}
            multiline={multiline}
            style={{ alignSelf: 'stretch', width: '100%', marginTop: 8, padding: 0, fontSize: 13, lineHeight: multiline ? 19 : undefined, fontWeight: '700', color: theme.text, minHeight: multiline ? 40 : undefined, textAlign: 'left', textAlignVertical: multiline ? 'top' : undefined }}
          />
        ) : hasValue ? <Text numberOfLines={multiline ? undefined : 1} style={{ marginTop: 8, fontSize: 13, lineHeight: multiline ? 20 : undefined, fontWeight: '700', color: muted ? theme.text3 : theme.text, textAlign: 'left' }}>{value}</Text> : null}
      </View>
    </View>
  );
  return interactive ? (
    <Press
      onPress={() => {
        if (!longPressed.current) onPress?.();
      }}
      onLongPress={() => {
        longPressed.current = true;
        onLongPress?.();
      }}
      onPressOut={() => {
        longPressed.current = false;
      }}
      style={{ width: cellWidth }}
    >
      {content}
    </Press>
  ) : content;
}

function NoteCell({ theme, label, value, editing, editValue, onPress, onChangeText, onSubmit }: { theme: Theme; label: string; value?: string; editing?: boolean; editValue?: string; onPress: () => void; onChangeText?: (value: string) => void; onSubmit?: () => void }) {
  const pageScroll = useGearPushScroll();
  return (
    <Press onPress={onPress} style={{ width: '100%' }}>
      <View style={{ width: '100%', paddingVertical: 14, paddingRight: 18 }}>
        <Text style={{ fontSize: 15.5, color: value ? theme.text2 : theme.text3, textAlign: 'left' }}>{label}</Text>
        <View style={{ marginTop: 3, minHeight: 40 }}>
          {editing ? (
            <TextInput
              autoFocus
              selectTextOnFocus
              value={editValue}
              onChangeText={onChangeText}
              onSubmitEditing={onSubmit}
              onBlur={onSubmit}
              onFocus={() => setTimeout(() => pageScroll?.scrollBy(140), 260)}
              multiline
              style={{ width: '100%', alignSelf: 'stretch', padding: 0, fontSize: 13, lineHeight: 19, fontWeight: '700', color: theme.text, textAlign: 'left', textAlignVertical: 'top', minHeight: 40 }}
            />
          ) : (
            <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: value ? theme.text : theme.text3, textAlign: 'left' }}>
              {value || '暂无备注'}
            </Text>
          )}
        </View>
      </View>
    </Press>
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

function GearPhotoViewer({
  theme,
  item,
  index,
  onClose,
  onPhotosChange,
}: {
  theme: Theme;
  item: GearItem;
  index: number;
  onClose: () => void;
  onPhotosChange?: (photos: string[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const photos = (item.photos || []).filter(Boolean);
  const pages = photos.length ? photos : [null];
  const initialIndex = Math.min(index, pages.length - 1);
  const listRef = React.useRef<FlatList<string | null>>(null);
  const [page, setPage] = React.useState(initialIndex);
  const fade = React.useRef(new Animated.Value(0)).current;
  const controlsBottom = Math.max(insets.bottom, 14) + 4;
  const imageTop = insets.top + 52;
  const imageBottom = controlsBottom + 58;
  const imageHeight = Math.max(1, height - imageTop - imageBottom);

  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  const addFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 9,
      quality: 0.85,
    });
    if (!result.canceled) onPhotosChange?.([...photos, ...result.assets.map((asset) => asset.uri)]);
  };

  const addFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) onPhotosChange?.([...photos, result.assets[0].uri]);
  };

  const removeCurrent = () => {
    if (!photos[page]) return;
    const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== page);
    const nextPage = Math.min(page, Math.max(0, nextPhotos.length - 1));
    setPage(nextPage);
    onPhotosChange?.(nextPhotos);
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: nextPage, animated: false }));
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.94)', opacity: fade }]}>
        <FlatList
          ref={listRef}
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
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 24,
            paddingBottom: controlsBottom,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <Press onPress={addFromLibrary} style={{ height: 48, borderRadius: 24, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FB' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#202124' }}>相册</Text>
          </Press>
          <Press onPress={addFromCamera} style={{ height: 48, borderRadius: 24, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FB' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#202124' }}>拍摄</Text>
          </Press>
          {photos[page] ? (
            <Press onPress={removeCurrent} style={{ height: 48, borderRadius: 24, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FB' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.danger ?? '#FF5A7A' }}>删除</Text>
            </Press>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

function WheelSelectSheet({
  theme,
  title,
  data,
  value,
  onClose,
  onConfirm,
}: {
  theme: Theme;
  title: string;
  data: { value: string; label: string }[];
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = React.useState(value);

  React.useEffect(() => {
    setSelected(value);
  }, [value]);

  const finish = () => {
    const next = selected;
    onClose();
    requestAnimationFrame(() => onConfirm(next));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
        <View style={{ minHeight: 280, backgroundColor: theme.dark ? theme.bg : '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 14, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, opacity: 0.45, marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 }}>
          <Pressable onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2 }}>{'取消'}</Text>
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{title}</Text>
          <Pressable onPress={finish} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>{'完成'}</Text>
          </Pressable>
          </View>
          <View style={{ height: 200, overflow: 'hidden', alignItems: 'center', marginTop: 10, marginBottom: 8 }}>
            <WheelPicker
              data={data}
              value={selected}
              onValueChanging={() => { Haptics.selectionAsync(); }}
              onValueChanged={({ item }) => setSelected(String(item.value))}
              itemHeight={40}
              visibleItemCount={5}
              width={220}
              enableScrollByTapOnItem
              itemTextStyle={{ fontSize: 18, fontWeight: '500', color: theme.text }}
              overlayItemStyle={{ backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)', borderRadius: 10 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function GearItemDetailView({
  theme,
  item,
  cat,
  cats,
  allItems,
  sets,
  weightUnit = 'kg',
  onBack,
  onOpenSet,
  onDelete,
  onPhotosChange,
  onInlineChange,
}: {
  theme: Theme;
  item: GearItem;
  cat: GearCat;
  cats: GearCat[];
  allItems: GearItem[];
  sets: GearSet[];
  weightUnit?: WeightUnit;
  onBack: () => void;
  onOpenSet: (s: GearSet) => void;
  onDelete: () => void;
  onPhotosChange?: (photos: string[]) => void;
  onInlineChange?: (patch: Partial<GearItem>) => void;
}) {
  const nav = useNav();
  const { t } = useI18n();
  const qty = item.qty || 1;
  const unitW = item.w;
  const unitP = item.p;
  const itemW = itemWeight(item);
  const itemP = itemPrice(item);

  // ── real library context ──────────────────────────────────────────────────
  const libraryContext = React.useMemo(() => {
    const catItems = allItems.filter((it) => it.cat === item.cat);
    return {
      totalW: allItems.reduce((a, it) => a + itemWeight(it), 0) || itemW,
      totalP: allItems.reduce((a, it) => a + itemPrice(it), 0) || itemP,
      catItems,
      catW: catItems.reduce((a, it) => a + itemWeight(it), 0) || itemW,
      wRank: catItems.slice().sort((a, b) => itemWeight(b) - itemWeight(a)).findIndex((it) => it.name === item.name) + 1,
    };
  }, [allItems, item.cat, item.name, itemP, itemW]);
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

  const confirmDelete = () =>
    nav.openActionSheet({
      title: t('gear.itemDetail.deleteConfirmTitle', { name: item.name }),
      message: t('gear.itemDetail.deleteConfirmMessage'),
      items: [{ label: t('gear.itemDetail.deleteItem'), icon: 'trash', destructive: true, onPress: onDelete }],
    });
  const primaryAttrs = item.attrs || [];
  const weightMain = splitWeight(itemW, weightUnit);
  const [photoViewerIndex, setPhotoViewerIndex] = React.useState<number | null>(null);
  const [editingField, setEditingField] = React.useState<'name' | 'weight' | 'qty' | 'price' | 'status' | 'note' | null>(null);
  const [editingAttrIndex, setEditingAttrIndex] = React.useState<number | null>(null);
  const [addingAttr, setAddingAttr] = React.useState(false);
  const [draftAttrKey, setDraftAttrKey] = React.useState('');
  const [draftValue, setDraftValue] = React.useState('');
  const [editingWeightUnit, setEditingWeightUnit] = React.useState<WeightUnit>(weightUnit);
  const [pickerField, setPickerField] = React.useState<'status' | 'category' | null>(null);

  const beginEdit = (field: typeof editingField, value: string) => {
    setEditingAttrIndex(null);
    setEditingField(field);
    if (field === 'weight') setEditingWeightUnit(weightUnit);
    setDraftValue(value);
  };
  const finishEdit = () => {
    if (!editingField) return;
    const field = editingField;
    if (field === 'weight') {
      const displayedTotalKg = weightUnit === 'kg'
        ? Number(draftValue) || 0
        : (Number(draftValue) || 0) / (editingWeightUnit === 'g' ? 1000 : editingWeightUnit === 'oz' ? 35.27396195 : 2.2046226218);
      onInlineChange?.({ w: displayedTotalKg / qty });
    }
    if (field === 'qty') onInlineChange?.({ qty: Math.max(1, Number(draftValue) || 1) });
    if (field === 'price') onInlineChange?.({ p: Number(draftValue) || 0 });
    if (field === 'note') onInlineChange?.({ note: draftValue.trim() || undefined });
    if (field === 'name' && draftValue.trim()) onInlineChange?.({ name: draftValue.trim() });
    setEditingField(null);
  };
  const beginAttrEdit = (index: number, value: string) => {
    setEditingField(null);
    setAddingAttr(false);
    setEditingAttrIndex(index);
    setDraftValue(value);
  };
  const finishAttrEdit = () => {
    if (editingAttrIndex === null) return;
    const attrs: [string, string][] = (item.attrs || [])
      .map(([key, value], index): [string, string] => (
        index === editingAttrIndex ? [key, draftValue.trim()] : [key, value]
      ))
      .filter(([key, value]) => key.trim() && value.trim());
    onInlineChange?.({ attrs: attrs.length ? attrs : undefined });
    setEditingAttrIndex(null);
  };
  const beginAddAttr = () => {
    setEditingField(null);
    setEditingAttrIndex(null);
    setDraftAttrKey('');
    setDraftValue('');
    setAddingAttr(true);
  };
  const finishAddAttr = () => {
    const key = draftAttrKey.trim();
    const value = draftValue.trim();
    if (!key || !value) return;
    onInlineChange?.({ attrs: [...(item.attrs || []), [key, value]] });
    setAddingAttr(false);
    setDraftAttrKey('');
    setDraftValue('');
  };
  const cancelAddAttr = () => {
    setAddingAttr(false);
    setDraftAttrKey('');
    setDraftValue('');
  };
  const deleteAttr = (index: number) => {
    const attr = item.attrs?.[index];
    if (!attr) return;
    nav.openActionSheet({
      title: attr[0],
      message: '删除后无法恢复',
      items: [{
        label: '删除属性',
        icon: 'trash',
        destructive: true,
        onPress: () => {
          const attrs = (item.attrs || []).filter((_, attrIndex) => attrIndex !== index);
          onInlineChange?.({ attrs: attrs.length ? attrs : undefined });
          if (editingAttrIndex === index) setEditingAttrIndex(null);
        },
      }],
    });
  };

  return (
    <GearPushPage
      theme={theme}
      onBack={onBack}
      right={<CircleBtn theme={theme} name="trash" danger onPress={confirmDelete} softShadow size={44} />}
      overlay={photoViewerIndex !== null ? (
        <GearPhotoViewer
          theme={theme}
          item={item}
          index={photoViewerIndex}
          onClose={() => setPhotoViewerIndex(null)}
          onPhotosChange={onPhotosChange}
        />
      ) : null}
    >
      <View style={{ paddingHorizontal: 32, paddingTop: 8 }}>
        {/* spacious product header */}
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 18 }}>
          <GearGallery theme={theme} item={item} onOpenPhoto={setPhotoViewerIndex} />

          {editingField === 'name' ? (
            <TextInput
              autoFocus
              selectTextOnFocus
              value={draftValue}
              onChangeText={setDraftValue}
              onSubmitEditing={finishEdit}
              onBlur={finishEdit}
              returnKeyType="done"
              style={{ marginTop: 28, alignSelf: 'stretch', padding: 0, fontSize: 25, fontWeight: '800', color: theme.text, letterSpacing: -0.6, lineHeight: 32 }}
            />
          ) : (
            <Press onLongPress={() => beginEdit('name', item.name)} style={{ marginTop: 28, alignSelf: 'stretch' }}>
              <Text style={{ fontSize: 25, fontWeight: '800', color: theme.text, letterSpacing: -0.6, lineHeight: 32 }} numberOfLines={2}>
                {item.name}
              </Text>
            </Press>
          )}
        </View>

        {/* key facts, large breathing-room cards */}
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 4 }}>
          <StatTile
            theme={theme}
            label={t('gear.spec.totalWeight')}
            value={weightMain.value}
            unit={editingField === 'weight' ? editingWeightUnit : weightMain.unit}
            onPress={() => beginEdit('weight', String(weightUnit === 'kg' ? itemW : convertWeight(itemW, weightUnit)))}
            editing={editingField === 'weight'}
            editValue={draftValue}
            onChangeText={setDraftValue}
            onSubmit={finishEdit}
          />
          <StatTile
            theme={theme}
            label={t('gear.spec.qty')}
            value={String(qty)}
            onPress={() => beginEdit('qty', String(qty))}
            editing={editingField === 'qty'}
            editValue={draftValue}
            onChangeText={setDraftValue}
            onSubmit={finishEdit}
          />
        </View>
        {editingField === 'weight' ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingHorizontal: 6 }}>
            {(['kg', 'g', 'oz', 'lb'] as WeightUnit[]).map((unit) => (
              <Press
                key={unit}
                onPress={() => {
                  const currentKg = editingWeightUnit === 'kg'
                    ? Number(draftValue) || 0
                    : (Number(draftValue) || 0) / (editingWeightUnit === 'g' ? 1000 : editingWeightUnit === 'oz' ? 35.27396195 : 2.2046226218);
                  setEditingWeightUnit(unit);
                  setDraftValue(String(convertWeight(currentKg, unit)));
                }}
                style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: editingWeightUnit === unit ? theme.accentSoft : softBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: editingWeightUnit === unit ? theme.accent : theme.hairline }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: editingWeightUnit === unit ? '700' : '500', color: editingWeightUnit === unit ? theme.accent : theme.text2 }}>{unit}</Text>
              </Press>
            ))}
          </View>
        ) : null}
        {/* icon metadata */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 42 }}>
          <MetaCell theme={theme} label={t('gear.spec.category')} value={cat.name} onPress={() => setPickerField('category')} />
          <MetaCell theme={theme} label={t('gear.spec.value')} value={yuan(itemP)} onPress={() => beginEdit('price', String(item.p))} editing={editingField === 'price'} editValue={draftValue} onChangeText={setDraftValue} onSubmit={finishEdit} />
          <MetaCell theme={theme} label={t('gear.spec.status')} value={t(`gear.status.${itemStatus(item)}` as any)} onPress={() => setPickerField('status')} />
          {qty > 1 ? <MetaCell theme={theme} label={t('gear.spec.unitWeight')} value={fmtKg(unitW, weightUnit)} /> : <MetaCell theme={theme} label={t('gear.spec.unitValue')} value={yuan(unitP)} />}
        </View>
        {editingField === 'status' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {(['packed', 'worn', 'consumable', 'optional'] as const).map((status) => (
              <Press
                key={status}
                onPress={() => {
                  onInlineChange?.({ status });
                  setEditingField(null);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: itemStatus(item) === status ? theme.accentSoft : softBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: itemStatus(item) === status ? theme.accent : theme.hairline }}
              >
                <Text style={{ fontSize: 13, color: itemStatus(item) === status ? theme.accent : theme.text2 }}>{t(`gear.status.${status}` as any)}</Text>
              </Press>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <NoteCell
            theme={theme}
            label={t('gear.section.note')}
            value={item.note}
            editing={editingField === 'note'}
            editValue={draftValue}
            onPress={() => beginEdit('note', item.note || '')}
            onChangeText={setDraftValue}
            onSubmit={finishEdit}
          />
        </View>

        <>
          <View style={{ marginTop: 26, marginBottom: 8 }}>
            <Press onPress={beginAddAttr} hitSlop={8} style={{ paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {`${t('gear.section.customAttrs')}${primaryAttrs.length > 0 ? ' · ' + primaryAttrs.length : ''}`}
              </Text>
            </Press>
          </View>
          {primaryAttrs.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {primaryAttrs.map(([k, v], i) => (
                <MetaCell
                  key={`${k}-${i}`}
                  theme={theme}
                  label={k}
                  value={v}
                  onPress={() => beginAttrEdit(i, v)}
                  onLongPress={() => deleteAttr(i)}
                  editing={editingAttrIndex === i}
                  editValue={editingAttrIndex === i ? draftValue : v}
                  onChangeText={setDraftValue}
                  onSubmit={finishAttrEdit}
                  keyboardType="default"
                  scrollOnFocus
                />
              ))}
            </View>
          ) : (
            <Press onPress={beginAddAttr} style={{ paddingVertical: 12 }}>
              <Text style={{ fontSize: 13.5, color: theme.text3 }}>暂无自定义属性，点击添加</Text>
            </Press>
          )}
        </>

        {/* 库内占比 */}
        <SectionLabel theme={theme} text={t('gear.section.libraryShare')} marginTop={32} />
        <View style={{ paddingTop: 2 }}>
          <ShareBar theme={theme} label={t('gear.share.weightInCat')} pct={(itemW / catW) * 100} sub={`${cat.name} ${catItems.length} ${t('gear.unit.items')}`} color={cat.color} />
          <ShareBar theme={theme} label={t('gear.share.weightInAll')} pct={(itemW / totalW) * 100} sub={t('gear.share.subAllWeight', { value: fmtWeight(totalW, weightUnit, true) })} color={theme.text2} />
          <ShareBar theme={theme} label={t('gear.share.valueInAll')} pct={(itemP / totalP) * 100} sub={t('gear.share.subAllValue', { value: yuan(totalP) })} color={theme.text2} last />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Text style={{ fontSize: 13, color: theme.text2 }}>{t('gear.share.weightRank')}</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: '700', color: theme.text }}>{t('gear.share.rankValue', { rank: wRank, total: catItems.length })}</Text>
          </View>
        </View>

        {/* 所属清单 */}
        <SectionLabel theme={theme} text={`${t('gear.section.memberSets')}${memberSetRows.length > 0 ? ' · ' + memberSetRows.length : ''}`} marginTop={32} />
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
      {addingAttr ? (
        <Modal visible transparent animationType="fade" onRequestClose={cancelAddAttr}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable onPress={cancelAddAttr} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
            <View style={{ backgroundColor: theme.dark ? theme.bg : '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 12 }}>
              <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, opacity: 0.45, marginBottom: 16 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <Press onPress={cancelAddAttr} hitSlop={8} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14.5, color: theme.text2 }}>{'取消'}</Text>
                </Press>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('gear.editor.addAttr')}</Text>
                <Press onPress={finishAddAttr} disabled={!draftAttrKey.trim() || !draftValue.trim()} hitSlop={8} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '700', color: draftAttrKey.trim() && draftValue.trim() ? theme.accent : theme.text3 }}>{'完成'}</Text>
                </Press>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  autoFocus
                  value={draftAttrKey}
                  onChangeText={setDraftAttrKey}
                  placeholder={t('gear.editor.attrNamePlaceholder')}
                  placeholderTextColor={theme.text3}
                  returnKeyType="next"
                  style={{ flex: 0.8, height: 44, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 10, backgroundColor: softBg(theme), fontSize: 14.5, lineHeight: 20, includeFontPadding: false, color: theme.text, textAlignVertical: 'center' }}
                />
                <TextInput
                  value={draftValue}
                  onChangeText={setDraftValue}
                  onSubmitEditing={finishAddAttr}
                  placeholder={t('gear.editor.attrValuePlaceholder')}
                  placeholderTextColor={theme.text3}
                  style={{ flex: 1.2, height: 44, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 10, backgroundColor: softBg(theme), fontSize: 14.5, lineHeight: 20, includeFontPadding: false, color: theme.text, textAlignVertical: 'center' }}
                />
              </View>
            </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
      {pickerField === 'category' ? (
        <WheelSelectSheet
          theme={theme}
          title={t('gear.spec.category')}
          value={item.cat}
          data={cats.map((c) => ({ value: c.id, label: c.name }))}
          onClose={() => setPickerField(null)}
          onConfirm={(next) => {
            setPickerField(null);
            onInlineChange?.({ cat: next });
          }}
        />
      ) : null}
      {pickerField === 'status' ? (
        <WheelSelectSheet
          theme={theme}
          title={t('gear.spec.status')}
          value={itemStatus(item)}
          data={STATUS_OPTIONS.map((s) => ({ value: s, label: t(`gear.status.${s}` as any) }))}
          onClose={() => setPickerField(null)}
          onConfirm={(next) => {
            setPickerField(null);
            onInlineChange?.({ status: next as GearItem['status'] });
          }}
        />
      ) : null}
    </GearPushPage>
  );
}

export const GearItemDetail = React.memo(GearItemDetailView, (previous, next) => (
  previous.theme === next.theme
  && previous.item === next.item
  && previous.cat === next.cat
  && previous.cats === next.cats
  && previous.allItems === next.allItems
  && previous.sets === next.sets
  && previous.weightUnit === next.weightUnit
));
