// NotifInboxPage.tsx — 消息中心: a single-direction inbox. Filter chips (全部 /
// 动态 / 系统), 今天 / 更早 buckets, rich title lines, avatar-or-glyph leading,
// thumbnail-or-action-chip trailing. Mirrors the prototype NotifInbox, adapted
// to the app's Notif shape (data/notifications.ts).
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { KPState } from '../State';
import { useNotifCenter, Notif } from '../../data/notifications';
import { useI18n, TKey } from '../../i18n';
import { MePushPage } from './MePushPage';

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
  last,
  onTap,
}: {
  theme: Theme;
  item: Notif;
  last?: boolean;
  onTap: () => void;
}) {
  const unread = !item.read;
  return (
    <Press onPress={onTap}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          paddingLeft: 8,
          paddingRight: 14,
          paddingVertical: 13,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          backgroundColor: unread ? theme.accentSofter : 'transparent',
        }}
      >
        <View style={{ width: 8, alignSelf: 'center', alignItems: 'center' }}>
          {unread ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.accent }} /> : null}
        </View>
        <Glyph theme={theme} item={item} />
        <View style={{ flex: 1, paddingTop: 1 }}>
          <Title theme={theme} item={item} />
          <Text style={{ fontSize: 11, color: theme.text3, marginTop: 5 }}>{item.time}</Text>
        </View>
        {item.thumb ? (
          <PhotoTile tone={item.thumb} seed={item.id} radius={10} style={{ width: 46, height: 46 }} resWidth={120} />
        ) : item.action ? (
          <View
            style={{
              alignSelf: 'center',
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: theme.accent,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#fff' }}>{item.action}</Text>
          </View>
        ) : null}
      </View>
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
      <Press onPress={nc.markAllRead} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: theme.accent }}>{t('account.inbox.markAllRead')}</Text>
      </Press>
    ) : undefined;

  return (
    <MePushPage theme={theme} title={t('account.inbox.pageTitle')} onBack={onBack} right={markAll}>
      {/* filter chips */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          const n = f.id === 'all' ? 0 : nc.list.filter((x) => x.cat === f.id && !x.read).length;
          return (
            <Press
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 15,
                paddingVertical: 7,
                borderRadius: 999,
                // Unselected chips read as white "floating" controls, matching the
                // back button (light: #fff / dark: #2C2C2E) — same hairline + soft
                // shadow. Selected stays accent-filled as the highlight.
                backgroundColor: on ? theme.accent : theme.dark ? '#2C2C2E' : '#fff',
                borderWidth: on ? 0 : StyleSheet.hairlineWidth,
                borderColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                shadowColor: '#000',
                shadowOpacity: theme.dark ? 0.5 : 0.14,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: on ? '600' : '500', color: on ? '#fff' : theme.text2 }}>
                {t(f.labelKey)}
              </Text>
              {n > 0 ? (
                <View
                  style={{
                    minWidth: 15,
                    height: 15,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    backgroundColor: on ? 'rgba(255,255,255,0.25)' : theme.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: on ? '#fff' : theme.accent }}>{n}</Text>
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
            <View key={b.id} style={{ marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: theme.text2,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  paddingHorizontal: 22,
                  paddingTop: 8,
                  paddingBottom: 6,
                }}
              >
                {b.label}
              </Text>
              {rows.map((item, i) => (
                <Row key={item.id} theme={theme} item={item} last={i === rows.length - 1} onTap={() => tap(item)} />
              ))}
            </View>
          );
        })
      )}
    </MePushPage>
  );
}
