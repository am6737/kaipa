import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, ImagePlus, Pencil, Plus, Save, Trash2, Upload } from 'lucide-react-native';
import { ChecklistEntry, RecordItem, ResourceExtras, ResourceSection, RouteStop } from './mockData';
import { ChecklistEditor } from './ChecklistEditor';
import { checklistTotals, gearCategories, initialChecklist, initialResourceValues, resourceCovers, validateResource } from './resourceEditorModel';

type FieldProps = { label: string; name: string; value: string; onChange: (name: string, value: string) => void; error?: string; options?: string[]; type?: 'number' | 'textarea'; required?: boolean; min?: number; max?: number; step?: string };
function Field({ label, name, value, onChange, error, options, type, required, min, max, step }: FieldProps) {
  const id = useId();
  const props = { id, value, required, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(name, event.target.value) };
  return <label className="form-field" htmlFor={id}><span>{label}{required && <span className="required"> *</span>}</span>{options ? <select {...props}>{options.map(option => <option key={option}>{option}</option>)}</select> : type === 'textarea' ? <textarea {...props} rows={3} maxLength={4000} /> : <input {...props} type={type ?? 'text'} min={min} max={max} step={step ?? 'any'} maxLength={200} />}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</label>;
}

export function ResourcePreview({ section, values, image, items, stops }: { section: ResourceSection; values: Record<string, string>; image: string; items: ChecklistEntry[]; stops: RouteStop[] }) {
  const totals = checklistTotals(items);
  const metrics = section === 'routes' ? [[values.distance || '—', 'km'], [values.altitude || '—', 'm 爬升'], [values.duration || '—', '小时']]
    : section === 'gear' ? [[values.weight || '—', 'g'], [values.price ? `¥${values.price}` : '—', '参考价']] : [[String(items.length), '项'], [(totals.weight / 1000).toFixed(2), 'kg']];
  return <div className="resource-preview"><div className="preview-caption">内容预览</div>{image ? <img className="resource-cover" src={image} alt={values.name || '资源封面'} /> : <div className="resource-cover no-cover"><ImagePlus size={24} color="currentColor" /></div>}<span className="badge">{values.category}</span><h3>{values.name || '未命名资源'}</h3><p>{section === 'gear' ? [values.owner, values.model].filter(Boolean).join(' ') : values.region || `${values.days || 1} 天`}</p><div className="preview-metrics">{metrics.map(([value, unit], index) => <div key={index}><strong>{value}</strong><small>{unit}</small></div>)}</div><p className="preview-description">{values.detail || '—'}</p>
    {section === 'routes' && <>{stops.length > 0 && <ol className="preview-stops">{stops.map(stop => <li key={stop.id}><strong>{stop.name || '未命名途经点'}</strong>{stop.note && <small>{stop.note}</small>}</li>)}</ol>}{values.caution && <div className="preview-note"><strong>出行提醒</strong><p>{values.caution}</p></div>}</>}
    {section === 'gear' && <dl className="preview-specs">{[['材质', values.material], ['容量', values.capacity], ['温标', values.temperature], ['尺寸', values.size]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {section === 'checklists' && <>{totals.unknown > 0 && <small>{totals.unknown} 项重量未填写</small>}<ul className="preview-items">{items.map(item => <li key={item.id}><span>{item.name || '未命名装备'}{item.required && <small>必带</small>}</span><span>×{item.quantity}</span></li>)}</ul></>}
  </div>;
}

export function ResourceEditor({ section, record, gear, onSave, onCancel, onDirtyChange }: { section: ResourceSection; record?: RecordItem; gear: RecordItem[]; onSave: (values: Record<string, string>, extras: ResourceExtras) => void; onCancel: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [values, setValues] = useState(() => initialResourceValues(section, record));
  const [items, setItems] = useState(() => initialChecklist(record));
  const [stops, setStops] = useState<RouteStop[]>(() => record?.routeStops?.map(stop => ({ ...stop })) ?? []);
  const [image, setImage] = useState(record?.image ?? '');
  const [mode, setMode] = useState('edit');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletedItem, setDeletedItem] = useState<{ item: ChecklistEntry; index: number } | null>(null);
  const initial = useRef(JSON.stringify({ values, items, stops, image }));
  const formRef = useRef<HTMLFormElement>(null);
  const uploadVersion = useRef(0);
  const dirty = initial.current !== JSON.stringify({ values, items, stops, image });
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { uploadVersion.current++; }, []);
  const set = (name: string, value: string) => { setValues(previous => ({ ...previous, [name]: value })); setErrors(previous => ({ ...previous, [name]: '' })); };
  const field = (name: string, label: string, extra: Partial<FieldProps> = {}) => <Field name={name} label={label} value={values[name] ?? ''} onChange={set} error={errors[name]} {...extra} />;
  const selectImage = (url: string) => { uploadVersion.current++; setUploading(false); setImage(url); setImageError(''); };
  const upload = async (file?: File) => {
    if (!file) return;
    const version = ++uploadVersion.current;
    setImageError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setImageError('请选择不超过 2 MB 的 JPG、PNG 或 WebP 图片'); setUploading(false); return; }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      await new Promise<void>((resolve, reject) => { const bitmap = new Image(); bitmap.onload = () => resolve(); bitmap.onerror = reject; bitmap.src = data; });
      if (uploadVersion.current === version) setImage(data);
    } catch { if (uploadVersion.current === version) setImageError('图片无法读取，请更换文件'); }
    finally { if (uploadVersion.current === version) setUploading(false); }
  };
  const changeItems = (next: ChecklistEntry[]) => {
    if (next.length < items.length) { const index = items.findIndex(item => !next.some(row => row.id === item.id)); if (index >= 0) setDeletedItem({ item: items[index], index }); }
    setItems(next); setErrors(previous => ({ ...previous, items: '' }));
  };
  return <form ref={formRef} className="resource-editor" data-mode={mode} noValidate onSubmit={event => {
    event.preventDefault();
    const nextErrors = validateResource(section, values, items, stops);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setMode('edit'); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid=true], .editor-error')?.focus()); return; }
    const allowed = section === 'routes' ? ['name', 'detail', 'owner', 'category', 'region', 'distance', 'altitude', 'duration', 'season', 'routeType', 'start', 'end', 'caution'] : section === 'gear' ? ['name', 'detail', 'owner', 'category', 'weight', 'price', 'model', 'material', 'capacity', 'temperature', 'size'] : ['name', 'detail', 'owner', 'category', 'days'];
    onSave(Object.fromEntries(allowed.map(key => [key, values[key].trim()])), { image, ...(section === 'checklists' ? { checklistItems: items.map(item => ({ ...item, name: item.name.trim() })) } : {}), ...(section === 'routes' ? { routeStops: stops.map(stop => ({ ...stop, name: stop.name.trim(), note: stop.note.trim() })) } : {}) });
  }}>
    <div className="resource-toolbar"><span className="badge">{record?.id ? record.status : '新草稿'}</span><div className="segmented" role="group" aria-label="编辑模式"><button type="button" aria-pressed={mode === 'edit'} className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}><Pencil size={13} color="currentColor" />编辑</button><button type="button" aria-pressed={mode === 'preview'} className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}><Eye size={13} color="currentColor" />预览</button></div></div>
    <div className="resource-layout"><div className="editor-fields">
      <section className="editor-section"><h3>基础信息</h3>{field('name', '名称', { required: true })}{field('detail', '简介', { type: 'textarea', required: true })}<div className="field-grid">{field('category', section === 'routes' ? '难度' : section === 'gear' ? '分类' : '场景', { options: section === 'routes' ? ['入门', '进阶', '挑战'] : section === 'gear' ? gearCategories : ['单日徒步', '多日徒步', '露营', '骑行'] })}{section === 'gear' ? field('owner', '品牌', { required: true }) : field('owner', '维护者')}</div></section>
      {section === 'routes' && <><section className="editor-section"><h3>路线参数</h3>{field('region', '地区', { required: true })}<div className="field-grid">{field('distance', '距离（km）', { type: 'number', min: .1, max: 1000, required: true })}{field('altitude', '累计爬升（m）', { type: 'number', min: 0, max: 20000 })}{field('duration', '预计时长（小时）', { type: 'number', min: .1, max: 1000 })}{field('routeType', '路线类型', { options: ['环线', '往返', '穿越'] })}{field('start', '起点')}{field('end', '终点')}{field('season', '适宜季节', { options: ['全年', '春季', '夏季', '秋季', '冬季', '春秋'] })}</div>{field('caution', '出行提醒', { type: 'textarea' })}</section>
        <section className="editor-section"><div className="section-head"><h3>途经点</h3><button type="button" onClick={() => setStops([...stops, { id: crypto.randomUUID(), name: '', note: '' }])}><Plus size={14} color="currentColor" />添加途经点</button></div>{!stops.length && <p>暂无途经点</p>}{stops.map((stop, index) => <div className="stop-editor" key={stop.id}><div className="packing-row-title"><span className="row-index">{index + 1}</span><input aria-label={`途经点 ${index + 1} 名称`} maxLength={120} value={stop.name} onChange={event => setStops(stops.map(row => row.id === stop.id ? { ...row, name: event.target.value } : row))} placeholder="途经点名称" /><div className="row-tools">{[-1, 1].map(direction => <button key={direction} type="button" className="icon-button" title={direction === -1 ? '上移' : '下移'} aria-label={`${direction === -1 ? '上移' : '下移'}途经点 ${index + 1}`} disabled={index + direction < 0 || index + direction >= stops.length} onClick={() => { const next = [...stops]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setStops(next); }}>{direction === -1 ? <ArrowUp size={14} color="currentColor" /> : <ArrowDown size={14} color="currentColor" />}</button>)}<button type="button" className="icon-button danger" title="删除途经点" aria-label={`删除途经点 ${index + 1}`} onClick={() => setStops(stops.filter(row => row.id !== stop.id))}><Trash2 size={14} color="currentColor" /></button></div></div><input aria-label={`途经点 ${index + 1} 备注`} maxLength={300} value={stop.note} onChange={event => setStops(stops.map(row => row.id === stop.id ? { ...row, note: event.target.value } : row))} placeholder="补给、交通或营地备注" /></div>)}</section></>}
      {section === 'gear' && <section className="editor-section"><h3>规格参数</h3><div className="field-grid">{field('model', '型号')}{field('weight', '重量（g）', { type: 'number', required: true, min: 0, max: 50000 })}{field('price', '参考价（元）', { type: 'number', min: 0, max: 1000000 })}{field('material', '材质')}{field('capacity', '容量')}{field('size', '尺寸')}{values.category === '睡眠' && field('temperature', '舒适温标')}</div></section>}
      {section === 'checklists' && <section className="editor-section">{field('days', '适用天数', { type: 'number', min: 1, max: 365, step: '1' })}<ChecklistEditor items={items} onChange={changeItems} gear={gear} />{deletedItem && <button type="button" className="link" onClick={() => { setItems(current => { const next = [...current]; next.splice(Math.min(deletedItem.index, next.length), 0, deletedItem.item); return next; }); setDeletedItem(null); }}>撤销最近一次删除</button>}</section>}
      <section className="editor-section"><h3>{section === 'gear' ? '装备图片' : '封面图片'}</h3><div className="cover-options">{section !== 'gear' && resourceCovers.map(cover => <button key={cover.name} type="button" className={image === cover.url ? 'active' : ''} aria-label={`选择${cover.name}封面`} aria-pressed={image === cover.url} title={cover.name} onClick={() => selectImage(cover.url)}><img src={cover.url} alt={cover.name} /></button>)}<label className="image-upload"><Upload size={17} color="currentColor" /><span>{uploading ? '读取中…' : '选择图片'}</span><input aria-label="上传图片" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>{image && <button type="button" className="icon-button danger" title="移除图片" aria-label="移除图片" onClick={() => selectImage('')}><Trash2 size={16} color="currentColor" /></button>}</div>{imageError && <p className="field-error" role="alert">{imageError}</p>}</section>
    </div><aside className="editor-preview"><ResourcePreview section={section} values={values} image={image} items={items} stops={stops} /></aside></div>
    {Object.values(errors).some(Boolean) && <div tabIndex={-1} className="editor-error" role="alert">{Object.values(errors).filter(Boolean).join('；')}</div>}
    <div className="resource-footer"><small>{dirty ? '有未保存的修改' : '尚无修改'}</small><div className="row"><button type="button" onClick={onCancel}>取消</button><button type="submit" className="primary" disabled={uploading}><Save size={15} color="currentColor" />{record?.id ? '保存修改' : '保存草稿'}</button></div></div>
  </form>;
}
