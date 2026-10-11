import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { adminApi, adminMutation } from '@/lib/supabase'
import { RouteKnowledge } from './index'

vi.mock('@/lib/supabase', () => ({ adminApi: vi.fn(), adminMutation: vi.fn() }))
vi.mock('@/components/config-drawer', () => ({ ConfigDrawer: () => null }))
vi.mock('@/components/profile-dropdown', () => ({ ProfileDropdown: () => null }))
vi.mock('@/components/search', () => ({ Search: () => null }))
vi.mock('@/components/theme-switch', () => ({ ThemeSwitch: () => null }))
vi.mock('@/components/layout/header', () => ({ Header: ({ children }: { children: ReactNode }) => <header>{children}</header> }))

beforeEach(() => {
  vi.mocked(adminApi).mockImplementation(async resource => ({ data: resource === 'routeKnowledge' ? [{ id: 'entry-1', route_id: 'route-1', region: null, section: 'access', title: '交通资料', body: '正文', sources: [], as_of: '2026-10-10', status: 'draft', origin: 'manual', route: { name: '测试路线' } }] : [] }))
  vi.mocked(adminMutation).mockResolvedValue(undefined)
})

it('renders knowledge entries and publishes a draft', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = await render(<QueryClientProvider client={client}><RouteKnowledge /></QueryClientProvider>)
  await expect.element(view.getByText('交通资料', { exact: true })).toBeInTheDocument()
  await userEvent.click(view.getByRole('button', { name: '发布', exact: true }))
  expect(adminMutation).toHaveBeenCalledWith('routeKnowledge', { action: 'publish-route-knowledge', id: 'entry-1' })
})
