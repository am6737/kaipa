import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from '@tanstack/react-table'
import { adminApi, adminMutation } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { DataTablePagination } from '@/components/data-table'
import { ListSearch } from '@/components/data-table/list-search'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Notice = {
  id: string
  verb: string
  target: string
  created_at: string
  read: boolean
  user_id: string
  user: { display_name: string | null; nick: string | null; username: string | null } | null
}

export function NotificationsAdmin() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const query = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () =>
      (await adminApi<{ data: Notice[] }>('notifications')).data,
  })
  const filteredNotifications = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return query.data ?? []
    return (query.data ?? []).filter((item) => {
      const user = item.user?.display_name || item.user?.nick || item.user?.username || ''
      return [item.id, item.verb, item.target, item.user_id, user]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [query.data, search])
  const table = useReactTable({
    data: filteredNotifications,
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
  }, [filteredNotifications.length])
  async function send() {
    if (!title.trim() || !message.trim()) return
    setSending(true)
    try {
      await adminMutation('notifications', {
        action: 'broadcast-notification',
        title,
        message,
      })
      setTitle('')
      setMessage('')
      await query.refetch()
    } finally {
      setSending(false)
    }
  }
  async function revoke(id: string) {
    if (!window.confirm('确认撤回这条通知？')) return
    await adminMutation('notifications', { action: 'delete-notification', id })
    await query.refetch()
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
          <h2 className='text-2xl font-bold tracking-tight'>通知中心</h2>
          <p className='text-muted-foreground'>
            向全体用户广播通知，并管理已发送消息。
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>发送广播</CardTitle>
          </CardHeader>
          <CardContent className='grid max-w-2xl gap-3'>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder='通知标题'
            />
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder='通知内容'
            />
            <div>
              <Button
                onClick={send}
                disabled={sending || !title.trim() || !message.trim()}
              >
                {sending ? '发送中…' : '发送给所有用户'}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
          <CardHeader className='px-0'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <CardTitle>最近通知 {query.data ? `(${filteredNotifications.length}/${query.data.length})` : ''}</CardTitle>
              <ListSearch value={search} onChange={setSearch} placeholder='搜索标题、内容或用户…' />
            </div>
          </CardHeader>
          <CardContent className='px-0'>
            <div className='overflow-hidden rounded-md border'>
              <Table className='min-w-xl'>
                <TableHeader>
                  <TableRow>
                    <TableHead>标题</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>已读</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => {
                    const item = row.original
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.verb}</TableCell>
                        <TableCell>{item.target}</TableCell>
                        <TableCell>{item.user?.display_name || item.user?.nick || item.user?.username || `用户 ${item.user_id.slice(0, 8)}`}</TableCell>
                        <TableCell>{item.read ? '是' : '否'}</TableCell>
                        <TableCell>
                          {new Date(item.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size='sm'
                            variant='ghost'
                            className='text-destructive'
                            onClick={() => revoke(item.id)}
                          >
                            撤回
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {Boolean(query.data?.length) && (
                <DataTablePagination table={table} className='mt-4' />
              )}
            </div>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
