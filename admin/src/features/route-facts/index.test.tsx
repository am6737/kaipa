import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { adminApi, adminMutation } from '@/lib/supabase'
import { RouteFacts } from './index'
import type { FactEntry } from './fact-schema'

vi.mock('@/lib/supabase', () => ({ adminApi: vi.fn(), adminMutation: vi.fn(), analyzeRouteFact: vi.fn() }))
vi.mock('@/components/config-drawer', () => ({ ConfigDrawer: () => null }))
vi.mock('@/components/profile-dropdown', () => ({ ProfileDropdown: () => null }))
vi.mock('@/components/search', () => ({ Search: () => null }))
vi.mock('@/components/theme-switch', () => ({ ThemeSwitch: () => null }))
vi.mock('@/components/layout/header', () => ({ Header: () => null }))
vi.mock('./fact-form-dialog', () => ({ FactFormDialog: () => null }))
vi.mock('./fact-history-sheet', () => ({ FactHistorySheet: () => null }))

const entry = (status: FactEntry['status']): FactEntry => ({
  id: status, status, title: `${status} 资料`, route_id: 'route-1', category_slug: 'campsite',
  fields: {}, source_url: null, origin: 'manual', target_entry_id: null, resolution: null,
  resolved_at: null, confirmed_at: null, reviewed_at: null, review_due_at: null,
  updated_at: '', route: { name: '测试线路' }, category: { name: '营地' },
})
let entries: FactEntry[]

beforeEach(() => {
  entries = [entry('confirmed'), entry('suggested'), entry('archived')]
  vi.mocked(adminApi).mockImplementation(async (resource) => ({ data: resource === 'routeFacts' ? entries : [] }))
  vi.mocked(adminMutation).mockReset()
  vi.mocked(adminMutation).mockImplementation(async (_, body) => { entries = entries.filter((item) => item.id !== body.id) })
})

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const view = await render(<QueryClientProvider client={client}><RouteFacts /></QueryClientProvider>)
  await expect.element(view.getByText('archived 资料', { exact: true })).toBeInTheDocument()
  return { ...view, invalidate }
}

describe('归档线路资料删除', () => {
  it('only offers deletion for archived entries and cancellation does not send a mutation', async () => {
    const view = await setup()
    await expect.element(view.getByRole('button', { name: '删除', exact: true })).toBeInTheDocument()
    expect(view.getByRole('button', { name: '删除', exact: true }).all()).toHaveLength(1)
    await userEvent.click(view.getByRole('button', { name: '删除', exact: true }))
    await expect.element(view.getByRole('heading', { name: '删除线路资料' })).toBeInTheDocument()
    expect(adminMutation).not.toHaveBeenCalled()
    await userEvent.click(view.getByRole('button', { name: '取消' }))
    expect(adminMutation).not.toHaveBeenCalled()
  })

  it('deletes after confirmation and refreshes facts and history', async () => {
    const view = await setup()
    await userEvent.click(view.getByRole('button', { name: '删除', exact: true }))
    await userEvent.click(view.getByRole('button', { name: '确认删除' }))
    await expect.element(view.getByText('archived 资料', { exact: true })).not.toBeInTheDocument()
    expect(adminMutation).toHaveBeenCalledWith('routeFacts', { action: 'delete-route-fact', id: 'archived' })
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: ['admin-route-facts'] })
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: ['admin-route-fact-revisions'] })
  })

  it('keeps the dialog and entry on failure and allows retry', async () => {
    vi.mocked(adminMutation).mockRejectedValueOnce(new Error('请先归档线路资料，再删除'))
    const view = await setup()
    await userEvent.click(view.getByRole('button', { name: '删除', exact: true }))
    await userEvent.click(view.getByRole('button', { name: '确认删除' }))
    await expect.element(view.getByRole('alert')).toHaveTextContent('请先归档线路资料，再删除')
    await expect.element(view.getByRole('button', { name: '确认删除' })).toBeEnabled()
    await userEvent.click(view.getByRole('button', { name: '确认删除' }))
    await expect.element(view.getByText('archived 资料', { exact: true })).not.toBeInTheDocument()
  })
})
