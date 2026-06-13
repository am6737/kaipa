// JourneySettings.tsx — 旅程设置: companion sharing, photo moderation and
// visibility for one's own journey. Opened from the journey detail's 更多 menu.
// Ported from the prototype's journey-settings.jsx (toggles are session-local —
// a faithful, working settings surface without a backend).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { FullOverlay } from './FullOverlay';
import { useI18n } from '../../i18n';

function Toggle({ theme, on, onChange }: { theme: Theme; on: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: on ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [on, anim]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });
  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)', '#34C759'],
  });
  return (
    <Press onPress={() => onChange(!on)} scaleTo={0.9}>
      <Animated.View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: '#fff',
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Animated.View>
    </Press>
  );
}

function Section({ theme, title, footer, children }: { theme: Theme; title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      {title ? (
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text3, letterSpacing: 0.6, marginBottom: 9, marginLeft: 4 }}>{title}</Text>
      ) : null}
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
        }}
      >
        {children}
      </View>
      {footer ? <Text style={{ fontSize: 11.5, color: theme.text3, lineHeight: 17, marginTop: 9, marginLeft: 6 }}>{footer}</Text> : null}
    </View>
  );
}

function Row({
  theme,
  icon,
  title,
  sub,
  trailing,
  onPress,
  last,
}: {
  theme: Theme;
  icon?: IconName;
  title: string;
  sub?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 12, minHeight: 54 }}>
      {icon ? (
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={theme.accent} size={18} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>{title}</Text>
        {sub ? (
          <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2, lineHeight: 16 }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  return (
    <>
      {onPress ? <Press onPress={onPress}>{body}</Press> : body}
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: icon ? 59 : 14 }} /> : null}
    </>
  );
}

export function JourneySettings({
  theme,
  poi,
  onClose,
  onToast,
  onEdit,
}: {
  theme: Theme;
  poi: Poi;
  onClose: () => void;
  onToast: (msg: string) => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const [linkOn, setLinkOn] = useState(true);
  const [allowUpload, setAllowUpload] = useState(true);
  const [moderate, setModerate] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(true);

  return (
    <FullOverlay theme={theme} title={t('journey.settings.title')} subtitle={poi.name} onClose={onClose} zIndex={150}>
      <View style={{ padding: 16, paddingTop: 18 }}>
        <Section theme={theme} title={t('journey.settings.infoSection')}>
          <Row
            theme={theme}
            title={t('journey.settings.editInfo')}
            sub={t('journey.settings.editInfoSub')}
            onPress={onEdit}
            trailing={<Icon name="chevronR" color={theme.text3} size={16} />}
            last
          />
        </Section>

        <Section theme={theme} title={t('journey.settings.shareSection')} footer={t('journey.settings.shareFooter')}>
          <Row theme={theme} title={t('journey.settings.enableLink')} sub={t('journey.settings.enableLinkSub')} trailing={<Toggle theme={theme} on={linkOn} onChange={setLinkOn} />} />
          <Row theme={theme} title={t('journey.settings.allowUpload')} sub={t('journey.settings.allowUploadSub')} trailing={<Toggle theme={theme} on={allowUpload} onChange={setAllowUpload} />} last />
        </Section>

        <Section theme={theme} title={t('journey.settings.photoSection')} footer={t('journey.settings.photoFooter')}>
          <Row theme={theme} title={t('journey.settings.moderate')} sub={moderate ? t('journey.settings.moderateOnSub') : t('journey.settings.moderateOffSub')} trailing={<Toggle theme={theme} on={moderate} onChange={setModerate} />} last />
        </Section>

        <Section theme={theme} title={t('journey.settings.visibilitySection')} footer={t('journey.settings.visibilityFooter')}>
          <Row theme={theme} title={t('journey.settings.inviteOnly')} sub={t('journey.settings.inviteOnlySub')} trailing={<Toggle theme={theme} on={inviteVisible} onChange={setInviteVisible} />} last />
        </Section>

        <Section theme={theme}>
          <Row
            theme={theme}
            title={t('journey.settings.previewGuest')}
            sub={t('journey.settings.previewGuestSub')}
            onPress={() => onToast(t('journey.settings.previewToast'))}
            trailing={<Icon name="chevronR" color={theme.text3} size={16} />}
            last
          />
        </Section>
      </View>
    </FullOverlay>
  );
}
