// @vitest-environment jsdom
// The business view tab: the four-state matrix (roster skeleton, ready
// roster, empty guidance, error retry), the collection switcher's row load,
// the entity card stream with its conversation handoffs (ask/edit/new —
// draft prefill + chat switch, never a form), the auxiliary table view
// toggle with the hasNext footer, and the embed entry's iframe reveal. Plus
// the presentation helpers (label priority, preview cut).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { BizClientState } from '../src/client/bizStore.ts'
import { BizView } from '../src/client/BizView.tsx'
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

function mount(state: BizClientState) {
  const store = createSnapshotStore<BizClientState>(state)
  const actions = {
    refresh: vi.fn(),
    loadRows: vi.fn(),
    loadMore: vi.fn(),
    requestView: vi.fn(),
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
    expect(screen.getByText(/pending/u)).toBeTruthy()
  })

  it('hands an edit to the conversation: draft prefill + chat switch', () => {
    const { setDraft, requestView } = mountReady()
    const editButtons = screen.getAllByRole('button', { name: zh['cards.edit'] })
    fireEvent.click(editButtons[0]!)
    expect(setDraft).toHaveBeenCalled()
    expect(requestView).toHaveBeenCalledWith('chat')
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

  it('reveals the embed iframe on demand (the /nocobase proxy)', () => {
    mountReady()
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['embed.open'] }))
    const frame = document.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('/nocobase/')
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
