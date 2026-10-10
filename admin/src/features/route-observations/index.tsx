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

type Observation = { id: string; route_id: string; route: { name: string } | null; user_id: string; author_name: string; visited_at: string; section: string; body: string; media: Array<{ uri?: string; thumbnail?: string; kind?: string; pairedVideoUri?: string }>; moderation_status: 'pending' | 'approved' | 'rejected'; helpful_count: number; created_at: string }
const statusLabel = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }

function MediaPreview({ media, onClick }: { media: Observation['media'][number]; onClick: () => void }) {
  const uri = media.kind === 'livePhoto' ? (media.thumbnail || media.uri) : media.uri
  if (!uri) return null
  return <button type='button' onClick={onClick} className='cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'>{media.kind === 'video' ? <video preload='metadata' src={media.uri} className='h-24 w-36 rounded object-cover' /> : <img src={uri} alt='' className='h-24 w-36 rounded object-cover' />}</button>
}

export function RouteObservations() {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<{ media: Observation['media'][number]; routeName: string } | null>(null)
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })
  const query = useQuery({ queryKey: ['admin-route-observations'], queryFn: async () => (await adminApi<{ data: Observation[] }>('routeObservations')).data })
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (query.data || []).filter((item) => !term || [item.route?.name, item.route_id, item.author_name, item.section, item.body, item.moderation_status].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [query.data, search])
  const table = useReactTable({ data: rows, columns: [], state: { pagination }, onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })
  useEffect(() => { setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }) }, [rows.length])
  const refresh = () => client.invalidateQueries({ queryKey: ['admin-route-observations'] })
  async function mutate(action: string, item: Observation, moderationStatus?: Observation['moderation_status']) {
    await adminMutation('routeObservations', { action, id: item.id, ...(action === 'moderate-route-observation' ? { moderation_status: moderationStatus || (item.moderation_status === 'approved' ? 'rejected' : 'approved') } : {}) })
    await refresh()
  }
  return <>
    <Header fixed><Search className='me-auto' /><ThemeSwitch /><ConfigDrawer /><ProfileDropdown /></Header>
    <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
      <div><h2 className='text-2xl font-bold tracking-tight'>路线近期实况</h2><p className='text-muted-foreground'>审核用户提交的路线现场文字、图片和视频记录；通过后才会展示给其他用户。</p></div>
      <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'><CardHeader className='px-0'><div className='flex flex-wrap items-center justify-between gap-3'><CardTitle>实况记录 {query.data ? `(${rows.length}/${query.data.length})` : ''}</CardTitle><ListSearch value={search} onChange={setSearch} placeholder='搜索路线、路段、作者或内容…' /></div></CardHeader><CardContent className='px-0'>
        {query.isError ? <p className='text-sm text-destructive'>读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}</p> : <div className='overflow-hidden rounded-md border'><Table className='min-w-5xl'><TableHeader><TableRow><TableHead>路线 / 路段</TableHead><TableHead>实况</TableHead><TableHead>到访日期</TableHead><TableHead>作者</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{table.getRowModel().rows.map(({ original: item }) => <TableRow key={item.id}><TableCell className='min-w-40'><p className='font-medium'>{item.route?.name || item.route_id}</p><p className='text-xs text-muted-foreground'>{item.section || '未填写路段'}</p></TableCell><TableCell className='max-w-lg'><p className='whitespace-pre-wrap'>{item.body || '—'}</p>{item.media?.length ? <div className='mt-2 flex flex-wrap gap-2'>{item.media.slice(0, 4).map((media, index) => <MediaPreview key={`${media.uri}-${index}`} media={media} onClick={() => setPreview({ media, routeName: item.route?.name || item.route_id })} />)}</div> : null}</TableCell><TableCell className='whitespace-nowrap'>{new Date(item.visited_at).toLocaleDateString()}</TableCell><TableCell>{item.author_name || `用户 ${item.user_id.slice(0, 8)}`}</TableCell><TableCell><Badge variant={item.moderation_status === 'approved' ? 'default' : item.moderation_status === 'rejected' ? 'destructive' : 'secondary'}>{statusLabel[item.moderation_status]}</Badge></TableCell><TableCell className='whitespace-nowrap'>{item.moderation_status !== 'approved' && <Button size='sm' variant='ghost' onClick={() => void mutate('moderate-route-observation', item, 'approved')}>通过</Button>}{item.moderation_status !== 'rejected' && <Button size='sm' variant='ghost' onClick={() => void mutate('moderate-route-observation', item, 'rejected')}>拒绝</Button>}<Button size='sm' variant='ghost' className='text-destructive' onClick={() => { if (window.confirm('确认删除这条路线实况？')) void mutate('delete-route-observation', item) }}>删除</Button></TableCell></TableRow>)}{!query.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className='h-24 text-center text-muted-foreground'>暂无路线实况</TableCell></TableRow>}</TableBody></Table>{Boolean(rows.length) && <DataTablePagination table={table} className='mt-4' />}</div>}
      </CardContent></Card>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null) }}><DialogContent className='max-w-5xl bg-black/95 p-3 text-white'><DialogTitle className='px-2 text-sm font-normal text-white'>{preview?.routeName || '路线实况'} · 媒体预览</DialogTitle>{preview && (preview.media.kind === 'video' || (preview.media.kind === 'livePhoto' && preview.media.pairedVideoUri) ? <video controls autoPlay src={preview.media.kind === 'livePhoto' ? preview.media.pairedVideoUri : preview.media.uri} className='max-h-[75vh] w-full rounded object-contain' /> : <img src={preview.media.uri || preview.media.thumbnail} alt='' className='max-h-[75vh] w-full rounded object-contain' />)}</DialogContent></Dialog>
    </Main>
  </>
}
