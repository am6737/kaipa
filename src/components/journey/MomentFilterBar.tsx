// MomentFilterBar.tsx — 瞬间 tab 的筛选行：类型 chip + 同行人 facepile。
// 某一维只有一个取值时整维消失；单一类型且单人时退化成一行计数。
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { radius, space, type } from '../../design-system';
import { Avatar } from '../Avatar';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';

export type MomentFilterKind = 'all' | 'photo' | 'video' | 'livePhoto';

export type MomentFilterAuthor = {
  key: string;
  name: string;
  avatarUrl?: string;
};

const AVATAR = 28;
const OVERLAP = -10;
const PILE_MAX = 3;

export function MomentFilterBar({
  theme,
  surface,
  typeOptions,
  selectedType,
  onSelectType,
  authors,
  selectedAuthor,
  onSelectAuthor,
  onOpenPeople,
  peopleAnchorRef,
  peopleLabel,
  label,
  active,
  onClear,
}: {
  theme: Theme;
  /** Colour the avatar rings cut into, i.e. the surface this bar sits on. */
  surface: string;
  typeOptions: { id: MomentFilterKind; label: string; icon: IconName; count: number }[];
  selectedType: MomentFilterKind;
  onSelectType: (kind: MomentFilterKind) => void;
  authors: MomentFilterAuthor[];
  selectedAuthor: string | null;
  onSelectAuthor: (key: string | null) => void;
  onOpenPeople: () => void;
  peopleAnchorRef?: React.Ref<View>;
  /** Accessibility label for the overflow button that opens the full roster. */
  peopleLabel: string;
  label: string;
  active: boolean;
  onClear: () => void;
}) {
  const types = typeOptions.filter((option) => option.id === 'all' || option.id === selectedType || option.count > 0);
  const showTypes = types.length > 2;
  const showPeople = authors.length > 1;
  const pile = selectedAuthor
    ? [
        ...authors.filter((author) => author.key === selectedAuthor),
        ...authors.filter((author) => author.key !== selectedAuthor),
      ].slice(0, PILE_MAX)
    : authors.slice(0, PILE_MAX);
  const overflow = authors.length - pile.length;
  const labelStyle = [
    type.caption,
    { fontFamily: MONO, fontWeight: '700' as const, color: active ? theme.accent : theme.text3 },
  ];

  const clearButton = active ? (
    <Press
      key="clear"
      onPress={onClear}
      accessibilityRole="button"
      style={{
        width: AVATAR,
        height: AVATAR,
        borderRadius: AVATAR / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      <Icon name="close" color={theme.text2} size={13} strokeWidth={2} />
    </Press>
  ) : null;

  const peopleRow = showPeople ? (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {pile.map((author, index) => {
        const selected = author.key === selectedAuthor;
        return (
          <View
            key={`${author.key}-${index}`}
            style={{ marginLeft: index === 0 ? 0 : OVERLAP, zIndex: pile.length - index }}
          >
            <Press
              scaleTo={0.94}
              onPress={() => onSelectAuthor(selected ? null : author.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={author.name}
              style={{ width: AVATAR, height: AVATAR }}
            >
              <Avatar uri={author.avatarUrl} size={AVATAR} ring ringColor={selected ? theme.accent : surface} />
            </Press>
          </View>
        );
      })}
      {overflow > 0 ? (
        <View ref={peopleAnchorRef} collapsable={false} style={{ marginLeft: OVERLAP }}>
          <Press
            scaleTo={0.94}
            onPress={onOpenPeople}
            accessibilityRole="button"
            accessibilityLabel={peopleLabel}
            style={{
              height: AVATAR,
              minWidth: AVATAR,
              paddingHorizontal: space.xs,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.fieldSurface,
              borderWidth: 2,
              borderColor: surface,
            }}
          >
            <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>
              +{overflow}
            </Text>
          </Press>
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={{ marginBottom: space.sm, gap: space.xs }}>
      {showTypes ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xxs }}>
          {clearButton}
          {types.map((option) => {
            const selected = option.id === selectedType;
            return (
              <Press
                key={option.id}
                scaleTo={0.96}
                onPress={() => onSelectType(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  height: AVATAR,
                  paddingHorizontal: space.sm,
                  borderRadius: radius.pill,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.xxs,
                  backgroundColor: selected ? theme.accent : theme.fieldSurface,
                  boxShadow: selected ? `0px 3px 10px ${theme.accentShadow}` : undefined,
                }}
              >
                <Icon
                  name={option.icon}
                  color={selected ? '#fff' : theme.text2}
                  size={13}
                  strokeWidth={selected ? 2.1 : 1.7}
                />
                <Text style={[type.body, { fontSize: 13, fontWeight: '600', color: selected ? '#fff' : theme.text2 }]}>
                  {option.label}
                </Text>
                <Text
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: '700',
                    color: selected ? 'rgba(255,255,255,0.8)' : theme.text3,
                  }}
                >
                  {option.count}
                </Text>
              </Press>
            );
          })}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        {showTypes ? null : clearButton}
        {peopleRow}
        <Text numberOfLines={1} style={[labelStyle, { flex: 1, textAlign: 'right' }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}
