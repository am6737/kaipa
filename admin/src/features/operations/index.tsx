import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from '@tanstack/react-table'
import { adminApi, adminMutation, fetchRouteWaypoints, uploadAdminTrack } from '@/lib/supabase'
import { parseRouteTrack } from '@/lib/route-track-parser'
import { mergeWaypointCuration } from '@/lib/route-waypoint-merge'
import { parseWaypoints, serializeWaypoints, waypointName } from '@/lib/route-waypoints'
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
import { ResourceFormDialog } from './resource-form-dialog'
import { RouteWaypointsDialog } from './waypoints-dialog'

type Row = Record<string, unknown>
type Column = {
  key: string
  label: string
  format?: (value: unknown, row: Row) => React.ReactNode
}
function useListTable(data: Row[]) {
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data
    return data.filter((row) => {
      try {
        return JSON.stringify(row).toLowerCase().includes(term)
      } catch {
        return false
      }
    })
  }, [data, search])
  const table = useReactTable({
    data: filteredData,
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
  }, [filteredData.length])
  return { table, search, setSearch, total: data.length, filteredCount: filteredData.length }
}
const date = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString() : '—'
const status = (value: unknown) => (
  <Badge variant='outline'>{String(value || '未知')}</Badge>
)
const owner = (row: Row) => {
  const user = row.user as { display_name?: string | null; nick?: string | null; username?: string | null } | null
  const id = row.user_id || row.created_by || row.actor_id
  return user?.display_name || user?.nick || user?.username || (id ? `用户 ${String(id).slice(0, 8)}` : '—')
}
function downloadRow(row: Row, fallbackName: string) {
  const url = typeof row.track_file_url === 'string' ? row.track_file_url : typeof row.file_url === 'string' ? row.file_url : ''
  const filename = String(row.track_file_name || row.file_name || `${fallbackName}.${row.file_format || 'json'}`)
  if (url) {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.click(); return
  }
  const blob = new Blob([JSON.stringify(row, null, 2)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename; anchor.click(); URL.revokeObjectURL(objectUrl)
}

function Shell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
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
          <h2 className='text-2xl font-bold tracking-tight'>{title}</h2>
          <p className='text-muted-foreground'>{description}</p>
        </div>
        {children}
      </Main>
    </>
  )
}
function ReadOnlyResource({
  resource,
  title,
  description,
  columns,
}: {
  resource: string
  title: string
  description: string
  columns: Column[]
}) {
  const query = useQuery({
    queryKey: ['admin', resource],
    queryFn: () => adminApi<{ data: Row[] }>(resource),
  })
  const list = useListTable(query.data?.data ?? [])
  return (
    <Shell title={title} description={description}>
      <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
        <CardHeader className='px-0'>
          <CardTitle>
            {title} {query.data ? `(${query.data.data.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className='px-0'>
          {query.isError ? (
            <p className='text-sm text-destructive'>
              读取失败：
              {query.error instanceof Error ? query.error.message : '未知错误'}
            </p>
          ) : (
            <>
              <div className='mb-4 flex justify-end'>
                <ListSearch value={list.search} onChange={list.setSearch} placeholder='搜索记录…' />
              </div>
              <div className='overflow-hidden rounded-md border'>
              <Table className='min-w-xl'>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.table.getRowModel().rows.map((row) => (
                    <TableRow key={String(row.original.id ?? row.index)}>
                      {columns.map((column) => (
                        <TableCell key={column.key}>
                          {column.format
                            ? column.format(
                                row.original[column.key],
                                row.original
                              )
                            : String(row.original[column.key] ?? '—')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              {Boolean(query.data?.data.length) && (
                <DataTablePagination table={list.table} className='mt-4' />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Shell>
  )
}

const routeFields = [
  { key: 'name', label: '路线名称', required: true },
  { key: 'region', label: '地区（可修改）' },
  { key: 'dist', label: '距离' },
  { key: 'asc_', label: '爬升' },
  { key: 'diff', label: '难度' },
  // Every usual way to walk the route, in walking days: 1,2,3 for a long day or
  // split; 3,5 when there is no common four-day plan. 1-3 is shorthand for 1,2,3.
  { key: 'days', label: '天数', placeholder: '如 1,2,3 或 3,5' },
  { key: 'lng', label: '经度', placeholder: '0' },
  { key: 'lat', label: '纬度', placeholder: '0' },
]
function routeDaysList(row: Row) {
  return Array.isArray(row.days) ? row.days.map(Number).filter((d) => d > 0) : []
}
// Consecutive days collapse to a range: {1,2,3} → 1-3 天, {3,5} → 3 / 5 天.
function routeDaysLabel(row: Row) {
  const days = routeDaysList(row)
  if (!days.length) return '—'
  const runs: number[][] = []
  for (const d of days) {
    const run = runs[runs.length - 1]
    if (run && d === run[run.length - 1] + 1) run.push(d)
    else runs.push([d])
  }
  return `${runs.map((run) => (run.length > 1 ? `${run[0]}-${run[run.length - 1]}` : `${run[0]}`)).join(' / ')} 天`
}
export function RoutesAdmin() {
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const [replaceTarget, setReplaceTarget] = useState<Row | null>(null)
  const [waypointsTarget, setWaypointsTarget] = useState<{ id: string; name: string } | null>(null)
  const [batchUploading, setBatchUploading] = useState(false)
  const [editor, setEditor] = useState<{
    open: boolean
    id?: string
    values?: Record<string, string>
  }>({ open: false })
  const query = useQuery({
    queryKey: ['admin', 'routes'],
    queryFn: () => adminApi<{ data: Row[] }>('routes'),
  })
  const list = useListTable(query.data?.data ?? [])
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['admin', 'routes'] })
  const save = async (values: Record<string, string>) => {
    await adminMutation('routes', {
      action: editor.id ? 'update-route' : 'create-route',
      ...(editor.id ? { id: editor.id } : {}),
      ...values,
    })
    await refresh()
  }
  const chooseFile = async (file: File) => {
    const parsed = await parseRouteTrack(file)
    const uploaded = await uploadAdminTrack(file)
    setEditor({
      open: true,
      values: {
        ...parsed,
        region: '未分类',
        track_file_url: uploaded.url,
        track_file_name: uploaded.name,
      },
    })
  }
  const chooseFiles = async (files: File[]) => {
    if (files.length <= 1) {
      if (files[0]) await chooseFile(files[0])
      return
    }
    setBatchUploading(true)
    let success = 0
    const failures: string[] = []
    try {
      for (const file of files) {
        try {
          const parsed = await parseRouteTrack(file)
          const uploaded = await uploadAdminTrack(file)
          await adminMutation('routes', {
            action: 'create-route',
            id: crypto.randomUUID(),
            ...parsed,
            region: '未分类',
            track_file_url: uploaded.url,
            track_file_name: uploaded.name,
          })
          success += 1
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : '未知错误'}`)
          console.warn('[RoutesAdmin] batch upload failed', file.name, error)
        }
      }
      await refresh()
      window.alert(`已批量创建 ${success}/${files.length} 条路线${failures.length ? `\n${failures.join('\n')}` : '。'}`)
    } finally {
      setBatchUploading(false)
    }
  }
  const replaceRouteFile = async (file: File) => {
    if (!replaceTarget) return
    const id = String(replaceTarget.id)
    const stored = await fetchRouteWaypoints(id)
    const parsed = await parseRouteTrack(file)
    const uploaded = await uploadAdminTrack(file)
    const merged = mergeWaypointCuration(parseWaypoints(parsed.track_waypoints), stored.waypoints)
    // A plain GPX has no named points, so writing its empty list would discard
    // every highlight and photo the merge just carried over.
    const keptStored = merged.waypoints.length === 0 && stored.waypoints.length > 0
    const waypoints = keptStored ? stored.waypoints : merged.waypoints
    await adminMutation('routes', {
      action: 'update-route',
      id,
      ...parsed,
      track_waypoints: serializeWaypoints(waypoints),
      region: String(replaceTarget.region || '未分类'),
      track_file_url: uploaded.url,
      track_file_name: uploaded.name,
    })
    setReplaceTarget(null)
    await refresh()
    const notices: string[] = []
    if (keptStored) notices.push(`新轨迹未解析出途经点，已保留原有 ${waypoints.length} 个途经点及其标注。`)
    if (!keptStored && merged.lost.length) notices.push(`以下已标注的途经点在新轨迹中没有匹配上，亮点和照片已丢失：\n${merged.lost.map((waypoint) => waypointName(waypoint) || '（未命名）').join('\n')}`)
    if (notices.length) window.alert(`替换轨迹完成，请复核：\n${notices.join('\n')}`)
  }
  return (
    <Shell
      title='路线目录'
      description='新增路线请上传用户轨迹文件，系统会自动解析路线信息；保存前仍可校对。'
    >
      <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
        <CardHeader className='flex flex-row items-center justify-between'>
            <div className='flex flex-wrap items-center gap-3'>
              <CardTitle>路线列表 {query.data ? `(${list.filteredCount}/${list.total})` : ''}</CardTitle>
              <ListSearch value={list.search} onChange={list.setSearch} placeholder='搜索路线、地区、创建者或 ID…' />
            </div>
          <input ref={input} type='file' accept='.gpx,.kml,.kmz' multiple className='hidden' onChange={async (event) => { const files = Array.from(event.target.files || []); event.currentTarget.value = ''; if (files.length) { try { await chooseFiles(files) } catch (error) { window.alert(error instanceof Error ? error.message : '轨迹解析失败') } } }} />
          <input ref={replaceInput} type='file' accept='.gpx,.kml,.kmz' className='hidden' onChange={async (event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) { try { await replaceRouteFile(file) } catch (error) { window.alert(error instanceof Error ? error.message : '替换轨迹失败') } } }} />
          <Button disabled={batchUploading} onClick={() => input.current?.click()}>{batchUploading ? '批量上传中…' : '上传轨迹新增路线'}</Button>
        </CardHeader>
        <CardContent className='px-0'>
          <div className='overflow-hidden rounded-md border'>
          <Table className='min-w-xl'>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>地区</TableHead>
                <TableHead>距离</TableHead>
                <TableHead>爬升</TableHead>
                    <TableHead>难度</TableHead>
                    <TableHead>天数</TableHead>
                    <TableHead>创建者</TableHead>
                    <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.table.getRowModel().rows.map(({ original: row }) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{String(row.name || '—')}</TableCell>
                  <TableCell>{String(row.region || '—')}</TableCell>
                  <TableCell>{String(row.dist || '—')}</TableCell>
                  <TableCell>{String(row.asc_ || '—')}</TableCell>
                  <TableCell>{String(row.diff || '—')}</TableCell>
                  <TableCell>{routeDaysLabel(row)}</TableCell>
                  <TableCell>{owner(row)}</TableCell>
                  <TableCell className='flex gap-1'>
                    <Button size='sm' variant='ghost' onClick={() => downloadRow(row, String(row.name || 'route'))}>下载</Button>
                    <Button size='sm' variant='ghost' onClick={() => { setReplaceTarget(row); replaceInput.current?.click() }}>替换文件</Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() =>
                        setEditor({
                          open: true,
                          id: String(row.id),
                          values: Object.fromEntries(
                            routeFields.map((field) => [
                              field.key,
                              field.key === 'days'
                                ? routeDaysList(row).join(',')
                                : String(row[field.key] ?? ''),
                            ])
                          ),
                        })
                      }
                    >
                      编辑
                    </Button>
                    <Button size='sm' variant='ghost' onClick={() => setWaypointsTarget({ id: String(row.id), name: String(row.name || '') })}>途经点</Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-destructive'
                      onClick={async () => {
                        if (window.confirm('确认删除路线？')) {
                          await adminMutation('routes', {
                            action: 'delete-route',
                            id: String(row.id),
                          })
                          await refresh()
                        }
                      }}
                    >
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {Boolean(query.data?.data.length) && (
            <DataTablePagination table={list.table} className='mt-4' />
          )}
        </CardContent>
      </Card>
      <ResourceFormDialog
        open={editor.open}
        title={editor.id ? '编辑路线' : '确认解析后的路线信息'}
        description={editor.id ? '可修改自动解析的路线信息。' : '轨迹文件已解析，请核对信息后保存。'}
        fields={routeFields}
        initial={editor.values}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSubmit={save}
      />
      <RouteWaypointsDialog
        open={Boolean(waypointsTarget)}
        route={waypointsTarget}
        onOpenChange={(open) => { if (!open) setWaypointsTarget(null) }}
      />
    </Shell>
  )
}

const trackFields = [
  { key: 'name', label: '轨迹名称', required: true },
  { key: 'file_name', label: '文件名' },
  { key: 'file_format', label: '格式', placeholder: 'gpx / kml / kmz' },
  { key: 'file_url', label: '文件 URL' },
  { key: 'dist_m', label: '距离（米）' },
  { key: 'asc_m', label: '爬升（米）' },
  { key: 'point_count', label: '轨迹点数量' },
]
export function TracksAdmin() {
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const [replaceTarget, setReplaceTarget] = useState<Row | null>(null)
  const [batchUploading, setBatchUploading] = useState(false)
  const [editor, setEditor] = useState<{
    open: boolean
    id?: string
    values?: Record<string, string>
  }>({ open: false })
  const query = useQuery({
    queryKey: ['admin', 'tracks'],
    queryFn: () => adminApi<{ data: Row[] }>('tracks'),
  })
  const list = useListTable(query.data?.data ?? [])
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['admin', 'tracks'] })
  const save = async (values: Record<string, string>) => {
    await adminMutation('tracks', {
      action: editor.id ? 'update-track' : 'create-track',
      ...(editor.id ? { id: editor.id } : {}),
      ...values,
    })
    await refresh()
  }
  const chooseFile = async (file: File) => {
    const uploaded = await uploadAdminTrack(file)
    setEditor({
      open: true,
      values: {
        name: file.name.replace(/\.(gpx|kml|kmz)$/i, ''),
        file_name: uploaded.name,
        file_format: uploaded.format,
        file_url: uploaded.url,
      },
    })
  }
  const chooseFiles = async (files: File[]) => {
    if (files.length <= 1) {
      if (files[0]) await chooseFile(files[0])
      return
    }
    setBatchUploading(true)
    let success = 0
    const failures: string[] = []
    try {
      for (const file of files) {
        try {
          const uploaded = await uploadAdminTrack(file)
          await adminMutation('tracks', {
            action: 'create-track',
            id: crypto.randomUUID(),
            name: file.name.replace(/\.(gpx|kml|kmz)$/i, ''),
            file_name: uploaded.name,
            file_format: uploaded.format,
            file_url: uploaded.url,
          })
          success += 1
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : '未知错误'}`)
          console.warn('[TracksAdmin] batch upload failed', file.name, error)
        }
      }
      await refresh()
      window.alert(`已批量创建 ${success}/${files.length} 条轨迹${failures.length ? `\n${failures.join('\n')}` : '。'}`)
    } finally {
      setBatchUploading(false)
    }
  }
  const replaceTrackFile = async (file: File) => {
    if (!replaceTarget) return
    const uploaded = await uploadAdminTrack(file)
    await adminMutation('tracks', {
      action: 'update-track',
      id: String(replaceTarget.id),
      name: String(replaceTarget.name || file.name.replace(/\.(gpx|kml|kmz)$/i, '')),
      file_name: uploaded.name,
      file_format: uploaded.format,
      file_url: uploaded.url,
    })
    setReplaceTarget(null)
    await refresh()
  }
  return (
    <Shell
      title='轨迹库'
      description='使用标准表单上传、编辑和删除 GPX、KML、KMZ 轨迹。'
    >
      <Card className='gap-4 rounded-none border-0 bg-transparent py-0 shadow-none'>
        <CardHeader className='flex flex-row items-center justify-between'>
            <div className='flex flex-wrap items-center gap-3'>
              <CardTitle>轨迹列表 {query.data ? `(${list.filteredCount}/${list.total})` : ''}</CardTitle>
              <ListSearch value={list.search} onChange={list.setSearch} placeholder='搜索轨迹、文件名、用户或 ID…' />
            </div>
          <input
            ref={input}
            type='file'
            accept='.gpx,.kml,.kmz'
            multiple
            className='hidden'
            onChange={async (event) => {
              const files = Array.from(event.target.files || [])
              event.currentTarget.value = ''
              if (files.length) await chooseFiles(files)
            }}
          />
          <input ref={replaceInput} type='file' accept='.gpx,.kml,.kmz' className='hidden' onChange={async (event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) { try { await replaceTrackFile(file) } catch (error) { window.alert(error instanceof Error ? error.message : '替换轨迹失败') } } }} />
          <Button disabled={batchUploading} onClick={() => input.current?.click()}>{batchUploading ? '批量上传中…' : '上传轨迹'}</Button>
        </CardHeader>
        <CardContent className='px-0'>
          <div className='overflow-hidden rounded-md border'>
          <Table className='min-w-xl'>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>格式</TableHead>
                <TableHead>文件</TableHead>
                <TableHead>距离</TableHead>
                <TableHead>爬升</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.table.getRowModel().rows.map(({ original: row }) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{String(row.name || '—')}</TableCell>
                  <TableCell>
                    <Badge variant='outline'>
                      {String(row.file_format || '—')}
                    </Badge>
                  </TableCell>
                  <TableCell>{String(row.file_name || '—')}</TableCell>
                  <TableCell>{String(row.dist_m || '—')}</TableCell>
                  <TableCell>{String(row.asc_m || '—')}</TableCell>
                  <TableCell>{owner(row)}</TableCell>
                  <TableCell className='flex gap-1'>
                    <Button size='sm' variant='ghost' disabled={!row.file_url} onClick={() => downloadRow(row, String(row.name || 'track'))}>下载</Button>
                    <Button size='sm' variant='ghost' onClick={() => { setReplaceTarget(row); replaceInput.current?.click() }}>替换文件</Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() =>
                        setEditor({
                          open: true,
                          id: String(row.id),
                          values: Object.fromEntries(
                            trackFields.map((field) => [
                              field.key,
                              String(row[field.key] ?? ''),
                            ])
                          ),
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
                        if (
                          window.confirm(
                            '确认删除轨迹？关联旅程会自动解除轨迹关联。'
                          )
                        ) {
                          await adminMutation('tracks', {
                            action: 'delete-track',
                            id: String(row.id),
                          })
                          await refresh()
                        }
                      }}
                    >
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {Boolean(query.data?.data.length) && (
            <DataTablePagination table={list.table} className='mt-4' />
          )}
        </CardContent>
      </Card>
      <ResourceFormDialog
        open={editor.open}
        title={editor.id ? '编辑轨迹' : '确认轨迹信息'}
        description='文件已上传到 Storage，请确认轨迹元数据。'
        fields={trackFields}
        initial={editor.values}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSubmit={save}
      />
    </Shell>
  )
}

export function AgentRunsAdmin() {
  return (
    <ReadOnlyResource
      resource='agentRuns'
      title='AI 运行监控'
      description='查看规划助手运行状态、版本和错误。'
      columns={[
        { key: 'status', label: '状态', format: status },
        { key: 'agent_version', label: '版本' },
        { key: 'user_id', label: '用户', format: (_value, row) => owner(row) },
        { key: 'error', label: '错误' },
        { key: 'created_at', label: '开始时间', format: date },
        { key: 'updated_at', label: '更新时间', format: date },
      ]}
    />
  )
}
export function AuditAdmin() {
  return (
    <ReadOnlyResource
      resource='audit'
      title='管理员审计日志'
      description='追踪管理员查看、修改和删除操作。'
      columns={[
        { key: 'action', label: '操作', format: status },
        { key: 'resource_type', label: '资源' },
        { key: 'resource_id', label: '资源 ID' },
        { key: 'actor_id', label: '管理员', format: (_value, row) => owner(row) },
        { key: 'created_at', label: '时间', format: date },
      ]}
    />
  )
}
