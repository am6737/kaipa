// GearItemDetail.tsx — 装备详情. A calm, airy detail layout inspired by modern
// gear-library apps: floating chrome, centered product photo, generous whitespace,
// soft stat tiles, icon-led metadata, then secondary library context.
import React from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions, Modal, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet, itemStatus, itemWeight, itemPrice, WeightUnit, splitWeight, fmtWeight } from '../../data/gear';
import { GearItemImage, ShareBar, yuan, fmtKg } from './parts';
import { AppIconButton, AppSectionHeader, DetailPage } from '../../design-system';
import { GearDeleteDialog } from './GearDeleteDialog';

const softBg = (t: Theme) => t.fieldSurface;
const softBorder = (t: Theme) => t.fieldBorder;
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

function MetaCell({ theme, label, value, muted, fullWidth, multiline }: { theme: Theme; label: string; value?: string; muted?: boolean; fullWidth?: boolean; multiline?: boolean }) {
  const hasValue = !!value;
  return (
    <View style={{ width: fullWidth ? '100%' : '50%', paddingVertical: 14, paddingRight: 18 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15.5, color: hasValue ? theme.text2 : theme.text3, textAlign: 'left' }}>{label}</Text>
        {hasValue ? <Text numberOfLines={multiline ? undefined : 1} style={{ marginTop: 8, fontSize: 13, lineHeight: multiline ? 20 : undefined, fontWeight: '700', color: muted ? theme.text3 : theme.text, textAlign: 'left' }}>{value}</Text> : null}
      </View>
    </View>
  );
}

function NoteCell({ theme, label, value }: { theme: Theme; label: string; value?: string }) {
  return (
    <View style={{ width: '100%', paddingVertical: 14, paddingRight: 18 }}>
      <Text style={{ fontSize: 15.5, color: value ? theme.text2 : theme.text3, textAlign: 'left' }}>{label}</Text>
      <View style={{ marginTop: 3, minHeight: 40 }}>
        <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: value ? theme.text : theme.text3, textAlign: 'left' }}>
          {value || '暂无备注'}
        </Text>
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

function GearItemDetailView({
  theme,
  item,
  cat,
  allItems,
  sets,
  weightUnit = 'kg',
  onBack,
  onOpenSet,
  onEdit,
  onDelete,
}: {
  theme: Theme;
  item: GearItem;
  cat: GearCat;
  allItems: GearItem[];
  sets: GearSet[];
  weightUnit?: WeightUnit;
  onBack: () => void;
  onOpenSet: (s: GearSet) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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

  const primaryAttrs = item.attrs || [];
  const weightMain = splitWeight(itemW, weightUnit);
  const [photoViewerIndex, setPhotoViewerIndex] = React.useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  return (
    <DetailPage
      theme={theme}
      onBack={onBack}
      right={(
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <AppIconButton theme={theme} name="edit" onPress={onEdit} softShadow size={44} />
          <AppIconButton theme={theme} name="trash" danger onPress={() => setDeleteDialogOpen(true)} softShadow size={44} />
        </View>
      )}
      overlay={(
        <>
          {photoViewerIndex !== null ? (
            <GearPhotoViewer
              theme={theme}
              item={item}
              index={photoViewerIndex}
              onClose={() => setPhotoViewerIndex(null)}
            />
          ) : null}
          <GearDeleteDialog
            theme={theme}
            visible={deleteDialogOpen}
            title={t('gear.itemDetail.deleteConfirmTitle', { name: item.name })}
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
          <GearGallery theme={theme} item={item} onOpenPhoto={setPhotoViewerIndex} />

          <Text style={{ marginTop: 28, alignSelf: 'stretch', fontSize: 25, fontWeight: '800', color: theme.text, letterSpacing: -0.6, lineHeight: 32 }} numberOfLines={2}>
            {item.name}
          </Text>
        </View>

        {/* key facts, large breathing-room cards */}
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 4 }}>
          <StatTile
            theme={theme}
            label={t('gear.spec.totalWeight')}
            value={weightMain.value}
            unit={weightMain.unit}
          />
          <StatTile
            theme={theme}
            label={t('gear.spec.qty')}
            value={String(qty)}
          />
        </View>
        {/* icon metadata */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 42 }}>
          <MetaCell theme={theme} label={t('gear.spec.category')} value={cat.name} />
          <MetaCell theme={theme} label={t('gear.spec.value')} value={yuan(itemP)} />
          <MetaCell theme={theme} label={t('gear.spec.status')} value={t(`gear.status.${itemStatus(item)}` as any)} />
          {qty > 1 ? <MetaCell theme={theme} label={t('gear.spec.unitWeight')} value={fmtKg(unitW, weightUnit)} /> : <MetaCell theme={theme} label={t('gear.spec.unitValue')} value={yuan(unitP)} />}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <NoteCell theme={theme} label={t('gear.section.note')} value={item.note} />
        </View>

        <View style={{ marginTop: 26, marginBottom: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text3, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {`${t('gear.section.customAttrs')}${primaryAttrs.length > 0 ? ' · ' + primaryAttrs.length : ''}`}
          </Text>
        </View>
        {primaryAttrs.length > 0 ? (
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
          <ShareBar theme={theme} label={t('gear.share.weightInCat')} pct={(itemW / catW) * 100} sub={`${cat.name} ${catItems.length} ${t('gear.unit.items')}`} color={cat.color} />
          <ShareBar theme={theme} label={t('gear.share.weightInAll')} pct={(itemW / totalW) * 100} sub={t('gear.share.subAllWeight', { value: fmtWeight(totalW, weightUnit, true) })} color={theme.text2} />
          <ShareBar theme={theme} label={t('gear.share.valueInAll')} pct={(itemP / totalP) * 100} sub={t('gear.share.subAllValue', { value: yuan(totalP) })} color={theme.text2} last />
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
    </DetailPage>
  );
}

export const GearItemDetail = React.memo(GearItemDetailView, (previous, next) => (
  previous.theme === next.theme
  && previous.item === next.item
  && previous.cat === next.cat
  && previous.allItems === next.allItems
  && previous.sets === next.sets
  && previous.weightUnit === next.weightUnit
));
