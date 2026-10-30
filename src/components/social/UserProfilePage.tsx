// UserProfilePage.tsx — 别人的主页：头部、关注按钮、时间线和照片。
// 能看到什么完全由 profile_summary / profile_outings 决定，这里只按返回的状态排版。
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import {
  blockUser, removeFollower, respondFollowRequest, unblockUser,
  fetchProfileGearSets, useProfileOutings, useProfileSummary,
  type GearSetCard, type Outing,
} from '../../hooks/useSocial';
import { fmtWeight } from '../../data/gear';
import { KPSpinner, KPState } from '../State';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { ProfileHero, ProfileTabs } from '../me/profile/ProfileHero';
import { TabPanelSwitch, useStickyTabScroll } from '../TabPanelSwitch';
import { OutingCard } from '../me/profile/OutingCard';
import { ProfilePhotos } from '../me/profile/ProfilePhotos';
import { TimelineEmpty } from '../me/profile/TimelineEmpty';
import { FollowButton } from './FollowButton';

// ActionSheet 先执行条目再关闭自己，接着开的确认面板要等它关掉。
const SHEET_HANDOFF_MS = 220;

export function UserProfilePage({ theme, userId, onBack }: { theme: Theme; userId: string; onBack: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const insets = useSafeAreaInsets();
  const { summary, loading, refresh } = useProfileSummary(data.userId, userId);
  const outings = useProfileOutings(data.userId, userId);
  const [tab, setTab] = useState<'timeline' | 'photos' | 'gear'>('timeline');
  const [gearSets, setGearSets] = useState<GearSetCard[] | null>(null);
  const [gearLoading, setGearLoading] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const tabScroll = useStickyTabScroll(scrollRef);
  const selectTab = (key: typeof tab) => {
    if (key === tab) return;
    tabScroll.settleBeforeSwitch();
    setTab(key);
  };
  const panelY = useRef(0);
  const entryY = useRef<Record<string, number>>({});
  const jumpTarget = useRef<string | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), 1600);
    return () => clearTimeout(timer);
  }, [highlighted]);

  useEffect(() => {
    if (tab !== 'gear' || gearSets || gearLoading) return;
    let alive = true;
    setGearLoading(true);
    fetchProfileGearSets(userId)
      .then((sets) => { if (alive) setGearSets(sets); })
      .catch(() => { if (alive) setGearSets([]); })
      .finally(() => { if (alive) setGearLoading(false); });
    return () => { alive = false; };
  }, [tab, userId, gearSets, gearLoading]);

  const refreshAll = () => {
    void refresh();
    void outings.refresh();
  };

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      refreshAll();
    } catch {
      nav.showToast(t('profile.actionFailed'));
    }
  };

  const nick = summary?.nick || summary?.username || '';
  const relation = summary?.relation;

  const confirmBlock = () => {
    setTimeout(() => nav.openActionSheet({
      title: t('profile.blockConfirmTitle', { name: nick }),
      message: t('profile.blockConfirmBody'),
      items: [{ label: t('profile.block'), destructive: true, onPress: () => { void act(() => blockUser(userId)); } }],
    }), SHEET_HANDOFF_MS);
  };

  const confirmRemoveFollower = () => {
    setTimeout(() => nav.openActionSheet({
      message: t('profile.removeFollowerConfirm', { name: nick }),
      items: [{ label: t('profile.removeFollower'), destructive: true, onPress: () => { void act(() => removeFollower(userId)); } }],
    }), SHEET_HANDOFF_MS);
  };

  const openMore = () => {
    if (!relation) return;
    nav.openActionSheet({
      items: relation.blocked
        ? [{ label: t('profile.unblock'), onPress: () => { void act(() => unblockUser(userId)); } }]
        : [
            ...(relation.followedBy ? [{ label: t('profile.removeFollower'), onPress: confirmRemoveFollower }] : []),
            { label: t('profile.block'), destructive: true, onPress: confirmBlock },
          ],
    });
  };

  const tryJump = () => {
    const id = jumpTarget.current;
    if (!id || entryY.current[id] == null) return;
    jumpTarget.current = null;
    scrollRef.current?.scrollTo({ y: Math.max(0, panelY.current + entryY.current[id] - 52), animated: true });
    setHighlighted(id);
  };
  const jumpToOuting = (outingId: string) => {
    jumpTarget.current = outingId;
    setTab('timeline');
    tryJump();
  };

  // 别人的出行只有自己也在同行名单里时才打得开（旅程已在本地数据里）。
  const openerFor = (outing: Outing) => {
    const journey = outing.journeyId ? data.journeys.find((item) => item.id === outing.journeyId) : undefined;
    return journey ? () => nav.openPoint(journey) : undefined;
  };

  const moreButton = summary && !relation?.self ? (
    <Press
      onPress={openMore}
      accessibilityRole="button"
      accessibilityLabel={t('profile.more')}
      style={{
        width: layout.iconButton,
        height: layout.iconButton,
        borderRadius: layout.iconButton / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.controlSurface,
      }}
    >
      <Icon name="more" color={theme.text} size={22} />
    </Press>
  ) : undefined;

  let body: React.ReactNode;
  if (!summary) {
    body = loading
      ? <View style={{ paddingTop: 120, alignItems: 'center' }}><KPSpinner theme={theme} /></View>
      : <KPState theme={theme} icon="user" title={t('profile.notFoundTitle')} body={t('profile.notFoundBody')} style={{ paddingTop: 100 }} />;
  } else {
    const canView = summary.canView && !summary.relation.blocked;
    const hidden = summary.hiddenOutings ?? 0;
    const tabs: { key: 'timeline' | 'photos' | 'gear'; label: string }[] = [
      { key: 'timeline', label: t('profile.tabTimeline') },
      { key: 'photos', label: t('profile.tabPhotos') },
      ...((summary.gearSets ?? 0) > 0 ? [{ key: 'gear' as const, label: t('profile.tabGear') }] : []),
    ];
    const openList = canView && !summary.relation.blocked
      ? (kind: 'followers' | 'following') => () => nav.openPeople(userId, kind)
      : undefined;
    body = (
      <ScrollView
        ref={scrollRef}
        {...tabScroll.scrollProps}
        stickyHeaderIndices={canView ? [1] : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        <View>
          <ProfileHero
            theme={theme}
            avatarUri={summary.avatarUrl}
            nick={nick}
            username={summary.username}
            bio={summary.relation.blocked ? null : summary.bio}
            followers={summary.followers}
            following={summary.following}
            onPressFollowers={openList?.('followers')}
            onPressFollowing={openList?.('following')}
            action={summary.relation.blocked ? null : (
              <FollowButton
                theme={theme}
                hero
                userId={userId}
                nick={nick}
                relation={summary.relation}
                isPrivate={summary.isPrivate}
                onChange={refreshAll}
              />
            )}
          />
          {summary.relation.requestedMe && !summary.relation.blocked ? (
            <View style={{ paddingHorizontal: layout.pagePadding, marginTop: space.lg }}>
              <View style={{ padding: space.md, borderRadius: radius.card, backgroundColor: theme.fieldSurface, gap: space.sm }}>
                <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>{t('profile.requestedMe', { name: nick })}</Text>
                <View style={{ flexDirection: 'row', gap: space.xs }}>
                  <Pill theme={theme} label={t('profile.accept')} filled onPress={() => { void act(() => respondFollowRequest(userId, true)); }} />
                  <Pill theme={theme} label={t('profile.decline')} onPress={() => { void act(() => respondFollowRequest(userId, false)); }} />
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {canView ? (
          <View onLayout={tabScroll.onTabsLayout} style={{ marginTop: space.lg, backgroundColor: theme.featureSurface }}>
            <ProfileTabs
              theme={theme}
              active={tab}
              onChange={selectTab}
              tabs={tabs}
            />
          </View>
        ) : null}

        {summary.relation.blocked ? (
          <KPState
            theme={theme}
            icon="eyeOff"
            title={t('profile.blockedTitle')}
            body={t('profile.blockedBody')}
            action={{ label: t('profile.unblock'), onPress: () => { void act(() => unblockUser(userId)); } }}
          />
        ) : !canView ? (
          <KPState theme={theme} icon="eyeOff" title={t('profile.privateTitle')} body={t('profile.privateBody')} />
        ) : (
          <View
            onLayout={(event) => { panelY.current = event.nativeEvent.layout.y; tryJump(); }}
            style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.lg, minHeight: tabScroll.panelMinHeight }}
          >
            <TabPanelSwitch order={tabs.map((item) => item.key)} active={tab}>
              {tab === 'timeline' ? (
                <>
                  {outings.outings.map((outing, index) => (
                    <View
                      key={outing.id}
                      onLayout={(event) => { entryY.current[outing.id] = event.nativeEvent.layout.y; tryJump(); }}
                      style={{ marginTop: index ? 24 : 0 }}
                    >
                      <OutingCard
                        theme={theme}
                        outing={outing}
                        subject={nick}
                        avatarUri={summary?.avatarUrl}
                        highlighted={highlighted === outing.id}
                        onOpen={openerFor(outing)}
                      />
                    </View>
                  ))}
                  {outings.hasMore ? (
                    <Pill theme={theme} label={t('profile.loadMore')} center onPress={() => { void outings.loadMore(); }} />
                  ) : null}
                  {!outings.outings.length && !outings.loading ? (
                    <TimelineEmpty theme={theme} title={t('profile.timelineEmptyTitle')} body={t('profile.otherTimelineEmptyBody')} />
                  ) : null}
                  {hidden > 0 ? (
                    <Text style={[type.small, { color: theme.text2, textAlign: 'center', marginTop: space.xl }]}>{t('profile.hiddenOutings')}</Text>
                  ) : null}
                </>
              ) : tab === 'photos' ? (
                <ProfilePhotos theme={theme} outings={outings.outings} onJump={jumpToOuting} />
              ) : tab === 'gear' ? (
                gearLoading && !gearSets ? (
                  <View style={{ paddingTop: 60, alignItems: 'center' }}><KPSpinner theme={theme} /></View>
                ) : gearSets && gearSets.length ? (
                  <View style={{ gap: space.md }}>
                    {gearSets.map((card) => (
                      <GearSetCardRow
                        key={card.id}
                        theme={theme}
                        card={card}
                        meta={t('profile.gearSetMeta', { count: card.itemCount, weight: fmtWeight(card.weightKg, data.profile.gearWeightUnit || 'kg', true) })}
                        onPress={() => nav.openGearSetPreview(card.id)}
                      />
                    ))}
                  </View>
                ) : (
                  <KPState theme={theme} icon="gear" title={t('profile.tabGear')} body={t('profile.gearSetsEmpty')} />
                )
              ) : null}
            </TabPanelSwitch>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <DetailPage theme={theme} onBack={onBack} right={moreButton} scrollable={false}>
      {body}
    </DetailPage>
  );
}

function GearSetCardRow({ theme, card, meta, onPress }: {
  theme: Theme;
  card: GearSetCard;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      style={{
        padding: space.md,
        borderRadius: radius.card,
        backgroundColor: theme.fieldSurface,
        gap: space.xs,
      }}
    >
      <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{card.name}</Text>
      {card.description ? (
        <Text numberOfLines={2} style={[type.small, { color: theme.text2 }]}>{card.description}</Text>
      ) : null}
      <Text style={[type.caption, { color: theme.text3 }]}>{meta}</Text>
    </Press>
  );
}

function Pill({ theme, label, filled, center, onPress }: {
  theme: Theme;
  label: string;
  filled?: boolean;
  center?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      style={{
        alignSelf: center ? 'center' : undefined,
        flex: center ? undefined : 1,
        marginTop: center ? space.xl : 0,
        height: 38,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: filled ? theme.accent : center ? theme.fieldSurface : theme.featureSurface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[type.chip, { color: filled ? '#fff' : theme.text }]}>{label}</Text>
    </Press>
  );
}
