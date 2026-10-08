import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { radius, space } from '../../design-system';
import { useI18n } from '../../i18n';
import { guideText } from '../../data/routeGuides';
import type { RouteCondition } from '../../data/routeConditions';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { RoutePhotoCarousel } from './RoutePhotoCarousel';

export function RouteConditionCard({ theme, report, compact = false, onPress }: { theme: Theme; report: RouteCondition; compact?: boolean; onPress?: () => void }) {
  const { resolved } = useI18n();
  const zh = resolved === 'zh';
  const [width, setWidth] = useState(0);
  const content = <>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{guideText(report.author, resolved)}</Text>
      <Text style={{ color: report.source === 'official' ? theme.accent : theme.text2, fontSize: 11 }}>{report.source === 'official' ? (zh ? '官方发布' : 'Official post') : (zh ? '用户分享' : 'Community post')}</Text>
      {report.verification ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><ShieldCheck color={theme.accent} size={13} /><Text style={{ color: theme.accent, fontSize: 11 }}>{zh ? '官方已核实' : 'Officially verified'}</Text></View> : null}
    </View>
    <Text style={{ color: theme.text2, fontSize: 11.5, lineHeight: 20, marginTop: space.xs }}>{report.visitedAt} {zh ? '到访' : 'visited'} · {guideText(report.section, resolved)}</Text>
    <Text numberOfLines={compact ? 2 : undefined} style={{ color: theme.text, fontSize: 13, lineHeight: 23, marginTop: space.sm }}>{guideText(report.body, resolved)}</Text>
    {report.photos.length && width > 0 ? <View style={{ marginTop: space.md }}><RoutePhotoCarousel theme={theme} photos={compact ? report.photos.slice(0, 1) : report.photos} width={width} height={compact ? 150 : 210} radius={radius.card} /></View> : null}
    {!compact ? <Text style={{ color: theme.text3, fontSize: 11, lineHeight: 19, marginTop: space.md }}>{zh ? '发布于' : 'Published'} {report.publishedAt}{report.verification ? `\n${guideText(report.verification.by, resolved)} · ${report.verification.at} ${zh ? '核实' : 'verified'}` : ''}</Text> : null}
  </>;
  const style = { paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline };
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {onPress ? <Press accessibilityRole="button" onPress={onPress} style={style}>{content}</Press> : <View style={style}>{content}</View>}
  </View>;
}
