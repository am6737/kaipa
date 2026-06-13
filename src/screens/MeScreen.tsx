// MeScreen.tsx — the 我 tab. Ported faithfully from the prototype me-screen.jsx:
// a neutral-avatar profile header (bell → 消息中心), an 外观 card whose 主题 /
// 重点色 rows open anchored popovers, a 设置 card whose rows push real full-screen
// pages, and 退出登录. Appearance (mode + accent) drives the whole app's theming.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, ACCENT_PRESETS, AccentPreset } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { useAppearance } from '../theme/AppearanceContext';
import { useI18n, Lang, TKey } from '../i18n';
import { useNav } from '../nav/NavContext';
import { useNotifCenter } from '../data/notifications';
import { elevCard } from '../theme/shadow';
import { MeSection, MeCard, MeRow, ColorDot } from '../components/me/parts';
import { AccountPage, MeProfile } from '../components/me/AccountPage';
import { EditFieldPage, MeEditField } from '../components/me/EditFieldPage';
import { DevicesPage } from '../components/me/DevicesPage';
import { NotifSettingsPage, NotifSettings } from '../components/me/NotifSettingsPage';
import { NotifInboxPage } from '../components/me/NotifInboxPage';
import { FeedbackPage } from '../components/me/FeedbackPage';
import { AboutPage } from '../components/me/AboutPage';

type Anchor = { x: number; y: number; w: number; h: number };
type Popup = null | 'theme' | 'accent' | 'lang';

type MePage =
  | { type: 'account' }
  | { type: 'edit'; field: MeEditField }
  | { type: 'devices' }
  | { type: 'notif' }
  | { type: 'inbox' }
  | { type: 'feedback' }
  | { type: 'about' };

// One 外观 row: leading icon + label + current value + caret. Forwards a ref so
// the parent can anchor a popover under it via measureInWindow.
const AppearanceRow = React.forwardRef<View, {
  theme: Theme;
  icon: React.ReactNode;
  label: string;
  value: string;
  valueDot?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  last?: boolean;
}>(({ theme, icon, label, value, valueDot, open, onToggle, last }, ref) => (
  <View ref={ref} collapsable={false}>
    <Press onPress={onToggle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          minHeight: 56,
          paddingVertical: 9,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          backgroundColor: open ? (theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)') : 'transparent',
        }}
      >
        <View style={{ width: 24, alignItems: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, color: theme.text }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            {valueDot}
            <Text style={{ fontSize: 12, color: theme.text2 }}>{value}</Text>
          </View>
        </View>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <Icon name="chevronR" color={theme.text3} size={13} />
        </View>
      </View>
    </Press>
  </View>
));

function PopoverRow({
  theme,
  label,
  leading,
  active,
  onPress,
  last,
}: {
  theme: Theme;
  label: string;
  leading?: React.ReactNode;
  active?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Press onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          minHeight: 38,
          paddingVertical: 8,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        {leading}
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: theme.text }}>{label}</Text>
        {active ? <Icon name="check" color={theme.text} size={16} /> : null}
      </View>
    </Press>
  );
}

export function MeScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const { mode, accent, resolved, setMode, setAccent } = useAppearance();
  const { t, lang, setLang } = useI18n();
  const nav = useNav();
  const { unread } = useNotifCenter();

  const [profile, setProfile] = useState<MeProfile>({
    nick: '陈泽宇',
    username: '@chenzy',
    bio: '山野徒步爱好者',
    phone: '+86 138 **** 4521',
    email: 'chenzy@kaipa.app',
  });
  const [twoFA, setTwoFA] = useState(false);
  const [notif, setNotif] = useState<NotifSettings>({ push: true, social: true, system: false });

  const [stack, setStack] = useState<MePage[]>([]);
  const push = (pg: MePage) => setStack((s) => [...s, pg]);
  const pop = () => setStack((s) => s.slice(0, -1));

  const [popup, setPopup] = useState<Popup>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const themeRowRef = useRef<View>(null);
  const accentRowRef = useRef<View>(null);
  const langRowRef = useRef<View>(null);

  // Hide the floating tab bar whenever a sub-page is pushed.
  useEffect(() => {
    nav.setTabBarHidden(stack.length > 0);
  }, [stack.length, nav]);
  useEffect(() => () => nav.setTabBarHidden(false), [nav]);

  const showToast = nav.showToast;
  const saveEdit = (field: MeEditField, val: string) => {
    pop();
    if (field.key) setProfile((p) => ({ ...p, [field.key as keyof MeProfile]: val }));
    showToast(field.toast || t('common.saved'));
  };

  const toggle = (id: Exclude<Popup, null>, ref: React.RefObject<View | null>) => {
    if (popup === id) {
      setPopup(null);
      return;
    }
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setPopup(id);
    });
  };

  const themeModes: { id: 'system' | 'light' | 'dark'; label: string }[] = [
    { id: 'system', label: t('me.themeSystem') },
    { id: 'light', label: t('me.themeLight') },
    { id: 'dark', label: t('me.themeDark') },
  ];
  const modeLabel = (themeModes.find((m) => m.id === mode) || themeModes[0]).label;
  const themeIcon: IconName = mode === 'system' ? 'system' : resolved === 'dark' ? 'moon' : 'sun';

  const langs: { id: Lang; label: string }[] = [
    { id: 'system', label: t('me.langSystem') },
    { id: 'zh', label: t('me.langZh') },
    { id: 'en', label: t('me.langEn') },
  ];
  const langLabel = (langs.find((l) => l.id === lang) || langs[0]).label;

  // Accent preset display names are translated by their stable id (theme.ts
  // keeps the Chinese name only as a fallback label).
  const accentLabel = (id: string) => t(`accent.${id}` as TKey);
  const curAccent = accent || '#0A84FF';
  const curPreset = ACCENT_PRESETS.find((p) => p.color.toLowerCase() === curAccent.toLowerCase());
  const isPreset = !!curPreset;
  const accentName = curPreset ? accentLabel(curPreset.id) : t('common.custom');

  const confirmSignOut = () =>
    nav.openActionSheet({
      title: t('me.signOut'),
      message: t('me.signOutMessage'),
      items: [{ label: t('me.signOut'), destructive: true, onPress: () => nav.auth.signOut() }],
    });

  const renderPage = (pg: MePage) => {
    switch (pg.type) {
      case 'account':
        return (
          <AccountPage
            theme={theme}
            profile={profile}
            onBack={pop}
            onEdit={(f) => push({ type: 'edit', field: f })}
            onDevices={() => push({ type: 'devices' })}
            twoFA={twoFA}
            onToggleTwoFA={(v) => {
              setTwoFA(v);
              showToast(v ? t('me.twoFAOn') : t('me.twoFAOff'));
            }}
            showToast={showToast}
          />
        );
      case 'edit':
        return <EditFieldPage theme={theme} field={pg.field} onBack={pop} onSave={(v) => saveEdit(pg.field, v)} />;
      case 'devices':
        return <DevicesPage theme={theme} onBack={pop} showToast={showToast} />;
      case 'notif':
        return <NotifSettingsPage theme={theme} notif={notif} setNotif={setNotif} onBack={pop} />;
      case 'inbox':
        return <NotifInboxPage theme={theme} onBack={pop} showToast={showToast} />;
      case 'feedback':
        return (
          <FeedbackPage
            theme={theme}
            onBack={pop}
            onSubmit={() => {
              pop();
              showToast(t('me.feedbackThanks'));
            }}
          />
        );
      case 'about':
        return <AboutPage theme={theme} onBack={pop} showToast={showToast} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 140 }}
      >
        {/* profile header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.dark ? '#1C1C1E' : '#F2F2F4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '600', color: theme.text }}>{profile.nick.slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text }}>{profile.nick}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text2, marginTop: 3 }}>{profile.username}</Text>
          </View>
          {/* bell → 消息中心 */}
          <Press
            onPress={() => push({ type: 'inbox' })}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
              ...elevCard(theme),
            }}
          >
            <Icon name="bell" color={theme.text} size={20} />
            {unread > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 4,
                  backgroundColor: theme.danger,
                  borderWidth: 1.5,
                  borderColor: theme.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{unread}</Text>
              </View>
            ) : null}
          </Press>
        </View>

        {/* 外观 */}
        <MeSection theme={theme} title={t('me.appearance')}>
          <MeCard theme={theme}>
            <AppearanceRow
              ref={themeRowRef}
              theme={theme}
              icon={<Icon name={themeIcon} color={theme.text} size={18} />}
              label={t('me.theme')}
              value={modeLabel}
              open={popup === 'theme'}
              onToggle={() => toggle('theme', themeRowRef)}
            />
            <AppearanceRow
              ref={accentRowRef}
              theme={theme}
              icon={<ColorDot theme={theme} color={curAccent} size={20} dashed={!isPreset} />}
              label={t('me.accent')}
              value={accentName}
              open={popup === 'accent'}
              onToggle={() => toggle('accent', accentRowRef)}
            />
            <AppearanceRow
              ref={langRowRef}
              theme={theme}
              icon={<Icon name="globe" color={theme.text} size={18} />}
              label={t('me.language')}
              value={langLabel}
              open={popup === 'lang'}
              onToggle={() => toggle('lang', langRowRef)}
              last
            />
          </MeCard>
        </MeSection>

        {/* 设置 */}
        <MeSection theme={theme} title={t('me.settings')}>
          <MeCard theme={theme}>
            <MeRow theme={theme} label={t('me.account')} onPress={() => push({ type: 'account' })} />
            <MeRow theme={theme} label={t('me.notifications')} detail={notif.push ? t('common.on') : t('common.off')} onPress={() => push({ type: 'notif' })} />
            <MeRow theme={theme} label={t('me.helpFeedback')} onPress={() => push({ type: 'feedback' })} />
            <MeRow theme={theme} label={t('me.about')} detail="v1.0.2" onPress={() => push({ type: 'about' })} last />
          </MeCard>
        </MeSection>

        {/* 退出登录 */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <MeCard theme={theme}>
            <MeRow theme={theme} label={t('me.signOut')} danger onPress={confirmSignOut} last />
          </MeCard>
        </View>
      </ScrollView>

      {/* anchored 外观 popover + outside-tap catcher */}
      {popup && anchor ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPopup(null)} />
          <View style={{ position: 'absolute', top: anchor.y + anchor.h + 4, right: 16, width: 200 }}>
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                shadowColor: '#000',
                shadowOpacity: theme.dark ? 0.55 : 0.16,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 14 },
                elevation: 16,
              }}
            >
              {popup === 'theme'
                ? themeModes.map((m, i, arr) => (
                    <PopoverRow
                      key={m.id}
                      theme={theme}
                      label={m.id === 'system' ? t('me.themeSystemDefault') : m.label}
                      active={mode === m.id}
                      onPress={() => {
                        setMode(m.id);
                        setPopup(null);
                      }}
                      last={i === arr.length - 1}
                    />
                  ))
                : popup === 'lang'
                ? langs.map((l, i, arr) => (
                    <PopoverRow
                      key={l.id}
                      theme={theme}
                      label={l.label}
                      active={lang === l.id}
                      onPress={() => {
                        setLang(l.id);
                        setPopup(null);
                      }}
                      last={i === arr.length - 1}
                    />
                  ))
                : ACCENT_PRESETS.map((p: AccentPreset, i) => (
                    <PopoverRow
                      key={p.id}
                      theme={theme}
                      leading={<ColorDot theme={theme} color={p.color} size={14} />}
                      label={accentLabel(p.id)}
                      active={curAccent.toLowerCase() === p.color.toLowerCase()}
                      onPress={() => {
                        setAccent(p.color);
                        setPopup(null);
                      }}
                      last={i === ACCENT_PRESETS.length - 1}
                    />
                  ))}
            </View>
          </View>
        </>
      ) : null}

      {/* pushed full-screen pages */}
      {stack.map((pg, i) => (
        <View key={i + '-' + pg.type} style={[StyleSheet.absoluteFill, { zIndex: 60 + i }]}>
          {renderPage(pg)}
        </View>
      ))}
    </View>
  );
}
