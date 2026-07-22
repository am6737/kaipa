// NotifInboxPage.tsx — 消息中心: a single-direction inbox. Filter chips (全部 /
// 动态 / 系统), 今天 / 更早 buckets, rich title lines, avatar-or-glyph leading,
// thumbnail-or-action-chip trailing. Mirrors the prototype NotifInbox, adapted
// to the app's Notif shape (data/notifications.ts).
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { KPState } from '../State';
import { useNotifCenter, Notif } from '../../data/notifications';
import { useI18n, TKey } from '../../i18n';
import { MePushPage } from './MePushPage';
import { AppCard, AppSectionHeader, layout, radius, space, type } from '../../design-system';

const FILTERS: { id: 'all' | 'social' | 'system'; labelKey: TKey }[] = [
  { id: 'all', labelKey: 'common.all' },
  { id: 'social', labelKey: 'account.inbox.filterSocial' },
  { id: 'system', labelKey: 'account.inbox.filterSystem' },
];

function Glyph({ theme, item }: { theme: Theme; item: Notif }) {
  if (item.avatar) {
    return (
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: item.color || theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>{item.avatar}</Text>
      </View>
    );
  }
  const danger = item.kind === 'safety';
  return (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: danger ? theme.dangerSoft : theme.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={danger ? 'flag' : 'bell'} color={danger ? theme.danger : theme.accent} size={21} />
    </View>
  );
}

function Title({ theme, item }: { theme: Theme; item: Notif }) {
  const bold = { fontWeight: '600' as const, color: theme.text };
  const dim = { color: theme.text2 };
  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text2 }}>
      {item.who ? <Text style={bold}>{item.who}</Text> : null}
      {item.who ? <Text style={dim}> {item.verb}</Text> : <Text style={dim}>{item.verb}</Text>}
      {item.target ? (
        <>
          <Text style={dim}> </Text>
          <Text style={bold}>「{item.target}」</Text>
        </>
      ) : null}
    </Text>
  );
}

function Row({
  theme,
  item,
  onTap,
}: {
  theme: Theme;
  item: Notif;
  onTap: () => void;
}) {
  const unread = !item.read;
  return (
    <Press onPress={onTap}>
      <AppCard
        theme={theme}
        radius={radius.feature}
        style={{
          minHeight: 96,
          overflow: 'hidden',
          backgroundColor: unread ? theme.accentSofter : theme.featureSurface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
          <View style={{ width: 8, alignItems: 'center' }}>
            {unread ? <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: theme.accent }} /> : null}
          </View>
          <Glyph theme={theme} item={item} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title theme={theme} item={item} />
            <Text style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{item.time}</Text>
          </View>
          {item.thumb ? (
            <PhotoTile tone={item.thumb} seed={item.id} radius={radius.control} style={{ width: 48, height: 48 }} resWidth={120} />
          ) : item.action ? (
            <View
              style={{
                minHeight: 30,
                alignSelf: 'center',
                justifyContent: 'center',
                paddingHorizontal: space.sm,
                borderRadius: radius.pill,
                backgroundColor: theme.accent,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#fff' }}>{item.action}</Text>
            </View>
          ) : null}
        </View>
      </AppCard>
    </Press>
  );
}

export function NotifInboxPage({
  theme,
  onBack,
  showToast,
}: {
  theme: Theme;
  onBack: () => void;
  showToast: (m: string) => void;
}) {
  const nc = useNotifCenter();
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | 'social' | 'system'>('all');

  const visible = nc.list.filter((n) => filter === 'all' || n.cat === filter);
  const buckets: { id: 'today' | 'earlier'; label: string }[] = [
    { id: 'today', label: t('account.inbox.bucketToday') },
    { id: 'earlier', label: t('account.inbox.bucketEarlier') },
  ];

  const tap = (item: Notif) => {
    nc.markRead(item.id);
    if (item.action) showToast(item.kind === 'invite' ? t('account.inbox.toastViewedInvite') : t('account.inbox.toastViewed'));
  };

  const markAll =
    nc.unread > 0 ? (
      <Press onPress={nc.markAllRead} scaleTo={1} opacityTo={1} style={{ paddingHorizontal: space.xs, paddingVertical: space.xs }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('account.inbox.markAllRead')}</Text>
      </Press>
    ) : undefined;

  return (
    <MePushPage theme={theme} title={t('account.inbox.pageTitle')} onBack={onBack} right={markAll}>
      {/* filter chips */}
      <View style={{ flexDirection: 'row', gap: space.xs, paddingHorizontal: layout.pagePadding, paddingBottom: space.md }}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          const n = f.id === 'all' ? 0 : nc.list.filter((x) => x.cat === f.id && !x.read).length;
          return (
            <Press
              key={f.id}
              onPress={() => setFilter(f.id)}
              scaleTo={1}
              opacityTo={1}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: space.md,
                height: 38,
                borderRadius: radius.pill,
                backgroundColor: on ? theme.featureSurface : theme.fieldSurface,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? theme.text : theme.text2 }}>
                {t(f.labelKey)}
              </Text>
              {n > 0 ? (
                <View
                  style={{
                    minWidth: 15,
                    height: 15,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    backgroundColor: theme.fieldSurface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: on ? theme.text : theme.text2 }}>{n}</Text>
                </View>
              ) : null}
            </Press>
          );
        })}
      </View>

      {visible.length === 0 ? (
        <KPState
          theme={theme}
          icon="bell"
          title={t('account.inbox.emptyTitle')}
          body={t('account.inbox.emptyBody')}
        />
      ) : (
        buckets.map((b) => {
          const rows = visible.filter((n) => n.bucket === b.id);
          if (rows.length === 0) return null;
          return (
            <View key={b.id} style={{ paddingHorizontal: layout.pagePadding }}>
              <AppSectionHeader theme={theme} text={b.label} marginTop={space.sm} />
              <View style={{ gap: space.sm }}>
                {rows.map((item) => (
                  <Row key={item.id} theme={theme} item={item} onTap={() => tap(item)} />
                ))}
              </View>
            </View>
          );
        })
      )}
    </MePushPage>
  );
}
