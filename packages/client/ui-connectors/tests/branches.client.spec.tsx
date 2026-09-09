// @vitest-environment jsdom
// ConnectorsView's remaining branches: the stats loading skeleton, the
// delivery loading skeleton, the delivery error strip with retry, and the
// timeline hidden when the trail is empty (the catalog-only degradation's
// rendering).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectorClientState } from '../src/client/connectorStore.ts'
import { ConnectorsEntry } from '../src/client/ConnectorsEntry.tsx'
import { ConnectorsView } from '../src/client/ConnectorsView.tsx'
import { zh } from '../src/client/locales.ts'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'connectors'> resolves.
import type {} from '../src/client/index.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT } from './connectors-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

const READY: ConnectorClientState = {
  providers: { status: 'ready', value: [{ id: 'connector-file', available: true, capabilities: ['discover'] }] },
  connections: { status: 'ready', value: [] },
  timeline: { status: 'ready', value: [] },
}

function mount(state: ConnectorClientState) {
  const store = createSnapshotStore<ConnectorClientState>(state)
  const refresh = vi.fn()
  const requestView = vi.fn()
  render(
    <ConnectorsView
      {...SESSION_KIT}
      inputActions={{ setDraft: vi.fn() } as never}
      useConnectors={bindStoreHook(store) as never}
      refresh={refresh}
      requestView={requestView}
      t={t}
    />,
  )
  return { refresh, requestView }
}

afterEach(cleanup)

describe('ConnectorsEntry cached mount', () => {
  it('skips the load when the catalog cache is already ready', () => {
    const store = createSnapshotStore<ConnectorClientState>(READY)
    const sessions = createSnapshotStore({
      ids: ['s1'], byId: { s1: { id: 's1', displayTitle: 's1', running: false, blank: true, updatedAt: 1 } },
      current: 's1', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as never)
    const refresh = vi.fn()
    render(
      <ConnectorsEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useConnectors={bindStoreHook(store) as never}
        refresh={refresh}
        requestConnectorsView={vi.fn()}
        t={t}
      />,
    )
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('ConnectorsEntry no-session branch', () => {
  it('refreshes instead of switching views when no session exists', () => {
    const store = createSnapshotStore<ConnectorClientState>(READY)
    const sessions = createSnapshotStore({
      ids: [], byId: {}, current: undefined,
      phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as never)
    const refresh = vi.fn()
    const requestConnectorsView = vi.fn()
    render(
      <ConnectorsEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useConnectors={bindStoreHook(store) as never}
        refresh={refresh}
        requestConnectorsView={requestConnectorsView}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.providersBadge'] }))
    expect(refresh).toHaveBeenCalled()
    expect(requestConnectorsView).not.toHaveBeenCalled()
  })
})

describe('ConnectorsView remaining branches', () => {
  it('renders the providers skeleton while the catalog loads and the delivery empty state beside it', () => {
    mount({ providers: { status: 'loading' }, connections: undefined, timeline: undefined })
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.getByText(zh['delivery.empty'])).toBeTruthy()
  })

  it('renders the delivery skeleton while the aggregates load', () => {
    mount({
      providers: READY.providers,
      connections: { status: 'loading' },
      timeline: { status: 'loading' },
    })
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(screen.queryByText(zh['timeline.title'])).toBeNull()
  })

  it('falls back to the never-delivered copy when an aggregate carries no timestamp', () => {
    mount({
      providers: READY.providers,
      connections: { status: 'ready', value: [{ provider_id: 'connector-file', transfers: 0, rows: 0 }] },
      timeline: { status: 'ready', value: [] },
    })
    expect(screen.getByText(new RegExp(`${zh['delivery.lastAt']} ${zh['delivery.never']}`))).toBeTruthy()
  })

  it('renders the delivery error strip with a retry when the trail read fails', () => {
    const { refresh } = mount({
      providers: READY.providers,
      connections: { status: 'error', error: 'connectors-transfers-rejected' },
      timeline: { status: 'error', error: 'connectors-transfers-rejected' },
    })
    expect(screen.getByText(/connectors-transfers-rejected/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })
})
