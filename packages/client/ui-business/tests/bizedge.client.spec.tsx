// @vitest-environment jsdom
// The remaining edge branches: the entry's mount-time refresh, the view's
// empty-ask guard, the same-selection guard, the no-ready-rows loadMore
// reset, the fallback label paths, and the apply-side loadMore catch.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { BizClientState } from '../src/client/bizStore.ts'
import { BizEntry } from '../src/client/BizEntry.tsx'
import { BizView } from '../src/client/BizView.tsx'
import { apply } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import { entityPreviewOf } from '../src/client/presentation.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './business-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

const ROSTER = { status: 'ready' as const, value: [{ name: 'orders', title: '订单', fields: [] }] }
const ROWS = { status: 'ready' as const, value: { count: 1, page: 1, page_size: 20, rows: [{ id: 1, orderNo: 'SO-1' }] } }

afterEach(cleanup)

describe('presentation null arms', () => {
  it('skips null and undefined cells and keeps numeric ids', () => {
    expect(entityPreviewOf({ id: 3, note: null, memo: undefined, keep: 'x' }, 3)).toEqual([['keep', 'x']])
  })
})

describe('BizEntry mount refresh', () => {
  it('refreshes on mount while the roster has not loaded yet', () => {
    const store = createSnapshotStore<BizClientState>({ collections: undefined, selected: undefined, rows: undefined })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: false }))
    const refresh = vi.fn()
    render(
      <BizEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useBusiness={bindStoreHook(store) as never}
        refresh={refresh}
        requestBusinessView={vi.fn()}
        t={t}
      />,
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('BizView edge branches', () => {
  it('ignores an empty ask submit and a same-value reselect', () => {
    const setDraft = vi.fn()
    const store = createSnapshotStore<BizClientState>({ collections: ROSTER, selected: 'orders', rows: ROWS })
    render(
      <BizView
        {...SESSION_KIT}
        inputActions={{ setDraft } as never}
        useBusiness={bindStoreHook(store) as never}
        refresh={vi.fn()}
        loadRows={vi.fn()}
        loadMore={vi.fn()}
        requestView={vi.fn()}
        t={t}
      />,
    )
    const input = screen.getByLabelText(zh['roster.askAction']) as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: zh['roster.askAction'] }))
    expect(setDraft).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(zh['roster.title']), { target: { value: 'orders' } })
    // Same selection and blank stay inert.
    expect(screen.getByText(`订单 · ${zh['cards.title']}`)).toBeTruthy()
  })

  it('renders the id-less card rows and the fallback label when no title resolves', () => {
    const rows = { status: 'ready' as const, value: { count: 1, page: 1, page_size: 20, rows: [{ note: 'x' }] } }
    const store = createSnapshotStore<BizClientState>({
      collections: { status: 'ready', value: [{ name: 'orders', fields: [] }] },
      selected: 'orders',
      rows,
    })
    render(
      <BizView
        {...SESSION_KIT}
        inputActions={{ setDraft: vi.fn() } as never}
        useBusiness={bindStoreHook(store) as never}
        refresh={vi.fn()}
        loadRows={vi.fn()}
        loadMore={vi.fn()}
        requestView={vi.fn()}
        t={t}
      />,
    )
    // entityLabelOf falls back to the collection label with an ellipsis.
    expect(screen.getByText('orders…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['table.showAsTable'] }))
    expect(screen.getByRole('table')).toBeTruthy()
  })
})

describe('apply-side loadMore guards', () => {
  async function bench(list: (payload: { page?: number }) => Promise<unknown>) {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const listFn = vi.fn(list)
    ctx.provide('connection', {
      api: { nocobase: {
        listMeta: vi.fn(async () => ({ result: { ok: true, value: { collections: [] } } })),
        list: listFn,
        get: vi.fn(),
      } },
    } as never)
    const locale = new LocaleRuntime(ctx)
    locale.setLocale('zh')
    ctx.provide('locale', locale)
    apply(ctx)
    const revoke = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
        'conversation.view': { kind: 'list', scope: 'session' },
        'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
    return { ctx, revoke, viewFace, listFn }
  }

  it('resets to the patch alone when no ready rows exist (the racing-failure arm)', async () => {
    const { ctx, revoke, viewFace } = await bench(async () => ({
      result: { ok: true, value: { count: 1, page: 2, page_size: 20, rows: [{ id: 7 }] } },
    }))
    ;(viewFace.loadMore as (collection: string, page: number) => void)('orders', 2)
    const store = (viewFace.hooks as {
      business: { getSnapshot(): { rows?: { status: string; value: { rows: Array<{ id: number }> } } } }
    }).business
    await vi.waitFor(() => {
      const rows = store.getSnapshot().rows
      expect(rows?.status).toBe('ready')
      expect(rows?.value.rows.map(row => row.id)).toEqual([7])
    })
    revoke()
    void ctx.fiber.dispose()
  })

  it('lands a failed page load in the rows error state (the catch arm)', async () => {
    const { ctx, revoke, viewFace } = await bench(async () => ({ result: { ok: false, error: { message: 'nocobase-request-failed' } } }))
    ;(viewFace.loadRows as (collection: string) => void)('orders')
    const store = (viewFace.hooks as { business: { getSnapshot(): { rows?: { status: string; error?: string } } } }).business
    await vi.waitFor(() => { expect(store.getSnapshot().rows).toEqual({ status: 'error', error: 'nocobase-request-failed' }) })
    revoke()
    void ctx.fiber.dispose()
  })
})
