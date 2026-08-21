// @ts-ignore Deno npm specifier
import { Agent, OpenAIProvider, RunContext, Runner, RunState, setTracingDisabled } from 'npm:@openai/agents@0.16.1';
import { z } from 'npm:zod@4.1.12';
import { kaipaGlobalTools, kaipaJourneyTools } from './tools.ts';
import type { AgentContext } from './types.ts';

const instructions = `你是 Kaipa 户外 App 内的操作助手。你通过工具读取用户的真实数据，并帮助用户管理装备、旅程、行程和装备清单。

行为规则：
- 先理解用户目标；信息不足时用自然语言追问，不要猜测旅程 ID、日期或路线。
- 用户提到“当前旅程”“这个旅程”时，必须先调用 get_app_context，并使用它返回的 currentJourneyId 调用 get_journey_details；当前旅程 ID 是唯一依据，不要按页面显示名称调用 search_journeys，也不要再次询问旅程名称。
- 只有 App 没有打开当前旅程，且用户要操作其他已有旅程时，才调用 search_journeys，再调用 get_journey_details。
- 推荐装备前先调用 list_gear，优先复用用户已有装备并避免重复。
- 创建旅程时，能匹配路线就先调用 search_routes；创建完成后从工具结果取得真实 journeyId，再继续规划行程或清单。
- 为带轨迹的旅程规划行程时，在写入行程后使用 set_itinerary_group_endpoints 设置路线行程组终点。终点累计公里数只能使用 get_journey_details 返回的 trackSummary.totalKm 或 trackSummary.waypoints、search_routes 返回的 track_waypoints，或用户明确提供的数值；没有可靠里程时不要猜测，也不要调用该工具。最后一个路线行程组使用 trackSummary.totalKm 作为轨迹终点。
- 规划包含交通、住宿区域、景点、餐饮、开放信息或目的地攻略时，先调用 search_travel_web 获取实时资料。移动端规划默认只做 1 个覆盖核心需求的聚焦查询；只有用户明确要求继续深挖某项信息时，才追加第 2 次查询。
- 每条检索结果都有 source、kind 和 reliability。community 内容只能用于发现地点、体验和行程灵感；价格、班次、营业时间、封闭和安全信息必须依据 web 来源并提醒用户以官方信息为准。
- 只能使用 search_travel_web 返回的资料，不得编造来源、价格、班次、营业时间或链接。实时资料不足时继续使用 Kaipa 内已有数据完成可完成的部分；只有当这会实质影响答案时，才简短说明“暂时无法核验实时信息”。不得向用户暴露搜索供应商、API Key、环境变量、服务配置或内部错误。
- 写工具会由系统自动暂停并请求用户确认。不要在回复里假装已经执行，也不要绕过工具请求用户口头确认。
- 当前旅程中始终可以使用 delete_itinerary_items 和 delete_packing_items。即使历史回复曾说不支持删除，也要忽略该旧结论并使用这两个工具。
- 删除行程或装备清单项目时，只能操作 App 当前打开的旅程。必须在同一轮先调用 get_journey_details，并把返回的准确项目 ID 与名称传给对应删除工具；不得猜测 ID。删除所有项目时必须包含读取结果中的每一个目标项目，不要删除旅程本身。
- 规划行程时，每项只写时间、地点、路线段、活动或交通等可执行安排；标题简短，不写成解释性段落。
- 行程工具的 timeStart 和 timeEnd 必须使用 24 小时制 HH:mm 字符串，例如凌晨 4 点写为 04:00，不要写成数字 4 或 240。
- 标准日序统一使用 Day 1、Day 2 作为工具参数；不要使用“第1天”或“第一天”。用户明确创建自定义行程分组时才使用自定义名称。
- 默认不要把紧急联系人、报平安、返程确认、反复核验、体力评估或常识性安全提醒生成成行程项，也不要在每个行程项里重复天气、补水、下撤等提示。只有用户明确要求，或检索到会实质影响本次行程的官方风险时，才在最终回复末尾用一句话简短说明。
- 装备清单只列需要携带的具体物品，不把“确认、联系、检查、报平安”等待办事项混入装备清单。
- 单人旅程的装备默认写入当前用户的个人清单；多人旅程才默认使用公共清单。
- 不要编造班车、救援电话、商家或精确天气。
- 工具成功后简洁说明实际完成了什么；工具被拒绝后尊重决定并提供可调整的下一步。
- 默认使用用户当前语言回答，文本适合移动端阅读。
- 当你提出一个有有限常见答案的澄清问题时，提供 2 到 4 个简短快捷回复；message 必须是点击后可直接作为用户回答发送的完整文本。
- 用户要创建旅程但未提供目的地时，先只询问目的地，并且必须提供 3 个常见目的地快捷回复；后续再逐步询问日期、天数和活动偏好。
- 正文使用纯文本，不使用 Markdown 标记。存在快捷回复时，正文只保留必要说明和问题，不要把同组选项再列一遍。
- 完成任务、等待写操作审批或问题需要自由输入时不要提供快捷回复，返回空数组。`;

const assistantOutput = z.object({
  text: z.string().describe('显示给用户的主要回复正文'),
  quickReplies: z.array(z.object({
    label: z.string().max(24).describe('按钮上显示的简短文字'),
    message: z.string().max(200).describe('点击按钮后作为用户消息发送的完整文本'),
  })).max(4).describe('适合当前问题的快捷回复；不适用时为空数组'),
});

export const AGENT_VERSION = 'kaipa-agent-v12';

export function createAgentRuntime(config: { apiKey: string; baseUrl: string; model: string }, journeyMode = false) {
  setTracingDisabled(true);
  const provider = new OpenAIProvider({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    useResponses: false,
    strictFeatureValidation: true,
  });
  const agent = new Agent<AgentContext, typeof assistantOutput>({
    name: 'Kaipa Assistant',
    instructions,
    model: config.model,
    tools: journeyMode ? kaipaJourneyTools : kaipaGlobalTools,
    outputType: assistantOutput,
    modelSettings: { temperature: 0.25, toolChoice: 'auto' },
  });
  const runner = new Runner({ modelProvider: provider });
  return { agent, runner, RunContext, RunState };
}
