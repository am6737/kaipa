import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, FileText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { FactCategory, FactFormValues, RouteOption } from './fact-schema'

type AnalysisDraft = { title: string; fields: Record<string, string | number>; summary: string; warnings: string[]; source_url: string | null }

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
export function FactFormDialog({ open, categories, routes, initial, onOpenChange, onSubmit, onAnalyze }: { open: boolean; categories: FactCategory[]; routes: RouteOption[]; initial?: Partial<FactFormValues>; onOpenChange: (open: boolean) => void; onSubmit: (values: FactFormValues) => Promise<void>; onAnalyze: (input: { category_slug: string; source_url: string; source_text: string; source_file?: { name: string; content_type: string; base64: string } }) => Promise<AnalysisDraft> }) {
  const [values, setValues] = useState<FactFormValues>({ route_id: '', category_slug: '', title: '', source_url: '', review_due_at: '', fields: {}, ...initial })
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [sourceFile, setSourceFile] = useState<{ name: string; content_type: string; base64: string } | undefined>()
  const [analysis, setAnalysis] = useState<AnalysisDraft | null>(null)
  const [entryMode, setEntryMode] = useState<'ai' | 'manual'>('ai')
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
  async function analyze() {
    if (!values.category_slug || (!values.source_url.trim() && !sourceText.trim() && !sourceFile)) return
    setAnalyzing(true)
    try {
      const draft = await onAnalyze({ category_slug: values.category_slug, source_url: values.source_url.trim(), source_text: sourceText, source_file: sourceFile })
      setValues((current) => ({ ...current, title: draft.title || current.title, source_url: draft.source_url || current.source_url, fields: { ...current.fields, ...Object.fromEntries(Object.entries(draft.fields).map(([key, value]) => [key, String(value)])) } }))
      setAnalysis(draft)
    } catch (error) {
      setAnalysis({ title: '', fields: {}, summary: '', warnings: [error instanceof Error ? error.message : '资料解析失败'], source_url: null })
    } finally { setAnalyzing(false) }
  }
  async function readFile(file: File | undefined) {
    if (!file) return
    if (file.type.startsWith('image/')) {
      if (file.size > 6_000_000) throw new Error('图片不能超过 6 MB')
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
      setSourceFile({ name: file.name, content_type: file.type || 'image/jpeg', base64: dataUrl.replace(/^data:[^;]+;base64,/, '') })
      setSourceText('')
    } else {
      if (file.size > 500_000) throw new Error('文本文件不能超过 500 KB')
      const text = await file.text()
      setSourceText(text.slice(0, 120_000))
      setSourceFile(undefined)
    }
    setAnalysis(null)
  }
  const fieldEditor = schema.length > 0 && <div className='grid gap-3 rounded-md border p-3 sm:grid-cols-2'>
    {schema.map((field) => <div key={field.key} className='grid gap-1.5'>{field.type === 'select'
      ? <><Label>{field.label}</Label><Select value={values.fields[field.key] || undefined} onValueChange={(value) => setField(field.key, value)}><SelectTrigger><SelectValue placeholder='选择' /></SelectTrigger><SelectContent>{(field.options || []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></>
      : field.type === 'markdown'
        ? <><Label htmlFor={`fact-field-${field.key}`}>{field.label}</Label><Textarea id={`fact-field-${field.key}`} rows={3} value={values.fields[field.key] || ''} placeholder={field.required ? '必填' : ''} onChange={(event) => setField(field.key, event.target.value)} /></>
        : <><Label htmlFor={`fact-field-${field.key}`}>{field.label}{field.unit ? `（${field.unit}）` : ''}</Label><Input id={`fact-field-${field.key}`} type={field.type === 'number' ? 'number' : 'text'} value={values.fields[field.key] || ''} onChange={(event) => setField(field.key, event.target.value)} /></>}</div>)}
  </div>
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'><DialogHeader><DialogTitle>{values.id ? '编辑线路资料' : '新增线路资料'}</DialogTitle><DialogDescription>人工核实的线路地面信息，供 AI 行程规划优先引用；过期后请复核更新。</DialogDescription></DialogHeader><form className='grid gap-4' onSubmit={submit}>
    <div className='grid gap-2 sm:grid-cols-2'>
      <div className='grid gap-2'><Label>线路</Label><RoutePicker routes={routes} value={values.route_id} onChange={(route_id) => setValues((current) => ({ ...current, route_id }))} /><input tabIndex={-1} className='sr-only' value={values.route_id} required readOnly aria-label='线路' /></div>
      <div className='grid gap-2'><Label>类目</Label><Select value={values.category_slug || undefined} onValueChange={(category_slug) => setValues((current) => ({ ...current, category_slug }))}><SelectTrigger><SelectValue placeholder='选择类目' /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.slug} value={item.slug}>{item.name}</SelectItem>)}</SelectContent></Select><input tabIndex={-1} className='sr-only' value={values.category_slug} required readOnly aria-label='类目' /></div>
    </div>
    {!values.id ? <Tabs value={entryMode} onValueChange={(value) => setEntryMode(value as 'ai' | 'manual')} className='w-full'>
      <TabsList className='grid w-full grid-cols-2'><TabsTrigger value='ai'><Sparkles className='me-2 size-4' />AI 智能录入</TabsTrigger><TabsTrigger value='manual'>手动填写</TabsTrigger></TabsList>
      <TabsContent value='ai' className='mt-3 grid gap-3'>
      <div className='grid gap-3 rounded-md border border-dashed p-3'>
      <div className='flex items-center gap-2'><Sparkles className='size-4 text-primary' /><div><p className='text-sm font-medium'>AI 解析来源资料</p><p className='text-xs text-muted-foreground'>粘贴正文、输入链接或上传文本文件，结果会先回填为草稿。</p></div></div>
      <div className='grid gap-2 sm:grid-cols-[1fr_auto]'><Input type='url' value={values.source_url} placeholder='https://…' onChange={(event) => { setValues((current) => ({ ...current, source_url: event.target.value })); setAnalysis(null) }} /><label className='inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm hover:bg-muted'><FileText className='size-4' />选择文本或图片<input type='file' className='sr-only' accept='.txt,.md,.csv,.json,.html,.log,image/jpeg,image/png,image/webp' onChange={(event) => { void readFile(event.target.files?.[0]).catch((error) => setAnalysis({ title: '', fields: {}, summary: '', warnings: [error instanceof Error ? error.message : '文件读取失败'], source_url: null })) }} /></label></div>
      <Textarea rows={4} value={sourceText} placeholder='也可以直接粘贴攻略正文、通知或活动说明…' onChange={(event) => { setSourceText(event.target.value); setAnalysis(null) }} />
      <div className='flex flex-wrap items-center gap-3'><Button type='button' size='sm' onClick={() => void analyze()} disabled={analyzing || !values.category_slug || (!values.source_url.trim() && !sourceText.trim() && !sourceFile)}><Sparkles className='size-4' />{analyzing ? '解析中…' : 'AI 解析并回填'}</Button>{sourceText.length > 0 && <span className='text-xs text-muted-foreground'>{sourceText.length.toLocaleString()} 字</span>}{sourceFile && <span className='max-w-64 truncate text-xs text-muted-foreground'>{sourceFile.name}</span>}</div>
      {analysis?.summary && <div className='rounded-md bg-muted/50 p-2 text-xs'><p className='font-medium'>解析摘要</p><p className='mt-1 whitespace-pre-wrap text-muted-foreground'>{analysis.summary}</p></div>}
      {analysis?.warnings.length ? <div className='rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700'><p className='font-medium'>需要人工核对</p><ul className='mt-1 list-disc ps-4'>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      </div>
      {analysis && <div className='grid gap-2'><Label htmlFor='fact-title-ai'>解析结果，可手动修正</Label><Input id='fact-title-ai' value={values.title} required placeholder='解析后生成标题' onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} />{fieldEditor}</div>}
      </TabsContent>
      <TabsContent value='manual' className='mt-3 grid gap-3'><div className='grid gap-2'><Label htmlFor='fact-title-manual'>标题</Label><Input id='fact-title-manual' value={values.title} required placeholder='如：成都→丹巴 拼车' onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} /></div>{fieldEditor}</TabsContent>
    </Tabs> : <><div className='grid gap-2'><Label htmlFor='fact-title'>标题</Label><Input id='fact-title' value={values.title} required placeholder='如：成都→丹巴 拼车' onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} /></div>{fieldEditor}</>}
    {category && <p className='text-xs text-muted-foreground'>复核周期：{category.review_interval_days} 天；留空复核日期将按最近一次确认或复核时间自动推算，改动字段内容会重新计时。</p>}
    <div className='grid gap-2 sm:grid-cols-2'>
      {(values.id || entryMode === 'manual') && <div className='grid gap-2'><Label htmlFor='fact-source'>来源链接</Label><Input id='fact-source' type='url' value={values.source_url} placeholder='https://…' onChange={(event) => setValues((current) => ({ ...current, source_url: event.target.value }))} /></div>}
      <div className='grid gap-2'><Label htmlFor='fact-review'>复核日期</Label><Input id='fact-review' type='date' value={values.review_due_at.slice(0, 10)} onChange={(event) => setValues((current) => ({ ...current, review_due_at: event.target.value }))} /></div>
    </div>
    <DialogFooter><Button type='button' variant='outline' onClick={() => onOpenChange(false)}>取消</Button><Button type='submit' disabled={saving || !values.route_id || !values.category_slug || !values.title.trim()}>{saving ? '保存中…' : '保存为已核实'}</Button></DialogFooter>
  </form></DialogContent></Dialog>
}
