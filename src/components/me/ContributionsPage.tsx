// ContributionsPage.tsx — 我的贡献：攻略、评论、路线请求按时间倒序排在一起，
// 卡片按类型带审核状态。条目之间只用留白分隔，不画分割线。See DESIGN.md.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { AppCard, layout, radius, space, type } from '../../design-system';
import { Icon, IconName } from '../Icon';
import { Press } from '../Press';
import { KPSpinner, KPState } from '../State';
import { MePushPage } from './MePushPage';
import type { MyRouteComment } from '../../hooks/useRouteComments';
import type { MyRouteGuide } from '../../hooks/useRouteGuides';
import type { RouteRequest } from '../../hooks/useRouteRequests';
import type { Poi } from '../../data/pois';

type Kind = 'guide' | 'comment' | 'request';
type Filter = Kind | 'all';
type Item =
  | { key: string; kind: 'guide'; at: number; guide: MyRouteGuide }
  | { key: string; kind: 'comment'; at: number; comment: MyRouteComment }
  | { key: string; kind: 'request'; at: number; request: RouteRequest };

type Status = { label: string; color: string; icon: IconName };

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
const stamp = (iso: string) => {
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? 0 : at;
};

const KIND_ICON: Record<Kind, IconName> = { guide: 'compass', comment: 'message', request: 'route' };

type Props = {
  theme: Theme;
  guides: MyRouteGuide[];
  comments: MyRouteComment[];
  requests: RouteRequest[];
  routes: Poi[];
  loading: boolean;
  onBack: () => void;
  onOpenGuides: () => void;
  onOpenRequests: () => void;
  onOpenComment: (comment: MyRouteComment) => void;
};

export function ContributionsPage({
  theme,
  guides,
  comments,
  requests,
  routes,
  loading,
  onBack,
  onOpenGuides,
  onOpenRequests,
  onOpenComment,
}: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');

  const kindLabel = (kind: Kind) =>
    kind === 'guide'
      ? t('profile.contribGuides')
      : kind === 'comment'
        ? t('profile.contribComments')
        : t('profile.contribRequests');

  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);

  const items = useMemo<Item[]>(
    () =>
      [
        ...guides.map((guide): Item => ({ key: `guide-${guide.id}`, kind: 'guide', at: stamp(guide.updatedAt), guide })),
        ...comments.map((comment): Item => ({ key: `comment-${comment.id}`, kind: 'comment', at: stamp(comment.createdAt), comment })),
        ...requests.map((request): Item => ({ key: `request-${request.id}`, kind: 'request', at: stamp(request.createdAt), request })),
      ].sort((a, b) => b.at - a.at),
    [guides, comments, requests],
  );

  const chips: { id: Filter; count: number; label: string }[] = [
    { id: 'all', count: items.length, label: t('profile.contribAll') },
    { id: 'guide', count: guides.length, label: kindLabel('guide') },
    { id: 'comment', count: comments.length, label: kindLabel('comment') },
    { id: 'request', count: requests.length, label: kindLabel('request') },
  ];

  const visible = filter === 'all' ? items : items.filter((item) => item.kind === filter);
  const emptyLabel =
    filter === 'all'
      ? `${kindLabel('guide')}、${kindLabel('comment')}、${kindLabel('request')}`
      : kindLabel(filter);

  const statusOf = (item: Item): Status | null => {
    if (item.kind === 'guide') {
      if (item.guide.status === 'pending') return { label: t('profile.contribPending'), color: theme.accent, icon: 'clock' };
      if (item.guide.status === 'rejected') return { label: t('profile.contribRejected'), color: theme.danger, icon: 'close' };
      return null;
    }
    if (item.kind === 'request') {
      if (item.request.status === 'pending') return { label: t('profile.contribPending'), color: theme.accent, icon: 'clock' };
      if (item.request.status === 'accepted') return { label: t('profile.contribAccepted'), color: theme.text2, icon: 'check' };
      if (item.request.status === 'rejected') return { label: t('profile.contribDeclined'), color: theme.danger, icon: 'close' };
      return { label: t('profile.contribDuplicate'), color: theme.text2, icon: 'check' };
    }
    return null;
  };

  return (
    <MePushPage theme={theme} title={t('profile.contribTitle')} onBack={onBack}>
      <View style={styles.content}>
        <Text style={[type.body, { color: theme.text2, lineHeight: 23 }]}>{t('profile.contribSubtitle')}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: space.md }}
          contentContainerStyle={{ gap: space.xs, paddingRight: layout.pagePadding }}
        >
          {chips.map((chip) => {
            const selected = chip.id === filter;
            return (
              <Press
                key={chip.id}
                onPress={() => setFilter(chip.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                scaleTo={1}
                opacityTo={1}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? theme.accentSofter : theme.fieldSurface },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    type.chip,
                    { color: selected ? theme.accent : theme.text2 },
                  ]}
                >
                  {t('profile.contribFilter', { label: chip.label, count: chip.count })}
                </Text>
              </Press>
            );
          })}
        </ScrollView>

        {loading && !items.length ? (
          <View style={{ paddingVertical: 120, alignItems: 'center' }}>
            <KPSpinner theme={theme} label={t('profile.contribTitle')} />
          </View>
        ) : !visible.length ? (
          <KPState
            theme={theme}
            icon="compass"
            title={t('profile.contribEmpty', { label: emptyLabel })}
            body={t('profile.contribEmptyHint')}
            style={{ marginTop: space.xxxl }}
          />
        ) : (
          <View style={{ gap: space.md, marginTop: space.lg }}>
            {visible.map((item) => {
              const status = statusOf(item);
              const title =
                item.kind === 'guide'
                  ? item.guide.title
                  : item.kind === 'request'
                    ? item.request.name
                    : routeById.get(item.comment.routeId)?.name || t('profile.contribRouteGone');
              const body =
                item.kind === 'guide'
                  ? item.guide.intro
                  : item.kind === 'request'
                    ? item.request.note
                    : item.comment.body;
              const meta =
                item.kind === 'guide'
                  ? t('profile.contribHelpful', { count: item.guide.helpfulCount })
                  : item.kind === 'request'
                    ? t('profile.contribSubmitted', { date: day(item.request.createdAt) })
                    : `${t('profile.contribLikes', { count: item.comment.likeCount })}　${t('profile.contribReplies', { count: item.comment.replyCount })}`;
              const onPress =
                item.kind === 'guide'
                  ? onOpenGuides
                  : item.kind === 'request'
                    ? onOpenRequests
                    : () => onOpenComment(item.comment);
              return (
                <ContributionCard
                  key={item.key}
                  theme={theme}
                  kind={item.kind}
                  kindLabel={kindLabel(item.kind)}
                  status={status}
                  title={title}
                  body={body.trim()}
                  meta={meta}
                  onPress={onPress}
                />
              );
            })}
          </View>
        )}
      </View>
    </MePushPage>
  );
}

function ContributionCard({ theme, kind, kindLabel, status, title, body, meta, onPress }: {
  theme: Theme;
  kind: Kind;
  kindLabel: string;
  status: Status | null;
  title: string;
  body: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ borderRadius: radius.feature }}>
      <AppCard theme={theme} radius={radius.feature} style={[styles.card, { backgroundColor: theme.fieldSurface }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
          <Icon name={KIND_ICON[kind]} color={theme.text3} size={12} />
          <Text numberOfLines={1} style={[type.caption, { color: theme.text3, flexShrink: 1 }]}>
            {kindLabel}
          </Text>
          <View style={{ flex: 1 }} />
          {status ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexShrink: 0 }}>
              <Icon name={status.icon} color={status.color} size={12} strokeWidth={2.2} />
              <Text style={[type.caption, { color: status.color, fontWeight: '600' }]}>{status.label}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text, marginTop: space.xs }]}>
          {title}
        </Text>
        {body ? (
          <Text numberOfLines={2} style={[type.hint, { color: theme.text2, marginTop: space.xxs }]}>
            {body}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: space.xs }]}>
          {meta}
        </Text>
      </AppCard>
    </Press>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding, paddingBottom: space.xxxl },
  chip: {
    height: layout.fieldHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { boxShadow: 'none', padding: space.md, borderWidth: 0, overflow: 'hidden' },
});
