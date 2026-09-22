import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Ban, UserCheck } from 'lucide-react'
import { adminApi, adminMutation } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfigDrawer } from '@/components/config-drawer'
import { AdminDataTable, selectionColumn } from '@/components/data-table/admin-data-table'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ResourceFormDialog } from '@/features/operations/resource-form-dialog'

type UserRow = {
  id: string
  email: string
  display_name?: string
  username?: string
  bio?: string
  role?: string
  created_at: string
  last_sign_in_at?: string | null
  banned_until?: string | null
}
const fields = [
  { key: 'email', label: '邮箱', required: true },
  { key: 'password', label: '密码（新建时必填）', placeholder: '至少 8 位' },
  { key: 'display_name', label: '显示名称' },
  { key: 'username', label: '用户名' },
  { key: 'bio', label: '简介' },
  {
    key: 'role',
    label: '角色：owner/admin/editor/viewer',
    placeholder: 'viewer',
  },
]

export function Users() {
  const client = useQueryClient()
  const [editor, setEditor] = useState<{
    open: boolean
    id?: string
    values?: Record<string, string>
  }>({ open: false })
  const query = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await adminApi<{ data: UserRow[] }>('users')).data,
  })
  const refresh = () => client.invalidateQueries({ queryKey: ['admin-users'] })
  const save = async (values: Record<string, string>) => {
    await adminMutation('users', {
      action: editor.id ? 'update-user' : 'create-user',
      ...(editor.id ? { id: editor.id } : {}),
      ...values,
    })
    await refresh()
  }
  const columns: ColumnDef<UserRow>[] = [
    selectionColumn<UserRow>(),
    { accessorKey: 'email', header: '邮箱', cell: ({ row }) => <span className='block max-w-56 truncate'>{row.original.email}</span> },
    { accessorKey: 'display_name', header: '名称', cell: ({ row }) => row.original.display_name || row.original.username || '—' },
    { accessorKey: 'role', header: '角色', cell: ({ row }) => <Badge variant='outline'>{row.original.role || '普通用户'}</Badge> },
    { accessorKey: 'created_at', header: '注册时间', cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString() },
    { accessorKey: 'last_sign_in_at', header: '最近登录', cell: ({ row }) => row.original.last_sign_in_at ? new Date(row.original.last_sign_in_at).toLocaleString() : '—' },
    { id: 'status', header: '状态', cell: ({ row }) => { const banned = Boolean(row.original.banned_until && new Date(row.original.banned_until).getTime() > Date.now()); return banned ? <Badge variant='destructive'>已禁用</Badge> : <Badge variant='outline'>正常</Badge> } },
    { id: 'actions', cell: ({ row }) => { const user = row.original; const banned = Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()); return <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant='ghost' className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'><DotsHorizontalIcon className='h-4 w-4' /><span className='sr-only'>打开菜单</span></Button></DropdownMenuTrigger><DropdownMenuContent align='end' className='w-40'><DropdownMenuItem onClick={() => setEditor({ open: true, id: user.id, values: { email: user.email, display_name: user.display_name || '', username: user.username || '', bio: user.bio || '', role: user.role || 'viewer' } })}>编辑</DropdownMenuItem><DropdownMenuItem onClick={async () => { await adminMutation('users', { action: banned ? 'unban-user' : 'ban-user', id: user.id }); await refresh() }}>{banned ? '恢复' : '禁用'}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className='text-destructive' onClick={async () => { if (window.confirm(`确认删除 ${user.email}？此操作不可恢复。`)) { await adminMutation('users', { action: 'delete-user', id: user.id }); await refresh() } }}>删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu> } },
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
        <div className='flex items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>用户管理</h2>
            <p className='text-muted-foreground'>
              真实管理 Supabase Auth 用户、资料和管理员角色。
            </p>
          </div>
          <Button onClick={() => setEditor({ open: true })}>新增用户</Button>
        </div>
        {query.isError ? <p className='text-sm text-destructive'>读取失败：{query.error instanceof Error ? query.error.message : '未知错误'}</p> : <AdminDataTable data={query.data ?? []} columns={columns} entityName='user' searchPlaceholder='按邮箱、名称或用户名筛选…' onBulkDelete={async (rows) => { if (window.confirm(`确认删除选中的 ${rows.length} 个用户？`)) { await Promise.all(rows.map((user) => adminMutation('users', { action: 'delete-user', id: user.id }))); await refresh() } }} renderBulkActions={({ rows, resetSelection }) => <><Button variant='outline' size='icon' className='size-8' title='禁用选中用户' aria-label='禁用选中用户' onClick={async () => { const activeRows = rows.filter((user) => !(user.banned_until && new Date(user.banned_until).getTime() > Date.now())); if (activeRows.length) { await Promise.all(activeRows.map((user) => adminMutation('users', { action: 'ban-user', id: user.id }))); await refresh() } resetSelection() }}><Ban /></Button><Button variant='outline' size='icon' className='size-8' title='恢复选中用户' aria-label='恢复选中用户' onClick={async () => { const bannedRows = rows.filter((user) => user.banned_until && new Date(user.banned_until).getTime() > Date.now()); if (bannedRows.length) { await Promise.all(bannedRows.map((user) => adminMutation('users', { action: 'unban-user', id: user.id }))); await refresh() } resetSelection() }}><UserCheck /></Button></>} />}
        <ResourceFormDialog
          open={editor.open}
          title={editor.id ? '编辑用户' : '新增用户'}
          description={
            editor.id
              ? '更新账号资料和密码。角色修改会同步到 Auth app_metadata。'
              : '创建一个已确认邮箱的 Supabase 用户。'
          }
          fields={fields}
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
