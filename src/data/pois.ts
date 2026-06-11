// pois.ts — route (探索) and journey (旅程/回忆) data. Unlike the prototype's
// abstract x/y globe coords, each POI here carries real [lng, lat] so the Mapbox
// globe and SVG fallback can place them geographically.

import { Tone } from './tones';

export type JourneyStatus = 'planning' | 'ongoing' | 'completed';

export interface Companion {
  ini: string;
  name: string;
  role?: string;
  color: string;
  tone?: Tone;
  trips?: number;
  host?: boolean;
  self?: boolean;
}

export interface Poi {
  id: string;
  kind: 'route' | 'journey';
  name: string;
  region: string;
  coord: string;
  lng: number;
  lat: number;
  dist: string;
  asc: string;
  diff?: '易' | '中' | '中高' | '高';
  rating?: string;
  reviews?: number;
  tone: Tone;
  mine?: boolean;
  desc?: string;
  // journey-only
  status?: JourneyStatus;
  date?: string;
  days?: string;
  companions?: number;
  companionList?: Companion[];
  fav?: boolean;
  plannedDate?: string;
  countdown?: number;
  dayIndex?: number;
  totalDays?: number;
  routeId?: string;
}

const C = (ini: string, name: string, color: string, extra: Partial<Companion> = {}): Companion => ({
  ini,
  name,
  color,
  ...extra,
});

export const EXPLORE_POIS: Poi[] = [
  {
    id: 'e1',
    kind: 'route',
    name: '九溪烟树',
    region: '杭州 · 西湖',
    coord: '30.21 N · 120.10 E',
    lng: 120.1,
    lat: 30.21,
    dist: '6.2 km',
    asc: '+120 m',
    diff: '易',
    rating: '4.8',
    reviews: 312,
    tone: 'forest',
    desc: '西湖群山里最温柔的一段溪谷线，沿九溪十八涧一路下行，春茶时节最佳。适合作为城市周末的轻徒步。',
  },
  {
    id: 'e2',
    kind: 'route',
    name: '武功山金顶穿越',
    region: '江西 · 萍乡',
    coord: '27.46 N · 114.17 E',
    lng: 114.17,
    lat: 27.46,
    dist: '24.6 km',
    asc: '+1,640 m',
    diff: '中高',
    rating: '4.9',
    reviews: 1208,
    tone: 'ridge',
    desc: '十万亩高山草甸，云海与日出的经典三日线。金顶到发云界一路起伏，注意山顶天气多变。',
  },
  {
    id: 'e3',
    kind: 'route',
    name: '贡嘎西坡转山',
    region: '四川 · 甘孜',
    coord: '29.59 N · 101.88 E',
    lng: 101.88,
    lat: 29.59,
    dist: '38.4 km',
    asc: '+2,980 m',
    diff: '高',
    rating: '4.7',
    reviews: 642,
    tone: 'snow',
    desc: '近距离仰望蜀山之王的高海拔重装线，翻越日乌且垭口需做好高反准备。沿途冰川与海子壮丽。',
  },
  {
    id: 'e4',
    kind: 'route',
    name: '太白山鳌太段',
    region: '陕西 · 宝鸡',
    coord: '33.95 N · 107.76 E',
    lng: 107.76,
    lat: 33.95,
    dist: '18.9 km',
    asc: '+1,320 m',
    diff: '中高',
    rating: '4.6',
    reviews: 388,
    tone: 'rock',
    desc: '秦岭主脊上的石海与冷杉林，拔仙台俯瞰云海。气候多变，务必关注天气窗口。',
  },
  {
    id: 'e5',
    kind: 'route',
    name: '哈巴雪山大本营',
    region: '云南 · 香格里拉',
    coord: '27.36 N · 100.10 E',
    lng: 100.1,
    lat: 27.36,
    dist: '9.8 km',
    asc: '+980 m',
    diff: '中',
    rating: '4.8',
    reviews: 521,
    tone: 'moss',
    desc: '从哈巴村到大本营的入门级雪山徒步，杜鹃林与高山牧场交替，是攀登前的经典适应线。',
  },
  {
    id: 'e6',
    kind: 'route',
    name: '雨崩神瀑',
    region: '云南 · 德钦',
    coord: '28.40 N · 98.85 E',
    lng: 98.85,
    lat: 28.4,
    dist: '14.2 km',
    asc: '+760 m',
    diff: '中',
    rating: '4.9',
    reviews: 2033,
    tone: 'river',
    desc: '梅里雪山脚下的转山支线，神瀑、冰湖与原始森林。村落住宿便利，适合四到五天慢走。',
  },
  {
    id: 'e7',
    kind: 'route',
    name: '玉龙雪山云杉坪',
    region: '云南 · 丽江',
    coord: '27.10 N · 100.19 E',
    lng: 100.19,
    lat: 27.1,
    dist: '5.4 km',
    asc: '+320 m',
    diff: '易',
    rating: '4.5',
    reviews: 1840,
    tone: 'dusk',
    desc: '云杉坪高山草甸与雪山倒影，海拔不高但景观出片。适合带家人的半日徒步。',
  },
  {
    id: 'e8',
    kind: 'route',
    name: '长白山西坡',
    region: '吉林 · 白山',
    coord: '42.00 N · 128.06 E',
    lng: 128.06,
    lat: 42.0,
    dist: '11.6 km',
    asc: '+640 m',
    diff: '中',
    rating: '4.7',
    reviews: 970,
    tone: 'night',
    desc: '西坡阶梯通往天池，火山地貌与高山花海。夏季云开见池的概率更高。',
  },
];

export const MEMORY_POIS: Poi[] = [
  {
    id: 'm1',
    kind: 'journey',
    status: 'planning',
    name: '四姑娘二峰',
    region: '四川 · 阿坝',
    coord: '31.10 N · 102.90 E',
    lng: 102.9,
    lat: 31.1,
    dist: '18.4 km',
    asc: '+2,140 m',
    days: '3 天',
    date: '2026 · 6 月',
    plannedDate: '6 月 24 日',
    countdown: 14,
    companions: 4,
    tone: 'snow',
    fav: true,
    totalDays: 3,
    companionList: [
      C('林', '林夕', '#FF5C3A', { role: '领队', trips: 5, host: true }),
      C('周', '老周', '#0A84FF', { trips: 2 }),
      C('M', 'Mia', '#FF9F0A', { trips: 1 }),
      C('赵', '赵磊', '#34C759', { trips: 3 }),
    ],
    desc: '六月的二峰雪线还在，计划三天完成大本营适应与冲顶。重点准备高海拔保暖与冰爪。',
  },
  {
    id: 'm2',
    kind: 'journey',
    status: 'ongoing',
    name: '武功山三日穿越',
    region: '江西 · 萍乡',
    coord: '27.46 N · 114.17 E',
    lng: 114.17,
    lat: 27.46,
    dist: '24.6 km',
    asc: '+1,640 m',
    days: '3 天',
    date: '记录到 Day 2/3',
    dayIndex: 2,
    totalDays: 3,
    companions: 3,
    tone: 'ridge',
    routeId: 'e2',
    companionList: [
      C('林', '林深见鹿', '#2E7D5B', { role: '领队', host: true }),
      C('周', '老周', '#0A84FF'),
      C('M', 'Mia', '#FF9F0A'),
    ],
    desc: '正走在金顶到发云界的草甸上，昨夜扎营看到了完整的银河。今天目标是绝望坡前的营地。',
  },
  {
    id: 'm3',
    kind: 'journey',
    status: 'completed',
    name: '贡嘎西坡转山',
    region: '四川 · 甘孜',
    coord: '29.59 N · 101.88 E',
    lng: 101.88,
    lat: 29.59,
    dist: '38.4 km',
    asc: '+2,980 m',
    days: '5 天',
    date: '2025 · 10 月',
    companions: 5,
    tone: 'snow',
    fav: true,
    totalDays: 5,
    routeId: 'e3',
    companionList: [
      C('林', '林夕', '#FF5C3A', { role: '领队', host: true }),
      C('周', '老周', '#0A84FF'),
      C('M', 'Mia', '#FF9F0A'),
      C('雪', '雪线之上', '#5E5CE6'),
      C('J', 'Jay', '#64D2FF'),
    ],
    desc: '翻越日乌且垭口那天遇到了完美的日照金山。五天高海拔重装，是迄今最难也最难忘的一段。',
  },
  {
    id: 'm4',
    kind: 'journey',
    status: 'completed',
    name: '雨崩神瀑',
    region: '云南 · 德钦',
    coord: '28.40 N · 98.85 E',
    lng: 98.85,
    lat: 28.4,
    dist: '14.2 km',
    asc: '+760 m',
    days: '4 天',
    date: '2025 · 5 月',
    companions: 2,
    tone: 'river',
    totalDays: 4,
    routeId: 'e6',
    companionList: [
      C('陈', '陈泽宇', '#FF7A55', { self: true, host: true }),
      C('周', '老周', '#0A84FF'),
    ],
    desc: '从西当温泉一路走到神瀑，雨季的森林格外通透。住在雨崩下村，慢悠悠走了四天。',
  },
  {
    id: 'm5',
    kind: 'journey',
    status: 'completed',
    name: '哈巴雪山大本营',
    region: '云南 · 香格里拉',
    coord: '27.36 N · 100.10 E',
    lng: 100.1,
    lat: 27.36,
    dist: '9.8 km',
    asc: '+980 m',
    days: '2 天',
    date: '2024 · 11 月',
    companions: 0,
    tone: 'moss',
    totalDays: 2,
    routeId: 'e5',
    companionList: [C('陈', '陈泽宇', '#FF7A55', { self: true, host: true })],
    desc: '独行的一次适应性徒步，从哈巴村慢慢爬到大本营。云海在脚下翻涌，安静得只剩风声。',
  },
];

// favourite + status helpers
export const STATUS_LABEL: Record<JourneyStatus, string> = {
  planning: '计划中',
  ongoing: '进行中',
  completed: '已完成',
};

export const STATUS_COLOR = (s: JourneyStatus, accent: string, dark: boolean): string => {
  if (s === 'planning') return '#5FB3FF';
  if (s === 'ongoing') return accent;
  return dark ? '#9AA0A6' : '#7E7E84';
};
