import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { FactEntry, FactRevision } from './fact-schema'

const actionLabels: Record<FactRevision['action'], string> = {
  created: '建档', suggested: 'AI 草稿', updated: '内容更新', reviewed: '标记已复核',
  confirmed: '确认入库', archived: '归档', restored: '恢复',
}

const show = (value: unknown) => (value == null || String(value).trim() === '' ? '（空）' : String(value))

// "When did this price change?" — the question an append-only history exists to
// answer. Before/after values are stored on the row rather than reconstructed
// from the previous snapshot, so each line stands on its own.
export function FactHistorySheet({ open, entry, revisions, onOpenChange }: {
  open: boolean
  entry: FactEntry | null
  revisions: FactRevision[]
  onOpenChange: (open: boolean) => void
}) {
  const rows = entry ? revisions.filter((revision) => revision.entry_id === entry.id) : []
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className='flex flex-col sm:max-w-xl'>
      <SheetHeader>
        <SheetTitle>修订历史</SheetTitle>
        <SheetDescription>{entry ? `${entry.route?.name || entry.route_id} · ${entry.title}` : ''}</SheetDescription>
      </SheetHeader>
      <div className='flex-1 overflow-y-auto px-4 pb-6'>
        {rows.length === 0 && <p className='text-sm text-muted-foreground'>这条资料还没有修订记录。</p>}
        <ol className='grid gap-3'>
          {rows.map((revision) => {
            const changed = revision.changed_fields.filter((key) => key !== 'updated_at' && key !== 'updated_by')
            return <li key={revision.id} className='rounded-md border p-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='outline'>#{revision.revision}</Badge>
                <span className='text-sm font-medium'>{actionLabels[revision.action] || revision.action}</span>
                <span className='text-xs text-muted-foreground'>{revision.applied_at.slice(0, 16).replace('T', ' ')}</span>
                {revision.applied_by_name && <span className='text-xs text-muted-foreground'>· {revision.applied_by_name}</span>}
                {revision.note === 'backfill' && <Badge variant='secondary'>迁移前建档</Badge>}
              </div>
              {changed.length > 0 && <ul className='mt-2 grid gap-1 text-xs'>
                {changed.map((key) => <li key={key} className='flex flex-wrap gap-1'>
                  <span className='text-muted-foreground'>{key}：</span>
                  <span className='line-through'>{show(revision.fields_before?.[key])}</span>
                  <span>→</span>
                  <span className='font-medium'>{show(revision.fields_after?.[key])}</span>
                </li>)}
              </ul>}
              {revision.note && revision.note !== 'backfill' && <p className='mt-2 text-xs text-muted-foreground'>{revision.note}</p>}
              {revision.source_url && <a className='mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline' href={revision.source_url} target='_blank' rel='noreferrer'>来源 <ExternalLink className='size-3' /></a>}
            </li>
          })}
        </ol>
      </div>
    </SheetContent>
  </Sheet>
}
