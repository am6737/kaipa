import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, TextInput, ScrollView, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { useI18n } from '../../i18n';
import { GearItem, GearCat } from '../../data/gear';
import { toneFor } from './parts';

// ── Local product DB for demo recognition (mirrors prototype's GX_SMART_DB) ─
const SMART_DB = [
  {
    keys: ['osprey', 'talon', 'aether', '背包', 'backpack', 'pack'],
    name: 'Osprey Talon 33 登山徒步背包',
    cat: 'pack', p: 1180, w: 0.86,
    attrs: [['容量', '33 L'], ['尺码', 'S/M'], ['背负系统', 'AirScape']] as [string, string][],
  },
  {
    keys: ['arc', 'beta', 'gore', '冲锋衣', '硬壳', 'jacket', 'shell'],
    name: "Arc'teryx Beta AR 硬壳冲锋衣",
    cat: 'cloth', p: 4280, w: 0.44,
    attrs: [['尺码', 'L'], ['防水', 'GORE-TEX Pro'], ['面料', '三层压胶']] as [string, string][],
  },
  {
    keys: ['hoka', 'speedgoat', 'salomon', '越野跑鞋', '徒步鞋', 'shoe', '鞋'],
    name: 'HOKA Speedgoat 5 越野跑鞋',
    cat: 'cloth', p: 1290, w: 0.62,
    attrs: [['尺码', 'US 9.5'], ['大底', 'Vibram Megagrip']] as [string, string][],
  },
  {
    keys: ['nemo', 'hornet', 'msr', 'hubba', '帐篷', 'tent'],
    name: 'NEMO Hornet Elite OSMO 2P 帐篷',
    cat: 'shelter', p: 4100, w: 0.79,
    attrs: [['人数', '2P'], ['面料', 'OSMO 防水'], ['打包尺寸', '32×11 cm']] as [string, string][],
  },
  {
    keys: ['therm', 'neoair', 'sleeping', '睡袋', '睡垫', 'sleep', 'pad'],
    name: 'Therm-a-Rest NeoAir XLite 充气睡垫',
    cat: 'sleep', p: 1390, w: 0.34,
    attrs: [['R 值', '4.5'], ['规格', 'Regular']] as [string, string][],
  },
  {
    keys: ['garmin', 'fenix', 'suunto', '手表', 'watch', 'gps'],
    name: 'Garmin Fenix 7 Solar 户外手表',
    cat: 'elec', p: 5990, w: 0.073,
    attrs: [['型号', 'Fenix 7 Solar'], ['续航', '18 天'], ['多频 GPS', '是']] as [string, string][],
  },
  {
    keys: ['katadyn', 'befree', 'sawyer', '滤水', 'filter', 'water'],
    name: 'Katadyn BeFree 1.0L 滤水器',
    cat: 'cook', p: 320, w: 0.06,
    attrs: [['流速', '2 L/min'], ['容量', '1.0 L']] as [string, string][],
  },
  {
    keys: ['petzl', 'nitecore', '头灯', 'headlamp', 'light'],
    name: 'Petzl Actik Core 头灯',
    cat: 'elec', p: 420, w: 0.088,
    attrs: [['亮度', '600 lm'], ['防水', 'IPX4']] as [string, string][],
  },
];

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function detectSite(text: string) {
  const t = text.toLowerCase();
  if (t.includes('taobao') || t.includes('tmall') || t.includes('淘')) return '淘宝';
  if (t.includes('jd.com') || t.includes('京东')) return '京东';
  if (t.includes('dewu') || t.includes('poizon') || t.includes('得物')) return '得物';
  if (t.includes('amazon') || t.includes('亚马逊')) return '亚马逊';
  return '商品页';
}

function parseLink(text: string) {
  const t = text.toLowerCase();
  let prod = SMART_DB.find(p => p.keys.some(k => t.includes(k)));
  if (!prod) prod = SMART_DB[hashSeed(text) % SMART_DB.length];
  return { ...prod, site: detectSite(text) };
}

function parseLinks(text: string) {
  return text.split(/[\s,，、]+/).map(s => s.trim()).filter(s => s.length > 0 && (s.includes('.') || s.includes('://')));
}

const SAMPLE_LINKS = [
  'https://item.taobao.com/item.htm?id=Osprey-Talon-33',
  'https://item.jd.com/Arcteryx-Beta-AR.html',
  'https://dw4.co/t/HOKA-Speedgoat-5',
];

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');

type Stage = 'choose' | 'paste' | 'scanning' | 'camera' | 'scanStage';

export function AddGearChoose({
  theme,
  cats,
  onResult,
  onCancel,
}: {
  theme: Theme;
  cats: GearCat[];
  onResult: (item: GearItem, source?: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const ty = useRef(new Animated.Value(screenH)).current;
  useEffect(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [ty]);

  const [stage, setStage] = useState<Stage>('choose');
  const [linkText, setLinkText] = useState('');
  const [scanProduct, setScanProduct] = useState<typeof SMART_DB[0] & { site: string } | null>(null);
  const [scanSteps, setScanSteps] = useState(0);
  const [scanPhase, setScanPhase] = useState<'trace' | 'lift'>('trace');

  const linkCount = parseLinks(linkText).length;

  const toManual = () => {
    const cat = cats.find(c => c.id === 'misc')?.id || cats[0]?.id || 'misc';
    onResult({ name: '', cat, w: 0, p: 0 });
  };

  const submitLinks = () => {
    const links = parseLinks(linkText);
    const list = links.length ? links : [SAMPLE_LINKS[0]];
    const prod = parseLink(list[0]);
    setScanProduct(prod);
    setStage('scanning');
  };

  const shootCamera = () => {
    const prod = { ...SMART_DB[1], site: '拍照识别' };
    setScanProduct(prod);
    setStage('scanStage');
  };

  const finishScan = () => {
    if (!scanProduct) return;
    const cat = cats.find(c => c.id === scanProduct.cat)?.id || cats[0]?.id || 'misc';
    onResult(
      { name: scanProduct.name, cat, w: scanProduct.w, p: scanProduct.p, attrs: scanProduct.attrs },
      scanProduct.site,
    );
  };

  // Scanning step timer
  useEffect(() => {
    if (stage !== 'scanning' || !scanProduct) return;
    const steps = ['读取商品页', '提取标题与价格', '解析规格参数', '估算重量 · 匹配分类'];
    setScanSteps(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((_, i) => timers.push(setTimeout(() => setScanSteps(i + 1), 400 + i * 400)));
    timers.push(setTimeout(finishScan, 400 + steps.length * 400 + 300));
    return () => timers.forEach(clearTimeout);
  }, [stage]);

  // Camera scan stage timer
  useEffect(() => {
    if (stage !== 'scanStage') return;
    setScanPhase('trace');
    const t1 = setTimeout(() => setScanPhase('lift'), 1400);
    const t2 = setTimeout(finishScan, 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [stage]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY: ty }] }]}>
      {stage === 'choose' && (
        <ChooseStage
          theme={theme}
          insets={insets}
          onCancel={onCancel}
          onPaste={() => setStage('paste')}
          onCamera={() => setStage('camera')}
          onManual={toManual}
        />
      )}
      {stage === 'paste' && (
        <PasteStage
          theme={theme}
          insets={insets}
          linkText={linkText}
          setLinkText={setLinkText}
          linkCount={linkCount}
          onBack={() => setStage('choose')}
          onSubmit={submitLinks}
        />
      )}
      {stage === 'scanning' && scanProduct && (
        <ScanningStage theme={theme} insets={insets} product={scanProduct} stepN={scanSteps} onBack={() => setStage('paste')} />
      )}
      {stage === 'camera' && (
        <CameraStage theme={theme} insets={insets} onCancel={() => setStage('choose')} onShoot={shootCamera} />
      )}
      {stage === 'scanStage' && scanProduct && (
        <ScanExtractStage theme={theme} product={scanProduct} phase={scanPhase} onCancel={() => setStage('choose')} />
      )}
    </Animated.View>
  );
}

// ── Stage: choose entry ─────────────────────────────────────────────────────
function ChooseStage({ theme, insets, onCancel, onPaste, onCamera, onManual }: {
  theme: Theme; insets: { top: number }; onCancel: () => void; onPaste: () => void; onCamera: () => void; onManual: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1 }}>
      <NavBar theme={theme} insets={insets} title={t('gear.add.title')} onCancel={onCancel} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <EntryRow theme={theme} primary icon="link" title={t('gear.add.pasteLink')} sub={t('gear.add.pasteLinkSub')} onPress={onPaste} />
        <EntryRow theme={theme} icon="camera" title={t('gear.add.photoRecognize')} sub={t('gear.add.photoRecognizeSub')} onPress={onCamera} />
        <EntryRow theme={theme} icon="edit" title={t('gear.add.manual')} sub={t('gear.add.manualSub')} onPress={onManual} />
      </View>
    </View>
  );
}

// ── Stage: paste link ───────────────────────────────────────────────────────
function PasteStage({ theme, insets, linkText, setLinkText, linkCount, onBack, onSubmit }: {
  theme: Theme; insets: { top: number }; linkText: string; setLinkText: (s: string) => void; linkCount: number; onBack: () => void; onSubmit: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1 }}>
      <NavBar theme={theme} insets={insets} title={t('gear.add.pasteLinkTitle')} sub={t('gear.add.pasteLinkHint')} onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* link input card */}
        <View style={{ borderRadius: 16, backgroundColor: theme.surfaceTop, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, ...cardShadow(theme) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="link" color={theme.accent} size={18} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{t('gear.add.linkLabel')}</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 11.5, fontWeight: linkCount > 1 ? '700' : '500', color: linkCount > 1 ? theme.accent : theme.text3 }}>
              {linkCount === 0 ? t('gear.add.linkPerLine') : t('gear.add.linkDetected', { count: linkCount })}
            </Text>
          </View>
          <TextInput
            autoFocus
            value={linkText}
            onChangeText={setLinkText}
            placeholder={t('gear.add.linkPlaceholder')}
            placeholderTextColor={theme.text3}
            multiline
            style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 21, color: theme.text, padding: 0, minHeight: 100, textAlignVertical: 'top' }}
          />
        </View>

        {/* sample links */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10, paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text3 }}>{t('gear.add.trySamples')}</Text>
          <Press onPress={() => setLinkText(SAMPLE_LINKS.join('\n'))}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.accent }}>{t('gear.add.addAll')}</Text>
          </Press>
        </View>
        {SAMPLE_LINKS.map((s, i) => (
          <Press
            key={i}
            onPress={() => setLinkText(linkText && linkText.trim() ? linkText.trimEnd() + '\n' + s : s)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, paddingHorizontal: 13, borderRadius: 12, backgroundColor: fieldBg(theme), marginBottom: 8 }}
          >
            <Icon name="plus" color={theme.text3} size={15} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{s}</Text>
          </Press>
        ))}

        <View style={{ flex: 1, minHeight: 18 }} />
      </ScrollView>

      {/* submit button */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.top ? 14 : 14, 14) + 2 }}>
        <Press
          onPress={onSubmit}
          style={{ paddingVertical: 15, borderRadius: 15, alignItems: 'center', backgroundColor: theme.accent, boxShadow: `0px 6px 18px ${theme.accent}44` }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            {linkCount > 1 ? t('gear.add.recognizeBatch', { count: linkCount }) : t('gear.add.recognize')}
          </Text>
        </Press>
      </View>
    </View>
  );
}

// ── Stage: scanning progress ────────────────────────────────────────────────
const SCAN_STEPS = ['读取商品页', '提取标题与价格', '解析规格参数', '估算重量 · 匹配分类'];

function ScanningStage({ theme, insets, product, stepN, onBack }: {
  theme: Theme; insets: { top: number }; product: { name: string; site: string }; stepN: number; onBack: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <NavBar theme={theme} insets={insets} title="识别中" onBack={onBack} />
      <View style={{ padding: 20, paddingHorizontal: 16 }}>
        <View style={{ backgroundColor: theme.surfaceTop, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, ...cardShadow(theme) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            {/* product thumb */}
            <PhotoTile tone={toneFor(product.name)} seed={product.name} radius={13} style={{ width: 60, height: 60 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.accent }} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text2 }}>{product.site}</Text>
                <Text style={{ fontSize: 12, color: theme.text3 }}>正在识别…</Text>
                <View style={{ flex: 1 }} />
                <ActivityIndicator size="small" color={theme.accent} />
              </View>
              {SCAN_STEPS.map((s, i) => {
                if (i > stepN) return null;
                const done = i < stepN;
                return (
                  <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <Icon name={done ? 'check' : 'eye'} color={done ? theme.accent : theme.text2} size={14} />
                    <Text style={{ fontSize: 12.5, fontWeight: done ? '600' : '500', color: done ? theme.text2 : theme.text }}>{s}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Stage: camera viewfinder ────────────────────────────────────────────────
function CameraStage({ theme, insets, onCancel, onShoot }: {
  theme: Theme; insets: { top: number }; onCancel: () => void; onShoot: () => void;
}) {
  const [mode, setMode] = useState<'object' | 'tag'>('object');
  const FRAME = 248;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0b0d' }]}>
      {/* dark faux camera background */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111214' }]}>
        <PhotoTile tone="rock" seed="camera-bg" radius={0} darken style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />
      </View>

      {/* top bar */}
      <View style={{ zIndex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 16 }}>
        <Press onPress={onCancel}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff', minWidth: 44 }}>取消</Text>
        </Press>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>拍照识别</Text>
        <View style={{ minWidth: 44 }} />
      </View>

      {/* viewfinder */}
      <View style={{ flex: 1, zIndex: 2, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{ width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center' }}>
          {/* corners */}
          <Corner pos="tl" color={theme.accent} />
          <Corner pos="tr" color={theme.accent} />
          <Corner pos="bl" color={theme.accent} />
          <Corner pos="br" color={theme.accent} />
          {/* center photo preview */}
          <PhotoTile tone="forest" seed="viewfinder" radius={16} style={{ width: FRAME - 16, height: FRAME - 16 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>
            {mode === 'object' ? '把装备放进框内，自动识别' : '对准价签 / 吊牌上的型号'}
          </Text>
        </View>
      </View>

      {/* mode toggle */}
      <View style={{ zIndex: 3, alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.13)' }}>
          {(['object', 'tag'] as const).map(k => (
            <Press key={k} onPress={() => setMode(k)} style={{ paddingHorizontal: 18, paddingVertical: 7, borderRadius: 10, backgroundColor: mode === k ? '#fff' : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: mode === k ? '#000' : '#fff' }}>{k === 'object' ? '实物' : '价签 / 吊牌'}</Text>
            </Press>
          ))}
        </View>
      </View>

      {/* bottom controls */}
      <View style={{ zIndex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 34 + (insets.top > 20 ? 20 : 0) }}>
        <Press onPress={onShoot} style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' }} />
        </Press>
      </View>
    </View>
  );
}

// ── Stage: full-screen "extract subject" scan (iOS style) ───────────────────
function ScanExtractStage({ theme, product, phase, onCancel }: {
  theme: Theme; product: { name: string; site: string }; phase: 'trace' | 'lift'; onCancel: () => void;
}) {
  const P = 208;
  const lifted = phase === 'lift';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07080a', alignItems: 'center', justifyContent: 'center' }]}>
      {/* blurred backdrop */}
      <View style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}>
        <PhotoTile tone={toneFor(product.name)} seed={product.name} radius={0} darken style={StyleSheet.absoluteFill} />
      </View>

      {/* cancel button */}
      <View style={{ position: 'absolute', top: 56, left: 16, zIndex: 5 }}>
        <Press onPress={onCancel}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>取消</Text>
        </Press>
      </View>

      {/* floating subject */}
      <View style={{ width: P, height: P, borderRadius: 30, overflow: 'hidden', borderWidth: lifted ? 4 : 0, borderColor: '#fff', ...cardShadow(theme), transform: [{ scale: lifted ? 1.07 : 1 }] }}>
        <PhotoTile tone={toneFor(product.name)} seed={product.name} radius={26} style={{ width: '100%', height: '100%' }} />
      </View>

      {/* caption */}
      <View style={{ marginTop: 56, alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.2 }}>
          {lifted ? '提取规格 · 估算重量' : '识别主体中'}
        </Text>
        <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 7 }}>
          {product.site} · 自动填写名称 · 重量 · 价格
        </Text>
      </View>
    </View>
  );
}

// ── Shared UI pieces ────────────────────────────────────────────────────────
function NavBar({ theme, insets, title, sub, onCancel, onBack }: {
  theme: Theme; insets: { top: number }; title: string; sub?: string; onCancel?: () => void; onBack?: () => void;
}) {
  return (
    <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {onBack ? (
        <Press onPress={onBack} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: fieldBg(theme), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrowL" color={theme.text} size={18} />
        </Press>
      ) : (
        <Press onPress={onCancel} hitSlop={8}>
          <Text style={{ fontSize: 15, color: theme.text2, minWidth: 40 }}>取消</Text>
        </Press>
      )}
      <View style={{ flex: 1, alignItems: onBack ? 'flex-start' : 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text, letterSpacing: -0.2 }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 11, color: theme.text3, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      <View style={{ minWidth: 40 }} />
    </View>
  );
}

function EntryRow({ theme, primary, icon, title, sub, onPress }: {
  theme: Theme; primary?: boolean; icon: IconName; title: string; sub: string; onPress: () => void;
}) {
  const bg = primary ? theme.accent : theme.surfaceTop;
  const shadow = primary
    ? { boxShadow: `0px 8px 22px ${theme.accent}44` }
    : cardShadow(theme);
  const border = primary ? {} : { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline };

  return (
    <Press onPress={onPress} scaleTo={0.97} style={{
      flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16,
      borderRadius: 18, backgroundColor: bg, ...shadow, ...border,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? 'rgba(255,255,255,0.2)' : fieldBg(theme) }}>
        <Icon name={icon} color={primary ? '#fff' : theme.text} size={21} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: primary ? '#fff' : theme.text, letterSpacing: -0.2 }}>{title}</Text>
        <Text style={{ fontSize: 12, color: primary ? 'rgba(255,255,255,0.78)' : theme.text3, marginTop: 2 }}>{sub}</Text>
      </View>
      <Icon name="chevronR" color={primary ? 'rgba(255,255,255,0.7)' : theme.text3} size={16} />
    </Press>
  );
}

function Corner({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const B = 30;
  const BW = 3;
  const R = 16;
  const s: any = { position: 'absolute' as const, width: B, height: B };
  if (pos.includes('t')) { s.top = -1; } else { s.bottom = -1; }
  if (pos.includes('l')) { s.left = -1; } else { s.right = -1; }
  if (pos === 'tl') { s.borderTopWidth = BW; s.borderLeftWidth = BW; s.borderTopLeftRadius = R; }
  if (pos === 'tr') { s.borderTopWidth = BW; s.borderRightWidth = BW; s.borderTopRightRadius = R; }
  if (pos === 'bl') { s.borderBottomWidth = BW; s.borderLeftWidth = BW; s.borderBottomLeftRadius = R; }
  if (pos === 'br') { s.borderBottomWidth = BW; s.borderRightWidth = BW; s.borderBottomRightRadius = R; }
  s.borderColor = color;
  return <View style={s} />;
}

const cardShadow = (t: Theme) =>
  t.dark
    ? { boxShadow: '0px 5px 14px rgba(0,0,0,0.45)' as const }
    : { boxShadow: '0px 8px 16px rgba(0,0,0,0.1)' as const };
