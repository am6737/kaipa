// Deterministic save stage: a validated PlanDocument is executed against the
// same scoped tools the interactive agent calls, so authorization asserts,
// receipt replay, version-checked transactions and undo payloads all keep
// working unchanged. No model is involved here.
import {
  addItineraryParams, createJourneyParams, errorText, runAddItinerary, runCreateJourney, runSetItineraryGroupEndpoints,
  runSetJourneyMapLocation, runUpdateJourneySchedule, setItineraryGroupEndpointsParams, setJourneyMapLocationParams,
  updateJourneyScheduleParams,
} from './tools.ts';
import { readJourneySections } from './context.ts';
import { saveOperations, type PlanDocument, type SaveToolName } from './plan-document.ts';
import type { AgentContext } from './types.ts';
import { journeyDayOrdinal } from './journey-days.ts';
import type { WriteOperation } from './task.ts';

type Client = any;
type RunContext = { context: AgentContext };

// The journey every save operation in a run addresses: the one the task bound
// or created, whichever exists.
export function boundJourneyId(context: AgentContext) {
  return context.currentJourneyId || context.task?.journeyId || null;
}

// The runner parses a tool's arguments and then calls its execute function; the
// tool object only exposes the JSON-schema `invoke`, which turns thrown
// failures into model-visible strings. The save stage needs the real error, so
// the schema and function are paired here instead.
type DirectTool = { parameters: { parse: (value: unknown) => unknown }; run: (args: never, runContext?: RunContext) => Promise<unknown> };

const saveTools: Record<SaveToolName, DirectTool> = {
  create_journey: { parameters: createJourneyParams, run: runCreateJourney },
  update_journey_schedule: { parameters: updateJourneyScheduleParams, run: runUpdateJourneySchedule },
  add_itinerary_items: { parameters: addItineraryParams, run: runAddItinerary },
  set_itinerary_group_endpoints: { parameters: setItineraryGroupEndpointsParams, run: runSetItineraryGroupEndpoints },
  set_journey_map_location: { parameters: setJourneyMapLocationParams, run: runSetJourneyMapLocation },
};

export type SaveArtifact = {
  journeyId: string | null;
  saved: Array<{ tool: string; output?: unknown }>;
  skipped: Array<{ tool: string; reason: string }>;
  failed: Array<{ tool: string; error: string }>;
  /** Requested deliverables already present, with no write needed. */
  satisfied?: WriteOperation[];
  /** True when a second, repaired pass produced this result. */
  repaired?: boolean;
};

// Sections the version-checked write transaction compares before applying.
const WRITE_SECTIONS = ['journey', 'track', 'itinerary'] as const;

// A tool call is replayed from its own receipt when the arguments hash matches
// a completed call, so a retried or repaired save never duplicates a write.
export async function runSaveStage(client: Client, context: AgentContext, plan: PlanDocument): Promise<SaveArtifact> {
  const runContext = { context } as RunContext;
  const artifact: SaveArtifact = { journeyId: boundJourneyId(context), saved: [], skipped: [], failed: [] };
  const authorized = context.task?.decision.operations || [];
  const operations = saveOperations(plan);

  // Creation runs first: every other operation needs the journey it returns.
  const creation = operations.find(operation => operation.tool === 'create_journey');
  if (!creation && !boundJourneyId(context)) {
    // A full plan that carries no journey and no bound one saves nothing
    // silently; log what the planner recorded instead so a silent skip is
    // diagnosable from the function logs.
    console.warn('[AppAgent] save stage has no journey to write to', JSON.stringify({ blocker: plan.blocker, pendingQuestion: plan.pendingQuestion, itineraryItems: plan.itineraryItems.length }));
  }
  if (creation) {
    if (!authorized.includes('create_journey')) {
      artifact.skipped.push({ tool: creation.tool, reason: 'unauthorized' });
    } else {
      const outcome = await execute(creation.tool, creation.args, runContext);
      if (outcome.error) {
        console.warn('[AppAgent] journey creation failed', outcome.error.slice(0, 300));
        artifact.failed.push({ tool: creation.tool, error: outcome.error });
        for (const operation of operations) {
          if (operation.tool !== 'create_journey') artifact.skipped.push({ tool: operation.tool, reason: 'journey_create_failed' });
        }
        return artifact;
      }
      artifact.saved.push({ tool: creation.tool, output: outcome.output });
      // Creation binds the run context, so this reads the new journey's id;
      // the initial value already came from the same operands.
      artifact.journeyId = boundJourneyId(context);
    }
  }

  const journeyId = boundJourneyId(context);
  const pending = operations.filter(operation => operation.tool !== 'create_journey');
  const created = artifact.saved.some(entry => entry.tool === 'create_journey');
  const checkSchedule = authorized.includes('update_journey_schedule')
    && context.task?.decision.requiredOperations.includes('update_journey_schedule');
  // New plans already name their intended days. Save the groups before a
  // schedule operation, which must address the groups that actually exist.
  if (created) pending.sort((a, b) => Number(b.tool === 'add_itinerary_items') - Number(a.tool === 'add_itinerary_items'));
  if (!pending.length && !checkSchedule) return artifact;
  if (!journeyId) {
    for (const operation of pending) artifact.skipped.push({ tool: operation.tool, reason: 'no_journey' });
    return artifact;
  }

  // A journey created in this run has no verified snapshot yet; the write
  // transaction requires one for every dependency section.
  let currentSections: Record<string, unknown>;
  try {
    currentSections = await readJourneySections(client, context, journeyId, [...WRITE_SECTIONS]);
  } catch (error) {
    const message = errorText(error);
    for (const operation of pending) artifact.skipped.push({ tool: operation.tool, reason: `context_unavailable: ${message}` });
    return artifact;
  }

  // The app can bind an empty journey before asking the planner. It needs
  // the same group-first layout as a journey created by this run; existing
  // groups still require schedule moves before adding the new items.
  const initialLayout = created || (scheduleDayNames(currentSections).length === 0
    && pending.some(operation => operation.tool === 'add_itinerary_items')
    && authorized.includes('add_itinerary_items'));
  if (initialLayout) pending.sort((a, b) => Number(b.tool === 'add_itinerary_items') - Number(a.tool === 'add_itinerary_items'));

  let itineraryFailed = false;
  for (const operation of pending) {
    if (!authorized.includes(operation.tool)) {
      artifact.skipped.push({ tool: operation.tool, reason: 'unauthorized' });
      continue;
    }
    // Endpoints address the day groups the itinerary write creates.
    if (operation.tool === 'set_itinerary_group_endpoints' && itineraryFailed) {
      artifact.skipped.push({ tool: operation.tool, reason: 'itinerary_failed' });
      continue;
    }
    const args: Record<string, unknown> = { journeyId, ...operation.args };
    if (operation.tool === 'update_journey_schedule') {
      if (initialLayout) {
        if (itineraryFailed) {
          artifact.skipped.push({ tool: operation.tool, reason: 'itinerary_failed' });
          continue;
        }
        try {
          currentSections = await readJourneySections(client, context, journeyId, [...WRITE_SECTIONS]);
        } catch (error) {
          artifact.failed.push({ tool: operation.tool, error: errorText(error) });
          continue;
        }
        // Creation and item writes already apply the candidate's day layout;
        // the model's assignments refer to a pre-save outline, not old groups.
        args.dayAssignments = scheduleDayNames(currentSections).map(from => ({ from, toDay: journeyDayOrdinal(from) }));
        if (scheduleMatchesJourney(plan.schedule!, currentSections)) {
          (artifact.satisfied ??= []).push('update_journey_schedule');
          continue;
        }
      }
      normalizeScheduleAssignments(args, currentSections);
    }
    let outcome = await execute(operation.tool, args, runContext);
    // A model may summarize a guide instead of quoting its exact text. That
    // cannot prove campsite provenance, but it must not block a valid track
    // candidate endpoint. Retry deterministically without optional evidence;
    // the saved point remains explicitly marked as unverified.
    if (outcome.error && operation.tool === 'set_itinerary_group_endpoints'
      && /过夜引文|水源描述缺少|overnight quote|water description/i.test(outcome.error)) {
      const endpoints = Array.isArray((operation.args as { endpoints?: unknown }).endpoints)
        ? (operation.args as { endpoints: Array<Record<string, unknown>> }).endpoints.map((endpoint) => {
          if (!endpoint.overnightReview) return endpoint;
          const review = endpoint.overnightReview as Record<string, unknown>;
          return {
            ...endpoint,
            overnightReview: {
              waterStatus: 'unknown',
              waterQuote: '',
              waterPlan: review.waterPlan,
              effortAssessment: review.effortAssessment,
            },
          };
        })
        : [];
      outcome = await execute(operation.tool, { journeyId, endpoints }, runContext);
    }
    if (outcome.error) {
      artifact.failed.push({ tool: operation.tool, error: outcome.error });
      if (operation.tool === 'add_itinerary_items') itineraryFailed = true;
    } else {
      artifact.saved.push({ tool: operation.tool, output: outcome.output });
    }
  }
  if (!plan.schedule && checkSchedule && !itineraryFailed) {
    try {
      currentSections = await readJourneySections(client, context, journeyId, [...WRITE_SECTIONS]);
      const days = context.task!.decision.days ?? context.task!.decision.derivedDays;
      if (days != null && scheduleMatchesJourney({ totalDays: days, plannedDate: context.task!.decision.plannedDate }, currentSections)) {
        (artifact.satisfied ??= []).push('update_journey_schedule');
      }
    } catch (error) {
      artifact.skipped.push({ tool: 'update_journey_schedule', reason: `context_unavailable: ${errorText(error)}` });
    }
  }
  return artifact;
}

function scheduleDayNames(sections: Record<string, unknown>): string[] {
  const groups = Array.isArray(sections.itineraryGroups) ? sections.itineraryGroups as Array<{ name: string }> : [];
  const rows = Array.isArray(sections.itinerary) ? sections.itinerary as Array<{ day: string }> : [];
  return [...new Set([...groups.map(group => group.name), ...rows.map(row => row.day)])];
}

function scheduleMatchesJourney(schedule: { totalDays: number; plannedDate: string | null }, sections: Record<string, unknown>) {
  const journey = sections.journey as { total_days?: number; planned_date?: string | null } | undefined;
  return journey?.total_days === schedule.totalDays
    && (schedule.plannedDate == null || journey.planned_date === schedule.plannedDate)
    && scheduleDayNames(sections).every(name => {
      const day = journeyDayOrdinal(name);
      return day != null && day >= 1 && day <= schedule.totalDays;
    });
}

// Models sometimes return calendar dates in `from`, although the schedule RPC
// addresses existing timeline row/group names. Resolve those dates against the
// current groups before invoking the RPC; the write remains fully validated.
function normalizeScheduleAssignments(args: Record<string, unknown>, sections: Record<string, unknown>) {
  const schedule = args as { plannedDate?: string | null; dayAssignments?: Array<{ from: string; toDay: number }> };
  if (!Array.isArray(schedule.dayAssignments) || !schedule.dayAssignments.length) return;
  const itineraryGroups = Array.isArray(sections.itineraryGroups) ? sections.itineraryGroups as Array<{ name?: string }> : [];
  const existing = new Set(itineraryGroups.map(group => group.name).filter((name): name is string => Boolean(name)));
  if (!existing.size) return;
  const start = schedule.plannedDate && /^\d{4}-\d{2}-\d{2}$/.test(schedule.plannedDate) ? Date.parse(`${schedule.plannedDate}T00:00:00Z`) : NaN;
  schedule.dayAssignments = schedule.dayAssignments.map(assignment => {
    if (existing.has(assignment.from) || !Number.isFinite(start)) return assignment;
    const date = Date.parse(`${assignment.from}T00:00:00Z`);
    const offset = Number.isFinite(date) ? Math.round((date - start) / 86400000) + 1 : assignment.toDay;
    const candidate = `Day ${offset}`;
    return existing.has(candidate) ? { ...assignment, from: candidate } : assignment;
  });
}

async function execute(tool: SaveToolName, args: Record<string, unknown>, runContext: RunContext): Promise<{ output?: unknown; error?: string }> {
  const target = saveTools[tool];
  try {
    // The runner hands tools zod-parsed arguments; calling the operation
    // directly must apply the same schema defaults and coercions.
    const parsed = target.parameters.parse(args);
    const output = await target.run(parsed as never, runContext);
    return { output };
  } catch (error) {
    return { error: errorText(error) };
  }
}
