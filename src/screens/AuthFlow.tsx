// AuthFlow.tsx — Kaipa 登录 / 注册流程，遵循当前应用设计系统。
// MVP 阶段（不含实时 GPS）。支持 手机号 / 邮箱 / 微信 / Apple / Google 五种方式。
// Auth gate: 未登录显示这里，登录成功 onSuccess()。
//
// Entry (邮箱+密码) → CTA / 协议 / 切换登录注册 / 忘记密码 / 底部三按钮
//   ├─ 找回账号  : 账号 → 验证码 → 设新密码 → 完成
//   ├─ 游客登录  : onSuccess()
//   └─ 更多方式  : 手机号(→验证码) / 微信 / Apple / Google
// 协议·隐私 全屏文档页可从任意输入步骤打开。
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  Dimensions,
  TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { elevAccent, shadow } from '../theme/shadow';
import { MONO } from '../theme/fonts';
import { layout, motion, radius, space, type } from '../design-system';
import { useI18n, TKey } from '../i18n';
import { signInWithEmail, signUpWithEmail, signInAnonymously } from '../lib/auth';
import { WeChatIcon } from '../components/WeChatIcon';
import QRCode from 'react-native-qrcode-svg';
import { createQrLoginRequest, consumeQrLoginRequest, encodeQrLoginPayload } from '../lib/qrLogin';

const SCREEN_W = Dimensions.get('window').width;

type DocId = 'agreement' | 'privacy';
type SocialId = 'wechat' | 'apple' | 'google';
type Step = 'entry' | 'phone' | 'otp' | 'recover' | 'qr';

// ── SVG glyphs (ported verbatim from the prototype) ─────────────────────────
const Mail = ({ c }: { c: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={5} width={18} height={14} rx={3} stroke={c} strokeWidth={1.7} />
    <Path d="m4 7 8 6 8-6" stroke={c} strokeWidth={1.7} strokeLinejoin="round" />
  </Svg>
);
const Lock = ({ c }: { c: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
    <Rect x={4} y={10} width={16} height={10} rx={2.5} stroke={c} strokeWidth={1.7} />
    <Path d="M8 10V8a4 4 0 0 1 8 0v2" stroke={c} strokeWidth={1.7} />
  </Svg>
);
const EyeOpen = ({ c }: { c: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
    <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke={c} strokeWidth={1.6} />
    <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={1.6} />
  </Svg>
);
const EyeOff = ({ c }: { c: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 4l16 16M10.6 10.7a2 2 0 0 0 2.7 2.8M9.4 5.3A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3 3.6M6 6.6A16 16 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 3-.5"
      stroke={c}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
const BackArrow = ({ c }: { c: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path d="M20 12H5M12 19l-7-7 7-7" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const ChevDownSmall = ({ c }: { c: string }) => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
    <Path d="m6 9 6 6 6-6" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const ChevRight = ({ c }: { c: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="m9 6 6 6-6 6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const CheckSmall = () => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
    <Path d="m5 12 4 4 10-10" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const CheckBig = () => (
  <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
    <Path d="m5 12.5 4.5 4.5L19 7.5" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const RecoverGlyph = ({ c }: { c: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Circle cx={10} cy={10} r={6} stroke={c} strokeWidth={1.8} />
    <Path d="m14.5 14.5 5 5" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
    <Path d="M10 7.5v3M10 12.6v.01" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);
const GuestGlyph = ({ c }: { c: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={9} r={3.4} stroke={c} strokeWidth={1.8} />
    <Path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);
const DotsGlyph = ({ c }: { c: string }) => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
    <Circle cx={6} cy={12} r={1.7} fill={c} />
    <Circle cx={12} cy={12} r={1.7} fill={c} />
    <Circle cx={18} cy={12} r={1.7} fill={c} />
  </Svg>
);
const PhoneGlyph = ({ c = '#fff' }: { c?: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Rect x={6.5} y={3} width={11} height={18} rx={2.6} stroke={c} strokeWidth={1.8} />
    <Path d="M10.5 18h3" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);
const QrGlyph = ({ c }: { c: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={3} width={6} height={6} rx={1} stroke={c} strokeWidth={1.8} />
    <Rect x={15} y={3} width={6} height={6} rx={1} stroke={c} strokeWidth={1.8} />
    <Rect x={3} y={15} width={6} height={6} rx={1} stroke={c} strokeWidth={1.8} />
    <Path d="M14 14h3v3h4M14 21v-3h3M21 13v2" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ── Social brand glyphs ──────────────────────────────────────────────────────
const AppleGlyph = ({ c }: { c: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M16.4 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.65-1.3-.13-2.5.75-3.15.75-.65 0-1.65-.73-2.7-.71-1.4.02-2.68.8-3.4 2.05-1.45 2.5-.37 6.2 1.04 8.24.69 1 1.5 2.12 2.57 2.08 1.03-.04 1.42-.66 2.66-.66 1.24 0 1.6.66 2.7.64 1.11-.02 1.82-1.02 2.5-2.02.79-1.16 1.11-2.28 1.13-2.34-.02-.01-2.17-.83-2.19-3.29Z"
      fill={c}
    />
    <Path
      d="M14.4 6.5c.57-.69.95-1.65.85-2.6-.82.03-1.81.55-2.4 1.23-.53.61-.99 1.59-.87 2.52.91.07 1.84-.46 2.42-1.15Z"
      fill={c}
    />
  </Svg>
);
const GoogleGlyph = () => (
  <Svg width={23} height={23} viewBox="0 0 24 24">
    <Path d="M21.6 12.2c0-.66-.06-1.3-.17-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.24c1.9-1.75 2.96-4.32 2.96-7.2Z" fill="#4285F4" />
    <Path d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.06v2.58A10 10 0 0 0 12 22Z" fill="#34A853" />
    <Path d="M6.42 13.9a6 6 0 0 1 0-3.82V7.5H3.06a10 10 0 0 0 0 9l3.36-2.6Z" fill="#FBBC05" />
    <Path d="M12 5.96c1.47 0 2.78.5 3.82 1.5l2.85-2.85C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.06 7.5l3.36 2.58C7.2 7.72 9.4 5.96 12 5.96Z" fill="#EA4335" />
  </Svg>
);

const socialIcon = (t: Theme, kind: SocialId) =>
  kind === 'wechat' ? <WeChatIcon size={26} color="#FFFFFF" /> : kind === 'apple' ? <AppleGlyph c={t.dark ? '#000' : '#fff'} /> : <GoogleGlyph />;
const socialBg = (t: Theme, kind: SocialId) =>
  kind === 'wechat' ? '#07C160' : kind === 'apple' ? (t.dark ? '#fff' : '#000') : t.dark ? 'rgba(255,255,255,0.10)' : '#fff';

function LandingBrand({ t }: { t: Theme }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: t.text, fontSize: 34, fontWeight: '800', letterSpacing: 4 }}>开爬</Text>
      <Text style={{ marginTop: space.xs, color: t.text3, fontSize: 10, fontWeight: '700', letterSpacing: 4.2 }}>KAIPA</Text>
    </View>
  );
}

function LandingButton({ t, label, icon, onPress }: { t: Theme; label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      style={{
        height: 54,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: t.text,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
      }}
    >
      <View style={{ width: 24, alignItems: 'center' }}>{icon}</View>
      <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Press>
  );
}

// ── Spinning ring ───────────────────────────────────────────────────────────
function Spinner({ size = 18, color = '#fff', track = 'rgba(255,255,255,0.4)', width = 2 }: { size?: number; color?: string; track?: string; width?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: track, borderTopColor: color, transform: [{ rotate }] }}
    />
  );
}

// Slide-in (auth-push): translateX from screen width → 0, on mount.
function useSlideIn() {
  const x = useRef(new Animated.Value(SCREEN_W)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: 0, duration: motion.emphasized, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [x]);
  return x;
}

// ── Field shell ─────────────────────────────────────────────────────────────
function AuthField({ t, leading, children }: { t: Theme; leading?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: 58,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: t.featureSurface,
        borderWidth: 1,
        borderColor: t.hairline,
      }}
    >
      {leading}
      {children}
    </View>
  );
}

const inputStyle = (t: Theme): TextStyle => ({
  flex: 1,
  minHeight: 56,
  fontSize: 16,
  color: t.text,
  paddingVertical: 0,
});

function CountryCode({ t }: { t: Theme }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xxs,
        paddingRight: space.sm,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: t.hairline,
        height: 24,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>+86</Text>
      <ChevDownSmall c={t.text3} />
    </View>
  );
}

function PasswordField({
  t,
  value,
  onChangeText,
  placeholder,
  show,
  setShow,
}: {
  t: Theme;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <AuthField t={t} leading={<Lock c={t.text3} />}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.text3}
        secureTextEntry={!show}
        autoCapitalize="none"
        style={inputStyle(t)}
      />
      <Press onPress={() => setShow(!show)} hitSlop={10} style={{ padding: space.xxs }}>
        {show ? <EyeOpen c={t.text2} /> : <EyeOff c={t.text2} />}
      </Press>
    </AuthField>
  );
}

// ── Segmented control (手机号 / 邮箱) ──────────────────────────────────────────
function AuthSeg<T extends string>({ t, value, options, onChange }: { t: Theme; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xxs, padding: space.xxs, borderRadius: radius.card, backgroundColor: t.fieldSurface }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Press
            key={o.id}
            onPress={() => onChange(o.id)}
            style={{
              flex: 1,
              height: 40,
              borderRadius: radius.control,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.surfaceTop : 'transparent',
              ...(on && t.dark ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.35)' } : {}),
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: on ? t.text : t.text2 }}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

// ── Agreement row (checkbox + 《用户协议》/《隐私政策》) ───────────────────────
function AuthAgree({ t, value, onChange, flash, onOpenDoc }: { t: Theme; value: boolean; onChange: (v: boolean) => void; flash: boolean; onOpenDoc: (id: DocId) => void }) {
  const { t: tr } = useI18n();
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flash) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: -4, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -3, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [flash, shake]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <Pressable onPress={() => onChange(!value)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 7,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: value ? t.accent : t.fieldSurface,
              borderWidth: 1.5,
              borderColor: value ? t.accent : flash ? t.danger : t.fieldBorder,
            }}
          >
            {value && <CheckSmall />}
          </View>
        </Pressable>
      </Animated.View>
      <Text style={{ flex: 1, fontSize: 12, color: flash ? t.danger : t.text2, lineHeight: 19 }}>
        {tr('auth.agree.prefix')}
        <Text onPress={() => onOpenDoc('agreement')} style={{ color: t.text, fontWeight: '700' }}>
          {tr('auth.agree.agreement')}
        </Text>
        {tr('auth.agree.and')}
        <Text onPress={() => onOpenDoc('privacy')} style={{ color: t.text, fontWeight: '700' }}>
          {tr('auth.agree.privacy')}
        </Text>
      </Text>
    </View>
  );
}

// ── Primary CTA ──────────────────────────────────────────────────────────────
function AuthCTA({ t, label, enabled, busy, onPress, topGap = space.lg }: { t: Theme; label: string; enabled: boolean; busy?: boolean; onPress: () => void; topGap?: number }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled || busy }}
      onPress={() => enabled && !busy && onPress()}
      style={{
        height: 56,
        borderRadius: radius.pill,
        marginTop: topGap,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
        backgroundColor: enabled ? t.accent : t.text3,
      }}
    >
      {busy ? (
        <Spinner size={18} color="#fff" track="rgba(255,255,255,0.4)" width={2} />
      ) : (
        <Text style={{ fontSize: 16, fontWeight: '800', letterSpacing: 0.1, color: enabled ? '#fff' : t.featureSurface }}>{label}</Text>
      )}
    </Press>
  );
}

// ── Back button (shared header chip) ──────────────────────────────────────────
function AuthBack({ t, top, onPress }: { t: Theme; top: number; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={{
        position: 'absolute',
        top,
        left: space.md,
        zIndex: 5,
        width: layout.iconButton,
        height: layout.iconButton,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <BackArrow c={t.text} />
    </Press>
  );
}

// ── 6-digit OTP input (hidden field over 6 boxes) ────────────────────────────
function OtpInput({ t, code, setCode }: { t: Theme; code: string; setCode: (v: string) => void }) {
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 360);
    return () => clearTimeout(id);
  }, []);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ marginTop: space.xxl }}>
      <TextInput
        ref={ref}
        value={code}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0 }}
      />
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const active = i === code.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 58,
                borderRadius: radius.card,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? t.accentSofter : t.fieldSurface,
                borderWidth: 1,
                borderColor: active ? t.accent : t.fieldBorder,
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>{code[i] || ''}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

function ResendRow({ t, left, onResend }: { t: Theme; left: number; onResend: () => void }) {
  const { t: tr } = useI18n();
  return (
    <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {left > 0 ? (
        <Text style={{ fontSize: 13, color: t.text3 }}>
          <Text style={{ fontFamily: MONO, color: t.text2 }}>{left}s</Text> {tr('auth.otp.resendIn')}
        </Text>
      ) : (
        <Press onPress={onResend}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.accent }}>{tr('auth.otp.resend')}</Text>
        </Press>
      )}
    </View>
  );
}

function StepTitle({ t, title, sub }: { t: Theme; title: string; sub: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: t.text, fontSize: 31, fontWeight: '800', letterSpacing: -1, lineHeight: 38 }}>{title}</Text>
      <Text style={{ ...type.body, color: t.text2, lineHeight: 22 }}>{sub}</Text>
    </View>
  );
}

// ── Legal document content (用户协议 / 隐私政策) ───────────────────────────────
const AUTH_DOCS: Record<DocId, { titleKey: TKey; updated: string; intro: string; sections: { h: string; p: string[] }[] }> = {
  agreement: {
    titleKey: 'auth.docs.agreementTitle',
    updated: '更新日期：2026 年 4 月 1 日',
    intro:
      '欢迎使用「开爬 kaipa」徒步记录服务。在注册或使用本服务前，请仔细阅读并充分理解本协议各条款。当你勾选同意或开始使用本服务，即表示你已接受本协议的全部内容。',
    sections: [
      { h: '一、服务内容', p: ['开爬为徒步、登山等户外活动提供轨迹记录、路线规划、装备清单、行程相册与同行者协作等功能。', '本服务当前处于不含实时 GPS 后台定位的体验阶段，部分功能依赖你主动上传的轨迹文件。'] },
      { h: '二、账号注册与安全', p: ['你可使用手机号、邮箱或第三方账号注册。你应对账号下的所有活动负责，并妥善保管登录凭证。', '如发现账号被未经授权使用，请立即通过应用内反馈联系我们。'] },
      { h: '三、用户行为规范', p: ['你承诺不利用本服务从事违反法律法规或公序良俗的行为，不上传含有违法、侵权或虚假地理信息的内容。', '你发布的轨迹、照片与文字应拥有合法权利，不得侵犯他人隐私或知识产权。'] },
      { h: '四、内容与知识产权', p: ['你对自己创作并上传的内容保留权利，同时授予开爬为提供和改进服务所必需的、非独占的使用许可。', '开爬的软件、界面、商标及相关素材的知识产权归开爬所有。'] },
      { h: '五、户外安全免责声明', p: ['户外徒步存在天气、地形、体能等固有风险。本服务提供的路线、海拔与里程数据仅供参考，不构成专业向导或安全保证。', '你应根据自身能力审慎决策，并对出行安全自行负责。因户外活动导致的人身或财产损失，开爬不承担责任。'] },
      { h: '六、服务变更与终止', p: ['我们可能根据运营需要调整、暂停或终止部分功能，并会以合理方式提前告知。', '若你违反本协议，我们有权限制或终止向你提供服务。'] },
      { h: '七、其他', p: ['本协议的解释与争议解决适用中华人民共和国法律。', '我们可能适时更新本协议，更新后将在应用内提示，继续使用即视为接受变更。'] },
    ],
  },
  privacy: {
    titleKey: 'auth.docs.privacyTitle',
    updated: '更新日期：2026 年 4 月 1 日',
    intro: '开爬 kaipa 高度重视你的隐私。本政策说明我们如何收集、使用、存储和保护你的个人信息。请你在使用服务前认真阅读。',
    sections: [
      { h: '一、我们收集的信息', p: ['账号信息：手机号、邮箱、昵称与头像等你主动提供的资料。', '轨迹与位置信息：你上传或记录的徒步轨迹、海拔、里程等地理数据。', '内容信息：你在行程中添加的照片、文字与装备清单。', '设备信息：用于保障服务稳定与安全的设备型号、系统版本等基础信息。'] },
      { h: '二、信息的使用', p: ['用于实现轨迹记录、路线展示、行程相册与同行协作等核心功能。', '用于改进产品体验、保障账号与数据安全，以及在你同意范围内的功能优化。'] },
      { h: '三、信息的共享', p: ['当你将行程分享给同行者或公开发布时，相应内容会按你的设置被对应用户看到。', '除法律要求或获得你的明确同意外，我们不会向第三方出售或出租你的个人信息。'] },
      { h: '四、信息的存储与安全', p: ['我们采用加密传输与访问控制等措施保护你的数据，存储期限不超过实现目的所必需的时间。', '尽管我们尽力保护，但任何方式的传输与存储都无法保证绝对安全。'] },
      { h: '五、你的权利', p: ['你有权查询、更正或删除你的个人信息，也可注销账号。', '你可随时关闭或撤回相关授权，部分功能可能因此无法使用。'] },
      { h: '六、第三方服务', p: ['登录或地图等功能可能由第三方提供，其对信息的处理适用其各自的隐私政策。'] },
      { h: '七、联系我们', p: ['如对本政策有任何疑问或投诉，可通过应用内「我 — 帮助与反馈」与我们联系，我们将尽快回复。'] },
    ],
  },
};

// ── Legal document reader (pushed full-screen page) ──────────────────────────
function AuthDocPage({ t, doc, onBack }: { t: Theme; doc: DocId; onBack: () => void }) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const x = useSlideIn();
  const d = AUTH_DOCS[doc];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, zIndex: 95, transform: [{ translateX: x }] }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} stickyHeaderIndices={[0]} showsVerticalScrollIndicator={false}>
        {/* sticky frost header */}
        <View style={{ paddingTop: insets.top, overflow: 'hidden' }}>
          <BlurView intensity={40} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: t.dark ? 'rgba(20,20,22,0.72)' : 'rgba(255,255,255,0.72)', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.hairline },
            ]}
          />
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
            <Press onPress={onBack} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
              <BackArrow c={t.text} />
            </Press>
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{tr(d.titleKey)}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 28, paddingTop: 20 }}>
          <Text style={{ fontSize: 12, color: t.text3 }}>{d.updated}</Text>
          <Text style={{ fontSize: 13.5, color: t.text2, lineHeight: 24, marginTop: 14 }}>{d.intro}</Text>
          {d.sections.map((s, i) => (
            <View key={i} style={{ marginTop: 26 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{s.h}</Text>
              {s.p.map((para, j) => (
                <Text key={j} style={{ fontSize: 13.5, color: t.text2, lineHeight: 24, marginTop: 8 }}>
                  {para}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// ── "更多登录方式" bottom sheet ───────────────────────────────────────────────
function AuthMoreSheet({ t, onPick, onClose }: { t: Theme; onPick: (id: 'email' | SocialId) => void; onClose: () => void }) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: motion.emphasized,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  const items: { id: 'email' | SocialId; label: string; icon: React.ReactNode }[] = [
    { id: 'email', label: tr('auth.emailHint'), icon: <Mail c={t.text} /> },
    {
      id: 'wechat',
      label: '微信',
      icon: (
        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07C160' }}>
          <WeChatIcon size={26} color="#FFFFFF" />
        </View>
      ),
    },
    { id: 'apple', label: 'Apple', icon: <AppleGlyph c={t.text} /> },
    { id: 'google', label: 'Google', icon: <GoogleGlyph /> },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 80, justifyContent: 'flex-end', alignItems: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)' }]} onPress={onClose} />
      <Animated.View
        style={{
          width: '100%',
          maxWidth: 520,
          transform: [{ translateY }],
          backgroundColor: t.featureSurface,
          borderTopLeftRadius: radius.feature,
          borderTopRightRadius: radius.feature,
          paddingTop: space.sm,
          paddingBottom: insets.bottom + space.sm,
          ...(t.dark ? { boxShadow: '0px -8px 24px rgba(0,0,0,0.38)' } : {}),
        }}
      >
        <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{tr('auth.more.title')}</Text>
          <Press
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            style={{ position: 'absolute', right: space.md, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="m6 6 12 12M18 6 6 18" stroke={t.text2} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Press>
        </View>

        <View>
          {items.map((item) => (
            <Press
              key={item.id}
              onPress={() => onPick(item.id)}
              style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl }}
            >
              <View style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>{item.icon}</View>
              <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '600', color: t.text }}>{item.label}</Text>
            </Press>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

// ── Social connecting overlay ─────────────────────────────────────────────────
function AuthSocialOverlay({ t, kind }: { t: Theme; kind: SocialId }) {
  const { t: tr } = useI18n();
  const label = { wechat: '微信', apple: 'Apple', google: 'Google' }[kind];
  const bg = socialBg(t, kind);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 90, alignItems: 'center', justifyContent: 'center' }]}>
      <BlurView intensity={40} tint={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.dark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)' }]} />
      <View
        style={[
          {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: kind === 'google' && !t.dark ? StyleSheet.hairlineWidth : 0,
            borderColor: t.hairline,
          },
          shadow(0.18, 26, 8),
        ]}
      >
        <View style={{ position: 'absolute', top: -8, left: -8, right: -8, bottom: -8, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={80} color={t.accent} track={t.accentSoft} width={2} />
        </View>
        {socialIcon(t, kind)}
      </View>
      <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.text, marginTop: 18 }}>{tr('auth.social.connecting', { name: label })}</Text>
    </View>
  );
}

// ── OTP step (phone) ──────────────────────────────────────────────────────────
function AuthOtp({ t, phone, busy, onBack, onVerify }: { t: Theme; phone: string; busy: boolean; onBack: () => void; onVerify: (code: string) => void }) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const x = useSlideIn();
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(60);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  useEffect(() => {
    if (code.length === 6) {
      const id = setTimeout(() => onVerify(code), 260);
      return () => clearTimeout(id);
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.groupedBg, transform: [{ translateX: x }] }]}>
      <AuthBack t={t} top={insets.top + 12} onPress={onBack} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: layout.pagePadding, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: t.text, letterSpacing: -0.5 }}>{tr('auth.otp.title')}</Text>
        <Text style={{ fontSize: 14, color: t.text2, marginTop: 8, lineHeight: 21 }}>
          {tr('auth.otp.sentTo')} <Text style={{ fontFamily: MONO, color: t.text, fontWeight: '600' }}>+86 {phone}</Text>
        </Text>
        <OtpInput t={t} code={code} setCode={setCode} />
        <ResendRow t={t} left={left} onResend={() => { setLeft(60); setCode(''); }} />
        {busy && (
          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Spinner size={16} color={t.accent} track={t.hairline} width={2} />
            <Text style={{ fontSize: 13, color: t.text2 }}>{tr('auth.otp.verifying')}</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ── Phone-number entry step (pushed from 更多) ────────────────────────────────
function AuthPhoneStep({
  t,
  phone,
  setPhone,
  agree,
  setAgree,
  flash,
  flashAgree,
  onBack,
  onNext,
  onOpenDoc,
}: {
  t: Theme;
  phone: string;
  setPhone: (v: string) => void;
  agree: boolean;
  setAgree: (v: boolean) => void;
  flash: boolean;
  flashAgree: () => void;
  onBack: () => void;
  onNext: () => void;
  onOpenDoc: (id: DocId) => void;
}) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const x = useSlideIn();
  const ref = useRef<TextInput>(null);
  const valid = /^1\d{10}$/.test(phone);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 360);
    return () => clearTimeout(id);
  }, []);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.featureSurface, transform: [{ translateX: x }] }]}>
      <AuthBack t={t} top={insets.top + space.sm} onPress={onBack} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: 460,
          alignSelf: 'center',
          paddingTop: insets.top + 112,
          paddingHorizontal: space.xxl,
          paddingBottom: insets.bottom + space.xxxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepTitle t={t} title={tr('auth.phone.title')} sub={tr('auth.phone.sub')} />
        <View style={{ marginTop: 36 }}>
          <AuthField t={t} leading={<CountryCode t={t} />}>
            <TextInput
              ref={ref}
              value={phone}
              keyboardType="number-pad"
              placeholder={tr('auth.phone.placeholder')}
              placeholderTextColor={t.text3}
              maxLength={11}
              onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 11))}
              style={inputStyle(t)}
            />
          </AuthField>
        </View>
        <AuthCTA
          t={t}
          label={tr('auth.phone.getCode')}
          enabled={valid}
          topGap={52}
          onPress={() => {
            if (!agree) {
              flashAgree();
              return;
            }
            onNext();
          }}
        />
        <View style={{ marginTop: space.lg }}>
          <AuthAgree t={t} value={agree} onChange={setAgree} flash={flash} onOpenDoc={onOpenDoc} />
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// ── 找回账号 flow (输入 → 验证码 → 重置密码 → 完成) ──────────────────────────────
type RStep = 'input' | 'otp' | 'reset' | 'done';

function AuthRecover({ t, onBack, onDone, onOpenDoc }: { t: Theme; onBack: () => void; onDone: () => void; onOpenDoc: (id: DocId) => void }) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [rstep, setRstep] = useState<RStep>('input');
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(60);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const phoneValid = /^1\d{10}$/.test(phone);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const inputValid = method === 'phone' ? phoneValid : emailValid;
  const pwdValid = pwd.length >= 6 && pwd === pwd2;

  useEffect(() => {
    if (rstep === 'input') {
      const id = setTimeout(() => inputRef.current?.focus(), 360);
      return () => clearTimeout(id);
    }
  }, [rstep, method]);
  useEffect(() => {
    if (rstep !== 'otp' || left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [rstep, left]);
  useEffect(() => {
    if (rstep === 'otp' && code.length === 6) {
      const id = setTimeout(() => { setRstep('reset'); setCode(''); }, 280);
      return () => clearTimeout(id);
    }
  }, [code, rstep]);

  const sendCode = () => { setRstep('otp'); setLeft(60); setCode(''); };
  const submitReset = () => { setBusy(true); setTimeout(() => { setBusy(false); setRstep('done'); }, 900); };

  let body: React.ReactNode;
  if (rstep === 'done') {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <SuccessPop t={t} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: t.text, marginTop: 22 }}>{tr('auth.recover.doneTitle')}</Text>
        <Text style={{ fontSize: 14, color: t.text2, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>{tr('auth.recover.doneSub')}</Text>
        <Press
          onPress={onDone}
          style={[
            { height: 52, borderRadius: 16, marginTop: 32, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent },
            elevAccent(t.accent),
          ]}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{tr('auth.recover.backToLogin')}</Text>
        </Press>
      </View>
    );
  } else if (rstep === 'reset') {
    body = (
      <>
        <AuthBack t={t} top={insets.top + 12} onPress={() => setRstep('otp')} />
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: layout.pagePadding, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <StepTitle t={t} title={tr('auth.reset.title')} sub={tr('auth.reset.sub')} />
          <View style={{ gap: 12, marginTop: 26 }}>
            <PasswordField t={t} value={pwd} onChangeText={setPwd} placeholder={tr('auth.reset.newPwd')} show={showPwd} setShow={setShowPwd} />
            <AuthField t={t} leading={<Lock c={t.text3} />}>
              <TextInput value={pwd2} onChangeText={setPwd2} placeholder={tr('auth.reset.confirmPwd')} placeholderTextColor={t.text3} secureTextEntry={!showPwd} autoCapitalize="none" style={inputStyle(t)} />
            </AuthField>
          </View>
          {pwd2.length > 0 && pwd !== pwd2 && <Text style={{ fontSize: 12.5, color: t.danger, marginTop: 10, paddingLeft: 4 }}>{tr('auth.reset.mismatch')}</Text>}
          <AuthCTA t={t} label={tr('common.done')} enabled={pwdValid} busy={busy} onPress={submitReset} />
        </ScrollView>
      </>
    );
  } else if (rstep === 'otp') {
    const sentTo = method === 'phone' ? `+86 ${phone}` : email;
    body = (
      <>
        <AuthBack t={t} top={insets.top + 12} onPress={() => setRstep('input')} />
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: layout.pagePadding, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: t.text, letterSpacing: -0.5 }}>{tr('auth.otp.title')}</Text>
          <Text style={{ fontSize: 14, color: t.text2, marginTop: 8, lineHeight: 21 }}>
            {tr('auth.otp.sentTo')} <Text style={{ fontFamily: MONO, color: t.text, fontWeight: '600' }}>{sentTo}</Text>
          </Text>
          <OtpInput t={t} code={code} setCode={setCode} />
          <ResendRow t={t} left={left} onResend={() => { setLeft(60); setCode(''); }} />
        </ScrollView>
      </>
    );
  } else {
    body = (
      <>
        <AuthBack t={t} top={insets.top + 12} onPress={onBack} />
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: layout.pagePadding, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <StepTitle t={t} title={tr('auth.recover.title')} sub={tr('auth.recover.sub')} />
          <View style={{ marginTop: 24 }}>
            <AuthSeg t={t} value={method} onChange={setMethod} options={[{ id: 'phone', label: tr('auth.recover.tabPhone') }, { id: 'email', label: tr('auth.recover.tabEmail') }]} />
          </View>
          <View style={{ marginTop: 16 }}>
            {method === 'phone' ? (
              <AuthField t={t} leading={<CountryCode t={t} />}>
                <TextInput
                  ref={inputRef}
                  value={phone}
                  keyboardType="number-pad"
                  placeholder={tr('auth.phone.placeholder')}
                  placeholderTextColor={t.text3}
                  maxLength={11}
                  onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 11))}
                  style={inputStyle(t)}
                />
              </AuthField>
            ) : (
              <AuthField t={t} leading={<Mail c={t.text3} />}>
                <TextInput ref={inputRef} value={email} keyboardType="email-address" placeholder={tr('auth.emailPlaceholder')} placeholderTextColor={t.text3} autoCapitalize="none" onChangeText={(v) => setEmail(v.trim())} style={inputStyle(t)} />
              </AuthField>
            )}
          </View>
          <AuthCTA t={t} label={tr('auth.phone.getCode')} enabled={inputValid} onPress={sendCode} />
          <Text style={{ fontSize: 12.5, color: t.text3, marginTop: 16, lineHeight: 20, textAlign: 'center' }}>
            {tr('auth.recover.cantReceive')} <Text style={{ color: t.accent, fontWeight: '600' }}>{tr('auth.recover.helpFeedback')}</Text> {tr('auth.recover.contactUs')}
          </Text>
        </ScrollView>
      </>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.groupedBg }]}>
      <SlideStep t={t} stepKey={rstep}>
        {body}
      </SlideStep>
    </View>
  );
}

function AuthQrLogin({ t, onBack }: { t: Theme; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { t: tr } = useI18n();
  const [request, setRequest] = useState<{ id: string; secret: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const slide = useSlideIn();

  const createRequest = async () => {
    setLoading(true);
    setError('');
    try {
      setRequest(await createQrLoginRequest());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('qrLogin.unavailable'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void createRequest();
  }, []);

  useEffect(() => {
    if (!request) return;
    const poll = setInterval(() => {
      void consumeQrLoginRequest(request).then((status) => {
        if (status === 'signed_in') clearInterval(poll);
        else if (status === 'expired' || status === 'consumed') {
          clearInterval(poll);
          setError(tr('qrLogin.errorExpired'));
        }
      }).catch((cause) => {
        clearInterval(poll);
        setError(cause instanceof Error ? cause.message : tr('qrLogin.errorGeneric'));
      });
    }, 1800);
    return () => clearInterval(poll);
  }, [request]);

  const qrValue = request ? encodeQrLoginPayload(request) : '';

  return (
    <Animated.View style={{ flex: 1, backgroundColor: t.featureSurface, transform: [{ translateX: slide }] }}>
      <AuthBack t={t} top={insets.top + 5} onPress={onBack} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingTop: insets.top + 82, paddingHorizontal: space.xxl, paddingBottom: insets.bottom + space.xxl }}
      >
        <StepTitle t={t} title={tr('qrLogin.title')} sub={tr('qrLogin.subtitle')} />
        <View style={{ flex: 1, minHeight: 360, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 254, height: 254, borderRadius: radius.feature, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: t.hairline }}>
            {loading ? <Spinner size={26} color={t.accent} track={t.accentSofter} width={2.5} /> : request ? (
              <QRCode value={qrValue} size={210} color="#111111" backgroundColor="#FFFFFF" />
            ) : (
              <Text style={{ color: t.text2, fontSize: 14, textAlign: 'center', paddingHorizontal: space.xl }}>{error}</Text>
            )}
          </View>
          <Text style={{ color: t.text2, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: space.lg }}>
            {tr('qrLogin.openScannerHint')}
          </Text>
          {request ? <Text style={{ color: t.text3, fontSize: 12, marginTop: space.xs }}>{tr('qrLogin.expiresHint')}</Text> : null}
          {error && request ? <Text style={{ color: t.danger, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: space.md }}>{error}</Text> : null}
        </View>
        <Press onPress={() => void createRequest()} disabled={loading} style={{ minHeight: 48, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.accent, fontSize: 14, fontWeight: '700' }}>{loading ? tr('qrLogin.generating') : tr('qrLogin.refresh')}</Text>
        </Press>
      </ScrollView>
    </Animated.View>
  );
}

// Wraps each internal recover step so it re-slides in on step change (auth-push).
function SlideStep({ t, stepKey, children }: { t: Theme; stepKey: string; children: React.ReactNode }) {
  return <SlideStepInner key={stepKey} t={t} children={children} />;
}
function SlideStepInner({ t, children }: { t: Theme; children: React.ReactNode }) {
  const x = useSlideIn();
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.groupedBg, transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

// Success checkmark with a pop animation.
function SuccessPop({ t }: { t: Theme }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: 1, useNativeDriver: true, bounciness: 10, speed: 12 }).start();
  }, [s]);
  return (
    <Animated.View
      style={[
        { width: 72, height: 72, borderRadius: 36, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale: s }] },
        elevAccent(t.accent),
      ]}
    >
      <CheckBig />
    </Animated.View>
  );
}

// ── Entry screen + orchestrator ───────────────────────────────────────────────
export function AuthFlow({ theme, onSuccess }: { theme: Theme; onSuccess: () => void }) {
  const t = theme;
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const [intent, setIntent] = useState<'login' | 'register'>('login');
  const [emailOpen, setEmailOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [agree, setAgree] = useState(false);
  const [flash, setFlash] = useState(false);
  const [step, setStep] = useState<Step>('entry');
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<SocialId | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [doc, setDoc] = useState<DocId | null>(null);

  const flashAgree = () => { setFlash(true); setTimeout(() => setFlash(false), 450); };
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const entryEnabled = emailValid && pwd.length >= 6;

  const [authError, setAuthError] = useState('');
  const friendlyError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
      return tr('auth.error.invalidCredentials');
    if (m.includes('user already registered'))
      return tr('auth.error.userAlreadyRegistered');
    if (m.includes('email not confirmed'))
      return tr('auth.error.emailNotConfirmed');
    if (m.includes('rate limit') || m.includes('too many requests'))
      return tr('auth.error.rateLimited');
    if (m.includes('password') && (m.includes('at least') || m.includes('too short') || m.includes('weak')))
      return tr('auth.error.weakPassword');
    if (m.includes('fetch') || m.includes('network') || m.includes('timeout') || m.includes('econnrefused'))
      return tr('auth.error.networkError');
    return tr('auth.error.unknown');
  };
  const onPrimary = async () => {
    if (!agree) { flashAgree(); return; }
    setBusy(true);
    setAuthError('');
    const fn = intent === 'register' ? signUpWithEmail : signInWithEmail;
    const { error } = await fn(email, pwd);
    setBusy(false);
    if (error) { setAuthError(friendlyError(error.message)); return; }
  };
  const onVerify = () => { setBusy(true); setTimeout(() => onSuccess(), 700); };
  const onSocial = (id: SocialId) => {
    if (!agree) { flashAgree(); return; }
    setSocial(id);
    setTimeout(() => onSuccess(), 1300);
  };
  const onGuest = async () => {
    if (!agree) { flashAgree(); return; }
    if (busy) return;
    setBusy(true);
    setAuthError('');
    try {
      const { error } = await signInAnonymously();
      if (error) {
        const message = error.message.toLowerCase();
        setAuthError(
          message.includes('anonymous') && (message.includes('disabled') || message.includes('not enabled'))
            ? tr('auth.error.anonymousDisabled')
            : friendlyError(error.message),
        );
      }
    } catch (error) {
      setAuthError(friendlyError(error instanceof Error ? error.message : 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  if (doc) return <AuthDocPage t={t} doc={doc} onBack={() => setDoc(null)} />;
  if (step === 'phone')
    return (
      <AuthPhoneStep
        t={t}
        phone={phone}
        setPhone={setPhone}
        agree={agree}
        setAgree={setAgree}
        flash={flash}
        flashAgree={flashAgree}
        onBack={() => setStep('entry')}
        onNext={() => setStep('otp')}
        onOpenDoc={setDoc}
      />
    );
  if (step === 'otp') return <AuthOtp t={t} phone={phone} busy={busy} onBack={() => setStep('phone')} onVerify={onVerify} />;
  if (step === 'recover') return <AuthRecover t={t} onBack={() => setStep('entry')} onDone={() => setStep('entry')} onOpenDoc={setDoc} />;
  if (step === 'qr') return <AuthQrLogin t={t} onBack={() => setStep('entry')} />;

  if (!emailOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: t.featureSurface }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            width: '100%',
            maxWidth: 460,
            alignSelf: 'center',
            paddingTop: insets.top + space.lg,
            paddingHorizontal: space.xxl,
            paddingBottom: insets.bottom + space.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingBottom: space.xxxl }}>
            <LandingBrand t={t} />
          </View>

          <View style={{ gap: space.sm }}>
            <LandingButton
              t={t}
              label={tr('auth.more.phoneLogin')}
              icon={<PhoneGlyph c={t.text} />}
              onPress={() => setStep('phone')}
            />
            <LandingButton
              t={t}
              label={tr('qrLogin.entry')}
              icon={<QrGlyph c={t.text} />}
              onPress={() => {
                if (!agree) { flashAgree(); return; }
                setStep('qr');
              }}
            />
            <Press
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onGuest}
              style={{
                height: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
              }}
            >
              {busy ? (
                <Spinner size={17} color={t.text2} track={t.hairline} width={2} />
              ) : (
                <>
                  <GuestGlyph c={t.text2} />
                  <Text style={{ color: t.text2, fontSize: 14, fontWeight: '600' }}>{tr('auth.guestLogin')}</Text>
                </>
              )}
            </Press>
          </View>

          {authError ? (
            <Text style={{ color: t.danger, fontSize: 13, lineHeight: 19, marginTop: space.sm, textAlign: 'center' }}>
              {authError}
            </Text>
          ) : null}

          <View style={{ marginTop: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
            <Press onPress={() => setMoreOpen(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <DotsGlyph c={t.text3} />
              <Text style={{ color: t.text3, fontSize: 13, fontWeight: '600' }}>{tr('auth.moreMethods')}</Text>
            </Press>
          </View>

          <View style={{ marginTop: space.xl }}>
            <AuthAgree t={t} value={agree} onChange={setAgree} flash={flash} onOpenDoc={setDoc} />
          </View>
        </ScrollView>
        {moreOpen && (
          <AuthMoreSheet
            t={t}
            onClose={() => setMoreOpen(false)}
            onPick={(id) => {
              setMoreOpen(false);
              if (id === 'email') setEmailOpen(true);
              else onSocial(id);
            }}
          />
        )}
        {social && <AuthSocialOverlay t={t} kind={social} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.featureSurface }}>
      <AuthBack t={t} top={insets.top + space.sm} onPress={() => setEmailOpen(false)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            width: '100%',
            maxWidth: 460,
            alignSelf: 'center',
            paddingTop: insets.top + 112,
            paddingHorizontal: space.xxl,
            paddingBottom: insets.bottom + space.xxxl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepTitle
            t={t}
            title={intent === 'login' ? tr('auth.emailLoginTitle') : tr('auth.emailRegisterTitle')}
            sub={intent === 'login' ? tr('auth.emailLoginSub') : tr('auth.emailRegisterSub')}
          />

          <View style={{ marginTop: 36, gap: space.sm }}>
            <AuthField t={t} leading={<Mail c={t.text3} />}>
              <TextInput
                value={email}
                onChangeText={(v) => setEmail(v.trim())}
                placeholder={tr('auth.emailPlaceholder')}
                placeholderTextColor={t.text3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                style={inputStyle(t)}
              />
            </AuthField>
            <PasswordField
              t={t}
              value={pwd}
              onChangeText={setPwd}
              placeholder={intent === 'register' ? tr('auth.setPwdPlaceholder') : tr('auth.pwdPlaceholder')}
              show={showPwd}
              setShow={setShowPwd}
            />
          </View>

          {intent === 'login' ? (
            <View style={{ alignItems: 'flex-end', marginTop: space.xs }}>
              <Press onPress={() => setStep('recover')} hitSlop={8} style={{ paddingVertical: space.xs }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: t.text2 }}>{tr('auth.forgotPwd')}</Text>
              </Press>
            </View>
          ) : null}

          <AuthCTA
            t={t}
            label={intent === 'register' ? tr('auth.registerCta') : tr('auth.loginCta')}
            enabled={entryEnabled}
            busy={busy}
            topGap={intent === 'login' ? 36 : 52}
            onPress={onPrimary}
          />

          {authError ? (
            <Text style={{ color: t.danger, fontSize: 13, lineHeight: 19, marginTop: space.sm, textAlign: 'center' }}>
              {authError}
            </Text>
          ) : null}

          <View style={{ marginTop: space.lg }}>
            <AuthAgree t={t} value={agree} onChange={setAgree} flash={flash} onOpenDoc={setDoc} />
          </View>

          <View style={{ marginTop: space.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
            <Text style={{ fontSize: 13, color: t.text2 }}>
              {intent === 'login' ? tr('auth.switch.noAccount') : tr('auth.switch.hasAccount')}
            </Text>
            <Press
              onPress={() => {
                setIntent(intent === 'login' ? 'register' : 'login');
                setAuthError('');
              }}
              hitSlop={8}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.text }}>
                {intent === 'login' ? tr('auth.switch.toRegister') : tr('auth.switch.toLogin')}
              </Text>
            </Press>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
