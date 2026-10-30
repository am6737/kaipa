import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type Waypoint,
  serializeWaypoints,
  withHighlight,
  withPhoto,
  waypointEle,
  waypointHighlighted,
  waypointKm,
  waypointName,
  waypointPhoto,
} from '@/lib/route-waypoints'
import {
  adminMutation,
  fetchRouteWaypoints,
  uploadAdminImage,
} from '@/lib/supabase'
import { prepareWaypointPhoto } from '@/lib/waypoint-photo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Filter = 'all' | 'highlight' | 'photo'

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'highlight', label: '仅亮点' },
  { key: 'photo', label: '有照片' },
]

const kmLabel = (waypoint: Waypoint) => {
  const km = waypointKm(waypoint)
  return km == null ? '里程未知' : `第 ${km.toFixed(1)} km`
}

const eleLabel = (waypoint: Waypoint) => {
  const ele = waypointEle(waypoint)
  return ele == null ? null : `海拔 ${Math.round(ele)} m`
}

export function RouteWaypointsDialog({
  open,
  route,
  onOpenChange,
}: {
  open: boolean
  route: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const client = useQueryClient()
  const photoInput = useRef<HTMLInputElement>(null)
  const routeId = route?.id
  // Only the unsaved edits live here; the stored list stays whatever the
  // server returned, so opening the dialog again always starts clean.
  const [edits, setEdits] = useState<Record<number, Waypoint>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [uploadIndex, setUploadIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const query = useQuery({
    queryKey: ['admin', 'route-waypoints', routeId],
    queryFn: () => {
      if (!routeId) throw new Error('未选择路线')
      return fetchRouteWaypoints(routeId)
    },
    enabled: open && Boolean(routeId),
    // The OS file picker steals window focus, which must not discard the list.
    refetchOnWindowFocus: false,
  })

  const stored = useMemo(() => query.data?.waypoints ?? [], [query.data])
  const list = useMemo(
    () => stored.map((waypoint, index) => edits[index] ?? waypoint),
    [stored, edits]
  )
  const highlightCount = list.filter(waypointHighlighted).length
  const photoCount = list.filter(
    (waypoint) => waypointPhoto(waypoint) != null
  ).length
  const dirty =
    Object.keys(edits).length > 0 &&
    serializeWaypoints(list) !== serializeWaypoints(stored)

  const edit = (index: number, waypoint: Waypoint) =>
    setEdits((current) => ({ ...current, [index]: waypoint }))

  const visible = list
    .map((waypoint, index) => ({ waypoint, index }))
    .filter(({ waypoint }) =>
      filter === 'all'
        ? true
        : filter === 'highlight'
          ? waypointHighlighted(waypoint)
          : waypointPhoto(waypoint) != null
    )

  // One shared picker for every row, so the requested row stays in uploadIndex
  // until the change event settles.
  function pickPhoto(index: number) {
    if (uploadIndex != null) return
    setUploadIndex(index)
    photoInput.current?.click()
  }

  async function onPhotoSelected(file: File | null) {
    const index = uploadIndex
    setUploadIndex(null)
    if (index == null || !file) return
    try {
      const prepared = await prepareWaypointPhoto(file)
      const uploaded = await uploadAdminImage(prepared)
      setEdits((current) => ({
        ...current,
        [index]: withPhoto(current[index] ?? stored[index], uploaded.url),
      }))
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : '照片上传失败，请重试'
      )
    }
  }

  function reset() {
    setEdits({})
    setFilter('all')
    setUploadIndex(null)
  }

  async function save() {
    if (!route || !query.data) return
    if (!list.length) {
      window.alert('途经点列表为空，已取消保存。')
      return
    }
    setSaving(true)
    try {
      await adminMutation('routes', {
        action: 'update-route',
        id: route.id,
        name: query.data.name,
        track_waypoints: serializeWaypoints(list),
      })
      reset()
      await client.invalidateQueries({ queryKey: ['admin', 'routes'] })
      await client.invalidateQueries({
        queryKey: ['admin', 'route-waypoints', route.id],
      })
      onOpenChange(false)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '保存途经点失败')
    } finally {
      setSaving(false)
    }
  }

  function requestClose(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    if (saving) return
    if (dirty && !window.confirm('还有未保存的标注，关闭后会丢失。确认关闭？'))
      return
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className='flex max-h-[92vh] w-full flex-col gap-3 sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>途经点标注</DialogTitle>
          <DialogDescription>
            {route?.name || ''}{' '}
            按行进顺序标注亮点并上传照片，保存前只做本地修改。
          </DialogDescription>
        </DialogHeader>
        <input
          ref={photoInput}
          type='file'
          accept='image/jpeg,image/png,image/webp'
          className='hidden'
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            event.currentTarget.value = ''
            void onPhotoSelected(file)
          }}
        />
        <div className='flex flex-wrap items-center gap-3 text-sm'>
          <span className='text-muted-foreground'>共 {list.length} 个</span>
          <span className='text-muted-foreground'>
            亮点 {highlightCount} 个
          </span>
          <span className='text-muted-foreground'>照片 {photoCount} 张</span>
          <div className='ms-auto flex items-center gap-1'>
            {filters.map((item) => (
              <Button
                key={item.key}
                size='sm'
                variant={filter === item.key ? 'secondary' : 'ghost'}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        {query.isError ? (
          <p className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'>
            读取失败：
            {query.error instanceof Error ? query.error.message : '未知错误'}
          </p>
        ) : query.isPending ? (
          <p className='rounded-md border p-3 text-sm text-muted-foreground'>
            读取途经点中…
          </p>
        ) : list.length === 0 ? (
          <p className='rounded-md border p-3 text-sm text-muted-foreground'>
            这条路线还没有途经点，替换轨迹文件后会自动带出。
          </p>
        ) : (
          <div className='min-h-0 flex-1 overflow-hidden rounded-md border'>
            <div className='h-full overflow-y-auto'>
              <Table>
                <TableHeader className='sticky top-0 bg-card'>
                  <TableRow>
                    <TableHead className='w-12'>#</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>里程</TableHead>
                    <TableHead>亮点</TableHead>
                    <TableHead>照片</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(({ waypoint, index }) => {
                    const photo = waypointPhoto(waypoint)
                    const uploading = uploadIndex === index
                    const busy = uploadIndex != null
                    const rowLabel =
                      waypointName(waypoint) || `第 ${index + 1} 个`
                    return (
                      <TableRow key={index}>
                        <TableCell className='text-muted-foreground tabular-nums'>
                          {index + 1}
                        </TableCell>
                        <TableCell className='max-w-56 font-medium break-words'>
                          {waypointName(waypoint) || '（未命名）'}
                          {eleLabel(waypoint) && (
                            <span className='ms-2 block text-xs text-muted-foreground'>
                              {eleLabel(waypoint)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className='whitespace-nowrap text-muted-foreground tabular-nums'>
                          {kmLabel(waypoint)}
                        </TableCell>
                        <TableCell>
                          <span className='flex items-center gap-2'>
                            <Switch
                              checked={waypointHighlighted(waypoint)}
                              disabled={busy}
                              aria-label={`标为亮点 ${rowLabel}`}
                              onCheckedChange={(checked) =>
                                edit(
                                  index,
                                  withHighlight(waypoint, checked === true)
                                )
                              }
                            />
                            <span className='text-xs text-muted-foreground'>
                              亮点
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className='flex items-center gap-2'>
                            {photo ? (
                              <a href={photo} target='_blank' rel='noreferrer'>
                                <img
                                  src={photo}
                                  alt={waypointName(waypoint) || '途经点照片'}
                                  className='size-12 shrink-0 rounded-md border object-cover'
                                />
                              </a>
                            ) : (
                              <span className='size-12 shrink-0 rounded-md border border-dashed' />
                            )}
                            <span className='flex items-center gap-1'>
                              <Button
                                size='sm'
                                variant='ghost'
                                disabled={busy}
                                aria-label={`${photo ? '更换照片' : '上传照片'} ${rowLabel}`}
                                onClick={() => pickPhoto(index)}
                              >
                                {uploading
                                  ? '上传中…'
                                  : photo
                                    ? '更换'
                                    : '上传'}
                              </Button>
                              {photo && (
                                <Button
                                  size='sm'
                                  variant='ghost'
                                  className='text-destructive'
                                  disabled={busy}
                                  aria-label={`移除照片 ${rowLabel}`}
                                  onClick={() =>
                                    edit(index, withPhoto(waypoint, null))
                                  }
                                >
                                  移除
                                </Button>
                              )}
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {visible.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='h-16 text-center text-muted-foreground'
                      >
                        这个筛选下没有途经点
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter>
          {dirty && (
            <span className='me-auto text-xs text-muted-foreground'>
              有未保存的修改
            </span>
          )}
          <Button
            type='button'
            variant='outline'
            disabled={saving}
            onClick={() => requestClose(false)}
          >
            取消
          </Button>
          <Button
            type='button'
            disabled={saving || !dirty || !list.length || uploadIndex != null}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
