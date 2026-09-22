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
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Content = {
  id: string
  journey_id: string
  user_id: string
  user: { display_name: string | null; nick: string | null; username: string | null } | null
  uri: string
  thumbnail: string | null
  kind: string
  caption: string | null
  moderation_status: string
  created_at: string
}

export function ContentModeration() {
  const client = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['admin-content'],
    queryFn: async () => (await adminApi<{ data: Content[] }>('content')).data,
  })
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['admin-content'] })
  const filteredContent = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return query.data ?? []
    return (query.data ?? []).filter((item) => {
      const user = item.user?.display_name || item.user?.nick || item.user?.username || ''
      return [item.id, item.journey_id, item.user_id, item.kind, item.caption, user, item.moderation_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [query.data, search])
  const table = useReactTable({
    data: filteredContent,
    columns: [],
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  useEffect(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [filteredContent.length])
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
          <h2 className='text-2xl font-bold tracking-tight'>内容审核</h2>
          <p className='text-muted-foreground'>
            审核、编辑和删除用户上传的灵感媒体。
          </p>
        </div>
        <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
          <CardHeader className='px-0'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <CardTitle>灵感媒体 {query.data ? `(${filteredContent.length}/${query.data.length})` : ''}</CardTitle>
              <ListSearch value={search} onChange={setSearch} placeholder='搜索说明、类型、用户或 ID…' />
            </div>
          </CardHeader>
          <CardContent className='px-0'>
            {query.isError ? (
              <p className='text-sm text-destructive'>
                读取失败：
                {query.error instanceof Error
                  ? query.error.message
                  : '未知错误'}
              </p>
            ) : (
              <div className='overflow-hidden rounded-md border'>
                <Table className='min-w-xl'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>预览</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>说明</TableHead>
                      <TableHead>用户</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>上传时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => {
                      const item = row.original
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.thumbnail || item.uri ? (
                              <img
                                src={item.thumbnail || item.uri}
                                alt=''
                                className='h-12 w-16 rounded object-cover'
                              />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>{item.kind}</TableCell>
                          <TableCell className='max-w-xs'>
                            {item.caption || '—'}
                          </TableCell>
                          <TableCell>{item.user?.display_name || item.user?.nick || item.user?.username || `用户 ${item.user_id.slice(0, 8)}`}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.moderation_status === 'rejected'
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {item.moderation_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(item.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className='flex gap-1'>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={async () => {
                                await adminMutation('content', {
                                  action: 'moderate-content',
                                  id: item.id,
                                  status: 'approved',
                                })
                                await refresh()
                              }}
                            >
                              通过
                            </Button>
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-destructive'
                              onClick={async () => {
                                await adminMutation('content', {
                                  action: 'moderate-content',
                                  id: item.id,
                                  status: 'rejected',
                                })
                                await refresh()
                              }}
                            >
                              拒绝
                            </Button>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={async () => {
                                const caption = window.prompt(
                                  '编辑内容说明',
                                  item.caption || ''
                                )
                                if (caption !== null) {
                                  await adminMutation('content', {
                                    action: 'update-content',
                                    id: item.id,
                                    caption,
                                  })
                                  await refresh()
                                }
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-destructive'
                              onClick={async () => {
                                if (window.confirm('确认删除这条内容？')) {
                                  await adminMutation('content', {
                                    action: 'delete-content',
                                    id: item.id,
                                  })
                                  await refresh()
                                }
                              }}
                            >
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                {!query.isLoading && !query.data?.length && (
                  <p className='p-8 text-center text-sm text-muted-foreground'>
                    暂无内容
                  </p>
                )}
                {Boolean(query.data?.length) && (
                  <DataTablePagination table={table} className='mt-4' />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
