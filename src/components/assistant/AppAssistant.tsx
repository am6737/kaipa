import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable as Press, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowUp, ArrowUpRight, BriefcaseBusiness, CarFront, Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, Copy, CornerDownLeft, Globe2, Link2, Menu, Mic, Mountain, Plus, Square, SquarePen, TentTree, Trash2, X } from 'lucide-react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../../data/DataContext';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { refetchJourneyPacking } from '../../hooks/useJourneyPacking';
import { refetchJourneyTimeline } from '../../hooks/useTimeline';
import { deleteAgentThread, getAgentHistory, getAgentRunActivity, getAgentThreads, getJourneyAgentThread, resolveAgentRun, sendAgentTurn, type AgentApproval, type AgentHistoryResponse, type AgentIntent, type AgentPlanPreview, type AgentQuickReply, type AgentRunActivity, type AgentSource, type AgentThreadSummary, type AgentTurnResponse } from '../../lib/appAgent';
import type { Theme } from '../../theme/theme';
import { AssistantMark } from './AssistantMark';
import { journeyDayDisplayLabel } from '../../lib/journeyDays';
import { useSpeechRecognitionInput, type SpeechRecognitionInputError } from './useSpeechRecognitionInput';

type Turn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  quickReplies?: AgentQuickReply[];
  runId?: string;
  approvals?: AgentApproval[];
  sources?: AgentSource[];
  planPreview?: AgentPlanPreview;
  activities?: AgentRunActivity[];
};

const storageKey = (userId: string, journeyId?: string) => `kaipa_agent_thread_v1:${userId}:${journeyId || 'global'}`;

function createRunId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function formatTime(minutes?: number) {
  if (minutes == null) return undefined;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

type ResearchStep = { key: string; text: string; status: AgentRunActivity['status'] };

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

function researchSteps(activities: AgentRunActivity[], t: ReturnType<typeof useI18n>['t']): ResearchStep[] {
  return activities.flatMap((activity, index) => {
    const key = `${activity.toolName}_${index}`;
    const query = String(activity.arguments.query || '').trim();
    if (activity.toolName === 'search_travel_web') {
      if (activity.status === 'running') return [{ key, status: activity.status, text: t('agent.research.searching', { query }) }];
      if (activity.status === 'failed') return [{ key, status: activity.status, text: t('agent.research.searchFailed', { query }) }];
      const reports = searchReports(activity.output);
      const providerSteps: ResearchStep[] = reports.map((report) => ({
        key: `${key}_${report.source}`,
        status: report.status === 'completed' ? 'completed' : 'failed',
        text: report.status === 'completed'
          ? t('agent.research.sourceFound', { source: sourceLabel(report.source, t), count: report.resultCount })
          : report.status === 'unavailable'
          ? t('agent.research.sourceUnavailable', { source: sourceLabel(report.source, t) })
          : report.status === 'timed_out'
          ? t('agent.research.sourceTimedOut', { source: sourceLabel(report.source, t) })
          : t('agent.research.sourceFailed', { source: sourceLabel(report.source, t) }),
      }));
      return providerSteps.length ? providerSteps : [{ key, status: activity.status, text: t('agent.research.searchCompleted', { query }) }];
    }
    const stepKeys: Record<string, Record<AgentRunActivity['status'], TKey>> = {
      get_app_context: { running: 'agent.research.step.context.running', completed: 'agent.research.step.context.completed', failed: 'agent.research.step.context.failed' },
      search_journeys: { running: 'agent.research.step.journeys.running', completed: 'agent.research.step.journeys.completed', failed: 'agent.research.step.journeys.failed' },
      search_routes: { running: 'agent.research.step.routes.running', completed: 'agent.research.step.routes.completed', failed: 'agent.research.step.routes.failed' },
      list_gear: { running: 'agent.research.step.gear.running', completed: 'agent.research.step.gear.completed', failed: 'agent.research.step.gear.failed' },
      get_journey_details: { running: 'agent.research.step.journeyDetails.running', completed: 'agent.research.step.journeyDetails.completed', failed: 'agent.research.step.journeyDetails.failed' },
      create_journey: { running: 'agent.research.step.createJourney.running', completed: 'agent.research.step.createJourney.completed', failed: 'agent.research.step.createJourney.failed' },
      add_itinerary_items: { running: 'agent.research.step.itinerary.running', completed: 'agent.research.step.itinerary.completed', failed: 'agent.research.step.itinerary.failed' },
      set_itinerary_group_endpoints: { running: 'agent.research.step.itineraryEndpoints.running', completed: 'agent.research.step.itineraryEndpoints.completed', failed: 'agent.research.step.itineraryEndpoints.failed' },
      add_packing_items: { running: 'agent.research.step.packing.running', completed: 'agent.research.step.packing.completed', failed: 'agent.research.step.packing.failed' },
      delete_itinerary_items: { running: 'agent.research.step.deleteItinerary.running', completed: 'agent.research.step.deleteItinerary.completed', failed: 'agent.research.step.deleteItinerary.failed' },
      delete_packing_items: { running: 'agent.research.step.deletePacking.running', completed: 'agent.research.step.deletePacking.completed', failed: 'agent.research.step.deletePacking.failed' },
      add_gear: { running: 'agent.research.step.addGear.running', completed: 'agent.research.step.addGear.completed', failed: 'agent.research.step.addGear.failed' },
    };
    const keys = stepKeys[activity.toolName];
    return keys ? [{ key, status: activity.status, text: t(keys[activity.status]) }] : [];
  });
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

function ResearchActivity({ theme, activities, running }: { theme: Theme; activities: AgentRunActivity[]; running: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(running);
  const steps = researchSteps(activities, t);
  const visibleSteps = steps.length ? steps : [{ key: 'preparing', status: 'running' as const, text: t('agent.research.preparing') }];
  return (
    <View style={styles.researchProgress}>
      <Press
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.researchHeader}
      >
        {running ? <ActivityIndicator size="small" color={theme.text} /> : <CheckCircle2 size={18} color={theme.text2} strokeWidth={2} />}
        <Text style={[styles.researchTitle, { color: theme.text }]}>{t(running ? 'agent.research.title' : 'agent.research.completed')}</Text>
        {expanded ? <ChevronUp size={17} color={theme.text3} /> : <ChevronDown size={17} color={theme.text3} />}
      </Press>
      {expanded ? visibleSteps.map((step) => (
        <View key={step.key} style={styles.researchLine}>
          {step.status === 'running'
            ? <Clock3 size={14} color={theme.text3} strokeWidth={2} />
            : step.status === 'completed'
            ? <Check size={14} color={theme.text3} strokeWidth={2} />
            : <X size={14} color={theme.text3} strokeWidth={2} />}
          <Text style={[styles.researchLineText, { color: theme.text2 }]}>{step.text}</Text>
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
        {sources.map((source) => (
          <Press
            key={source.url}
            onPress={() => void Linking.openURL(source.url)}
            accessibilityRole="link"
            accessibilityLabel={source.title}
            style={[styles.sourceCard, { backgroundColor: theme.fieldSurface, borderColor: theme.hairline }]}
          >
            <View style={styles.sourceTop}>
              <Globe2 size={15} color={theme.text3} strokeWidth={1.8} />
              <Text numberOfLines={1} style={[styles.sourceHost, { color: theme.text3 }]}>{sourceHost(source.url)}</Text>
              <ArrowUpRight size={14} color={theme.text3} strokeWidth={1.8} />
            </View>
            <Text numberOfLines={2} style={[styles.sourceTitle, { color: theme.text }]}>{source.title}</Text>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}

function PlanPreviewCard({ theme, preview, openLabel, onOpen }: { theme: Theme; preview: AgentPlanPreview; openLabel: string; onOpen: () => void }) {
  const { resolved } = useI18n();
  return (
    <View style={[styles.planPreview, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }] }>
      <Text style={[styles.planTitle, { color: theme.text }]}>{preview.title}</Text>
      {preview.dateLabel ? <Text style={[styles.planMeta, { color: theme.text3 }]}>{preview.dateLabel}</Text> : null}
      <View style={styles.planDays}>
        {preview.days.slice(0, 7).map((day, index) => (
          <View key={`${day.label}_${index}`} style={[styles.planDay, index > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }] }>
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
      <Press onPress={onOpen} accessibilityRole="button" style={[styles.openPlan, { borderColor: theme.fieldBorder }] }>
        <ArrowUpRight size={18} color={theme.text} strokeWidth={2} />
        <Text style={[styles.openPlanText, { color: theme.text }]}>{openLabel}</Text>
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

function historyTurns(history: AgentHistoryResponse, approvalIntro: string): Turn[] {
  const restored: Turn[] = history.messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.content,
    quickReplies: message.ui?.quickReplies,
    sources: message.ui?.sources,
    planPreview: message.ui?.planPreview,
    activities: message.ui?.activities,
  }));
  if (history.pendingRun) {
    restored.push({
      id: `pending_${history.pendingRun.id}`,
      role: 'assistant',
      text: approvalIntro,
      runId: history.pendingRun.id,
      approvals: history.pendingRun.pending_approvals || [],
    });
  }
  return restored;
}

function synchronizedTurnFingerprint(turns: Turn[]) {
  return JSON.stringify(turns.map(({ role, text, quickReplies, approvals, sources, planPreview, activities }) => ({
    role, text, quickReplies, approvals, sources, planPreview, activities,
  })));
}

async function resolveCurrentJourneyApprovals(response: AgentTurnResponse, journeyId?: string) {
  if (!journeyId) return { response, executed: false };
  let next = response;
  let executed = false;
  for (let round = 0; round < 4 && next.status === 'pending_approval' && next.approvals?.length; round += 1) {
    const approvals = next.approvals;
    const writesCurrentJourney = approvals.every((approval) =>
      (approval.toolName === 'add_itinerary_items' || approval.toolName === 'set_itinerary_group_endpoints' || approval.toolName === 'add_packing_items')
      && approval.arguments.journeyId === journeyId
    );
    if (!writesCurrentJourney) break;
    executed = true;
    next = await resolveAgentRun({
      runId: next.runId,
      currentJourneyId: journeyId,
      decisions: approvals.map((approval) => ({ callId: approval.callId, approved: true })),
    });
  }
  return { response: next, executed };
}

export function AppAssistant({ theme, visible, initialPrompt, currentJourneyId, onClose, onClearPrompt }: {
  theme: Theme;
  visible: boolean;
  initialPrompt?: string;
  currentJourneyId?: string;
  onClose: () => void;
  onClearPrompt: () => void;
}) {
  const { resolved, t } = useI18n();
  const data = useData();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string>();
  const [threadTitle, setThreadTitle] = useState('');
  const [threadJourneyId, setThreadJourneyId] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [runActivities, setRunActivities] = useState<AgentRunActivity[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [resolvingRunId, setResolvingRunId] = useState<string>();
  const [copiedTurnId, setCopiedTurnId] = useState<string>();
  const [selectedApprovals, setSelectedApprovals] = useState<Set<string>>(new Set());
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [deletingThreadId, setDeletingThreadId] = useState<string>();
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const showSpeechError = (error: SpeechRecognitionInputError) => {
    if (error === 'no-speech') return;
    Alert.alert(t(
      error === 'permission-denied'
        ? 'agent.voicePermissionDenied'
        : error === 'unavailable'
        ? 'agent.voiceUnavailable'
        : 'agent.voiceError',
    ));
  };
  const speech = useSpeechRecognitionInput({
    locale: resolved,
    value: input,
    onChange: setInput,
    onError: showSpeechError,
  });
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
  const planStarterReplies = useMemo<AgentQuickReply[]>(() => [
    { label: t('agent.planQuickReply.sanya'), message: t('agent.planQuickReply.sanyaMessage') },
    { label: t('agent.planQuickReply.beijing'), message: t('agent.planQuickReply.beijingMessage') },
    { label: t('agent.planQuickReply.yunnan'), message: t('agent.planQuickReply.yunnanMessage') },
  ], [t]);

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
        if (active) setRunActivities(result.activities);
      } catch {
        // Older deployments do not expose run activity; keep the generic state.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 850);
    return () => { active = false; clearInterval(timer); };
  }, [activeRunId, visible]);

  useEffect(() => {
    if (!visible) {
      speech.abort();
      return;
    }
    let active = true;
    setRestoring(true);
    setThreadId(undefined);
    setThreadTitle('');
    setThreadJourneyId(currentJourneyId);
    setTurns([]);
    setSelectedApprovals(new Set());
    setInput('');
    const key = storageKey(data.userId, currentJourneyId);
    const restore = async () => {
      try {
        let savedThreadId: string | undefined;
        if (currentJourneyId) {
          try {
            const result = await getJourneyAgentThread(currentJourneyId);
            savedThreadId = result.threadId || undefined;
          } catch {
            // Keep compatibility while an older app-agent function is still deployed.
            const result = await getAgentThreads();
            savedThreadId = result.threads.find((thread) => thread.current_journey_id === currentJourneyId)?.id;
          }
        } else {
          savedThreadId = (await AsyncStorage.getItem(key)) || undefined;
        }
        if (!active) return;
        if (!savedThreadId) {
          if (initialPrompt) setInput(initialPrompt);
          return;
        }
        const history = await getAgentHistory(savedThreadId);
        if (!active) return;
        const restoredJourneyId = currentJourneyId || history.thread.current_journey_id || undefined;
        setThreadJourneyId(restoredJourneyId);
        const restored: Turn[] = history.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          quickReplies: message.ui?.quickReplies,
          sources: message.ui?.sources,
          planPreview: message.ui?.planPreview,
          activities: message.ui?.activities,
        }));
        if (history.pendingRun) {
          const approvals = history.pendingRun.pending_approvals || [];
          const applied = await resolveCurrentJourneyApprovals({
            threadId: savedThreadId,
            runId: history.pendingRun.id,
            status: 'pending_approval',
            approvals,
          }, restoredJourneyId);
          if (applied.executed) await refetchWrittenJourney(restoredJourneyId);
          if (applied.response.status === 'pending_approval') {
            const remaining = applied.response.approvals || [];
            restored.push({ id: `pending_${applied.response.runId}`, role: 'assistant', text: t('agent.approvalIntro'), runId: applied.response.runId, approvals: remaining });
            setSelectedApprovals(new Set(remaining.map((approval) => approval.callId)));
          } else {
            restored.push({ id: `a_${Date.now()}`, role: 'assistant', text: applied.response.message || t('agent.executed'), quickReplies: applied.response.quickReplies, sources: applied.response.ui?.sources, planPreview: applied.response.ui?.planPreview, activities: applied.response.ui?.activities });
          }
        }
        if (!active) return;
        setThreadId(savedThreadId);
        setThreadTitle(history.thread.title);
        setTurns(restored);
        await AsyncStorage.setItem(key, savedThreadId);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
      } catch (error) {
        console.warn('[AppAgent] history restore failed', error);
        void AsyncStorage.removeItem(key);
        if (active) {
          setThreadId(undefined);
          setThreadTitle('');
          setTurns([]);
          if (initialPrompt) setInput(initialPrompt);
        }
      } finally {
        if (initialPrompt) onClearPrompt();
        if (active) setRestoring(false);
      }
    };
    void restore();
    return () => { active = false; };
  }, [currentJourneyId, data.userId, t, visible]);

  useEffect(() => {
    if (!visible || !threadId || loading || resolvingRunId || restoring) return;
    let active = true;
    const syncHistory = async () => {
      try {
        if (currentJourneyId) {
          const currentThread = await getJourneyAgentThread(currentJourneyId);
          if (!active) return;
          if (currentThread.threadId && currentThread.threadId !== threadId) {
            setThreadId(currentThread.threadId);
            return;
          }
        }
        const history = await getAgentHistory(threadId);
        if (!active) return;
        const synchronized = historyTurns(history, t('agent.approvalIntro'));
        setTurns((current) => (
          synchronizedTurnFingerprint(current) === synchronizedTurnFingerprint(synchronized)
            ? current
            : synchronized
        ));
        setThreadTitle(history.thread.title);
        if (history.pendingRun) {
          const nextSelected = history.pendingRun.pending_approvals.filter((approval) => !approval.destructive).map((approval) => approval.callId);
          setSelectedApprovals((current) => (
            current.size === nextSelected.length && nextSelected.every((callId) => current.has(callId))
              ? current
              : new Set(nextSelected)
          ));
        } else {
          setSelectedApprovals((current) => current.size ? new Set() : current);
        }
      } catch (error) {
        console.warn('[AppAgent] history sync failed', error);
      }
    };
    void syncHistory();
    const timer = setInterval(() => void syncHistory(), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [currentJourneyId, loading, resolvingRunId, restoring, t, threadId, visible]);

  const appendResponse = (response: AgentTurnResponse, createdThreadTitle?: string) => {
    setThreadId(response.threadId);
    if (createdThreadTitle) setThreadTitle(createdThreadTitle);
    void AsyncStorage.setItem(storageKey(data.userId, currentJourneyId), response.threadId);
    if (response.status === 'pending_approval') {
      const approvals = response.approvals || [];
      setSelectedApprovals(new Set(approvals.filter((approval) => !approval.destructive).map((approval) => approval.callId)));
      setTurns((current) => [...current, { id: `pending_${response.runId}_${Date.now()}`, role: 'assistant', text: t('agent.approvalIntro'), runId: response.runId, approvals, sources: response.ui?.sources, planPreview: response.ui?.planPreview, activities: response.ui?.activities }]);
    } else {
      setTurns((current) => [...current, { id: `a_${Date.now()}`, role: 'assistant', text: response.message || t('agent.executed'), quickReplies: response.quickReplies, sources: response.ui?.sources, planPreview: response.ui?.planPreview, activities: response.ui?.activities }]);
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const submit = async (preset?: string, intent?: AgentIntent) => {
    const message = (preset ?? input).trim();
    if (!message || loading || resolvingRunId) return;
    setTurns((current) => [...current, { id: `u_${Date.now()}`, role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    const clientRunId = createRunId();
    setActiveRunId(clientRunId);
    setRunActivities([]);
    try {
      const creatingThread = !threadId;
      const response = await sendAgentTurn({ message, threadId, currentJourneyId: activeJourneyId, intent, locale: resolved, clientRunId });
      const applied = await resolveCurrentJourneyApprovals(response, activeJourneyId);
      if (applied.executed) await refetchWrittenJourney();
      appendResponse(applied.response, creatingThread ? message.slice(0, 36) : undefined);
    } catch (error) {
      console.warn('[AppAgent] turn failed', error);
      setTurns((current) => [...current, { id: `e_${Date.now()}`, role: 'assistant', text: t('agent.error') }]);
    } finally {
      setLoading(false);
      setActiveRunId(undefined);
    }
  };

  const resolve = async (turn: Turn, rejectAll = false) => {
    if (!turn.runId || !turn.approvals?.length || resolvingRunId) return;
    setResolvingRunId(turn.runId);
    try {
      const decisions = turn.approvals.map((approval) => ({ callId: approval.callId, approved: !rejectAll && selectedApprovals.has(approval.callId) }));
      const response = await resolveAgentRun({ runId: turn.runId, decisions, currentJourneyId: activeJourneyId });
      setTurns((current) => current.filter((item) => item.id !== turn.id));
      await refetchWrittenJourney();
      appendResponse(response);
    } catch (error) {
      console.warn('[AppAgent] approval failed', error);
      setTurns((current) => [...current, { id: `e_${Date.now()}`, role: 'assistant', text: t('agent.executeError') }]);
    } finally {
      setResolvingRunId(undefined);
    }
  };

  const newChat = () => {
    setThreadId(undefined);
    setThreadTitle('');
    setThreadJourneyId(currentJourneyId);
    setTurns([]);
    setSelectedApprovals(new Set());
    setInput('');
    setThreadSheetOpen(false);
    void AsyncStorage.removeItem(storageKey(data.userId, currentJourneyId));
  };

  const openMenu = async () => {
    setThreadSheetOpen(true);
    setThreadsLoading(true);
    try {
      const result = await getAgentThreads();
      setThreads(currentJourneyId
        ? result.threads.filter((thread) => thread.current_journey_id === currentJourneyId).slice(0, 1)
        : result.threads);
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
      const restored: Turn[] = history.messages.map((message) => ({ id: message.id, role: message.role, text: message.content, quickReplies: message.ui?.quickReplies, sources: message.ui?.sources, planPreview: message.ui?.planPreview, activities: message.ui?.activities }));
      if (history.pendingRun) {
        const approvals = history.pendingRun.pending_approvals || [];
        restored.push({ id: `pending_${history.pendingRun.id}`, role: 'assistant', text: t('agent.approvalIntro'), runId: history.pendingRun.id, approvals });
        setSelectedApprovals(new Set(approvals.filter((approval) => !approval.destructive).map((approval) => approval.callId)));
      } else {
        setSelectedApprovals(new Set());
      }
      setThreadId(thread.id);
      setThreadTitle(history.thread.title);
      setThreadJourneyId(currentJourneyId || history.thread.current_journey_id || thread.current_journey_id || undefined);
      setTurns(restored);
      setInput('');
      await AsyncStorage.setItem(storageKey(data.userId, currentJourneyId), thread.id);
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
        setSelectedApprovals(new Set());
        setInput('');
        await AsyncStorage.removeItem(storageKey(data.userId, currentJourneyId));
      }
    } catch (error) {
      console.warn('[AppAgent] thread delete failed', error);
      Alert.alert(t('agent.deleteFailed'));
    } finally {
      setDeletingThreadId(undefined);
    }
  };

  const confirmDeleteThread = (thread: AgentThreadSummary, close: () => void) => {
    close();
    Alert.alert(t('agent.deleteConversation'), t('agent.deleteConversationBody', { title: thread.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void deleteThread(thread.id) },
    ]);
  };

  const threadAge = (date: string) => {
    const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
    return days === 0 ? t('agent.today') : t('agent.daysAgo', { count: days });
  };

  const openAddMenu = () => {
    const usePrompt = (prompt: string) => {
      setInput(prompt);
      setTimeout(() => inputRef.current?.focus(), 80);
    };
    Alert.alert(t('agent.addContext'), undefined, [
      { text: t('agent.suggestion.plan'), onPress: () => usePrompt(t('agent.suggestion.plan')) },
      { text: t('agent.suggestion.gear'), onPress: () => usePrompt(t('agent.suggestion.gear')) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const toggleApproval = (callId: string) => {
    setSelectedApprovals((current) => {
      const next = new Set(current);
      if (next.has(callId)) next.delete(callId); else next.add(callId);
      return next;
    });
  };

  const copyTurn = async (turn: Turn) => {
    await Clipboard.setStringAsync(turn.text);
    setCopiedTurnId(turn.id);
    setTimeout(() => setCopiedTurnId((current) => current === turn.id ? undefined : current), 1600);
  };

  const quickRepliesForTurn = (turn: Turn, index: number) => {
    if (turn.quickReplies?.length) return turn.quickReplies;
    const isPlanStarter = index === turns.length - 1
      && turns.length <= 2
      && turn.role === 'assistant'
      && threadTitle === t('agent.suggestion.plan');
    return isPlanStarter ? planStarterReplies : [];
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.featureSurface }]}
        behavior="padding"
        automaticOffset
      >
        <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[styles.headerButton, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
            <X size={23} color={theme.text} strokeWidth={2.2} />
          </Press>
          {currentJourney || (threadId && threadTitle) ? (
            <View pointerEvents="none" style={[styles.activeThreadTitleWrap, currentJourney && styles.journeyTitleWrap, currentJourney && { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
              <Text numberOfLines={1} style={[styles.activeThreadTitle, { color: theme.text }]}>{currentJourney?.name || threadTitle}</Text>
            </View>
          ) : null}
          <Press onPress={openMenu} accessibilityRole="button" accessibilityLabel={t('agent.menu')} style={[styles.headerButton, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
            <Menu size={24} color={theme.text} strokeWidth={1.8} />
          </Press>
        </View>

        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, turns.length === 0 && (currentJourney ? styles.journeyEmptyContent : styles.emptyContent)]}>
          {restoring ? <View style={styles.center}><ActivityIndicator color={theme.accent} /></View> : turns.length === 0 ? (
            currentJourney ? (
              <View style={styles.journeySuggestions}>
                {journeySuggestions.map((suggestion) => {
                  const SuggestionIcon = suggestion.icon;
                  return <Press key={suggestion.text} accessibilityRole="button" onPress={() => void submit(suggestion.text)} style={[styles.journeySuggestion, { backgroundColor: theme.fieldSurface, borderColor: theme.hairline }]}>
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
                    return <Press key={suggestion.text} onPress={() => void submit(suggestion.text, suggestion.intent)} style={[styles.suggestion, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
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
                turn.approvals?.length ? styles.approvalIntroBubble : null,
                { backgroundColor: turn.approvals?.length ? 'transparent' : turn.role === 'user' ? theme.accentSoft : theme.fieldSurface },
              ]}>
                <SelectableMessageText text={turn.text} theme={theme} />
              </View>
              {quickRepliesForTurn(turn, turnIndex).length ? (
                <View style={styles.quickReplies}>
                  {quickRepliesForTurn(turn, turnIndex).map((reply) => (
                    <Press
                      key={`${turn.id}_${reply.message}`}
                      disabled={loading || Boolean(resolvingRunId)}
                      onPress={() => void submit(reply.message)}
                      style={[styles.quickReply, { backgroundColor: theme.accentSofter, borderColor: theme.accentSoft }]}
                    >
                      <Text style={[styles.quickReplyText, { color: theme.text }]}>{reply.label}</Text>
                    </Press>
                  ))}
                </View>
              ) : null}
              {turn.sources?.length ? <SourcesStrip theme={theme} sources={turn.sources} title={t('agent.sources')} /> : null}
              {turn.planPreview ? <PlanPreviewCard theme={theme} preview={turn.planPreview} openLabel={t('agent.openPlan')} onOpen={onClose} /> : null}
              {turn.approvals?.length ? (
                <View style={[styles.proposal, { backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]}>
                  <Text style={[styles.proposalTitle, { color: theme.text }]}>{t('agent.proposal')}</Text>
                  <View style={styles.actionList}>
                    {turn.approvals.map((approval, index) => {
                      const selected = selectedApprovals.has(approval.callId);
                      return (
                        <Press
                          key={approval.callId}
                          onPress={() => toggleApproval(approval.callId)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          style={[
                            styles.actionRow,
                            index > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth },
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[type.cardTitle, { color: approval.destructive ? theme.danger : theme.text }]}>{approval.title}</Text>
                            <Text style={[styles.actionDetail, { color: theme.text2 }]}>{approval.detail}</Text>
                          </View>
                          <View style={[styles.checkbox, { backgroundColor: selected ? theme.text : 'transparent', borderColor: selected ? theme.text : theme.text3 }]}>
                            {selected ? <Check size={14} color={theme.featureSurface} strokeWidth={3} /> : null}
                          </View>
                        </Press>
                      );
                    })}
                  </View>
                  <Press
                    disabled={resolvingRunId === turn.runId || selectedApprovals.size === 0}
                    onPress={() => void resolve(turn)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: resolvingRunId === turn.runId || selectedApprovals.size === 0 }}
                    style={[styles.execute, { backgroundColor: selectedApprovals.size ? theme.text : theme.fieldSurface }]}
                  >
                    {resolvingRunId === turn.runId ? <ActivityIndicator color={theme.featureSurface} /> : null}
                    <Text style={[styles.executeText, { color: selectedApprovals.size ? theme.featureSurface : theme.text3 }]}>
                      {t('agent.confirmSelected', { count: selectedApprovals.size })}
                    </Text>
                  </Press>
                  <Press disabled={resolvingRunId === turn.runId} onPress={() => void resolve(turn, true)} style={styles.reject}>
                    <Text style={[type.body, { color: theme.text2, fontWeight: '700' }]}>{t('agent.rejectAll')}</Text>
                  </Press>
                </View>
              ) : null}
              {turn.role === 'assistant' ? (
                <Press
                  onPress={() => void copyTurn(turn)}
                  accessibilityRole="button"
                  accessibilityLabel={t(copiedTurnId === turn.id ? 'agent.copied' : 'agent.copy')}
                  style={styles.copyAction}
                >
                  {copiedTurnId === turn.id ? <Check size={15} color={theme.text3} /> : <Copy size={15} color={theme.text3} />}
                  <Text style={[styles.copyText, { color: theme.text3 }]}>{t(copiedTurnId === turn.id ? 'agent.copied' : 'agent.copy')}</Text>
                </Press>
              ) : null}
            </View>
          ))}
          {loading ? <ResearchActivity theme={theme} activities={runActivities} running /> : null}
        </ScrollView>

        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, space.sm), backgroundColor: theme.featureSurface }]}>
          <View style={[styles.composer, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
            <Press onPress={openAddMenu} accessibilityRole="button" accessibilityLabel={t('agent.addContext')} style={styles.composerAction}>
              <Plus size={27} color={theme.text} strokeWidth={1.8} />
            </Press>
            <TextInput ref={inputRef} value={input} onChangeText={setInput} placeholder={t(speech.isListening ? 'agent.voiceListening' : 'agent.placeholder')} placeholderTextColor={theme.text3} multiline maxLength={1000} style={[styles.input, { color: theme.text }]} onSubmitEditing={() => void submit()} blurOnSubmit={false} />
            <Press
              disabled={loading || Boolean(resolvingRunId)}
              accessibilityLabel={speech.isListening ? t('agent.stopVoiceInput') : input.trim() ? t('agent.send') : t('agent.voiceInput')}
              accessibilityState={{ disabled: loading || Boolean(resolvingRunId), selected: speech.isListening }}
              onPress={speech.isListening ? speech.stop : input.trim() ? () => void submit() : () => void speech.start()}
              style={[styles.composerAction, (input.trim() || speech.isListening) && { backgroundColor: theme.accent }]}
            >
              {speech.isListening
                ? <Square size={16} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
                : input.trim()
                ? <ArrowUp size={19} color="#FFFFFF" strokeWidth={2.4} />
                : <Mic size={24} color={theme.text} strokeWidth={1.9} />}
            </Press>
          </View>
          <Text style={[styles.generatedNotice, { color: theme.text3 }]}>{t('agent.disclaimer')}</Text>
        </View>

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
                      <ReanimatedSwipeable
                        key={thread.id}
                        friction={1.8}
                        rightThreshold={36}
                        overshootRight={false}
                        containerStyle={[styles.threadSwipe, { backgroundColor: theme.featureSurface }]}
                        renderRightActions={(_progress, _translation, methods) => (
                          <View style={[styles.threadSwipeActions, { backgroundColor: theme.featureSurface }]}>
                            <Press
                              accessibilityRole="button"
                              accessibilityLabel={t('agent.openConversation')}
                              onPress={() => {
                                methods.close();
                                void selectThread(thread);
                              }}
                              style={styles.threadSwipeAction}
                            >
                              <Clock3 size={28} color={theme.text} strokeWidth={2.1} />
                            </Press>
                            <Press
                              disabled={Boolean(deletingThreadId)}
                              accessibilityRole="button"
                              accessibilityLabel={t('agent.deleteConversation')}
                              onPress={() => confirmDeleteThread(thread, methods.close)}
                              style={styles.threadSwipeAction}
                            >
                              {deletingThreadId === thread.id ? <ActivityIndicator color={theme.danger} /> : <Trash2 size={28} color={theme.danger} strokeWidth={2.1} />}
                            </Press>
                          </View>
                        )}
                      >
                        <Press onPress={() => void selectThread(thread)} style={[styles.threadCard, { backgroundColor: theme.accentSofter, borderColor: thread.id === threadId ? theme.accentSoft : theme.hairline }]}>
                          {photoUri ? <Image source={{ uri: photoUri }} contentFit="cover" style={styles.threadCover} /> : null}
                          <View style={[styles.threadCopy, photoUri && styles.threadCopyWithCover]}>
                            <Text style={[styles.threadCardTitle, { color: theme.text }]} numberOfLines={2}>{thread.title}</Text>
                            <View style={styles.threadMeta}>
                              <Text style={[styles.threadMetaText, { color: theme.text3 }]}>{threadAge(thread.updated_at)}</Text>
                              <Text style={[styles.threadMetaText, { color: theme.text2 }]}>{journey?.name || t('agent.conversationLabel')}</Text>
                            </View>
                          </View>
                        </Press>
                      </ReanimatedSwipeable>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.threadLoading}><Text style={[type.body, { color: theme.text3 }]}>{t('agent.noConversations')}</Text></View>
              )}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 94, paddingHorizontal: space.lg, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 7px 20px rgba(0,0,0,0.07)' },
  activeThreadTitleWrap: { position: 'absolute', left: 76, right: 76, bottom: space.sm, height: 44, justifyContent: 'center', alignItems: 'center' },
  journeyTitleWrap: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md },
  activeThreadTitle: { maxWidth: '100%', fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: 0, textAlign: 'center' },
  content: { flexGrow: 1, paddingHorizontal: layout.pagePadding, paddingTop: space.md, paddingBottom: space.xxl },
  emptyContent: { justifyContent: 'flex-end', paddingBottom: 58 },
  journeyEmptyContent: { justifyContent: 'flex-start', paddingTop: space.lg },
  center: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center' },
  welcome: { alignItems: 'flex-start' },
  heroMark: { height: 20, justifyContent: 'center', marginBottom: space.lg },
  welcomeTitle: { fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: 0 },
  welcomeBody: { maxWidth: 350, fontSize: 19, lineHeight: 27, fontWeight: '700', letterSpacing: 0 },
  suggestions: { alignItems: 'flex-start', gap: space.xs, marginTop: space.lg },
  suggestion: { width: 248, height: 50, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs, boxShadow: '0px 8px 22px rgba(0,0,0,0.06)' },
  suggestionText: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: '500', letterSpacing: 0 },
  journeySuggestions: { alignItems: 'stretch', gap: space.sm },
  journeySuggestion: { minHeight: 52, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  journeySuggestionText: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, fontWeight: '500', letterSpacing: 0 },
  userRow: { alignItems: 'flex-end', marginBottom: space.lg },
  assistantRow: { alignItems: 'stretch', marginBottom: space.xl },
  userBubble: { maxWidth: '84%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card },
  assistantBubble: { alignSelf: 'flex-start', maxWidth: '94%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card },
  messageMeasure: { opacity: 0 },
  messageInput: { padding: 0, textAlignVertical: 'top' },
  approvalIntroBubble: { maxWidth: '100%', paddingHorizontal: 0, paddingVertical: 0, borderRadius: 0 },
  quickReplies: { alignItems: 'flex-start', gap: space.xs, marginTop: space.sm },
  quickReply: { minHeight: 44, maxWidth: '92%', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  quickReplyText: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0 },
  sourcesWrap: { marginTop: space.md, marginHorizontal: -layout.pagePadding },
  supportLabel: { paddingHorizontal: layout.pagePadding, marginBottom: space.xs, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  sourcesContent: { paddingHorizontal: layout.pagePadding, gap: space.xs },
  sourceCard: { width: 220, height: 94, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: space.sm, justifyContent: 'space-between' },
  sourceTop: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  sourceHost: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 15, letterSpacing: 0 },
  sourceTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  planPreview: { marginTop: space.lg, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, padding: space.md, boxShadow: '0px 12px 32px rgba(0,0,0,0.07)' },
  planTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: 0 },
  planMeta: { marginTop: space.xxs, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  planDays: { marginTop: space.md },
  planDay: { paddingVertical: space.sm },
  planDayTitle: { fontSize: 15.5, lineHeight: 21, fontWeight: '800', letterSpacing: 0 },
  planItem: { marginTop: space.xs, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  planTime: { width: 78, fontSize: 12, lineHeight: 18, fontWeight: '600', letterSpacing: 0 },
  planItemText: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 19, letterSpacing: 0 },
  openPlan: { alignSelf: 'flex-start', minHeight: 42, marginTop: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  openPlanText: { fontSize: 14, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  copyAction: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xxs, marginTop: space.xs },
  copyText: { fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  proposal: { marginTop: space.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.feature, padding: space.md, boxShadow: '0px 12px 32px rgba(0,0,0,0.08)' },
  proposalTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: 0 },
  actionList: { marginTop: space.sm },
  actionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  actionDetail: { marginTop: space.xxs, fontSize: 12.5, lineHeight: 17, letterSpacing: 0 },
  checkbox: { width: 24, height: 24, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  execute: { height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, marginTop: space.md },
  executeText: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: 0 },
  reject: { height: 42, alignItems: 'center', justifyContent: 'center', marginTop: space.xxs },
  researchProgress: { alignSelf: 'stretch', marginBottom: space.xl, paddingVertical: space.sm },
  researchHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  researchTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: 0 },
  researchLine: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  researchLineText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 18, letterSpacing: 0 },
  composerWrap: { paddingHorizontal: space.xxl, paddingTop: space.sm },
  composer: { minHeight: 56, maxHeight: 124, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.xs, paddingVertical: space.xs, boxShadow: '0px 12px 30px rgba(0,0,0,0.08)' },
  composerAction: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 40, maxHeight: 108, fontSize: 15, lineHeight: 20, paddingHorizontal: space.xs, paddingTop: 10, paddingBottom: 8 },
  generatedNotice: { textAlign: 'center', marginTop: space.sm, fontSize: 11, lineHeight: 14, letterSpacing: 0 },
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
  threadCard: { height: 96, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
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
