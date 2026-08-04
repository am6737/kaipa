import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { GearItem, GearCat } from '../../data/gear';
import { fetchGearLinkPreview, GearLinkPreview } from '../../lib/gearLinkPreview';
import { recognizeGearImage } from '../../lib/gearImageRecognition';
import { CircleBtn } from './parts';

type ScanDisplay = {
  name: string;
  site: string;
};

const SCAN_STEPS = ['读取商品页', '提取标题与价格', '解析规格参数', '估算重量 · 匹配分类'];
type Stage = 'choose' | 'paste' | 'scanning' | 'camera' | 'scanStage';

const pageBg = (theme: Theme) => (theme.dark ? '#1C1C1E' : '#F4F4F5');
const cardBg = (theme: Theme) => (theme.dark ? '#000000' : '#FFFFFF');
const fieldBg = (theme: Theme) => (theme.dark ? '#1C1C1E' : '#F1F1F3');

function firstLink(text: string) {
  return text.match(/https?:\/\/[^\s，、]+/i)?.[0]?.trim() || '';
}

function providerLabel(provider: GearLinkPreview['provider']) {
  if (provider === 'taobao') return '淘宝';
  if (provider === 'tmall') return '天猫';
  if (provider === 'jd') return '京东';
  if (provider === 'dewu') return '得物';
  return '商品页';
}

function inferCategory(preview: GearLinkPreview, cats: GearCat[]) {
  const haystack = `${preview.name} ${preview.category || ''}`.toLowerCase();
  const rules: [string, string[]][] = [
    ['pack', ['背包', '腰包', 'pack', 'backpack']],
    ['shelter', ['帐篷', '天幕', '地布', 'tent', 'shelter']],
    ['sleep', ['睡袋', '睡垫', '枕', 'sleep', 'mattress']],
    ['cloth', ['衣', '裤', '鞋', '袜', '帽', '手套', 'jacket', 'shoe', 'shirt']],
    ['cook', ['炉', '锅', '水壶', '滤水', '餐具', 'stove', 'cook']],
    ['elec', ['头灯', '手表', 'gps', '电池', '充电', '相机', 'camera']],
    ['safe', ['急救', '登山杖', '冰爪', '头盔', '绳', '安全']],
  ];
  const matched = rules.find(([, words]) => words.some((word) => haystack.includes(word)))?.[0];
  return cats.find((candidate) => candidate.id === matched)?.id || cats.find((candidate) => candidate.id === 'misc')?.id || cats[0]?.id || 'misc';
}

export function AddGearChoose({ theme, cats, onResult, onCancel }: {
  theme: Theme;
  cats: GearCat[];
  onResult: (item: GearItem, source?: { label: string; url?: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(width)).current;
  const [stage, setStage] = useState<Stage>('choose');
  const [linkText, setLinkText] = useState('');
  const [scanProduct, setScanProduct] = useState<ScanDisplay | null>(null);
  const [scanSteps, setScanSteps] = useState(0);
  const [scanPhase, setScanPhase] = useState<'trace' | 'lift'>('trace');
  const [scanError, setScanError] = useState('');
  const [recognizedPhotoUri, setRecognizedPhotoUri] = useState('');
  const scanRequestId = useRef(0);
  const scanProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imagePhaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognizedAssetRef = useRef<ImagePicker.ImagePickerAsset | null>(null);

  useEffect(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    return () => {
      if (scanProgressRef.current) clearInterval(scanProgressRef.current);
      if (imagePhaseTimerRef.current) clearTimeout(imagePhaseTimerRef.current);
    };
  }, [translateX]);

  const link = firstLink(linkText);
  const submitLink = async () => {
    if (!link) return;
    const requestId = ++scanRequestId.current;
    let host = '商品页';
    try { host = new URL(link).hostname; } catch {}
    setScanProduct({ name: link, site: host });
    setScanError('');
    setScanSteps(0);
    setStage('scanning');
    if (scanProgressRef.current) clearInterval(scanProgressRef.current);
    scanProgressRef.current = setInterval(() => setScanSteps((current) => Math.min(3, current + 1)), 650);
    try {
      const preview = await fetchGearLinkPreview(link, linkText);
      if (scanProgressRef.current) clearInterval(scanProgressRef.current);
      scanProgressRef.current = null;
      if (requestId !== scanRequestId.current) return;
      setScanSteps(SCAN_STEPS.length);
      onResult({
        name: preview.name,
        cat: inferCategory(preview, cats),
        w: preview.weightKg || 0,
        p: preview.priceCny || 0,
        attrs: preview.attrs.length ? preview.attrs : undefined,
        photos: preview.imageUrl ? [preview.imageUrl] : undefined,
      }, { label: providerLabel(preview.provider), url: preview.sourceUrl });
    } catch (error) {
      if (scanProgressRef.current) clearInterval(scanProgressRef.current);
      scanProgressRef.current = null;
      if (requestId !== scanRequestId.current) return;
      setScanError(error instanceof Error ? error.message : '商品识别失败');
    }
  };

  const toManual = (photoUri = '') => {
    const cat = cats.find((candidate) => candidate.id === 'misc')?.id || cats[0]?.id || 'misc';
    onResult({ name: '', cat, w: 0, p: 0, photos: photoUri ? [photoUri] : undefined });
  };

  const runImageRecognition = async (asset: ImagePicker.ImagePickerAsset) => {
    const requestId = ++scanRequestId.current;
    setScanError('');
    setScanPhase('trace');
    if (imagePhaseTimerRef.current) clearTimeout(imagePhaseTimerRef.current);
    imagePhaseTimerRef.current = setTimeout(() => setScanPhase('lift'), 1300);
    try {
      const item = await recognizeGearImage(asset, cats);
      if (requestId !== scanRequestId.current) return;
      onResult(item, { label: t('gear.add.photoRecognize') });
    } catch (error) {
      if (requestId !== scanRequestId.current) return;
      setScanError(error instanceof Error ? error.message : t('gear.add.imageRecognitionFailed'));
    } finally {
      if (imagePhaseTimerRef.current) clearTimeout(imagePhaseTimerRef.current);
      imagePhaseTimerRef.current = null;
    }
  };

  const recognizePhoto = (asset: ImagePicker.ImagePickerAsset) => {
    recognizedAssetRef.current = asset;
    setRecognizedPhotoUri(asset.uri);
    setScanProduct({ name: '', site: t('gear.add.photoRecognize') });
    setStage('scanStage');
    void runImageRecognition(asset);
  };

  const cancelImageRecognition = () => {
    scanRequestId.current += 1;
    if (imagePhaseTimerRef.current) clearTimeout(imagePhaseTimerRef.current);
    imagePhaseTimerRef.current = null;
    setStage('choose');
  };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: pageBg(theme), transform: [{ translateX }] }]}>
      {stage === 'choose' ? <ChooseStage theme={theme} top={insets.top} onCancel={onCancel} onPaste={() => setStage('paste')} onCamera={() => setStage('camera')} onManual={() => toManual()} /> : null}
      {stage === 'paste' ? <PasteStage theme={theme} top={insets.top} linkText={linkText} setLinkText={setLinkText} valid={!!link} onBack={() => setStage('choose')} onSubmit={submitLink} /> : null}
      {stage === 'scanning' && scanProduct ? <ScanningStage theme={theme} top={insets.top} product={scanProduct} stepN={scanSteps} error={scanError} onBack={() => { scanRequestId.current += 1; if (scanProgressRef.current) clearInterval(scanProgressRef.current); scanProgressRef.current = null; setStage('paste'); }} onRetry={submitLink} onManual={() => toManual()} /> : null}
      {stage === 'camera' ? <CameraStage theme={theme} top={insets.top} bottom={insets.bottom} onCancel={() => setStage('choose')} onImage={recognizePhoto} /> : null}
      {stage === 'scanStage' && scanProduct ? <ScanExtractStage theme={theme} product={scanProduct} imageUri={recognizedPhotoUri} phase={scanPhase} error={scanError} onCancel={cancelImageRecognition} onRetry={() => { if (recognizedAssetRef.current) void runImageRecognition(recognizedAssetRef.current); }} onManual={() => toManual(recognizedPhotoUri)} /> : null}
    </Animated.View>
  );
}

function PageHeader({ theme, top, title, subtitle, onBack, onClose }: { theme: Theme; top: number; title: string; subtitle?: string; onBack?: () => void; onClose?: () => void }) {
  return (
    <View style={{ paddingTop: top + 6, paddingHorizontal: 14 }}>
      <CircleBtn theme={theme} name={onBack ? 'chevronL' : 'close'} onPress={(onBack || onClose)!} noShadow />
      <View style={{ paddingHorizontal: 10, paddingTop: 22, paddingBottom: 20 }}>
        <Text style={{ fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8, color: theme.text }}>{title}</Text>
        {subtitle ? <Text style={{ marginTop: 7, maxWidth: 330, fontSize: 14, lineHeight: 21, color: theme.text2 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function ChooseStage({ theme, top, onCancel, onPaste, onCamera, onManual }: { theme: Theme; top: number; onCancel: () => void; onPaste: () => void; onCamera: () => void; onManual: () => void }) {
  const { t } = useI18n();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
      <PageHeader theme={theme} top={top} title={t('gear.add.title')} onBack={onCancel} />
      <View style={{ paddingHorizontal: 24, gap: 12 }}>
        <Press onPress={onPaste} scaleTo={0.985} style={{ minHeight: 178, padding: 21, borderRadius: 28, justifyContent: 'space-between', backgroundColor: theme.accent }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
              <Icon name="link" color="#FFFFFF" size={24} strokeWidth={2} />
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.add.recommended')}</Text>
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 21, fontWeight: '800', letterSpacing: -0.45, color: '#FFFFFF' }}>{t('gear.add.pasteLink')}</Text>
            <Text style={{ marginTop: 5, fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.75)' }}>{t('gear.add.pasteLinkSub')}</Text>
          </View>
        </Press>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <MethodCard theme={theme} icon="camera" title={t('gear.add.photoRecognize')} subtitle={t('gear.add.photoRecognizeSub')} onPress={onCamera} />
          <MethodCard theme={theme} icon="edit" title={t('gear.add.manual')} subtitle={t('gear.add.manualSub')} onPress={onManual} />
        </View>
      </View>
    </ScrollView>
  );
}

function MethodCard({ theme, icon, title, subtitle, onPress }: { theme: Theme; icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} scaleTo={0.98} style={{ flex: 1, minHeight: 154, padding: 17, borderRadius: 24, justifyContent: 'space-between', backgroundColor: cardBg(theme) }}>
      <View style={{ width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}>
        <Icon name={icon} color={theme.accent} size={21} strokeWidth={1.9} />
      </View>
      <View>
        <Text style={{ fontSize: 15.5, fontWeight: '800', color: theme.text }}>{title}</Text>
        <Text numberOfLines={2} style={{ marginTop: 5, fontSize: 11.5, lineHeight: 17, color: theme.text3 }}>{subtitle}</Text>
      </View>
    </Press>
  );
}

function PasteStage({ theme, top, linkText, setLinkText, valid, onBack, onSubmit }: { theme: Theme; top: number; linkText: string; setLinkText: (value: string) => void; valid: boolean; onBack: () => void; onSubmit: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <PageHeader theme={theme} top={top} title={t('gear.add.pasteLinkTitle')} onBack={onBack} />
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ minHeight: 164, padding: 18, borderRadius: 26, backgroundColor: cardBg(theme) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}><Icon name="link" color={theme.accent} size={17} /></View>
              <Text style={{ marginLeft: 10, fontSize: 13.5, fontWeight: '800', color: theme.text }}>{t('gear.add.linkLabel')}</Text>
              <View style={{ flex: 1 }} />
              <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: valid ? theme.accentSoft : fieldBg(theme) }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: valid ? theme.accent : theme.text3 }}>{valid ? t('gear.add.linkReady') : t('gear.add.linkRequired')}</Text>
              </View>
            </View>
            <TextInput autoFocus value={linkText} onChangeText={setLinkText} placeholder={t('gear.add.linkPlaceholder')} placeholderTextColor={theme.text3} multiline style={{ minHeight: 84, padding: 0, fontFamily: MONO, fontSize: 13, lineHeight: 22, color: theme.text, textAlignVertical: 'top' }} />
          </View>
          <Press onPress={valid ? onSubmit : undefined} style={{ height: 54, marginTop: 14, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: valid ? theme.accent : cardBg(theme) }}>
            <Icon name="eye" color={valid ? '#FFFFFF' : theme.text3} size={18} strokeWidth={2} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: valid ? '#FFFFFF' : theme.text3 }}>{t('gear.add.recognize')}</Text>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

function ScanningStage({ theme, top, product, stepN, error, onBack, onRetry, onManual }: { theme: Theme; top: number; product: ScanDisplay; stepN: number; error: string; onBack: () => void; onRetry: () => void; onManual: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1 }}>
      <PageHeader theme={theme} top={top} title={t('gear.add.scanningTitle')} subtitle={t('gear.add.scanningHint')} onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 100 }}>
        <View style={{ padding: 22, borderRadius: 28, backgroundColor: cardBg(theme) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}><Icon name="bag" color={theme.accent} size={25} strokeWidth={1.7} /></View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: theme.accent }}>{product.site}</Text>
              <Text numberOfLines={2} style={{ marginTop: 5, fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.text }}>{product.name}</Text>
            </View>
            {error ? <Icon name="close" color={theme.danger} size={20} strokeWidth={2.2} /> : <ActivityIndicator color={theme.accent} />}
          </View>
          {error ? (
            <View style={{ marginTop: 22 }}>
              <Text style={{ fontSize: 14, lineHeight: 21, color: theme.danger }}>{error}</Text>
              <Text style={{ marginTop: 7, fontSize: 12, lineHeight: 18, color: theme.text3 }}>{t('gear.add.scanFallbackHint')}</Text>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}>
                <Press onPress={onRetry} style={{ flex: 1, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}><Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.add.retry')}</Text></Press>
                <Press onPress={onManual} style={{ flex: 1, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}><Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>{t('gear.add.manualContinue')}</Text></Press>
              </View>
            </View>
          ) : <View style={{ marginTop: 24, gap: 14 }}>
            {SCAN_STEPS.map((step, index) => {
              const done = index < stepN;
              const active = index === stepN;
              return (
                <View key={step} style={{ flexDirection: 'row', alignItems: 'center', opacity: done || active ? 1 : 0.35 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? theme.accent : fieldBg(theme) }}>
                    {done ? <Icon name="check" color="#FFFFFF" size={13} strokeWidth={2.4} /> : <Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '800', color: active ? theme.accent : theme.text3 }}>{index + 1}</Text>}
                  </View>
                  <Text style={{ marginLeft: 11, fontSize: 13.5, fontWeight: active ? '700' : '500', color: active ? theme.text : theme.text2 }}>{step}</Text>
                </View>
              );
            })}
          </View>}
        </View>
      </View>
    </View>
  );
}

function CameraStage({ theme, top, bottom, onCancel, onImage }: { theme: Theme; top: number; bottom: number; onCancel: () => void; onImage: (asset: ImagePicker.ImagePickerAsset) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'object' | 'tag'>('object');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const takePhoto = async () => {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(t('gear.editor.cameraPermission'));
      return;
    }
    setBusy(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.65, base64: true });
      if (!result.canceled) onImage(result.assets[0]);
    } catch {
      setError(t('gear.add.imageReadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const choosePhoto = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('gear.editor.libraryPermission'));
      return;
    }
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.65, base64: true });
      if (!result.canceled) onImage(result.assets[0]);
    } catch {
      setError(t('gear.add.imageReadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0B0C0E' }]}>
      <View style={{ paddingTop: top + 6, paddingHorizontal: 14 }}><CircleBtn theme={{ ...theme, dark: true, text: '#FFFFFF', surfaceTop: '#2C2C2E' }} name="close" onPress={onCancel} noShadow /></View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
        <View style={{ width: 280, height: 280, borderRadius: 34, backgroundColor: '#17181B', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera" color="rgba(255,255,255,0.3)" size={48} strokeWidth={1.25} />
          <Corner pos="tl" color={theme.accent} /><Corner pos="tr" color={theme.accent} /><Corner pos="bl" color={theme.accent} /><Corner pos="br" color={theme.accent} />
        </View>
        <Text style={{ marginTop: 24, fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{mode === 'object' ? t('gear.add.cameraObjectHint') : t('gear.add.cameraTagHint')}</Text>
        <View style={{ flexDirection: 'row', marginTop: 18, padding: 4, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' }}>
          {(['object', 'tag'] as const).map((key) => <Press key={key} onPress={() => setMode(key)} style={{ paddingHorizontal: 18, paddingVertical: 8, borderRadius: 13, backgroundColor: mode === key ? '#FFFFFF' : 'transparent' }}><Text style={{ fontSize: 13, fontWeight: '800', color: mode === key ? '#000000' : '#FFFFFF' }}>{key === 'object' ? t('gear.add.cameraObject') : t('gear.add.cameraTag')}</Text></Press>)}
        </View>
        {error ? <Text style={{ marginTop: 16, paddingHorizontal: 28, textAlign: 'center', fontSize: 13, lineHeight: 19, color: theme.danger }}>{error}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(bottom, 20) + 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <Press accessibilityLabel={t('gear.add.choosePhoto')} onPress={busy ? undefined : choosePhoto} style={{ width: 76, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <Icon name="photo" color="#FFFFFF" size={21} />
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.add.choosePhoto')}</Text>
        </Press>
        <Press accessibilityLabel={t('gear.add.takePhoto')} onPress={busy ? undefined : takePhoto} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' }} />}
        </Press>
        <View style={{ width: 76 }} />
      </View>
    </View>
  );
}

function ScanExtractStage({ theme, product, imageUri, phase, error, onCancel, onRetry, onManual }: { theme: Theme; product: ScanDisplay; imageUri: string; phase: 'trace' | 'lift'; error: string; onCancel: () => void; onRetry: () => void; onManual: () => void }) {
  const { t } = useI18n();
  const lifted = phase === 'lift';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0B0C0E', alignItems: 'center', justifyContent: 'center' }]}>
      <View style={{ position: 'absolute', top: 56, left: 16 }}><Press onPress={onCancel}><Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{t('gear.add.cancel')}</Text></Press></View>
      <View style={{ width: 218, height: 218, overflow: 'hidden', borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191A1D', borderWidth: lifted ? 3 : StyleSheet.hairlineWidth, borderColor: lifted ? '#FFFFFF' : 'rgba(255,255,255,0.12)', transform: [{ scale: lifted ? 1.06 : 1 }] }}>
        {imageUri ? <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="bag" color="rgba(255,255,255,0.3)" size={52} strokeWidth={1.3} />}
      </View>
      {error ? (
        <View style={{ width: '100%', paddingHorizontal: 28, marginTop: 38 }}>
          <Text style={{ fontSize: 16, lineHeight: 23, fontWeight: '800', textAlign: 'center', color: '#FFFFFF' }}>{t('gear.add.imageRecognitionFailed')}</Text>
          <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: 'center', color: 'rgba(255,255,255,0.62)' }}>{error}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
            <Press onPress={onRetry} style={{ flex: 1, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}><Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.add.retry')}</Text></Press>
            <Press onPress={onManual} style={{ flex: 1, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}><Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.add.manualContinue')}</Text></Press>
          </View>
        </View>
      ) : (
        <>
          <ActivityIndicator style={{ marginTop: 42 }} color="#FFFFFF" />
          <Text style={{ marginTop: 16, fontSize: 19, fontWeight: '800', color: '#FFFFFF' }}>{lifted ? t('gear.add.extractingSpec') : t('gear.add.extractingObject')}</Text>
          <Text style={{ marginTop: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>{product.site} · {t('gear.add.autoFillHint')}</Text>
        </>
      )}
    </View>
  );
}

function Corner({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const style: any = { position: 'absolute', width: 34, height: 34, borderColor: color };
  if (pos.includes('t')) style.top = -2; else style.bottom = -2;
  if (pos.includes('l')) style.left = -2; else style.right = -2;
  if (pos === 'tl') Object.assign(style, { borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 18 });
  if (pos === 'tr') Object.assign(style, { borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 18 });
  if (pos === 'bl') Object.assign(style, { borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 18 });
  if (pos === 'br') Object.assign(style, { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 18 });
  return <View style={style} />;
}
