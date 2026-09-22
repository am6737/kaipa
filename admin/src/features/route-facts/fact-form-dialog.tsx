import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FactCategory, FactFormValues, RouteOption } from './fact-schema'

function RoutePicker({ routes, value, onChange }: { routes: RouteOption[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => routes.find((route) => route.id === value), [routes, value])
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type='button' variant='outline' role='combobox' aria-expanded={open} className='w-full justify-between font-normal'><span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? `${selected.name}（${selected.region || '未分类'}）` : '选择线路'}</span><ChevronsUpDown className='ms-2 size-4 shrink-0 opacity-50' /></Button></PopoverTrigger>
    <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'><Command><CommandInput placeholder='搜索线路名称或区域…' /><CommandList className='max-h-[min(60vh,360px)] overflow-y-auto overscroll-contain' onWheel={(event) => event.stopPropagation()}><CommandEmpty>未找到线路</CommandEmpty>{routes.map((route) => <CommandItem key={route.id} value={`${route.name} ${route.region || ''} ${route.id}`} onSelect={() => { onChange(route.id); setOpen(false) }}><Check className={cn('size-4', value === route.id ? 'opacity-100' : 'opacity-0')} /><span className='min-w-0'><span className='block truncate'>{route.name}</span><span className='block truncate text-xs text-muted-foreground'>{route.region || route.id}</span></span></CommandItem>)}</CommandList></Command></PopoverContent>
  </Popover>
}

// The parent remounts this dialog via `key` when opening a different entry, so
// initial values seed state at mount instead of a render-syncing effect.
export function FactFormDialog({ open, categories, routes, initial, onOpenChange, onSubmit }: { open: boolean; categories: FactCategory[]; routes: RouteOption[]; initial?: Partial<FactFormValues>; onOpenChange: (open: boolean) => void; onSubmit: (values: FactFormValues) => Promise<void> }) {
  const [values, setValues] = useState<FactFormValues>({ route_id: '', category_slug: '', title: '', source_url: '', review_due_at: '', fields: {}, ...initial })
  const [saving, setSaving] = useState(false)
  const category = categories.find((item) => item.slug === values.category_slug)
  const schema = category?.field_schema || []
  function setField(key: string, value: string) {
    setValues((current) => ({ ...current, fields: { ...current.fields, [key]: value } }))
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!values.route_id || !values.category_slug || !values.title.trim()) return
    setSaving(true)
    try { await onSubmit(values); onOpenChange(false) } finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'><DialogHeader><DialogTitle>{values.id ? '编辑线路资料' : '新增线路资料'}</DialogTitle><DialogDescription>人工核实的线路地面信息，供 AI 行程规划优先引用；过期后请复核更新。</DialogDescription></DialogHeader><form className='grid gap-4' onSubmit={submit}>
    <div className='grid gap-2 sm:grid-cols-2'>
      <div className='grid gap-2'><Label>线路</Label><RoutePicker routes={routes} value={values.route_id} onChange={(route_id) => setValues((current) => ({ ...current, route_id }))} /><input tabIndex={-1} className='sr-only' value={values.route_id} required readOnly aria-label='线路' /></div>
      <div className='grid gap-2'><Label>类目</Label><Select value={values.category_slug || undefined} onValueChange={(category_slug) => setValues((current) => ({ ...current, category_slug }))}><SelectTrigger><SelectValue placeholder='选择类目' /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.slug} value={item.slug}>{item.name}</SelectItem>)}</SelectContent></Select><input tabIndex={-1} className='sr-only' value={values.category_slug} required readOnly aria-label='类目' /></div>
    </div>
    <div className='grid gap-2'><Label htmlFor='fact-title'>标题</Label><Input id='fact-title' value={values.title} required placeholder='如：成都→丹巴 拼车' onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} /></div>
    {schema.length > 0 && <div className='grid gap-3 rounded-md border p-3 sm:grid-cols-2'>
      {schema.map((field) => <div key={field.key} className='grid gap-1.5'>{field.type === 'select'
        ? <><Label>{field.label}</Label><Select value={values.fields[field.key] || undefined} onValueChange={(value) => setField(field.key, value)}><SelectTrigger><SelectValue placeholder='选择' /></SelectTrigger><SelectContent>{(field.options || []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></>
        : field.type === 'markdown'
          ? <><Label htmlFor={`fact-field-${field.key}`}>{field.label}</Label><Textarea id={`fact-field-${field.key}`} rows={3} value={values.fields[field.key] || ''} placeholder={field.required ? '必填' : ''} onChange={(event) => setField(field.key, event.target.value)} /></>
          : <><Label htmlFor={`fact-field-${field.key}`}>{field.label}{field.unit ? `（${field.unit}）` : ''}</Label><Input id={`fact-field-${field.key}`} type={field.type === 'number' ? 'number' : 'text'} value={values.fields[field.key] || ''} onChange={(event) => setField(field.key, event.target.value)} /></>}</div>)}
    </div>}
    {category && <p className='text-xs text-muted-foreground'>复核周期：{category.review_interval_days} 天；留空复核日期将按确认时间自动推算。</p>}
    <div className='grid gap-2 sm:grid-cols-2'>
      <div className='grid gap-2'><Label htmlFor='fact-source'>来源链接</Label><Input id='fact-source' type='url' value={values.source_url} placeholder='https://…' onChange={(event) => setValues((current) => ({ ...current, source_url: event.target.value }))} /></div>
      <div className='grid gap-2'><Label htmlFor='fact-review'>复核日期</Label><Input id='fact-review' type='date' value={values.review_due_at.slice(0, 10)} onChange={(event) => setValues((current) => ({ ...current, review_due_at: event.target.value }))} /></div>
    </div>
    <DialogFooter><Button type='button' variant='outline' onClick={() => onOpenChange(false)}>取消</Button><Button type='submit' disabled={saving || !values.route_id || !values.category_slug || !values.title.trim()}>{saving ? '保存中…' : '保存为已核实'}</Button></DialogFooter>
  </form></DialogContent></Dialog>
}
