import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ChevronLeft, ChevronRight, Copy, CornerUpLeft, Flag, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import type { RouteComment, RouteCommentReportReason } from '../../data/routeComments';
import type { Theme } from '../../theme/theme';
import { reportRouteComment } from '../../hooks/useRouteComments';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { formatCommentTime } from './RouteCommentMedia';
import { routeGuideCopy } from './routeGuideCopy';

type Action = { key: string; label: string; icon: React.ReactNode; destructive?: boolean; onPress: () => void };

/** Bottom sheet for a comment's 更多 menu: the comment in context, an action list, and an in-place report step. */
export function RouteCommentActionSheet({ theme, comment, mine, signedIn, onClose, onReply, onDelete }: { theme: Theme; comment: RouteComment; mine: boolean; signedIn: boolean; onClose: () => void; onReply: (target: RouteComment) => void; onDelete: (target: RouteComment) => void }) {
  const nav = useNav();
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'actions' | 'report'>('actions');
  const translateY = useRef(new Animated.Value(600)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }),
      Animated.timing(backdrop, { toValue: 1, duration: motion.quick, useNativeDriver: true }),
    ]).start();
  }, [translateY, backdrop]);

  // Every exit animates out first, then runs the follow-up (open composer, dialog, toast).
  const dismiss = (then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 600, duration: motion.quick, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: motion.quick, useNativeDriver: true }),
    ]).start(() => { onClose(); then?.(); });
  };
  const dismissRef = useRef(dismiss); dismissRef.current = dismiss;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 100 || g.vy > 0.6) dismissRef.current();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
    },
  })).current;

  const report = (reason: RouteCommentReportReason) => dismiss(() => {
    void reportRouteComment(comment, reason).then(() => nav.showToast(c.reported)).catch((error: unknown) => {
      const message = String((error as { message?: unknown } | null)?.message ?? '');
      nav.showToast(message.includes('authentication') ? c.signInToComment : c.reportFailed);
    });
  });

  const actions: Action[] = [
    ...(comment.status === 'visible' ? [{ key: 'reply', label: c.reply, icon: <CornerUpLeft color={theme.text2} size={20} />, onPress: () => dismiss(() => onReply(comment)) }] : []),
    ...(comment.body ? [{ key: 'copy', label: c.copyComment, icon: <Copy color={theme.text2} size={20} />, onPress: () => dismiss(() => { void Clipboard.setStringAsync(comment.body).then(() => nav.showToast(c.commentCopied)); }) }] : []),
    ...(comment.status === 'visible' ? [{ key: 'report', label: c.reportComment, destructive: true, icon: <Flag color={theme.danger} size={20} />, onPress: () => { if (!signedIn) { dismiss(() => nav.showToast(c.signInToComment)); return; } setStep('report'); } }] : []),
    ...(mine ? [{ key: 'delete', label: c.deleteComment, destructive: true, icon: <Trash2 color={theme.danger} size={20} />, onPress: () => dismiss(() => onDelete(comment)) }] : []),
  ];
  const reasons = [['spam', c.reportSpam], ['false_info', c.reportFalseInfo], ['abuse', c.reportAbuse], ['other', c.reportOther]] as const;

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => step === 'report' ? setStep('actions') : dismiss()}>
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={c.cancel} style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY }], backgroundColor: theme.groupedBg, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        <View {...pan.panHandlers} style={styles.grabberArea}><View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} /></View>
        {step === 'actions' ? <>
          <View style={[styles.quote, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
            <View style={styles.quoteAuthor}>
              <Avatar size={22} uri={comment.authorAvatarUrl || undefined} />
              <Text numberOfLines={1} style={[type.note, styles.shrink, { color: theme.text2, fontWeight: '600' }]}>{comment.author}</Text>
              <Text style={[type.meta, { color: theme.text3 }]}>{formatCommentTime(comment.createdAt, resolved)}</Text>
            </View>
            <Text numberOfLines={2} style={[type.step, { color: comment.body ? theme.text : theme.text3, marginTop: space.xs }]}>{comment.body || (comment.status === 'deleted' ? c.deletedComment : `[${c.addMedia}]`)}</Text>
          </View>
          <View style={[styles.group, { marginTop: space.md, backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
            {actions.map((action, index) => <Press key={action.key} accessibilityRole="button" onPress={action.onPress} style={styles.row}>
              <View style={styles.rowIcon}>{action.icon}</View>
              <View style={[styles.rowLabel, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
                <Text style={[type.body, { color: action.destructive ? theme.danger : theme.text }]}>{action.label}</Text>
              </View>
            </Press>)}
          </View>
        </> : <>
          <View style={styles.reportHeader}>
            <Press accessibilityRole="button" accessibilityLabel={c.cancel} hitSlop={8} onPress={() => setStep('actions')} style={styles.back}><ChevronLeft color={theme.text} size={22} /></Press>
            <Text style={[type.cardTitle, { color: theme.text }]}>{c.reportTitle}</Text>
            <View style={styles.back} />
          </View>
          <View style={[styles.group, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
            {reasons.map(([reason, label], index) => <Press key={reason} accessibilityRole="button" onPress={() => report(reason)} style={[styles.reasonRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
              <Text style={[type.body, { flex: 1, color: theme.text }]}>{label}</Text>
              <ChevronRight color={theme.text3} size={16} />
            </Press>)}
          </View>
        </>}
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { overflow: 'hidden', borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  grabberArea: { paddingTop: space.sm, paddingBottom: space.md, alignItems: 'center' },
  grabber: { width: 36, height: 5, borderRadius: radius.pill },
  shrink: { flexShrink: 1 },
  quote: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  quoteAuthor: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'stretch', minHeight: 52 },
  rowIcon: { width: 52, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, justifyContent: 'center', paddingRight: space.lg },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  reasonRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
});
