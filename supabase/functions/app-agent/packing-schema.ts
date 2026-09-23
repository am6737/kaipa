import { z } from 'npm:zod@4.1.12';

export const packingItem = z.object({
  name: z.string().min(1).max(120).describe('可直接购买、准备和勾选的简短品名。不得使用“饮用水、路餐、食物、急救包、个人药品、换洗衣物”等泛称；移动电源等必须把关键容量写入 attributes，不要把容量、重量或常识属性写进名称'),
  attributes: z.array(z.object({
    name: z.string().min(1).max(24).describe('字段名，例如容量、接口、单份净重、温标或 R 值'),
    value: z.string().min(1).max(60).describe('字段值'),
  })).max(6).nullable().default(null).describe('仅填写会改变购买选择或安全性能的关键自定义字段；不要填写可调亮度、带帽檐、防紫外线、独立包装、中号等常识或非必要细节'),
  categoryName: z.string().max(60).nullable().default(null).describe('物品所属类别，例如饮水、食物、医疗或电子'),
  quantity: z.number().int().min(1).max(99).default(1).describe('需要携带的实际件数；相同规格物品用此字段表示数量'),
  weightKg: z.number().min(0).max(100).describe('单件实际携带重量（千克），必须写入重量字段；离线地图、证件等无重量的物品写 0；食品包装克重等购买规格可同时保留在 attributes 中'),
  weightEstimated: z.boolean().describe('没有确切型号或实测重量时为 true，有真实重量依据时为 false'),
  carryStatus: z.enum(['packed', 'worn', 'consumable']).describe('重量归属：背包内固定装备用 packed，行进时穿在身上或脚上的衣物鞋帽用 worn，途中会消耗的食品、饮水和燃料用 consumable'),
  estimatedEnergyKcalPerUnit: z.number().positive().max(3000).nullable().default(null).describe('仅食品填写的内部单份热量估算，只用于检查路餐数量，不会展示或写入清单'),
});

export const packingPlanProfile = z.object({
  accommodation: z.enum(['day_trip', 'indoors', 'camping', 'unknown']).describe('当天往返、室内住宿、露营或未知'),
  waterRefill: z.enum(['none', 'treated', 'natural', 'unknown']).describe('无补给、可靠处理水源、需净化的天然水源或未知'),
  mealPreparation: z.enum(['no_cook', 'cook', 'provided', 'unknown']).describe('无需烹饪、自行开火、住宿或商家提供、未知'),
  conditions: z.array(z.enum(['hot', 'cold', 'wet', 'snow', 'high_altitude'])).max(5).nullable().default(null),
});

export type PackingItem = z.infer<typeof packingItem>;
export type PackingProfile = z.infer<typeof packingPlanProfile>;
