import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FactCategory, FactDraft, FactDraftCard, FactEntry, FactFormValues, RouteOption } from './fact-schema'

const blankValues = (): FactFormValues => ({ route_id: '', category_slug: '', title: '', source_url: '', review_due_at: '', fields: {} })
// Roomy controls: the console is a desk tool and this form is read all day.
const control = 'h-10 text-[15px]'
const wide = 'grid gap-x-6 gap-y-5 sm:grid-cols-2'
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))

const isUntouched = (card: FactDraftCard) =>
  !card.values.title.trim() && !card.values.route_id && !card.values.category_slug && !card.values.source_url.trim() &&
  !card.values.review_due_at && !Object.values(card.values.fields).some((value) => value.trim())

function RoutePicker({ routes, value, onChange }: { routes: RouteOption[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => routes.find((route) => route.id === value), [routes, value])
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type='button' variant='outline' role='combobox' aria-expanded={open} className='h-10 w-full justify-between text-[15px] font-normal'><span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.name : '选择线路'}</span><ChevronsUpDown className='ms-2 size-4 shrink-0 opacity-50' /></Button></PopoverTrigger>
    <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'><Command><CommandInput placeholder='搜索线路名称或区域…' /><CommandList className='max-h-[min(60vh,360px)] overflow-y-auto overscroll-contain' onWheel={(event) => event.stopPropagation()}><CommandEmpty>未找到线路</CommandEmpty>{routes.map((route) => <CommandItem key={route.id} value={`${route.name} ${route.region || ''} ${route.id}`} onSelect={() => { onChange(route.id); setOpen(false) }}><Check className={cn('size-4', value === route.id ? 'opacity-100' : 'opacity-0')} /><span className='min-w-0'><span className='block truncate'>{route.name}</span><span className='block truncate text-xs text-muted-foreground'>{route.region || route.id}</span></span></CommandItem>)}</CommandList></Command></PopoverContent>
  </Popover>
}

// The parent remounts this dialog via `key` when opening a different entry, so
// initial values seed state at mount instead of a render-syncing effect.
export function FactFormDialog({ open, categories, routes, entries, initial, onOpenChange, onSubmit, onAnalyze }: {
  open: boolean
  categories: FactCategory[]
  routes: RouteOption[]
  entries: FactEntry[]
  initial?: Partial<FactFormValues>
  onOpenChange: (open: boolean) => void
  onSubmit: (items: FactFormValues[]) => Promise<void>
  onAnalyze: (input: { source_url: string; source_text: string; source_file?: { name: string; content_type: string; base64: string } }) => Promise<FactDraft[]>
}) {
  const editing = Boolean(initial?.id)
  const [cards, setCards] = useState<FactDraftCard[]>(() => initial?.id
    ? [{ id: newId(), values: { ...blankValues(), ...initial } as FactFormValues, warnings: [], aiFields: [], expanded: true }]
    : [{ id: newId(), values: blankValues(), warnings: [], aiFields: [], expanded: true }])
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceFile, setSourceFile] = useState<{ name: string; content_type: string; base64: string } | undefined>()
  const [showSource, setShowSource] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const categoryOf = (slug: string) => categories.find((item) => item.slug === slug)
  const hasSource = Boolean(sourceUrl.trim() || sourceText.trim() || sourceFile)

  function patch(id: string, update: (card: FactDraftCard) => FactDraftCard) {
    setCards((current) => current.map((card) => (card.id === id ? update(card) : card)))
  }
  function setValues(id: string, values: Partial<FactFormValues>) {
    patch(id, (card) => ({ ...card, values: { ...card.values, ...values } }))
  }
  function setField(id: string, key: string, value: string) {
    // Editing a value clears its AI marker: the mark says "the model wrote this",
    // and once the human has, it no longer does.
    setCards((current) => current.map((card) => (card.id === id ? {
      ...card,
      aiFields: card.aiFields.filter((field) => field !== key),
      values: { ...card.values, fields: { ...card.values.fields, [key]: value } },
    } : card)))
  }

  const blockersOf = (card: FactDraftCard) => {
    const missing: string[] = []
    if (!card.values.route_id) missing.push('线路')
    if (!card.values.category_slug) missing.push('类目')
    if (!card.values.title.trim()) missing.push('标题')
    const schema = categoryOf(card.values.category_slug)?.field_schema || []
    for (const field of schema) if (field.required === true && !String(card.values.fields[field.key] ?? '').trim()) missing.push(field.label)
    return missing
  }
  const duplicatesOf = (card: FactDraftCard) => {
    const { route_id, category_slug } = card.values
    if (!route_id || !category_slug) return []
    return entries.filter((entry) => entry.status === 'confirmed' && !entry.target_entry_id && entry.route_id === route_id && entry.category_slug === category_slug).slice(0, 3)
  }
  const ready = cards.filter((card) => blockersOf(card).length === 0)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready.length) return
    setSaving(true)
    try { await onSubmit(ready.map((card) => card.values)); onOpenChange(false) } catch { /* 列表页负责展示失败原因，弹窗保持打开 */ } finally { setSaving(false) }
  }
  async function analyze() {
    if (!hasSource) return
    setAnalyzing(true)
    setNotice(null)
    try {
      const drafts = await onAnalyze({ source_url: sourceUrl.trim(), source_text: sourceText, source_file: sourceFile })
      if (!drafts.length) { setNotice('没有从来源里识别出可保存的资料，请补充原文或改为手动填写。'); return }
      const link = sourceUrl.trim()
      setCards((current) => [...current.filter((card) => !isUntouched(card)), ...drafts.map((draft) => ({
        id: newId(),
        values: { ...blankValues(), route_id: draft.route_id || '', category_slug: draft.category_slug, title: draft.title, source_url: link, fields: Object.fromEntries(Object.entries(draft.fields).map(([key, value]) => [key, String(value)])) },
        warnings: draft.warnings,
        aiFields: Object.keys(draft.fields),
        // Only what needs a human eye opens itself; a clean draft stays one row.
        expanded: draft.warnings.length > 0 || !draft.route_id,
      }))])
      setShowSource(false)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '资料解析失败')
    } finally { setAnalyzing(false) }
  }
  async function readFile(file: File | undefined) {
    if (!file) return
    setNotice(null)
    if (file.type.startsWith('image/')) {
      if (file.size > 6_000_000) { setNotice('图片不能超过 6 MB'); return }
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
      setSourceFile({ name: file.name, content_type: file.type || 'image/jpeg', base64: dataUrl.replace(/^data:[^;]+;base64,/, '') })
      setSourceText('')
    } else {
      if (file.size > 500_000) { setNotice('文本文件不能超过 500 KB'); return }
      const text = await file.text()
      setSourceText(text.slice(0, 120_000))
      setSourceFile(undefined)
    }
    setShowSource(true)
  }

  function cardEditor(card: FactDraftCard) {
    const schema = categoryOf(card.values.category_slug)?.field_schema || []
    const duplicates = duplicatesOf(card)
    const missing = blockersOf(card)
    return <div className='grid gap-5 px-6 pb-6'>
      <div className={wide}>
        <div className='grid gap-2'><Label>线路</Label><RoutePicker routes={routes} value={card.values.route_id} onChange={(route_id) => setValues(card.id, { route_id })} /></div>
        <div className='grid gap-2'><Label>类目</Label><Select value={card.values.category_slug || undefined} onValueChange={(category_slug) => setValues(card.id, { category_slug })}><SelectTrigger className={`${control} w-full`}><SelectValue placeholder='选择类目' /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.slug} value={item.slug}>{item.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className='grid gap-2'><Label htmlFor={`fact-title-${card.id}`}>标题</Label><Input id={`fact-title-${card.id}`} className={control} value={card.values.title} placeholder='如：成都→丹巴 拼车' onChange={(event) => setValues(card.id, { title: event.target.value })} /></div>
      {schema.length > 0 && <div className={wide}>{schema.map((field) => <div key={field.key} className={cn('grid gap-2', field.type === 'markdown' && 'sm:col-span-2')}>
        <div className='flex items-center gap-2'><Label htmlFor={`fact-field-${card.id}-${field.key}`}>{field.label}{field.unit ? `（${field.unit}）` : ''}</Label>{card.aiFields.includes(field.key) && <span className='rounded-sm border px-1.5 text-xs leading-5 text-muted-foreground'>AI 填写</span>}</div>
        {field.type === 'select'
          ? <Select value={card.values.fields[field.key] || undefined} onValueChange={(value) => setField(card.id, field.key, value)}><SelectTrigger className={`${control} w-full`}><SelectValue placeholder='选择' /></SelectTrigger><SelectContent>{(field.options || []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
          : field.type === 'markdown'
            ? <Textarea id={`fact-field-${card.id}-${field.key}`} rows={3} value={card.values.fields[field.key] || ''} onChange={(event) => setField(card.id, field.key, event.target.value)} />
            : <Input id={`fact-field-${card.id}-${field.key}`} className={control} type={field.type === 'number' ? 'number' : 'text'} value={card.values.fields[field.key] || ''} onChange={(event) => setField(card.id, field.key, event.target.value)} />}
      </div>)}</div>}
      <div className={wide}>
        <div className='grid gap-2'><Label htmlFor={`fact-source-${card.id}`}>来源链接</Label><Input id={`fact-source-${card.id}`} className={control} type='url' value={card.values.source_url} placeholder='https://…' onChange={(event) => setValues(card.id, { source_url: event.target.value })} /></div>
        <div className='grid gap-2'><Label htmlFor={`fact-review-${card.id}`}>复核日期</Label><Input id={`fact-review-${card.id}`} className={control} type='date' value={card.values.review_due_at.slice(0, 10)} onChange={(event) => setValues(card.id, { review_due_at: event.target.value })} />{card.values.category_slug && <p className='text-[13px] text-muted-foreground'>留空则按「{categoryOf(card.values.category_slug)?.name}」{categoryOf(card.values.category_slug)?.review_interval_days} 天自动推算</p>}</div>
      </div>
      {card.warnings.length > 0 && <div className='rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-500'><p className='font-medium'>{card.warnings.length} 项待核对</p><ul className='mt-1 list-disc ps-4'>{card.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      {duplicates.length > 0 && <div className='grid gap-1 text-[13px] text-muted-foreground'><p className='font-medium text-foreground'>库里同线路同类目已有 {duplicates.length} 条</p>{duplicates.map((entry) => <p key={entry.id} className='truncate'>{entry.title}{entry.confirmed_at ? ` · ${entry.confirmed_at.slice(0, 10)} 确认` : ''}</p>)}</div>}
      {missing.length > 0 && !editing && <p className='text-[13px] text-muted-foreground'>还缺：{missing.join('、')}，补齐后这条才会进入保存范围。</p>}
    </div>
  }

  const allExpanded = cards.every((card) => card.expanded)
  const blocked = cards.length - ready.length
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className='flex h-[min(880px,92vh)] w-[min(1120px,94vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1120px,94vw)]'>
      <DialogHeader className='shrink-0 border-b px-8 py-6'>
        <DialogTitle className='text-xl'>{editing ? '编辑线路资料' : '新增线路资料'}</DialogTitle>
        <DialogDescription className='sr-only'>人工核实的线路地面信息，供 AI 行程规划优先引用。</DialogDescription>
      </DialogHeader>
      <form className='flex min-h-0 flex-1 flex-col' onSubmit={submit}>
        <div className='grid flex-1 content-start gap-5 overflow-y-auto px-8 py-6'>
          {!editing && <>
            <div className='grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2'>
              <Input type='url' className={control} value={sourceUrl} placeholder='要解析的链接' onChange={(event) => setSourceUrl(event.target.value)} />
              <Button type='button' variant='outline' className={control} onClick={() => setShowSource((current) => !current)}>{showSource ? '收起原文' : '粘贴原文'}</Button>
              <Button type='button' className={control} onClick={() => void analyze()} disabled={analyzing || !hasSource}>{analyzing ? '解析中…' : 'AI 解析'}</Button>
            </div>
            {showSource && <div className='grid gap-3 rounded-lg bg-muted/50 p-4'>
              <Textarea rows={6} value={sourceText} placeholder='粘贴攻略正文、通知或活动说明…' onChange={(event) => setSourceText(event.target.value)} />
              <div className='flex items-center justify-between text-sm text-muted-foreground'>
                <span>{sourceFile ? sourceFile.name : `${sourceText.length.toLocaleString()} 字`}</span>
                <label className='cursor-pointer hover:underline'>选择文本或图片<input type='file' className='sr-only' accept='.txt,.md,.csv,.json,.html,.log,image/jpeg,image/png,image/webp' onChange={(event) => { void readFile(event.target.files?.[0]) }} /></label>
              </div>
            </div>}
            {notice && <p className='text-sm text-destructive'>{notice}</p>}
            {cards.length > 1 && <div className='flex items-center justify-between text-sm text-muted-foreground'>
              <span>共 {cards.length} 条{blocked > 0 ? ` · ${blocked} 条待补充` : ''}</span>
              <Button type='button' variant='ghost' onClick={() => setCards((current) => current.map((card) => ({ ...card, expanded: !allExpanded })))}>{allExpanded ? '全部收起' : '全部展开'}</Button>
            </div>}
            <div className='grid gap-4'>
              {cards.map((card) => <div key={card.id} className='rounded-xl bg-background shadow-md'>
                <div className='flex items-center gap-3 px-6 py-5'>
                  <Button type='button' variant='ghost' className='h-auto min-w-0 flex-1 justify-start gap-2 px-0 py-0 text-start hover:bg-transparent' onClick={() => patch(card.id, (current) => ({ ...current, expanded: !current.expanded }))}>
                    <span className='min-w-0'><span className='block truncate text-base font-semibold text-foreground'>{card.values.title || '未命名条目'}</span><span className='mt-0.5 block truncate text-[13px] text-muted-foreground'>{routes.find((route) => route.id === card.values.route_id)?.name || '线路未识别'} · {categoryOf(card.values.category_slug)?.name || '未分类'}</span></span>
                  </Button>
                  {blockersOf(card).length === 0 ? <Badge>可入库</Badge> : <Badge variant='secondary'>待补充</Badge>}
                  {card.warnings.length > 0 && <Badge variant='outline'>{card.warnings.length} 项待核对</Badge>}
                  {duplicatesOf(card).length > 0 && <Badge variant='outline'>库里已有 {duplicatesOf(card).length} 条</Badge>}
                  {!editing && cards.length > 1 && <Button type='button' variant='ghost' onClick={() => setCards((current) => current.filter((item) => item.id !== card.id))}>丢弃</Button>}
                  <Button type='button' variant='ghost' onClick={() => patch(card.id, (current) => ({ ...current, expanded: !current.expanded }))}>{card.expanded ? '收起' : '展开'}</Button>
                </div>
                {card.expanded && cardEditor(card)}
              </div>)}
            </div>
            <Button type='button' variant='ghost' className='justify-self-start px-0 text-muted-foreground' onClick={() => setCards((current) => [...current, { id: newId(), values: blankValues(), warnings: [], aiFields: [], expanded: true }])}>+ 再加一条</Button>
          </>}
          {editing && cards.map((card) => <div key={card.id} className='grid gap-5'>{cardEditor(card)}</div>)}
        </div>
        <DialogFooter className='m-0 shrink-0 items-center gap-3 border-t px-8 py-5 sm:justify-between'>
          <span className='me-auto text-sm text-muted-foreground'>{editing ? (ready.length ? '填写完整，可保存' : `还缺：${cards.flatMap((card) => blockersOf(card)).join('、')}`) : `${ready.length} 条可入库${blocked > 0 ? ` · ${blocked} 条需要补充` : ''}`}</span>
          <span className='flex gap-3'><Button type='button' variant='outline' className={control} onClick={() => onOpenChange(false)}>取消</Button><Button type='submit' className={control} disabled={saving || ready.length === 0}>{saving ? '保存中…' : editing ? '保存' : `保存 ${ready.length} 条`}</Button></span>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
