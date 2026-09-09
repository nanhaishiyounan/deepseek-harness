// @vitest-environment jsdom
// The connectors view tab: the four-state matrix (loading skeleton, ready
// catalog, empty guidance, error retry), the provider catalog's availability
// copy (healthy + credentials-missing with its explanation), the delivery
// aggregates, the run timeline, and the AI-assisted connect guidance's
// conversation handoff (draft prefill + chat switch — no form).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectorClientState } from '../src/client/connectorStore.ts'
import { ConnectorsView } from '../src/client/ConnectorsView.tsx'
import { ConnectorsEntry } from '../src/client/ConnectorsEntry.tsx'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'connectors'> resolves.
import type {} from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import { providerLabelOf } from '../src/client/presentation.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './connectors-fixture.client.ts'

/** The zh dictionary as the page's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

const READY: ConnectorClientState = {
  providers: {
    status: 'ready',
    value: [
      { id: 'connector-file', available: true, capabilities: ['discover', 'fetch'] },
      { id: 'connector-nocobase', available: false, capabilities: ['discover', 'fetch'] },
    ],
  },
  connections: {
    status: 'ready',
    value: [
      { provider_id: 'connector-file', transfers: 2, rows: 13, last_transfer_at: '2026-09-05T08:00:00.000Z' },
    ],
  },
  timeline: {
    status: 'ready',
    value: [
      { transfer_id: 2, source: 'connector-file', destination: 'kb', dataset_id: 'notes.md', rows: 1, transferred_at: '2026-09-05T08:00:00.000Z' },
      { transfer_id: 1, source: 'connector-file', destination: 'lakehouse', dataset_id: 'orders.csv', rows: 12, transferred_at: '2026-09-04T00:00:00.000Z' },
    ],
  },
}

function mount(state: ConnectorClientState) {
  const store = createSnapshotStore<ConnectorClientState>(state)
  const refresh = vi.fn()
  const requestView = vi.fn()
  const setDraft = vi.fn()
  render(
    <ConnectorsView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useConnectors={bindStoreHook(store) as never}
      refresh={refresh}
      requestView={requestView}
      t={t}
    />,
  )
  return { refresh, requestView, setDraft }
}

afterEach(cleanup)

describe('ConnectorsView state matrix', () => {
  it('loads on mount and renders the row skeleton while in flight', () => {
    const { refresh } = mount({ providers: undefined, connections: undefined, timeline: undefined })
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByText(zh['page.title'])).toBeTruthy()
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('renders the catalog with availability copy and the credentials hint when ready', () => {
    mount(READY)
    // The catalog row and the connection row both show the file source's label.
    expect(screen.getAllByText(providerLabelOf('connector-file')).length).toBe(2)
    expect(screen.getAllByText(zh['catalog.available']).length).toBe(1)
    expect(screen.getAllByText(zh['catalog.unavailable']).length).toBe(1)
    expect(screen.getByText(zh['catalog.unavailableHint'])).toBeTruthy()
  })

  it('shows the empty guidance when the catalog is ready and empty', () => {
    mount({
      providers: { status: 'ready', value: [] },
      connections: { status: 'ready', value: [] },
      timeline: { status: 'ready', value: [] },
    })
    expect(screen.getByText(zh['catalog.noProviders'])).toBeTruthy()
    expect(screen.getByText(zh['delivery.empty'])).toBeTruthy()
  })

  it('shows the error strip with a retry action on a failed load', () => {
    const { refresh } = mount({
      providers: { status: 'error', error: 'connectors-not-composed' },
      connections: { status: 'error', error: 'connectors-not-composed' },
      timeline: { status: 'error', error: 'connectors-not-composed' },
    })
    expect(screen.getAllByText(/connectors-not-composed/u).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: zh['error.retry'] })[0]!)
    expect(refresh).toHaveBeenCalled()
  })
})

describe('ConnectorsView delivery tracking', () => {
  it('renders the connection aggregates and the run timeline rows', () => {
    mount(READY)
    expect(screen.getByText(/2 次交付 · 13 行/u)).toBeTruthy()
    expect(screen.getByText(/最近交付 2026-09-05 08:00/u)).toBeTruthy()
    expect(screen.getByText(zh['timeline.title'])).toBeTruthy()
    expect(screen.getByText(/notes\.md · 1 行/u)).toBeTruthy()
    // The destination labels ride timeline meta spans with siblings, so the
    // match is on the composed row text.
    expect(screen.getByText(/入数据湖/u)).toBeTruthy()
    expect(screen.getByText(/入知识库/u)).toBeTruthy()
  })

  it('providerLabelOf maps the known ids to business names', () => {
    expect(providerLabelOf('connector-file')).toBe('文件投递目录')
    expect(providerLabelOf('other-source')).toBe('other-source')
  })
})

describe('ConnectorsView connect guidance', () => {
  it('hands the connect request to the conversation: draft prefill + chat switch', () => {
    const { setDraft, requestView } = mount(READY)
    fireEvent.click(screen.getByRole('button', { name: zh['wizard.action'] }))
    expect(setDraft).toHaveBeenCalledWith(zh['wizard.prompt'])
    expect(requestView).toHaveBeenCalledWith('chat')
  })
})

describe('ConnectorsEntry', () => {
  it('loads on mount when nothing is cached, then badges and switches on click', () => {
    const idleStore = createSnapshotStore<ConnectorClientState>({ providers: undefined, connections: undefined, timeline: undefined })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: true }))
    const idleRefresh = vi.fn()
    render(
      <ConnectorsEntry
        wide
        useSessions={bindStoreHook(sessions) as never}
        {...GLOBAL_KIT}
        useConnectors={bindStoreHook(idleStore) as never}
        refresh={idleRefresh}
        requestConnectorsView={vi.fn()}
        t={t}
      />,
    )
    expect(idleRefresh).toHaveBeenCalled()
    cleanup()

    const store = createSnapshotStore<ConnectorClientState>(READY)
    const refresh = vi.fn()
    const requestConnectorsView = vi.fn()
    render(
      <ConnectorsEntry
        wide
        useSessions={bindStoreHook(sessions) as never}
        {...GLOBAL_KIT}
        useConnectors={bindStoreHook(store) as never}
        refresh={refresh}
        requestConnectorsView={requestConnectorsView}
        t={t}
      />,
    )
    expect(screen.getByText('2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['entry.providersBadge'] }))
    expect(requestConnectorsView).toHaveBeenCalled()
    // A ready cache does not re-trigger the mount load.
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows the question mark on error and hides the label in the rail', () => {
    const failing: ConnectorClientState = {
      providers: { status: 'error', error: 'x' },
      connections: { status: 'error', error: 'x' },
      timeline: { status: 'error', error: 'x' },
    }
    const store = createSnapshotStore<ConnectorClientState>(failing)
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: true }))
    render(
      <ConnectorsEntry
        wide={false}
        useSessions={bindStoreHook(sessions) as never}
        {...GLOBAL_KIT}
        useConnectors={bindStoreHook(store) as never}
        refresh={vi.fn()}
        requestConnectorsView={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByText('?')).toBeTruthy()
    expect(screen.queryByText(zh['entry.label'])).toBeNull()
  })
})
