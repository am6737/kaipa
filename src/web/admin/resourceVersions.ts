import { RecordItem, ResourceRelease, ResourceSection, ResourceSnapshot } from './mockData';
import { initialChecklist, initialResourceValues, validateResource } from './resourceEditorModel';

export function resourceSnapshot(record: ResourceSnapshot): ResourceSnapshot {
  const fields = { ...record.fields };
  delete fields.reason;
  return structuredClone({ name: record.name, detail: record.detail, owner: record.owner, category: record.category, image: record.image || '', fields, checklistItems: record.checklistItems, routeStops: record.routeStops });
}
export function resourceRelease(record: RecordItem): ResourceRelease {
  if (record.release) return record.release;
  const snapshot = resourceSnapshot(record);
  return record.status === '草稿' ? { revision: 0, draft: snapshot, versions: [] } : { revision: 0, versions: [{ number: 1, snapshot, date: record.date, author: 'Kaipa 编辑部', note: '初始发布版本' }] };
}
export function editableResource(record: RecordItem): RecordItem {
  return { ...record, ...(resourceRelease(record).draft ?? resourceSnapshot(record)), status: '草稿' };
}
function checkRevision(record: RecordItem, expected: number) {
  const release = resourceRelease(record);
  if (release.revision !== expected) throw new Error('资源已发生变化，请重新打开后操作。');
  return release;
}
export function saveResourceDraft(record: RecordItem, content: ResourceSnapshot, expected: number, date: string): RecordItem {
  const release = checkRevision(record, expected);
  const draft = resourceSnapshot(content);
  return { ...record, ...(!release.versions.length ? draft : {}), date, release: { ...release, revision: release.revision + 1, draft } };
}
export function validateSnapshot(section: ResourceSection, snapshot: ResourceSnapshot) {
  const item: RecordItem = { ...snapshot, id: 'validation', date: '', status: '草稿' };
  const errors = validateResource(section, initialResourceValues(section, item), initialChecklist(item), item.routeStops ?? []);
  return Object.values(errors).filter(Boolean);
}
export function publishResource(record: RecordItem, section: ResourceSection, expected: number, note: string, date: string): RecordItem {
  const release = checkRevision(record, expected);
  if (!release.draft) throw new Error('没有待发布草稿。');
  if (!note.trim()) throw new Error('请填写发布说明。');
  const errors = validateSnapshot(section, release.draft);
  if (errors.length) throw new Error(errors.join('；'));
  const previous = release.versions.at(-1);
  if (previous && resourceDiff(previous.snapshot, release.draft, {}).length === 0) throw new Error('草稿与当前版本一致，无需发布。');
  const number = (release.versions.at(-1)?.number ?? 0) + 1;
  const snapshot = resourceSnapshot(release.draft);
  return { ...record, ...snapshot, status: '已发布', date, release: { revision: release.revision + 1, versions: [...release.versions, { number, snapshot, date, author: 'Kaipa Admin', note: note.trim() }] } };
}
export function discardResourceDraft(record: RecordItem, expected: number, date: string): RecordItem {
  const release = checkRevision(record, expected);
  if (!release.draft || !release.versions.length) throw new Error('首次发布前的草稿不能放弃。');
  return { ...record, date, release: { revision: release.revision + 1, versions: release.versions } };
}
export function rollbackResource(record: RecordItem, number: number, expected: number, note: string, date: string): RecordItem {
  const release = checkRevision(record, expected);
  if (release.draft) throw new Error('请先发布或放弃待发布草稿。');
  if (record.status !== '已发布') throw new Error('已下架资源不能直接回滚上线。');
  const target = release.versions.find(version => version.number === number);
  if (!target || number === release.versions.at(-1)?.number) throw new Error('请选择一个历史版本。');
  if (!note.trim()) throw new Error('请填写回滚原因。');
  const snapshot = resourceSnapshot(target.snapshot);
  const next = (release.versions.at(-1)?.number ?? 0) + 1;
  return { ...record, ...snapshot, date, release: { revision: release.revision + 1, versions: [...release.versions, { number: next, snapshot, date, author: 'Kaipa Admin', note: note.trim(), restoredFrom: number }] } };
}

type Difference = { key: string; label: string; before: string; after: string; image?: boolean };
export function resourceDiff(before: ResourceSnapshot | undefined, after: ResourceSnapshot, labels: Record<string, string>): Difference[] {
  const flatten = (snapshot?: ResourceSnapshot): Record<string, string> => {
    if (!snapshot) return {};
    const fields = Object.fromEntries(Object.entries(snapshot.fields ?? {}).filter(([key, value]) => key !== 'reason' && value.trim() !== ''));
    const result: Record<string, string> = { name: snapshot.name, detail: snapshot.detail, owner: snapshot.owner, category: snapshot.category, image: snapshot.image || '', ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`field:${key}`, value])) };
    if (snapshot.checklistItems) {
      delete result['field:items'];
      result.items = snapshot.checklistItems.map((item, index) => `${index + 1}. ${item.name}　${item.category}　数量 ${item.quantity}　${item.weightGrams === null ? '重量未知' : `${item.weightGrams} g`}　${item.required ? '必带' : '选带'}`).join('\n');
    } else if (snapshot.fields?.items) { result.items = snapshot.fields.items; delete result['field:items']; }
    result.stops = (snapshot.routeStops ?? []).map((stop, index) => `${index + 1}. ${stop.name}${stop.note ? `　${stop.note}` : ''}`).join('\n');
    return result;
  };
  const oldValues = flatten(before); const newValues = flatten(after);
  const names: Record<string, string> = { name: '名称', detail: '简介', owner: '归属 / 品牌', category: '分类 / 场景', image: '封面图片', items: '清单条目与顺序', stops: '途经点与顺序' };
  return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])].filter(key => (oldValues[key] ?? '') !== (newValues[key] ?? '')).map(key => ({ key, label: key.startsWith('field:') ? labels[key.slice(6)] ?? key.slice(6) : names[key] ?? key, before: oldValues[key] ?? '', after: newValues[key] ?? '', image: key === 'image' }));
}
