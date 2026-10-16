import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Clipboard from 'expo-clipboard';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { ArrowUp, ImagePlus, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import type { Poi } from '../../data/pois';
import type { RouteComment, RouteCommentMedia, RouteCommentReportReason, RouteCommentSort } from '../../data/routeComments';
import type { Theme } from '../../theme/theme';
import { deleteRouteComment, reportRouteComment, submitRouteComment, useRouteComments } from '../../hooks/useRouteComments';
import { Press } from '../Press';
import { fillCopy, RouteCommentThread } from './RouteCommentItem';
import { routeGuideCopy } from './routeGuideCopy';

const MAX_MEDIA = 9;
const MAX_BODY = 500;
const errorMessage = (error: unknown) => String((error as { message?: unknown } | null)?.message ?? '');

/** Full comment page: sortable thread list with a reply-aware composer pinned to the bottom. */
export function RouteCommentsView({ theme, route, backgroundColor, autoFocus = false }: { theme: Theme; route: Poi; backgroundColor: string; autoFocus?: boolean }) {
  const nav = useNav();
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const [sort, setSort] = useState<RouteCommentSort>('hot');
  const { comments, total, loading, loadingMore, error, refresh, loadMore, currentUserId } = useRouteComments(route.id, { sort });
  const [replyTarget, setReplyTarget] = useState<RouteComment | null>(null);
  const [sheetTarget, setSheetTarget] = useState<RouteComment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RouteComment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const composerRef = useRef<TextInput>(null);

  const reply = (target: RouteComment) => {
    if (target.status !== 'visible') return;
    setReplyTarget(target);
    setTimeout(() => composerRef.current?.focus(), 0);
  };
  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteRouteComment(deleteTarget);
      if (replyTarget && (replyTarget.id === deleteTarget.id || replyTarget.parentId === deleteTarget.id)) setReplyTarget(null);
      setDeleteTarget(null);
    } catch {
      nav.showToast(c.deleteFailed);
    } finally {
      setDeleting(false);
    }
  };

  return <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
    <FlatList
      data={comments}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      onEndReachedThreshold={0.4}
      onEndReached={() => { void loadMore(); }}
      ListHeaderComponent={<View style={styles.header}>
        <Text style={[type.cardTitle, { color: theme.text }]}>{loading && !comments.length ? c.comments : fillCopy(c.commentCount, { n: total })}</Text>
        <View style={styles.sort}>
          {(['hot', 'latest'] as const).map((option) => <Press key={option} accessibilityRole="tab" accessibilityState={{ selected: sort === option }} onPress={() => setSort(option)} style={styles.sortOption}>
            <Text style={[type.note, { color: sort === option ? theme.text : theme.text3, fontWeight: sort === option ? '700' : '400' }]}>{option === 'hot' ? c.hot : c.latest}</Text>
          </Press>)}
        </View>
      </View>}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.hairline }]} />}
      renderItem={({ item }) => <RouteCommentThread theme={theme} comment={item} currentUserId={currentUserId} onReply={reply} onMore={setSheetTarget} />}
      ListEmptyComponent={loading ? <ActivityIndicator color={theme.accent} style={styles.state} /> : error ? <View style={styles.state}>
        <Text style={[type.body, { color: theme.text2 }]}>{c.loadFailed}</Text>
        <Press accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}><Text style={[type.body, { color: theme.accent }]}>{c.retry}</Text></Press>
      </View> : <Press accessibilityRole="button" onPress={() => composerRef.current?.focus()} style={styles.state}>
        <Text style={[type.body, { color: theme.text2 }]}>{c.noComments}</Text>
        <Text style={[type.note, { color: theme.text3, textAlign: 'center' }]}>{c.noCommentsHint}</Text>
      </Press>}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.accent} style={{ marginVertical: space.lg }} /> : null}
    />
    <RouteCommentComposer theme={theme} routeId={route.id} backgroundColor={backgroundColor} inputRef={composerRef} autoFocus={autoFocus} signedIn={Boolean(currentUserId)} replyTarget={replyTarget} onCancelReply={() => setReplyTarget(null)} onSent={() => setReplyTarget(null)} />
    {sheetTarget ? <RouteCommentActionSheet theme={theme} comment={sheetTarget} mine={Boolean(currentUserId) && sheetTarget.userId === currentUserId} signedIn={Boolean(currentUserId)} onClose={() => setSheetTarget(null)} onReply={reply} onDelete={setDeleteTarget} /> : null}
    <AppActionDialog theme={theme} visible={Boolean(deleteTarget)} title={c.deleteCommentTitle} message={c.deleteCommentMessage} confirmLabel={c.deleteComment} cancelLabel={c.cancel} destructive confirming={deleting} onConfirm={() => void confirmDelete()} onCancel={() => { if (!deleting) setDeleteTarget(null); }} />
  </KeyboardAvoidingView>;
}

function RouteCommentComposer({ theme, routeId, backgroundColor, inputRef, autoFocus, signedIn, replyTarget, onCancelReply, onSent }: { theme: Theme; routeId: string; backgroundColor: string; inputRef: React.RefObject<TextInput | null>; autoFocus: boolean; signedIn: boolean; replyTarget: RouteComment | null; onCancelReply: () => void; onSent: () => void }) {
  const nav = useNav();
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  // Replies are text-only; attached media stays for the next top-level comment.
  const allowMedia = !replyTarget;
  const canSend = !sending && (Boolean(draft.trim()) || (allowMedia && media.length > 0));

  useEffect(() => { if (autoFocus && signedIn) setTimeout(() => inputRef.current?.focus(), 350); }, [autoFocus, signedIn, inputRef]);

  const pickMedia = async () => {
    if (media.length >= MAX_MEDIA) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos', 'livePhotos'], allowsMultipleSelection: true, selectionLimit: MAX_MEDIA - media.length, quality: 0.8 });
    if (result.canceled) return;
    const accepted = result.assets.filter((asset) => {
      if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) return false;
      if (asset.type === 'video' && asset.duration && asset.duration > 15_000) return false;
      return true;
    });
    if (accepted.length !== result.assets.length) Alert.alert(c.mediaSkipped, c.mediaSkippedHint);
    const thumbs = await Promise.all(accepted.map(async (asset) => {
      if (asset.type !== 'video') return [asset.uri, asset.uri] as const;
      try { return [asset.uri, (await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 })).uri] as const; } catch { return [asset.uri, asset.uri] as const; }
    }));
    setPreviews((old) => ({ ...old, ...Object.fromEntries(thumbs) }));
    setMedia((old) => [...old, ...accepted].slice(0, MAX_MEDIA));
  };

  const send = async () => {
    if (!canSend) return;
    if (!signedIn) { nav.showToast(c.signInToComment); return; }
    setSending(true);
    try {
      const attachments: RouteCommentMedia[] = allowMedia ? media.map((asset) => ({ uri: asset.uri, kind: asset.type === 'video' ? 'video' : asset.type === 'livePhoto' ? 'livePhoto' : 'image', thumbnail: previews[asset.uri], pairedVideoUri: asset.pairedVideoAsset?.uri })) : [];
      await submitRouteComment({ routeId, body: draft, media: attachments, parentId: replyTarget ? replyTarget.parentId ?? replyTarget.id : null, replyToUserId: replyTarget?.userId ?? null });
      setDraft('');
      if (allowMedia) { setMedia([]); setPreviews({}); }
      inputRef.current?.blur();
      onSent();
    } catch (error) {
      const message = errorMessage(error);
      nav.showToast(message.includes('rate limited') ? c.commentRateLimited : message.includes('登录') ? c.signInToComment : c.commentFailed);
    } finally {
      setSending(false);
    }
  };

  return <View style={[styles.composerWrap, { backgroundColor, borderTopColor: theme.hairline, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
    {replyTarget ? <View style={styles.replyBar}>
      <Text numberOfLines={1} style={[type.note, { flex: 1, color: theme.text2 }]}>{fillCopy(c.replyPlaceholder, { name: replyTarget.author })}{replyTarget.body ? `：${replyTarget.body}` : ''}</Text>
      <Press accessibilityRole="button" accessibilityLabel={c.cancelReply} hitSlop={8} onPress={onCancelReply} style={styles.replyClose}><X color={theme.text3} size={16} /></Press>
    </View> : null}
    {allowMedia && media.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow} keyboardShouldPersistTaps="handled">
      {media.map((asset, index) => <View key={`${asset.assetId ?? asset.uri}-${index}`} style={styles.mediaTile}>
        <ExpoImage source={{ uri: previews[asset.uri] ?? asset.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        <Press accessibilityRole="button" accessibilityLabel={c.removeMedia} onPress={() => setMedia((old) => old.filter((_, i) => i !== index))} style={styles.mediaRemove}><X color="#fff" size={12} /></Press>
      </View>)}
    </ScrollView> : null}
    <View style={[styles.composer, { backgroundColor: theme.controlSurface, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }]}>
      {allowMedia ? <Press accessibilityRole="button" accessibilityLabel={c.addMedia} accessibilityState={{ disabled: media.length >= MAX_MEDIA }} disabled={media.length >= MAX_MEDIA} onPress={() => { if (!signedIn) { nav.showToast(c.signInToComment); return; } void pickMedia(); }} style={styles.composerSide}>
        <ImagePlus color={media.length >= MAX_MEDIA ? theme.text3 : theme.text2} size={20} />
      </Press> : <View style={{ width: space.md }} />}
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        onFocus={() => { if (!signedIn) { inputRef.current?.blur(); nav.showToast(c.signInToComment); } }}
        placeholder={replyTarget ? fillCopy(c.replyPlaceholder, { name: replyTarget.author }) : c.commentPlaceholder}
        placeholderTextColor={theme.text3}
        multiline
        maxLength={MAX_BODY}
        style={[type.composerInput, styles.input, { color: theme.text }]}
      />
      <Press accessibilityRole="button" accessibilityLabel={sending ? c.sending : c.send} accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={() => void send()} style={[styles.send, { backgroundColor: canSend ? theme.accent : theme.fieldSurface }]}>
        {sending ? <ActivityIndicator color="#fff" size="small" /> : <ArrowUp color={canSend ? '#fff' : theme.text3} size={18} strokeWidth={2.4} />}
      </Press>
    </View>
  </View>;
}

function RouteCommentActionSheet({ theme, comment, mine, signedIn, onClose, onReply, onDelete }: { theme: Theme; comment: RouteComment; mine: boolean; signedIn: boolean; onClose: () => void; onReply: (target: RouteComment) => void; onDelete: (target: RouteComment) => void }) {
  const nav = useNav();
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'actions' | 'report'>('actions');
  const report = async (reason: RouteCommentReportReason) => {
    onClose();
    try {
      await reportRouteComment(comment, reason);
      nav.showToast(c.reported);
    } catch (error) {
      const message = errorMessage(error);
      nav.showToast(message.includes('authentication') ? c.signInToComment : c.reportFailed);
    }
  };
  const rows: { label: string; destructive?: boolean; onPress: () => void }[] = step === 'actions' ? [
    ...(comment.status === 'visible' ? [{ label: c.reply, onPress: () => { onClose(); onReply(comment); } }] : []),
    ...(comment.body ? [{ label: c.copyComment, onPress: () => { onClose(); void Clipboard.setStringAsync(comment.body).then(() => nav.showToast(c.commentCopied)); } }] : []),
    mine
      ? { label: c.deleteComment, destructive: true, onPress: () => { onClose(); onDelete(comment); } }
      : { label: c.reportComment, destructive: true, onPress: () => { if (!signedIn) { onClose(); nav.showToast(c.signInToComment); return; } setStep('report'); } },
  ] : ([['spam', c.reportSpam], ['false_info', c.reportFalseInfo], ['abuse', c.reportAbuse], ['other', c.reportOther]] as const).map(([reason, label]) => ({ label, onPress: () => void report(reason) }));
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.sheetRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel={c.cancel} style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.groupedBg, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={styles.grabberArea}><View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} /></View>
        {step === 'report' ? <Text style={[type.cardTitle, styles.sheetTitle, { color: theme.text }]}>{c.reportTitle}</Text> : comment.body ? <Text numberOfLines={2} style={[type.note, styles.sheetTitle, { color: theme.text3 }]}>{comment.author}：{comment.body}</Text> : null}
        <View style={[styles.sheetGroup, { backgroundColor: theme.surfaceTop }]}>
          {rows.map((row, index) => <Press key={row.label} accessibilityRole="button" onPress={row.onPress} style={[styles.sheetRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
            <Text style={[type.body, { color: row.destructive ? theme.danger : theme.text }]}>{row.label}</Text>
          </Press>)}
        </View>
        <Press accessibilityRole="button" onPress={onClose} style={[styles.sheetGroup, styles.sheetRow, { backgroundColor: theme.surfaceTop, marginTop: space.sm }]}>
          <Text style={[type.body, { color: theme.text2 }]}>{c.cancel}</Text>
        </Press>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xl, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: space.xs },
  sort: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sortOption: { minHeight: 44, minWidth: 44, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 40 },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.xl },
  retry: { minHeight: 44, justifyContent: 'center' },
  composerWrap: { paddingHorizontal: space.lg, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28, marginBottom: space.xs, paddingHorizontal: space.xs },
  replyClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  mediaRow: { gap: space.sm, paddingBottom: space.sm },
  mediaTile: { width: 56, height: 56, borderRadius: radius.control, overflow: 'hidden', backgroundColor: '#222' },
  mediaRemove: { position: 'absolute', right: 3, top: 3, width: 20, height: 20, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 48, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingRight: space.xxs + 2, paddingVertical: space.xxs + 2 },
  composerSide: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 120, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 0 },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: space.xs, marginBottom: 2 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  grabberArea: { paddingTop: space.sm, paddingBottom: space.sm, alignItems: 'center' },
  grabber: { width: 30, height: 4, borderRadius: radius.pill },
  sheetTitle: { textAlign: 'center', marginBottom: space.md, paddingHorizontal: space.lg },
  sheetGroup: { borderRadius: radius.card, overflow: 'hidden' },
  sheetRow: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
