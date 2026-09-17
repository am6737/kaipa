import { ChecklistEntry, RecordItem, ResourceSection, RouteStop } from './mockData';

export const isResourceSection = (value: string): value is ResourceSection => ['routes', 'gear', 'checklists'].includes(value);
export const gearCategories = ['背负', '睡眠', '炊具', '服装', '安全'];
export const checklistCategories = [...gearCategories, '补给', '其他'];
export const resourceCovers = [
  { name: '山地', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&h=500&fit=crop' },
  { name: '森林', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=900&h=500&fit=crop' },
];
export function initialResourceValues(section: ResourceSection, record?: RecordItem): Record<string, string> {
  const fields = record?.fields ?? {};
  return {
    name: record?.name ?? '', detail: record?.detail ?? '', owner: record?.owner ?? (section === 'gear' ? '' : 'Kaipa 编辑部'),
    category: record?.category ?? (section === 'routes' ? '入门' : section === 'gear' ? '背负' : '单日徒步'),
    region: '', distance: '', altitude: '', duration: '', season: '全年', routeType: '环线', start: '', end: '', caution: '',
    weight: '', price: '', model: '', material: '', capacity: '', temperature: '', size: '', days: '1', ...fields,
    // Legacy mock elevation values include units; the editor uses a numeric field.
    ...(fields.altitude ? { altitude: fields.altitude.replace(/[,\s]|m$/g, '') } : {}),
  };
}
export function initialChecklist(record?: RecordItem): ChecklistEntry[] {
  if (record?.checklistItems) return record.checklistItems.map(item => ({ ...item }));
  return (record?.fields?.items ?? '').split('\n').filter(Boolean).map((name, index) => ({ id: `legacy-${index}`, name, category: '其他', quantity: 1, weightGrams: null, required: true }));
}
export function checklistTotals(items: ChecklistEntry[]) {
  return { quantity: items.reduce((sum, item) => sum + item.quantity, 0), weight: items.reduce((sum, item) => sum + (item.weightGrams ?? 0) * item.quantity, 0), unknown: items.filter(item => item.weightGrams === null).length };
}
export function validateResource(section: ResourceSection, values: Record<string, string>, items: ChecklistEntry[], stops: RouteStop[]) {
  const errors: Record<string, string> = {};
  for (const key of ['name', 'detail', ...(section === 'routes' ? ['region', 'distance'] : section === 'gear' ? ['owner', 'weight'] : ['days'])]) if (!values[key]?.trim()) errors[key] = '此项不能为空';
  const ranges: [string, number, number][] = section === 'routes' ? [['distance', .1, 1000], ['altitude', 0, 20000], ['duration', .1, 1000]] : section === 'gear' ? [['weight', 0, 50000], ['price', 0, 1000000]] : [['days', 1, 365]];
  for (const [key, min, max] of ranges) if (values[key] !== '' && (!Number.isFinite(Number(values[key])) || Number(values[key]) < min || Number(values[key]) > max)) errors[key] = `请输入 ${min} 至 ${max} 之间的数值`;
  if (section === 'checklists') {
    if (!Number.isInteger(Number(values.days))) errors.days = '天数必须为整数';
    if (!items.length) errors.items = '请至少添加一项装备';
    if (items.some(item => !item.name.trim() || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || (item.weightGrams !== null && (!Number.isFinite(item.weightGrams) || item.weightGrams < 0 || item.weightGrams > 50000)))) errors.items = '请检查条目名称、数量（1–999）及单件重量（0–50000 g）';
  }
  if (section === 'routes' && stops.some(stop => !stop.name.trim())) errors.stops = '请填写每个途经点的名称';
  return errors;
}
