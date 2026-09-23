// MomentFilterBar.tsx — 瞬间 tab 的筛选行：类型 chip + 同行人 facepile。
// 两个维度都常驻，让控件本身可被发现；计数为 0 的选项弱化但仍可点（点进去是空态）。
// 再次点已选中的选项即取消该维度，所以没有额外的「清除」按钮。
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
  count: number;
};

const AVATAR = 32;
// Matches the day capsules in the 行程 tab (JourneyTimeline DayChips): same
// height, padding and type size, so the two tabs don't show two chip scales.
const CHIP = 34;
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
}) {
  const showPeople = authors.length > 1;
  const pile = selectedAuthor
    ? [
        ...authors.filter((author) => author.key === selectedAuthor),
        ...authors.filter((author) => author.key !== selectedAuthor),
      ].slice(0, PILE_MAX)
    : authors.slice(0, PILE_MAX);
  const overflow = authors.length - pile.length;

  return (
    <View style={{ marginBottom: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs - 2 }}>
        {typeOptions.map((option) => {
          const selected = option.id === selectedType;
          const empty = !selected && option.count === 0;
          const tint = selected ? '#fff' : empty ? theme.text3 : theme.text2;
          return (
            <Press
              key={option.id}
              scaleTo={0.96}
              onPress={() => onSelectType(selected ? 'all' : option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                height: CHIP,
                paddingHorizontal: space.md - 2,
                borderRadius: radius.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs - 3,
                backgroundColor: selected ? theme.accent : theme.fieldSurface,
              }}
            >
              <Icon name={option.icon} color={tint} size={15} strokeWidth={selected ? 2.1 : 1.7} />
              <Text style={[type.body, { fontSize: 13.5, fontWeight: '600', color: tint }]}>{option.label}</Text>
              <Text
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
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
      {showPeople ? (
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
                    style={{ width: AVATAR, height: AVATAR, opacity: author.count === 0 && !selected ? 0.4 : 1 }}
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
      ) : null}
    </View>
  );
}
