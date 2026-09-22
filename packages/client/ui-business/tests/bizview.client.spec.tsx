// @vitest-environment jsdom
// The business view tab: the four-state matrix (roster skeleton, ready
// roster, empty guidance, error retry), the collection switcher's row load,
// the entity card stream with its conversation handoffs (ask/edit/new —
// draft prefill + chat switch, never a form), the auxiliary table view
// toggle with the hasNext footer, and the external entry card's new-window
// link contract. Plus the presentation helpers (label priority, preview
// cut).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { BizClientState } from '../src/client/bizStore.ts'
import { BizView } from '../src/client/BizView.tsx'
import type { BizViewInjected } from '../src/client/BizView.tsx'
import { BizEntry } from '../src/client/BizEntry.tsx'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'business'> resolves.
import type {} from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import { entityLabelOf, entityPreviewOf } from '../src/client/presentation.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './business-fixture.client.ts'

/** The zh dictionary as the page's t. */
const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

const ROSTER_READY: NonNullable<BizClientState['collections']> = {
  status: 'ready',
  value: [
    { name: 'orders', title: '订单', fields: [] },
    { name: 'customers', title: '客户', fields: [] },
    { name: 'auditLogs', title: '审计', hidden: true, fields: [] },
  ],
}

/** ISO timestamp `days` days from now (the cert expiry fixtures). */
const isoIn = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString()

/** A roster with a supplier table, a plain table, and a titleless row. */
const WIDE_ROSTER: NonNullable<BizClientState['collections']> = {
  status: 'ready',
  value: [
    { name: 'orders', title: '订单', fields: [] },
    { name: 'customers', title: '客户', fields: [] },
    { name: 'suppliers', title: '供应商', fields: [] },
    { name: 'rawData', fields: [] },
    { name: 'auditLogs', title: '审计', hidden: true, fields: [] },
  ],
}

const ROWS_READY: NonNullable<BizClientState['rows']> = {
  status: 'ready',
  value: {
    count: 2,
    page: 1,
    page_size: 20,
    rows: [
      { id: 9, orderNo: 'SO-009', status: 'pending', amount: 1200 },
      { id: 12, orderNo: 'SO-012', status: 'shipped', amount: 800 },
    ],
  },
}

function mount(state: BizClientState, updateRow: BizViewInjected['updateRow'] = vi.fn(async () => ({}))) {
  const store = createSnapshotStore<BizClientState>(state)
  // loadRows mirrors the real face's select step: the auto-select effect
  // re-fires on every roster identity until the store records the selection,
  // so a bare mock would loop the effect forever. The row cache stays as
  // mounted: the mock gateway never answers a re-read, and the inline-edit
  // cases assert the committed values through updateRow instead.
  const loadRows = vi.fn((name: string) => {
    store.set({ ...store.getSnapshot(), selected: name })
  })
  const actions = {
    refresh: vi.fn(),
    loadRows,
    loadMore: vi.fn(),
    requestView: vi.fn(),
    updateRow,
  }
  const setDraft = vi.fn()
  render(
    <BizView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useBusiness={bindStoreHook(store) as never}
      {...actions}
      t={t}
    />,
  )
  return { ...actions, setDraft }
}

afterEach(cleanup)
// The frecency log persists across specs; reset it so bucket contents stay
// per-test.
afterEach(() => { localStorage.removeItem('dsh-biz-recent-collections') })

describe('presentation helpers', () => {
  it('prefers title-ish fields for the card label, then the id', () => {
    expect(entityLabelOf({ id: 3, orderNo: 'SO-3', status: 'x' }, '订单')).toBe('SO-3')
    expect(entityLabelOf({ id: 5 }, '客户')).toBe('5')
    expect(entityLabelOf({}, '客户')).toBe('客户…')
  })

  it('cuts the preview to scalars, skipping hidden and object cells', () => {
    const pairs = entityPreviewOf({ id: 1, name: '宏发', amount: 30, tags: ['a'], createdAt: 'x', note: '' }, 3)
    expect(pairs).toEqual([['name', '宏发'], ['amount', '30']])
  })
})

describe('BizView state matrix', () => {
  it('loads the roster on mount and renders the skeleton while in flight', () => {
    const { refresh } = mount({ collections: undefined, selected: undefined, rows: undefined })
    expect(refresh).toHaveBeenCalled()
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('renders the roster guidance when the list is ready and empty', () => {
    mount({ collections: { status: 'ready', value: [] }, selected: undefined, rows: undefined })
    expect(screen.getByText(zh['roster.empty'])).toBeTruthy()
  })

  it('shows the error strip with a retry on a failed roster load', () => {
    const { refresh } = mount({ collections: { status: 'error', error: 'nocobase-not-composed' }, selected: undefined, rows: undefined })
    expect(screen.getByText(/nocobase-not-composed/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })
})

describe('BizView cards and handoffs', () => {
  function mountReady(): ReturnType<typeof mount> {
    return mount({ collections: ROSTER_READY, selected: 'orders', rows: ROWS_READY })
  }

  it('renders the entity cards with labels and preview pairs', () => {
    mountReady()
    // The order number appears as the card label and again in the preview cut.
    expect(screen.getAllByText('SO-009').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SO-012').length).toBeGreaterThan(0)
    // The order-like collection renders its status badge beside the preview.
    expect(screen.getAllByTestId('biz-order-status')[0]?.textContent).toContain('pending')
  })

  it('hands an edit to the conversation: draft prefill, staying on the page', () => {
    const { setDraft, requestView } = mountReady()
    const editButtons = screen.getAllByRole('button', { name: zh['cards.edit'] })
    fireEvent.click(editButtons[0]!)
    expect(setDraft).toHaveBeenCalled()
    // M1: the hand-off fills the draft in place; the hop-link owns the jump.
    expect(requestView).not.toHaveBeenCalled()
  })

  it('hands the new-record request to the conversation with the collection named', () => {
    const { setDraft } = mountReady()
    fireEvent.click(screen.getByRole('button', { name: zh['cards.newRecord'] }))
    const draft = (setDraft as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(draft.startsWith(zh['cards.newPromptPrefix'])).toBe(true)
    expect(draft).toContain('订单')
  })

  it('switches to the auxiliary table view and back', () => {
    mountReady()
    fireEvent.click(screen.getByRole('button', { name: zh['table.showAsTable'] }))
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['table.showAsCards'] })).toBeTruthy()
  })

  it('opens the business backend through a new-window link card (no iframe)', () => {
    mountReady()
    expect(document.querySelector('iframe')).toBeNull()
    const link = screen.getByRole('link', { name: new RegExp(zh['embed.open'], 'u') })
    expect(link.getAttribute('href')).toBe('/nocobase/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })
})

describe('BizView empty rows', () => {
  it('shows the per-collection empty guidance', () => {
    mount({
      collections: ROSTER_READY,
      selected: 'orders',
      rows: { status: 'ready', value: { count: 0, page: 1, page_size: 20, rows: [] } },
    })
    expect(screen.getByText(zh['cards.empty'])).toBeTruthy()
  })
})

describe('BizEntry', () => {
  it('counts visible collections only and switches views on click', () => {
    const store = createSnapshotStore<BizClientState>({
      collections: ROSTER_READY, selected: undefined, rows: undefined,
    })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: false }))
    const refresh = vi.fn()
    const requestBusinessView = vi.fn()
    render(
      <BizEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useBusiness={bindStoreHook(store) as never}
        refresh={refresh}
        requestBusinessView={requestBusinessView}
        t={t}
      />,
    )
    // The ready roster means no reload on mount; the hidden collection stays
    // out of the badge.
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByText('2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['entry.collectionsBadge'] }))
    expect(requestBusinessView).toHaveBeenCalled()
  })
})

describe('BizView first open', () => {
  it('auto-selects the first visible collection the moment the roster lands', () => {
    const { loadRows } = mount({ collections: WIDE_ROSTER, selected: undefined, rows: undefined })
    // Not a placeholder option: the first business object loads on arrival,
    // and the frecency log records the use.
    expect(loadRows).toHaveBeenCalledWith('orders')
    expect(localStorage.getItem('dsh-biz-recent-collections')).toContain('orders')
  })

  it('opens the navigator panel, searching it and showing titleless names', () => {
    mount({ collections: WIDE_ROSTER, selected: 'orders', rows: ROWS_READY })
    fireEvent.click(screen.getByTestId('biz-nav-toggle'))
    // Titleless rows render their raw collection name under the other bucket.
    expect(screen.getByText('rawData')).toBeTruthy()
    expect(screen.getByText(zh['nav.other'])).toBeTruthy()
    // A query with no hits swaps the groups for the no-hits line.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '完全不匹配' } })
    expect(screen.getByText(zh['nav.noHits'])).toBeTruthy()
    expect(screen.queryByText('rawData')).toBeNull()
  })
})

describe('BizView ask bar', () => {
  it('hands an Enter-submitted question to the draft and jumps through the hop-link', () => {
    const { setDraft, requestView } = mount({ collections: WIDE_ROSTER, selected: 'orders', rows: ROWS_READY })
    const ask = screen.getByRole('textbox', { name: zh['roster.askAction'] })
    fireEvent.change(ask, { target: { value: '上月 pending 的订单有多少' } })
    fireEvent.keyDown(ask, { key: 'Enter' })
    expect(setDraft).toHaveBeenCalledWith('上月 pending 的订单有多少\n')
    // The confirmation line owns the view jump, not the submit itself.
    expect(requestView).not.toHaveBeenCalled()
    expect(screen.getByTestId('biz-asked-inline').textContent).toContain(zh['ask.sent'])
    fireEvent.click(screen.getByRole('button', { name: /去对话查看回答/u }))
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('submits through the ask button and ignores an empty ask', () => {
    const { setDraft } = mount({ collections: WIDE_ROSTER, selected: 'orders', rows: ROWS_READY })
    fireEvent.click(screen.getByRole('button', { name: zh['roster.askAction'] }))
    expect(setDraft).not.toHaveBeenCalled()
    const ask = screen.getByRole('textbox', { name: zh['roster.askAction'] })
    fireEvent.change(ask, { target: { value: '  供应商风险  ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['roster.askAction'] }))
    expect(setDraft).toHaveBeenCalledWith('供应商风险\n')
  })
})

describe('BizView supplier 360', () => {
  function mountSuppliers(rows: BizClientState['rows']): void {
    mount({ collections: WIDE_ROSTER, selected: 'suppliers', rows })
  }

  it('renders cert chips with expiry warnings and skips cert-less suppliers', () => {
    // Freeze the distant cert's exact text: the chip's title keeps it and the
    // assertion must not re-roll the timestamp.
    const distantAt = isoIn(400)
    mountSuppliers({
      status: 'ready',
      value: {
        count: 3, page: 1, page_size: 20,
        rows: [
          {
            id: 1, name: '宏发', 许可证: isoIn(30), 资质证书: isoIn(-10),
            审核记录: '该供应商已通过二〇二六年度食品安全管理体系全程复审与现场核查',
          },
          { id: 2, name: '远大', 证书编号: distantAt, 许可证号: 'XK-2026' },
          { id: 3, name: '无证行', contact: '—' },
        ],
      },
    })
    const zone = screen.getByTestId('biz-supplier-360')
    expect(zone.textContent).toContain(zh['supplier.title'])
    expect(zone.textContent).toContain('宏发')
    expect(zone.textContent).toContain('远大')
    // A supplier without cert fields stays out of the zone entirely.
    expect(zone.textContent).not.toContain('无证行')
    const chips = zone.querySelectorAll('[class*="certChip"]')
    // 宏发 contributes three cert cells and 远大 two; the short licence text
    // renders whole while the long ISO texts truncate.
    expect(chips).toHaveLength(5)
    expect(Array.from(chips).some(chip => (chip.textContent?.includes('XK-2026') ?? false)
      && !(chip.textContent ?? '').includes('…'))).toBe(true)
    const warned = Array.from(chips).filter(chip => chip.getAttribute('data-expiring') !== null)
    expect(warned.map(chip => chip.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining(zh['supplier.expired']),
      expect.stringContaining('天后到期'),
    ]))
    // The far-future cert carries no warning and keeps its full title text.
    const distant = Array.from(chips).find(chip => chip.textContent?.includes('证书编号'))
    expect(distant?.getAttribute('data-expiring')).toBeNull()
    expect(distant?.getAttribute('title')).toBe(distantAt)
    // Over-length cert text truncates with an ellipsis.
    expect(Array.from(chips).some(chip => (chip.textContent ?? '').includes('…'))).toBe(true)
  })

  it('renders no zone while rows load, and none when every supplier is cert-less', () => {
    mountSuppliers(undefined)
    expect(screen.queryByTestId('biz-supplier-360')).toBeNull()
    mountSuppliers({
      status: 'ready',
      value: { count: 1, page: 1, page_size: 20, rows: [{ id: 1, name: '宏发', contact: '—' }] },
    })
    expect(screen.queryByTestId('biz-supplier-360')).toBeNull()
  })
})

describe('BizView rows and table', () => {
  it('shows the rows error strip and retries the selected collection', () => {
    const { loadRows } = mount({
      collections: WIDE_ROSTER,
      selected: 'orders',
      rows: { status: 'error', error: 'gateway down' },
    })
    expect(screen.getByText(/gateway down/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(loadRows).toHaveBeenCalledWith('orders')
  })

  it('offers load-more in the table view while pages remain', () => {
    const { loadMore } = mount({
      collections: WIDE_ROSTER,
      selected: 'orders',
      rows: { status: 'ready', value: { count: 30, page: 1, page_size: 20, rows: [{ id: 9, orderNo: 'SO-009' }] } },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['table.showAsTable'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['table.more'] }))
    expect(loadMore).toHaveBeenCalledWith('orders', 2)
  })

  it('omits the order badge on a non-order collection', () => {
    mount({
      collections: WIDE_ROSTER,
      selected: 'customers',
      rows: { status: 'ready', value: { count: 1, page: 1, page_size: 20, rows: [{ id: 3, name: '华南食品', remark: '重点' }] } },
    })
    expect(screen.queryAllByTestId('biz-order-status')).toHaveLength(0)
    // The inline-edit cell renders its text without the badge row; the value
    // also appears once in the preview cut.
    expect(screen.getAllByText('重点')).toHaveLength(2)
  })
})

describe('BizView inline edit', () => {
  /** Rows carrying the low-risk field shapes: null, number, string, boolean, symbol. */
  const INLINE_ROWS: NonNullable<BizClientState['rows']> = {
    status: 'ready',
    value: {
      count: 2, page: 1, page_size: 20,
      rows: [
        { id: 9, orderNo: 'SO-009', remark: null, 数量: 12, 备注文本: '加急' },
        { id: 6, orderNo: 'SO-006', qty: true, note: Symbol('meta'), date: '2026-01-01' },
      ],
    },
  }

  it('renders blank dashes for null and symbol cells and text for scalars', () => {
    mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS })
    // The whitelisted fields cap at three per card, in row order. The number
    // and string values also appear once in the preview cut above the cells.
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getAllByText('12')).toHaveLength(2)
    expect(screen.getAllByText('加急')).toHaveLength(2)
    // Boolean and date cells stringify; both also appear in the preview cut.
    expect(screen.getAllByText('true').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2026-01-01').length).toBeGreaterThan(0)
    // Every numeric-id row exposes one edit affordance per whitelisted field.
    expect(screen.getAllByTestId('biz-inline-edit')).toHaveLength(6)
  })

  it('edits a string field through the save button and reloads the page', async () => {
    const { updateRow, loadRows } = mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS })
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    const input = screen.getByLabelText('remark')
    expect((input as HTMLInputElement).value).toBe('')
    fireEvent.change(input, { target: { value: '电话确认过' } })
    fireEvent.click(screen.getByRole('button', { name: zh['inline.save'] }))
    await waitFor(() => { expect(updateRow).toHaveBeenCalledWith('orders', 9, { remark: '电话确认过' }) })
    // A committed edit closes the editor and re-reads the collection.
    await waitFor(() => { expect(loadRows).toHaveBeenCalledWith('orders') })
    expect(screen.queryByLabelText('remark')).toBeNull()
  })

  it('converts numeric drafts on Enter and falls back to the raw text', async () => {
    const { updateRow } = mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS })
    // Both rows carry three whitelisted fields apiece.
    expect(screen.getAllByTestId('biz-inline-edit')).toHaveLength(6)
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[1]!)
    let input = screen.getByLabelText('数量')
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(updateRow).toHaveBeenCalledWith('orders', 9, { 数量: 40 }) })
    await waitFor(() => { expect(screen.queryByLabelText('数量')).toBeNull() })
    // A non-numeric draft keeps its raw string instead of a NaN.
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[1]!)
    input = screen.getByLabelText('数量')
    fireEvent.change(input, { target: { value: '许多' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(updateRow).toHaveBeenCalledWith('orders', 9, { 数量: '许多' }) })
  })

  it('cancels an edit through Escape and the cancel button', () => {
    mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS })
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    fireEvent.keyDown(screen.getByLabelText('remark'), { key: 'Escape' })
    expect(screen.queryByLabelText('remark')).toBeNull()
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    fireEvent.click(screen.getByRole('button', { name: zh['inline.cancel'] }))
    expect(screen.queryByLabelText('remark')).toBeNull()
  })

  it('ignores Enter while a save is in flight and reports failures inline', async () => {
    let release: (() => void) | undefined
    const gated = vi.fn(() => new Promise<Record<string, unknown>>((resolve) => {
      release = () => { resolve({}) }
    }))
    mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS }, gated)
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    const input = screen.getByLabelText('remark')
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // The in-flight guard swallows the second Enter.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(gated).toHaveBeenCalledTimes(1)
    release!()
    await waitFor(() => { expect(screen.queryByLabelText('remark')).toBeNull() })

    // A refusal surfaces its message; reopening the editor clears it.
    cleanup()
    mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS }, vi.fn(() => Promise.reject(new Error('nb_update refused'))))
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    fireEvent.change(screen.getByLabelText('remark'), { target: { value: 'b' } })
    fireEvent.click(screen.getByRole('button', { name: zh['inline.save'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('nb_update refused') })
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    expect(screen.queryByRole('alert')).toBeNull()

    // A non-Error refusal stringifies.
    cleanup()
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error refusal is the stringify case under test.
    mount({ collections: WIDE_ROSTER, selected: 'orders', rows: INLINE_ROWS }, vi.fn(() => Promise.reject('plain refusal')))
    fireEvent.click(screen.getAllByTestId('biz-inline-edit')[0]!)
    fireEvent.change(screen.getByLabelText('remark'), { target: { value: 'c' } })
    fireEvent.click(screen.getByRole('button', { name: zh['inline.save'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('plain refusal') })
  })
})
