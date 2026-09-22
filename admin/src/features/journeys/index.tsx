import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from '@tanstack/react-table'
import { adminApi, adminMutation } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { DataTablePagination } from '@/components/data-table'
import { ListSearch } from '@/components/data-table/list-search'
import { AdminDataTable, selectionColumn } from '@/components/data-table/admin-data-table'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Journey = {
  id: string
  name: string
  region: string | null
  created_at: string
  planned_date: string | null
  total_days: number | null
  user_id: string
  deleted_at: string | null
  user: {
    id: string
    display_name: string | null
    nick: string | null
    username: string | null
    avatar_url: string | null
  } | null
}

export function Journeys() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['admin-journeys'],
    queryFn: async () => (await adminApi<{ data: Journey[] }>('journeys')).data,
  })
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [search, setSearch] = useState('')
  const filteredJourneys = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return query.data ?? []
    return (query.data ?? []).filter((journey) => [journey.id, journey.name, journey.region, journey.user_id, journey.user?.display_name, journey.user?.nick, journey.user?.username].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
  }, [query.data, search])
  const table = useReactTable({ data: filteredJourneys, columns: [], state: { pagination }, onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() })
  useEffect(() => { setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }) }, [filteredJourneys.length])
  const adminColumns = [
    selectionColumn<Journey>(),
    { accessorKey: 'name', header: '名称', cell: ({ row }: { row: { original: Journey } }) => <span className='block max-w-48 truncate font-medium'>{row.original.name || '未命名旅程'}</span> },
    { accessorKey: 'region', header: '地区', cell: ({ row }: { row: { original: Journey } }) => row.original.region || '—' },
    { id: 'status', header: '状态', cell: ({ row }: { row: { original: Journey } }) => row.original.deleted_at ? <Badge variant='destructive'>已删除</Badge> : <Badge variant='outline'>正常</Badge> },
    { accessorKey: 'planned_date', header: '计划日期', cell: ({ row }: { row: { original: Journey } }) => row.original.planned_date || '未计划' },
    { accessorKey: 'total_days', header: '天数', cell: ({ row }: { row: { original: Journey } }) => row.original.total_days || '—' },
    { accessorKey: 'created_at', header: '创建时间', cell: ({ row }: { row: { original: Journey } }) => new Date(row.original.created_at).toLocaleDateString() },
    { id: 'user', header: '用户', cell: ({ row }: { row: { original: Journey } }) => row.original.user?.display_name || row.original.user?.nick || row.original.user?.username || `用户 ${row.original.user_id.slice(0, 8)}` },
    { id: 'actions', cell: ({ row }: { row: { original: Journey } }) => <Button variant='ghost' size='sm' onClick={() => window.alert(row.original.name || '未命名旅程')}>更多</Button> },
  ]
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
          <h2 className='text-2xl font-bold tracking-tight'>旅程管理</h2>
          <p className='text-muted-foreground'>
            查看、审核、软删除和恢复用户旅程。
          </p>
        </div>
        {query.isError ? <p className='text-sm text-destructive'>读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}</p> : <AdminDataTable data={query.data ?? []} columns={adminColumns} entityName='journey' searchPlaceholder='按名称、地区或用户筛选…' onBulkDelete={async (rows) => { if (window.confirm(`确认删除选中的 ${rows.length} 个旅程？`)) { await Promise.all(rows.map((journey) => adminMutation('journeys', { action: 'delete-journey', id: journey.id }))); await queryClient.invalidateQueries({ queryKey: ['admin-journeys'] }) } }} />}
        {false && <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
          <CardHeader className='px-0'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <CardTitle>旅程列表 {query.data ? `(${filteredJourneys.length}/${query.data.length})` : ''}</CardTitle>
              <ListSearch value={search} onChange={setSearch} placeholder='搜索旅程、地区或用户…' />
            </div>
          </CardHeader>
          <CardContent className='px-0'>
            {query.isError ? (
              <p className='text-sm text-destructive'>
                读取失败：
                {query.error instanceof Error
                  ? query.error.message
                  : '请检查管理员权限。'}
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <div className='overflow-hidden rounded-md border'>
                  <Table className='w-full min-w-[980px] table-fixed'>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-48'>名称</TableHead>
                        <TableHead className='w-32'>地区</TableHead>
                        <TableHead className='w-24'>状态</TableHead>
                        <TableHead className='w-32'>计划日期</TableHead>
                        <TableHead className='w-20'>天数</TableHead>
                        <TableHead className='w-32'>创建时间</TableHead>
                        <TableHead className='w-56'>用户</TableHead>
                        <TableHead className='w-32'>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.map((row) => {
                        const journey = row.original
                        const ownerName =
                          journey.user?.display_name ||
                          journey.user?.nick ||
                          journey.user?.username ||
                          '未完善昵称'
                        return (
                          <TableRow key={journey.id}>
                            <TableCell className='max-w-48 font-medium'>
                              <span
                                className='block truncate'
                                title={journey.name}
                              >
                                {journey.name || '未命名旅程'}
                              </span>
                            </TableCell>
                            <TableCell className='max-w-32'>
                              <span
                                className='block truncate'
                                title={journey.region || '—'}
                              >
                                {journey.region || '—'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {journey.deleted_at ? (
                                <Badge variant='destructive'>已删除</Badge>
                              ) : (
                                <Badge variant='outline'>正常</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {journey.planned_date || '未计划'}
                            </TableCell>
                            <TableCell>{journey.total_days || '—'}</TableCell>
                            <TableCell>
                              {new Date(
                                journey.created_at
                              ).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant='link'
                                    className='h-auto max-w-52 justify-start truncate p-0 font-medium'
                                    title={ownerName}
                                  >
                                    {ownerName}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align='start' className='w-72'>
                                  <div className='space-y-2'>
                                    <p className='font-medium'>{ownerName}</p>
                                    <p className='text-xs text-muted-foreground'>
                                      用户 ID：{journey.user_id}
                                    </p>
                                    {journey.user?.username && (
                                      <p className='text-xs text-muted-foreground'>
                                        用户名：{journey.user.username}
                                      </p>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell>
                              <Button
                                size='sm'
                                variant='ghost'
                                onClick={async () => {
                                  await adminMutation('journeys', {
                                    action: journey.deleted_at
                                      ? 'restore-journey'
                                      : 'delete-journey',
                                    id: journey.id,
                                  })
                                  await queryClient.invalidateQueries({
                                    queryKey: ['admin-journeys'],
                                  })
                                }}
                              >
                                {journey.deleted_at ? '恢复' : '软删除'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  {!query.isLoading && !query.data?.length && (
                    <p className='p-8 text-center text-sm text-muted-foreground'>
                      暂无旅程数据
                    </p>
                  )}
                </div>
                {Boolean(query.data?.length) && (
                  <DataTablePagination table={table} className='mt-4' />
                )}
              </div>
            )}
          </CardContent>
        </Card>}
      </Main>
    </>
  )
}
