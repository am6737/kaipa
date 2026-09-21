import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as FSFile } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Easing, Linking, Modal, Pressable as Press, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
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
import { cancelAgentRun, deleteAgentThread, getAgentHistory, getAgentRunActivity, getAgentThreads, getJourneyAgentThread, sendAgentTurn, undoAgentRun, type AgentAttachment, type AgentHistoryResponse, type AgentIntent, type AgentMessageUi, type AgentModelMetric, type AgentPlanPreview, type AgentQuickReply, type AgentRunActivity, type AgentSource, type AgentStage, type AgentThreadSummary, type AgentTurnResponse, type AgentUndoAction } from '../../lib/appAgent';
import { useAgentRunRealtime } from '../../hooks/useAgentRunRealtime';
import { uploadAgentAttachment } from '../../lib/storage';
import type { Theme } from '../../theme/theme';
import { AssistantMark } from './AssistantMark';
import { packingActivityPresentation } from './packingActivityPresentation';
import { startAgentRecovery } from '../../lib/agentRecovery';
import { getAgentLocation, shouldSuggestTransportLocation, transportLocationIntent, type AgentLocationIntent } from '../../lib/agentLocation';
import { retryAgentRun } from '../../lib/appAgent';
import { AssistantAttachmentTray, type LocalAgentAttachment } from './AssistantAttachmentTray';
import { SourceBrandIcon, sourceBrandKind } from './SourceBrandIcon';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { TwoStageSwipeable } from '../TwoStageSwipeable';
import { useSpeechRecognitionInput, type SpeechRecognitionInputError } from './useSpeechRecognitionInput';

type PendingAgentRequest = {
  args: Parameters<typeof sendAgentTurn>[0] & { clientRunId: string };
  storageKey: string;
  startedAt: number;
};

type Turn = {
  travelContext?: AgentMessageUi['travelContext'];
  id: string;
  role: 'user' | 'assistant';
  text: string;
  quickReplies?: AgentQuickReply[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
  modelMetrics?: AgentModelMetric[];
  runTiming?: AgentMessageUi['runTiming'];
  attachments?: AgentAttachment[];
  upload?: {
    status: 'uploading' | 'failed';
    files: LocalAgentAttachment[];
    message: string;
    intent?: AgentIntent;
  };
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
  return /^(暂不上传(?:轨迹)?|不上传(?:轨迹)?|no track(?: for now)?|skip track)$/i.test(message.trim());
}

function wantsTrackUploadReply(message: string) {
  return /^(上传轨迹|upload track)$/i.test(message.trim());
}


function turnHasTrackAction(turn: Turn) {
  return Boolean(turn.quickReplies?.some((reply) => reply.action === 'upload_track' || reply.action === 'skip_track'));
}

function isTrackPromptTurn(turn: Turn) {
  return turn.role === 'assistant' && turnHasTrackAction(turn);
}

function trackPromptFromTurn(turn: Turn): { message: string; intent?: AgentIntent } | undefined {
  if (isTrackPromptTurn(turn)) return { message: '', intent: undefined };
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
};

function formatElapsed(ms?: number) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function activityElapsed(activity: AgentRunActivity, now: number) {
  if (activity.durationMs != null) return activity.durationMs;
  if (!activity.startedAt) return undefined;
  const started = Date.parse(activity.startedAt);
  return Number.isFinite(started) ? Math.max(0, now - started) : undefined;
}

function runElapsed(activities: AgentRunActivity[], now: number, timing?: AgentMessageUi['runTiming']) {
  if (timing?.startedAt) {
    const started = Date.parse(timing.startedAt);
    const finished = timing.finishedAt ? Date.parse(timing.finishedAt) : now;
    if (Number.isFinite(started) && Number.isFinite(finished)) return Math.max(0, finished - started);
  }
  const starts = activities.map((activity) => activity.startedAt ? Date.parse(activity.startedAt) : NaN).filter(Number.isFinite);
  if (!starts.length) return undefined;
  const ends = activities.map((activity) => activity.finishedAt ? Date.parse(activity.finishedAt) : NaN).filter(Number.isFinite);
  return Math.max(0, (ends.length === activities.length ? Math.max(...ends) : now) - Math.min(...starts));
}

function modelStageLabel(stage: string) {
  const labels: Record<string, string> = {
    interpretation: '任务解析',
    execution: '模型决策',
    memory: '历史摘要',
    packing_generation: '装备清单生成',
    packing_repair: '装备清单修正',
    packing_commit_decision: '装备清单提交检查',
    // Staged pipeline metric names.
    research: '资料搜集',
    transport: '路线交通规划',
    plan: '方案编排',
    packing: '装备清单生成',
    respond: '回复生成',
  };
  return labels[stage] || stage;
}

/** Model metrics are emitted once per model call, so retries and tool turns can
 * produce several rows for the same user-facing stage. Keep the detailed
 * records for the total, but show one concise row per stage in the UI. */
function aggregateModelMetrics(metrics: AgentModelMetric[], stages: AgentStage[] = []) {
  const stageStatus = new Map<string, AgentStage['status']>();
  for (const stage of stages) stageStatus.set(stage.stage, stage.status);
  const aggregated = new Map<string, AgentModelMetric & { degraded?: boolean }>();
  for (const metric of metrics) {
    const existing = aggregated.get(metric.stage);
    if (!existing) {
      aggregated.set(metric.stage, { ...metric });
      continue;
    }
    existing.durationMs += metric.durationMs;
    existing.success = existing.success && metric.success;
  }
  // A research model call may time out after usable evidence was collected.
  // The pipeline persists that case as a completed stage with an explicit
  // fallback artifact; do not present the discarded call as a failed phase.
  for (const [stage, metric] of aggregated) {
    const status = stageStatus.get(stage);
    if (status === 'completed') metric.success = true;
    // A degraded stage is the opposite case: the stage fell back to an
    // incomplete artifact, so its failed call must stay visible instead of
    // being reported as a finished phase.
    if (status === 'degraded') { metric.success = false; metric.degraded = true; }
  }
  return [...aggregated.values()];
}

function collapsePresentedSteps(steps: Array<ResearchStep & { elapsed?: number }>) {
  const collapsed = new Map<string, ResearchStep & { elapsed?: number }>();
  for (const step of steps) {
    // A rendered label represents a user-facing phase. Several guide URLs or
    // route lookups can therefore share one row even when their call statuses
    // differ; the underlying activity records remain available for timing and
    // recovery.
    const key = step.text;
    const existing = collapsed.get(key);
    if (!existing) {
      collapsed.set(key, { ...step });
      continue;
    }
    if (step.status === 'failed' || (step.status === 'running' && existing.status === 'completed')) {
      existing.status = step.status;
    }
    if (step.elapsed != null) existing.elapsed = (existing.elapsed || 0) + step.elapsed;
  }
  return [...collapsed.values()];
}

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
      errorCode: typeof report.errorCode === 'string' ? report.errorCode : undefined,
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
  // A journey carries no track facts of its own; the track section is the signal.
  const hasTrack = Boolean(trackSummary);
  if (!hasTrack) return undefined;

  const distance = String(trackSummary?.distance || journey?.dist || '').trim()
    || (Number.isFinite(totalKm) ? `${totalKm.toFixed(totalKm >= 10 ? 1 : 2)} km` : '');
  const ascent = String(trackSummary?.ascent || journey?.asc_ || '').trim().replace(/^\+/, '');
  if (distance && ascent) return t('agent.research.journeyTrackLoadedStats', { distance, ascent });
  if (distance) return t('agent.research.journeyTrackLoadedDistance', { distance });
  return t('agent.research.journeyTrackLoaded');
}

function researchSteps(activities: AgentRunActivity[], t: ReturnType<typeof useI18n>['t']): ResearchStep[] {
  return activities.flatMap((activity, index) => {
    const key = `${activity.toolName}_${index}`;
    const query = String(activity.arguments.query || '').trim();
    if (activity.toolName === 'search_transport') {
      const rail = activity.arguments.mode === 'rail';
      const connecting = rail && Boolean(activity.arguments.viaStation);
      const result = activity.output as { status?: string; count?: number; offers?: unknown[] } | undefined;
      const label: TKey = activity.status === 'running'
        ? rail ? 'agent.research.railSearching' : 'agent.research.flightSearching'
        : activity.status === 'failed' || ['provider_error', 'rate_limited', 'temporarily_unavailable'].includes(result?.status || '')
        ? 'agent.research.transportQueryFailed'
        : result?.status === 'results' ? connecting ? 'agent.research.railConnectionsFound' : rail ? 'agent.research.railOffersFound' : 'agent.research.flightOffersFound'
        : result?.status === 'empty' ? connecting ? 'agent.research.railConnectionsEmpty' : rail ? 'agent.research.railOffersEmpty' : 'agent.research.flightOffersEmpty'
        : result?.status === 'not_on_sale' ? 'agent.research.railNotOnSale'
        : ['invalid_request', 'invalid_station'].includes(result?.status || '') ? rail ? 'agent.research.railQueryNeedsCheck' : 'agent.research.airportCodesNeeded'
        : rail ? 'agent.research.railNotConnected' : 'agent.research.flightNotConnected';
      return [{ key, status: activity.status, text: t(label, { count: result?.count ?? result?.offers?.length ?? 0 }) }];
    }
    if (activity.toolName === 'search_travel_web') {
      const transport = activity.arguments.purpose === 'transport';
      const searchStep: ResearchStep = {
        key,
        status: activity.status,
        text: t(transport ? activity.status === 'running'
          ? 'agent.research.transportReferenceSearching'
          : activity.status === 'failed' ? 'agent.research.transportQueryFailed' : 'agent.research.transportReferenceFinished'
          : activity.status === 'running'
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
          : report.errorCode === 'verification_required'
          ? t('agent.research.sourceVerificationRequired', { source: sourceLabel(report.source, t) })
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
    if (activity.toolName === 'read_travel_guide' || activity.toolName === 'read_travel_guide_images') {
      const output = activity.output as { available?: boolean } | undefined;
      const status = activity.status === 'completed' && !output?.available ? 'failed' : activity.status;
      const imageRead = activity.toolName === 'read_travel_guide_images';
      const labels = imageRead
        ? { running: 'agent.research.guideImagesReading', completed: 'agent.research.guideImagesRead', failed: 'agent.research.guideImagesUnavailable' } as const
        : { running: 'agent.research.guideReading', completed: 'agent.research.guideRead', failed: 'agent.research.guideUnavailable' } as const;
      return [{ key, status, text: t(labels[status]) }];
    }
    const stepKeys: Record<string, Record<AgentRunActivity['status'], TKey>> = {
      get_app_context: { running: 'agent.research.step.context.running', completed: 'agent.research.step.context.completed', failed: 'agent.research.step.context.failed' },
      search_journeys: { running: 'agent.research.step.journeys.running', completed: 'agent.research.step.journeys.completed', failed: 'agent.research.step.journeys.failed' },
      search_routes: { running: 'agent.research.step.routes.running', completed: 'agent.research.step.routes.completed', failed: 'agent.research.step.routes.failed' },
      list_gear: { running: 'agent.research.step.gear.running', completed: 'agent.research.step.gear.completed', failed: 'agent.research.step.gear.failed' },
      get_journey_details: { running: 'agent.research.step.journeyDetails.running', completed: 'agent.research.step.journeyDetails.completed', failed: 'agent.research.step.journeyDetails.failed' },
      create_journey: { running: 'agent.research.step.createJourney.running', completed: 'agent.research.step.createJourney.completed', failed: 'agent.research.step.createJourney.failed' },
      add_itinerary_items: { running: 'agent.research.step.itinerary.running', completed: 'agent.research.step.itinerary.completed', failed: 'agent.research.step.itinerary.failed' },
      update_journey_schedule: { running: 'agent.research.step.journeySchedule.running', completed: 'agent.research.step.journeySchedule.completed', failed: 'agent.research.step.journeySchedule.failed' },
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

// Server-reported stage progress. The interactive path writes no stages, so the
// inferred phase below remains the fallback for it and for older runs.
function stageLabel(stages: AgentStage[] | undefined, t: ReturnType<typeof useI18n>['t']) {
  const active = [...(stages || [])].reverse().find((stage) => stage.status === 'running');
  if (!active) return undefined;
  const keys: Record<AgentStage['stage'], TKey> = {
    interpret: 'agent.stage.interpret',
    research: 'agent.stage.research',
    transport: 'agent.stage.transport',
    plan: 'agent.stage.plan',
    save: 'agent.stage.save',
    packing: 'agent.stage.packing',
    respond: 'agent.stage.respond',
  };
  return t(keys[active.stage]);
}

function activePlanningPhase(activities: AgentRunActivity[], t: ReturnType<typeof useI18n>['t']) {
  const lastActivity = activities.at(-1);
  if (!lastActivity) return t('agent.research.preparing');
  if (lastActivity.toolName === 'add_packing_items' && lastActivity.status === 'completed') {
    return t('agent.research.phase.organizingResults');
  }

  const phaseKeys: Partial<Record<string, TKey>> = {
    get_app_context: 'agent.research.phase.analyzingJourney',
    search_journeys: 'agent.research.phase.analyzingJourney',
    get_journey_details: 'agent.research.phase.analyzingJourney',
    search_routes: 'agent.research.phase.comparingRoutes',
    search_travel_web: 'agent.research.phase.buildingItinerary',
    create_journey: 'agent.research.phase.buildingItinerary',
    list_gear: 'agent.research.phase.matchingGear',
    add_itinerary_items: 'agent.research.phase.reviewingItinerary',
    update_journey_schedule: 'agent.research.phase.reviewingItinerary',
    set_journey_map_location: 'agent.research.phase.reviewingItinerary',
    set_itinerary_group_endpoints: 'agent.research.phase.reviewingItinerary',
    add_packing_items: 'agent.research.phase.reviewingPacking',
    prepare_packing_draft: 'agent.research.phase.reviewingPacking',
    read_packing_draft: 'agent.research.phase.reviewingPacking',
    repair_packing_draft: 'agent.research.phase.reviewingPacking',
    commit_packing_draft: 'agent.research.phase.reviewingPacking',
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

function markdownInline(text: string, color: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    const bold = (part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'));
    const code = part.startsWith('`') && part.endsWith('`');
    const value = bold ? part.slice(2, -2) : code ? part.slice(1, -1) : part;
    return <Text key={`${index}_${part}`} style={bold ? { fontWeight: '700' } : code ? { fontFamily: 'monospace', color } : undefined}>{value}</Text>;
  });
}

function SelectableMessageText({ text, theme }: { text: string; theme: Theme }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <Text selectable accessibilityLabel={text} style={[type.body, { color: theme.text, lineHeight: 22 }]}>
      {lines.map((line, index) => {
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/)?.[1];
        const bullet = line.match(/^\s*[-*+]\s+(.+)$/)?.[1];
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        const content = heading || bullet || ordered?.[1] || line;
        const prefix = bullet ? '• ' : ordered ? `${line.match(/^\s*(\d+)[.)]/)?.[1] || ''}. ` : '';
        return (
          <Text key={`${index}_${line}`} style={heading ? { fontWeight: '700' } : undefined}>
            {prefix}{markdownInline(content, theme.text)}
            {index < lines.length - 1 ? '\n' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

function MessageAttachments({ theme, attachments }: { theme: Theme; attachments: AgentAttachment[] }) {
  return (
    <View style={styles.messageAttachments}>
      {attachments.map((attachment) => attachment.kind === 'image' ? (
        <Image key={attachment.url} source={{ uri: attachment.url }} contentFit="cover" style={styles.messageAttachmentImage} />
      ) : (
        <View key={attachment.url} style={styles.messageAttachmentFile}>
          {!isTrackAttachmentName(attachment.name) ? (
            <View style={styles.messageAttachmentIcon}>
              <FileText size={25} color={theme.text2} strokeWidth={1.5} />
            </View>
          ) : null}
          <View style={styles.messageAttachmentDetails}>
            <Text selectable style={[styles.messageAttachmentName, { color: theme.text }]}>{attachment.name}</Text>
            {attachment.size != null && attachment.size > 0 ? (
              <Text style={[styles.messageAttachmentMeta, { color: theme.text2 }]}>
                {attachment.size < 1024 * 1024 ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`}
              </Text>
            ) : null}
          </View>
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

function ResearchActivity({ theme, activities, modelMetrics = [], runTiming, stages, running, showTiming }: { theme: Theme; activities: AgentRunActivity[]; modelMetrics?: AgentModelMetric[]; runTiming?: AgentMessageUi['runTiming']; stages?: AgentStage[]; running: boolean; showTiming: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(running);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !showTiming) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, showTiming]);
  const arrowProgress = useRef(new Animated.Value(running ? 1 : 0)).current;
  const steps = researchSteps(packingActivityPresentation(activities, running), t);
  const hasRunningStep = steps.some((step) => step.status === 'running');
  const visibleSteps: ResearchStep[] = steps.length
    ? [
        ...steps,
        ...(running && !hasRunningStep ? [{ key: 'active_phase', status: 'running' as const, text: stageLabel(stages, t) ?? activePlanningPhase(activities, t) }] : []),
      ]
    : [{ key: 'preparing', status: 'running', text: t('agent.research.preparing') }];
  const totalElapsed = showTiming ? runElapsed(activities, now, runTiming) : undefined;
  const modelElapsed = modelMetrics.reduce((sum, metric) => sum + metric.durationMs, 0);
  const toolElapsed = activities.reduce((sum, activity) => sum + (activityElapsed(activity, now) || 0), 0);
  const aggregatedModelMetrics = aggregateModelMetrics(modelMetrics, stages);
  const timedSteps = collapsePresentedSteps(visibleSteps.map((step) => {
    const activityIndex = activities.findIndex((activity, index) => step.key === `${activity.toolName}_${index}` || step.key.startsWith(`${activity.toolName}_${index}_`));
    const activity = activityIndex >= 0 ? activities[activityIndex] : undefined;
    const elapsed = activity ? activityElapsed(activity, now) : undefined;
    return { ...step, elapsed };
  }));
  const orderedTimedSteps = [
    ...timedSteps.filter((step) => step.status !== 'running'),
    ...timedSteps.filter((step) => step.status === 'running'),
  ];
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
        <Text style={[styles.researchTitle, { color: theme.text }]}>{t(running ? 'agent.research.title' : 'agent.research.completed')}{totalElapsed != null ? ` · ${formatElapsed(totalElapsed)}` : ''}</Text>
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
      {expanded ? orderedTimedSteps.filter((step) => step.status !== 'running').map((step) => (
        <View key={step.key} style={styles.researchLine}>
          {step.status === 'completed' ? <Check size={14} color={theme.text3} strokeWidth={2} /> : <X size={14} color={theme.text3} strokeWidth={2} />}
          <Text style={[styles.researchLineText, { color: theme.text2 }]}>{step.text}{step.elapsed != null ? ` · ${formatElapsed(step.elapsed)}` : ''}</Text>
        </View>
      )) : null}
      {showTiming && expanded && (modelElapsed || toolElapsed) ? (
        <Text style={[styles.researchLineText, { color: theme.text3, marginLeft: 22 }]}>模型合计 {formatElapsed(modelElapsed)} · 工具合计 {formatElapsed(toolElapsed)}</Text>
      ) : null}
      {showTiming && expanded ? aggregatedModelMetrics.map((metric) => (
        <View key={`model_${metric.stage}`} style={styles.researchLine}>
          {metric.success ? <Check size={14} color={theme.text3} strokeWidth={2} /> : <X size={14} color={theme.text3} strokeWidth={2} />}
          <Text style={[styles.researchLineText, { color: theme.text2 }]}>{modelStageLabel(metric.stage)} · {formatElapsed(metric.durationMs)}{metric.degraded ? ' · 部分完成' : metric.success ? '' : ' · 失败'}</Text>
        </View>
      )) : null}
      {expanded ? orderedTimedSteps.filter((step) => step.status === 'running').map((step) => (
        <View key={step.key} style={styles.researchLine}>
          {step.status === 'running'
            ? <LoadingDots color={theme.text3} />
            : step.status === 'completed'
            ? <Check size={14} color={theme.text3} strokeWidth={2} />
            : <X size={14} color={theme.text3} strokeWidth={2} />}
          <Text style={[styles.researchLineText, { color: theme.text2 }]}>{step.text}{step.elapsed != null ? ` · ${formatElapsed(step.elapsed)}` : ''}</Text>
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

function ActionResultCard({ theme, title, detail, openLabel, onOpen }: { theme: Theme; title: string; detail: string; openLabel: string; onOpen: () => void }) {
  return (
    <Press onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${openLabel}：${title}`} style={[styles.actionResultCard, { backgroundColor: theme.surfaceTop }]}>
      <View style={styles.actionResultIcon}><Check size={18} color={theme.text} strokeWidth={2.2} /></View>
      <View style={styles.actionResultCopy}>
        <Text style={[styles.actionResultTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.actionResultDetail, { color: theme.text3 }]} numberOfLines={2}>{detail}</Text>
      </View>
      <View style={styles.actionResultOpen}>
        <Text style={[styles.actionResultOpenText, { color: theme.text }]}>{openLabel}</Text>
        <ArrowUpRight size={17} color={theme.text} strokeWidth={2} />
      </View>
    </Press>
  );
}

function actionResultForTurn(turn: Turn) {
  const activities = turn.activities || [];
  const gear = [...activities].reverse().find((activity) => activity.toolName === 'add_gear' && activity.status === 'completed');
  if (gear && gear.output && typeof gear.output === 'object') {
    const output = gear.output as { name?: unknown };
    return { kind: 'gear' as const, name: String(output.name || '装备'), detail: '已添加到装备库' };
  }
  const packing = [...activities].reverse().find((activity) => (activity.toolName === 'add_packing_items' || activity.toolName === 'commit_packing_draft') && activity.status === 'completed');
  if (packing && packing.output && typeof packing.output === 'object') {
    const output = packing.output as { added?: unknown; journeyId?: unknown };
    const added = Number(output.added);
    return { kind: 'packing' as const, name: '', added: Number.isFinite(added) ? added : undefined, journeyId: typeof output.journeyId === 'string' ? output.journeyId : undefined };
  }
  return undefined;
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
    travelContext: message.ui?.travelContext,
    sources: message.ui?.sources,
    planPreview: message.ui?.planPreview,
    activities: message.ui?.activities,
    modelMetrics: message.ui?.modelMetrics,
    runTiming: message.ui?.runTiming,
    attachments: message.ui?.attachments,
    undoAction: message.ui?.undoAction,
    createJourneyFlow: message.ui?.createJourneyFlow,
  }));
}

function synchronizedTurnFingerprint(turns: Turn[]) {
  return JSON.stringify(turns.map(({ role, text, quickReplies, sources, planPreview, activities, modelMetrics, runTiming, attachments, undoAction, createJourneyFlow, travelContext }) => ({
    role, text, quickReplies, sources, planPreview, activities, modelMetrics, runTiming, attachments, undoAction, createJourneyFlow, travelContext,
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

export function AppAssistant({ theme, visible, initialPrompt, initialDisplayPrompt, autoSubmitInitialPrompt = false, startNewConversation = false, currentJourneyId, onClose, onClearPrompt, onOpenJourney, onOpenGear }: {
  theme: Theme;
  visible: boolean;
  initialPrompt?: string;
  initialDisplayPrompt?: string;
  autoSubmitInitialPrompt?: boolean;
  startNewConversation?: boolean;
  currentJourneyId?: string;
  onClose: () => void;
  onClearPrompt: () => void;
  onOpenJourney: (journeyId: string) => void;
  onOpenGear: (page: 'sets' | 'items') => void;
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
  const uploadInFlightRef = useRef(false);
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
  const [runModelMetrics, setRunModelMetrics] = useState<AgentModelMetric[]>([]);
  const [runStages, setRunStages] = useState<AgentStage[]>([]);
  const [runTiming, setRunTiming] = useState<AgentMessageUi['runTiming']>();
  const showTiming = true;
  const runActivitiesRef = useRef<AgentRunActivity[]>([]);
  const resumeRef = useRef<(() => void) | undefined>(undefined);
  const requestInFlightRef = useRef(false);
  const submitGenerationRef = useRef(0);
  const pendingRequestRef = useRef<PendingAgentRequest | undefined>(undefined);
  const [retryingPending, setRetryingPending] = useState(false);
  const [requestPhase, setRequestPhase] = useState<'sending' | 'queued' | 'planning' | 'reconnecting' | 'unconfirmed'>('sending');
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
  const cancelProcessing = useCallback(() => {
    const runId = activeRunId;
    if (!loading || !runId) return;
    // Invalidate all outstanding callbacks before updating the server-side run.
    submitGenerationRef.current++;
    pendingRequestRef.current = undefined;
    requestInFlightRef.current = false;
    setLoading(false);
    setActiveRunId(undefined);
    setRunActivities([]);
    setRunModelMetrics([]);
    setRunTiming(undefined);
    void cancelAgentRun(runId).catch((error) => console.warn('[AppAgent] cancel failed', error));
  }, [activeRunId, loading]);
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
  const activeJourneyId = currentJourneyId || threadJourneyId;
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
      setAttachmentTrayOpen(false);
      await submit(t('agent.trackPrompt.upload'), pending.intent, true, trackAttachments);
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
    const finish = () => {
      const pending = pendingRequestRef.current;
      if (pending?.args.clientRunId === activeRunId) {
        pendingRequestRef.current = undefined;
        void AsyncStorage.removeItem(pending.storageKey);
      }
      requestInFlightRef.current = false;
      setLoading(false);
      setActiveRunId(undefined);
      void refetchWrittenJourney().catch((error) => console.warn('[AppAgent] refresh failed', error));
    };
    const poll = async () => {
      if (AppState.currentState && AppState.currentState !== 'active') return;
      const result = await getAgentRunActivity(activeRunId);
      if (!active) return;
      const pending = pendingRequestRef.current;
      const resolvedThreadId = result.threadId || threadId || pending?.args.threadId || activeRunId;
      if (result.threadId && result.threadId !== threadId) {
        setThreadId(result.threadId);
        void AsyncStorage.setItem(storageKey(data.userId, activeJourneyId), result.threadId);
      }
      const changed = activityFingerprint(runActivitiesRef.current) !== activityFingerprint(result.activities);
      runActivitiesRef.current = result.activities;
      if (changed) setRunActivities(result.activities);
      setRunModelMetrics(result.modelMetrics || []);
      setRunStages(result.stages || []);
      setRunTiming(result.runTiming);
      const expiredLegacyRun = result.status === 'running' && result.executionMode !== 'background'
        && result.createdAt && Date.now() - new Date(result.createdAt).getTime() > 5 * 60 * 1000 + 15 * 1000;
      if (result.status === 'running' && !expiredLegacyRun) {
        setRequestPhase(result.activities.length ? 'planning' : 'queued');
        return;
      }
      if (result.status && requestInFlightRef.current && !pending) return;
      // History is authoritative for both background results and synchronous replies.
      const history = await getAgentHistory(resolvedThreadId);
      if (!active || (expiredLegacyRun && history.activeRun)) return;
      const hasReply = Boolean(result.status) || history.messages.some((message) => message.role === 'assistant' && message.ui?.requestId === activeRunId);
      if (hasReply) {
        setThreadId(history.thread.id);
        setThreadTitle(history.thread.title);
        setThreadJourneyId(currentJourneyId || history.thread.current_journey_id || undefined);
        setTurns((current) => [...historyTurns(history), ...current.filter((turn) => turn.upload)]);
        console.info('[AppAgent] restored request', activeRunId, result.status || 'completed');
        finish();
      } else if (!pending || Date.now() - pending.startedAt >= 20_000) {
        setRequestPhase('unconfirmed');
      }
    };
    const recovery = startAgentRecovery(poll, () => {
      if (active && (!pendingRequestRef.current || Date.now() - pendingRequestRef.current.startedAt >= 20_000)) setRequestPhase('reconnecting');
    });
    // Realtime only nudges the poll; the poll stays the single writer of run
    // state, so a dropped socket degrades to the existing cadence.
    resumeRef.current = () => { if (active) recovery.resume(); };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recovery.resume();
    });
    return () => { active = false; recovery.stop(); subscription.remove(); };
  }, [activeJourneyId, activeRunId, currentJourneyId, data.userId, threadId, visible]);

  useAgentRunRealtime(activeRunId, () => resumeRef.current?.());

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
    const canReuseCurrentView = !startNewConversation && restoredScopeRef.current === scope;
    setRestoring(!canReuseCurrentView);
    if (!canReuseCurrentView) {
      submitGenerationRef.current++;
      pendingRequestRef.current = undefined;
      requestInFlightRef.current = false;
      uploadInFlightRef.current = false;
      setAttachmentUploading(false);
      setRetryingPending(false);
      setActiveRunId(undefined);
      setLoading(false);
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
        if (startNewConversation) {
          await AsyncStorage.multiRemove([key, `${key}:pending`]);
        }
        const pendingJson = await AsyncStorage.getItem(`${key}:pending`);
        if (!active) return;
        if (pendingJson) {
          const pending = JSON.parse(pendingJson) as PendingAgentRequest;
          if (pending.args?.clientRunId && pending.storageKey === `${key}:pending`) {
            pendingRequestRef.current = pending;
            setActiveRunId(pending.args.clientRunId);
            setRequestPhase('reconnecting');
            setLoading(true);
          }
        }
        let savedThreadId = (await AsyncStorage.getItem(key)) || undefined;
        savedThreadId ||= pendingRequestRef.current?.args.threadId;
        if (currentJourneyId && !savedThreadId) {
          const result = await getJourneyAgentThread(currentJourneyId);
          savedThreadId = result.threadId || undefined;
        }
        if (!active) return;
        if (!savedThreadId) {
          const pending = pendingRequestRef.current;
          if (pending) setTurns((current) => current.length ? current : [{ id: `u_${pending.args.clientRunId}`, role: 'user', text: pending.args.displayMessage || pending.args.message, attachments: pending.args.attachments }]);
          restoredScopeRef.current = scope;
          if (initialPrompt && !autoSubmitInitialPrompt) setInput(initialPrompt);
          return;
        }
        let resolvedThreadId: string = savedThreadId;
        setThreadId(resolvedThreadId);
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
        const restoredJourneyId = currentJourneyId || history.thread.current_journey_id || undefined;
        setThreadJourneyId(restoredJourneyId);
        const restored: Turn[] = history.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          quickReplies: message.ui?.quickReplies,
          travelContext: message.ui?.travelContext,
          sources: message.ui?.sources,
          planPreview: message.ui?.planPreview,
          activities: message.ui?.activities,
          modelMetrics: message.ui?.modelMetrics,
          runTiming: message.ui?.runTiming,
          attachments: message.ui?.attachments,
          undoAction: message.ui?.undoAction,
          createJourneyFlow: message.ui?.createJourneyFlow,
        }));
        if (!active) return;
        setThreadId(resolvedThreadId);
        setThreadTitle(history.thread.title);
        const pending = pendingRequestRef.current;
        const replied = pending && history.messages.some((message) => message.role === 'assistant' && message.ui?.requestId === pending.args.clientRunId);
        if (replied && pending) {
          pendingRequestRef.current = undefined;
          requestInFlightRef.current = false;
          void AsyncStorage.removeItem(pending.storageKey);
        }
        setTurns(pending && !replied && !history.activeRun
          ? [...restored, { id: `u_${pending.args.clientRunId}`, role: 'user', text: pending.args.displayMessage || pending.args.message, attachments: pending.args.attachments }]
          : restored);
        if (history.activeRun) {
          setActiveRunId(history.activeRun.id);
          runActivitiesRef.current = history.activeRun.activities;
          setRunActivities(history.activeRun.activities);
          setRunModelMetrics(history.activeRun.modelMetrics || []);
          setRunStages(history.activeRun.stages || []);
          setRunTiming(history.activeRun.runTiming);
          setLoading(true);
          setRequestPhase(history.activeRun.activities.length ? 'planning' : 'queued');
        } else if (!requestInFlightRef.current && !pendingRequestRef.current) {
          setActiveRunId(undefined);
          runActivitiesRef.current = [];
          setRunActivities([]);
          setRunModelMetrics([]);
          setRunStages([]);
          setLoading(false);
        }
        restoredScopeRef.current = scope;
        await AsyncStorage.setItem(key, resolvedThreadId);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
      } catch (error) {
        console.warn('[AppAgent] history restore failed', error);
        if (active && pendingRequestRef.current) setRequestPhase('reconnecting');
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
  }, [currentJourneyId, data.userId, t, visible, startNewConversation]);

  useEffect(() => {
    if (!visible || !threadId || loading || restoring || attachmentUploading) return;
    let active = true;
    const syncHistory = async () => {
      if (AppState.currentState && AppState.currentState !== 'active') return;
      try {
        const history = await getAgentHistory(threadId);
        if (!active) return;
        const synchronized = historyTurns(history);
        setTurns((current) => (
          uploadInFlightRef.current || synchronizedTurnFingerprint(current.filter((turn) => !turn.upload)) === synchronizedTurnFingerprint(synchronized)
            ? current
            : [...synchronized, ...current.filter((turn) => turn.upload)]
        ));
        setThreadTitle(history.thread.title);
        setThreadJourneyId(currentJourneyId || history.thread.current_journey_id || undefined);
      } catch (error) {
        console.warn('[AppAgent] history sync failed', error);
      }
    };
    const recovery = startAgentRecovery(syncHistory, () => {});
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') recovery.resume(); });
    return () => { active = false; recovery.stop(); subscription.remove(); };
  }, [attachmentUploading, currentJourneyId, loading, restoring, threadId, visible]);

  const appendResponse = (response: AgentTurnResponse, createdThreadTitle?: string, activities = response.ui?.activities) => {
    setThreadId(response.threadId);
    if (createdThreadTitle) setThreadTitle(createdThreadTitle);
    void AsyncStorage.setItem(storageKey(data.userId, activeJourneyId), response.threadId);
    if (response.ui?.trackPrompt) setTrackPrompt(response.ui.trackPrompt);
    setTurns((current) => [...current, { id: `a_${Date.now()}`, role: 'assistant', text: response.message || t('agent.executed'), quickReplies: response.quickReplies, travelContext: response.ui?.travelContext, sources: response.ui?.sources, planPreview: response.ui?.planPreview, activities, modelMetrics: response.ui?.modelMetrics, runTiming: response.ui?.runTiming, undoAction: response.ui?.undoAction, createJourneyFlow: response.ui?.createJourneyFlow }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const resendPendingRequest = async () => {
    const pending = pendingRequestRef.current;
    if (!pending || requestInFlightRef.current || retryingPending) return;
    const generation = submitGenerationRef.current;
    requestInFlightRef.current = true;
    setRetryingPending(true);
    try {
      const run = await getAgentRunActivity(pending.args.clientRunId);
      if (pendingRequestRef.current !== pending) return;
      if (run.status) {
        // The monitor will restore terminal replies; never replay an accepted run.
        setRequestPhase(run.status === 'running' ? (run.activities.length ? 'planning' : 'queued') : 'reconnecting');
        return;
      }
      setRequestPhase('sending');
      const response = await sendAgentTurn(pending.args);
      if (pendingRequestRef.current !== pending) return;
      setThreadId(response.threadId);
      void AsyncStorage.setItem(storageKey(data.userId, activeJourneyId), response.threadId);
      if (response.status === 'running') {
        setRequestPhase('queued');
        setActiveRunId(response.runId);
      } else if (response.status === 'completed') {
        appendResponse(response);
        pendingRequestRef.current = undefined;
        void AsyncStorage.removeItem(pending.storageKey);
        setLoading(false);
        setActiveRunId(undefined);
        void refetchWrittenJourney().catch((error) => console.warn('[AppAgent] refresh failed', error));
      }
    } catch (error) {
      console.warn('[AppAgent] request recovery failed', pending.args.clientRunId, error);
      if (pendingRequestRef.current === pending) setRequestPhase('reconnecting');
    } finally {
      if (generation !== submitGenerationRef.current) return;
      if (!pendingRequestRef.current || pendingRequestRef.current === pending) requestInFlightRef.current = false;
      setRetryingPending(false);
    }
  };

  const continueAgentRun = async (runId: string) => {
    if (loading || requestInFlightRef.current || attachmentUploading) return;
    const generation = ++submitGenerationRef.current;
    requestInFlightRef.current = true;
    setLoading(true);
    setRequestPhase('sending');
    setActiveRunId(runId);
    let tracking = false;
    try {
      const response = await retryAgentRun(runId);
      if (generation !== submitGenerationRef.current) return;
      setThreadId(response.threadId);
      void AsyncStorage.setItem(storageKey(data.userId, activeJourneyId), response.threadId);
      const history = await getAgentHistory(response.threadId);
      if (generation !== submitGenerationRef.current) return;
      setTurns(historyTurns(history));
      runActivitiesRef.current = history.activeRun?.activities || [];
      setRunActivities(runActivitiesRef.current);
      setRunModelMetrics(history.activeRun?.modelMetrics || []);
      setRunStages(history.activeRun?.stages || []);
      setRunTiming(history.activeRun?.runTiming);
      if (history.activeRun) {
        tracking = true;
        setActiveRunId(history.activeRun.id);
      }
    } catch {
      if (generation !== submitGenerationRef.current) return;
      // The retry may have been accepted before the connection was lost.
      const run = await getAgentRunActivity(runId).catch(() => undefined);
      if (generation !== submitGenerationRef.current) return;
      if (run?.status === 'running') {
        tracking = true;
        setActiveRunId(runId);
                runActivitiesRef.current = run.activities;
                setRunActivities(run.activities);
                setRunModelMetrics(run.modelMetrics || []);
      } else {
        Alert.alert(t('agent.retryFailed'));
      }
    } finally {
      if (generation !== submitGenerationRef.current) return;
      requestInFlightRef.current = false;
      if (!tracking) setLoading(false);
    }
  };

  const submit = async (preset?: string, intent?: AgentIntent, skipTrackPrompt = false, attachmentOverride?: LocalAgentAttachment[], displayMessage?: string, retryTurnId?: string, locationIntent?: AgentLocationIntent) => {
    const pendingAttachments = attachmentOverride ? [...attachmentOverride] : [...selectedAttachments];
    const typedMessage = (preset ?? input).trim();
    const message = typedMessage || (pendingAttachments.length ? t('agent.attachment.defaultPrompt') : '');
    const visibleMessage = displayMessage?.trim() || message;
    if (!message || loading || uploadInFlightRef.current || attachmentUploading || (trackPicking && !attachmentOverride)) return;
    const pendingHasTrackAttachment = pendingAttachments.some((attachment) => isTrackAttachmentName(attachment.name) || isTrackAttachmentName(attachment.uri));
    const lastTrackPromptTurn = turns.at(-1) && isTrackPromptTurn(turns.at(-1)!) ? turns.at(-1) : undefined;
    const activeTrackPrompt = trackPrompt || (lastTrackPromptTurn ? trackPromptFromTurn(lastTrackPromptTurn) : undefined);
    if (!skipTrackPrompt && !attachmentOverride && !pendingHasTrackAttachment && !wantsNoTrackReply(message) && wantsTrackUploadReply(message)) {
      console.log('[AppAgent] intercepting track upload text without attachment; opening picker');
      void chooseTrackForPlan(activeTrackPrompt || {
        message: '',
        intent,
      });
      return;
    }
    if (!skipTrackPrompt && !attachmentOverride) {
      if (activeTrackPrompt && !pendingHasTrackAttachment && !wantsNoTrackReply(message) && wantsTrackUploadReply(message)) {
        void chooseTrackForPlan(activeTrackPrompt);
        return;
      }
      if (activeTrackPrompt && wantsNoTrackReply(message)) {
        continuePlanWithoutTrack(activeTrackPrompt);
        return;
      }
    }
    const optimisticUpload = pendingHasTrackAttachment;
    const generation = ++submitGenerationRef.current;
    const userTurnId = retryTurnId || `u_${createRunId()}`;
    uploadInFlightRef.current = true;
    setAttachmentUploading(pendingAttachments.length > 0);
    if (optimisticUpload) {
      const uploadTurn: Turn = {
        id: userTurnId,
        role: 'user',
        text: visibleMessage,
        attachments: pendingAttachments.map((file) => ({ ...file, url: file.uri })),
        upload: { status: 'uploading', files: pendingAttachments, message, intent },
      };
      setTurns((current) => retryTurnId
        ? current.map((turn) => turn.id === retryTurnId ? uploadTurn : turn)
        : [...current, uploadTurn]);
      if (!retryTurnId) {
        setInput('');
        setSelectedAttachments([]);
        setAttachmentTrayOpen(false);
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
    let requestStarted = false;
    let keepTrackingRun = false;
    const clientRunId = createRunId();
    try {
      const attachments: AgentAttachment[] = await Promise.all(pendingAttachments.map(async (attachment) => ({
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: await uploadAgentAttachment(attachment.uri, data.userId, attachment.name, attachment.mimeType),
      })));
      if (generation !== submitGenerationRef.current) return;
      setTurns((current) => optimisticUpload
        ? current.map((turn) => turn.id === userTurnId ? { ...turn, attachments, upload: undefined } : turn)
        : [...current, { id: userTurnId, role: 'user', text: visibleMessage, attachments }]);
      if (!optimisticUpload) {
        setInput('');
        setSelectedAttachments([]);
        setAttachmentTrayOpen(false);
      }
      setLoading(true);
      setRequestPhase('sending');
      requestStarted = true;
      requestInFlightRef.current = true;
      runActivitiesRef.current = [];
      setRunActivities([]);
      setRunStages([]);
      const creatingThread = !threadId;
      const travel = [...turns].reverse().find(turn => turn.role === 'assistant' && turn.travelContext !== undefined)?.travelContext;
      const skipSuggestedLocation = locationIntent === 'transport' && !shouldSuggestTransportLocation(travel, activeJourneyId);
      const currentLocation = skipSuggestedLocation ? undefined : await getAgentLocation(visibleMessage, 15_000, locationIntent);
      if (generation !== submitGenerationRef.current) return;
      const args = { message, displayMessage: visibleMessage !== message ? visibleMessage : undefined, threadId, currentJourneyId: activeJourneyId, intent, locale: resolved, clientRunId, attachments, currentLocation, ...localAgentTimeContext() };
      const pending = { args, storageKey: `${storageKey(data.userId, currentJourneyId)}:pending`, startedAt: Date.now() };
      pendingRequestRef.current = pending;
      await AsyncStorage.setItem(pending.storageKey, JSON.stringify(pending));
      setActiveRunId(clientRunId);
      console.info('[AppAgent] sending request', clientRunId);
      const response = await sendAgentTurn(args);
      if (generation !== submitGenerationRef.current || pendingRequestRef.current?.args.clientRunId !== clientRunId) return;
      console.info('[AppAgent] received response', clientRunId, response.status, Date.now() - pending.startedAt);
      if (response.status === 'running') {
        keepTrackingRun = true;
        setRequestPhase('queued');
        setThreadId(response.threadId);
        if (creatingThread) setThreadTitle(visibleMessage.slice(0, 36));
        void AsyncStorage.setItem(storageKey(data.userId, activeJourneyId), response.threadId);
        setActiveRunId(response.runId);
        return;
      }
      if (response.status === 'failed') throw new Error('Agent run did not complete');
      const changedJourneyData = Boolean(response.ui?.undoAction)
        || response.ui?.activities?.some((activity) => activity.toolName === 'undo_last_agent_changes' && activity.status === 'completed');
      appendResponse(response, creatingThread ? visibleMessage.slice(0, 36) : undefined, response.ui?.activities);
      pendingRequestRef.current = undefined;
      void AsyncStorage.removeItem(pending.storageKey);
      setLoading(false);
      setActiveRunId(undefined);
      if (changedJourneyData) void refetchWrittenJourney().catch((error) => console.warn('[AppAgent] refresh failed', error));
    } catch (error) {
      if (generation !== submitGenerationRef.current) return;
      console.warn('[AppAgent] turn failed', error);
      if (requestStarted) {
        if (pendingRequestRef.current?.args.clientRunId === clientRunId) {
          keepTrackingRun = true;
          setActiveRunId(clientRunId);
          setRequestPhase('reconnecting');
        }
      } else if (optimisticUpload) {
        setTurns((current) => current.map((turn) => turn.id === userTurnId && turn.upload
          ? { ...turn, upload: { ...turn.upload, status: 'failed' } }
          : turn));
      } else {
        showAttachmentError(t('agent.attachment.failed'));
      }
    } finally {
      if (generation !== submitGenerationRef.current) return;
      uploadInFlightRef.current = false;
      setAttachmentUploading(false);
      if (requestStarted) {
        if (!pendingRequestRef.current || pendingRequestRef.current.args.clientRunId === clientRunId) requestInFlightRef.current = false;
        if (!keepTrackingRun && !pendingRequestRef.current) {
          setLoading(false);
          setActiveRunId(undefined);
        }
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
    if (requestInFlightRef.current || attachmentUploading || pendingRequestRef.current) return;
    submitGenerationRef.current++;
    setActiveRunId(undefined);
    runActivitiesRef.current = [];
    setRunActivities([]);
    setRunStages([]);
    setLoading(false);
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
    if (requestInFlightRef.current || attachmentUploading || pendingRequestRef.current) return;
    if (thread.id === threadId) {
      setThreadSheetOpen(false);
      return;
    }
    submitGenerationRef.current++;
    setThreadsLoading(true);
    try {
      const history = await getAgentHistory(thread.id);
      const restored: Turn[] = historyTurns(history);
      const selectedJourneyId = history.thread.current_journey_id || thread.current_journey_id || undefined;
      setThreadId(thread.id);
      setThreadTitle(history.thread.title);
      setThreadJourneyId(selectedJourneyId);
      setTurns(restored);
      if (history.activeRun) {
        setActiveRunId(history.activeRun.id);
        runActivitiesRef.current = history.activeRun.activities;
        setRunActivities(history.activeRun.activities);
        setRunStages(history.activeRun.stages || []);
        setLoading(true);
        setRequestPhase(history.activeRun.activities.length ? 'planning' : 'queued');
      } else if (!requestInFlightRef.current) {
        setActiveRunId(undefined);
        runActivitiesRef.current = [];
        setRunActivities([]);
        setRunStages([]);
        setRunModelMetrics([]);
        setRunTiming(undefined);
        setLoading(false);
      }
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
        setActiveRunId(undefined);
        runActivitiesRef.current = [];
        setRunActivities([]);
        setRunStages([]);
        setLoading(false);
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

  const trackAnswerForTurn = (index: number) => {
    // Stop at the next upload question so a later answer cannot select an older one.
    const nextPromptIndex = turns.findIndex((item, itemIndex) => itemIndex > index && isTrackPromptTurn(item));
    return turns.slice(index + 1, nextPromptIndex < 0 ? undefined : nextPromptIndex).find((item) => {
      if (item.role !== 'user') return false;
      if (item.attachments?.some((attachment) => isTrackAttachmentName(attachment.name))) return true;
      return wantsTrackUploadReply(item.text) || wantsNoTrackReply(item.text);
    });
  };

  const trackActionPromptForTurn = (turn: Turn) => trackPromptFromTurn(turn);

  const quickRepliesForTurn = (turn: Turn) => {
    if (isTrackPromptTurn(turn)) return [];
    return (turn.quickReplies || []).filter((reply) => reply.action === 'supplement_plan'
      ? turn === turns[turns.length - 1] && !turn.undoAction?.undoneAt
      : !turn.undoAction);
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
          ) : turns.map((turn, turnIndex) => {
            const trackActionPrompt = trackActionPromptForTurn(turn);
            const trackAnswer = trackActionPrompt ? trackAnswerForTurn(turnIndex) : undefined;
            const trackActionsDisabled = loading || trackPicking || attachmentUploading || Boolean(trackAnswer);
            const isTrackUploadMessage = turn.role === 'user'
              && turn.attachments?.some((attachment) => isTrackAttachmentName(attachment.name))
              && /^(上传轨迹|Upload track)$/i.test(turn.text.trim());
            return (
            <View key={turn.id} style={turn.role === 'user' ? styles.userRow : styles.assistantRow}>
              {turn.role === 'assistant' && (turn.activities?.length || turn.modelMetrics?.length) ? <ResearchActivity theme={theme} activities={turn.activities || []} modelMetrics={turn.modelMetrics} runTiming={turn.runTiming} running={false} showTiming={showTiming} /> : null}
              <View style={[
                turn.role === 'user' ? styles.userBubble : styles.assistantBubble,
                turn.role === 'user' ? { backgroundColor: theme.accentSoft } : null,
              ]}>
                {isTrackUploadMessage
                  ? <Text style={[styles.trackMessageLabel, { color: theme.text2 }]}>{t('agent.trackPrompt.upload')}</Text>
                  : <SelectableMessageText text={turn.text} theme={theme} />}
                {turn.attachments?.length ? <MessageAttachments theme={theme} attachments={turn.attachments} /> : null}
                {turn.upload ? (
                  <View style={styles.uploadStatus} accessibilityLiveRegion="polite">
                    {turn.upload.status === 'uploading' ? <ActivityIndicator size="small" color={theme.text2} /> : null}
                    <Text style={[styles.uploadStatusText, { color: turn.upload.status === 'failed' ? theme.danger : theme.text2 }]}>
                      {t(turn.upload.status === 'uploading' ? 'agent.attachment.uploading' : 'agent.attachment.uploadFailed')}
                    </Text>
                    {turn.upload.status === 'failed' ? (
                      <Press
                        accessibilityRole="button"
                        disabled={loading || attachmentUploading || trackPicking}
                        accessibilityState={{ disabled: loading || attachmentUploading || trackPicking }}
                        onPress={() => {
                          const upload = turn.upload;
                          if (upload) void submit(upload.message, upload.intent, true, upload.files, turn.text, turn.id);
                        }}
                        style={[styles.uploadRetry, (loading || attachmentUploading || trackPicking) && styles.quickReplyDisabled]}
                      >
                        <RotateCcw size={14} color={theme.text} />
                        <Text style={[styles.uploadStatusText, { color: theme.text }]}>{t('agent.attachment.retryUpload')}</Text>
                      </Press>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {trackActionPrompt ? (
                <View style={styles.quickReplies}>
                  <Press
                    disabled={trackActionsDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: trackActionsDisabled }}
                    onPress={() => void chooseTrackForPlan(trackActionPrompt)}
                    style={({ pressed }) => [styles.quickReply, { backgroundColor: theme.accentSofter }, (pressed || (!trackAnswer && trackActionsDisabled)) && styles.quickReplyDisabled]}
                  >
                    <Text style={[styles.quickReplyText, { color: theme.text }]}>{t('agent.trackPrompt.upload')}</Text>
                  </Press>
                  <Press
                    disabled={trackActionsDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: trackActionsDisabled }}
                    onPress={() => continuePlanWithoutTrack(trackActionPrompt)}
                    style={({ pressed }) => [styles.quickReply, { backgroundColor: theme.accentSofter }, (pressed || (!trackAnswer && trackActionsDisabled)) && styles.quickReplyDisabled]}
                  >
                    <Text style={[styles.quickReplyText, { color: theme.text }]}>{t('agent.trackPrompt.skip')}</Text>
                  </Press>
                </View>
              ) : null}
              {quickRepliesForTurn(turn).length ? (
                <View style={styles.quickReplies}>
                  {quickRepliesForTurn(turn).map((reply) => {
                    const inlineTrackPrompt = trackPromptFromTurn(turn) || trackPrompt || undefined;
                    const isTrackUploadReply = reply.action === 'upload_track';
                    const isSkipTrackReply = reply.action === 'skip_track';
                    const disabled = loading || trackPicking || attachmentUploading;
                    return (
                      <Press
                        key={`${turn.id}_${reply.message}`}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityState={{ disabled, busy: isTrackUploadReply && trackPicking }}
                        onPress={() => {
                          if (reply.action === 'retry_run' && reply.runId) void continueAgentRun(reply.runId);
                          else if (isTrackUploadReply) void chooseTrackForPlan(inlineTrackPrompt || trackPrompt || { message: '', intent: undefined });
                          else if (isSkipTrackReply) continuePlanWithoutTrack(inlineTrackPrompt || trackPrompt || { message: '', intent: undefined });
                          else void submit(reply.message, undefined, false, undefined, undefined, undefined, transportLocationIntent(reply));
                        }}
                        style={[styles.quickReply, { backgroundColor: theme.accentSofter }, disabled && styles.quickReplyDisabled]}
                      >
                        {isTrackUploadReply && trackPicking ? <ActivityIndicator size="small" color={theme.text} /> : null}
                        {reply.action === 'retry_run' ? <RotateCcw size={16} color={theme.text} /> : null}
                        <Text style={[styles.quickReplyText, { color: theme.text }]}>{reply.label}</Text>
                      </Press>
                    );
                  })}
                </View>
              ) : null}
              {turn.sources?.length ? <SourcesStrip theme={theme} sources={turn.sources} title={t('agent.sources')} /> : null}
              {turn.planPreview ? <PlanPreviewCard theme={theme} preview={turn.planPreview} openLabel={t('agent.viewJourney')} onOpen={onOpenJourney} /> : null}
              {turn.role === 'assistant' && actionResultForTurn(turn) ? (() => {
                const result = actionResultForTurn(turn)!;
                return <ActionResultCard
                  theme={theme}
                  title={result.kind === 'gear' ? result.name : t('agent.checklistUpdated')}
                  detail={result.kind === 'gear' ? t('agent.gearAddedToLibrary') : result.added != null ? t('agent.checklistItemsAdded', { count: result.added }) : t('agent.checklistSaved')}
                  openLabel={t(result.kind === 'gear' ? 'agent.viewGear' : 'agent.viewChecklist')}
                  onOpen={() => onOpenGear(result.kind === 'gear' ? 'items' : 'sets')}
                />;
              })() : null}
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
          ); })}
          {loading ? requestPhase === 'planning' || requestPhase === 'queued' ? <ResearchActivity theme={theme} activities={runActivities} modelMetrics={runModelMetrics} runTiming={runTiming} stages={runStages} running showTiming={showTiming} /> : (
            <View style={styles.researchProgress}>
              <View style={styles.researchHeader}>
                {requestPhase === 'sending' ? <ActivityIndicator size="small" color={theme.text} />
                  : <RotateCcw size={18} color={theme.text2} />}
                <Text style={[styles.researchTitle, { color: theme.text }]}>{t(`agent.request.${requestPhase}`)}</Text>
              </View>
              {(requestPhase === 'reconnecting' || requestPhase === 'unconfirmed') && pendingRequestRef.current ? (
                <Press onPress={() => void resendPendingRequest()} disabled={retryingPending} accessibilityRole="button" accessibilityState={{ disabled: retryingPending }} style={styles.uploadRetry}>
                  {retryingPending ? <ActivityIndicator size="small" color={theme.text2} /> : <RotateCcw size={16} color={theme.text2} />}
                  <Text style={[type.body, { color: theme.text2 }]}>{t('agent.request.retry')}</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
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
                disabled={attachmentUploading}
                accessibilityLabel={loading ? t('common.cancel') : voiceActive ? t('agent.stopVoiceInput') : canSend ? t('agent.send') : t('agent.voiceInput')}
                accessibilityState={{ disabled: attachmentUploading, selected: voiceActive }}
                onPress={loading ? cancelProcessing : voiceActive ? speech.stop : canSend ? () => void submit() : startVoiceInput}
                style={[styles.composerAction, (loading || canSend || voiceActive) && { backgroundColor: theme.accent }, voiceHolding && styles.voiceActionHidden]}
              >
                {loading
                  ? <Square size={16} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
                  : attachmentUploading
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
  messageAttachments: { marginTop: space.sm, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.xs },
  messageAttachmentImage: { width: 112, height: 112, borderRadius: radius.control },
  messageAttachmentFile: { width: 240, maxWidth: '100%', minHeight: layout.fieldHeight, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  messageAttachmentIcon: { width: space.xxl, height: layout.fieldHeight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  messageAttachmentDetails: { flex: 1, minWidth: 0, gap: space.xxs, paddingVertical: space.xxs },
  messageAttachmentName: { ...type.cardTitle, lineHeight: 22, letterSpacing: 0 },
  messageAttachmentMeta: { ...type.caption, lineHeight: 16, letterSpacing: 0 },
  trackMessageLabel: { ...type.caption, lineHeight: 16, letterSpacing: 0 },
  uploadStatus: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  uploadStatusText: { ...type.caption, flexShrink: 1, lineHeight: 18, letterSpacing: 0 },
  uploadRetry: { minHeight: layout.fieldHeight, flexDirection: 'row', alignItems: 'center', gap: space.xxs, paddingHorizontal: space.xs },
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
  actionResultCard: { marginTop: space.md, minHeight: 72, borderRadius: radius.card, padding: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm, boxShadow: '0px 8px 22px rgba(0,0,0,0.06)' },
  actionResultIcon: { width: 36, height: 36, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  actionResultCopy: { flex: 1, minWidth: 0, gap: 2 },
  actionResultTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 0 },
  actionResultDetail: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  actionResultOpen: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  actionResultOpenText: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0 },
  copyAction: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xxs, marginTop: space.xs },
  messageActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  copyText: { fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  researchProgress: { alignSelf: 'stretch', marginBottom: space.xl, paddingVertical: space.sm },
  researchHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  researchTitle: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: 0 },
  researchLine: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  researchLineText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18, letterSpacing: 0 },
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
