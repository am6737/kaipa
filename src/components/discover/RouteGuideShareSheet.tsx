import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image as ImageIcon, Share2, Copy, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { RouteCommunityGuide } from '../../data/routeGuides';
import type { Theme } from '../../theme/theme';
import { buildGuideDocument, buildGuideText } from '../../lib/routeGuideExport';
import { Press } from '../Press';
import { WeChatIcon } from '../WeChatIcon';
import { routeGuideCopy } from './routeGuideCopy';

export function RouteGuideShareSheet({ theme, routeName, guide, onClose, onExport }: { theme: Theme; routeName: string; guide: RouteCommunityGuide; onClose: () => void; onExport: () => void }) {
  const { resolved } = useI18n();
  const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const data = useMemo(() => buildGuideDocument(routeName, guide, resolved), [guide, resolved, routeName]);
  const text = useMemo(() => buildGuideText(data, resolved), [data, resolved]);
  useEffect(() => { Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start(); }, [translateY]);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_e, g) => { if (g.dy > 100 || g.vy > 0.6) Animated.timing(translateY, { toValue: 700, duration: motion.quick, useNativeDriver: true }).start(() => closeRef.current()); else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start(); },
  })).current;
  const shareText = async () => { try { await Share.share({ title: data.title, message: text }); } catch (error: any) { if (error?.message !== 'User did not share') console.warn('[RouteGuideShareSheet]', error); } };
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const copyText = async () => {
    try { await Clipboard.setStringAsync(text); } catch (error) { console.warn('[RouteGuideShareSheet] copy failed:', error); return; }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1800);
  };
  return <View style={[StyleSheet.absoluteFill, styles.root]}>
    <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
    <Animated.View style={[styles.sheet, { transform: [{ translateY }], backgroundColor: theme.groupedBg, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View {...pan.panHandlers} style={styles.grabberArea}><View style={[styles.grabber, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]} /></View>
      <View style={styles.quickActions}>
        <Press onPress={() => void copyText()} style={styles.quickAction}><View style={[styles.quickIcon, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>{copied ? <Check color={theme.text} size={22} strokeWidth={2} /> : <Copy color={theme.text} size={20} />}</View><Text style={[type.caption, { color: theme.text }]}>{copied ? c.copied : c.copyText}</Text></Press>
        <Press onPress={() => void shareText()} style={styles.quickAction}><View style={[styles.quickIcon, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}><Share2 color={theme.text} size={21} /></View><Text style={[type.caption, { color: theme.text }]}>{c.shareText}</Text></Press>
        <Press onPress={onExport} style={styles.quickAction}><View style={[styles.quickIcon, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}><ImageIcon color={theme.text} size={20} /></View><Text style={[type.caption, { color: theme.text }]}>{c.exportGuide}</Text></Press>
        <Press onPress={() => void shareText()} style={styles.quickAction}><View style={[styles.quickIcon, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}><View style={styles.wechatIcon}><WeChatIcon size={23} /></View></View><Text style={[type.caption, { color: theme.text }]}>{c.wechat}</Text></Press>
      </View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({ root: { zIndex: 70, justifyContent: 'flex-end' }, backdrop: { backgroundColor: 'rgba(0,0,0,0.48)' }, sheet: { overflow: 'hidden', borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth }, grabberArea: { paddingTop: space.sm, paddingBottom: space.xs, alignItems: 'center' }, grabber: { width: 36, height: 5, borderRadius: radius.pill }, quickActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, marginTop: space.xl }, quickAction: { alignItems: 'center', gap: space.xs, flex: 1 }, quickIcon: { width: 48, height: 48, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, wechatIcon: { width: 28, height: 28, borderRadius: radius.control, backgroundColor: '#07C160', alignItems: 'center', justifyContent: 'center' } });
