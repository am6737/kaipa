// ProfileHero.tsx — 主页头部：头像、昵称、简介，以及粉丝和关注数。
// 头像和昵称横排，简介在下；数字行右侧放关注按钮或找人；不放统计卡。
import React, { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import type { Theme } from '../../../theme/theme';
import { layout, radius, space, type } from '../../../design-system';
import { Avatar } from '../../Avatar';
import { Press } from '../../Press';
import { useI18n } from '../../../i18n';

const BIO_LINES = 2;

export function ProfileHero({
  theme, avatarUri, nick, username, bio, followers, following,
  onPressIdentity, identityLabel, onPressFollowers, onPressFollowing, onFindPeople, action,
}: {
  theme: Theme;
  avatarUri?: string | null;
  nick: string;
  username?: string | null;
  bio?: string | null;
  followers: number;
  following: number;
  onPressIdentity?: () => void;
  identityLabel?: string;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
  onFindPeople?: () => void;
  /** 数字行右侧的主操作：别人主页的关注按钮。 */
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const [bioOpen, setBioOpen] = useState(false);
  const [bioClipped, setBioClipped] = useState(false);
  return (
    <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.md }}>
      {/* 头像和昵称横排，昵称、@username 填在头像右侧。 */}
      <Press
        accessibilityRole={onPressIdentity ? 'button' : undefined}
        accessibilityLabel={identityLabel}
        disabled={!onPressIdentity}
        onPress={onPressIdentity}
        scaleTo={0.99}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <Avatar uri={avatarUri ?? undefined} size={72} style={{ backgroundColor: theme.fieldSurface }} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>
          <Text numberOfLines={2} style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: theme.text }}>{nick}</Text>
          {username ? (
            <View style={{ marginTop: space.xs, paddingVertical: 5, paddingHorizontal: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: theme.border }}>
              <Text numberOfLines={1} style={[type.small, { color: theme.text }]}>@{username}</Text>
            </View>
          ) : null}
        </View>
      </Press>

      {bio ? (
        <View style={{ marginTop: space.md }}>
          {/* 先不限行数量一次，知道会不会被截断，再决定要不要「展开」。 */}
          {!bioClipped && !bioOpen ? (
            <Text
              style={[type.body, { position: 'absolute', left: 0, right: 0, opacity: 0, lineHeight: 22 }]}
              pointerEvents="none"
              onTextLayout={(event) => { if (event.nativeEvent.lines.length > BIO_LINES) setBioClipped(true); }}
            >
              {bio}
            </Text>
          ) : null}
          <Text numberOfLines={bioOpen ? undefined : BIO_LINES} style={[type.body, { color: theme.text2, lineHeight: 22 }]}>{bio}</Text>
          {bioClipped ? (
            <Press onPress={() => setBioOpen((open) => !open)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: space.xxs }}>
              <Text style={[type.chip, { color: theme.accent }]}>{t(bioOpen ? 'profile.bioLess' : 'profile.bioMore')}</Text>
            </Press>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxxl + space.xl, marginTop: space.lg }}>
        <Count theme={theme} value={followers} label={t('profile.followers')} onPress={onPressFollowers} />
        <Count theme={theme} value={following} label={t('profile.following')} onPress={onPressFollowing} />
        <View style={{ flex: 1 }} />
        {action}
        {onFindPeople ? (
          <Press
            onPress={onFindPeople}
            accessibilityRole="button"
            accessibilityLabel={t('profile.findPeople')}
            style={{
              width: layout.iconButton,
              height: layout.iconButton,
              borderRadius: radius.control + 3,
              backgroundColor: theme.fieldSurface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserPlus color={theme.text} size={21} strokeWidth={2} />
          </Press>
        ) : null}
      </View>
    </View>
  );
}

function Count({ theme, value, label, onPress }: { theme: Theme; value: number; label: string; onPress?: () => void }) {
  return (
    <Press
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label} ${value}`}
      style={{ alignItems: 'flex-start' }}
    >
      <Text style={[type.small, { color: theme.text2 }]}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, fontVariant: ['tabular-nums'], marginTop: 2 }}>{value.toLocaleString()}</Text>
    </Press>
  );
}

export function ProfileTabs<K extends string>({ theme, tabs, active, onChange }: {
  theme: Theme;
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.featureSurface, paddingTop: space.xxs, paddingHorizontal: layout.pagePadding }}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Press
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            scaleTo={1}
            style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16, fontWeight: on ? '700' : '600', color: on ? theme.text : theme.text3 }}>{tab.label}</Text>
            {on ? (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, borderRadius: 2, backgroundColor: theme.text }} />
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}
