// VisibilityPicker.tsx — 「谁可以看到」选择器，出行与装备清单共用。
// 当前项用 check 图标标出，再点一次不触发任何写入。
import type { NavValue } from '../../nav/NavContext';
import type { TKey, TVars } from '../../i18n';
import type { Visibility } from '../../hooks/useSocial';

type Translate = (key: TKey, vars?: TVars) => string;

const OPTIONS: { value: Visibility; labelKey: TKey }[] = [
  { value: 'private', labelKey: 'profile.visPrivate' },
  { value: 'followers', labelKey: 'profile.visFollowers' },
  { value: 'public', labelKey: 'profile.visPublic' },
];

export function visibilityLabel(t: Translate, visibility: Visibility) {
  return t(visibility === 'public' ? 'profile.visPublic' : visibility === 'followers' ? 'profile.visFollowers' : 'profile.visPrivate');
}

export function openVisibilityPicker(
  nav: NavValue,
  t: Translate,
  current: Visibility,
  onPick: (visibility: Visibility) => void,
) {
  nav.openActionSheet({
    title: t('profile.visibilityTitle'),
    items: OPTIONS.map((option) => ({
      label: t(option.labelKey),
      icon: option.value === current ? 'check' : undefined,
      onPress: () => {
        if (option.value !== current) onPick(option.value);
      },
    })),
  });
}
