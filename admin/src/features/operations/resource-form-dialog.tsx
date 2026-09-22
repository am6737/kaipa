import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { adminApi } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type ResourceField = { key: string; label: string; placeholder?: string; required?: boolean; type?: 'text' | 'user' }

type UserOption = { id: string; email?: string | null; display_name?: string | null; nick?: string | null; username?: string | null }
const userLabel = (user: UserOption) => user.display_name || user.nick || user.username || user.email || `用户 ${user.id.slice(0, 8)}`

function UserPicker({ value, required, onChange }: { value: string; required?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const usersQuery = useQuery({ queryKey: ['admin-users-picker'], queryFn: async () => (await adminApi<{ data: UserOption[] }>('users')).data, staleTime: 60_000 })
  const selected = useMemo(() => usersQuery.data?.find((user) => user.id === value), [usersQuery.data, value])
  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type='button' variant='outline' role='combobox' aria-expanded={open} className='w-full justify-between font-normal'><span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? `${userLabel(selected)} · ${selected.id.slice(0, 8)}` : '选择用户'}</span><ChevronsUpDown className='ms-2 size-4 shrink-0 opacity-50' /></Button></PopoverTrigger>
      <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'><Command><CommandInput placeholder='搜索名称、邮箱或用户 ID…' /><CommandList className='max-h-[min(60vh,360px)] overflow-y-auto overscroll-contain' onWheel={(event) => event.stopPropagation()}><CommandEmpty>{usersQuery.isLoading ? '加载用户中…' : '未找到用户'}</CommandEmpty>{(usersQuery.data || []).map((user) => <CommandItem key={user.id} value={[userLabel(user), user.email, user.username, user.id].filter(Boolean).join(' ')} onSelect={() => { onChange(user.id); setOpen(false) }}><Check className={cn('size-4', value === user.id ? 'opacity-100' : 'opacity-0')} /><span className='min-w-0'><span className='block truncate'>{userLabel(user)}</span><span className='block truncate text-xs text-muted-foreground'>{user.email || user.id}</span></span></CommandItem>)}</CommandList></Command></PopoverContent>
    </Popover>
    {required && <input tabIndex={-1} className='sr-only' value={value} required readOnly aria-label='用户' />}
  </>
}

export function ResourceFormDialog({ open, title, description, fields, initial, submitLabel = '保存', onOpenChange, onSubmit }: { open: boolean; title: string; description: string; fields: ResourceField[]; initial?: Record<string, string>; submitLabel?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: Record<string, string>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(initial || {})
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setValues(initial || {}) }, [open, initial])
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); try { await onSubmit(values); onOpenChange(false) } finally { setSaving(false) } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><form className='grid gap-4' onSubmit={submit}>{fields.map((field) => <div key={field.key} className='grid gap-2'><Label htmlFor={`resource-${field.key}`}>{field.label}</Label>{field.type === 'user' ? <UserPicker value={values[field.key] || ''} required={field.required} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} /> : <Input id={`resource-${field.key}`} value={values[field.key] || ''} placeholder={field.placeholder} required={field.required} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />}</div>)}<DialogFooter><Button type='button' variant='outline' onClick={() => onOpenChange(false)}>取消</Button><Button type='submit' disabled={saving}>{saving ? '保存中…' : submitLabel}</Button></DialogFooter></form></DialogContent></Dialog>
}
