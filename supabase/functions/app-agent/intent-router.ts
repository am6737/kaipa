import { z } from 'npm:zod@4.1.12';
import { constrainTaskDecision, normalizedAuthorization, type TaskDecision, type TaskRouting, type TaskState, type WriteOperation } from './task.ts';
import type { AgentIntent } from './types.ts';

// Intent routing in front of the Task Interpreter (docs/agent-intent-evaluation.md).
// The router names the kind of work; the interpreter still extracts the scope.
// Combining them can only remove permission: the router never adds a write,
// a full hiking plan or a packing mode the interpreter did not already grant.

export const intents = [
  'gear_add', 'gear_set', 'packing_full', 'packing_add', 'hiking_plan', 'transport_chain',
  'itinerary_edit', 'delete', 'undo', 'stop', 'route_explore', 'discuss', 'clarify',
] as const;
export type Intent = typeof intents[number];

// Requests with no write tool (gear-library edits and deletes, removing gear
// from a gear set) are declined, never mapped to the nearest write. The eval scores it as discuss.
export const routerIntents = [...intents, 'unsupported'] as const;
export type RouterIntent = typeof routerIntents[number];

type Definition = { what: string; not_for: string; examples: string[] };

// One definition per intent, shared by the production router and every eval
// variant so they compete on the same boundaries. `not_for` separates
// neighbouring intents. Examples must stay disjoint from intent-cases.ts.
export const intentDefinitions: Record<Exclude<Intent, 'clarify'>, Definition> = {
  gear_add: {
    what: '把物品录入用户的个人装备库（我拥有的装备）',
    not_for: '某次行程的装备清单；装备页的装备清单（gear_set）；询问或比较装备；修改或删除装备库里已有的装备；没有说明是装备库还是行程清单的“创建/准备装备”',
    examples: ['我刚入手一个净水器，存到我的装备里', '登记一下我的新雪套', 'log my trekking poles in my inventory'],
  },
  gear_set: {
    what: '创建装备页的装备清单（按场景命名的装备组合，如“高海拔三天两夜”“周末露营”），或往已有的装备清单里补充、添加装备；不需要旅程、目的地或日期',
    not_for: '某次旅程里的装备清单（packing_full / packing_add）；只录入一件自己的装备（gear_add）；从装备清单里删除或修改装备（没有工具）；只评价、检查清单是否合理而不要求补充（discuss）；完整的徒步规划',
    examples: ['帮我建一个冬季露营的装备清单', '我的周末轻徒步清单还缺什么，帮我补上', '给雪山攀登那个清单加上冰爪和安全带', 'fill up my winter camping gear set'],
  },
  packing_full: {
    what: '为某次行程生成、重做整份装备清单',
    not_for: '往清单里加一两件物品；录入个人装备库；装备页的装备清单或组合（gear_set）；没有提到具体旅程、只用场景命名的清单（如“高海拔三天两夜”）；只是问要带什么而不要求生成',
    examples: ['这趟要带的东西给我出个全套清单', '把行李清单从头再做一遍', 'build my whole kit list for the trek'],
  },
  packing_add: {
    what: '往行程装备清单里追加少量指定物品',
    not_for: '生成整份清单；录入个人装备库',
    examples: ['行李单里补上一卷胶带', '这次清单多加一副手套'],
  },
  hiking_plan: {
    what: '创建或重新规划一次完整徒步旅程并保存',
    not_for: '只讨论或比较路线；明确说先不保存；只补交通或改单个行程项；既没有当前旅程也没有目的地',
    examples: ['给我排一个四姑娘山三天的徒步并存下来', '用我上传的GPX做一份完整日程', 'set up and save a week on the Tour du Mont Blanc'],
  },
  transport_chain: {
    what: '安排并保存城市之间或往返徒步起点的交通接驳链路',
    not_for: '添加一张信息完整的单程车票；只询问交通方式',
    examples: ['西宁到年保玉则来回怎么接驳，排进行程', '返程从镇上回昆明的车帮我安排上'],
  },
  itinerary_edit: {
    what: '修改已有旅程的单个行程项、日期或天数，或补充住宿等单项',
    not_for: '整体重新规划；删除内容；撤销',
    examples: ['最后一天加个温泉', '把行程整体往后挪两天', '记一下我订的5号晚上的卧铺'],
  },
  delete: {
    what: '删除指定的行程项或清单物品',
    not_for: '撤销上一次修改；放弃当前任务；删除装备库里的装备（没有工具）；引号里、转述或假设中的“删除”；询问删除功能',
    examples: ['第一天那个观景台不要了', '行李单里的保温杯去掉'],
  },
  undo: {
    what: '撤销助手刚才做出的修改',
    not_for: '删除某个具体条目；放弃尚未执行的任务；询问撤销功能怎么用',
    examples: ['你刚才那次改动退回去', 'revert your last change'],
  },
  stop: {
    what: '放弃当前未完成的任务',
    not_for: '撤销已保存的修改',
    examples: ['这个计划不要继续了', '这件事先放一放，别继续了'],
  },
  route_explore: {
    what: '探索、比较、推荐路线或目的地，不保存',
    not_for: '要求生成并保存旅程',
    examples: ['稻城亚丁和梅里哪个风景更好', '华东有什么周末能走的线', '只是了解下，不用存，虎跳峡难不难'],
  },
  discuss: {
    what: '其他咨询、查看、解释，不要求写入（包括查看装备库、评价清单、检查旅程缺什么）',
    not_for: '任何明确要求保存、修改、删除的指令',
    examples: ['轻量化帐篷有什么推荐', '我有几双登山鞋', '我的行李单还缺什么吗'],
  },
};

export const unsupportedDefinition: Definition = {
  what: '要求助手做一件没有对应工具的写入：修改或删除装备库里已有的装备，从装备页的装备清单里删除装备、改清单名称，创建待办或提醒',
  not_for: '只是查看或询问；录入新装备（gear_add）；创建装备清单或往里补充装备（gear_set）；行程的装备清单（packing_full / packing_add）',
  examples: ['把装备库里那双旧鞋标成已淘汰', '把露营清单里的炉头删掉', 'rename the stove in my gear library'],
};

export const clarifyDefinition: Definition = {
  what: '请求可以合理理解为两种以上意图，且它们会写入不同数据；或缺少必要前提（例如没有旅程也没有目的地却要生成清单或规划）；或要改的对象不明确',
  not_for: '意图清楚、只是缺少日期等可以之后补问的参数',
  examples: ['装备的事帮我处理下', '给我安排安排（没有目的地也没有旅程）'],
};

// Writes each intent may legitimately authorize. applyIntent intersects the
// interpreter's operations with this set; the eval scores writes outside the
// expected intents' union as harmful.
export const intentWrites: Record<RouterIntent, WriteOperation[]> = {
  gear_add: ['add_gear'],
  gear_set: ['add_gear_set_items'],
  packing_full: ['add_packing_items', 'delete_packing_items'],
  packing_add: ['add_packing_items'],
  hiking_plan: ['create_journey', 'add_itinerary_items', 'update_journey_schedule', 'set_journey_map_location', 'set_itinerary_group_endpoints', 'add_packing_items'],
  transport_chain: ['add_itinerary_items', 'update_journey_schedule'],
  itinerary_edit: ['add_itinerary_items', 'update_journey_schedule', 'delete_itinerary_items'],
  delete: ['delete_itinerary_items', 'delete_packing_items'],
  undo: ['undo_last_agent_changes'],
  stop: [], route_explore: [], discuss: [], clarify: [], unsupported: [],
};

// Maps an interpreter decision onto the taxonomy. The raw (pre-constraint)
// decision carries what the model meant; constraints only strip permission.
export function intentFromDecision(decision: TaskDecision): Intent {
  const ops = decision.operations;
  if (decision.mode === 'stop') return 'stop';
  if (decision.mode !== 'execute') return decision.domain === 'routes' ? 'route_explore' : 'discuss';
  if (ops.includes('undo_last_agent_changes')) return 'undo';
  if (ops.includes('add_gear_set_items')) return 'gear_set';
  if (ops.includes('add_gear')) return 'gear_add';
  if (decision.fullHikingPlan || ops.includes('create_journey')) return 'hiking_plan';
  if (decision.domain === 'transport') return 'transport_chain';
  if (decision.packingMode === 'full') return 'packing_full';
  if (ops.includes('add_packing_items')) return 'packing_add';
  // Deleting together with adding or rescheduling is a move, i.e. an edit.
  const moved = ops.includes('delete_itinerary_items') && !ops.includes('delete_packing_items')
    && (ops.includes('add_itinerary_items') || ops.includes('update_journey_schedule'));
  if (!moved && ops.some(op => op === 'delete_itinerary_items' || op === 'delete_packing_items')) return 'delete';
  if (ops.length) return 'itinerary_edit';
  return decision.domain === 'routes' ? 'route_explore' : 'discuss';
}

// App buttons send a fixed prompt plus one of these. Every entry except
// plan_journey is decided by the button itself, so the router is skipped;
// plan_journey stays a hint because the prompt may still lack a destination.
export const appIntentRoutes: Record<AgentIntent, RouterIntent | null> = {
  plan_journey: null,
  packing_full: 'packing_full',
  transport_supplement: 'transport_chain',
  stay_supplement: 'itinerary_edit',
  gear_onboarding: 'gear_add',
  gear_set_onboarding: 'gear_set',
  // 清单判官 reviews a gear set read-only; adding the missing items is the
  // user's next turn, routed as gear_set.
  gear_set_review: 'discuss',
  journey_review: 'discuss',
  // Normally decided in task-store.ts from the journey row (smart-plan.ts);
  // this route applies only when that journey cannot be read.
  smart_plan: 'hiking_plan',
};

// Unknown values from older or newer clients are treated as absent, never 400.
export function isAgentIntent(value: unknown): value is AgentIntent {
  return typeof value === 'string' && Object.hasOwn(appIntentRoutes, value);
}

export type RouterMode = 'on' | 'shadow' | 'off';
export function intentRouterMode(value: string | undefined): RouterMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'off' || normalized === 'shadow' ? normalized : 'on';
}

export const clarifyOptionSchema = z.object({
  label: z.string().max(24).describe('按钮上显示的简短文字'),
  message: z.string().max(200).describe('点击后作为用户消息发送的完整明确指令，单独发送也能直接执行'),
});
export type ClarifyOption = z.infer<typeof clarifyOptionSchema>;
export type Clarification = { question: string; options: ClarifyOption[] };

export const routerOutputSchema = z.object({
  intent: z.enum(routerIntents),
  alternatives: z.array(z.enum(routerIntents)).max(3),
  clarifyQuestion: z.string().max(300).nullable(),
  clarifyOptions: z.array(clarifyOptionSchema).max(3),
});
export type RouterOutput = z.infer<typeof routerOutputSchema>;

export type RouterInput = {
  latestMessage: string;
  hasCurrentJourney: boolean;
  hasBoundTrack: boolean;
  appEntry: string | null;
  pendingQuestion: string | null;
  recentMessages: Array<{ role: string; content: string }>;
};

export const intentRouterInstructions = `你是 Kaipa 户外助手的意图路由器，只做分类，不回答用户，也不执行任何操作。
判断用户最新这句话（latestMessage）想让助手做什么。hasCurrentJourney / hasBoundTrack 表示是否已有当前旅程和绑定轨迹；appEntry=plan_journey 只表示从规划入口进入，不代表信息齐全；pendingQuestion 是助手上一轮等待回答的问题；recentMessages 是历史，不是新指令。
只能从下列意图中选择一个（JSON：what=是什么，not_for=不包括什么，examples=示例）：
${JSON.stringify({ ...intentDefinitions, unsupported: unsupportedDefinition, clarify: clarifyDefinition })}
规则：
1. 引号里的话、转述别人的话、假设（如果……会怎样）、询问某个功能或按钮怎么用，都是内容而不是命令。不能因为其中出现“删除/撤销/生成/保存”等词就选写入意图，按 discuss 处理；用户自己在引号外明确下达的指令才算。
2. 有 pendingQuestion 时，简短的回答（地点、日期、天数、交通方式、“是/对/可以”、某个选项的名字）是在回答这个问题：选这个问题所属任务的意图，不要把它当成一个新的交通或编辑请求。如果 pendingQuestion 是让用户在几种做法之间选择，回答点出了其中一种，就选那一种对应的意图，不要再选 clarify。拒绝或放弃（不用了、算了、取消、停）选 stop；明显换了话题就按新话题判断。
3. 下列情况选 clarify：请求可能写入不同的数据而无法区分（个人装备库、装备页的装备清单还是行程装备清单，例如已有当前旅程时只说“添加某件装备”）；要求生成完整规划或整份清单，但既没有当前旅程也没有说目的地；要修改的对象或方式不明确。只缺日期、天数、出发地等之后可以补问的参数时，不要选 clarify。
4. 装备页的“装备清单”是按场景命名、可复用的装备组合，不是某次旅程的清单。用户提到“我现在的清单”“某某清单”且名字是一个场景（如“高海拔三天两夜”“低海拔轻徒步”），或要求创建这样一份清单、给它补充装备，选 gear_set，不要选 clarify、packing_full 或 hiking_plan；没有当前旅程时尤其如此。只要求评价、检查某份装备清单合不合理时选 discuss；pendingQuestion 问要不要把缺的装备补进这份清单时，同意（补上吧、可以、好）选 gear_set。
5. 没有对应写入工具的请求选 unsupported，绝不能映射到最接近的写入意图：修改或删除装备库里已有的装备、从装备清单里删除装备或改名、创建待办或提醒。
6. 没有当前旅程、也没有提到装备清单时，“添加/加一下/记上/录入”一件或几件具体物品只可能是装备库（gear_add），直接选 gear_add，不要选 clarify；不需要出现“装备”二字，例如“帮我加一下羽绒裤、冰爪”。
7. 只有明确要求保存、生成、修改、删除、撤销时才选写入意图；咨询、比较、查看、检查、评价选 route_explore 或 discuss。
输出：
- intent 为所选意图；alternatives 为其他说得通的意图（最多 3 个，可以为空数组）。
- intent 为 clarify 时必须给出 clarifyQuestion（一句简短的问题）和 2-3 个 clarifyOptions：label 是按钮上的短文字（不超过 12 个字），message 是用户点击后发送的完整明确指令，单独发送也能直接执行，例如“把这件装备录入我的装备库”“把这件装备加到这次旅程的装备清单”“把这件装备加到我的「周末露营」装备清单”。不是 clarify 时 clarifyQuestion 为 null，clarifyOptions 为空数组。
- clarifyQuestion 和选项的语言跟随用户消息：用户用英文就用英文，否则用中文。
只输出结构化结果。`;

const english = (message: string) => !/[㐀-鿿]/.test(message);

// The router contract requires a question for clarify; a provider that omits
// it still gets a clarification, never a guessed write.
export function normalizeRoute(output: RouterOutput, message: string): RouterOutput {
  const parsed = routerOutputSchema.parse(output);
  if (parsed.intent !== 'clarify') return { ...parsed, clarifyQuestion: null, clarifyOptions: [] };
  const question = parsed.clarifyQuestion?.trim() || (english(message)
    ? 'What exactly would you like me to do? Tell me what to save or change.'
    : '你想让我具体做什么？请说明要保存到哪里或修改哪一项。');
  const options = parsed.clarifyOptions
    .map(option => ({ label: option.label.trim(), message: option.message.trim() }))
    .filter(option => option.label && option.message);
  return { ...parsed, clarifyQuestion: question, clarifyOptions: options };
}

// A full checklist is saved into a journey. Without one there is nothing to
// write it to, so ask instead of running the packing pipeline on nothing.
export function whichJourneyClarification(message: string): Clarification {
  return english(message)
    ? { question: 'A packing list is saved to a trip. Which trip is it for? Open that trip and ask me there, or tell me the destination and length and I can set up the trip first.',
      options: [{ label: 'Reference list only', message: "Don't save anything, just give me a general reference packing list in the chat" }] }
    : { question: '装备清单要保存在某次旅程里。要给哪次旅程生成？可以先打开那次旅程再问我，或告诉我目的地和天数，我先帮你建好旅程。',
      options: [{ label: '只列参考清单', message: '不用保存，先在聊天里给我列一份通用的参考装备清单' }] };
}

// A full plan needs somewhere to go. With no journey, destination or track the
// pipeline would invent one, so ask first.
export function whereToClarification(message: string): Clarification {
  return english(message)
    ? { question: 'Where would you like to go? Tell me the destination or route, and roughly how many days, and I will plan and save the trip.',
      options: [{ label: 'Suggest routes first', message: 'Suggest a few hiking routes that suit me first, without saving anything' }] }
    : { question: '想去哪里？告诉我目的地或路线，以及大概几天，我来规划并保存旅程。',
      options: [{ label: '先推荐路线', message: '先给我推荐几条适合的徒步路线，不用保存' }] };
}

const unsupportedNote = '路由判定：这个请求没有对应的写入工具（例如修改或删除装备库里已有的装备、从装备清单里删除装备或改名）。不要调用任何写入工具，也不要用其他写入代替；说明助手暂时不能代为完成，可以建议用户在 App 的装备页手动操作，或先给出建议内容。';

const destructive: WriteOperation[] = ['delete_itinerary_items', 'delete_packing_items', 'undo_last_agent_changes'];

export type AppliedIntent = { decision: TaskDecision; clarification: Clarification | null; authorizationUnconfirmed: boolean };

// Combines the routed intent with the interpreter's raw decision before
// constrainTaskDecision. Safety property: operations only shrink, mode only
// leaves execute, fullHikingPlan only turns off, packingMode only lowers.
export function applyIntent(
  intent: RouterIntent,
  raw: TaskDecision,
  context: { journeyId: string | null; message: string; clarify?: Clarification | null; hasBoundTrack?: boolean },
): AppliedIntent {
  const quiet = (domain: TaskDecision['domain'], mode: TaskDecision['mode'] = 'discuss'): TaskDecision => ({
    ...raw, mode, domain, domainQuote: null, operations: [], requiredOperations: [], fullHikingPlan: false, packingMode: 'none',
  });
  if (intent === 'clarify') {
    return { decision: quiet('general'), authorizationUnconfirmed: false,
      clarification: context.clarify || normalizeRouteClarification(context.message) };
  }
  if (intent === 'stop') return { decision: quiet('general', 'stop'), clarification: null, authorizationUnconfirmed: false };
  if (intent === 'discuss' || intent === 'unsupported') return { decision: quiet('general'), clarification: null, authorizationUnconfirmed: false };
  if (intent === 'route_explore') return { decision: quiet('routes'), clarification: null, authorizationUnconfirmed: false };
  if (intent === 'packing_full' && !context.journeyId) {
    return { decision: quiet('packing'), clarification: whichJourneyClarification(context.message), authorizationUnconfirmed: false };
  }
  if (intent === 'hiking_plan') {
    if (!context.journeyId && !raw.destination?.trim() && !context.hasBoundTrack && !raw.trackAttachmentName) {
      return { decision: quiet('general'), clarification: whereToClarification(context.message), authorizationUnconfirmed: false };
    }
    return { decision: raw, clarification: null, authorizationUnconfirmed: false };
  }

  const allowed = intentWrites[intent];
  const operations = raw.operations.filter(operation => allowed.includes(operation));
  const decision: TaskDecision = {
    ...raw, operations,
    requiredOperations: raw.requiredOperations.filter(operation => operations.includes(operation)),
    fullHikingPlan: false,
  };
  if (intent === 'packing_full') decision.domain = 'packing';
  else if (intent === 'packing_add') {
    decision.packingMode = raw.packingMode === 'none' ? 'none' : 'incremental';
    decision.domain = raw.domain === 'packing' ? 'packing' : 'general';
  } else {
    decision.packingMode = 'none';
    // Transport is the only domain that still routes without a full plan or
    // checklist, and constrainTaskDecision re-verifies its quote.
    decision.domain = (intent === 'transport_chain' || intent === 'itinerary_edit') && raw.domain === 'transport' ? 'transport' : 'general';
  }
  if (decision.domain !== 'transport') decision.domainQuote = null;
  const intendedExecution = raw.mode === 'execute'
    && (raw.operations.length > 0 || raw.fullHikingPlan === true || raw.packingMode === 'full');
  if (raw.mode === 'execute' && !operations.length) {
    // The interpreter meant a different write than the routed intent allows:
    // ask for confirmation instead of executing either reading.
    return { decision: { ...decision, mode: 'discuss', domain: 'general', domainQuote: null, packingMode: 'none' },
      clarification: null, authorizationUnconfirmed: intendedExecution };
  }
  return { decision, clarification: null, authorizationUnconfirmed: false };
}

function normalizeRouteClarification(message: string): Clarification {
  const route = normalizeRoute({ intent: 'clarify', alternatives: [], clarifyQuestion: null, clarifyOptions: [] }, message);
  return { question: route.clarifyQuestion!, options: route.clarifyOptions };
}

const quotedSpans = /“[^”]*”|"[^"]*"|‘[^’]*’|「[^」]*」|『[^』]*』/g;

// A destructive authorization that only exists inside quotation marks is
// someone else's words or the feature being asked about, not the user's
// command. Applies on every path, including the interpreter-only one.
export function guardQuotedAuthorization(decision: TaskDecision, message: string): TaskDecision {
  const quote = normalizedAuthorization(decision.authorizationQuote || '');
  if (!quote || !decision.operations.some(operation => destructive.includes(operation))) return decision;
  // 把“观景台”删掉 quotes only the item name: the command itself is outside.
  const spans = message.match(quotedSpans) || [];
  if (!spans.some(span => normalizedAuthorization(span).includes(quote))) return decision;
  if (normalizedAuthorization(message.replace(quotedSpans, ' ')).includes(quote)) return decision;
  const operations = decision.operations.filter(operation => !destructive.includes(operation));
  const guarded: TaskDecision = { ...decision, operations,
    requiredOperations: decision.requiredOperations.filter(operation => operations.includes(operation)) };
  if (!operations.length && !guarded.fullHikingPlan && guarded.packingMode !== 'full') guarded.mode = guarded.mode === 'stop' ? 'stop' : 'discuss';
  return guarded;
}

// A bare refusal of a pending question ("不用了", "no thanks") never
// authorizes the work that question offered. "不要了" and "取消" are left out:
// answering "要删掉吗？" or "要取消吗？" with them means yes.
const bareDecline = /^(?:(?:那|嗯|哦)?先?(?:不用了?|不需要了?|算了吧?|不了|没必要)(?:吧|啊)?(?: ?(?:谢谢|谢了))?|no(?: thanks?| thank you)?|never ?mind|not now)$/;
export function declinesPending(message: string) {
  return bareDecline.test(message.toLowerCase().replace(/[，。、！？!?,.~～…]+/g, ' ').replace(/\s+/g, ' ').trim());
}

function pendingTask(previous: TaskState | null, journeyId: string | null) {
  return Boolean(previous?.outcome && ['waiting', 'partial'].includes(previous.outcome.status)
    && previous.outcome.pendingQuestion && previous.journeyId === journeyId);
}

export function pendingQuestionFor(previous: TaskState | null, journeyId: string | null) {
  return pendingTask(previous, journeyId) ? previous!.outcome!.pendingQuestion : null;
}

// Answers to a question asked while executing ("高铁", "成都") are handled
// well by the interpreter, which sees the unfinished task; the router reads
// them as new requests. Skip it for those turns.
export function continuationGate(previous: TaskState | null, journeyId: string | null) {
  return pendingTask(previous, journeyId) && previous!.decision.mode === 'execute';
}

export type ResolveTaskArgs = {
  message: string;
  journeyId: string | null;
  previous: TaskState | null;
  appIntent?: string | null;
  hasBoundTrack: boolean;
  mode: RouterMode;
  recentMessages: Array<{ role: string; content: string }>;
  interpretInput: unknown;
};

export type ResolvedTask = { decision: TaskDecision; routing: TaskRouting; raw: TaskDecision; applied: TaskDecision };

// The whole interpretation step without the database: gate, router (in
// parallel with the interpreter), applyIntent, quote guard and
// constrainTaskDecision. prepareTask and scripts/evaluate-intent.ts share it.
export async function resolveTask(
  args: ResolveTaskArgs,
  interpret: (input: unknown) => Promise<TaskDecision>,
  route?: (input: RouterInput) => Promise<RouterOutput>,
  warn: (message: string, detail?: unknown) => void = console.warn,
): Promise<ResolvedTask> {
  const appIntent = isAgentIntent(args.appIntent) ? args.appIntent : null;
  const appRoute = appIntent ? appIntentRoutes[appIntent] : null;
  const gated = !appRoute && continuationGate(args.previous, args.journeyId);
  const callRouter = !appRoute && !gated && args.mode !== 'off' && Boolean(route);
  const routerInput: RouterInput = {
    latestMessage: args.message,
    hasCurrentJourney: Boolean(args.journeyId),
    hasBoundTrack: args.hasBoundTrack,
    appEntry: appIntent,
    pendingQuestion: pendingQuestionFor(args.previous, args.journeyId),
    recentMessages: args.recentMessages,
  };
  const [interpreted, routed] = await Promise.all([
    interpret(args.interpretInput),
    callRouter
      // catch() after then(): an output that fails the schema falls back too.
      ? route!(routerInput).then(output => normalizeRoute(output, args.message)).catch((error: unknown) => {
        warn('[AppAgent] intent router unavailable; using interpreter only', error instanceof Error ? error.message : error);
        return error instanceof Error ? error : new Error(String(error));
      })
      : null,
  ]);
  const raw: TaskDecision = { ...interpreted, offTopic: false,
    objective: interpreted.objective?.trim() || args.message.trim().slice(0, 1000) };

  let routing: TaskRouting;
  if (appRoute) routing = { intent: appRoute, source: 'app', applied: true, appIntent: appIntent! };
  else if (gated) routing = { intent: intentFromDecision(raw), source: 'continuation', applied: false };
  else if (routed && !(routed instanceof Error)) {
    routing = { intent: routed.intent, source: 'router', applied: args.mode === 'on', alternatives: routed.alternatives,
      ...(routed.intent === 'clarify' ? { clarify: { question: routed.clarifyQuestion!, options: routed.clarifyOptions } } : {}) };
  } else {
    routing = { intent: intentFromDecision(raw), source: 'interpreter', applied: false,
      ...(routed instanceof Error ? { error: routed.message.slice(0, 300) } : {}) };
  }
  if (appIntent && !appRoute) routing.appIntent = appIntent;

  let applied = raw;
  let unconfirmed = false;
  if (routing.applied) {
    const result = applyIntent(routing.intent, raw, { journeyId: args.journeyId, message: args.message, clarify: routing.clarify,
      hasBoundTrack: args.hasBoundTrack });
    applied = result.decision;
    unconfirmed = result.authorizationUnconfirmed;
    if (result.clarification) routing.clarify = result.clarification;
    if (routing.intent === 'unsupported') routing.note = unsupportedNote;
  } else if (routing.source === 'interpreter' && (routing.intent === 'packing_full' || routing.intent === 'hiking_plan')) {
    // A failed router must not skip its missing-premise questions: a full
    // checklist with no journey, or a full plan with nowhere to go, ran the
    // planning pipeline on nothing (thread b81d61ab, 2026-10-20).
    const result = applyIntent(routing.intent, raw, { journeyId: args.journeyId, message: args.message, hasBoundTrack: args.hasBoundTrack });
    if (result.clarification) {
      applied = result.decision;
      routing.clarify = result.clarification;
      routing.applied = true;
    }
  }
  // An answer to a pending question keeps that task's scope: "高铁" for a
  // transport question cannot turn into a full hiking plan. If the
  // interpreter calls it a new request instead, the router was skipped, so
  // confirm before replanning rather than trusting either reading.
  if (gated && !args.previous!.decision.fullHikingPlan && applied.fullHikingPlan) {
    const scope = args.previous!.decision.operations;
    const operations = applied.operations.filter(operation => scope.includes(operation));
    applied = raw.continuation
      ? { ...applied, fullHikingPlan: false, operations, requiredOperations: applied.requiredOperations.filter(operation => operations.includes(operation)),
        domain: applied.domain === 'hiking' ? args.previous!.decision.domain : applied.domain }
      : { ...applied, mode: 'discuss', fullHikingPlan: false, operations: [], requiredOperations: [], packingMode: 'none', domain: 'general', domainQuote: null };
    unconfirmed = !raw.continuation;
  }
  applied = guardQuotedAuthorization(applied, args.message);
  if (routerInput.pendingQuestion && declinesPending(args.message)) {
    applied = { ...applied, mode: 'stop', operations: [], requiredOperations: [], fullHikingPlan: false, packingMode: 'none', domain: 'general', domainQuote: null };
    unconfirmed = false;
  }
  // The plan_journey hint makes constrainTaskDecision add schedule and map
  // writes; a routed non-planning intent must not regain them that way.
  const narrowed = routing.applied && (routing.intent !== 'hiking_plan' || Boolean(routing.clarify));
  const decision = constrainTaskDecision(applied, args.message, args.previous, args.journeyId,
    { hasBoundTrack: args.hasBoundTrack, intent: narrowed ? undefined : appIntent ?? undefined });
  if (narrowed) {
    decision.operations = decision.operations.filter(operation => applied.operations.includes(operation));
    decision.requiredOperations = decision.requiredOperations.filter(operation => decision.operations.includes(operation));
  }
  if (unconfirmed && decision.mode !== 'execute') decision.authorizationUnconfirmed = true;
  return { decision, routing, raw, applied };
}
