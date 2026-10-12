// MyRouteGuidesPage.tsx — 我的攻略: the author's guide library, grouped by review
// status (需要修改 first). Cards and swipe-to-delete mirror the 我的旅程 list; the
// detail / editor page mirrors the journey's 发布攻略 sheet. See DESIGN.md.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { AppActionDialog, AppCard, AppSectionHeader, DetailPage, layout, radius, space, type } from '../../design-system';
import { useData } from '../../data/DataContext';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { KPSpinner, KPState } from '../State';
import { TwoStageSwipeable } from '../TwoStageSwipeable';
import { RouteGuideEquipment, RouteGuideItinerary } from '../discover/RouteGuideContent';
import { MePushPage } from './MePushPage';
import { JOURNEY_SWIPE_SPRING, JourneySwipeDeleteAction } from './JourneySwipeDelete';
import type { MyRouteGuide } from '../../hooks/useRouteGuides';
import type { Poi } from '../../data/pois';

type Status = MyRouteGuide['status'];
type Draft = { title: string; intro: string; reflection: string };

const STATUS_LABEL: Record<Status, string> = { approved: '已通过', pending: '审核中', rejected: '需修改' };
const TITLE_MAX = 60;
const INTRO_MAX = 180;
const REFLECTION_MAX = 280;

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : '请稍后重试');

function statusColor(theme: Theme, status: Status) {
  if (status === 'rejected') return theme.danger;
  if (status === 'pending') return theme.accent;
  return theme.text2;
}

function GuideCard({ theme, guide, route, onPress }: { theme: Theme; guide: MyRouteGuide; route?: Poi; onPress: () => void }) {
  const photo = route?.photoUris?.[0];
  const color = statusColor(theme, guide.status);
  const statusIcon = guide.status === 'rejected' ? 'flag' : guide.status === 'pending' ? 'clock' : 'check';
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ borderRadius: radius.feature }}>
      <AppCard theme={theme} radius={radius.feature} style={[styles.card, { backgroundColor: theme.fieldSurface }]}>
        <View style={{ minHeight: 86, flexDirection: 'row', alignItems: 'stretch', gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
              <Icon name={statusIcon} color={color} size={12} strokeWidth={2.2} />
              <Text style={[type.caption, { color, fontWeight: '600' }]}>{STATUS_LABEL[guide.status]}</Text>
            </View>
            <Text numberOfLines={2} style={[type.cardTitle, { color: theme.text, marginTop: space.xxs }]}>{guide.title}</Text>
            <View style={{ marginTop: space.xs, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <Icon name="route" color={theme.text3} size={12} />
                <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2 }]}>{route?.name || '路线攻略'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <Icon name="calendar" color={theme.text3} size={12} />
                <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2, fontVariant: ['tabular-nums'] }]}>{day(guide.updatedAt)}</Text>
              </View>
            </View>
            {guide.status === 'approved' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: space.sm }}>
                <Icon name="heart" color={theme.text2} size={13} />
                <Text style={[type.metric, { fontSize: 12, color: theme.text }]}>{guide.helpfulCount}</Text>
                <Text style={[type.caption, { color: theme.text2 }]}>人觉得有帮助</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.photo, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>
            {photo ? <Image source={{ uri: photo }} contentFit="cover" cachePolicy="memory-disk" transition={0} style={StyleSheet.absoluteFill} /> : <Icon name="compass" color={theme.text3} size={24} />}
          </View>
        </View>
        {guide.status === 'rejected' && guide.rejectionReason ? (
          <View style={[styles.reason, { backgroundColor: theme.dangerSoft }]}>
            <Text numberOfLines={3} style={[type.hint, { color: theme.text }]}>
              <Text style={{ color: theme.danger, fontWeight: '600' }}>驳回原因　</Text>
              {guide.rejectionReason}
            </Text>
          </View>
        ) : null}
      </AppCard>
    </Press>
  );
}

function PillButton({ theme, label, onPress, primary, busy, disabled, flex = 1 }: {
  theme: Theme; label: string; onPress: () => void; primary?: boolean; busy?: boolean; disabled?: boolean; flex?: number;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={[
        styles.pill,
        { flex, backgroundColor: primary ? theme.accent : theme.controlSurface, borderColor: theme.hairline, opacity: disabled ? 0.45 : 1 },
        !primary && styles.pillRaised,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={primary ? '#FFFFFF' : theme.accent} /> : <Text style={[type.chip, { color: primary ? '#FFFFFF' : theme.text }]}>{label}</Text>}
    </Press>
  );
}

// Guide detail + editor. Same structure as the journey's 发布攻略 sheet: a
// read-only preview, an edit step with text cards, and a floating action bar.
function GuideDetailPage({ theme, guide, onClose, onSave, onOpenOnline }: {
  theme: Theme; guide: MyRouteGuide; onClose: () => void; onSave: (values: Draft) => Promise<void>; onOpenOnline: () => void;
}) {
  const { profile } = useData();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'preview' | 'edit'>('preview');
  const [draft, setDraft] = useState<Draft>({ title: guide.title, intro: guide.intro, reflection: guide.reflection });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const editing = step === 'edit';
  const canSubmit = Boolean(draft.title.trim());
  const plan = guide.plan;
  const author = profile.nick.trim() || '我';
  const textCard = { minHeight: 96, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.feature, backgroundColor: theme.surfaceTop } as const;
  const input = [type.body, { width: '100%' as const, minHeight: 48, padding: 0, lineHeight: 24, color: theme.text, textAlignVertical: 'top' as const }];

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
    } catch (e) {
      setError(`提交失败：${errorMessage(e)}`);
      setSaving(false);
    }
  };

  const actions = editing ? (
    <>
      <PillButton theme={theme} label="完成编辑" onPress={() => setStep('preview')} disabled={saving} />
      <PillButton theme={theme} label="提交审核" onPress={() => void submit()} primary busy={saving} disabled={!canSubmit} flex={1.45} />
    </>
  ) : (
    <>
      <PillButton theme={theme} label="编辑攻略" onPress={() => setStep('edit')} />
      {guide.status === 'rejected' ? <PillButton theme={theme} label="提交审核" onPress={() => void submit()} primary busy={saving} disabled={!canSubmit} flex={1.45} /> : null}
      {guide.status === 'approved' ? <PillButton theme={theme} label="查看线上攻略" onPress={onOpenOnline} primary flex={1.45} /> : null}
    </>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <DetailPage
        theme={theme}
        title="攻略详情"
        onBack={onClose}
        backgroundColor={editing ? theme.groupedBg : theme.featureSurface}
        flatChrome
        entryVariant="continuationX"
        scrollable={false}
        overlay={
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>{actions}</View>
          </View>
        }
      >
        <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={insets.bottom + 24} extraKeyboardSpace={insets.bottom} contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: 130 }}>
          {guide.status === 'rejected' && guide.rejectionReason ? (
            <View style={[styles.notice, { backgroundColor: theme.dangerSoft }]}>
              <Text style={[type.hint, { color: theme.text }]}>
                <Text style={{ color: theme.danger, fontWeight: '600' }}>驳回原因　</Text>
                {guide.rejectionReason}
              </Text>
            </View>
          ) : guide.status === 'pending' ? (
            <View style={[styles.notice, { backgroundColor: theme.accentSofter }]}>
              <Text style={[type.hint, { color: theme.text2 }]}>审核中，通过后会展示给其他用户。修改并重新提交会重新开始审核。</Text>
            </View>
          ) : null}
          {error ? (
            <View style={[styles.notice, { backgroundColor: theme.dangerSoft }]}>
              <Text style={[type.hint, { color: theme.danger }]}>{error}</Text>
            </View>
          ) : null}

          {editing ? (
            <View style={[textCard, { marginTop: space.sm }]}>
              <TextInput value={draft.title} onChangeText={(title) => setDraft((old) => ({ ...old, title }))} maxLength={TITLE_MAX} placeholder="输入攻略标题" placeholderTextColor={theme.text3} accessibilityLabel="标题" style={[type.fieldLabel, { width: '100%', minHeight: 48, padding: 0, color: theme.text }]} />
            </View>
          ) : (
            <Text style={[type.pageTitle, { color: theme.text, lineHeight: 32, marginTop: space.sm }]}>{draft.title || '未命名攻略'}</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
            <Avatar size={28} uri={profile.avatarUrl} />
            <Text style={[type.caption, { color: theme.text2 }]}>{author}</Text>
          </View>
          <Text style={[type.caption, { color: theme.text2, marginTop: space.sm }]}>发布于 {day(guide.submittedAt || guide.updatedAt)}</Text>

          {editing ? (
            <View style={[textCard, { marginTop: space.xl }]}>
              <TextInput value={draft.intro} onChangeText={(intro) => setDraft((old) => ({ ...old, intro }))} maxLength={INTRO_MAX} multiline placeholder="这次旅程最值得分享的经验" placeholderTextColor={theme.text3} accessibilityLabel="简介" style={input} />
            </View>
          ) : draft.intro.trim() ? (
            <Text style={[type.body, { color: theme.text2, lineHeight: 25, marginTop: space.xl }]}>{draft.intro}</Text>
          ) : null}

          {plan?.days?.length || plan?.gear?.length ? (
            <View style={{ marginTop: space.xl }}>
              <Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>旅程</Text>
              <RouteGuideItinerary theme={theme} plan={plan} />
              <View style={{ marginTop: space.xxl }}>
                <RouteGuideEquipment theme={theme} plan={plan} />
              </View>
            </View>
          ) : null}

          <Text style={[type.sectionTitle, { color: theme.text, marginTop: space.xxl, marginBottom: space.md }]}>如果再走一次</Text>
          {editing ? (
            <View style={textCard}>
              <TextInput value={draft.reflection} onChangeText={(reflection) => setDraft((old) => ({ ...old, reflection }))} maxLength={REFLECTION_MAX} multiline placeholder="记录给后来者的建议" placeholderTextColor={theme.text3} accessibilityLabel="心得" style={input} />
            </View>
          ) : draft.reflection.trim() ? (
            <Text style={[type.body, { color: theme.text2, lineHeight: 25 }]}>{draft.reflection}</Text>
          ) : null}
        </KeyboardAwareScrollView>
      </DetailPage>
    </Modal>
  );
}

export function MyRouteGuidesPage({ theme, guides, loading, routes, onBack, onOpen, onRefresh, onUpdate, onDelete, showToast }: {
  theme: Theme; guides: MyRouteGuide[]; loading: boolean; routes: Map<string, Poi>;
  onBack: () => void; onOpen: (guide: MyRouteGuide) => void; onRefresh: () => void;
  onUpdate: (guide: MyRouteGuide, values: Draft) => Promise<void>;
  onDelete: (guide: MyRouteGuide) => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [selected, setSelected] = useState<MyRouteGuide | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<MyRouteGuide | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const pendingSwipeCloseRef = useRef<(() => void) | null>(null);

  // Review status changes server-side, so reload whenever the page opens
  // instead of offering a manual refresh button.
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    refreshRef.current();
  }, []);

  const sections: { id: Status; label: string; items: MyRouteGuide[]; trailing: string }[] = [
    { id: 'rejected', label: '需要修改' },
    { id: 'pending', label: '审核中' },
    { id: 'approved', label: '已发布' },
  ].map(({ id, label }) => {
    const items = guides.filter((guide) => guide.status === id);
    const helpful = items.reduce((sum, guide) => sum + guide.helpfulCount, 0);
    return { id: id as Status, label, items, trailing: id === 'approved' ? `${items.length} 篇，共 ${helpful} 次有帮助` : `${items.length} 篇` };
  }).filter((section) => section.items.length > 0);

  const confirmDelete = () => {
    if (!deleteCandidate || deletingId) return;
    const candidate = deleteCandidate;
    pendingSwipeCloseRef.current = null;
    setDeletingId(candidate.id);
    onDelete(candidate)
      .catch((error) => showToast(`删除失败：${errorMessage(error)}`))
      .finally(() => {
        setDeletingId(undefined);
        setDeleteCandidate(null);
      });
  };

  return (
    <>
      <MePushPage theme={theme} title="我的攻略" onBack={onBack}>
        <View style={styles.content}>
          {loading && guides.length === 0 ? (
            <View style={{ paddingVertical: 120, alignItems: 'center' }}>
              <KPSpinner theme={theme} label="正在加载攻略" />
            </View>
          ) : guides.length === 0 ? (
            <KPState theme={theme} icon="compass" title="还没有发布攻略" body="完成一次旅程后，可以在旅程设置中整理并发布攻略。" style={{ marginTop: space.xxxl }} />
          ) : (
            sections.map((section, index) => (
              <View key={section.id} style={{ gap: space.md }}>
                <AppSectionHeader
                  theme={theme}
                  text={section.label}
                  marginTop={index === 0 ? space.xs : layout.sectionGap}
                  variant="title"
                  trailing={<Text style={[type.caption, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{section.trailing}</Text>}
                />
                {section.items.map((guide) => (
                  <TwoStageSwipeable
                    key={guide.id}
                    friction={1}
                    rightThreshold={56}
                    dragOffsetFromRightEdge={6}
                    animationOptions={JOURNEY_SWIPE_SPRING}
                    onSecondLeftSwipe={(methods) => {
                      pendingSwipeCloseRef.current = methods.close;
                      setDeleteCandidate(guide);
                    }}
                    containerStyle={{ borderRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.featureSurface }}
                    renderRightActions={(progress, _translation, methods) => (
                      <JourneySwipeDeleteAction
                        progress={progress}
                        theme={theme}
                        label="删除攻略"
                        onPress={() => {
                          methods.close();
                          setDeleteCandidate(guide);
                        }}
                      />
                    )}
                  >
                    <GuideCard theme={theme} guide={guide} route={routes.get(guide.routeId)} onPress={() => setSelected(guide)} />
                  </TwoStageSwipeable>
                ))}
              </View>
            ))
          )}
        </View>
      </MePushPage>

      {selected ? (
        <GuideDetailPage
          key={selected.id}
          theme={theme}
          guide={selected}
          onClose={() => setSelected(null)}
          onOpenOnline={() => onOpen(selected)}
          onSave={async (values) => {
            await onUpdate(selected, values);
            setSelected(null);
          }}
        />
      ) : null}

      <AppActionDialog
        theme={theme}
        visible={Boolean(deleteCandidate)}
        title="删除攻略"
        message="删除后无法恢复，其他用户也将无法再看到这篇攻略。"
        confirmLabel="删除"
        cancelLabel="取消"
        destructive
        confirmIcon="trash"
        confirming={Boolean(deletingId) && deletingId === deleteCandidate?.id}
        onCancel={() => {
          pendingSwipeCloseRef.current?.();
          pendingSwipeCloseRef.current = null;
          setDeleteCandidate(null);
        }}
        onConfirm={confirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.pagePadding, paddingBottom: space.xxxl },
  card: { boxShadow: 'none', padding: space.md, borderWidth: 0, overflow: 'hidden' },
  photo: { width: 82, height: 86, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  reason: { marginTop: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.card },
  notice: { marginBottom: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card },
  pill: { minHeight: layout.fieldHeight, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  pillRaised: { shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});
