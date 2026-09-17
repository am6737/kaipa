import { Activity, Backpack, Bell, ClipboardList, Flag, LayoutDashboard, Map, MessageSquare, Mountain, ScrollText, Settings, Shield, ShieldCheck, Sparkles, UserCog, Users } from 'lucide-react-native';
import { initialRecords, ListSection, RecordItem, Section } from './mockData';

export const navigationGroups = [
  { label: '工作台', items: [{ id: 'overview', label: '数据概览', icon: LayoutDashboard }] },
  { label: '业务数据', items: [
    { id: 'users', label: '用户管理', icon: Users }, { id: 'journeys', label: '行程管理', icon: Mountain },
    { id: 'routes', label: '路线资源', icon: Map }, { id: 'gear', label: '公共装备库', icon: Backpack },
    { id: 'checklists', label: '清单模板', icon: ClipboardList },
  ] },
  { label: '运营与安全', items: [
    { id: 'content', label: '内容审核', icon: ShieldCheck }, { id: 'reports', label: '举报处理', icon: Flag },
    { id: 'feedback', label: '用户反馈', icon: MessageSquare }, { id: 'notifications', label: '通知公告', icon: Bell },
  ] },
  { label: 'AI 与系统', items: [
    { id: 'ai', label: 'AI 执行记录', icon: Sparkles }, { id: 'services', label: '服务状态', icon: Activity },
    { id: 'settings', label: '系统配置', icon: Settings },
  ] },
  { label: '组织管理', items: [
    { id: 'admins', label: '管理员', icon: UserCog }, { id: 'roles', label: '角色权限', icon: Shield },
    { id: 'audit', label: '操作日志', icon: ScrollText },
  ] },
] as const;

export type FieldDefinition = { key: string; label: string; options?: string[]; type?: 'text' | 'email' | 'number' | 'textarea'; required?: boolean; min?: number; max?: number };
export type ModuleDefinition = {
  title: string; description: string; entity: string; owner: string; category: string;
  statuses: string[]; create?: string; initialStatus?: string; fields?: FieldDefinition[];
};
const resourceFields: FieldDefinition[] = [
  { key: 'name', label: '名称', required: true }, { key: 'detail', label: '简介', type: 'textarea', required: true },
];
export const modules: Record<ListSection, ModuleDefinition> = {
  users: { title: '用户管理', description: '账户状态、活跃情况与用户行程。', entity: '用户', owner: '参与情况', category: '客户端', statuses: ['正常', '已停用'] },
  journeys: { title: '行程管理', description: '查看平台行程与出行状态。', entity: '行程', owner: '创建者', category: '类型', statuses: ['进行中', '计划中', '已完成'] },
  routes: { title: '路线资源', description: '平台公共路线与轨迹资源。', entity: '路线', owner: '维护者', category: '难度', statuses: ['草稿', '已发布', '已下架'], create: '新建路线', initialStatus: '草稿', fields: [...resourceFields, { key: 'category', label: '难度', options: ['入门', '进阶', '挑战'] }, { key: 'region', label: '地区', required: true }, { key: 'distance', label: '距离（km）', type: 'number', min: 0.1, max: 1000, required: true }] },
  gear: { title: '公共装备库', description: '平台维护的装备参考资料。', entity: '装备', owner: '品牌', category: '分类', statuses: ['草稿', '已发布', '已下架'], create: '新建装备', initialStatus: '草稿', fields: [...resourceFields, { key: 'owner', label: '品牌', required: true }, { key: 'category', label: '分类', options: ['背负', '睡眠', '炊具', '服装', '安全'] }, { key: 'weight', label: '重量（g）', type: 'number', min: 0, max: 50000, required: true }] },
  checklists: { title: '清单模板', description: '按出行场景维护推荐打包清单。', entity: '模板', owner: '维护者', category: '场景', statuses: ['草稿', '已发布', '已下架'], create: '新建模板', initialStatus: '草稿', fields: [...resourceFields, { key: 'category', label: '场景', options: ['单日徒步', '多日徒步', '露营', '骑行'] }, { key: 'items', label: '清单条目', type: 'textarea', required: true }] },
  content: { title: '内容审核', description: '查看公开分享，处理待审核内容。', entity: '内容', owner: '创建者', category: '类型', statuses: ['待审核', '已通过', '已驳回', '已下架'] },
  reports: { title: '举报处理', description: '公开内容与账户举报工单。', entity: '举报事项', owner: '举报人', category: '原因', statuses: ['待处理', '处理中', '已处理', '已驳回'] },
  feedback: { title: '用户反馈', description: '问题反馈、使用建议与处理进度。', entity: '反馈', owner: '提交人', category: '分类', statuses: ['待处理', '处理中', '已解决'], fields: [{ key: 'reply', label: '处理回复', type: 'textarea', required: true }] },
  notifications: { title: '通知公告', description: '公告草稿、发布状态与目标人群。', entity: '公告', owner: '目标人群', category: '渠道', statuses: ['草稿', '已发布', '已撤回'], create: '新建公告', initialStatus: '草稿', fields: [...resourceFields, { key: 'owner', label: '目标人群', options: ['全部用户', '近 7 天活跃用户', '新注册用户'] }, { key: 'category', label: '渠道', options: ['站内通知', '首页公告'] }] },
  ai: { title: 'AI 执行记录', description: '追踪规划请求、执行结果与使用量。', entity: '请求', owner: '用户', category: '任务', statuses: ['成功', '失败'] },
  services: { title: '服务状态', description: '自托管服务、任务与备份状态。', entity: '服务', owner: '最近检查', category: '组件', statuses: ['正常', '告警'] },
  admins: { title: '管理员', description: '后台成员、角色与账户状态。', entity: '成员', owner: '邮箱', category: '角色', statuses: ['正常', '邀请中', '已停用'], create: '邀请管理员', initialStatus: '邀请中', fields: [{ key: 'name', label: '姓名', required: true }, { key: 'owner', label: '邮箱', type: 'email', required: true }, { key: 'category', label: '角色', options: ['运营管理员', '内容审核员', '只读观察员'] }] },
  audit: { title: '操作日志', description: '管理操作及其变更记录。', entity: '操作', owner: '操作者', category: '模块', statuses: ['成功'] },
};
export const pageTitle = (section: Section) => navigationGroups.flatMap(group => [...group.items]).find(item => item.id === section)?.label ?? '数据概览';
export const isSection = (value: string): value is Section => navigationGroups.some(group => group.items.some(item => item.id === value));
export const isListSection = (section: Section): section is ListSection => section !== 'overview' && section !== 'roles' && section !== 'settings';

const record = (id: string, name: string, detail: string, owner: string, category: string, status: string, fields?: Record<string, string>): RecordItem => ({ id, name, detail, owner, category, status, date: '2026-09-06 10:42', fields });
export const seedRecords: Record<ListSection, RecordItem[]> = {
  ...initialRecords,
  users: initialRecords.users.map(item => ({ ...item, fields: { visibility: '仅展示账户与业务摘要', joined: '2026-08-12', lastActive: item.date } })),
  journeys: initialRecords.journeys.map(item => ({ ...item, fields: { visibility: '仅行程成员', members: item.id === 'J-2086' ? '林间来信、小满、北北等 6 位成员' : '创建者与受邀同行者', packing: '个人清单与公共清单', versions: '最近保留 10 个行程版本', management: '管理员仅查看业务摘要，不代替成员编辑私人行程' } })),
  ai: initialRecords.ai.map(item => ({ ...item, fields: { version: 'app-agent mock v1', tools: item.category === '装备建议' ? 'get_journey_packing → validate_packing' : 'get_journey → propose_plan', result: item.status === '失败' ? '上游请求超时，无行程写入' : '执行完成，结果已返回会话', privacy: '不展示完整对话与个人规划资料' } })),
  routes: [
    record('R-101', '武功山经典穿越', '金顶至发云界的高山草甸路线', 'Kaipa 编辑部', '进阶', '已发布', { region: '江西萍乡', distance: '23.5', altitude: '1,620 m', track: 'wugongshan.gpx' }),
    record('R-102', '莫干山竹林环线', '周末单日轻徒步', 'Kaipa 编辑部', '入门', '草稿', { region: '浙江德清', distance: '8.6', altitude: '420 m' }),
    record('R-103', '长坪沟穿越', '高海拔多日徒步路线', '阿川', '挑战', '已下架', { region: '四川阿坝', distance: '35', reason: '季节性封闭，待重新确认开放时间' }),
  ],
  gear: [
    record('G-101', '轻量徒步背包 40L', '多日徒步背负参考', '山野工坊', '背负', '已发布', { weight: '980', capacity: '40 L' }),
    record('G-102', '三季羽绒睡袋', '舒适温标 0°C', '山野工坊', '睡眠', '已发布', { weight: '820', temperature: '0°C' }),
    record('G-103', '钛合金套锅', '单人轻量炊具', 'Trail Lab', '炊具', '草稿', { weight: '160' }),
  ],
  checklists: [
    record('T-101', '单日轻徒步', '基础重量约 3.2 kg', 'Kaipa 编辑部', '单日徒步', '已发布', { items: '徒步背包\n饮用水\n路餐\n雨衣\n头灯\n急救包' }),
    record('T-102', '三季重装露营', '基础重量约 8.4 kg', 'Kaipa 编辑部', '露营', '已发布', { items: '帐篷\n睡袋\n防潮垫\n炉头\n套锅\n燃料\n急救包' }),
    record('T-103', '长途骑行', '两日骑行补给与维修', 'Kaipa 编辑部', '骑行', '草稿', { items: '头盔\n车灯\n补胎工具\n备用内胎\n水壶' }),
  ],
  reports: [
    record('RP-101', '路线分享包含广告', '举报对象 C-807', '北北', '广告营销', '待处理', { target: 'C-807', evidence: '评论区出现与路线无关的推广信息。' }),
    record('RP-102', '公开照片涉及个人隐私', '举报对象 C-808', '林间来信', '隐私问题', '处理中', { target: 'C-808', evidence: '照片中包含未经同意公开的个人信息。' }),
  ],
  feedback: [
    record('F-101', '导入轨迹后里程不一致', 'KMZ 轨迹导入后显示的距离偏短', '阿川', '问题反馈', '待处理', { client: 'Android 16', version: '1.0.0', reply: '' }),
    record('F-102', '希望可以复制多人清单', '将公共清单复制到下一次行程', '小满', '功能建议', '处理中', { client: 'iOS 19', version: '1.0.0', reply: '已记录需求，正在评估。' }),
    record('F-103', '邀请链接无法打开', '更新客户端后恢复正常', '北北', '问题反馈', '已解决', { reply: '已协助用户更新客户端并确认恢复。' }),
  ],
  notifications: [
    record('N-101', '秋季出行安全提醒', '出行前请关注当地天气与路线开放情况，备齐照明、保暖及应急装备。', '全部用户', '站内通知', '已发布'),
    record('N-102', '周末轻徒步清单上新', '新的单日徒步清单模板已准备就绪。', '近 7 天活跃用户', '首页公告', '草稿'),
  ],
  services: [
    record('S-101', 'Supabase API', 'P95 延迟 82 ms', '10:42:00', '数据服务', '正常', { deployment: '自托管', availability: '99.98%' }),
    record('S-102', '对象存储', '已使用 18.6 GB / 100 GB', '10:42:00', '文件存储', '正常', { bucket: 'kaipa', objects: '32,416' }),
    record('S-103', 'AI Edge Function', '最近 1 小时 1 次上游超时', '10:41:58', '函数服务', '告警', { error: 'Upstream timeout', run: 'AI-3019' }),
    record('S-104', '每日数据库备份', '最近备份完成于 03:00', '03:02:18', '备份任务', '正常', { retention: '7 天', size: '842 MB' }),
  ],
  admins: [
    record('A-001', 'Kaipa Admin', '当前登录成员', 'admin@example.com', '超级管理员', '正常'),
    record('A-002', '小林', '运营组', 'ops@example.com', '运营管理员', '正常'),
    record('A-003', '小周', '内容组', 'review@example.com', '内容审核员', '邀请中'),
  ],
  audit: [
    record('L-001', '发布清单模板', '单日轻徒步', 'Kaipa Admin', '清单模板', '成功', { target: 'T-101', before: '草稿', after: '已发布' }),
    record('L-002', '通过内容审核', '长坪沟路线与补给记录', '小林', '内容审核', '成功', { target: 'C-807', before: '待审核', after: '已通过' }),
    record('L-003', '邀请管理员', '小周', 'Kaipa Admin', '管理员', '成功', { target: 'A-003', after: '邀请中' }),
  ],
};

export type RecordAction = { label: string; status: string; danger?: boolean };
export function actionsFor(section: ListSection, item: RecordItem): RecordAction[] {
  if (section === 'users' || section === 'admins') {
    if (item.id === 'A-001' || item.status === '邀请中') return [];
    return item.status === '正常' ? [{ label: '停用账户', status: '已停用', danger: true }] : [{ label: '恢复账户', status: '正常' }];
  }
  if (['routes', 'gear', 'checklists'].includes(section)) return item.status === '已发布' ? [{ label: '下架', status: '已下架', danger: true }] : [{ label: '发布', status: '已发布' }];
  if (section === 'notifications') return item.status === '已发布' ? [{ label: '撤回公告', status: '已撤回', danger: true }] : [{ label: '发布公告', status: '已发布' }];
  if (section === 'content') return item.status === '待审核' ? [{ label: '通过审核', status: '已通过' }, { label: '驳回', status: '已驳回', danger: true }] : item.status === '已通过' ? [{ label: '下架内容', status: '已下架', danger: true }] : [];
  if (section === 'reports') return ['待处理', '处理中'].includes(item.status) ? [...(item.status === '待处理' ? [{ label: '开始处理', status: '处理中' }] : []), { label: '结案', status: '已处理', danger: true }, { label: '驳回举报', status: '已驳回', danger: true }] : [];
  if (section === 'feedback') return item.status === '待处理' ? [{ label: '开始处理', status: '处理中' }] : item.status === '处理中' && item.fields?.reply ? [{ label: '标记解决', status: '已解决' }] : [];
  return [];
}

export const fieldLabels: Record<string, string> = { region: '地区', distance: '距离（km）', altitude: '累计爬升', track: '轨迹文件', weight: '重量（g）', capacity: '容量', temperature: '舒适温标', items: '清单条目', target: '关联对象', evidence: '举报描述', client: '客户端', version: '版本', reply: '处理回复', deployment: '部署方式', availability: '可用性', bucket: '存储桶', objects: '对象数量', error: '错误', run: '执行记录', retention: '保留周期', size: '尺寸 / 大小', before: '变更前', after: '变更后', reason: '处理原因', visibility: '可见范围', joined: '注册日期', lastActive: '最近活跃', members: '同行成员', packing: '打包清单', versions: '版本历史', management: '管理范围', tools: '工具调用摘要', result: '执行结果', privacy: '数据范围', duration: '预计时长（小时）', season: '适宜季节', routeType: '路线类型', start: '起点', end: '终点', caution: '出行提醒', price: '参考价（元）', model: '型号', material: '材质', days: '适用天数' };
