import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import { ChecklistEntry, RecordItem } from './mockData';
import { checklistTotals, checklistCategories } from './resourceEditorModel';

export function ChecklistEditor({ items, onChange, gear }: { items: ChecklistEntry[]; onChange: (items: ChecklistEntry[]) => void; gear: RecordItem[] }) {
  const [gearId, setGearId] = useState('');
  const available = gear.filter(item => item.status === '已发布');
  const totals = checklistTotals(items);
  const update = (id: string, patch: Partial<ChecklistEntry>) => onChange(items.map(item => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, direction: number) => {
    const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; onChange(next);
  };
  const addFromGear = () => {
    const source = available.find(item => item.id === gearId);
    if (!source) return;
    const existing = items.find(item => item.gearId === source.id);
    if (existing) { update(existing.id, { quantity: existing.quantity + 1 }); return; }
    onChange([...items, { id: crypto.randomUUID(), gearId: source.id, name: source.name, category: source.category, quantity: 1, weightGrams: source.fields?.weight ? Number(source.fields.weight) : null, required: true }]);
  };
  return <section className="checklist-editor">
    <div className="section-head"><h3>装备条目</h3><span className="badge">{items.length} 项</span></div>
    <div className="catalog-toolbar"><select aria-label="选择公共装备" value={gearId} onChange={event => setGearId(event.target.value)}><option value="">选择公共装备</option>{available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={!gearId} onClick={addFromGear}><Plus size={14} color="currentColor" />添加</button><button type="button" onClick={() => onChange([...items, { id: crypto.randomUUID(), name: '', category: '其他', quantity: 1, weightGrams: null, required: true }])}><Plus size={14} color="currentColor" />自定义条目</button></div>
    {items.length === 0 && <div className="empty">暂无装备条目</div>}
    {items.map((item, index) => <div className="packing-editor-row" key={item.id}>
      <div className="packing-row-title"><span className="row-index">{String(index + 1).padStart(2, '0')}</span><input aria-label={`条目 ${index + 1} 名称`} maxLength={120} value={item.name} onChange={event => update(item.id, { name: event.target.value })} placeholder="装备名称" /><div className="row-tools"><button type="button" className="icon-button" title="上移" aria-label={`上移条目 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} color="currentColor" /></button><button type="button" className="icon-button" title="下移" aria-label={`下移条目 ${index + 1}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} color="currentColor" /></button><button type="button" className="icon-button danger" title="删除条目" aria-label={`删除条目 ${index + 1}`} onClick={() => onChange(items.filter(row => row.id !== item.id))}><Trash2 size={14} color="currentColor" /></button></div></div>
      <div className="packing-row-fields"><label>分类<select value={item.category} onChange={event => update(item.id, { category: event.target.value })}>{checklistCategories.map(category => <option key={category}>{category}</option>)}</select></label><label>数量<input aria-label={`条目 ${index + 1} 数量`} type="number" min={1} max={999} step={1} value={item.quantity || ''} onChange={event => update(item.id, { quantity: Number(event.target.value) })} /></label><label>单件重量（g）<input aria-label={`条目 ${index + 1} 重量`} type="number" min={0} max={50000} step="any" value={item.weightGrams ?? ''} placeholder="未填写" onChange={event => update(item.id, { weightGrams: event.target.value === '' ? null : Number(event.target.value) })} /></label><label className="required-item"><input type="checkbox" checked={item.required} onChange={event => update(item.id, { required: event.target.checked })} />必带</label></div>
    </div>)}
    <div className="packing-totals"><span>{totals.quantity} 件装备</span><strong>{(totals.weight / 1000).toFixed(2)} kg</strong>{totals.unknown > 0 && <small>{totals.unknown} 项重量未填写</small>}</div>
  </section>;
}
