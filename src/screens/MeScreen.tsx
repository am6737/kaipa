// MeScreen.tsx — the 我 tab: profile, appearance (theme mode + accent — this
// drives the whole app's theming), settings, and sign out.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Avatar } from '../components/Avatar';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { useAppearance } from '../theme/AppearanceContext';
import { ACCENT_PRESETS } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { useNotifCenter } from '../data/notifications';

function Section({ theme, title, children }: { theme: Theme; title?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      {title ? (
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.text3, letterSpacing: 1, textTransform: 'uppercase', marginLeft: 32, marginBottom: 8 }}>
          {title}
        </Text>
      ) : null}
      <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        {children}
      </View>
    </View>
  );
}

function Row({ theme, icon, iconBg, title, detail, onPress, isLast, danger }: { theme: Theme; icon?: IconName; iconBg?: string; title: string; detail?: string; onPress?: () => void; isLast?: boolean; danger?: boolean }) {
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 14, borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      {icon ? (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: iconBg || theme.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Icon name={icon} color={danger ? theme.danger : iconBg ? '#fff' : theme.accent} size={17} />
        </View>
      ) : null}
      <Text style={{ flex: 1, fontSize: 16, color: danger ? theme.danger : theme.text }}>{title}</Text>
      {detail ? <Text style={{ fontSize: 15, color: theme.text2, marginRight: 6 }}>{detail}</Text> : null}
      {onPress && !danger ? <Icon name="chevronR" color={theme.text3} size={15} /> : null}
    </Press>
  );
}

export function MeScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const { mode, accent, setMode, setAccent } = useAppearance();
  const nav = useNav();
  const { unread } = useNotifCenter();

  const modeOptions: { id: 'system' | 'light' | 'dark'; label: string }[] = [
    { id: 'system', label: '系统' },
    { id: 'light', label: '浅色' },
    { id: 'dark', label: '深色' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? '#000' : '#F2F2F7' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 120 }}>
        {/* profile header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 }}>
          <Avatar ini="陈" color={theme.accent} size={56} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>陈泽宇</Text>
            <Text style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2, marginTop: 2 }}>@chenzeyu · 12 段旅程</Text>
          </View>
          <Press onPress={() => nav.showToast('通知中心')} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : '#fff' }}>
            <Icon name="bell" color={theme.text} size={20} />
            {unread > 0 && <View style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger, borderWidth: 1.5, borderColor: theme.dark ? '#000' : '#fff' }} />}
          </Press>
        </View>

        {/* appearance */}
        <Section theme={theme} title="外观">
          <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Text style={{ fontSize: 16, color: theme.text, marginBottom: 10 }}>主题</Text>
            <View style={{ flexDirection: 'row', padding: 3, borderRadius: 11, gap: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }}>
              {modeOptions.map((o) => {
                const active = mode === o.id;
                return (
                  <Press key={o.id} onPress={() => setMode(o.id)} style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: active ? (theme.dark ? '#1C1C1E' : '#fff') : 'transparent' }}>
                    <Icon name={o.id === 'system' ? 'system' : o.id === 'light' ? 'sun' : 'moon'} color={active ? theme.accent : theme.text2} size={18} />
                    <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? theme.text : theme.text2, marginTop: 4 }}>{o.label}</Text>
                  </Press>
                );
              })}
            </View>
          </View>
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ fontSize: 16, color: theme.text, marginBottom: 12 }}>重点色</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {ACCENT_PRESETS.map((p) => {
                const active = accent.toLowerCase() === p.color.toLowerCase();
                return (
                  <Press key={p.id} onPress={() => setAccent(p.color)} style={{ alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 19, borderWidth: active ? 2.5 : 0, borderColor: theme.text }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.color }} />
                  </Press>
                );
              })}
            </View>
          </View>
        </Section>

        {/* settings */}
        <Section theme={theme} title="设置">
          <Row theme={theme} icon="user" iconBg="#0A84FF" title="账户与登录" onPress={() => nav.showToast('账户与登录')} />
          <Row theme={theme} icon="bell" iconBg="#FF9F0A" title="通知" detail={unread ? String(unread) : undefined} onPress={() => nav.showToast('通知设置')} />
          <Row theme={theme} icon="people" iconBg="#34C759" title="帮助与反馈" onPress={() => nav.showToast('帮助与反馈')} />
          <Row theme={theme} icon="compass" iconBg="#5E5CE6" title="关于 kaipa" detail="1.2.0" onPress={() => nav.showToast('关于 kaipa')} isLast />
        </Section>

        {/* sign out */}
        <Section theme={theme}>
          <Row
            theme={theme}
            title="退出登录"
            danger
            isLast
            onPress={() =>
              nav.openActionSheet({
                title: '确认退出登录？',
                items: [{ label: '退出登录', destructive: true, onPress: () => nav.auth.signOut() }],
              })
            }
          />
        </Section>
        <Text style={{ textAlign: 'center', color: theme.text3, fontSize: 11, marginTop: 18, fontFamily: MONO }}>kaipa · v1.2.0 (1)</Text>
      </ScrollView>
    </View>
  );
}
