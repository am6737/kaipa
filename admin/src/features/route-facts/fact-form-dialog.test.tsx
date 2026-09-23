import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
// Geometry assertions are meaningless without the design system's CSS, which the
// test entry does not load on its own.
import '@/styles/index.css'
import { FactFormDialog } from './fact-form-dialog'
import type { FactCategory, FactDraft, FactEntry, FactFormValues } from './fact-schema'

const categories: FactCategory[] = [
  { slug: 'access_transport', name: '进出交通', description: '怎么到起点', review_interval_days: 90, sort_order: 1, field_schema: [
    { key: 'from', label: '出发地', type: 'text', required: true },
    { key: 'mode', label: '交通方式', type: 'select', options: ['班车', '拼车'] },
    { key: 'notes', label: '备注', type: 'markdown' },
  ] },
  { slug: 'campsite', name: '营地', description: '露营点', review_interval_days: 180, sort_order: 4, field_schema: [
    { key: 'name', label: '营地名称', type: 'text', required: true },
  ] },
]
const routes = [
  { id: 'trk008', name: '党岭三湖连穿', region: '四川 · 丹巴' },
  { id: 'trk065', name: '雅拉温泉线', region: '四川 · 康定' },
]
const entries = [{
  id: 'e1', route_id: 'trk008', category_slug: 'access_transport', title: '成都 → 丹巴 旧票价',
  status: 'confirmed', target_entry_id: null, confirmed_at: '2026-04-05T00:00:00Z',
}] as unknown as FactEntry[]

// One draft the human can save as-is, one the analyzer could not place.
const drafts: FactDraft[] = [
  { route_id: 'trk008', category_slug: 'access_transport', title: '成都 → 丹巴 班车', fields: { from: '成都', mode: '班车' }, warnings: [] },
  { route_id: null, category_slug: 'campsite', title: '色根坝上游营地', fields: { name: '色根坝上游营地' }, warnings: ['原文只提到地名，未匹配线路'] },
]

async function setup(overrides: Partial<Parameters<typeof FactFormDialog>[0]> = {}) {
  const onOpenChange = vi.fn()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onAnalyze = vi.fn().mockResolvedValue(drafts)
  const utils = await render(
    <FactFormDialog open categories={categories} routes={routes} entries={entries}
      onOpenChange={onOpenChange} onSubmit={onSubmit} onAnalyze={onAnalyze} {...overrides} />
  )
  async function parseSource() {
    await userEvent.fill(utils.getByRole('textbox', { name: '要解析的链接' }), 'https://mp.weixin.qq.com/s/danba')
    await userEvent.click(utils.getByRole('button', { name: 'AI 解析' }))
    await expect.element(utils.getByText('成都 → 丹巴 班车')).toBeInTheDocument()
  }
  return { ...utils, onOpenChange, onSubmit, onAnalyze, parseSource }
}

describe('FactFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens as one blank card with nothing saveable, and no mode tabs', async () => {
    const { getByRole, getByText } = await setup()
    await expect.element(getByRole('heading', { name: '新增线路资料' })).toBeInTheDocument()
    await expect.element(getByText('未命名条目')).toBeInTheDocument()
    // Manual entry is just the blank card; the old AI/手动 split is gone.
    await expect.element(getByText('AI 智能录入')).not.toBeInTheDocument()
    await expect.element(getByText('手动填写')).not.toBeInTheDocument()
    await expect.element(getByRole('button', { name: /保存/ })).toBeDisabled()
  })

  it('sends only the source to the analyzer, never a pre-picked category', async () => {
    const { parseSource, onAnalyze } = await setup()
    await parseSource()
    await vi.waitFor(() => expect(onAnalyze).toHaveBeenCalledOnce())
    expect(onAnalyze).toHaveBeenCalledWith({ source_url: 'https://mp.weixin.qq.com/s/danba', source_text: '', source_file: undefined })
  })

  it('shows one card per draft and opens only the one that needs a human', async () => {
    const { getByText, getByLabelText, parseSource } = await setup()
    await parseSource()
    await expect.element(getByText('色根坝上游营地')).toBeInTheDocument()
    await expect.element(getByText('1 条可入库 · 1 条需要补充')).toBeInTheDocument()

    // The clean draft stays a row: its fields are not in the document yet.
    await expect.element(getByLabelText(/出发地/)).not.toBeInTheDocument()
    // The unplaced one opens itself, warning and all.
    await expect.element(getByLabelText(/营地名称/)).toBeInTheDocument()
    await expect.element(getByText('原文只提到地名，未匹配线路')).toBeInTheDocument()

    await userEvent.click(getByText('成都 → 丹巴 班车'))
    await expect.element(getByLabelText(/出发地/)).toHaveValue('成都')
  })

  it('keeps an unplaceable draft out of the saved batch', async () => {
    const { getByRole, onSubmit, onOpenChange, parseSource } = await setup()
    await parseSource()
    const save = getByRole('button', { name: '保存 1 条' })
    await expect.element(save).toBeEnabled()
    await userEvent.click(save)
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    const items = onSubmit.mock.calls[0][0] as FactFormValues[]
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      route_id: 'trk008', category_slug: 'access_transport', title: '成都 → 丹巴 班车',
      source_url: 'https://mp.weixin.qq.com/s/danba', fields: { from: '成都', mode: '班车' },
    })
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('marks model-written fields only until the human edits them', async () => {
    const { getByText, getByLabelText, parseSource } = await setup()
    await parseSource()
    await userEvent.click(getByText('成都 → 丹巴 班车'))
    await expect.element(getByLabelText(/出发地/)).toBeInTheDocument()
    // Both cards are open now: 出发地/交通方式 from draft one, 营地名称 from draft two.
    expect((await getByText('AI 填写').all()).length).toBe(3)
    await userEvent.fill(getByLabelText(/出发地/), '成都新南门')
    expect((await getByText('AI 填写').all()).length).toBe(2)
  })

  it('warns when the same route and category is already maintained', async () => {
    const { getByText, parseSource } = await setup()
    await parseSource()
    await userEvent.click(getByText('成都 → 丹巴 班车'))
    await expect.element(getByText(/库里同线路同类目已有 1 条/)).toBeInTheDocument()
    await expect.element(getByText('成都 → 丹巴 旧票价 · 2026-04-05 确认')).toBeInTheDocument()
  })

  it('discards one card without touching the rest of the batch', async () => {
    const { getByRole, getByText, parseSource } = await setup()
    await parseSource()
    // Every card in a batch carries its own 丢弃; drop the unplaceable one.
    const discard = await getByRole('button', { name: '丢弃' }).all()
    expect(discard.length).toBe(2)
    await userEvent.click(discard[1])
    await expect.element(getByText('色根坝上游营地')).not.toBeInTheDocument()
    await expect.element(getByText('成都 → 丹巴 班车')).toBeInTheDocument()
    await expect.element(getByRole('button', { name: '保存 1 条' })).toBeEnabled()
  })

  it('replaces the untouched blank card instead of stacking it under the batch', async () => {
    const { getByText, parseSource } = await setup()
    await parseSource()
    await expect.element(getByText('未命名条目')).not.toBeInTheDocument()
    await expect.element(getByText('成都 → 丹巴 班车')).toBeInTheDocument()
  })

  it('keeps a hand-filled card when the batch lands', async () => {
    const { getByText, getByRole, getByLabelText, parseSource } = await setup()
    await userEvent.fill(getByLabelText(/标题/), '自己写的资料')
    await parseSource()
    await expect.element(getByText('自己写的资料')).toBeInTheDocument()
    await expect.element(getByText('成都 → 丹巴 班车')).toBeInTheDocument()
    await expect.element(getByRole('button', { name: '保存 1 条' })).toBeEnabled()
  })

  it('uses the available width: a big panel and a multi-column field grid', async () => {
    const { getByRole, getByText, getByLabelText, parseSource } = await setup()
    await page.viewport(1440, 900)
    await parseSource()
    await userEvent.click(getByText('成都 → 丹巴 班车'))
    const dialog = await getByRole('dialog').element()
    expect(dialog.getBoundingClientRect().width).toBeGreaterThan(1000)
    expect(dialog.getBoundingClientRect().height).toBeGreaterThan(500)
    const sourceEl = await getByLabelText(/来源链接/).first().element()
    const reviewEl = await getByLabelText(/复核日期/).first().element()
    const source = sourceEl.getBoundingClientRect()
    const review = reviewEl.getBoundingClientRect()
    // Side by side in one row band, not stacked: the grid spreads out with width.
    expect(Math.abs(review.top - source.top)).toBeLessThan(24)
    expect(review.left - source.left).toBeGreaterThan(300)
    const field = (await getByLabelText(/出发地/).element()).getBoundingClientRect()
    expect(field.height).toBeGreaterThanOrEqual(38)
    // A select that shrinks to its content leaves a hole in the row.
    const categoryTrigger = document.querySelector('[data-slot=select-trigger]') as HTMLElement
    expect(categoryTrigger.getBoundingClientRect().width).toBeGreaterThan(300)
  })

  it('edits an existing entry without the source bar or the AI path', async () => {
    const { getByRole, getByLabelText, onSubmit } = await setup({
      initial: { id: 'e1', route_id: 'trk008', category_slug: 'access_transport', title: '成都 → 丹巴 旧票价', source_url: '', review_due_at: '', fields: { from: '成都' } },
    })
    await expect.element(getByRole('heading', { name: '编辑线路资料' })).toBeInTheDocument()
    await expect.element(getByRole('button', { name: 'AI 解析' })).not.toBeInTheDocument()
    await expect.element(getByLabelText(/出发地/)).toHaveValue('成都')
    await userEvent.click(getByRole('button', { name: '保存' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0][0] as FactFormValues[]).toMatchObject([{ id: 'e1', route_id: 'trk008' }])
  })
})
