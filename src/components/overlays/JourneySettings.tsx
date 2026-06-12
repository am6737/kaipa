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
  const [linkOn, setLinkOn] = useState(true);
  const [allowUpload, setAllowUpload] = useState(true);
  const [moderate, setModerate] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(true);

  return (
    <FullOverlay theme={theme} title="旅程设置" subtitle={poi.name} onClose={onClose} zIndex={150}>
      <View style={{ padding: 16, paddingTop: 18 }}>
        <Section theme={theme} title="旅程信息">
          <Row
            theme={theme}
            title="编辑旅程信息"
            sub="名称、地区、行程与简介"
            onPress={onEdit}
            trailing={<Icon name="chevronR" color={theme.text3} size={16} />}
            last
          />
        </Section>

        <Section theme={theme} title="同行与分享" footer="任何拿到链接的人都能通过邀请链接加入并上传照片。需要时可随时停用链接。">
          <Row theme={theme} title="启用邀请链接" sub="关闭后旧链接立即失效" trailing={<Toggle theme={theme} on={linkOn} onChange={setLinkOn} />} />
          <Row theme={theme} title="同行可上传照片" sub="允许加入的人把照片传到旅程瞬间" trailing={<Toggle theme={theme} on={allowUpload} onChange={setAllowUpload} />} last />
        </Section>

        <Section theme={theme} title="照片" footer="开启后，同行上传的照片需要你确认才会出现在旅程瞬间里。">
          <Row theme={theme} title="新照片需要我确认" sub={moderate ? '上传后进入待审核' : '上传后直接显示'} trailing={<Toggle theme={theme} on={moderate} onChange={setModerate} />} last />
        </Section>

        <Section theme={theme} title="可见范围" footer="仅受邀的人能看到这段旅程和它的照片。">
          <Row theme={theme} title="仅受邀可见" sub="不会出现在「发现」里" trailing={<Toggle theme={theme} on={inviteVisible} onChange={setInviteVisible} />} last />
        </Section>

        <Section theme={theme}>
          <Row
            theme={theme}
            title="预览访客看到的页面"
            sub="以同行的视角打开链接"
            onPress={() => onToast('预览访客视角')}
            trailing={<Icon name="chevronR" color={theme.text3} size={16} />}
            last
          />
        </Section>
      </View>
    </FullOverlay>
  );
}
