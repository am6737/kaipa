import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JapaneseYen, Package, Weight } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GEAR_STATUS, GearCarryStatus } from '../../data/gear';
import { GearItemImage, CircleBtn } from './parts';
import { AppSectionHeader, DetailPage, radius, space, type } from '../../design-system';
import { GearWheelSelectSheet } from './GearWheelSelectSheet';
import { useNav } from '../../nav/NavContext';

const numClean = (value: string) => value.replace(/[^0-9.]/g, '');
const pageBg = (theme: Theme) => (theme.dark ? '#1C1C1E' : '#F4F4F5');
const cardBg = (theme: Theme) => (theme.dark ? '#000000' : '#FFFFFF');
const fieldBg = (theme: Theme) => (theme.dark ? '#1C1C1E' : '#F1F1F3');

export function GearItemEditor({ theme, item, cats, mode = 'edit', recognitionSource, existingNames = [], onCancel, onSave }: {
  theme: Theme;
  item: GearItem;
  cats: GearCat[];
  mode?: 'new' | 'edit';
  recognitionSource?: { label: string; url?: string };
  existingNames?: string[];
  onCancel: () => void;
  onSave: (next: GearItem) => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(width)).current;
  const [name, setName] = useState(item.name);
  const [cat, setCat] = useState(item.cat);
  const [w, setW] = useState(item.w != null && item.w !== 0 ? String(item.w) : '');
  const [p, setP] = useState(item.p != null && item.p !== 0 ? String(item.p) : '');
  const [qty, setQty] = useState(item.qty || 1);
  const [status, setStatus] = useState<GearCarryStatus>(item.status || 'packed');
  const [attrs, setAttrs] = useState<[string, string][]>((item.attrs || []).map(([key, value]) => [key, value]));
  const [note, setNote] = useState(item.note || '');
  const [photos, setPhotos] = useState((item.photos || []).filter(Boolean));
  const [openChoice, setOpenChoice] = useState<'category' | 'status' | null>(null);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const [recognitionNoticeVisible, setRecognitionNoticeVisible] = useState(!!recognitionSource);

  useEffect(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  }, [translateX]);

  const trimmed = name.trim();
  const duplicate = existingNames.includes(trimmed) && trimmed !== item.name;
  const valid = trimmed.length > 0 && !duplicate;
  const currentCategory = cats.find((candidate) => candidate.id === cat);
  const previewItem = { ...item, name, photos: photos.length ? photos : undefined };

  const setAttr = (index: number, column: 0 | 1, value: string) => {
    setAttrs((current) => current.map((entry, entryIndex) => entryIndex === index ? (column === 0 ? [value, entry[1]] : [entry[0], value]) : entry));
  };

  const submit = () => {
    if (!valid) return;
    const cleanAttrs = attrs.map(([key, value]) => [key.trim(), value.trim()] as [string, string]).filter(([key, value]) => key && value);
    onSave({
      ...item,
      name: trimmed,
      cat,
      w: Number(w) || 0,
      p: Number(p) || 0,
      qty: qty > 1 ? qty : undefined,
      status,
      photos: photos.length ? photos : undefined,
      attrs: cleanAttrs.length ? cleanAttrs : undefined,
      note: note.trim() || undefined,
    });
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      nav.showToast(t('gear.editor.libraryPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 9 - photos.length),
      quality: 0.85,
    });
    if (!result.canceled) setPhotos((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 9));
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      nav.showToast(t('gear.editor.cameraPermission'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) setPhotos((current) => [...current, result.assets[0].uri].slice(0, 9));
  };

  const openPhotoActions = () => setPhotoSourceOpen(true);

  if (mode === 'new') {
    return (
      <View style={{ flex: 1 }}>
        <DetailPage theme={theme} title={t('gear.add.title')} onBack={onCancel}>
          <View style={{ paddingHorizontal: space.xxl, paddingTop: space.xs }}>
            <View style={{ alignItems: 'center', paddingTop: space.xs, paddingBottom: space.lg }}>
              <AddGearPhotoGallery theme={theme} item={previewItem} photos={photos} onPress={openPhotoActions} />
              <TextInput
                autoFocus={!item.name}
                value={name}
                onChangeText={setName}
                placeholder={t('gear.editor.namePlaceholder')}
                placeholderTextColor={theme.text3}
                returnKeyType="done"
                style={[type.pageTitle, { alignSelf: 'stretch', marginTop: space.xl, padding: 0, color: theme.text, lineHeight: 32 }]}
              />
              {duplicate ? <Text style={{ alignSelf: 'stretch', marginTop: space.xs, fontSize: 12, color: theme.danger }}>{t('gear.editor.dupName')}</Text> : null}
            </View>

            {recognitionSource && recognitionNoticeVisible ? (
              <View style={{ marginBottom: space.lg, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.sm, borderRadius: radius.card, backgroundColor: theme.accentSofter, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Text style={[type.body, { flex: 1, paddingTop: space.xxs, lineHeight: 21, color: theme.text }]}>
                    {t('gear.editor.recognitionNotice', { source: recognitionSource.label })}
                  </Text>
                  <Press
                    onPress={() => setRecognitionNoticeVisible(false)}
                    accessibilityLabel={t('gear.editor.dismissRecognitionNotice')}
                    hitSlop={4}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="close" color={theme.text2} size={15} />
                  </Press>
                </View>
                {recognitionSource.url ? (
                  <Press
                    onPress={() => Linking.openURL(recognitionSource.url!)}
                    accessibilityRole="link"
                    style={{ alignSelf: 'flex-start', minHeight: 36, marginTop: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSoft }}
                  >
                    <Icon name="link" color={theme.accent} size={14} strokeWidth={2} />
                    <Text style={{ marginLeft: space.xs, fontSize: 13, fontWeight: '700', color: theme.accent }}>
                      {t('gear.editor.openInSource', { source: recognitionSource.label })}
                    </Text>
                  </Press>
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.xs }}>
              <DetailMetricInput theme={theme} label={t('gear.spec.weight')} value={w} onChangeText={(value) => setW(numClean(value))} placeholder="0.00" suffix="kg" />
              <DetailQuantityInput theme={theme} label={t('gear.spec.qty')} value={qty} onChange={setQty} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xxxl }}>
              <DetailChoiceField
                theme={theme}
                label={t('gear.spec.category')}
                value={currentCategory?.name || t('gear.uncategorized')}
                color={currentCategory?.color}
                onPress={() => setOpenChoice('category')}
              />
              <DetailValueInput theme={theme} label={t('gear.spec.value')} value={p} onChangeText={(value) => setP(numClean(value))} placeholder="0" prefix="¥" />
              <DetailChoiceField
                theme={theme}
                label={t('gear.spec.status')}
                value={t(`gear.status.${status}` as any)}
                onPress={() => setOpenChoice('status')}
              />
            </View>

            <DetailNoteInput theme={theme} label={t('gear.section.note')} value={note} onChangeText={setNote} placeholder={t('gear.editor.notePlaceholder')} />

            <AppSectionHeader
              theme={theme}
              text={t('gear.section.customAttrs')}
              marginTop={space.xxl}
              trailing={(
                <Press onPress={() => setAttrs((current) => [['', ''], ...current])} style={{ minHeight: 36, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.fieldSurface }}>
                  <Icon name="plus" color={theme.accent} size={15} strokeWidth={2.2} />
                  <Text style={{ marginLeft: space.xs, fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('gear.editor.addAttr')}</Text>
                </Press>
              )}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {attrs.map(([key, value], index) => (
                <View key={index} style={{ width: '48%', minHeight: 84, paddingHorizontal: space.sm, paddingVertical: space.sm, paddingRight: space.xl, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
                  <Press onPress={() => setAttrs((current) => current.filter((_, entryIndex) => entryIndex !== index))} hitSlop={8} style={{ position: 'absolute', right: space.xs, top: space.xs, zIndex: 1, padding: space.xxs }}>
                    <Icon name="close" color={theme.text3} size={13} />
                  </Press>
                  <TextInput
                    value={key}
                    onChangeText={(next) => setAttr(index, 0, next)}
                    placeholder={t('gear.editor.attrNamePlaceholder')}
                    placeholderTextColor={theme.text3}
                    style={{ padding: 0, paddingRight: space.xs, fontSize: 14, fontWeight: '600', color: theme.text2 }}
                  />
                  <TextInput
                    value={value}
                    onChangeText={(next) => setAttr(index, 1, next)}
                    placeholder={t('gear.editor.attrValuePlaceholder')}
                    placeholderTextColor={theme.text3}
                    multiline
                    style={{ minHeight: 30, marginTop: space.xs, padding: 0, fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: theme.text, textAlignVertical: 'top' }}
                  />
                </View>
              ))}
            </View>
          </View>
        </DetailPage>

        <View pointerEvents="box-none" style={{ position: 'absolute', left: space.xl, right: space.xl, bottom: Math.max(insets.bottom, 14) + space.xxs }}>
          <Press onPress={submit} disabled={!valid} style={{ height: 54, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: valid ? theme.accent : theme.fieldSurface, borderWidth: valid ? 0 : StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
            <Icon name="check" color={valid ? '#FFFFFF' : theme.text3} size={18} strokeWidth={2.3} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: valid ? '#FFFFFF' : theme.text3 }}>{t('gear.editor.saveToLibrary')}</Text>
          </Press>
        </View>
        {openChoice === 'category' ? (
          <GearWheelSelectSheet
            theme={theme}
            title={t('gear.spec.category')}
            value={cat}
            data={cats.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            onClose={() => setOpenChoice(null)}
            onConfirm={setCat}
          />
        ) : null}
        {openChoice === 'status' ? (
          <GearWheelSelectSheet
            theme={theme}
            title={t('gear.spec.status')}
            value={status}
            data={GEAR_STATUS.map((candidate) => ({ value: candidate.id, label: t(`gear.status.${candidate.id}` as any) }))}
            onClose={() => setOpenChoice(null)}
            onConfirm={(next) => setStatus(next as GearCarryStatus)}
          />
        ) : null}
        <PhotoSourceSheet
          visible={photoSourceOpen}
          theme={theme}
          title={t('gear.editor.addPhoto')}
          hint={t('gear.editor.photoSourceHint')}
          cameraLabel={t('gear.editor.takePhoto')}
          libraryLabel={t('gear.editor.pickFromLibrary')}
          cancelLabel={t('common.cancel')}
          onClose={() => setPhotoSourceOpen(false)}
          onCamera={() => {
            setPhotoSourceOpen(false);
            setTimeout(takePhoto, 380);
          }}
          onLibrary={() => {
            setPhotoSourceOpen(false);
            setTimeout(pickFromLibrary, 380);
          }}
        />
      </View>
    );
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: pageBg(theme), transform: [{ translateX }] }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingTop: insets.top + 72, paddingBottom: insets.bottom + 122 }}>
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8, color: theme.text }}>{t('gear.editor.editTitle')}</Text>
            <Text style={{ marginTop: 7, fontSize: 14, lineHeight: 21, color: theme.text2 }}>{t('gear.editor.editIntro')}</Text>

            <View style={{ marginTop: 24, padding: 16, borderRadius: 26, flexDirection: 'row', alignItems: 'center', backgroundColor: cardBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <GearItemImage theme={theme} item={previewItem} radius={19} style={{ width: 82, height: 82 }} />
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.text3 }}>{t('gear.editor.nameLabel')}</Text>
                <TextInput value={name} onChangeText={setName} placeholder={t('gear.editor.namePlaceholder')} placeholderTextColor={theme.text3} returnKeyType="done" style={{ marginTop: 7, padding: 0, fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.35, color: theme.text }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3, backgroundColor: currentCategory?.color || theme.text3 }} />
                  <Text style={{ marginLeft: 6, fontSize: 11.5, color: theme.text2 }}>{currentCategory?.name || t('gear.uncategorized')}</Text>
                </View>
              </View>
            </View>
            {duplicate ? <Text style={{ marginTop: 7, marginLeft: 4, fontSize: 11.5, color: theme.danger }}>{t('gear.editor.dupName')}</Text> : null}

            <SectionTitle theme={theme} title={t('gear.spec.category')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}>
              {cats.map((candidate) => {
                const selected = candidate.id === cat;
                return (
                  <Press key={candidate.id} onPress={() => setCat(candidate.id)} style={{ height: 42, paddingHorizontal: 14, borderRadius: 21, flexDirection: 'row', alignItems: 'center', backgroundColor: selected ? theme.accent : cardBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? theme.accent : theme.hairline }}>
                    <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: selected ? '#FFFFFF' : candidate.color }} />
                    <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '700', color: selected ? '#FFFFFF' : theme.text }}>{candidate.name}</Text>
                  </Press>
                );
              })}
            </ScrollView>

            <SectionTitle theme={theme} title={t('gear.section.spec')} />
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <MetricInput theme={theme} icon="weight" label={t('gear.spec.weight')} value={w} onChangeText={(value) => setW(numClean(value))} prefix="" suffix="kg" placeholder="0.00" />
                <MetricInput theme={theme} icon="value" label={t('gear.spec.value')} value={p} onChangeText={(value) => setP(numClean(value))} prefix="¥" suffix="" placeholder="0" />
              </View>

              <View style={{ padding: 16, borderRadius: 24, backgroundColor: cardBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}><Package color={theme.text2} size={17} strokeWidth={1.8} /></View>
                  <Text style={{ flex: 1, marginLeft: 11, fontSize: 14, fontWeight: '700', color: theme.text }}>{t('gear.spec.qty')}</Text>
                  <Stepper theme={theme} value={qty} onChange={setQty} />
                </View>
                <View style={{ height: StyleSheet.hairlineWidth, marginVertical: 16, backgroundColor: theme.hairline }} />
                <Text style={{ marginBottom: 10, fontSize: 12, fontWeight: '700', color: theme.text2 }}>{t('gear.spec.status')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {GEAR_STATUS.map((candidate) => {
                    const selected = candidate.id === status;
                    return <Press key={candidate.id} onPress={() => setStatus(candidate.id)} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: selected ? theme.accentSoft : fieldBg(theme), borderWidth: 1, borderColor: selected ? theme.accent : 'transparent' }}><Text style={{ fontSize: 12.5, fontWeight: '700', color: selected ? theme.accent : theme.text2 }}>{t(`gear.status.${candidate.id}` as any)}</Text></Press>;
                  })}
                </View>
              </View>
            </View>

            <AppSectionHeader
              theme={theme}
              text={t('gear.section.customAttrs')}
              marginTop={space.xxl}
              trailing={(
                <Press onPress={() => setAttrs((current) => [...current, ['', '']])} style={{ minHeight: 36, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.fieldSurface }}>
                  <Icon name="plus" color={theme.accent} size={15} strokeWidth={2.2} />
                  <Text style={{ marginLeft: space.xs, fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('gear.editor.addAttr')}</Text>
                </Press>
              )}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {attrs.map(([key, value], index) => (
                <View key={index} style={{ width: '48%', minHeight: 84, paddingHorizontal: space.sm, paddingVertical: space.sm, paddingRight: space.xl, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
                  <Press onPress={() => setAttrs((current) => current.filter((_, entryIndex) => entryIndex !== index))} hitSlop={8} style={{ position: 'absolute', right: space.xs, top: space.xs, zIndex: 1, padding: space.xxs }}>
                    <Icon name="close" color={theme.text3} size={13} />
                  </Press>
                  <TextInput
                    value={key}
                    onChangeText={(next) => setAttr(index, 0, next)}
                    placeholder={t('gear.editor.attrNamePlaceholder')}
                    placeholderTextColor={theme.text3}
                    style={{ padding: 0, paddingRight: space.xs, fontSize: 14, fontWeight: '600', color: theme.text2 }}
                  />
                  <TextInput
                    value={value}
                    onChangeText={(next) => setAttr(index, 1, next)}
                    placeholder={t('gear.editor.attrValuePlaceholder')}
                    placeholderTextColor={theme.text3}
                    multiline
                    style={{ minHeight: 30, marginTop: space.xs, padding: 0, fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: theme.text, textAlignVertical: 'top' }}
                  />
                </View>
              ))}
            </View>

            <SectionTitle theme={theme} title={t('gear.section.note')} />
            <View style={{ minHeight: 112, padding: 16, borderRadius: 24, backgroundColor: cardBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
              <TextInput value={note} onChangeText={setNote} placeholder={t('gear.editor.notePlaceholder')} placeholderTextColor={theme.text3} multiline style={{ minHeight: 76, padding: 0, fontSize: 14.5, lineHeight: 22, color: theme.text, textAlignVertical: 'top' }} />
            </View>
          </View>
        </ScrollView>

        <View pointerEvents="box-none" style={{ position: 'absolute', left: 24, right: 24, bottom: Math.max(insets.bottom, 14) + 4 }}>
          <Press onPress={submit} disabled={!valid} style={{ height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: valid ? theme.accent : (theme.dark ? '#2C2C2E' : '#FFFFFF') }}>
            <Icon name="check" color={valid ? '#FFFFFF' : theme.text3} size={18} strokeWidth={2.3} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: valid ? '#FFFFFF' : theme.text3 }}>{t('gear.editor.saveChanges')}</Text>
          </Press>
        </View>
      </KeyboardAvoidingView>

      <View style={{ position: 'absolute', left: 14, top: insets.top + 6 }}><CircleBtn theme={theme} name="chevronL" onPress={onCancel} noShadow /></View>
    </Animated.View>
  );
}

function AddGearPhotoGallery({ theme, item, photos, onPress }: { theme: Theme; item: GearItem; photos: string[]; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const galleryWidth = Math.min(380, Math.max(220, width - space.xxl * 2));
  const galleryHeight = 250;
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (page >= photos.length) setPage(Math.max(0, photos.length - 1));
  }, [page, photos.length]);

  if (photos.length === 0) {
    return (
      <Press onPress={onPress} scaleTo={0.99} style={{ width: galleryWidth, height: galleryHeight }}>
        <GearItemImage theme={theme} item={item} radius={18} contentFit="contain" style={{ width: galleryWidth, height: galleryHeight, backgroundColor: theme.featureSurface, borderWidth: 0 }} />
        <View style={{ position: 'absolute', right: space.sm, bottom: space.sm, width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}>
          <Icon name="camera" color={theme.text} size={19} strokeWidth={1.9} />
        </View>
      </Press>
    );
  }

  return (
    <View style={{ width: galleryWidth, height: galleryHeight }}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri, index) => `${uri}-${index}`}
        snapToInterval={galleryWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / galleryWidth))}
        renderItem={({ item: uri }) => (
          <Press onPress={onPress} scaleTo={0.995} style={{ width: galleryWidth, height: galleryHeight }}>
            <Image source={{ uri }} contentFit="contain" transition={120} style={{ width: galleryWidth, height: galleryHeight, borderRadius: 18, backgroundColor: theme.featureSurface }} />
          </Press>
        )}
      />
      {photos.length > 1 ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', top: space.sm, right: space.sm, minWidth: 42, height: 26, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}>
            <Text style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: '800', color: theme.text }}>{`${page + 1}/${photos.length}`}</Text>
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: space.sm, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            {photos.map((uri, index) => (
              <View key={`${uri}-dot-${index}`} style={{ width: index === page ? 16 : 6, height: 6, borderRadius: radius.pill, backgroundColor: index === page ? theme.accent : theme.text3, opacity: index === page ? 1 : 0.45 }} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function SectionTitle({ theme, title, detail }: { theme: Theme; title: string; detail?: string }) {
  return <View style={{ marginTop: 29, marginBottom: 11, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: theme.text2 }}>{title}</Text>{detail ? <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{detail}</Text> : null}</View>;
}

function MetricInput({ theme, icon, label, value, onChangeText, prefix, suffix, placeholder }: { theme: Theme; icon: 'weight' | 'value'; label: string; value: string; onChangeText: (value: string) => void; prefix: string; suffix: string; placeholder: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, height: 112, padding: 16, borderRadius: 24, justifyContent: 'space-between', backgroundColor: cardBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {icon === 'weight' ? <Weight color={theme.text3} size={15} strokeWidth={1.8} /> : <JapaneseYen color={theme.text3} size={15} strokeWidth={1.8} />}
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2 }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {prefix ? <Text style={{ marginRight: 2, fontFamily: MONO, fontSize: 18, fontWeight: '800', color: value ? theme.text : theme.text3 }}>{prefix}</Text> : null}
        <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={theme.text3} style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: MONO, fontSize: 21, fontWeight: '800', letterSpacing: -0.4, color: theme.text }} />
        {suffix ? <Text style={{ marginLeft: 4, fontSize: 11.5, fontWeight: '700', color: theme.text3 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function Stepper({ theme, value, onChange }: { theme: Theme; value: number; onChange: (value: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Press onPress={() => onChange(Math.max(1, value - 1))} style={{ width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}><Icon name="chevronL" color={value > 1 ? theme.text : theme.text3} size={14} /></Press>
      <Text style={{ minWidth: 20, textAlign: 'center', fontFamily: MONO, fontSize: 15, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Press onPress={() => onChange(value + 1)} style={{ width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}><Icon name="chevronR" color={theme.text} size={14} /></Press>
    </View>
  );
}

function DetailMetricInput({ theme, label, value, onChangeText, placeholder, suffix }: { theme: Theme; label: string; value: string; onChangeText: (value: string) => void; placeholder: string; suffix: string }) {
  return (
    <View style={{ flex: 1, minHeight: 104, paddingHorizontal: space.lg, paddingVertical: 17, borderRadius: radius.feature, justifyContent: 'space-between', backgroundColor: theme.fieldSurface }}>
      <Text style={{ fontSize: 15, color: theme.text2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={theme.text3} style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: MONO, fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -0.7, color: theme.text }} />
        <Text style={{ marginLeft: space.xxs, fontSize: 15, fontWeight: '700', color: theme.text }}>{suffix}</Text>
      </View>
    </View>
  );
}

function DetailQuantityInput({ theme, label, value, onChange }: { theme: Theme; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={{ flex: 1, minHeight: 104, paddingHorizontal: space.lg, paddingVertical: 17, borderRadius: radius.feature, justifyContent: 'space-between', backgroundColor: theme.fieldSurface }}>
      <Text style={{ fontSize: 15, color: theme.text2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Press onPress={() => onChange(Math.max(1, value - 1))} hitSlop={6} style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}><Icon name="chevronL" color={value > 1 ? theme.text : theme.text3} size={14} /></Press>
        <Text style={{ fontFamily: MONO, fontSize: 25, lineHeight: 30, fontWeight: '800', color: theme.text }}>{value}</Text>
        <Press onPress={() => onChange(value + 1)} hitSlop={6} style={{ width: 30, height: 30, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}><Icon name="chevronR" color={theme.text} size={14} /></Press>
      </View>
    </View>
  );
}

function DetailChoiceField({ theme, label, value, color, onPress }: { theme: Theme; label: string; value: string; color?: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ width: '50%', paddingVertical: 14, paddingRight: space.lg }}>
      <Text style={{ fontSize: 15.5, color: theme.text2 }}>{label}</Text>
      <View style={{ minHeight: 22, marginTop: space.xs, flexDirection: 'row', alignItems: 'center' }}>
        {color ? <View style={{ width: 8, height: 8, borderRadius: 3, marginRight: space.xs, backgroundColor: color }} /> : null}
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '700', color: theme.text }}>{value}</Text>
      </View>
    </Press>
  );
}

function DetailValueInput({ theme, label, value, onChangeText, placeholder, prefix }: { theme: Theme; label: string; value: string; onChangeText: (value: string) => void; placeholder: string; prefix: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 14, paddingRight: space.lg }}>
      <Text style={{ fontSize: 15.5, color: theme.text2 }}>{label}</Text>
      <View style={{ minHeight: 22, marginTop: space.xs, flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ marginRight: 2, fontFamily: MONO, fontSize: 13, fontWeight: '700', color: value ? theme.text : theme.text3 }}>{prefix}</Text>
        <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={theme.text3} style={{ flex: 1, padding: 0, fontFamily: MONO, fontSize: 13, fontWeight: '700', color: theme.text }} />
      </View>
    </View>
  );
}

function DetailNoteInput({ theme, label, value, onChangeText, placeholder }: { theme: Theme; label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={{ width: '100%', paddingVertical: 14, paddingRight: space.lg }}>
      <Text style={{ fontSize: 15.5, color: theme.text2 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.text3} multiline style={{ width: '100%', minHeight: 54, marginTop: space.xs, padding: 0, fontSize: 13, lineHeight: 20, fontWeight: '700', color: theme.text, textAlignVertical: 'top' }} />
    </View>
  );
}

function PhotoSourceSheet({ visible, theme, title, hint, cameraLabel, libraryLabel, cancelLabel, onClose, onCamera, onLibrary }: {
  visible: boolean;
  theme: Theme;
  title: string;
  hint: string;
  cameraLabel: string;
  libraryLabel: string;
  cancelLabel: string;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
        <View style={{ paddingTop: space.xs, paddingHorizontal: space.lg, paddingBottom: Math.max(insets.bottom, space.md) + space.sm, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: theme.surfaceTop }}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, marginBottom: space.lg, borderRadius: radius.pill, backgroundColor: theme.text3, opacity: 0.38 }} />
          <View style={{ paddingHorizontal: space.xxs, flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.45, color: theme.text }}>{title}</Text>
              <Text style={{ marginTop: space.xxs, fontSize: 13.5, lineHeight: 20, color: theme.text2 }}>{hint}</Text>
            </View>
            <Press onPress={onClose} accessibilityLabel={cancelLabel} style={{ width: 38, height: 38, marginLeft: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
              <Icon name="close" color={theme.text2} size={17} strokeWidth={2} />
            </Press>
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl }}>
            <Press onPress={onCamera} scaleTo={0.98} style={{ flex: 1, minHeight: 144, padding: space.md, borderRadius: radius.feature, justifyContent: 'space-between', backgroundColor: theme.accent }}>
              <View style={{ width: 48, height: 48, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
                <Icon name="camera" color="#FFFFFF" size={23} strokeWidth={2} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800', color: '#FFFFFF' }}>{cameraLabel}</Text>
                <Icon name="chevronR" color="rgba(255,255,255,0.78)" size={15} />
              </View>
            </Press>

            <Press onPress={onLibrary} scaleTo={0.98} style={{ flex: 1, minHeight: 144, padding: space.md, borderRadius: radius.feature, justifyContent: 'space-between', backgroundColor: theme.fieldSurface }}>
              <View style={{ width: 48, height: 48, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.controlSurface }}>
                <Icon name="photo" color={theme.accent} size={23} strokeWidth={2} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800', color: theme.text }}>{libraryLabel}</Text>
                <Icon name="chevronR" color={theme.text3} size={15} />
              </View>
            </Press>
          </View>
        </View>
      </View>
    </Modal>
  );
}
