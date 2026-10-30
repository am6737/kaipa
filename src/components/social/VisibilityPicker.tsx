// VisibilityPicker.tsx — 「谁可以看到」选择器，出行、轨迹、旅程与装备清单共用。
// 在点开它的控件旁弹出玻璃浮层菜单，当前项用 check 标出，再点一次不触发任何写入。
import React, { useCallback, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { GearAnchoredMenu, measureAnchor, type MenuAnchor } from '../gear/AddGearMenu';
import type { IconName } from '../Icon';
import { useI18n, type TKey, type TVars } from '../../i18n';
import type { Theme } from '../../theme/theme';
import type { Visibility } from '../../hooks/useSocial';

type Translate = (key: TKey, vars?: TVars) => string;

const OPTIONS: { value: Visibility; labelKey: TKey; icon: IconName }[] = [
  { value: 'private', labelKey: 'profile.visPrivate', icon: 'eyeOff' },
  { value: 'followers', labelKey: 'profile.visFollowers', icon: 'people' },
  { value: 'public', labelKey: 'profile.visPublic', icon: 'globe' },
];

export function visibilityLabel(t: Translate, visibility: Visibility) {
  return t(visibility === 'public' ? 'profile.visPublic' : visibility === 'followers' ? 'profile.visFollowers' : 'profile.visPrivate');
}

type Open = { anchor: MenuAnchor; current: Visibility; onPick: (visibility: Visibility) => void };

/** `open` takes the press event of the control (or its window rect) so the menu lands next to it; render `menu` once in the screen. */
export function useVisibilityPicker(theme: Theme) {
  const { t } = useI18n();
  // 关闭时保留上一次的锚点，否则淡出的菜单会跳去兜底位置。
  const [state, setState] = useState<Open | null>(null);
  const [visible, setVisible] = useState(false);

  const open = useCallback((from: GestureResponderEvent | MenuAnchor, current: Visibility, onPick: (visibility: Visibility) => void) => {
    const show = (anchor: MenuAnchor) => {
      setState({ anchor, current, onPick });
      setVisible(true);
    };
    if ('nativeEvent' in from) void measureAnchor(from).then(show);
    else show(from);
  }, []);
  const close = useCallback(() => setVisible(false), []);

  const menu = (
    <GearAnchoredMenu
      theme={theme}
      visible={visible}
      anchor={state?.anchor ?? null}
      title={t('profile.visibilityTitle')}
      rows={OPTIONS.map((option) => ({
        key: option.value,
        icon: option.icon,
        label: t(option.labelKey),
        selected: option.value === state?.current,
        onPress: () => {
          setVisible(false);
          if (state && option.value !== state.current) state.onPick(option.value);
        },
      }))}
      onClose={close}
    />
  );
  return { open, menu };
}
