import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCoreRowModel, getPaginationRowModel, type PaginationState, useReactTable } from '@tanstack/react-table'
import { adminApi, adminMutation } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { DataTablePagination } from '@/components/data-table'
import { ListSearch } from '@/components/data-table/list-search'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { FactFormDialog } from './fact-form-dialog'
import { serializeFactFields, type FactCategory, type FactFormValues, type RouteOption } from './fact-schema'

type FactEntry = {
  id: string
  route_id: string
  category_slug: string
  title: string
  fields: Record<string, string | number>
  source_url: string | null
  status: 'confirmed' | 'suggested' | 'archived'
  origin: 'manual' | 'agent'
  confirmed_at: string | null
  review_due_at: string | null
  updated_at: string
  route: { name: string } | null
  category: { name: string } | null
}

const statusLabels: Record<FactEntry['status'], string> = { confirmed: '已核实', suggested: '待确认', archived: '已归档' }
const isExpired = (entry: FactEntry) => entry.status === 'confirmed' && Boolean(entry.review_due_at) && new Date(entry.review_due_at!).getTime() < Date.now()
const formatDate = (value: string | null) => (value ? value.slice(0, 10) : '—')

const factSummary = (entry: FactEntry) => Object.entries(entry.fields || {}).map(([key, value]) => `${key} ${value}`).join('；')

export function RouteFacts() {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })
  const [editor, setEditor] = useState<{ open: boolean; initial?: Partial<FactFormValues> }>({ open: false })
  const [error, setError] = useState<string | null>(null)

  const factsQuery = useQuery({ queryKey: ['admin-route-facts'], queryFn: async () => (await adminApi<{ data: FactEntry[] }>('routeFacts')).data })
  const categoriesQuery = useQuery({ queryKey: ['admin-route-fact-categories'], queryFn: async () => { const { data } = await adminApi<{ data: FactCategory[] }>('routeFactCategories'); return (data || []).slice().sort((a, b) => a.sort_order - b.sort_order) } })
  const routesQuery = useQuery({ queryKey: ['admin-routes-picker'], queryFn: async () => (await adminApi<{ data: RouteOption[] }>('routes')).data.map((route) => ({ id: route.id, name: route.name, region: route.region })) })

  const categories = categoriesQuery.data || []
  const routes = routesQuery.data || []
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (factsQuery.data ?? []).filter((entry) => {
      if (categoryFilter !== 'all' && entry.category_slug !== categoryFilter) return false
      if (statusFilter === 'expired') { if (!isExpired(entry)) return false }
      else if (statusFilter !== 'all' && entry.status !== statusFilter) return false
      if (!term) return true
      return [entry.route?.name, entry.category?.name, entry.title, factSummary(entry), entry.source_url]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term))
    })
  }, [factsQuery.data, search, categoryFilter, statusFilter])
  const pendingCount = (factsQuery.data ?? []).filter((entry) => entry.status === 'suggested').length
  const expiredCount = (factsQuery.data ?? []).filter(isExpired).length

  const table = useReactTable({ data: rows, columns: [], state: { pagination }, onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })
  useEffect(() => { setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }) }, [rows.length])

  const refresh = () => client.invalidateQueries({ queryKey: ['admin-route-facts'] })
  async function runMutation(body: Record<string, string>) {
    setError(null)
    try { await adminMutation('routeFacts', body); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
  }
  const saveFact = async (values: FactFormValues) => {
    const schema = categories.find((category) => category.slug === values.category_slug)?.field_schema || []
    await runMutation({
      action: 'save-route-fact',
      ...(values.id ? { id: values.id } : {}),
      route_id: values.route_id,
      category_slug: values.category_slug,
      title: values.title,
      source_url: values.source_url,
      review_due_at: values.review_due_at ? new Date(values.review_due_at).toISOString() : '',
      fields: JSON.stringify(serializeFactFields(schema, values.fields)),
    })
  }
  const openEditor = (entry?: FactEntry) => {
    setEditor({ open: true, initial: entry ? { id: entry.id, route_id: entry.route_id, category_slug: entry.category_slug, title: entry.title, source_url: entry.source_url || '', review_due_at: entry.review_due_at || '', fields: Object.fromEntries(Object.entries(entry.fields || {}).map(([key, value]) => [key, String(value)])) } : { review_due_at: '' } })
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>线路资料</h2>
          <p className='text-muted-foreground'>人工核实的进出交通、费用、住宿、营地等地面信息；AI 规划行程时优先引用这里的数据。{pendingCount > 0 && <span className='text-amber-600'> 有 {pendingCount} 条待确认草稿。</span>}{expiredCount > 0 && <span className='text-destructive'> 有 {expiredCount} 条已过期，请复核。</span>}</p>
        </div>
        <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
          <CardHeader className='px-0'>
            <div className='flex w-full flex-wrap items-center justify-between gap-3'>
              <div className='flex flex-wrap items-center gap-3'>
                <CardTitle>资料条目 {factsQuery.data ? `(${rows.length}/${factsQuery.data.length})` : ''}</CardTitle>
                <ListSearch value={search} onChange={setSearch} placeholder='搜索线路、标题或内容…' />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className='w-auto'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>全部类目</SelectItem>{categories.map((category) => <SelectItem key={category.slug} value={category.slug}>{category.name}</SelectItem>)}</SelectContent></Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className='w-auto'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>全部状态</SelectItem><SelectItem value='confirmed'>已核实</SelectItem><SelectItem value='suggested'>待确认</SelectItem><SelectItem value='expired'>已过期</SelectItem><SelectItem value='archived'>已归档</SelectItem></SelectContent></Select>
              </div>
              <Button onClick={() => openEditor()}>新增资料</Button>
            </div>
          </CardHeader>
          <CardContent className='px-0'>
            {factsQuery.isError && <p className='mb-3 text-sm text-destructive'>读取失败：{factsQuery.error instanceof Error ? factsQuery.error.message : '请检查管理员权限。'}</p>}
            {error && <p className='mb-3 text-sm text-destructive'>{error}</p>}
            <div className='overflow-hidden rounded-md border'>
              <Table className='min-w-4xl'>
                <TableHeader>
                  <TableRow><TableHead>线路</TableHead><TableHead>类目</TableHead><TableHead>标题与要点</TableHead><TableHead>状态</TableHead><TableHead>确认日期</TableHead><TableHead>复核日期</TableHead><TableHead>操作</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => {
                    const entry = row.original
                    const expired = isExpired(entry)
                    return <TableRow key={entry.id} className={expired ? 'bg-red-500/5' : undefined}>
                      <TableCell className='whitespace-nowrap font-medium'>{entry.route?.name || entry.route_id}</TableCell>
                      <TableCell className='whitespace-nowrap'>{entry.category?.name || entry.category_slug}</TableCell>
                      <TableCell>
                        <div className='max-w-[520px]'><p className='truncate font-medium'>{entry.title}</p><p className='truncate text-xs text-muted-foreground'>{factSummary(entry)}{entry.source_url && <span> · </span>}<a className='underline-offset-2 hover:underline' href={entry.source_url || undefined} target='_blank' rel='noreferrer' onClick={(event) => event.stopPropagation()}>{entry.source_url ? '来源' : ''}</a></p></div>
                      </TableCell>
                      <TableCell className='whitespace-nowrap'>
                        <Badge variant={entry.status === 'confirmed' ? (expired ? 'destructive' : 'default') : entry.status === 'suggested' ? 'secondary' : 'outline'}>{statusLabels[entry.status]}</Badge>
                        {entry.origin === 'agent' && <Badge variant='outline' className='ms-1'>AI 草稿</Badge>}
                      </TableCell>
                      <TableCell className='whitespace-nowrap text-muted-foreground'>{formatDate(entry.confirmed_at)}</TableCell>
                      <TableCell className={expired ? 'whitespace-nowrap font-medium text-destructive' : 'whitespace-nowrap text-muted-foreground'}>{formatDate(entry.review_due_at)}{expired ? '（过期）' : ''}</TableCell>
                      <TableCell className='whitespace-nowrap'>
                        {entry.status === 'suggested' && <Button size='sm' variant='outline' className='me-1' onClick={() => openEditor(entry)}>确认入库</Button>}
                        {entry.status !== 'archived' && <Button size='sm' variant='outline' className='me-1' onClick={() => openEditor(entry)}>编辑</Button>}
                        {entry.status !== 'archived'
                          ? <Button size='sm' variant='ghost' onClick={() => runMutation({ action: 'archive-route-fact', id: entry.id })}>归档</Button>
                          : <Button size='sm' variant='ghost' onClick={() => runMutation({ action: 'confirm-route-fact', id: entry.id })}>恢复</Button>}
                      </TableCell>
                    </TableRow>
                  })}
                  {!factsQuery.isPending && table.getRowModel().rows.length === 0 && <TableRow><TableCell colSpan={7} className='h-24 text-center text-muted-foreground'>没有符合条件的资料条目</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination table={table} className='mt-4 border-t-0' />
          </CardContent>
        </Card>
        <FactFormDialog
          key={editor.open ? (editor.initial?.id || 'new') : 'closed'}
          open={editor.open}
          categories={categories}
          routes={routes}
          initial={editor.initial}
          onOpenChange={(open) => setEditor((current) => ({ ...current, open, initial: open ? current.initial : undefined }))}
          onSubmit={saveFact}
        />
      </Main>
    </>
  )
}
