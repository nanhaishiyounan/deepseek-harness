// @vitest-environment jsdom
// The remaining branch matrix: the sidebar entry's no-session refresh and
// badge states, the view's collection-switch load, the ask-bar Enter submit,
// the per-record ask handoff, and the table footer's load-more/end split.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { BizClientState } from '../src/client/bizStore.ts'
import { BizEntry } from '../src/client/BizEntry.tsx'
import { BizView } from '../src/client/BizView.tsx'
import { zh } from '../src/client/locales.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './business-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

const ROSTER = {
  status: 'ready' as const,
  value: [
    { name: 'orders', title: '订单', fields: [] },
    { name: 'experts', title: '专家', fields: [] },
  ],
}

function mountView(state: BizClientState, rows?: NonNullable<BizClientState['rows']>) {
  const actions = {
    refresh: vi.fn(),
    loadRows: vi.fn(),
    loadMore: vi.fn(),
    requestView: vi.fn(),
  }
  const setDraft = vi.fn()
  const resolved = rows === undefined ? state : { ...state, rows }
  const store = createSnapshotStore<BizClientState>(resolved)
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

describe('BizEntry branch matrix', () => {
  it('refreshes instead of switching when no session exists', () => {
    const store = createSnapshotStore<BizClientState>({
      collections: { status: 'ready', value: ROSTER.value },
      selected: undefined, rows: undefined,
    })
    const noSessions = createSnapshotStore({ ...sessionListState({ id: 's1', blank: false }), current: undefined })
    const refresh = vi.fn()
    const requestBusinessView = vi.fn()
    render(
      <BizEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(noSessions) as never}
        useBusiness={bindStoreHook(store) as never}
        refresh={refresh}
        requestBusinessView={requestBusinessView}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.collectionsBadge'] }))
    expect(refresh).toHaveBeenCalled()
    expect(requestBusinessView).not.toHaveBeenCalled()
  })

  it('shows the ? badge on a failed roster and the label-only row while loading', () => {
    const errorStore = createSnapshotStore<BizClientState>({
      collections: { status: 'error', error: 'nocobase-not-composed' },
      selected: undefined, rows: undefined,
    })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: false }))
    const { rerender } = render(
      <BizEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useBusiness={bindStoreHook(errorStore) as never}
        refresh={vi.fn()}
        requestBusinessView={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByText('?')).toBeTruthy()
    const loadingStore = createSnapshotStore<BizClientState>({
      collections: { status: 'loading' },
      selected: undefined, rows: undefined,
    })
    rerender(
      <BizEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useBusiness={bindStoreHook(loadingStore) as never}
        refresh={vi.fn()}
        requestBusinessView={vi.fn()}
        t={t}
      />,
    )
    expect(screen.queryByText('?')).toBeNull()
  })
})

describe('BizView remaining interactions', () => {
  it('loads rows when the switcher selects a collection, and ignores a blank selection', () => {
    const { loadRows } = mountView({ collections: ROSTER, selected: 'orders', rows: undefined })
    const select = screen.getByLabelText(zh['roster.title']) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'experts' } })
    expect(loadRows).toHaveBeenCalledWith('experts')
    fireEvent.change(select, { target: { value: '' } })
    expect(loadRows).toHaveBeenCalledTimes(1)
  })

  it('submits the ask bar through Enter and the button', () => {
    const { setDraft, requestView } = mountView({ collections: ROSTER, selected: 'orders', rows: undefined })
    const input = screen.getByLabelText(zh['roster.askAction']) as HTMLInputElement
    fireEvent.change(input, { target: { value: '上月 pending 订单有多少' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(setDraft).toHaveBeenCalledTimes(1)
    fireEvent.change(input, { target: { value: '换一个问题' } })
    fireEvent.click(screen.getByRole('button', { name: zh['roster.askAction'] }))
    expect(setDraft).toHaveBeenCalledTimes(2)
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('hands the per-record ask to the conversation', () => {
    const { setDraft } = mountView(
      { collections: ROSTER, selected: 'orders', rows: undefined },
      { status: 'ready', value: { count: 1, page: 1, page_size: 20, rows: [{ id: 9, orderNo: 'SO-9', status: 'pending' }] } },
    )
    fireEvent.click(screen.getAllByRole('button', { name: zh['cards.ask'] })[0]!)
    expect(setDraft).toHaveBeenCalledWith(expect.stringContaining('SO-9'))
  })

  it('offers load-more mid-page and the end marker on the last page', () => {
    const first = mountView(
      { collections: ROSTER, selected: 'orders', rows: undefined },
      { status: 'ready', value: { count: 40, page: 1, page_size: 20, rows: [{ id: 1, name: 'a' }] } },
    )
    fireEvent.click(screen.getByRole('button', { name: zh['table.showAsTable'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['table.more'] }))
    expect(first.loadMore).toHaveBeenCalledWith('orders', 2)
    cleanup()
    mountView(
      { collections: ROSTER, selected: 'orders', rows: undefined },
      { status: 'ready', value: { count: 1, page: 1, page_size: 20, rows: [{ id: 1, name: 'a' }] } },
    )
    fireEvent.click(screen.getByRole('button', { name: zh['table.showAsTable'] }))
    expect(screen.getByText(zh['table.end'])).toBeTruthy()
  })

  it('retries a failed row load through the strip', () => {
    const { loadRows } = mountView(
      { collections: ROSTER, selected: 'orders', rows: undefined },
      { status: 'error', error: 'nocobase-request-failed' },
    )
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(loadRows).toHaveBeenCalledWith('orders')
  })
})
