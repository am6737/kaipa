// ContributionsPage.tsx — 我的贡献：两个固定的汇总数字，吸顶的类型标签，
// 然后是一张无卡片的列表。审核中、需修改的排在最前（进行中），其余按月份分组。
// 每行同一结构：小字写类型和路线，下面是内容本身，右侧只放一个数字。
// 行之间只用留白，不画分割线。See DESIGN.md.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { TKey, useI18n } from '../../i18n';
import { layout, radius, space, type } from '../../design-system';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { UnderlineTabs } from '../UnderlineTabs';
import { KPSpinner } from '../State';
import { MePushPage } from './MePushPage';
import type { MyRouteComment } from '../../hooks/useRouteComments';
import type { MyRouteGuide } from '../../hooks/useRouteGuides';
import type { RouteRequest } from '../../hooks/useRouteRequests';
import type { Poi } from '../../data/pois';

type Kind = 'guide' | 'comment' | 'request';
type Filter = Kind | 'all';
type Item = {
  key: string;
  kind: Kind;
  at: number;
  /** 审核中，或攻略需修改：排在进行中，不进月份分组。 */
  inProgress: boolean;
  place: string;
  /** 跟在路线后面的结果，如「已上线」。 */
  outcome?: string;
  content: string;
  /** 右侧的数字：攻略的有用数、评论的赞数。 */
  count?: number;
  pending?: 'review' | 'rejected';
  reason?: string;
  onPress?: () => void;
};

const stamp = (iso: string) => {
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? 0 : at;
};

type Props = {
  theme: Theme;
  guides: MyRouteGuide[];
  comments: MyRouteComment[];
  requests: RouteRequest[];
  routes: Poi[];
  loading: boolean;
  /** 走完但还没评论的路线，只在页面为空时提示。 */
  reviewPrompt?: { route: string; onWrite: () => void };
  onBack: () => void;
  onOpenGuides: () => void;
  onOpenComment: (comment: MyRouteComment) => void;
};

export function ContributionsPage({
  theme,
  guides,
  comments,
  requests,
  routes,
  loading,
  reviewPrompt,
  onBack,
  onOpenGuides,
  onOpenComment,
}: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');

  const kindLabel = (kind: Kind) =>
    kind === 'guide'
      ? t('profile.contribGuides')
      : kind === 'comment'
        ? t('profile.contribComments')
        : t('profile.contribRequests');

  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const routeName = (id: string) => routeById.get(id)?.name || t('profile.contribRouteGone');

  const items: Item[] = [
    ...guides.map((guide): Item => ({
      key: `guide-${guide.id}`,
      kind: 'guide',
      at: stamp(guide.updatedAt),
      inProgress: guide.status !== 'approved',
      place: routeName(guide.routeId),
      content: guide.title,
      count: guide.status === 'approved' ? guide.helpfulCount : undefined,
      pending: guide.status === 'pending' ? 'review' : guide.status === 'rejected' ? 'rejected' : undefined,
      reason: guide.status === 'rejected' ? guide.rejectionReason?.trim() || undefined : undefined,
      onPress: onOpenGuides,
    })),
    ...comments.map((comment): Item => ({
      key: `comment-${comment.id}`,
      kind: 'comment',
      at: stamp(comment.createdAt),
      inProgress: false,
      place: routeName(comment.routeId),
      content: comment.body.trim(),
      count: comment.likeCount,
      onPress: () => onOpenComment(comment),
    })),
    ...requests.map((request): Item => ({
      key: `request-${request.id}`,
      kind: 'request',
      at: stamp(request.createdAt),
      inProgress: request.status === 'pending',
      place: request.region || request.address || '',
      outcome:
        request.status === 'accepted'
          ? t('profile.contribAccepted')
          : request.status === 'duplicate'
            ? t('profile.contribDuplicate')
            : request.status === 'rejected'
              ? t('profile.contribDeclined')
              : undefined,
      content: request.name,
      pending: request.status === 'pending' ? 'review' : undefined,
    })),
  ].sort((a, b) => b.at - a.at);

  const helpfulTotal = guides.reduce((sum, guide) => sum + (guide.status === 'approved' ? guide.helpfulCount : 0), 0);
  const likesTotal = comments.reduce((sum, comment) => sum + comment.likeCount, 0);

  const monthLabel = (at: number) => {
    const date = new Date(at);
    const month = t(`profile.contribMonthNames.m${date.getMonth() + 1}` as TKey);
    return date.getFullYear() === new Date().getFullYear()
      ? month
      : t('profile.contribMonthYear', { year: date.getFullYear(), month });
  };

  const visible = filter === 'all' ? items : items.filter((item) => item.kind === filter);
  const sections: { key: string; title: string; items: Item[] }[] = [];
  const inProgress = visible.filter((item) => item.inProgress);
  if (inProgress.length) sections.push({ key: 'progress', title: t('profile.contribInProgress'), items: inProgress });
  for (const item of visible) {
    if (item.inProgress) continue;
    const date = new Date(item.at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const last = sections[sections.length - 1];
    if (last?.key === key) last.items.push(item);
    else sections.push({ key, title: monthLabel(item.at), items: [item] });
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: t('profile.contribAll') },
    { key: 'guide', label: kindLabel('guide') },
    { key: 'comment', label: kindLabel('comment') },
    { key: 'request', label: kindLabel('request') },
  ];

  const empty = !items.length;
  const summary = (
    <View style={styles.summary}>
      <SummaryValue theme={theme} value={empty ? null : helpfulTotal} label={t('profile.contribHelpfulTotal')} />
      <SummaryValue theme={theme} value={empty ? null : likesTotal} label={t('profile.contribLikesTotal')} />
    </View>
  );

  return (
    <MePushPage theme={theme} title={t('profile.contribTitle')} onBack={onBack} scroll={false} background={theme.featureSurface}>
      {loading && empty ? (
        <View style={{ paddingVertical: 120, alignItems: 'center' }}>
          <KPSpinner theme={theme} label={t('profile.contribTitle')} />
        </View>
      ) : empty ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
          {summary}
          {reviewPrompt ? <ReviewPrompt theme={theme} prompt={reviewPrompt} /> : null}
          <View style={styles.emptyState}>
            <Text style={[type.cardTitle, { color: theme.text, textAlign: 'center' }]}>{t('profile.contribEmptyAll')}</Text>
            <Text style={[type.lead, { color: theme.text2, textAlign: 'center', marginTop: space.xs }]}>{t('profile.contribEmptyHint')}</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        >
          {summary}
          {/* 吸顶时 RN 会把这个直接子元素的 style 搬到外层 wrapper，并把它自己换成
              flex:1 的纵向容器，所以行布局必须放在里面一层。见 ScrollViewStickyHeader。 */}
          <View style={{ backgroundColor: theme.featureSurface }}>
            <UnderlineTabs
              theme={theme}
              tabs={tabs.map((tab) => ({ id: tab.key, label: tab.label }))}
              activeKey={filter}
              onSelect={setFilter}
              style={styles.tabs}
            />
          </View>
          <View>
            {sections.length ? (
              sections.map((section, index) => (
                <View key={section.key} style={{ paddingTop: index ? space.lg : space.xs }}>
                  <Text style={[type.eyebrow, styles.sectionTitle, { color: theme.text2 }]}>{section.title}</Text>
                  {section.items.map((item) => (
                    <ContributionRow
                      key={item.key}
                      theme={theme}
                      item={item}
                      kindLabel={filter === 'all' ? kindLabel(item.kind) : null}
                      pendingLabel={item.pending === 'rejected' ? t('profile.contribRejected') : t('profile.contribPending')}
                      editLabel={t('profile.contribEdit')}
                    />
                  ))}
                </View>
              ))
            ) : (
              <Text style={[type.lead, styles.filteredEmpty, { color: theme.text2 }]}>
                {t('profile.contribEmpty', { label: kindLabel(filter as Kind) })}
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </MePushPage>
  );
}

function SummaryValue({ theme, value, label }: { theme: Theme; value: number | null; label: string }) {
  return (
    <View>
      <Text style={[type.summaryValue, { color: value === null ? theme.text3 : theme.text }]}>{value === null ? '--' : value}</Text>
      <Text numberOfLines={1} style={[type.meta, { color: theme.text2 }]}>{label}</Text>
    </View>
  );
}

function ContributionRow({ theme, item, kindLabel, pendingLabel, editLabel }: {
  theme: Theme;
  item: Item;
  kindLabel: string | null;
  pendingLabel: string;
  editLabel: string;
}) {
  const head = [kindLabel, item.place, item.outcome].filter(Boolean).join('　');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={item.onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.fieldSurface : 'transparent' }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {head ? <Text numberOfLines={1} style={[type.caption, { color: theme.text3, lineHeight: 17 }]}>{head}</Text> : null}
        {item.kind === 'comment' ? (
          <Text numberOfLines={2} style={[type.body, { color: theme.text, lineHeight: 22, marginTop: 2 }]}>{item.content}</Text>
        ) : (
          <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text, lineHeight: 21, marginTop: 2 }]}>{item.content}</Text>
        )}
        {item.reason ? (
          <Text style={[type.small, { color: theme.text2, lineHeight: 20, marginTop: space.xxs }]}>
            {item.reason}
            {'  '}
            <Text style={{ color: theme.accent, fontWeight: '600' }}>{editLabel}</Text>
          </Text>
        ) : null}
      </View>
      <View style={styles.rowTrail}>
        {item.pending ? (
          <Text numberOfLines={1} style={[type.note, item.pending === 'rejected' ? { color: theme.danger, fontWeight: '600' } : { color: theme.text2 }]}>
            {pendingLabel}
          </Text>
        ) : item.count !== undefined ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
            <Icon name="heart" color={theme.text3} size={12} strokeWidth={2.2} />
            <Text style={[type.metric, { color: theme.text, fontVariant: ['tabular-nums'] }]}>{item.count}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function ReviewPrompt({ theme, prompt }: { theme: Theme; prompt: { route: string; onWrite: () => void } }) {
  const { t } = useI18n();
  return (
    <Press accessibilityRole="button" onPress={prompt.onWrite} style={[styles.prompt, { backgroundColor: theme.accentSofter }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{t('profile.reviewPromptTitle', { route: prompt.route })}</Text>
        <Text numberOfLines={2} style={[type.meta, { color: theme.text2, marginTop: 2 }]}>{t('profile.reviewPromptBody')}</Text>
      </View>
      <View style={[styles.promptAction, { backgroundColor: theme.controlSurface }]}>
        <Text style={[type.chip, { color: theme.accent }]}>{t('profile.reviewPromptAction')}</Text>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: space.xxxl, paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.sm },
  tabs: { height: layout.fieldHeight, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.xl },
  sectionTitle: { paddingHorizontal: space.xl, paddingBottom: space.xxs },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.sm, minHeight: layout.listRowMinHeight },
  // 与内容行（类型和路线那行小字之下）对齐。
  rowTrail: { minWidth: layout.iconButton, alignItems: 'flex-end', paddingTop: 19 },
  filteredEmpty: { textAlign: 'center', paddingHorizontal: space.xl, paddingTop: space.xxxl },
  emptyState: { paddingHorizontal: space.xxl, paddingTop: space.xxxl + space.md, alignItems: 'center' },
  prompt: {
    marginHorizontal: layout.pagePadding,
    marginTop: space.sm,
    borderRadius: radius.feature,
    padding: space.md,
    paddingLeft: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  promptAction: { height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
