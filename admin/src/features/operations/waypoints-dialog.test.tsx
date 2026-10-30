import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { adminMutation, fetchRouteWaypoints } from '@/lib/supabase'
import { RouteWaypointsDialog } from './waypoints-dialog'

vi.mock('@/lib/supabase', () => ({
  adminMutation: vi.fn(),
  fetchRouteWaypoints: vi.fn(),
  uploadAdminImage: vi.fn(),
}))

const stored = [
  { name: '垭口', km: 4.2, elevationMeters: 3200 },
  { name: '营地', km: 9.4, highlight: true, photo: 'https://x/camp.jpg' },
]

const route = { id: 'route-1', name: '测试线路' }

async function page(onOpenChange = vi.fn()) {
  const screen = await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouteWaypointsDialog open route={route} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  await expect.element(screen.getByText('垭口')).toBeInTheDocument()
  return { screen, onOpenChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchRouteWaypoints).mockResolvedValue({
    name: route.name,
    waypoints: structuredClone(stored),
  })
})

describe('RouteWaypointsDialog', () => {
  it('lists the waypoints in walking order with the curation counts', async () => {
    const { screen } = await page()

    await expect.element(screen.getByText('共 2 个')).toBeInTheDocument()
    await expect.element(screen.getByText('亮点 1 个')).toBeInTheDocument()
    await expect.element(screen.getByText('照片 1 张')).toBeInTheDocument()
    await expect.element(screen.getByText('第 4.2 km')).toBeInTheDocument()
    await expect.element(screen.getByText('海拔 3200 m')).toBeInTheDocument()
    await expect
      .element(screen.getByText('营地', { exact: true }))
      .toBeInTheDocument()
  })

  it('filters down to the highlighted waypoints', async () => {
    const { screen } = await page()

    await userEvent.click(screen.getByRole('button', { name: '仅亮点' }))

    await expect
      .element(screen.getByRole('switch', { name: /营地/ }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('switch', { name: /垭口/ }))
      .not.toBeInTheDocument()
  })

  it('saves the whole list in order with the route name unchanged', async () => {
    const { screen } = await page()

    await userEvent.click(screen.getByRole('switch', { name: /垭口/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(adminMutation).toHaveBeenCalledWith('routes', {
      action: 'update-route',
      id: 'route-1',
      name: route.name,
      track_waypoints: JSON.stringify([
        { name: '垭口', km: 4.2, elevationMeters: 3200, highlight: true },
        stored[1],
      ]),
    })
  })

  it('removes the photo key instead of storing an empty one', async () => {
    const { screen } = await page()

    await userEvent.click(screen.getByRole('button', { name: /移除照片 营地/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    const saved = JSON.parse(
      vi.mocked(adminMutation).mock.calls[0][1].track_waypoints
    )
    expect('photo' in saved[1]).toBe(false)
    expect(saved[1].highlight).toBe(true)
  })

  it('asks before closing with unsaved changes', async () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => false)

    const { screen, onOpenChange } = await page()
    await userEvent.click(screen.getByRole('switch', { name: /垭口/ }))
    await userEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('closes without asking when nothing changed', async () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => true)

    const { screen, onOpenChange } = await page()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    confirmSpy.mockRestore()
  })
})
