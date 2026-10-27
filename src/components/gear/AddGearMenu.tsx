// AddGearMenu.tsx — the 添加装备 popover. Every add entry opens it next to the
// control that was tapped; picking a row goes straight into that step, so there
// is no separate "choose a method" page.
import React from 'react';
import { GestureResponderEvent, Text, View, useWindowDimensions } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { Glass } from '../Glass';
import { useI18n } from '../../i18n';
import { GearMenuTransition } from './GearMenuTransition';

export type AddGearMethod = 'link' | 'photo' | 'manual';
export type MenuAnchor = { x: number; y: number; width: number; height: number };

const MENU_WIDTH = 210;
const EDGE = 14;
const GAP = 8;

/** Window rect of the pressed control, falling back to the touch point. */
export function measureAnchor(event: GestureResponderEvent): Promise<MenuAnchor> {
  const target = event.currentTarget as unknown as { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void } | null;
  const { pageX, pageY } = event.nativeEvent;
  return new Promise((resolve) => {
    if (target?.measureInWindow) target.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    else resolve({ x: pageX, y: pageY, width: 0, height: 0 });
  });
}

export function AddGearMenu({ theme, visible, anchor, onPick, onAssistant, onClose }: {
  theme: Theme;
  visible: boolean;
  anchor: MenuAnchor | null;
  onPick: (method: AddGearMethod) => void;
  /** Leaves for the assistant chat, so it sits apart from the in-place steps. */
  onAssistant?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const rows: [AddGearMethod, IconName, string][] = [
    ['link', 'link', t('gear.add.pasteLink')],
    ['photo', 'camera', t('gear.add.scanPhoto')],
    ['manual', 'edit', t('gear.add.manual')],
  ];
  return (
    <GearAnchoredMenu
      theme={theme}
      visible={visible}
      anchor={anchor}
      title={t('gear.add.title')}
      rows={[
        ...rows.map(([method, icon, label]) => ({ key: method, icon, label, onPress: () => onPick(method) })),
        ...(onAssistant ? [{ key: 'assistant', icon: 'message' as const, label: t('gear.add.assistant'), onPress: onAssistant }] : []),
      ]}
      onClose={onClose}
    />
  );
}

export type GearMenuRow = { key: string; icon: IconName; label: string; onPress: () => void };

/** Compact glass popover anchored next to the control that opened it. */
export function GearAnchoredMenu({ theme, visible, anchor, title, rows, onClose }: {
  theme: Theme;
  visible: boolean;
  anchor: MenuAnchor | null;
  title: string;
  rows: GearMenuRow[];
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const rect = anchor ?? { x: EDGE, y: height, width: 0, height: 0 };
  // Open away from the nearer screen edge so the menu never covers its own trigger.
  const above = rect.y + rect.height / 2 > height / 2;
  const alignLeft = rect.x + rect.width / 2 < width / 2;
  const vertical = above ? { bottom: height - rect.y + GAP } : { top: rect.y + rect.height + GAP };
  const horizontal = alignLeft
    ? { left: Math.min(Math.max(EDGE, rect.x), width - MENU_WIDTH - EDGE) }
    : { right: Math.min(Math.max(EDGE, width - rect.x - rect.width), width - MENU_WIDTH - EDGE) };

  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      placement={above ? 'bottom' : 'top'}
      backdropColor="transparent"
      positionStyle={{
        position: 'absolute',
        ...vertical,
        ...horizontal,
        width: MENU_WIDTH,
        borderRadius: 24,
        boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)',
      }}
    >
      <Glass solidOnAndroid theme={theme} radius={24} intensity={78}>
        <View style={{ paddingTop: 12, paddingBottom: 10, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
          <Text style={{ paddingHorizontal: 24, paddingTop: 2, paddingBottom: 5, fontSize: 11.5, fontWeight: '600', color: theme.text2 }}>{title}</Text>
          {rows.map((row) => (
            <Press key={row.key} accessibilityRole="button" onPress={row.onPress} style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 25, alignItems: 'center' }}><Icon name={row.icon} color={theme.text} size={19} strokeWidth={1.8} /></View>
              <Text style={{ marginLeft: 13, fontSize: 14.5, color: theme.text }}>{row.label}</Text>
            </Press>
          ))}
        </View>
      </Glass>
    </GearMenuTransition>
  );
}
