import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as FSFile } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Linking, Modal, Pressable as Press, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { ArrowUp, ArrowUpRight, BriefcaseBusiness, CarFront, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, CornerDownLeft, FileText, Globe2, Link2, Menu, Mic, Mountain, Plus, RotateCcw, Square, SquarePen, TentTree, Trash2, X } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReAnimated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../../data/DataContext';
import { AppActionDialog, layout, motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { refetchJourneyPacking } from '../../hooks/useJourneyPacking';
import { refetchJourneyTimeline } from '../../hooks/useTimeline';
import { deleteAgentThread, getAgentHistory, getAgentRunActivity, getAgentThreads, getJourneyAgentThread, sendAgentTurn, undoAgentRun, type AgentAttachment, type AgentHistoryResponse, type AgentIntent, type AgentMessageUi, type AgentPlanPreview, type AgentQuickReply, type AgentRunActivity, type AgentSource, type AgentThreadSummary, type AgentTurnResponse, type AgentUndoAction } from '../../lib/appAgent';
import { uploadAgentAttachment } from '../../lib/storage';
import type { Theme } from '../../theme/theme';
import { AssistantMark } from './AssistantMark';
import { AssistantAttachmentTray, type LocalAgentAttachment } from './AssistantAttachmentTray';
import { SourceBrandIcon, sourceBrandKind } from './SourceBrandIcon';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { TwoStageSwipeable } from '../TwoStageSwipeable';
import { useSpeechRecognitionInput, type SpeechRecognitionInputError } from './useSpeechRecognitionInput';

type Turn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  quickReplies?: AgentQuickReply[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
  attachments?: AgentAttachment[];
  undoAction?: AgentUndoAction;
  createJourneyFlow?: AgentMessageUi['createJourneyFlow'];
};

const storageKey = (userId: string, journeyId?: string) => `kaipa_agent_thread_v1:${userId}:${journeyId || 'global'}`;

function createRunId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}


function localAgentTimeContext() {
  const now = new Date();
  const clientLocalDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const clientLocalTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  return { clientLocalDate, clientLocalTime, clientTimeZone, clientTimestamp: now.toISOString() };
}

function localAttachmentId(prefix: string, uri: string) {
  return `${prefix}:${uri}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isTrackAttachmentName(name: string) {
  return /\.(gpx|kml|kmz)(?:$|[?#])/i.test(name);
}

function trackFileName(file: { name?: string; uri?: string; type?: string }) {
  const candidates = [file.name, file.uri ? decodeURIComponent(file.uri) : undefined].filter((value): value is string => Boolean(value));
  const candidate = candidates.find(isTrackAttachmentName) || file.name || candidates[0] || `track-${Date.now()}.gpx`;
  const ext = candidate.match(/\.(gpx|kml|kmz)(?:$|[?#])/i)?.[1]?.toLowerCase();
  if (ext) {
    const baseName = candidate.split(/[/?#]/).pop() || candidate;
    return `${baseName.replace(/\.(gpx|kml|kmz).*$/i, '')}.${ext}`;
  }
  if (/kml/i.test(file.type || '')) return `${candidate}.kml`;
  if (/kmz|zip/i.test(file.type || '')) return `${candidate}.kmz`;
  if (/gpx|xml|text/i.test(file.type || '')) return `${candidate}.gpx`;
  return candidate;
}

function isTrackPickedFile(file: { name?: string; uri?: string; type?: string }) {
  return isTrackAttachmentName(file.name || '') || isTrackAttachmentName(file.uri ? decodeURIComponent(file.uri) : '') || /(gpx|kml|kmz)/i.test(file.type || '');
}

function trackMimeType(name: string, fallback?: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'gpx') return 'application/gpx+xml';
  if (ext === 'kml') return 'application/vnd.google-earth.kml+xml';
  if (ext === 'kmz') return 'application/vnd.google-earth.kmz';
  return fallback || 'application/octet-stream';
}


function wantsNoTrackReply(message: string) {
  return /(不上传|不用上传|暂不上传|没有轨迹|无轨迹|跳过轨迹|不要轨迹|no track|skip track|not now)/i.test(message);
}

function wantsTrackUploadReply(message: string) {
  return /(上传轨迹|使用轨迹|有轨迹|gpx|kml|kmz|upload track|use track)/i.test(message);
}


function messageIsTrackPrompt(text: string) {
  // Only classify the current step as track upload when the assistant is
  // directly asking for a track. Date-collection copy may mention that track
  // upload comes later; that must not become a track action UI.
  return /^(这个旅程要上传|请先选择要使用的).{0,20}(GPX|KML|KMZ|轨迹)|请(?:先)?上传.{0,30}(GPX|KML|KMZ|轨迹)|^(Do you want to upload|Please choose).{0,40}track|please upload.{0,30}(GPX|KML|KMZ|track)/i.test(text.trim());
}

function turnHasTrackAction(turn: Turn) {
  return Boolean(turn.quickReplies?.some((reply) => reply.action === 'upload_track' || reply.action === 'skip_track'));
}

function isTrackPromptTurn(turn: Turn) {
  return turn.role === 'assistant' && (turn.createJourneyFlow?.step === 'ask_track' || turnHasTrackAction(turn) || messageIsTrackPrompt(turn.text));
}

function trackPromptFromTurn(turn: Turn): { message: string; intent?: AgentIntent } | undefined {
  if (turn.createJourneyFlow?.step === 'ask_track') return { message: turn.createJourneyFlow.originalMessage, intent: undefined };
  if (turn.role === 'assistant' && (turnHasTrackAction(turn) || messageIsTrackPrompt(turn.text))) return { message: '', intent: undefined };
  return undefined;
}

function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function formatTime(minutes?: number) {
  if (minutes == null) return undefined;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

type ResearchStep = {
  key: string;
  text: string;
  status: AgentRunActivity['status'];
  emphasis?: boolean;
};

function activityFingerprint(activities: AgentRunActivity[]) {
  return JSON.stringify(activities.map(({ toolName, status, arguments: args, output }) => ({ toolName, status, args, output })));
}

function searchReports(output: unknown) {
  if (!output || typeof output !== 'object' || !('sources' in output) || !Array.isArray(output.sources)) return [];
  return output.sources.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const report = value as Record<string, unknown>;
    if (typeof report.source !== 'string' || typeof report.status !== 'string') return [];
    return [{
      source: report.source,
      status: report.status,
      resultCount: Number(report.resultCount || 0),
    }];
  });
}

function completedJourneyTrackLabel(output: unknown, t: ReturnType<typeof useI18n>['t']) {
  if (!output || typeof output !== 'object') return undefined;
  const result = output as Record<string, unknown>;
  if ('hasTrack' in result) {
    if (!result.hasTrack) return undefined;
    const distance = String(result.distance || '').trim()
      || (Number.isFinite(Number(result.totalKm)) ? `${Number(result.totalKm).toFixed(Number(result.totalKm) >= 10 ? 1 : 2)} km` : '');
    const ascent = String(result.ascent || '').trim().replace(/^\+/, '');
    if (distance && ascent) return t('agent.research.journeyTrackLoadedStats', { distance, ascent });
    if (distance) return t('agent.research.journeyTrackLoadedDistance', { distance });
    return t('agent.research.journeyTrackLoaded');
  }
  const journey = result.journey && typeof result.journey === 'object'
    ? result.journey as Record<string, unknown>
    : undefined;
  const trackSummary = result.trackSummary && typeof result.trackSummary === 'object'
    ? result.trackSummary as Record<string, unknown>
    : undefined;
  const totalKm = Number(trackSummary?.totalKm);
  const hasTrack = Boolean(
    trackSummary
    || journey?.track_file_url
    || journey?.track_file_name
    || (Array.isArray(journey?.track_coords) && journey.track_coords.length > 1),
  );
  if (!hasTrack) return undefined;

  const distance = String(journey?.dist || '').trim()
    || (Number.isFinite(totalKm) ? `${totalKm.toFixed(totalKm >= 10 ? 1 : 2)} km` : '');
  const ascent = String(journey?.asc_ || '').trim().replace(/^\+/, '');
  if (distance && ascent) return t('agent.research.journeyTrackLoadedStats', { distance, ascent });
  if (distance) return t('agent.research.journeyTrackLoadedDistance', { distance });
  return t('agent.research.journeyTrackLoaded');
}

function researchSteps(activities: AgentRunActivity[], t: ReturnType<typeof useI18n>['t']): ResearchStep[] {
  return activities.flatMap((activity, index) => {
    const key = `${activity.toolName}_${index}`;
    const query = String(activity.arguments.query || '').trim();
    if (activity.toolName === 'search_travel_web') {
      const searchStep: ResearchStep = {
        key,
        status: activity.status,
        emphasis: true,
        text: t(activity.status === 'running'
          ? 'agent.research.searchingTitle'
          : activity.status === 'failed'
          ? 'agent.research.searchFailedTitle'
          : 'agent.research.searchCompletedTitle'),
      };
      const queryStep: ResearchStep[] = query ? [{
        key: `${key}_query`,
        status: activity.status,
        text: t('agent.research.query', { query }),
      }] : [];
      if (activity.status !== 'completed') return [searchStep, ...queryStep];
      const reports = searchReports(activity.output);
      const providerSteps: ResearchStep[] = reports.map((report) => ({
        key: `${key}_${report.source}`,
        status: report.status === 'completed' ? 'completed' : 'failed',
        text: report.status === 'completed'
          ? t('agent.research.sourceFound', { query, source: sourceLabel(report.source, t), count: report.resultCount })
          : report.status === 'unavailable'
          ? t('agent.research.sourceUnavailable', { source: sourceLabel(report.source, t) })
          : report.status === 'timed_out'
          ? t('agent.research.sourceTimedOut', { source: sourceLabel(report.source, t) })
          : t('agent.research.sourceFailed', { source: sourceLabel(report.source, t) }),
      }));
      return [searchStep, ...queryStep, ...providerSteps];
    }
    if (activity.toolName === 'get_journey_details' && activity.status === 'completed') {
      const trackLabel = completedJourneyTrackLabel(activity.output, t);
      if (trackLabel) return [{ key, status: activity.status, text: trackLabel }];
    }
    const stepKeys: Record<string, Record<AgentRunActivity['status'], TKey>> = {
      get_app_context: { running: 'agent.research.step.context.running', completed: 'agent.research.step.context.completed', failed: 'agent.research.step.context.failed' },
      search_journeys: { running: 'agent.research.step.journeys.running', completed: 'agent.research.step.journeys.completed', failed: 'agent.research.step.journeys.failed' },
      search_routes: { running: 'agent.research.step.routes.running', completed: 'agent.research.step.routes.completed', failed: 'agent.research.step.routes.failed' },
      list_gear: { running: 'agent.research.step.gear.running', completed: 'agent.research.step.gear.completed', failed: 'agent.research.step.gear.failed' },
      get_journey_details: { running: 'agent.research.step.journeyDetails.running', completed: 'agent.research.step.journeyDetails.completed', failed: 'agent.research.step.journeyDetails.failed' },
      create_journey: { running: 'agent.research.step.createJourney.running', completed: 'agent.research.step.createJourney.completed', failed: 'agent.research.step.createJourney.failed' },
      add_itinerary_items: { running: 'agent.research.step.itinerary.running', completed: 'agent.research.step.itinerary.completed', failed: 'agent.research.step.itinerary.failed' },
      set_journey_map_location: { running: 'agent.research.step.journeyMapLocation.running', completed: 'agent.research.step.journeyMapLocation.completed', failed: 'agent.research.step.journeyMapLocation.failed' },
      set_itinerary_group_endpoints: { running: 'agent.research.step.itineraryEndpoints.running', completed: 'agent.research.step.itineraryEndpoints.completed', failed: 'agent.research.step.itineraryEndpoints.failed' },
      add_packing_items: { running: 'agent.research.step.packing.running', completed: 'agent.research.step.packing.completed', failed: 'agent.research.step.packing.failed' },
      delete_itinerary_items: { running: 'agent.research.step.deleteItinerary.running', completed: 'agent.research.step.deleteItinerary.completed', failed: 'agent.research.step.deleteItinerary.failed' },
      delete_packing_items: { running: 'agent.research.step.deletePacking.running', completed: 'agent.research.step.deletePacking.completed', failed: 'agent.research.step.deletePacking.failed' },
      add_gear: { running: 'agent.research.step.addGear.running', completed: 'agent.research.step.addGear.completed', failed: 'agent.research.step.addGear.failed' },
      undo_last_agent_changes: { running: 'agent.research.step.undo.running', completed: 'agent.research.step.undo.completed', failed: 'agent.research.step.undo.failed' },
    };
    const keys = stepKeys[activity.toolName];
    return keys ? [{ key, status: activity.status, text: t(keys[activity.status]) }] : [];
  });
}

function activePlanningPhase(activities: AgentRunActivity[], t: ReturnType<typeof useI18n>['t']) {
  const lastActivity = activities.at(-1);
  if (!lastActivity) return t('agent.research.preparing');

  const phaseKeys: Partial<Record<string, TKey>> = {
    get_app_context: 'agent.research.phase.analyzingJourney',
    search_journeys: 'agent.research.phase.analyzingJourney',
    get_journey_details: 'agent.research.phase.analyzingJourney',
    search_routes: 'agent.research.phase.comparingRoutes',
    search_travel_web: 'agent.research.phase.buildingItinerary',
    create_journey: 'agent.research.phase.buildingItinerary',
    list_gear: 'agent.research.phase.matchingGear',
    add_itinerary_items: 'agent.research.phase.reviewingItinerary',
    set_journey_map_location: 'agent.research.phase.reviewingItinerary',
    set_itinerary_group_endpoints: 'agent.research.phase.reviewingItinerary',
    add_packing_items: 'agent.research.phase.reviewingPacking',
    add_gear: 'agent.research.phase.reviewingChanges',
    delete_itinerary_items: 'agent.research.phase.reviewingChanges',
    delete_packing_items: 'agent.research.phase.reviewingChanges',
    undo_last_agent_changes: 'agent.research.phase.reviewingChanges',
  };
  return t(phaseKeys[lastActivity.toolName] || 'agent.research.phase.organizingResults');
}

function sourceLabel(source: string, t: ReturnType<typeof useI18n>['t']) {
  if (source === 'xhs') return t('agent.research.source.xhs');
  if (source === 'douyin') return t('agent.research.source.douyin');
  if (source === 'tavily') return t('agent.research.source.tavily');
  return source;
}

function SelectableMessageText({ text, theme }: { text: string; theme: Theme }) {
  return (
    <View>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[type.body, styles.messageMeasure, { lineHeight: 22 }]}
      >
        {text}
      </Text>
      <TextInput
        accessibilityLabel={text}
        caretHidden
        multiline
        scrollEnabled={false}
        showSoftInputOnFocus={false}
        value={text}
        onChangeText={() => undefined}
        selectionColor={theme.accent}
        style={[StyleSheet.absoluteFill, type.body, styles.messageInput, { color: theme.text, lineHeight: 22 }]}
      />
    </View>
  );
}

function MessageAttachments({ theme, attachments }: { theme: Theme; attachments: AgentAttachment[] }) {
  return (
    <View style={styles.messageAttachments}>
      {attachments.map((attachment) => attachment.kind === 'image' ? (
        <Image key={attachment.url} source={{ uri: attachment.url }} contentFit="cover" style={styles.messageAttachmentImage} />
      ) : (
        <View key={attachment.url} style={[styles.messageAttachmentFile, { backgroundColor: theme.controlSurface }]}>
          <FileText size={18} color={theme.text2} strokeWidth={1.8} />
          <Text numberOfLines={1} style={[styles.messageAttachmentName, { color: theme.text }]}>{attachment.name}</Text>
        </View>
      ))}
    </View>
  );
}

function PendingAttachments({ theme, attachments, onRemove }: { theme: Theme; attachments: LocalAgentAttachment[]; onRemove: (id: string) => void }) {
  if (!attachments.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingAttachments}>
      {attachments.map((attachment) => (
        <View key={attachment.id} style={[styles.pendingAttachment, { backgroundColor: theme.fieldSurface }]}>
          {attachment.kind === 'image'
            ? <Image source={{ uri: attachment.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
            : <View style={styles.pendingFile}><FileText size={20} color={theme.text2} /><Text numberOfLines={2} style={[styles.pendingFileName, { color: theme.text }]}>{attachment.name}</Text></View>}
          <Press onPress={() => onRemove(attachment.id)} accessibilityRole="button" style={[styles.removeAttachment, { backgroundColor: theme.text }]}>
            <X size={12} color={theme.featureSurface} strokeWidth={2.5} />
          </Press>
        </View>
      ))}
    </ScrollView>
  );
}

function LoadingDots({ color }: { color: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 1050,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.loadingDots}>
      {[0, 1, 2].map((index) => {
        const start = Math.max(0.01, index * 0.18);
        const peak = start + 0.16;
        const end = start + 0.32;
        return (
          <Animated.View
            key={index}
            style={[
              styles.loadingDot,
              {
                backgroundColor: color,
                opacity: progress.interpolate({
                  inputRange: [0, start, peak, end, 1],
                  outputRange: [0.3, 0.3, 1, 0.3, 0.3],
                }),
                transform: [{
                  scale: progress.interpolate({
                    inputRange: [0, start, peak, end, 1],
                    outputRange: [0.8, 0.8, 1.15, 0.8, 0.8],
                  }),
                }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function ResearchActivity({ theme, activities, running }: { theme: Theme; activities: AgentRunActivity[]; running: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(running);
  const arrowProgress = useRef(new Animated.Value(running ? 1 : 0)).current;
  const steps = researchSteps(activities, t);
  const hasRunningStep = steps.some((step) => step.status === 'running');
  const visibleSteps: ResearchStep[] = steps.length
    ? [
        ...steps,
        ...(running && !hasRunningStep ? [{ key: 'active_phase', status: 'running' as const, text: activePlanningPhase(activities, t) }] : []),
      ]
    : [{ key: 'preparing', status: 'running', text: t('agent.research.preparing') }];
  const toggleExpanded = () => {
    const next = !expanded;
    arrowProgress.stopAnimation();
    Animated.timing(arrowProgress, {
      toValue: next ? 1 : 0,
      duration: next ? 140 : 90,
      easing: next
        ? Easing.bezier(0.16, 1, 0.3, 1)
        : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setExpanded(next);
  };
  return (
    <View style={styles.researchProgress}>
      <Press
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.researchHeader}
      >
        {running ? <ActivityIndicator size="small" color={theme.text} /> : <CheckCircle2 size={18} color={theme.text2} strokeWidth={2} />}
        <Text style={[styles.researchTitle, { color: theme.text }]}>{t(running ? 'agent.research.title' : 'agent.research.completed')}</Text>
        <Animated.View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{
              rotate: arrowProgress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '180deg'],
              }),
            }],
          }}
        >
          <ChevronDown size={17} color={theme.text3} />
        </Animated.View>
      </Press>
      {expanded ? visibleSteps.map((step) => (
        <View key={step.key} style={styles.researchLine}>
          {step.status === 'running'
            ? <LoadingDots color={step.emphasis ? theme.text : theme.text3} />
            : step.status === 'completed'
            ? <Check size={14} color={theme.text3} strokeWidth={2} />
            : <X size={14} color={theme.text3} strokeWidth={2} />}
          <Text style={[styles.researchLineText, step.emphasis && styles.researchLineTitle, { color: step.emphasis ? theme.text : theme.text2 }]}>{step.text}</Text>
        </View>
      )) : null}
    </View>
  );
}

function SourcesStrip({ theme, sources, title }: { theme: Theme; sources: AgentSource[]; title: string }) {
  return (
    <View style={styles.sourcesWrap}>
      <Text style={[styles.supportLabel, { color: theme.text3 }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourcesContent}>
        {sources.map((source) => {
          const brandKind = sourceBrandKind(source.source, source.url);
          return (
            <Press
              key={source.url}
              onPress={() => void Linking.openURL(source.url)}
              accessibilityRole="link"
              accessibilityLabel={source.title}
              style={[styles.sourceCard, { backgroundColor: theme.fieldSurface }]}
            >
              <View style={styles.sourceTop}>
                {brandKind
                  ? <SourceBrandIcon kind={brandKind} />
                  : <Globe2 size={15} color={theme.text3} strokeWidth={1.8} />}
                <Text numberOfLines={1} style={[styles.sourceHost, { color: theme.text3 }]}>{sourceHost(source.url)}</Text>
                <ArrowUpRight size={14} color={theme.text3} strokeWidth={1.8} />
              </View>
              <Text numberOfLines={2} style={[styles.sourceTitle, { color: theme.text }]}>{source.title}</Text>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PlanPreviewCard({ theme, preview, openLabel, onOpen }: { theme: Theme; preview: AgentPlanPreview; openLabel: string; onOpen: (journeyId: string) => void }) {
  const { resolved } = useI18n();
  return (
    <View style={[styles.planPreview, { backgroundColor: theme.surfaceTop }] }>
      <Text style={[styles.planTitle, { color: theme.text }]}>{preview.title}</Text>
      {preview.dateLabel ? <Text style={[styles.planMeta, { color: theme.text3 }]}>{preview.dateLabel}</Text> : null}
      <View style={styles.planDays}>
        {preview.days.slice(0, 7).map((day, index) => (
          <View key={`${day.label}_${index}`} style={styles.planDay}>
            <Text style={[styles.planDayTitle, { color: theme.text }]}>{journeyDayDisplayLabel(day.label, resolved)}</Text>
            {day.items.slice(0, 4).map((item, itemIndex) => {
              const start = formatTime(item.timeStart);
              const end = formatTime(item.timeEnd);
              const time = start ? `${start}${end ? `-${end}` : ''}` : undefined;
              return (
                <View key={`${item.title}_${itemIndex}`} style={styles.planItem}>
                  {time ? <Text style={[styles.planTime, { color: theme.text3 }]}>{time}</Text> : null}
                  <Text style={[styles.planItemText, { color: theme.text2 }]} numberOfLines={2}>{item.title}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Press onPress={() => onOpen(preview.journeyId)} accessibilityRole="button" accessibilityLabel={openLabel} style={styles.viewJourney}>
        <ArrowUpRight size={18} color={theme.text} strokeWidth={2} />
        <Text style={[styles.viewJourneyText, { color: theme.text }]}>{openLabel}</Text>
      </Press>
    </View>
  );
}

function firstPhoto(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const photo = value.find((item) => typeof item === 'string' || (item && typeof item === 'object' && ('uri' in item || 'url' in item)));
  if (typeof photo === 'string') return photo;
  if (photo && typeof photo === 'object') {
    const candidate = 'uri' in photo ? photo.uri : 'url' in photo ? photo.url : undefined;
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
}

function threadJourney(thread: AgentThreadSummary) {
  return Array.isArray(thread.journeys) ? thread.journeys[0] : thread.journeys;
}

function historyTurns(history: AgentHistoryResponse): Turn[] {
  return history.messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.content,
    quickReplies: message.ui?.quickReplies,
    sources: message.ui?.sources,
    planPreview: message.ui?.planPreview,
    activities: message.ui?.activities,
    attachments: message.ui?.attachments,
    undoAction: message.ui?.undoAction,
    createJourneyFlow: message.ui?.createJourneyFlow,
  }));
}

function synchronizedTurnFingerprint(turns: Turn[]) {
  return JSON.stringify(turns.map(({ role, text, quickReplies, sources, planPreview, activities, attachments, undoAction, createJourneyFlow }) => ({
    role, text, quickReplies, sources, planPreview, activities, attachments, undoAction, createJourneyFlow,
  })));
}

const VOICE_BAR_HEIGHTS = [5, 6, 8, 12, 7, 11, 15, 8, 6, 10, 14, 7, 11, 17, 9, 6, 12, 18, 8, 14, 7, 11, 16, 9, 6, 12, 8, 11, 7, 6, 5] as const;
const THREAD_SWIPE_SPRING = { mass: 0.7, damping: 22, stiffness: 240, overshootClamping: true } as const;

function VoiceListeningIndicator({ theme, label, cancelling }: { theme: Theme; label: string; cancelling: boolean }) {
  const bars = useRef(VOICE_BAR_HEIGHTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = bars.map((bar, index) => Animated.sequence([
      Animated.delay(index * 16),
      Animated.loop(Animated.sequence([
        Animated.timing(bar, { toValue: 1, duration: motion.quick + (index % 4) * 24, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0, duration: motion.quick + (index % 3) * 30, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    ]));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [bars]);

  return (
    <View style={styles.voiceListening} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <View style={styles.voiceBars}>
        {bars.map((bar, index) => (
          <Animated.View
            key={index}
            style={[
              styles.voiceBar,
              {
                height: VOICE_BAR_HEIGHTS[index],
                backgroundColor: cancelling ? theme.danger : theme.text3,
                opacity: bar.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }),
                transform: [{ scaleY: bar.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function ThreadSwipeActions({
  progress,
  theme,
  deleting,
  deleteDisabled,
  openLabel,
  deleteLabel,
  onOpen,
  onDelete,
}: {
  progress: SharedValue<number>;
  theme: Theme;
  deleting: boolean;
  deleteDisabled: boolean;
  openLabel: string;
  deleteLabel: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18, 1], [0, 0.62, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [32, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <ReAnimated.View style={[styles.threadSwipeActions, { backgroundColor: theme.featureSurface }, animatedStyle]}>
      <Press accessibilityRole="button" accessibilityLabel={openLabel} onPress={onOpen} style={styles.threadSwipeAction}>
        <Clock3 size={28} color={theme.text} strokeWidth={2.1} />
      </Press>
      <Press disabled={deleteDisabled} accessibilityRole="button" accessibilityLabel={deleteLabel} onPress={onDelete} style={styles.threadSwipeAction}>
        {deleting ? <ActivityIndicator color={theme.danger} /> : <Trash2 size={28} color={theme.danger} strokeWidth={2.1} />}
      </Press>
    </ReAnimated.View>
  );
}

export function AppAssistant({ theme, visible, initialPrompt, initialDisplayPrompt, autoSubmitInitialPrompt = false, currentJourneyId, onClose, onClearPrompt, onOpenJourney }: {
  theme: Theme;
  visible: boolean;
  initialPrompt?: string;
  initialDisplayPrompt?: string;
  autoSubmitInitialPrompt?: boolean;
  currentJourneyId?: string;
  onClose: () => void;
  onClearPrompt: () => void;
  onOpenJourney: (journeyId: string) => void;
}) {
  const { resolved, t } = useI18n();
  const data = useData();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const voiceLongPressTriggeredRef = useRef(false);
  const voiceHoldingRef = useRef(false);
  const voiceCancellingRef = useRef(false);
  const voiceTouchStartYRef = useRef(0);
  const voiceInitialInputRef = useRef('');
  const voiceSendOnEndRef = useRef(false);
  const pendingAutoSubmitRef = useRef<string | undefined>(undefined);
  const pendingAutoDisplayRef = useRef<string | undefined>(undefined);
  const restoredScopeRef = useRef<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [attachmentTrayOpen, setAttachmentTrayOpen] = useState(false);
  const [attachmentTrayMounted, setAttachmentTrayMounted] = useState(false);
  const attachmentTrayProgress = useRef(new Animated.Value(0)).current;
  const [selectedAttachments, setSelectedAttachments] = useState<LocalAgentAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [trackPrompt, setTrackPrompt] = useState<{ message: string; intent?: AgentIntent } | null>(null);
  const [trackPicking, setTrackPicking] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [voiceHolding, setVoiceHolding] = useState(false);
  const [voiceCancelling, setVoiceCancelling] = useState(false);
  const [threadId, setThreadId] = useState<string>();
  const [threadTitle, setThreadTitle] = useState('');
  const [threadJourneyId, setThreadJourneyId] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [runActivities, setRunActivities] = useState<AgentRunActivity[]>([]);
  const runActivitiesRef = useRef<AgentRunActivity[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [copiedTurnId, setCopiedTurnId] = useState<string>();
  const [undoingRunId, setUndoingRunId] = useState<string>();
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<string>();
  const [deleteThreadCandidate, setDeleteThreadCandidate] = useState<AgentThreadSummary>();
  const pendingThreadSwipeCloseRef = useRef<(() => void) | null>(null);
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const showSpeechError = (error: SpeechRecognitionInputError) => {
    if (error === 'no-speech' || error === 'failed') return;
    Alert.alert(t(
      error === 'permission-denied'
        ? 'agent.voicePermissionDenied'
        : 'agent.voiceUnavailable',
    ));
  };
  const speech = useSpeechRecognitionInput({
    locale: resolved,
    value: input,
    onChange: setInput,
    onError: showSpeechError,
  });
  const attachmentLabels = useMemo(() => ({
    camera: t('agent.attachment.camera'),
    library: t('agent.attachment.library'),
    file: t('agent.attachment.file'),
    recent: t('agent.attachment.recent'),
    permission: t('agent.attachment.permission'),
    tooMany: t('agent.attachment.tooMany'),
    tooLarge: t('agent.attachment.tooLarge'),
    failed: t('agent.attachment.failed'),
  }), [t]);
  const showAttachmentError = useCallback((message: string) => Alert.alert(message), []);
  const voiceActive = speech.isStarting || speech.isListening;
  const voiceMode = voiceHolding || voiceActive;
  const canSend = Boolean(input.trim() || selectedAttachments.length);
  const trackAttachmentSelected = selectedAttachments.some((attachment) => isTrackAttachmentName(attachment.name));
  const startVoiceInput = () => {
    inputRef.current?.blur();
    void speech.start();
  };
  const handleIdleInputPressIn = (event: GestureResponderEvent) => {
    voiceLongPressTriggeredRef.current = false;
    voiceCancellingRef.current = false;
    voiceTouchStartYRef.current = event.nativeEvent.pageY;
    setVoiceCancelling(false);
  };
  const handleIdleInputPress = () => {
    if (voiceLongPressTriggeredRef.current) {
      voiceLongPressTriggeredRef.current = false;
      return;
    }
    if (voiceActive) return;
    inputRef.current?.focus();
  };
  const handleIdleInputLongPress = () => {
    if (loading || voiceActive) return;
    voiceLongPressTriggeredRef.current = true;
    voiceHoldingRef.current = true;
    voiceInitialInputRef.current = input;
    voiceSendOnEndRef.current = false;
    setVoiceHolding(true);
    startVoiceInput();
  };
  const handleIdleInputPressMove = (event: GestureResponderEvent) => {
    if (!voiceHoldingRef.current) return;
    const cancelling = voiceTouchStartYRef.current - event.nativeEvent.pageY > 64;
    if (cancelling === voiceCancellingRef.current) return;
    voiceCancellingRef.current = cancelling;
    setVoiceCancelling(cancelling);
  };
  const finishHeldVoiceInput = (cancelled: boolean) => {
    if (!voiceHoldingRef.current) return;
    voiceHoldingRef.current = false;
    setVoiceHolding(false);
    if (cancelled || voiceCancellingRef.current) {
      voiceSendOnEndRef.current = false;
      speech.abort();
      setInput(voiceInitialInputRef.current);
    } else {
      voiceSendOnEndRef.current = true;
      speech.stop();
    }
    voiceCancellingRef.current = false;
    setVoiceCancelling(false);
  };
  const handleIdleInputTouchEnd = () => finishHeldVoiceInput(false);
  const handleIdleInputTouchCancel = () => finishHeldVoiceInput(true);
  const activeJourneyId = threadJourneyId;
  const currentJourney = useMemo(
    () => data.journeys.find((journey) => journey.id === activeJourneyId),
    [activeJourneyId, data.journeys],
  );
  const suggestions = useMemo(() => [
    { text: t('agent.suggestion.plan'), icon: BriefcaseBusiness, intent: 'plan_journey' as AgentIntent },
    { text: t('agent.suggestion.packing'), icon: Link2, intent: undefined },
  ], [t]);
  const journeySuggestions = useMemo(() => {
    if (!currentJourney) return [];
    return [
      { text: t('agent.journeySuggestion.scenery', { name: currentJourney.name }), icon: Mountain },
      { text: t('agent.journeySuggestion.route', { name: currentJourney.name }), icon: CarFront },
      { text: t('agent.journeySuggestion.stay', { name: currentJourney.name }), icon: TentTree },
    ];
  }, [currentJourney, t]);
  const chooseTrackForPlan = async (preset?: { message: string; intent?: AgentIntent }) => {
    if (trackPicking || loading || attachmentUploading) return;
    const pending = preset || trackPrompt;
    setTrackPrompt(null);
    if (!pending) return;
    setTrackPicking(true);
    try {
      const result = await FSFile.pickFileAsync({
        multipleFiles: true,
        mimeTypes: [
          'application/gpx+xml',
          'application/vnd.google-earth.kml+xml',
          'application/vnd.google-earth.kmz',
          'application/zip',
          'application/xml',
          'text/xml',
          'text/*',
        ],
      });
      if (result.canceled) return;
      const files = result.result.filter(isTrackPickedFile);
      if (!files.length) {
        showAttachmentError(t('record.track.errFormat'));
        return;
      }
      const trackAttachments = files.map((file) => ({
        id: localAttachmentId('track', file.uri),
        kind: 'file' as const,
        name: trackFileName(file),
        uri: file.uri,
        mimeType: trackMimeType(trackFileName(file), file.type),
        size: file.size,
      }));
      setInput('');
      setSelectedAttachments([]);
      setAttachmentTrayOpen(false);
      await submit(resolved === 'en' ? 'Upload track' : '上传轨迹', pending.intent, true, trackAttachments);
    } catch (error) {
      console.warn('[AppAgent] track picker failed', error);
      showAttachmentError(t('agent.attachment.failed'));
    } finally {
      setTrackPicking(false);
    }
  };

  const continuePlanWithoutTrack = (preset?: { message: string; intent?: AgentIntent }) => {
    const pending = preset || trackPrompt;
    setTrackPrompt(null);
    if (pending) void submit(resolved === 'en' ? 'No track for now' : '暂不上传轨迹', pending.intent, true);
  };

  const refetchWrittenJourney = async (journeyId = activeJourneyId) => {
    await Promise.all([
      data.refetchGear(),
      data.refetchJourneys(),
      journeyId ? refetchJourneyTimeline(journeyId) : Promise.resolve(),
      journeyId ? refetchJourneyPacking(journeyId) : Promise.resolve(),
    ]);
  };
  useEffect(() => {
    if (!visible || !activeRunId) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await getAgentRunActivity(activeRunId);
        if (active) {
          const changed = activityFingerprint(runActivitiesRef.current) !== activityFingerprint(result.activities);
          runActivitiesRef.current = result.activities;
          if (changed) setRunActivities(result.activities);
        }
      } catch {
        // Older deployments do not expose run activity; keep the generic state.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 850);
    return () => { active = false; clearInterval(timer); };
  }, [activeRunId, visible]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [loading, runActivities]);

  useEffect(() => {
    if (!visible) {
      pendingAutoSubmitRef.current = undefined;
      pendingAutoDisplayRef.current = undefined;
      voiceHoldingRef.current = false;
      voiceCancellingRef.current = false;
      voiceSendOnEndRef.current = false;
      setVoiceHolding(false);
      setVoiceCancelling(false);
      setInputFocused(false);
      setAttachmentTrayOpen(false);
      setSelectedAttachments([]);
      setTrackPicking(false);
      speech.abort();
      return;
    }
    let active = true;
    const autoSubmitPrompt = autoSubmitInitialPrompt ? initialPrompt : undefined;
    const autoDisplayPrompt = autoSubmitInitialPrompt ? initialDisplayPrompt : undefined;
    pendingAutoSubmitRef.current = undefined;
    pendingAutoDisplayRef.current = undefined;
    const key = storageKey(data.userId, currentJourneyId);
    const scope = `${data.userId}:${currentJourneyId || 'global'}`;
    const canReuseCurrentView = restoredScopeRef.current === scope;
    setRestoring(!canReuseCurrentView);
    if (!canReuseCurrentView) {
      setThreadId(undefined);
      setThreadTitle('');
      setThreadJourneyId(currentJourneyId);
      setTurns([]);
      setInput('');
      setAttachmentTrayOpen(false);
      setSelectedAttachments([]);
    }
    const restore = async () => {
      try {
        let savedThreadId = (await AsyncStorage.getItem(key)) || undefined;
        if (currentJourneyId && !savedThreadId) {
          const result = await getJourneyAgentThread(currentJourneyId);
          savedThreadId = result.threadId || undefined;
        }
        if (!active) return;
        if (!savedThreadId) {
          restoredScopeRef.current = scope;
          if (initialPrompt && !autoSubmitInitialPrompt) setInput(initialPrompt);
          return;
        }
        let resolvedThreadId: string = savedThreadId;
        let history: AgentHistoryResponse;
        try {
          history = await getAgentHistory(resolvedThreadId);
        } catch (error) {
          if (!currentJourneyId) throw error;
          const result = await getJourneyAgentThread(currentJourneyId);
          if (!result.threadId || result.threadId === resolvedThreadId) throw error;
          resolvedThreadId = result.threadId;
          history = await getAgentHistory(resolvedThreadId);
        }
        if (!active) return;
        const restoredJourneyId = history.thread.current_journey_id || currentJourneyId || undefined;
        setThreadJourneyId(restoredJourneyId);
        const restored: Turn[] = history.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          quickReplies: message.ui?.quickReplies,
          sources: message.ui?.sources,
          planPreview: message.ui?.planPreview,
          activities: message.ui?.activities,
          attachments: message.ui?.attachments,
          undoAction: message.ui?.undoAction,
          createJourneyFlow: message.ui?.createJourneyFlow,
        }));
        if (!active) return;
        setThreadId(resolvedThreadId);
        setThreadTitle(history.thread.title);
        setTurns(restored);
        restoredScopeRef.current = scope;
        await AsyncStorage.setItem(key, resolvedThreadId);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
      } catch (error) {
        console.warn('[AppAgent] history restore failed', error);
        void AsyncStorage.removeItem(key);
        if (active && !canReuseCurrentView) {
          setThreadId(undefined);
          setThreadTitle('');
          setTurns([]);
          if (initialPrompt && !autoSubmitInitialPrompt) setInput(initialPrompt);
        }
      } finally {
        if (active) {
          pendingAutoSubmitRef.current = autoSubmitPrompt;
          pendingAutoDisplayRef.current = autoDisplayPrompt;
          if (initialPrompt && !autoSubmitPrompt) onClearPrompt();
          setRestoring(false);
        }
      }
    };
    void restore();
    return () => { active = false; };
  }, [currentJourneyId, data.userId, t, visible]);

  useEffect(() => {
    if (!visible || !threadId || loading || restoring) return;
    let active = true;
    const syncHistory = async () => {
      try {
        const history = await getAgentHistory(threadId);
        if (!active) return;
        const synchronized = historyTurns(history);
        setTurns((current) => (
          synchronizedTurnFingerprint(current) === synchronizedTurnFingerprint(synchronized)
            ? current
            : synchronized
        ));
        setThreadTitle(history.thread.title);
        setThreadJourneyId(history.thread.current_journey_id || undefined);
      } catch (error) {
        console.warn('[AppAgent] history sync failed', error);
      }
    };
    void syncHistory();
    const timer = setInterval(() => void syncHistory(), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [loading, restoring, threadId, visible]);

  const completedActivitiesFor = async (response: AgentTurnResponse) => {
    try {
      const result = await getAgentRunActivity(response.runId);
      if (result.activities.length) return result.activities;
    } catch {
      // Keep the completed process visible when run_activity is not deployed yet.
    }
    return response.ui?.activities?.length ? response.ui.activities : runActivitiesRef.current;
  };

  const appendResponse = (response: AgentTurnResponse, createdThreadTitle?: string, activities = response.ui?.activities) => {
    setThreadId(response.threadId);
    if (createdThreadTitle) setThreadTitle(createdThreadTitle);
    void AsyncStorage.setItem(storageKey(data.userId, activeJourneyId), response.threadId);
    if (response.ui?.trackPrompt) setTrackPrompt(response.ui.trackPrompt);
    setTurns((current) => [...current, { id: `a_${Date.now()}`, role: 'assistant', text: response.message || t('agent.executed'), quickReplies: response.quickReplies, sources: response.ui?.sources, planPreview: response.ui?.planPreview, activities, undoAction: response.ui?.undoAction, createJourneyFlow: response.ui?.createJourneyFlow }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const submit = async (preset?: string, intent?: AgentIntent, skipTrackPrompt = false, attachmentOverride?: LocalAgentAttachment[], displayMessage?: string) => {
    const pendingAttachments = attachmentOverride ? [...attachmentOverride] : [...selectedAttachments];
    const typedMessage = (preset ?? input).trim();
    const message = typedMessage || (pendingAttachments.length ? t('agent.attachment.defaultPrompt') : '');
    const visibleMessage = displayMessage?.trim() || message;
    if (!message || loading || attachmentUploading || (trackPicking && !attachmentOverride)) return;
    const pendingHasTrackAttachment = pendingAttachments.some((attachment) => isTrackAttachmentName(attachment.name) || isTrackAttachmentName(attachment.uri));
    const lastTrackPromptTurn = [...turns].reverse().find(isTrackPromptTurn);
    const activeTrackPrompt = trackPrompt || (lastTrackPromptTurn ? trackPromptFromTurn(lastTrackPromptTurn) : undefined);
    if (!skipTrackPrompt && !attachmentOverride && !pendingHasTrackAttachment && wantsTrackUploadReply(message)) {
      console.log('[AppAgent] intercepting track upload text without attachment; opening picker');
      void chooseTrackForPlan(activeTrackPrompt || {
        message: turns
          .filter((turn) => turn.role === 'user' && !wantsTrackUploadReply(turn.text) && !wantsNoTrackReply(turn.text))
          .map((turn) => turn.text.trim())
          .filter(Boolean)
          .join('，'),
        intent,
      });
      return;
    }
    if (!skipTrackPrompt && !attachmentOverride) {
      if (activeTrackPrompt && wantsTrackUploadReply(message)) {
        void chooseTrackForPlan(activeTrackPrompt);
        return;
      }
      if (activeTrackPrompt && wantsNoTrackReply(message)) {
        continuePlanWithoutTrack(activeTrackPrompt);
        return;
      }
    }
    setAttachmentUploading(pendingAttachments.length > 0);
    let requestStarted = false;
    const clientRunId = createRunId();
    try {
      const attachments: AgentAttachment[] = await Promise.all(pendingAttachments.map(async (attachment) => ({
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: await uploadAgentAttachment(attachment.uri, data.userId, attachment.name, attachment.mimeType),
      })));
      setTurns((current) => [...current, { id: `u_${Date.now()}`, role: 'user', text: visibleMessage, attachments }]);
      setInput('');
      setSelectedAttachments([]);
      setAttachmentTrayOpen(false);
      setLoading(true);
      requestStarted = true;
      setActiveRunId(clientRunId);
      runActivitiesRef.current = [];
      setRunActivities([]);
      const creatingThread = !threadId;
      const response = await sendAgentTurn({ message, displayMessage: visibleMessage !== message ? visibleMessage : undefined, threadId, currentJourneyId: activeJourneyId, intent, locale: resolved, clientRunId, attachments, ...localAgentTimeContext() });
      const changedJourneyData = Boolean(response.ui?.undoAction)
        || response.ui?.activities?.some((activity) => activity.toolName === 'undo_last_agent_changes' && activity.status === 'completed');
      if (changedJourneyData) await refetchWrittenJourney();
      const completedActivities = await completedActivitiesFor(response);
      appendResponse(response, creatingThread ? visibleMessage.slice(0, 36) : undefined, completedActivities);
    } catch (error) {
      console.warn('[AppAgent] turn failed', error);
      if (requestStarted) {
        setTurns((current) => [...current, { id: `e_${Date.now()}`, role: 'assistant', text: t('agent.error') }]);
      } else {
        showAttachmentError(t('agent.attachment.failed'));
      }
    } finally {
      setAttachmentUploading(false);
      if (requestStarted) {
        setLoading(false);
        setActiveRunId(undefined);
      }
    }
  };

  useEffect(() => {
    if (!visible || restoring || loading || attachmentUploading || trackPicking) return;
    const prompt = pendingAutoSubmitRef.current;
    if (!prompt) return;
    const displayPrompt = pendingAutoDisplayRef.current;
    pendingAutoSubmitRef.current = undefined;
    pendingAutoDisplayRef.current = undefined;
    onClearPrompt();
    void submit(prompt, 'plan_journey', true, undefined, displayPrompt);
  }, [attachmentUploading, loading, restoring, trackPicking, visible]);

  useEffect(() => {
    if (!voiceSendOnEndRef.current || voiceActive) return;
    voiceSendOnEndRef.current = false;
    const message = input.trim();
    if (message && message !== voiceInitialInputRef.current.trim()) void submit(message);
  }, [input, voiceActive, voiceHolding]);

  const newChat = () => {
    setThreadId(undefined);
    setThreadTitle('');
    setThreadJourneyId(currentJourneyId);
    setTurns([]);
    setInput('');
    setAttachmentTrayOpen(false);
    setSelectedAttachments([]);
    setTrackPicking(false);
    setThreadSheetOpen(false);
    void AsyncStorage.removeItem(storageKey(data.userId, currentJourneyId));
  };

  const openMenu = async () => {
    setThreadSheetOpen(true);
    setThreadsLoading(true);
    try {
      const result = await getAgentThreads();
      setThreads(result.threads);
    } catch (error) {
      console.warn('[AppAgent] thread list failed', error);
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  };

  const selectThread = async (thread: AgentThreadSummary) => {
    if (thread.id === threadId) {
      setThreadSheetOpen(false);
      return;
    }
    setThreadsLoading(true);
    try {
      const history = await getAgentHistory(thread.id);
      const restored: Turn[] = historyTurns(history);
      const selectedJourneyId = history.thread.current_journey_id || thread.current_journey_id || undefined;
      setThreadId(thread.id);
      setThreadTitle(history.thread.title);
      setThreadJourneyId(selectedJourneyId);
      setTurns(restored);
      setInput('');
      setAttachmentTrayOpen(false);
      setSelectedAttachments([]);
      await AsyncStorage.setItem(storageKey(data.userId, selectedJourneyId), thread.id);
      setThreadSheetOpen(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    } catch (error) {
      console.warn('[AppAgent] thread restore failed', error);
    } finally {
      setThreadsLoading(false);
    }
  };

  const deleteThread = async (deletedThreadId: string) => {
    if (deletingThreadId) return;
    setDeletingThreadId(deletedThreadId);
    try {
      await deleteAgentThread(deletedThreadId);
      setThreads((current) => current.filter((thread) => thread.id !== deletedThreadId));
      if (deletedThreadId === threadId) {
        setThreadId(undefined);
        setThreadTitle('');
        setThreadJourneyId(currentJourneyId);
        setTurns([]);
        setInput('');
        setAttachmentTrayOpen(false);
        setSelectedAttachments([]);
        await AsyncStorage.removeItem(storageKey(data.userId, currentJourneyId));
      }
      setDeleteThreadCandidate(undefined);
    } catch (error) {
      console.warn('[AppAgent] thread delete failed', error);
      Alert.alert(t('agent.deleteFailed'));
    } finally {
      setDeletingThreadId(undefined);
    }
  };

  const confirmDeleteThread = (thread: AgentThreadSummary, close: () => void) => {
    close();
    setDeleteThreadCandidate(thread);
  };

  const threadAge = (date: string) => {
    const updatedAt = new Date(date);
    if (Number.isNaN(updatedAt.getTime())) return '';
    const now = new Date();
    const sameLocalDay = updatedAt.getFullYear() === now.getFullYear()
      && updatedAt.getMonth() === now.getMonth()
      && updatedAt.getDate() === now.getDate();
    if (sameLocalDay) {
      return `${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}`;
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const updatedDay = new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate()).getTime();
    const days = Math.max(1, Math.round((today - updatedDay) / 86_400_000));
    return t('agent.daysAgo', { count: days });
  };

  const openAddMenu = () => {
    inputRef.current?.blur();
    setAttachmentTrayOpen((open) => !open);
  };

  useEffect(() => {
    if (attachmentTrayOpen) setAttachmentTrayMounted(true);
    attachmentTrayProgress.stopAnimation();
    Animated.timing(attachmentTrayProgress, {
      toValue: attachmentTrayOpen ? 1 : 0,
      duration: motion.standard,
      easing: attachmentTrayOpen ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !attachmentTrayOpen) setAttachmentTrayMounted(false);
    });
  }, [attachmentTrayOpen, attachmentTrayProgress]);

  const copyTurn = async (turn: Turn) => {
    await Clipboard.setStringAsync(turn.text);
    setCopiedTurnId(turn.id);
    setTimeout(() => setCopiedTurnId((current) => current === turn.id ? undefined : current), 1600);
  };

  const undoTurn = async (turn: Turn) => {
    const runId = turn.undoAction?.runId;
    if (!runId || turn.undoAction?.undoneAt || undoingRunId) return;
    setUndoingRunId(runId);
    try {
      const result = await undoAgentRun(runId);
      setTurns((current) => current.map((item) => item.undoAction?.runId === runId
        ? { ...item, undoAction: { ...item.undoAction, undoneAt: result.undoneAt } }
        : item));
      await refetchWrittenJourney(result.journeyId || activeJourneyId);
    } catch (error) {
      console.warn('[AppAgent] undo failed', error);
      Alert.alert(t('agent.undoFailed'));
    } finally {
      setUndoingRunId(undefined);
    }
  };

  const trackActionPromptForTurn = (turn: Turn, index: number) => {
    if (!isTrackPromptTurn(turn)) return undefined;
    const hasAnsweredTrackPrompt = turns.slice(index + 1).some((item) => {
      if (item.role !== 'user') return false;
      if (item.attachments?.some((attachment) => isTrackAttachmentName(attachment.name))) return true;
      return wantsTrackUploadReply(item.text) || wantsNoTrackReply(item.text);
    });
    if (hasAnsweredTrackPrompt) return undefined;
    const fromTurn = trackPromptFromTurn(turn);
    if (fromTurn?.message) return fromTurn;
    const message = turns
      .slice(0, index)
      .filter((item) => item.role === 'user' && !wantsTrackUploadReply(item.text) && !wantsNoTrackReply(item.text))
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join('，');
    return { message, intent: undefined };
  };

  const quickRepliesForTurn = (turn: Turn) => {
    if (isTrackPromptTurn(turn)) return [];
    return turn.quickReplies || [];
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <KeyboardAvoidingView
          style={[styles.root, { backgroundColor: theme.featureSurface }]}
          behavior="padding"
          automaticOffset
        >
        <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[styles.headerButton, { backgroundColor: theme.controlSurface }]}>
            <X size={23} color={theme.text} strokeWidth={2.2} />
          </Press>
          {currentJourney ? (
            <View pointerEvents="box-none" style={styles.activeThreadTitleWrap}>
              <Press
                onPress={() => onOpenJourney(currentJourney.id)}
                accessibilityRole="button"
                accessibilityLabel={t('agent.openJourney', { name: currentJourney.name })}
                style={[styles.journeyTitleWrap, { backgroundColor: theme.controlSurface }]}
              >
                <Text numberOfLines={1} style={[styles.activeThreadTitle, { color: theme.text }]}>{currentJourney.name}</Text>
                <ChevronRight size={18} color={theme.text2} strokeWidth={2.2} />
              </Press>
            </View>
          ) : threadId && threadTitle ? (
            <View pointerEvents="none" style={styles.activeThreadTitleWrap}>
              <Text numberOfLines={1} style={[styles.activeThreadTitle, { color: theme.text }]}>{threadTitle}</Text>
            </View>
          ) : null}
          <Press onPress={openMenu} accessibilityRole="button" accessibilityLabel={t('agent.menu')} style={[styles.headerButton, { backgroundColor: theme.controlSurface }]}>
            <Menu size={24} color={theme.text} strokeWidth={1.8} />
          </Press>
        </View>

        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, turns.length === 0 && (currentJourney ? styles.journeyEmptyContent : styles.emptyContent)]}>
          {restoring ? <View style={styles.center}><ActivityIndicator color={theme.accent} /></View> : turns.length === 0 ? (
            currentJourney ? (
              <View style={styles.journeySuggestions}>
                {journeySuggestions.map((suggestion) => {
                  const SuggestionIcon = suggestion.icon;
                  return <Press key={suggestion.text} accessibilityRole="button" onPress={() => void submit(suggestion.text)} style={[styles.journeySuggestion, { backgroundColor: theme.fieldSurface }]}>
                    <SuggestionIcon size={19} color={theme.text2} strokeWidth={1.8} />
                    <Text style={[styles.journeySuggestionText, { color: theme.text }]}>{suggestion.text}</Text>
                  </Press>
                })}
              </View>
            ) : (
              <View style={styles.welcome}>
                <View style={styles.heroMark}><AssistantMark color={theme.text} accentColor={theme.accent} size={23} /></View>
                <Text style={[styles.welcomeTitle, { color: theme.text }]}>{t('agent.welcomeTitle')}</Text>
                <Text style={[styles.welcomeBody, { color: theme.text2 }]}>{t('agent.welcomeBody')}</Text>
                <View style={styles.suggestions}>
                  {suggestions.map((suggestion) => {
                    const SuggestionIcon = suggestion.icon;
                    return <Press key={suggestion.text} onPress={() => void submit(suggestion.text, suggestion.intent)} style={[styles.suggestion, { backgroundColor: theme.controlSurface }]}>
                      <SuggestionIcon size={19} color={theme.text2} strokeWidth={1.8} />
                      <Text style={[styles.suggestionText, { color: theme.text }]} numberOfLines={1}>{suggestion.text}</Text>
                      <CornerDownLeft size={17} color={theme.text3} strokeWidth={2} />
                    </Press>
                  })}
                </View>
              </View>
            )
          ) : turns.map((turn, turnIndex) => (
            <View key={turn.id} style={turn.role === 'user' ? styles.userRow : styles.assistantRow}>
              {turn.role === 'assistant' && turn.activities?.length ? <ResearchActivity theme={theme} activities={turn.activities} running={false} /> : null}
              <View style={[
                turn.role === 'user' ? styles.userBubble : styles.assistantBubble,
                turn.role === 'user' ? { backgroundColor: theme.accentSoft } : null,
              ]}>
                {turn.attachments?.length ? <MessageAttachments theme={theme} attachments={turn.attachments} /> : null}
                <SelectableMessageText text={turn.text} theme={theme} />
              </View>
              {trackActionPromptForTurn(turn, turnIndex) ? (
                <View style={styles.quickReplies}>
                  <Press
                    disabled={loading || trackPicking}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading || trackPicking, busy: trackPicking }}
                    onPress={() => {
                      const prompt = trackActionPromptForTurn(turn, turnIndex);
                      if (prompt) void chooseTrackForPlan(prompt);
                    }}
                    style={[styles.quickReply, { backgroundColor: theme.accentSofter }, (loading || trackPicking) && styles.quickReplyDisabled]}
                  >
                    {trackPicking ? <ActivityIndicator size="small" color={theme.text} /> : null}
                    <Text style={[styles.quickReplyText, { color: theme.text }]}>上传轨迹</Text>
                  </Press>
                  <Press
                    disabled={loading || trackPicking}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading || trackPicking }}
                    onPress={() => {
                      const prompt = trackActionPromptForTurn(turn, turnIndex);
                      if (prompt) continuePlanWithoutTrack(prompt);
                    }}
                    style={[styles.quickReply, { backgroundColor: theme.accentSofter }, (loading || trackPicking) && styles.quickReplyDisabled]}
                  >
                    <Text style={[styles.quickReplyText, { color: theme.text }]}>暂不上传</Text>
                  </Press>
                </View>
              ) : null}
              {quickRepliesForTurn(turn).length ? (
                <View style={styles.quickReplies}>
                  {quickRepliesForTurn(turn).map((reply) => {
                    const inlineTrackPrompt = trackPromptFromTurn(turn) || trackPrompt || undefined;
                    const isTrackUploadReply = reply.action === 'upload_track' || wantsTrackUploadReply(reply.message) || wantsTrackUploadReply(reply.label);
                    const isSkipTrackReply = reply.action === 'skip_track' || Boolean(inlineTrackPrompt && wantsNoTrackReply(reply.message));
                    const disabled = loading || trackPicking;
                    return (
                      <Press
                        key={`${turn.id}_${reply.message}`}
                        disabled={disabled}
                        accessibilityState={{ disabled, busy: isTrackUploadReply && trackPicking }}
                        onPress={() => {
                          if (isTrackUploadReply) void chooseTrackForPlan(inlineTrackPrompt || trackPrompt || { message: '', intent: undefined });
                          else if (isSkipTrackReply) continuePlanWithoutTrack(inlineTrackPrompt || trackPrompt || { message: '', intent: undefined });
                          else void submit(reply.message);
                        }}
                        style={[styles.quickReply, { backgroundColor: theme.accentSofter }, disabled && styles.quickReplyDisabled]}
                      >
                        {isTrackUploadReply && trackPicking ? <ActivityIndicator size="small" color={theme.text} /> : null}
                        <Text style={[styles.quickReplyText, { color: theme.text }]}>{reply.label}</Text>
                      </Press>
                    );
                  })}
                </View>
              ) : null}
              {turn.sources?.length ? <SourcesStrip theme={theme} sources={turn.sources} title={t('agent.sources')} /> : null}
              {turn.planPreview ? <PlanPreviewCard theme={theme} preview={turn.planPreview} openLabel={t('agent.viewJourney')} onOpen={onOpenJourney} /> : null}
              {turn.role === 'assistant' ? (
                <View style={styles.messageActions}>
                  <Press
                    onPress={() => void copyTurn(turn)}
                    accessibilityRole="button"
                    accessibilityLabel={t(copiedTurnId === turn.id ? 'agent.copied' : 'agent.copy')}
                    style={styles.copyAction}
                  >
                    {copiedTurnId === turn.id ? <Check size={15} color={theme.text3} /> : <Copy size={15} color={theme.text3} />}
                    <Text style={[styles.copyText, { color: theme.text3 }]}>{t(copiedTurnId === turn.id ? 'agent.copied' : 'agent.copy')}</Text>
                  </Press>
                  {turn.undoAction ? (
                    <Press
                      disabled={Boolean(turn.undoAction.undoneAt) || undoingRunId === turn.undoAction.runId}
                      onPress={() => void undoTurn(turn)}
                      accessibilityRole="button"
                      accessibilityLabel={t(turn.undoAction.undoneAt ? 'agent.undone' : 'agent.undo')}
                      style={styles.copyAction}
                    >
                      {undoingRunId === turn.undoAction.runId
                        ? <ActivityIndicator size="small" color={theme.text3} />
                        : turn.undoAction.undoneAt
                        ? <Check size={15} color={theme.text3} />
                        : <RotateCcw size={15} color={theme.text3} />}
                      <Text style={[styles.copyText, { color: theme.text3 }]}>{t(turn.undoAction.undoneAt ? 'agent.undone' : 'agent.undo')}</Text>
                    </Press>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
          {loading ? <ResearchActivity theme={theme} activities={runActivities} running /> : null}
        </ScrollView>

        <Animated.View
          style={[
            styles.bottomArea,
            {
              paddingBottom: attachmentTrayProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [Math.max(insets.bottom - space.sm, space.xxs), 0],
              }),
              backgroundColor: theme.featureSurface,
            },
          ]}
        >
          <View style={styles.composerWrap}>
            {voiceMode ? <Text style={[styles.voiceGestureHint, { color: voiceCancelling ? theme.danger : theme.text3 }]}>{t(voiceCancelling ? 'agent.voiceReleaseToCancel' : voiceHolding ? 'agent.voiceReleaseToSend' : 'agent.voiceListening')}</Text> : null}
            <View style={[styles.composer, { backgroundColor: theme.controlSurface }]}>
              <Press pointerEvents={voiceHolding ? 'none' : 'auto'} onPress={openAddMenu} accessibilityRole="button" accessibilityLabel={t('agent.addContext')} style={[styles.composerAction, voiceHolding && styles.voiceActionHidden]}>
                {attachmentTrayOpen ? <X size={24} color={theme.text} strokeWidth={1.9} /> : <Plus size={27} color={theme.text} strokeWidth={1.8} />}
              </Press>
              <View style={styles.inputWrap}>
                <TextInput ref={inputRef} value={input} onChangeText={setInput} placeholder={t('agent.placeholder')} placeholderTextColor={theme.text3} multiline maxLength={1000} editable={!voiceMode} style={[styles.input, { color: theme.text }, voiceMode && styles.voiceInputHidden]} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} onSubmitEditing={() => void submit()} blurOnSubmit={false} />
                {voiceMode ? <VoiceListeningIndicator theme={theme} label={t('agent.voiceListening')} cancelling={voiceCancelling} /> : null}
                {!inputFocused ? (
                  <Press
                    accessible={false}
                    delayLongPress={450}
                    pressRetentionOffset={{ top: 180, right: 40, bottom: 40, left: 40 }}
                    onPressIn={handleIdleInputPressIn}
                    onPress={handleIdleInputPress}
                    onLongPress={handleIdleInputLongPress}
                    onPressMove={handleIdleInputPressMove}
                    onTouchEnd={handleIdleInputTouchEnd}
                    onTouchCancel={handleIdleInputTouchCancel}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
              </View>
              <Press
                pointerEvents={voiceHolding ? 'none' : 'auto'}
                disabled={loading || attachmentUploading}
                accessibilityLabel={voiceActive ? t('agent.stopVoiceInput') : canSend ? t('agent.send') : t('agent.voiceInput')}
                accessibilityState={{ disabled: loading || attachmentUploading, selected: voiceActive }}
                onPress={voiceActive ? speech.stop : canSend ? () => void submit() : startVoiceInput}
                style={[styles.composerAction, (canSend || voiceActive) && { backgroundColor: theme.accent }, voiceHolding && styles.voiceActionHidden]}
              >
                {attachmentUploading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : voiceActive
                  ? <Square size={16} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
                  : canSend
                  ? <ArrowUp size={19} color="#FFFFFF" strokeWidth={2.4} />
                  : <Mic size={24} color={theme.text} strokeWidth={1.9} />}
              </Press>
            </View>
          </View>
          <Text style={[styles.generatedNotice, { color: theme.text3 }]}>{t('agent.disclaimer')}</Text>
          {selectedAttachments.length ? (
            <View style={styles.pendingAttachmentsWrap}>
              <PendingAttachments theme={theme} attachments={selectedAttachments} onRemove={(id) => setSelectedAttachments((current) => current.filter((attachment) => attachment.id !== id))} />
            </View>
          ) : null}
          <Animated.View
            pointerEvents={attachmentTrayOpen ? 'auto' : 'none'}
            style={[
              styles.attachmentTrayClip,
              {
                height: attachmentTrayProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 318] }),
                opacity: attachmentTrayProgress,
              },
            ]}
          >
            {attachmentTrayMounted ? (
              <AssistantAttachmentTray
                theme={theme}
                selected={selectedAttachments}
                labels={attachmentLabels}
                onChange={setSelectedAttachments}
                onError={showAttachmentError}
              />
            ) : null}
          </Animated.View>
        </Animated.View>

        {threadSheetOpen ? (
          <View style={[StyleSheet.absoluteFill, styles.threadOverlay]}>
            <Press accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setThreadSheetOpen(false)} style={[StyleSheet.absoluteFill, styles.threadBackdrop]}>{null}</Press>
            <View style={[styles.threadSheet, { backgroundColor: theme.featureSurface, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
              <View style={[styles.threadHandle, { backgroundColor: theme.text3 }]} />
              <View style={styles.threadHeader}>
                <Text style={[styles.threadTitle, { color: theme.text }]}>{t('agent.conversations')}</Text>
                {currentJourneyId ? null : (
                  <Press onPress={newChat} accessibilityRole="button" accessibilityLabel={t('agent.newChat')} style={styles.newThreadButton}>
                    <SquarePen size={23} color={theme.text} strokeWidth={2} />
                    <Text style={[styles.newThreadText, { color: theme.text }]}>{t('agent.newChat')}</Text>
                  </Press>
                )}
              </View>
              {threadsLoading ? (
                <View style={styles.threadLoading}><ActivityIndicator color={theme.accent} /></View>
              ) : threads.length ? (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.threadList}>
                  {threads.map((thread) => {
                    const journey = threadJourney(thread);
                    const photoUri = firstPhoto(journey?.photo_uris);
                    return (
                      <TwoStageSwipeable
                        key={thread.id}
                        friction={1}
                        rightThreshold={56}
                        dragOffsetFromRightEdge={6}
                        animationOptions={THREAD_SWIPE_SPRING}
                        onSecondLeftSwipe={(methods) => {
                          pendingThreadSwipeCloseRef.current = methods.close;
                          setDeleteThreadCandidate(thread);
                        }}
                        containerStyle={[styles.threadSwipe, { backgroundColor: theme.featureSurface }]}
                        renderRightActions={(progress, _translation, methods) => (
                          <ThreadSwipeActions
                            progress={progress}
                            theme={theme}
                            deleting={deletingThreadId === thread.id}
                            deleteDisabled={Boolean(deletingThreadId)}
                            openLabel={t('agent.openConversation')}
                            deleteLabel={t('agent.deleteConversation')}
                            onOpen={() => {
                              methods.close();
                              void selectThread(thread);
                            }}
                            onDelete={() => confirmDeleteThread(thread, methods.close)}
                          />
                        )}
                      >
                        <Press onPress={() => void selectThread(thread)} style={[styles.threadCard, { backgroundColor: theme.accentSofter }]}>
                          {photoUri ? <Image source={{ uri: photoUri }} contentFit="cover" style={styles.threadCover} /> : null}
                          <View style={[styles.threadCopy, photoUri && styles.threadCopyWithCover]}>
                            <Text style={[styles.threadCardTitle, { color: theme.text }]} numberOfLines={2}>{thread.title}</Text>
                            <View style={styles.threadMeta}>
                              <Text style={[styles.threadMetaText, { color: theme.text3 }]}>{threadAge(thread.updated_at)}</Text>
                              <Text style={[styles.threadMetaText, { color: theme.text2 }]}>{journey?.name || t('agent.conversationLabel')}</Text>
                            </View>
                          </View>
                        </Press>
                      </TwoStageSwipeable>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.threadLoading}><Text style={[type.body, { color: theme.text3 }]}>{t('agent.noConversations')}</Text></View>
              )}
            </View>
          </View>
        ) : null}
        <AppActionDialog
          theme={theme}
          visible={Boolean(deleteThreadCandidate)}
          title={t('agent.deleteConversation')}
          message={t('agent.deleteConversationBody', { title: deleteThreadCandidate?.title || '' })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          destructive
          confirming={deletingThreadId === deleteThreadCandidate?.id}
          confirmIcon="trash"
          onCancel={() => {
            pendingThreadSwipeCloseRef.current?.();
            pendingThreadSwipeCloseRef.current = null;
            setDeleteThreadCandidate(undefined);
          }}
          onConfirm={() => {
            if (deleteThreadCandidate) {
              pendingThreadSwipeCloseRef.current = null;
              void deleteThread(deleteThreadCandidate.id);
            }
          }}
        />
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 94, paddingHorizontal: space.lg, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 7px 20px rgba(0,0,0,0.07)' },
  activeThreadTitleWrap: { position: 'absolute', left: 76, right: 76, bottom: space.sm, height: 44, justifyContent: 'center', alignItems: 'center' },
  journeyTitleWrap: { maxWidth: '100%', height: 44, borderRadius: radius.pill, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  activeThreadTitle: { maxWidth: '100%', flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: 0, textAlign: 'center' },
  content: { flexGrow: 1, paddingHorizontal: layout.pagePadding, paddingTop: space.md, paddingBottom: space.xxl },
  emptyContent: { justifyContent: 'flex-end', paddingBottom: 58 },
  journeyEmptyContent: { justifyContent: 'flex-start', paddingTop: space.lg },
  center: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center' },
  welcome: { alignItems: 'flex-start' },
  heroMark: { height: 20, justifyContent: 'center', marginBottom: space.lg },
  welcomeTitle: { fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: 0 },
  welcomeBody: { maxWidth: 350, fontSize: 19, lineHeight: 27, fontWeight: '700', letterSpacing: 0 },
  suggestions: { alignItems: 'flex-start', gap: space.xs, marginTop: space.lg },
  suggestion: { width: 248, height: 50, borderRadius: radius.pill, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs, boxShadow: '0px 8px 22px rgba(0,0,0,0.06)' },
  suggestionText: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: '500', letterSpacing: 0 },
  journeySuggestions: { alignItems: 'stretch', gap: space.sm },
  journeySuggestion: { minHeight: 52, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  journeySuggestionText: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, fontWeight: '500', letterSpacing: 0 },
  userRow: { alignItems: 'flex-end', marginBottom: space.lg },
  assistantRow: { alignItems: 'stretch', marginBottom: space.xl },
  userBubble: { maxWidth: '84%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card },
  assistantBubble: { alignSelf: 'stretch' },
  messageAttachments: { marginBottom: space.xs, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.xs },
  messageAttachmentImage: { width: 112, height: 112, borderRadius: radius.control },
  messageAttachmentFile: { maxWidth: 220, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  messageAttachmentName: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17, fontWeight: '600', letterSpacing: 0 },
  messageMeasure: { opacity: 0 },
  messageInput: { padding: 0, textAlignVertical: 'top' },
  quickReplies: { alignItems: 'flex-start', gap: space.xs, marginTop: space.sm },
  quickReply: { minHeight: 44, maxWidth: '92%', borderRadius: radius.pill, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  quickReplyDisabled: { opacity: 0.65 },
  quickReplyText: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0 },
  sourcesWrap: { marginTop: space.md, marginHorizontal: -layout.pagePadding },
  supportLabel: { paddingHorizontal: layout.pagePadding, marginBottom: space.xs, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  sourcesContent: { paddingHorizontal: layout.pagePadding, gap: space.xs },
  sourceCard: { width: 220, height: 94, borderRadius: radius.card, padding: space.sm, justifyContent: 'space-between' },
  sourceTop: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  sourceHost: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 15, letterSpacing: 0 },
  sourceTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  planPreview: { marginTop: space.lg, borderRadius: radius.feature, padding: space.md, boxShadow: '0px 12px 32px rgba(0,0,0,0.07)' },
  planTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: 0 },
  planMeta: { marginTop: space.xxs, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  planDays: { marginTop: space.md },
  planDay: { paddingVertical: space.sm },
  planDayTitle: { fontSize: 15.5, lineHeight: 21, fontWeight: '800', letterSpacing: 0 },
  planItem: { marginTop: space.xs, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  planTime: { width: 78, fontSize: 12, lineHeight: 18, fontWeight: '600', letterSpacing: 0 },
  planItemText: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 19, letterSpacing: 0 },
  viewJourney: { alignSelf: 'flex-start', minHeight: 42, marginTop: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  viewJourneyText: { fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  copyAction: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xxs, marginTop: space.xs },
  messageActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  copyText: { fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  researchProgress: { alignSelf: 'stretch', marginBottom: space.xl, paddingVertical: space.sm },
  researchHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  researchTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: 0 },
  researchLine: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  researchLineText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18, letterSpacing: 0 },
  researchLineTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  loadingDots: { width: 14, height: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loadingDot: { width: 3, height: 3, borderRadius: 1.5 },
  bottomArea: { flexShrink: 0 },
  composerWrap: { paddingHorizontal: space.lg },
  pendingAttachmentsWrap: { paddingHorizontal: space.lg, paddingTop: space.sm },
  pendingAttachments: { gap: space.xs, paddingBottom: space.xs },
  pendingAttachment: { width: 64, height: 64, borderRadius: radius.control, overflow: 'hidden' },
  pendingFile: { flex: 1, padding: space.xs, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pendingFileName: { maxWidth: '100%', fontSize: 9.5, lineHeight: 12, textAlign: 'center', letterSpacing: 0 },
  removeAttachment: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  composer: { minHeight: layout.fieldHeight, maxHeight: 108, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.xs, paddingVertical: space.xxs / 2, boxShadow: '0px 12px 30px rgba(0,0,0,0.08)' },
  composerAction: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  voiceActionHidden: { opacity: 0 },
  inputWrap: { flex: 1, minWidth: 0, minHeight: 40, maxHeight: 100 },
  input: { width: '100%', minHeight: 40, maxHeight: 100, fontSize: 15, lineHeight: 20, paddingHorizontal: space.xs, paddingTop: 8, paddingBottom: 6 },
  voiceInputHidden: { opacity: 0 },
  voiceGestureHint: { minHeight: 20, marginBottom: space.sm, textAlign: 'center', fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0 },
  voiceListening: { position: 'absolute', top: 0, right: -44, bottom: 0, left: -44, alignItems: 'center', justifyContent: 'center' },
  voiceBars: { width: 132, height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voiceBar: { width: 2, borderRadius: radius.pill },
  attachmentTrayClip: { overflow: 'hidden' },
  generatedNotice: { textAlign: 'center', marginTop: space.xxs, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  threadOverlay: { zIndex: 20, justifyContent: 'flex-end' },
  threadBackdrop: { backgroundColor: 'rgba(0,0,0,0.56)' },
  threadSheet: { height: '66%', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: space.xs, paddingHorizontal: space.lg, overflow: 'hidden' },
  threadHandle: { width: 30, height: 4, borderRadius: radius.pill, alignSelf: 'center', opacity: 0.55 },
  threadHeader: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  threadTitle: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: 0 },
  newThreadButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingLeft: space.sm },
  newThreadText: { fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  threadList: { gap: space.sm, paddingBottom: space.xxl },
  threadLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  threadCard: { height: 96, borderRadius: radius.feature, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  threadSwipe: { height: 96, borderRadius: radius.feature, overflow: 'hidden' },
  threadSwipeActions: { width: 144, height: 96, flexDirection: 'row', alignItems: 'center' },
  threadSwipeAction: { width: 72, height: 96, alignItems: 'center', justifyContent: 'center' },
  threadCopy: { flex: 1, minWidth: 0, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: 'space-between', zIndex: 1 },
  threadCopyWithCover: { paddingRight: 126 },
  threadCardTitle: { fontSize: 16.5, lineHeight: 22, fontWeight: '700', letterSpacing: 0 },
  threadMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  threadMetaText: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  threadCover: { position: 'absolute', top: 0, right: 0, width: 118, height: 96 },
});
