import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FactCategory, FactEntry } from './fact-schema'

const show = (value: unknown) => (value == null || String(value).trim() === '' ? '—' : String(value))

// The agent proposed changes to an entry a human already confirmed. Reviewing it
// as a diff is the point: the alternative (a second, contradicting entry) is what
// this flow exists to prevent, and the reviewer needs to see both sides of every
// changed field to decide which of them to accept.
export function FactRevisionDialog({ open, suggestion, target, category, onOpenChange, onApply, onReject }: {
  open: boolean
  suggestion: FactEntry
  target: FactEntry | null
  category: FactCategory | undefined
  onOpenChange: (open: boolean) => void
  onApply: (acceptedFields: string[]) => Promise<void>
  onReject: () => Promise<void>
}) {
  const proposed = Object.entries(suggestion.fields || {})
  const [accepted, setAccepted] = useState<string[]>(() => proposed.map(([key]) => key))
  const [busy, setBusy] = useState(false)
  const label = (key: string) => {
    const field = category?.field_schema.find((item) => item.key === key)
    if (!field) return key
    return field.unit ? `${field.label}（${field.unit}）` : field.label
  }
  async function run(action: () => Promise<void>) {
    setBusy(true)
    try { await action(); onOpenChange(false) } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
      <DialogHeader>
        <DialogTitle>审核修订建议</DialogTitle>
        <DialogDescription>
          AI 在攻略里读到了与已核实资料不一致的内容，逐字段勾选要采用的提议值；未勾选的字段保持当前值。
        </DialogDescription>
      </DialogHeader>
      {target ? <>
        <div className='grid gap-1 rounded-md bg-muted/50 p-3 text-sm'>
          <p><span className='text-muted-foreground'>线路：</span>{target.route?.name || target.route_id}</p>
          <p><span className='text-muted-foreground'>条目：</span>{target.title}</p>
          <p><span className='text-muted-foreground'>建议标题：</span>{suggestion.title}</p>
          {suggestion.source_url && <a className='inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline' href={suggestion.source_url} target='_blank' rel='noreferrer'>查看来源 <ExternalLink className='size-3' /></a>}
        </div>
        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow><TableHead className='w-12'>采用</TableHead><TableHead>字段</TableHead><TableHead>当前值</TableHead><TableHead>提议值</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {proposed.map(([key, value]) => {
                const checked = accepted.includes(key)
                const unchanged = show(target.fields?.[key]) === show(value)
                return <TableRow key={key}>
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      aria-label={`采用 ${label(key)}`}
                      onCheckedChange={(next) => setAccepted((current) => next ? [...current, key] : current.filter((item) => item !== key))}
                    />
                  </TableCell>
                  <TableCell className='whitespace-nowrap font-medium'>{label(key)}{unchanged && <Badge variant='outline' className='ms-2'>值未变</Badge>}</TableCell>
                  <TableCell className='max-w-72 text-muted-foreground'><span className='line-clamp-3 break-words'>{show(target.fields?.[key])}</span></TableCell>
                  <TableCell className='max-w-72'><span className='line-clamp-3 break-words font-medium'>{show(value)}</span></TableCell>
                </TableRow>
              })}
              {proposed.length === 0 && <TableRow><TableCell colSpan={4} className='h-16 text-center text-muted-foreground'>这条建议没有给出任何字段</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className='rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700'>
          <p className='font-medium'>应用后会怎样</p>
          <ul className='mt-1 list-disc ps-4'>
            <li>目标条目只更新勾选的字段，并记录一条可追溯的修订历史。</li>
            <li>条目视为重新核实，复核日期按类目周期重新计算。</li>
            <li>必填字段若因此缺失，应用会被拒绝并提示具体字段。</li>
          </ul>
        </div>
      </> : <p className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'>找不到这条建议指向的条目（可能已被删除）。</p>}
      <DialogFooter>
        <Button type='button' variant='ghost' disabled={busy} onClick={() => void run(onReject)}>驳回建议</Button>
        <Button type='button' disabled={busy || !target || proposed.length === 0} onClick={() => void run(() => onApply(accepted))}>
          {busy ? '处理中…' : `应用所选 ${accepted.length} 个字段`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
