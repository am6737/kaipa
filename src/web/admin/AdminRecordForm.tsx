import React, { useState } from 'react';
import { Save } from 'lucide-react-native';
import { ModuleDefinition } from './adminModules';
import { RecordItem } from './mockData';

export function AdminRecordForm({ module, record, onSave, onCancel }: { module: ModuleDefinition; record?: RecordItem; onSave: (values: Record<string, string>) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((module.fields ?? []).map(field => [field.key, record ? (['name', 'owner', 'category', 'detail'].includes(field.key) ? String(record[field.key as 'name']) : record.fields?.[field.key] ?? '') : field.options?.[0] ?? ''])));
  const [error, setError] = useState('');
  return <form className="admin-form" onSubmit={event => {
    event.preventDefault();
    if (module.fields?.some(field => field.required && !values[field.key]?.trim())) { setError('请填写所有必填项。'); return; }
    onSave(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])));
  }}>
    {module.fields?.map(field => <label className="form-field" key={field.key}><span>{field.label}{field.required && <span className="required"> *</span>}</span>
      {field.options ? <select value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })}>{field.options.map(option => <option key={option}>{option}</option>)}</select>
        : field.type === 'textarea' ? <textarea rows={field.key === 'items' ? 8 : 4} required={field.required} maxLength={4000} value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })} />
          : <input required={field.required} type={field.type ?? 'text'} min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} maxLength={200} value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })} />}
    </label>)}
    {error && <p className="danger" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit" className="primary"><Save size={15} color="currentColor" />{record ? '保存修改' : module.initialStatus === '邀请中' ? '创建邀请' : '保存草稿'}</button></div>
  </form>;
}
