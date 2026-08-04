import type { JourneyPackingItemInput } from './journeyPacking';

export interface RecommendedPackingTemplate {
  id: string;
  name: string;
  description: string;
  items: JourneyPackingItemInput[];
}

const item = (name: string, categoryName: string, quantity = 1, weightKg?: number): JourneyPackingItemInput => ({
  sourceType: 'recommendedTemplate',
  name,
  categoryName,
  quantity,
  weightKg,
});

export const RECOMMENDED_PACKING_TEMPLATES: RecommendedPackingTemplate[] = [
  {
    id: 'day-hike',
    name: '周末轻徒步',
    description: '适合单日低海拔路线的基础装备',
    items: [
      item('日用背包', '背负系统', 1, 0.7), item('头灯', '照明', 1, 0.09), item('雨衣', '穿戴', 1, 0.25),
      item('保暖层', '穿戴', 1, 0.35), item('水壶', '饮水', 1, 0.18), item('饮用水', '饮水', 2, 1),
      item('路餐', '食物'), item('急救包', '医疗', 1, 0.2), item('充电宝', '电子', 1, 0.2),
      item('防晒用品', '防护'), item('垃圾袋', '其他', 2), item('纸巾', '其他'),
    ],
  },
  {
    id: 'three-day-trek',
    name: '三天重装徒步',
    description: '包含露营、睡眠、炊事和应急装备',
    items: [
      item('重装背包', '背负系统', 1, 1.4), item('帐篷', '庇护系统', 1, 1.6), item('地布', '庇护系统', 1, 0.18),
      item('睡袋', '睡眠系统', 1, 0.9), item('防潮垫', '睡眠系统', 1, 0.45), item('炉头', '炊事系统', 1, 0.09),
      item('气罐', '炊事系统', 1, 0.23), item('锅具', '炊事系统', 1, 0.45), item('头灯', '照明', 1, 0.09),
      item('雨衣', '穿戴', 1, 0.25), item('保暖层', '穿戴', 1, 0.4), item('备用袜子', '穿戴', 2),
      item('饮用水', '饮水', 2, 1), item('三日食物', '食物'), item('急救包', '医疗', 1, 0.25), item('充电宝', '电子', 1, 0.25),
    ],
  },
  {
    id: 'rainy-hike',
    name: '雨季徒步',
    description: '强化防水、保暖和装备干燥管理',
    items: [
      item('防水背包罩', '防护'), item('冲锋衣', '穿戴'), item('雨裤', '穿戴'), item('防水袜', '穿戴'),
      item('保暖层', '穿戴'), item('速干衣', '穿戴', 2), item('防水袋', '收纳', 3), item('备用衣物', '穿戴'),
      item('头灯', '照明'), item('急救包', '医疗'), item('充电宝', '电子'), item('毛巾', '其他'),
    ],
  },
  {
    id: 'high-altitude',
    name: '高海拔准备',
    description: '覆盖强保暖、防晒和应急需求',
    items: [
      item('羽绒服', '穿戴'), item('保暖帽', '穿戴'), item('保暖手套', '穿戴'), item('墨镜', '防护'),
      item('高倍防晒霜', '防护'), item('保温水壶', '饮水'), item('头灯', '照明'), item('急救包', '医疗'),
      item('个人药品', '医疗'), item('能量食品', '食物'), item('充电宝', '电子'), item('救生毯', '应急'),
    ],
  },
];
