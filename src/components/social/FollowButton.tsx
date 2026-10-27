// FollowButton.tsx — 关注按钮：关注 / 申请关注 / 回关 / 已申请 / 已关注。
// 点下去先改本地状态，失败再改回来；取消关注和撤回请求要在动作面板里确认。
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { Theme } from '../../theme/theme';
import { radius, space } from '../../design-system';
import { Press } from '../Press';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { followUser, unfollowUser, type FollowState, type ProfileRelation } from '../../hooks/useSocial';

export function FollowButton({ theme, userId, nick, relation, isPrivate, block, hero, onChange }: {
  theme: Theme;
  userId: string;
  nick: string;
  relation: ProfileRelation;
  isPrivate: boolean;
  /** 主页上的整行按钮；列表行里是紧凑的胶囊。 */
  block?: boolean;
  /** 主页头部数字行右侧的胶囊，和整行按钮一样高。 */
  hero?: boolean;
  onChange?: (state: FollowState) => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const [state, setState] = useState<FollowState>(relation.following);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setState(relation.following); }, [relation.following]);

  if (relation.self) return null;

  const run = async (next: FollowState, action: () => Promise<unknown>) => {
    const prev = state;
    setState(next);
    setBusy(true);
    try {
      const result = await action();
      const settled = typeof result === 'string' ? (result as FollowState) : next;
      setState(settled);
      onChange?.(settled);
    } catch {
      setState(prev);
      nav.showToast(t('profile.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    if (busy) return;
    if (state === 'none') {
      void run(isPrivate ? 'pending' : 'accepted', () => followUser(userId));
      return;
    }
    nav.openActionSheet({
      title: state === 'accepted' ? t('profile.unfollowConfirm', { name: nick }) : undefined,
      items: [{
        label: state === 'accepted' ? t('profile.unfollow') : t('profile.withdrawRequest'),
        destructive: true,
        onPress: () => { void run('none', () => unfollowUser(userId)); },
      }],
    });
  };

  const filled = state === 'none';
  const label = state === 'accepted'
    ? relation.followedBy ? t('profile.mutual') : t('profile.followingState')
    : state === 'pending'
      ? t('profile.requested')
      : relation.followedBy ? t('profile.followBack') : isPrivate ? t('profile.requestFollow') : t('profile.follow');

  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      scaleTo={0.97}
      style={{
        height: block || hero ? 44 : 34,
        minWidth: block ? undefined : hero ? 96 : 76,
        alignSelf: block ? 'stretch' : 'center',
        paddingHorizontal: block ? space.md : hero ? space.lg : space.sm,
        borderRadius: radius.pill,
        backgroundColor: filled ? theme.accent : theme.fieldSurface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: block || hero ? 16 : 14, fontWeight: '600', color: filled ? '#fff' : theme.text }}>{label}</Text>
    </Press>
  );
}
