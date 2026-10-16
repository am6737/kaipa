import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCoreRowModel, getPaginationRowModel, type PaginationState, useReactTable } from '@tanstack/react-table'
import { adminApi, adminMutation } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { DataTablePagination } from '@/components/data-table'
import { ListSearch } from '@/components/data-table/list-search'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

type Profile = { display_name?: string | null; nick?: string | null; username?: string | null } | null
type Report = { reporter_id: string; reason: 'spam' | 'false_info' | 'abuse' | 'other'; created_at: string; resolved_at: string | null }
type Media = { uri?: string; thumbnail?: string; kind?: string; pairedVideoUri?: string }
type RouteComment = {
  id: string; route_id: string; route: { name: string } | null; user_id: string; user: Profile; author_name: string
  parent_id: string | null; parent: { id: string; body: string; status: string; author_name: string } | null; reply_to: Profile
  body: string; media: Media[]; status: 'visible' | 'hidden' | 'deleted'; like_count: number; reply_count: number
  reports: Report[]; open_report_count: number; created_at: string
}
type Filter = 'all' | 'reported' | 'hidden'

const statusLabel = { visible: '展示中', hidden: '已隐藏', deleted: '已删除（保留回复）' }
const reasonLabel = { spam: '广告或引流', false_info: '不实路况信息', abuse: '辱骂或人身攻击', other: '其他' }
const filterLabel: Record<Filter, string> = { all: '全部', reported: '待处理举报', hidden: '已隐藏' }
const profileName = (profile: Profile, fallback: string) => profile?.display_name || profile?.nick || profile?.username || fallback

function MediaPreview({ media, onClick }: { media: Media; onClick: () => void }) {
  const uri = media.kind === 'livePhoto' ? (media.thumbnail || media.uri) : media.uri
  if (!uri) return null
  return <button type='button' onClick={onClick} className='cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>{media.kind === 'video' ? <video preload='metadata' src={media.uri} className='h-24 w-36 rounded object-cover' /> : <img src={uri} alt='' className='h-24 w-36 rounded object-cover' />}</button>
}

function ReportSummary({ reports }: { reports: Report[] }) {
  const open = reports.filter((report) => !report.resolved_at)
  if (!reports.length) return <span className='text-muted-foreground'>—</span>
  const counts = open.reduce<Record<string, number>>((all, report) => ({ ...all, [report.reason]: (all[report.reason] || 0) + 1 }), {})
  return <div className='space-y-1'>
    <p className={open.length ? 'font-medium text-destructive' : 'text-muted-foreground'}>{open.length ? `${open.length} 条待处理` : '已处理'}{reports.length > open.length ? `，${reports.length - open.length} 条已处理` : ''}</p>
    {Object.entries(counts).map(([reason, count]) => <p key={reason} className='text-xs text-muted-foreground'>{reasonLabel[reason as Report['reason']] || reason} {count}</p>)}
  </div>
}

export function RouteComments() {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [preview, setPreview] = useState<{ media: Media; routeName: string } | null>(null)
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })
  const query = useQuery({ queryKey: ['admin-route-comments'], queryFn: async () => (await adminApi<{ data: RouteComment[] }>('routeComments')).data })
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (query.data || [])
      .filter((item) => filter === 'all' || (filter === 'reported' ? item.open_report_count > 0 : item.status === 'hidden'))
      .filter((item) => !term || [item.route?.name, item.route_id, item.author_name, profileName(item.user, ''), item.body, item.parent?.body].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [query.data, search, filter])
  const reportedCount = useMemo(() => (query.data || []).filter((item) => item.open_report_count > 0).length, [query.data])
  const table = useReactTable({ data: rows, columns: [], state: { pagination }, onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })
  useEffect(() => { setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }) }, [rows.length])
  const refresh = () => client.invalidateQueries({ queryKey: ['admin-route-comments'] })
  async function mutate(action: 'moderate-route-comment' | 'dismiss-route-comment-reports' | 'delete-route-comment', item: RouteComment, status?: 'visible' | 'hidden') {
    await adminMutation('routeComments', { action, id: item.id, ...(status ? { status } : {}) })
    await refresh()
  }
  return <>
    <Header fixed><Search className='me-auto' /><ThemeSwitch /><ConfigDrawer /><ProfileDropdown /></Header>
    <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div><h2 className='text-2xl font-bold tracking-tight'>路线评论</h2><p className='text-muted-foreground'>评论和回复发布后直接展示；被 3 人举报会自动隐藏，在这里恢复、隐藏或删除。</p></div>
      <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'><CardHeader className='px-0'><div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <CardTitle>评论 {query.data ? `(${rows.length}/${query.data.length})` : ''}</CardTitle>
          <div className='flex gap-1'>{(Object.keys(filterLabel) as Filter[]).map((key) => <Button key={key} size='sm' variant={filter === key ? 'secondary' : 'ghost'} onClick={() => setFilter(key)}>{filterLabel[key]}{key === 'reported' && reportedCount ? ` ${reportedCount}` : ''}</Button>)}</div>
        </div>
        <ListSearch value={search} onChange={setSearch} placeholder='搜索路线、作者或内容…' />
      </div></CardHeader><CardContent className='px-0'>
        {query.isError ? <p className='text-sm text-destructive'>读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}</p> : <div className='overflow-hidden rounded-md border'><Table className='min-w-5xl'><TableHeader><TableRow><TableHead>路线</TableHead><TableHead>内容</TableHead><TableHead>作者</TableHead><TableHead>互动</TableHead><TableHead>举报</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{table.getRowModel().rows.map(({ original: item }) => <TableRow key={item.id}>
          <TableCell className='min-w-40'><p className='font-medium'>{item.route?.name || item.route_id}</p><p className='text-xs text-muted-foreground'>{new Date(item.created_at).toLocaleString()}</p></TableCell>
          <TableCell className='max-w-lg'>
            {item.parent_id ? <p className='mb-1 truncate text-xs text-muted-foreground'><Badge variant='outline' className='me-1'>回复</Badge>{item.reply_to ? `回复 ${profileName(item.reply_to, '用户')}：` : ''}原评论「{item.parent?.status === 'deleted' ? '已删除' : item.parent?.body || '—'}」</p> : null}
            <p className='whitespace-pre-wrap'>{item.status === 'deleted' ? <span className='text-muted-foreground'>（作者已删除，保留 {item.reply_count} 条回复）</span> : item.body || '—'}</p>
            {item.media?.length ? <div className='mt-2 flex flex-wrap gap-2'>{item.media.slice(0, 4).map((media, index) => <MediaPreview key={`${media.uri}-${index}`} media={media} onClick={() => setPreview({ media, routeName: item.route?.name || item.route_id })} />)}{item.media.length > 4 ? <span className='self-end text-xs text-muted-foreground'>共 {item.media.length} 项</span> : null}</div> : null}
          </TableCell>
          <TableCell>{profileName(item.user, item.author_name || `用户 ${item.user_id.slice(0, 8)}`)}</TableCell>
          <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>赞 {item.like_count}{item.parent_id ? '' : `  回复 ${item.reply_count}`}</TableCell>
          <TableCell className='min-w-32'><ReportSummary reports={item.reports || []} /></TableCell>
          <TableCell><Badge variant={item.status === 'visible' ? 'default' : item.status === 'hidden' ? 'destructive' : 'secondary'}>{statusLabel[item.status]}</Badge></TableCell>
          <TableCell className='whitespace-nowrap'>
            {item.status === 'hidden' && <Button size='sm' variant='ghost' onClick={() => void mutate('moderate-route-comment', item, 'visible')}>恢复</Button>}
            {item.status === 'visible' && <Button size='sm' variant='ghost' onClick={() => void mutate('moderate-route-comment', item, 'hidden')}>隐藏</Button>}
            {item.status === 'visible' && item.open_report_count > 0 && <Button size='sm' variant='ghost' onClick={() => void mutate('dismiss-route-comment-reports', item)}>驳回举报</Button>}
            <Button size='sm' variant='ghost' className='text-destructive' onClick={() => { if (window.confirm(item.parent_id || !item.reply_count ? '确认删除这条评论？' : `确认删除这条评论？它下面的 ${item.reply_count} 条回复也会一并删除。`)) void mutate('delete-route-comment', item) }}>删除</Button>
          </TableCell>
        </TableRow>)}{!query.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className='h-24 text-center text-muted-foreground'>暂无路线评论</TableCell></TableRow>}</TableBody></Table>{Boolean(rows.length) && <DataTablePagination table={table} className='mt-4' />}</div>}
      </CardContent></Card>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null) }}><DialogContent className='max-w-5xl bg-black/95 p-3 text-white'><DialogTitle className='px-2 text-sm font-normal text-white'>{preview?.routeName || '路线评论'} 媒体预览</DialogTitle>{preview && (preview.media.kind === 'video' || (preview.media.kind === 'livePhoto' && preview.media.pairedVideoUri) ? <video controls autoPlay src={preview.media.kind === 'livePhoto' ? preview.media.pairedVideoUri : preview.media.uri} className='max-h-[75vh] w-full rounded object-contain' /> : <img src={preview.media.uri || preview.media.thumbnail} alt='' className='max-h-[75vh] w-full rounded object-contain' />)}</DialogContent></Dialog>
    </Main>
  </>
}
