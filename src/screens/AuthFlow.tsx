// AuthFlow.tsx — kaipa 登录 / 注册 流程 (1:1 port of the prototype auth-flow.jsx).
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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { Press } from '../components/Press';
import { elevAccent, shadow } from '../theme/shadow';
import { MONO } from '../theme/fonts';
import { useI18n, TKey } from '../i18n';
import { signInWithEmail, signUpWithEmail, signInAnonymously } from '../lib/auth';

const SCREEN_W = Dimensions.get('window').width;

type DocId = 'agreement' | 'privacy';
type SocialId = 'wechat' | 'apple' | 'google';
type Step = 'entry' | 'phone' | 'otp' | 'recover';

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
const PhoneGlyph = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Rect x={6.5} y={3} width={11} height={18} rx={2.6} stroke="#fff" strokeWidth={1.8} />
    <Path d="M10.5 18h3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

// ── Social brand glyphs (simple, recognizable — not exact logos) ────────────
const WeChatGlyph = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.2 4.2C5.3 4.2 2.2 6.8 2.2 10c0 1.8 1 3.4 2.5 4.5L4 16.8l2.6-1.3c.8.2 1.7.4 2.6.4.3 0 .5 0 .8-.05a5.3 5.3 0 0 1-.25-1.6c0-3 2.9-5.4 6.45-5.4.25 0 .5 0 .75.05C16.7 6.3 13.3 4.2 9.2 4.2Z"
      fill="#fff"
    />
    <Path
      d="M22 14.3c0-2.6-2.6-4.7-5.8-4.7s-5.8 2.1-5.8 4.7 2.6 4.7 5.8 4.7c.7 0 1.4-.1 2-.3l1.9 1-.5-1.7c1.4-.85 2.4-2.2 2.4-3.7Z"
      fill="#fff"
    />
    <Circle cx={6.8} cy={9} r={0.95} fill="#07C160" />
    <Circle cx={11.4} cy={9} r={0.95} fill="#07C160" />
    <Circle cx={14.3} cy={13.4} r={0.8} fill="#07C160" />
    <Circle cx={18} cy={13.4} r={0.8} fill="#07C160" />
  </Svg>
);
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
  kind === 'wechat' ? <WeChatGlyph /> : kind === 'apple' ? <AppleGlyph c={t.dark ? '#000' : '#fff'} /> : <GoogleGlyph />;
const socialBg = (t: Theme, kind: SocialId) =>
  kind === 'wechat' ? '#07C160' : kind === 'apple' ? (t.dark ? '#fff' : '#000') : t.dark ? 'rgba(255,255,255,0.10)' : '#fff';

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
    Animated.timing(x, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
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
        gap: 10,
        height: 52,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.hairline,
      }}
    >
      {leading}
      {children}
    </View>
  );
}

const inputStyle = (t: Theme): TextStyle => ({ flex: 1, fontSize: 16, color: t.text, padding: 0 });

function CountryCode({ t }: { t: Theme }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingRight: 10,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: t.hairline,
        height: 24,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>+86</Text>
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
      <Press onPress={() => setShow(!show)} style={{ padding: 2 }}>
        {show ? <EyeOpen c={t.text3} /> : <EyeOff c={t.text3} />}
      </Press>
    </AuthField>
  );
}

// ── Segmented control (手机号 / 邮箱) ──────────────────────────────────────────
function AuthSeg<T extends string>({ t, value, options, onChange }: { t: Theme; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 13, backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Press key={o.id} onPress={() => onChange(o.id)} style={{ flex: 1 }}>
            <View
              style={[
                { height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.bg : 'transparent' },
                on ? shadow(0.1, 4, 1) : null,
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.text : t.text2 }}>{o.label}</Text>
            </View>
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
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 }}>
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <Pressable onPress={() => onChange(!value)} hitSlop={8}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: value ? t.accent : 'transparent',
              borderWidth: 1.5,
              borderColor: value ? t.accent : flash ? t.danger : t.text3,
            }}
          >
            {value && <CheckSmall />}
          </View>
        </Pressable>
      </Animated.View>
      <Text style={{ flex: 1, fontSize: 11.5, color: t.text2, lineHeight: 17 }}>
        {tr('auth.agree.prefix')}
        <Text onPress={() => onOpenDoc('agreement')} style={{ color: t.accent, fontWeight: '600' }}>
          {tr('auth.agree.agreement')}
        </Text>
        {tr('auth.agree.and')}
        <Text onPress={() => onOpenDoc('privacy')} style={{ color: t.accent, fontWeight: '600' }}>
          {tr('auth.agree.privacy')}
        </Text>
      </Text>
    </View>
  );
}

// ── Primary CTA ──────────────────────────────────────────────────────────────
function AuthCTA({ t, label, enabled, busy, onPress }: { t: Theme; label: string; enabled: boolean; busy?: boolean; onPress: () => void }) {
  const disabledBg = t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  return (
    <Press
      onPress={() => enabled && !busy && onPress()}
      style={[
        {
          height: 52,
          borderRadius: 16,
          marginTop: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: enabled ? t.accent : disabledBg,
        },
        enabled ? elevAccent(t.accent) : null,
      ]}
    >
      {busy ? (
        <Spinner size={18} color="#fff" track="rgba(255,255,255,0.4)" width={2} />
      ) : (
        <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: 0.2, color: enabled ? '#fff' : t.text3 }}>{label}</Text>
      )}
    </Press>
  );
}

// ── Back button (shared header chip) ──────────────────────────────────────────
function AuthBack({ t, top, onPress }: { t: Theme; top: number; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ position: 'absolute', top, left: 16, zIndex: 5 }}>
      <View
        style={[
          { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? '#2C2C2E' : '#FFFFFF' },
          shadow(t.dark ? 0.5 : 0.14, 10, 2),
        ]}
      >
        <BackArrow c={t.text} />
      </View>
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
    <Pressable onPress={() => ref.current?.focus()} style={{ marginTop: 30 }}>
      <TextInput
        ref={ref}
        value={code}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0 }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const active = i === code.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 56,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                borderWidth: 1.5,
                borderColor: active ? t.accent : t.hairline,
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
    <>
      <Text style={{ fontSize: 26, fontWeight: '700', color: t.text, letterSpacing: -0.5 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: t.text2, marginTop: 8, lineHeight: 21 }}>{sub}</Text>
    </>
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
function AuthMoreSheet({ t, onPick, onClose }: { t: Theme; onPick: (id: 'phone' | SocialId) => void; onClose: () => void }) {
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 2, speed: 16 }).start();
  }, [slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  const items: { id: 'phone' | SocialId; label: string; bg: string; icon: React.ReactNode; border?: boolean }[] = [
    { id: 'phone', label: tr('auth.more.phoneLogin'), bg: t.accent, icon: <PhoneGlyph /> },
    { id: 'wechat', label: '微信', bg: '#07C160', icon: <WeChatGlyph /> },
    { id: 'apple', label: 'Apple', bg: t.dark ? '#fff' : '#000', icon: <AppleGlyph c={t.dark ? '#000' : '#fff'} /> },
    { id: 'google', label: 'Google', bg: t.dark ? 'rgba(255,255,255,0.10)' : '#fff', icon: <GoogleGlyph />, border: !t.dark },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 80, justifyContent: 'flex-end' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={onClose} />
      <Animated.View
        style={[
          {
            transform: [{ translateY }],
            backgroundColor: t.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: insets.bottom + 20,
          },
          shadow(0.22, 30, -8),
        ]}
      >
        <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.hairline, alignSelf: 'center', marginBottom: 6 }} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: t.text, textAlign: 'center', paddingVertical: 10 }}>{tr('auth.more.title')}</Text>
        <View style={{ gap: 4 }}>
          {items.map((it) => (
            <Press key={it.id} onPress={() => onPick(it.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, paddingHorizontal: 6 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: it.bg,
                  borderWidth: it.border ? StyleSheet.hairlineWidth : 0,
                  borderColor: t.hairline,
                }}
              >
                {it.icon}
              </View>
              <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '600', color: t.text }}>{it.label}</Text>
              <ChevRight c={t.text3} />
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
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateX: x }] }]}>
      <AuthBack t={t} top={insets.top + 12} onPress={onBack} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateX: x }] }]}>
      <AuthBack t={t} top={insets.top + 12} onPress={onBack} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <StepTitle t={t} title={tr('auth.phone.title')} sub={tr('auth.phone.sub')} />
        <View style={{ marginTop: 26 }}>
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
        <AuthCTA t={t} label={tr('auth.phone.getCode')} enabled={valid} onPress={() => { if (!agree) { flashAgree(); return; } onNext(); }} />
        <View style={{ marginTop: 14 }}>
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
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 76, paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]}>
      <SlideStep t={t} stepKey={rstep}>
        {body}
      </SlideStep>
    </View>
  );
}

// Wraps each internal recover step so it re-slides in on step change (auth-push).
function SlideStep({ t, stepKey, children }: { t: Theme; stepKey: string; children: React.ReactNode }) {
  return <SlideStepInner key={stepKey} t={t} children={children} />;
}
function SlideStepInner({ t, children }: { t: Theme; children: React.ReactNode }) {
  const x = useSlideIn();
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, transform: [{ translateX: x }] }]}>{children}</Animated.View>;
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

// ── Round action button (找回账号 / 游客登录 / 更多方式登录) ─────────────────────
function AuthMoreButton({ t, label, onPress, icon }: { t: Theme; label: string; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Press onPress={onPress} style={{ alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.hairline,
        }}
      >
        {icon}
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11.5, color: t.text2, fontWeight: '500' }}>
        {label}
      </Text>
    </Press>
  );
}

// ── Entry screen + orchestrator ───────────────────────────────────────────────
export function AuthFlow({ theme, onSuccess }: { theme: Theme; onSuccess: () => void }) {
  const t = theme;
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const [intent, setIntent] = useState<'login' | 'register'>('login');
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
    setBusy(true);
    await signInAnonymously();
    setBusy(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 48, paddingHorizontal: 28, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* brand */}
          <View style={{ alignItems: 'center' }}>
            <LinearGradient
              colors={[t.accent, t.accent + 'c8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ width: 66, height: 66, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, elevAccent(t.accent)]}
            >
              <Text style={{ fontSize: 34, fontWeight: '700', color: '#fff' }}>开</Text>
            </LinearGradient>
          </View>

          <View style={{ marginTop: 40, gap: 12 }}>
            <AuthField t={t} leading={<Mail c={t.text3} />}>
              <TextInput
                value={email}
                onChangeText={(v) => setEmail(v.trim())}
                placeholder={tr('auth.emailPlaceholder')}
                placeholderTextColor={t.text3}
                autoCapitalize="none"
                keyboardType="email-address"
                style={inputStyle(t)}
              />
            </AuthField>
            <PasswordField t={t} value={pwd} onChangeText={setPwd} placeholder={intent === 'register' ? tr('auth.setPwdPlaceholder') : tr('auth.pwdPlaceholder')} show={showPwd} setShow={setShowPwd} />
          </View>

          <AuthCTA t={t} label={intent === 'register' ? tr('auth.registerCta') : tr('auth.loginCta')} enabled={entryEnabled} busy={busy} onPress={onPrimary} />
          {authError ? <Text style={{ color: '#FF3B30', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{authError}</Text> : null}

          <View style={{ marginTop: 14 }}>
            <AuthAgree t={t} value={agree} onChange={setAgree} flash={flash} onOpenDoc={setDoc} />
          </View>

          {/* account-switch + 忘记密码 */}
          <View style={{ marginTop: 28, minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 13, color: t.text2 }}>{intent === 'login' ? tr('auth.switch.noAccount') : tr('auth.switch.hasAccount')}</Text>
              <Press onPress={() => setIntent(intent === 'login' ? 'register' : 'login')} style={{ paddingHorizontal: 2, paddingVertical: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent }}>{intent === 'login' ? tr('auth.switch.toRegister') : tr('auth.switch.toLogin')}</Text>
              </Press>
            </View>
            {intent === 'login' && (
              <Press onPress={() => setStep('recover')} style={{ paddingHorizontal: 2, paddingVertical: 2 }}>
                <Text style={{ fontSize: 13, color: t.text2 }}>{tr('auth.forgotPwd')}</Text>
              </Press>
            )}
          </View>

          <View style={{ flex: 1 }} />

          {/* 其他方式登录 — pinned to the bottom */}
          <View style={{ paddingTop: 40 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.hairline }} />
              <Text style={{ fontSize: 12, color: t.text3 }}>{tr('auth.otherMethods')}</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.hairline }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 36 }}>
              <AuthMoreButton t={t} label={tr('auth.recover.title')} onPress={() => setStep('recover')} icon={<RecoverGlyph c={t.text2} />} />
              <AuthMoreButton t={t} label={tr('auth.guestLogin')} onPress={onGuest} icon={<GuestGlyph c={t.text2} />} />
              <AuthMoreButton t={t} label={tr('auth.moreMethods')} onPress={() => setMoreOpen(true)} icon={<DotsGlyph c={t.text2} />} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {moreOpen && (
        <AuthMoreSheet
          t={t}
          onClose={() => setMoreOpen(false)}
          onPick={(id) => {
            setMoreOpen(false);
            if (id === 'phone') setStep('phone');
            else onSocial(id);
          }}
        />
      )}
      {social && <AuthSocialOverlay t={t} kind={social} />}
    </View>
  );
}
