// PeoplePage.tsx — 粉丝 / 关注 / 找人。
// 自己的粉丝页顶上列出待处理的关注请求；找人页没输入时显示可能认识的人。
import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import {
  fetchFollowRequests, fetchSuggestedProfiles, respondFollowRequest, searchProfiles,
  useFollowList, withFollowState, type ProfileCard,
} from '../../hooks/useSocial';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { KPSpinner, KPState } from '../State';
import { Press } from '../Press';
import { ProfileTabs } from '../me/profile/ProfileHero';
import { TabPanelSwitch } from '../TabPanelSwitch';
import { FollowButton } from './FollowButton';

type Tab = 'followers' | 'following' | 'find';

const SEARCH_DEBOUNCE_MS = 300;

export function PeoplePage({ theme, userId, tab: initialTab, onBack }: {
  theme: Theme;
  userId: string;
  tab: Tab;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const data = useData();
  const insets = useSafeAreaInsets();
  const self = userId === data.userId;
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'followers', label: t('profile.followers') },
    { key: 'following', label: t('profile.following') },
    ...(self ? [{ key: 'find' as const, label: t('profile.findPeople') }] : []),
  ];

  return (
    <DetailPage theme={theme} onBack={onBack} scrollable={false}>
      <ProfileTabs theme={theme} tabs={tabs} active={tab} onChange={setTab} />
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: space.md, paddingBottom: insets.bottom + 80 }}
      >
        <TabPanelSwitch order={tabs.map((item) => item.key)} active={tab}>
          {tab === 'find' ? (
            <FindPeople theme={theme} />
          ) : (
            <FollowList key={tab} theme={theme} userId={userId} kind={tab} showRequests={self && tab === 'followers'} />
          )}
        </TabPanelSwitch>
      </ScrollView>
    </DetailPage>
  );
}

function FollowList({ theme, userId, kind, showRequests }: {
  theme: Theme;
  userId: string;
  kind: 'followers' | 'following';
  showRequests: boolean;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const list = useFollowList(userId, kind);
  const [requests, setRequests] = useState<ProfileCard[]>([]);

  useEffect(() => {
    if (!showRequests) return;
    fetchFollowRequests().then(setRequests).catch(() => {});
  }, [showRequests]);

  const respond = async (person: ProfileCard, accept: boolean) => {
    setRequests((prev) => prev.filter((item) => item.id !== person.id));
    try {
      await respondFollowRequest(person.id, accept);
      if (accept) void list.refresh();
    } catch {
      setRequests((prev) => [person, ...prev]);
      nav.showToast(t('profile.actionFailed'));
    }
  };

  return (
    <View>
      {requests.length ? (
        <View style={{ marginBottom: space.xl }}>
          <Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.xs }]}>{t('profile.requests')}</Text>
          {requests.map((person) => (
            <PersonRow key={person.id} theme={theme} person={person}>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                <SmallPill theme={theme} label={t('profile.accept')} filled onPress={() => { void respond(person, true); }} />
                <SmallPill theme={theme} label={t('profile.decline')} onPress={() => { void respond(person, false); }} />
              </View>
            </PersonRow>
          ))}
        </View>
      ) : null}

      {list.people.map((person) => (
        <PersonRow key={person.id} theme={theme} person={person}>
          <FollowButton
            theme={theme}
            userId={person.id}
            nick={person.nick}
            relation={person.relation}
            isPrivate={person.isPrivate}
            onChange={(state) => list.setPeople((prev) => prev.map((item) => item.id === person.id ? withFollowState(item, state) : item))}
          />
        </PersonRow>
      ))}
      {list.loading && !list.people.length ? (
        <View style={{ paddingTop: space.xxxl, alignItems: 'center' }}><KPSpinner theme={theme} /></View>
      ) : !list.people.length ? (
        <KPState theme={theme} icon="people" title={t(kind === 'followers' ? 'profile.followersEmpty' : 'profile.followingEmpty')} />
      ) : list.hasMore ? (
        <SmallPill theme={theme} label={t('profile.loadMore')} center onPress={() => { void list.loadMore(); }} />
      ) : null}
    </View>
  );
}

function FindPeople({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileCard[] | null>(null);
  const [suggested, setSuggested] = useState<ProfileCard[] | null>(null);
  const latest = useRef('');

  useEffect(() => {
    fetchSuggestedProfiles().then(setSuggested).catch(() => setSuggested([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (!q) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((rows) => { if (latest.current === q) setResults(rows); })
        .catch(() => { if (latest.current === q) setResults([]); });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = Boolean(query.trim());
  const people = searching ? results : suggested;
  const update = (id: string, state: ProfileCard['relation']['following']) => {
    const patch = (rows: ProfileCard[] | null) => rows?.map((item) => item.id === id ? withFollowState(item, state) : item) ?? rows;
    setResults(patch);
    setSuggested(patch);
  };

  return (
    <View>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        height: layout.fieldHeight,
        paddingHorizontal: space.sm,
        borderRadius: radius.control + 3,
        backgroundColor: theme.fieldSurface,
      }}>
        <Icon name="search" color={theme.text3} size={18} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('profile.searchPlaceholder')}
          placeholderTextColor={theme.text3}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[type.textInput, { flex: 1, color: theme.text, paddingVertical: 0 }]}
        />
      </View>

      {!searching ? (
        <Text style={[type.sectionTitle, { color: theme.text, marginTop: space.xl, marginBottom: space.xs }]}>{t('profile.suggested')}</Text>
      ) : <View style={{ height: space.sm }} />}

      {people === null ? (
        <View style={{ paddingTop: space.xxl, alignItems: 'center' }}><KPSpinner theme={theme} /></View>
      ) : people.length ? (
        people.map((person) => (
          <PersonRow key={person.id} theme={theme} person={person}>
            <FollowButton
              theme={theme}
              userId={person.id}
              nick={person.nick}
              relation={person.relation}
              isPrivate={person.isPrivate}
              onChange={(state) => update(person.id, state)}
            />
          </PersonRow>
        ))
      ) : (
        <KPState theme={theme} icon="people" body={t(searching ? 'profile.searchEmpty' : 'profile.suggestedEmpty')} />
      )}
    </View>
  );
}

function PersonRow({ theme, person, children }: { theme: Theme; person: ProfileCard; children: React.ReactNode }) {
  const nav = useNav();
  const name = person.nick || person.username || '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.listRowMinHeight }}>
      <Press
        onPress={() => nav.openUserProfile(person.id)}
        accessibilityRole="button"
        accessibilityLabel={name}
        scaleTo={0.99}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Avatar uri={person.avatarUrl ?? undefined} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{name}</Text>
          {person.username ? (
            <Text numberOfLines={1} style={[type.small, { color: theme.text2, marginTop: 1 }]}>@{person.username}</Text>
          ) : null}
        </View>
      </Press>
      {children}
    </View>
  );
}

function SmallPill({ theme, label, filled, center, onPress }: {
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
        marginTop: center ? space.xl : 0,
        height: 34,
        paddingHorizontal: space.sm,
        borderRadius: radius.pill,
        backgroundColor: filled ? theme.accent : theme.fieldSurface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[type.chip, { color: filled ? '#fff' : theme.text }]}>{label}</Text>
    </Press>
  );
}
