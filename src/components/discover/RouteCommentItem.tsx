import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronDown, Heart, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import type { RouteComment } from '../../data/routeComments';
import type { Theme } from '../../theme/theme';
import { toggleRouteCommentLike } from '../../hooks/useRouteComments';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { CommentMediaStrip, formatCommentTime } from './RouteCommentMedia';
import { MeBadge } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';

export const fillCopy = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

/** Two-line comment row for the route card. */
export function RouteCommentPreviewRow({ theme, comment, onPress }: { theme: Theme; comment: RouteComment; onPress: () => void }) {
  const { resolved } = useI18n();
  const cover = comment.media[0];
  return <Press accessibilityRole="button" onPress={onPress} style={styles.preview}>
    <View style={styles.previewText}>
      <View style={styles.previewAuthor}>
        <Avatar size={20} uri={comment.authorAvatarUrl || undefined} />
        <Text numberOfLines={1} style={[type.note, styles.shrink, { color: theme.text2 }]}>{comment.author}</Text>
      </View>
      {comment.body ? <Text numberOfLines={2} style={[type.lead, { color: theme.text, marginTop: space.xs }]}>{comment.body}</Text> : null}
      <View style={styles.previewMeta}>
        <Text style={[type.meta, { color: theme.text3 }]}>{formatCommentTime(comment.createdAt, resolved)}</Text>
        {comment.likeCount ? <View style={styles.metaStat}><Heart color={theme.text3} size={12} /><Text style={[type.meta, { color: theme.text3 }]}>{comment.likeCount}</Text></View> : null}
        {comment.replyCount ? <View style={styles.metaStat}><MessageCircle color={theme.text3} size={12} /><Text style={[type.meta, { color: theme.text3 }]}>{comment.replyCount}</Text></View> : null}
      </View>
    </View>
    {cover ? <View style={styles.previewPhoto}>
      <Image source={{ uri: cover.thumbnail || cover.uri }} contentFit="cover" style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg }]} />
      {cover.kind === 'livePhoto' ? <View pointerEvents="none" style={styles.previewLiveIcon}><Icon name="livePhoto" color="#fff" size={22} /></View> : cover.kind === 'video' ? <View pointerEvents="none" style={styles.previewVideoIcon}><Icon name="play" color="#fff" size={12} /></View> : null}
    </View> : null}
  </Press>;
}

/** A top-level comment with its replies, as shown on the comment page. */
export function RouteCommentThread({ theme, comment, currentUserId, onReply, onMore }: { theme: Theme; comment: RouteComment; currentUserId: string | null; onReply: (target: RouteComment) => void; onMore: (target: RouteComment) => void }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const [expanded, setExpanded] = useState(false);
  const collapsedCount = 2;
  const replies = expanded ? comment.replies : comment.replies.slice(0, collapsedCount);
  const hiddenReplies = comment.replies.length - replies.length;
  if (comment.status === 'deleted') {
    return <View style={styles.thread}>
      <View style={[styles.deletedAvatar, { backgroundColor: theme.fieldSurface }]} />
      <View style={styles.threadBody}>
        <Text style={[type.small, { color: theme.text3, paddingVertical: space.xs }]}>{c.deletedComment}</Text>
        {renderReplies()}
      </View>
    </View>;
  }
  return <View style={styles.thread}>
    <AuthorAvatar comment={comment} size={32} />
    <View style={styles.threadBody}>
      <CommentContent theme={theme} comment={comment} parentAuthorId={null} mine={Boolean(currentUserId) && comment.userId === currentUserId} onReply={onReply} onMore={onMore} />
      {renderReplies()}
    </View>
  </View>;

  function renderReplies() {
    if (!comment.replies.length) return null;
    return <View style={styles.replies}>
      {replies.map((reply) => <View key={reply.id} style={styles.reply}>
        <AuthorAvatar comment={reply} size={22} />
        <View style={styles.threadBody}>
          <CommentContent theme={theme} comment={reply} parentAuthorId={comment.userId} mine={Boolean(currentUserId) && reply.userId === currentUserId} onReply={onReply} onMore={onMore} />
        </View>
      </View>)}
      {comment.replies.length > collapsedCount ? <Press accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={styles.expand}>
        <View style={[styles.expandRule, { backgroundColor: theme.hairline }]} />
        <Text style={[type.note, { color: theme.text2 }]}>{expanded ? c.collapseReplies : fillCopy(c.expandReplies, { n: hiddenReplies })}</Text>
        <ChevronDown color={theme.text3} size={14} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Press> : null}
    </View>;
  }
}

function AuthorAvatar({ comment, size }: { comment: RouteComment; size: number }) {
  const nav = useNav();
  return <Press accessibilityRole="button" accessibilityLabel={comment.author} onPress={() => nav.openUserProfile(comment.userId)}>
    <Avatar size={size} uri={comment.authorAvatarUrl || undefined} />
  </Press>;
}

function CommentContent({ theme, comment, parentAuthorId, mine, onReply, onMore }: { theme: Theme; comment: RouteComment; parentAuthorId: string | null; mine: boolean; onReply: (target: RouteComment) => void; onMore: (target: RouteComment) => void }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  // Only name the reply target when it is someone other than the thread author.
  const replyTo = comment.replyTo && comment.replyTo.userId !== parentAuthorId ? comment.replyTo : null;
  const nav = useNav();
  return <>
    <View style={styles.authorRow}>
      <Press accessibilityRole="button" onPress={() => nav.openUserProfile(comment.userId)} style={styles.shrink}>
        <Text numberOfLines={1} style={[type.note, { color: theme.text2, fontWeight: '600' }]}>{comment.author}</Text>
      </Press>
      {mine ? <MeBadge theme={theme} /> : null}
      {replyTo ? <>
        <Text style={[type.note, { color: theme.text3 }]}>{c.replyTo}</Text>
        <Text numberOfLines={1} style={[type.note, styles.shrink, { color: theme.text2, fontWeight: '600' }]}>{replyTo.name}</Text>
      </> : null}
      <View style={{ flex: 1 }} />
      <Press accessibilityRole="button" accessibilityLabel={c.more} hitSlop={8} onPress={() => onMore(comment)} style={styles.more}>
        <MoreHorizontal color={theme.text3} size={16} />
      </Press>
    </View>
    {comment.body ? <Press accessibilityRole="button" accessibilityHint={c.reply} onPress={() => onReply(comment)} onLongPress={() => onMore(comment)} delayLongPress={360}>
      <Text selectable={false} style={[type.step, { color: theme.text, marginTop: space.xxs }]}>{comment.body}</Text>
    </Press> : null}
    {comment.media.length ? <View style={{ marginTop: space.sm }}><CommentMediaStrip media={comment.media} /></View> : null}
    <View style={styles.actions}>
      <Text style={[type.meta, { color: theme.text3 }]}>{formatCommentTime(comment.createdAt, resolved)}</Text>
      <Press accessibilityRole="button" onPress={() => onReply(comment)} style={styles.action}>
        <Text style={[type.meta, { color: theme.text2, fontWeight: '600' }]}>{c.reply}</Text>
      </Press>
      <View style={{ flex: 1 }} />
      <LikeButton theme={theme} comment={comment} />
    </View>
  </>;
}

function LikeButton({ theme, comment }: { theme: Theme; comment: RouteComment }) {
  const nav = useNav();
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const [liked, setLiked] = useState(comment.liked);
  const [count, setCount] = useState(comment.likeCount);
  const pending = useRef(false);
  useEffect(() => { setLiked(comment.liked); setCount(comment.likeCount); }, [comment.id, comment.liked, comment.likeCount]);
  const toggle = () => {
    if (pending.current) return;
    pending.current = true;
    const previous = liked;
    setLiked(!previous);
    setCount((value) => Math.max(0, value + (previous ? -1 : 1)));
    void toggleRouteCommentLike(comment).then((updated) => {
      setLiked(updated.liked);
      setCount(updated.likeCount);
    }).catch((error: unknown) => {
      setLiked(comment.liked);
      setCount(comment.likeCount);
      const authRequired = String((error as { message?: unknown } | null)?.message ?? '').includes('authentication');
      nav.showToast(authRequired ? c.signInToComment : c.likeFailed);
    }).finally(() => { pending.current = false; });
  };
  return <Press accessibilityRole="button" accessibilityLabel={`${c.like} ${count}`} accessibilityState={{ selected: liked }} hitSlop={6} onPress={toggle} style={styles.like}>
    <Heart color={liked ? theme.like : theme.text3} fill={liked ? theme.like : 'transparent'} size={15} />
    <Text style={[type.meta, styles.likeCount, { color: liked ? theme.like : theme.text3 }]}>{count || ''}</Text>
  </Press>;
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg, paddingVertical: space.md },
  previewText: { flex: 1, minWidth: 0 },
  previewAuthor: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
  metaStat: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  previewPhoto: { width: 64, height: 64, borderRadius: radius.card, overflow: 'hidden' },
  previewLiveIcon: { position: 'absolute', left: space.xs, bottom: space.xs },
  previewVideoIcon: { position: 'absolute', right: space.xs, top: space.xs, width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.48)' },
  thread: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md },
  threadBody: { flex: 1, minWidth: 0 },
  deletedAvatar: { width: 32, height: 32, borderRadius: radius.pill },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 22 },
  more: { width: 28, height: 22, alignItems: 'flex-end', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 32, marginTop: space.xxs },
  action: { minHeight: 32, justifyContent: 'center' },
  like: { minWidth: 44, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.xxs },
  likeCount: { minWidth: 14 },
  replies: { marginTop: space.xs, gap: space.xs },
  reply: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  expand: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32, paddingLeft: 30 },
  expandRule: { width: 20, height: StyleSheet.hairlineWidth },
});
