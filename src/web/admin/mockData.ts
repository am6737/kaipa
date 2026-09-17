export type ChecklistEntry = { id: string; name: string; category: string; quantity: number; weightGrams: number | null; required: boolean; gearId?: string };
export type RouteStop = { id: string; name: string; note: string };
export type ResourceSection = 'routes' | 'gear' | 'checklists';
export type ResourceExtras = { image: string; checklistItems?: ChecklistEntry[]; routeStops?: RouteStop[] };
export type ResourceSnapshot = Pick<RecordItem, 'name' | 'detail' | 'owner' | 'category' | 'image' | 'fields' | 'checklistItems' | 'routeStops'>;
export type ResourceVersion = { number: number; snapshot: ResourceSnapshot; date: string; author: string; note: string; restoredFrom?: number };
export type ResourceRelease = { revision: number; draft?: ResourceSnapshot; versions: ResourceVersion[] };

export type RecordItem = {
  id: string;
  name: string;
  detail: string;
  owner: string;
  category: string;
  date: string;
  status: string;
  image?: string;
  fields?: Record<string, string>;
  checklistItems?: ChecklistEntry[];
  routeStops?: RouteStop[];
  release?: ResourceRelease;
};

export type Section = 'overview' | 'users' | 'journeys' | 'routes' | 'gear' | 'checklists' | 'content' | 'reports' | 'feedback' | 'notifications' | 'ai' | 'services' | 'settings' | 'admins' | 'roles' | 'audit';
export type ListSection = Exclude<Section, 'overview' | 'settings' | 'roles'>;
const mountain = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=240&h=160&fit=crop';
const forest = 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=240&h=160&fit=crop';
export const initialRecords: Record<'users' | 'journeys' | 'content' | 'ai', RecordItem[]> = {
  journeys: [
    { id: 'J-2086', name: '武功山，追一场山野日落', detail: '江西萍乡 · 2 天 · 6 人', owner: '林间来信', category: '徒步', date: '2026-09-06 10:32', status: '进行中', image: mountain },
    { id: 'J-2085', name: '四姑娘山长坪沟穿越', detail: '四川阿坝 · 3 天 · 4 人', owner: '阿川', category: '徒步', date: '2026-09-06 09:18', status: '计划中', image: mountain },
    { id: 'J-2084', name: '安吉周末，森林露营', detail: '浙江湖州 · 2 天 · 8 人', owner: '小满', category: '露营', date: '2026-09-05 18:46', status: '计划中', image: forest },
    { id: 'J-2083', name: '环洱海的慢骑行', detail: '云南大理 · 1 天 · 2 人', owner: '拾光', category: '骑行', date: '2026-09-05 16:05', status: '已完成', image: mountain },
    { id: 'J-2082', name: '莫干山竹林轻徒步', detail: '浙江德清 · 1 天 · 5 人', owner: '北北', category: '徒步', date: '2026-09-05 14:20', status: '已完成', image: forest },
  ],
  users: [
    { id: 'U-10248', name: '林间来信', detail: 'linjian@example.com', owner: '12 次行程', category: 'iOS', date: '2026-09-06 10:32', status: '正常' },
    { id: 'U-10247', name: '阿川', detail: 'achuan@example.com', owner: '8 次行程', category: 'Android', date: '2026-09-06 09:18', status: '正常' },
    { id: 'U-10246', name: '小满', detail: 'xiaoman@example.com', owner: '3 次行程', category: 'iOS', date: '2026-09-05 18:46', status: '正常' },
    { id: 'U-10245', name: '拾光', detail: 'shiguang@example.com', owner: '6 次行程', category: 'Web', date: '2026-09-05 16:05', status: '已停用' },
  ],
  content: [
    { id: 'C-809', name: '第一次重装徒步，我的装备清单', detail: '公开分享 · 9 张图片', owner: '林间来信', category: '装备分享', date: '2026-09-06 10:25', status: '待审核', image: mountain },
    { id: 'C-808', name: '山里住一晚，就把烦恼忘掉', detail: '公开分享 · 6 张图片', owner: '小满', category: '灵感照片', date: '2026-09-06 09:45', status: '待审核', image: forest },
    { id: 'C-807', name: '长坪沟路线与补给记录', detail: '公开分享 · 4 张图片', owner: '阿川', category: '路线分享', date: '2026-09-05 18:30', status: '已通过', image: mountain },
    { id: 'C-806', name: '周末出逃计划', detail: '公开分享 · 2 张图片', owner: '北北', category: '灵感照片', date: '2026-09-05 15:12', status: '已驳回', image: forest },
  ],
  ai: [
    { id: 'AI-3021', name: '生成武功山两日行程', detail: '2,841 tokens · 3.2 秒', owner: '林间来信', category: '行程规划', date: '2026-09-06 10:32', status: '成功' },
    { id: 'AI-3020', name: '检查三日徒步装备缺项', detail: '1,206 tokens · 1.8 秒', owner: '阿川', category: '装备建议', date: '2026-09-06 10:18', status: '成功' },
    { id: 'AI-3019', name: '调整露营时间安排', detail: '请求超时 · 30.0 秒', owner: '小满', category: '行程调整', date: '2026-09-06 09:56', status: '失败' },
    { id: 'AI-3018', name: '生成环洱海骑行清单', detail: '1,932 tokens · 2.4 秒', owner: '拾光', category: '清单生成', date: '2026-09-06 09:40', status: '成功' },
  ],
};
