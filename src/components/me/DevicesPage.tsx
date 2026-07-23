// DevicesPage.tsx — 登录设备 list + 退出其他设备. Mirrors the prototype DevicesPage.
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { MeCard, MeRow } from './parts';
import { space, type } from '../../design-system';

function PhoneIcon({ c }: { c: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={3} width={10} height={18} rx={2.4} stroke={c} strokeWidth={1.7} />
      <Path d="M11 18.5h2" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}
function LaptopIcon({ c }: { c: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={11} rx={1.8} stroke={c} strokeWidth={1.7} />
      <Path d="M2 20h20" stroke={c} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

function DeviceRow({
  theme,
  icon,
  name,
  meta,
  current,
  last,
}: {
  theme: Theme;
  icon: React.ReactNode;
  name: string;
  meta: string;
  current?: boolean;
  last?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 78,
        paddingHorizontal: space.md,
        paddingVertical: space.md,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[type.cardTitle, { color: theme.text }]}>{name}</Text>
        <Text style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{meta}</Text>
      </View>
      {current ? <Text style={{ fontSize: 12, fontWeight: '600', color: '#34C759' }}>{t('account.devices.current')}</Text> : null}
    </View>
  );
}

export function DevicesPage({
  theme,
  onBack,
  showToast,
}: {
  theme: Theme;
  onBack: () => void;
  showToast: (m: string) => void;
}) {
  const { t } = useI18n();
  return (
    <MePushPage theme={theme} title={t('account.devices.pageTitle')} onBack={onBack}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
        <MeCard theme={theme}>
          <DeviceRow theme={theme} icon={<PhoneIcon c={theme.text2} />} name="iPhone 15 Pro" meta="上海 · 刚刚活跃" current />
          <DeviceRow theme={theme} icon={<LaptopIcon c={theme.text2} />} name="MacBook Air" meta="上海 · 3 天前" last />
        </MeCard>
        <View style={{ marginTop: space.xl }}>
          <MeCard theme={theme}>
            <MeRow theme={theme} label={t('account.devices.logOutOthers')} danger onPress={() => showToast(t('account.devices.toastLoggedOutOthers'))} last />
          </MeCard>
        </View>
      </View>
    </MePushPage>
  );
}
