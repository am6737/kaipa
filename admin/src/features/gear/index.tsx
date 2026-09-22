import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from '@tanstack/react-table'
import { adminApi, adminMutation } from '@/lib/supabase'
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
import { ResourceFormDialog } from '../operations/resource-form-dialog'

export function Gear() {
  const client = useQueryClient()
  const [editor, setEditor] = useState<{
    open: boolean
    id?: number
    values?: Record<string, string>
  }>({ open: false })
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['admin-gear'],
    queryFn: async () => {
      const { data } = await adminApi<{
        data: Array<{
          id: number
          name: string
          weight: number | null
          price: number | null
          user_id: string
          user: { display_name: string | null; nick: string | null; username: string | null } | null
          created_at: string
        }>
      }>('gear')
      return data
    },
  })
  const filteredGear = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return query.data ?? []
    return (query.data ?? []).filter((item) => {
      const user = item.user?.display_name || item.user?.nick || item.user?.username || ''
      return [item.id, item.name, item.user_id, user, item.weight, item.price]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [query.data, search])
  const table = useReactTable({
    data: filteredGear,
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
  }, [filteredGear.length])
  const refresh = () => client.invalidateQueries({ queryKey: ['admin-gear'] })
  const save = async (values: Record<string, string>) => {
    await adminMutation('gear', {
      action: editor.id ? 'update-gear' : 'create-gear',
      ...(editor.id ? { id: String(editor.id) } : {}),
      ...values,
    })
    await refresh()
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
          <h2 className='text-2xl font-bold tracking-tight'>装备库</h2>
          <p className='text-muted-foreground'>
            浏览用户维护的装备条目和重量信息。
          </p>
        </div>
        <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
          <CardHeader className='px-0'>
            <div className='flex w-full items-center justify-between'>
              <div className='flex flex-wrap items-center gap-3'>
                <CardTitle>装备条目 {query.data ? `(${filteredGear.length}/${query.data.length})` : ''}</CardTitle>
                <ListSearch value={search} onChange={setSearch} placeholder='搜索装备、用户或 ID…' />
              </div>
              <Button onClick={() => setEditor({ open: true })}>
                新增装备
              </Button>
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
              <div className='overflow-hidden rounded-md border'>
                <Table className='min-w-xl'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>重量</TableHead>
                      <TableHead>价格</TableHead>
                      <TableHead>用户</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => {
                      const item = row.original
                      return (
                        <TableRow key={item.id}>
                          <TableCell className='font-medium'>
                            {item.name || '未命名装备'}
                          </TableCell>
                          <TableCell>
                            {item.weight != null ? `${item.weight} g` : '—'}
                          </TableCell>
                          <TableCell>
                            {item.price != null ? `${item.price}` : '—'}
                          </TableCell>
                          <TableCell>{item.user?.display_name || item.user?.nick || item.user?.username || `用户 ${item.user_id.slice(0, 8)}`}</TableCell>
                          <TableCell>
                            {new Date(item.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className='flex gap-1'>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={() =>
                                setEditor({
                                  open: true,
                                  id: item.id,
                                  values: {
                                    name: item.name,
                                    user_id: item.user_id,
                                    weight: String(item.weight ?? ''),
                                    price: String(item.price ?? ''),
                                  },
                                })
                              }
                            >
                              编辑
                            </Button>
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-destructive'
                              onClick={async () => {
                                if (window.confirm('确认删除这条装备？')) {
                                  await adminMutation('gear', {
                                    action: 'delete-gear',
                                    id: String(item.id),
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
                    暂无装备数据
                  </p>
                )}
                {Boolean(query.data?.length) && (
                  <DataTablePagination table={table} className='mt-4' />
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <ResourceFormDialog
          open={editor.open}
          title={editor.id ? '编辑装备' : '新增装备'}
          description='维护用户装备条目的名称、重量和价格。'
          fields={[
            { key: 'name', label: '名称', required: true },
            { key: 'user_id', label: '所属用户', type: 'user', required: true },
            { key: 'weight', label: '重量（克）', required: true },
            { key: 'price', label: '价格', required: true },
          ]}
          initial={editor.values}
          onOpenChange={(open) =>
            setEditor((current) => ({ ...current, open }))
          }
          onSubmit={save}
        />
      </Main>
    </>
  )
}
