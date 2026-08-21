// MeScreen.tsx — the 我 tab, using the app-wide overview/settings visual system.
// Appearance choices stay directly accessible while account and support rows
// continue to push the existing full-screen pages.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native';
import ReAnimated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, ACCENT_PRESETS } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { Press } from '../components/Press';
import { Avatar } from '../components/Avatar';
import { Glass } from '../components/Glass';
import { useAppearance } from '../theme/AppearanceContext';
import { useI18n, Lang, TKey } from '../i18n';
import { useNav } from '../nav/NavContext';
import { useData } from '../data/DataContext';
import { WEIGHT_UNITS, WeightUnit } from '../data/gear';
import { useNotifCenter } from '../data/notifications';
import { ColorDot } from '../components/me/parts';
import { AccountPage } from '../components/me/AccountPage';
import type { MeProfile } from '../components/me/AccountPage';
import { EditFieldPage, MeEditField } from '../components/me/EditFieldPage';
import { NotifSettingsPage, NotifSettings } from '../components/me/NotifSettingsPage';
import { NotifInboxPage } from '../components/me/NotifInboxPage';
import { FeedbackPage } from '../components/me/FeedbackPage';
import { AboutPage } from '../components/me/AboutPage';
import { AppCard, AppSectionHeader, layout, motion, radius, space, type } from '../design-system';
import { QrLoginScannerPage } from '../components/auth/QrLoginScannerPage';

type MePage =
  | { type: 'scanLogin' }
  | { type: 'account' }
  | { type: 'edit'; field: MeEditField }
  | { type: 'notif' }
  | { type: 'inbox' }
  | { type: 'feedback' }
  | { type: 'about' };

type AppearancePopup = 'theme' | 'accent' | 'language' | 'weight';
type PopupAnchor = { x: number; y: number; width: number; height: number };
const SETTINGS_ROW_HEIGHT = 78;
const flatMeCardStyle = { boxShadow: 'none' as const };

function AppearanceChevron({ theme, open }: { theme: Theme; open: boolean }) {
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motion.emphasized,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [open, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [90, -90])}deg` }],
  }));

  return (
    <ReAnimated.View style={animatedStyle}>
      <Icon name="chevronR" color={theme.text3} size={15} />
    </ReAnimated.View>
  );
}

const AppearanceRow = React.forwardRef<View, {
  theme: Theme;
  label: string;
  value: string;
  leading: React.ReactNode;
  open: boolean;
  onPress: () => void;
  last?: boolean;
}>(({ theme, label, value, leading, open, onPress }, ref) => (
  <View ref={ref} collapsable={false}>
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} scaleTo={1} opacityTo={1}>
      <View style={{ minHeight: SETTINGS_ROW_HEIGHT, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 32, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          {leading}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{value}</Text>
        </View>
        <AppearanceChevron theme={theme} open={open} />
      </View>
    </Press>
  </View>
));

function PopupOption({ theme, label, selected, onPress, leading }: { theme: Theme; label: string; selected: boolean; onPress: () => void; leading?: React.ReactNode; last?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} scaleTo={1} opacityTo={1}>
      <View style={{ minHeight: 54, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {leading}
        <Text style={{ flex: 1, fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? theme.accent : theme.text }}>{label}</Text>
        {selected ? <Icon name="check" color={theme.accent} size={17} /> : null}
      </View>
    </Press>
  );
}

function SettingsRow({
  theme,
  icon,
  label,
  detail,
  onPress,
  last,
}: {
  theme: Theme;
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" scaleTo={1} opacityTo={1}>
      <View
        style={{
          minHeight: SETTINGS_ROW_HEIGHT,
          paddingVertical: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
        }}
      >
        <View style={{ width: 32, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={theme.text2} size={19} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.cardTitle, { color: theme.text }]}>{label}</Text>
          {detail ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{detail}</Text> : null}
        </View>
        <Icon name="chevronR" color={theme.text3} size={15} />
      </View>
    </Press>
  );
}

export function MeScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { mode, accent, setMode, setAccent } = useAppearance();
  const { t, lang, setLang } = useI18n();
  const nav = useNav();
  const data = useData();
  const { unread } = useNotifCenter();

  const profile: MeProfile = {
    nick: data.profile.nick,
    username: data.profile.username ? `@${data.profile.username}` : '',
    bio: data.profile.bio,
    phone: data.profile.phone,
    email: data.profile.email,
  };
  const [notif, setNotif] = useState<NotifSettings>({ push: true, social: true, system: false });

  const [stack, setStack] = useState<MePage[]>([]);
  const push = (pg: MePage) => setStack((s) => [...s, pg]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const [appearancePopup, setAppearancePopup] = useState<AppearancePopup | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<PopupAnchor | null>(null);
  const themeRowRef = useRef<View>(null);
  const accentRowRef = useRef<View>(null);
  const languageRowRef = useRef<View>(null);
  const weightRowRef = useRef<View>(null);
  const appearanceProgress = useSharedValue(0);

  // Hide the floating tab bar whenever a sub-page is pushed.
  useEffect(() => {
    nav.setTabBarHidden(stack.length > 0);
  }, [stack.length, nav]);
  useEffect(() => () => nav.setTabBarHidden(false), [nav]);

  const showToast = nav.showToast;
  const saveEdit = async (field: MeEditField, val: string) => {
    try {
      if (field.key) {
        const dbKey = field.key === 'username' ? 'username' : field.key;
        const dbVal = field.key === 'username' ? val.replace(/^@/, '') : val;
        await data.updateProfile(dbKey, dbVal);
      }
      pop();
      showToast(field.toast || t('common.saved'));
    } catch {
      showToast(t('account.security.toastSaveFailed'));
    }
  };

  const themeModes: { id: 'system' | 'light' | 'dark'; label: string }[] = [
    { id: 'system', label: t('me.themeSystem') },
    { id: 'light', label: t('me.themeLight') },
    { id: 'dark', label: t('me.themeDark') },
  ];
  const langs: { id: Lang; label: string }[] = [
    { id: 'system', label: t('me.langSystem') },
    { id: 'zh', label: t('me.langZh') },
    { id: 'en', label: t('me.langEn') },
  ];
  const modeLabel = themeModes.find((item) => item.id === mode)?.label || themeModes[0].label;
  const langLabel = langs.find((item) => item.id === lang)?.label || langs[0].label;
  // Accent preset display names are translated by their stable id (theme.ts
  // keeps the Chinese name only as a fallback label).
  const accentLabel = (id: string) => t(`accent.${id}` as TKey);
  const curAccent = accent || '#0A84FF';
  const curPreset = ACCENT_PRESETS.find((p) => p.color.toLowerCase() === curAccent.toLowerCase());
  const accentName = curPreset ? accentLabel(curPreset.id) : t('common.custom');
  const openAppearancePopup = (popup: AppearancePopup, ref: React.RefObject<View | null>) => {
    if (appearancePopup === popup) {
      setAppearancePopup(null);
      return;
    }
    ref.current?.measureInWindow((x, y, width, height) => {
      setPopupAnchor({ x, y, width, height });
      setAppearancePopup(popup);
    });
  };

  useEffect(() => {
    if (!appearancePopup) {
      appearanceProgress.value = 0;
      return;
    }
    appearanceProgress.value = 0;
    appearanceProgress.value = withTiming(1, {
      duration: 460,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [appearancePopup, appearanceProgress]);

  const setGearWeightUnit = (unit: WeightUnit) => {
    data.updateProfile('gearWeightUnit', unit);
    showToast(t('me.gearWeightUnitSaved', { unit }));
  };

  const renderPage = (pg: MePage) => {
    switch (pg.type) {
      case 'scanLogin':
        return (
          <QrLoginScannerPage
            theme={theme}
            onBack={pop}
            onApproved={() => {
              pop();
              showToast(t('qrLogin.approvedToast'));
            }}
          />
        );
      case 'account':
        return (
          <AccountPage
            theme={theme}
            profile={profile}
            onBack={pop}
            onEdit={(f) => push({ type: 'edit', field: f })}
            showToast={showToast}
          />
        );
      case 'edit':
        return <EditFieldPage theme={theme} field={pg.field} onBack={pop} onSave={(v) => saveEdit(pg.field, v)} />;
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
  const popupWidth = Math.min(260, windowWidth - space.xl * 2);
  const popupHeight = appearancePopup === 'accent' ? 340 : appearancePopup === 'weight' ? 232 : 178;
  const popupCollapsedHeight = 16;
  const popupLeft = popupAnchor ? Math.max(space.xl, Math.min(popupAnchor.x + popupAnchor.width - popupWidth, windowWidth - popupWidth - space.xl)) : space.xl;
  const popupTop = popupAnchor
    ? Math.max(insets.top + space.xs, Math.min(popupAnchor.y + popupAnchor.height + space.xs, windowHeight - insets.bottom - popupHeight - space.md))
    : insets.top + space.xl;
  const popupMenuStyle = useAnimatedStyle(() => ({
    height: interpolate(appearanceProgress.value, [0, 1], [popupCollapsedHeight, popupHeight]),
  }));
  const popupContentStyle = useAnimatedStyle(() => ({
    opacity: appearanceProgress.value,
    transform: [{ translateY: interpolate(appearanceProgress.value, [0, 1], [-8, 0]) }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: theme.groupedBg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: insets.top + 3, paddingBottom: 140 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg }}>
          <Press
            onPress={() => push({ type: 'scanLogin' })}
            accessibilityRole="button"
            accessibilityLabel={t('me.scan')}
            scaleTo={1}
            opacityTo={1}
            style={{
              width: layout.iconButton,
              height: layout.iconButton,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.controlSurface,
            }}
          >
            <Icon name="scan" color={theme.text} size={21} />
          </Press>
          <Press
            onPress={() => push({ type: 'inbox' })}
            accessibilityRole="button"
            accessibilityLabel={t('me.inbox')}
            scaleTo={1}
            opacityTo={1}
            style={{
              width: layout.iconButton,
              height: layout.iconButton,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.controlSurface,
            }}
          >
            <Icon name="bell" color={theme.text} size={20} />
            {unread > 0 ? (
              <View style={{ position: 'absolute', top: 1, right: 1, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: theme.danger, borderWidth: 2, borderColor: theme.groupedBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#fff' }}>{unread}</Text>
              </View>
            ) : null}
          </Press>
        </View>

        <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { overflow: 'hidden', backgroundColor: theme.featureSurface, borderWidth: 0 }]}>
          <Press onPress={() => push({ type: 'account' })} accessibilityRole="button" scaleTo={1} opacityTo={1} style={{ padding: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 23, fontWeight: '800', letterSpacing: -0.4, color: theme.text }}>
                  {profile.nick || t('me.unnamed')}
                </Text>
              </View>
              <Avatar uri={data.profile.avatarUrl} size={68} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }} />
            </View>
            {profile.bio ? <Text numberOfLines={2} style={[type.body, { color: theme.text2, lineHeight: 20, marginTop: space.md }]}>{profile.bio}</Text> : null}
          </Press>
        </AppCard>

        <AppSectionHeader theme={theme} text={t('me.appearance')} marginTop={layout.sectionGap} />
        <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
          <AppearanceRow
            ref={themeRowRef}
            theme={theme}
            label={t('me.theme')}
            value={modeLabel}
            leading={<Icon name={mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'system'} color={theme.text2} size={19} />}
            open={appearancePopup === 'theme'}
            onPress={() => openAppearancePopup('theme', themeRowRef)}
          />
          <AppearanceRow
            ref={accentRowRef}
            theme={theme}
            label={t('me.accent')}
            value={accentName}
            leading={<ColorDot theme={theme} color={curAccent} size={20} dashed={!curPreset} />}
            open={appearancePopup === 'accent'}
            onPress={() => openAppearancePopup('accent', accentRowRef)}
          />
          <AppearanceRow
            ref={languageRowRef}
            theme={theme}
            label={t('me.language')}
            value={langLabel}
            leading={<Icon name="globe" color={theme.text2} size={19} />}
            open={appearancePopup === 'language'}
            onPress={() => openAppearancePopup('language', languageRowRef)}
            last
          />
        </AppCard>

        <AppSectionHeader theme={theme} text={t('me.preferences')} marginTop={layout.sectionGap} />
        <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
          <SettingsRow theme={theme} icon="bell" label={t('me.notifications')} detail={notif.push ? t('common.on') : t('common.off')} onPress={() => push({ type: 'notif' })} />
          <AppearanceRow
            ref={weightRowRef}
            theme={theme}
            label={t('me.gearWeightUnit')}
            value={data.profile.gearWeightUnit}
            leading={<Icon name="gearSettings" color={theme.text2} size={19} />}
            open={appearancePopup === 'weight'}
            onPress={() => openAppearancePopup('weight', weightRowRef)}
            last
          />
        </AppCard>

        <AppSectionHeader theme={theme} text={t('me.support')} marginTop={layout.sectionGap} />
        <AppCard theme={theme} radius={radius.feature} style={[flatMeCardStyle, { paddingHorizontal: space.md, borderWidth: 0 }]}>
          <SettingsRow theme={theme} icon="send" label={t('me.helpFeedback')} onPress={() => push({ type: 'feedback' })} />
          <SettingsRow theme={theme} icon="compass" label={t('me.about')} detail="v1.0.2" onPress={() => push({ type: 'about' })} last />
        </AppCard>

      </ScrollView>

      {appearancePopup && popupAnchor ? (
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => setAppearancePopup(null)}>
          <View style={StyleSheet.absoluteFill}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.055)' }]}
              onPress={() => setAppearancePopup(null)}
            />
            <ReAnimated.View
              style={[
                {
                  position: 'absolute',
                  top: popupTop,
                  left: popupLeft,
                  width: popupWidth,
                  borderRadius: 26,
                  overflow: 'hidden',
                  boxShadow: theme.dark ? '0px 18px 46px rgba(0,0,0,0.52)' : '0px 18px 46px rgba(0,0,0,0.18)',
                },
                popupMenuStyle,
              ]}
            >
              <Glass solidOnAndroid theme={theme} radius={26} intensity={76}>
                <View style={{ paddingVertical: space.xs, backgroundColor: theme.dark ? 'rgba(32,32,35,0.58)' : 'rgba(255,255,255,0.64)' }}>
                  <ReAnimated.View style={popupContentStyle}>
                    {appearancePopup === 'theme'
                      ? themeModes.map((item, index) => (
                          <PopupOption
                            key={item.id}
                            theme={theme}
                            label={item.id === 'system' ? t('me.themeSystemDefault') : item.label}
                            selected={mode === item.id}
                            onPress={() => {
                              setMode(item.id);
                              setAppearancePopup(null);
                            }}
                            last={index === themeModes.length - 1}
                          />
                        ))
                      : appearancePopup === 'language'
                        ? langs.map((item, index) => (
                            <PopupOption
                              key={item.id}
                              theme={theme}
                              label={item.label}
                              selected={lang === item.id}
                              onPress={() => {
                                setLang(item.id);
                                setAppearancePopup(null);
                              }}
                              last={index === langs.length - 1}
                            />
                          ))
                        : appearancePopup === 'weight'
                          ? WEIGHT_UNITS.map((unit, index) => (
                              <PopupOption
                                key={unit}
                                theme={theme}
                                label={unit}
                                selected={data.profile.gearWeightUnit === unit}
                                onPress={() => {
                                  setGearWeightUnit(unit);
                                  setAppearancePopup(null);
                                }}
                                last={index === WEIGHT_UNITS.length - 1}
                              />
                            ))
                        : ACCENT_PRESETS.map((preset) => {
                            const selected = curAccent.toLowerCase() === preset.color.toLowerCase();
                            return (
                              <PopupOption
                                key={preset.id}
                                theme={theme}
                                label={accentLabel(preset.id)}
                                leading={<ColorDot theme={theme} color={preset.color} size={20} />}
                                selected={selected}
                                onPress={() => {
                                  setAccent(preset.color);
                                  setAppearancePopup(null);
                                }}
                              />
                            );
                          })}
                  </ReAnimated.View>
                </View>
              </Glass>
            </ReAnimated.View>
          </View>
        </Modal>
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
