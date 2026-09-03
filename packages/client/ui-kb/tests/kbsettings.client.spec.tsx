// @vitest-environment jsdom
// The knowledge-base settings section: the settings panel's kb page renders
// the shared usage card over the shared stats cache — the load skeleton, the
// ready metrics, the error strip with retry, and the empty-state guidance
// whose action closes the panel.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbClientState } from '../src/client/kbStore.ts'
import { KbSettingsSection } from '../src/client/KbSettingsSection.tsx'
import { zh } from '../src/client/locales.ts'
import { bindStoreHook, GLOBAL_KIT, READY_USAGE } from './kb-fixture.client.ts'

/** The zh dictionary as the section's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

function mount(state: KbClientState) {
  const store = createSnapshotStore<KbClientState>(state)
  const refresh = vi.fn()
  const close = vi.fn()
  const view = render(
    <KbSettingsSection
      {...GLOBAL_KIT}
      useSessions={() => undefined as never}
      close={close}
      useKb={bindStoreHook(store) as never}
      refresh={refresh}
      t={t}
    />,
  )
  return { view, store, refresh, close }
}

afterEach(cleanup)

describe('KbSettingsSection', () => {
  it('loads stats on mount and shows the skeleton while loading', () => {
    const { refresh } = mount({ stats: { status: 'loading' }, records: [] })
    expect(refresh).not.toHaveBeenCalled()
    cleanup()
    const first = mount({ stats: undefined, records: [] })
    expect(first.refresh).toHaveBeenCalled()
    expect(screen.getByRole('region', { name: zh['usage.title'] })).toBeTruthy()
  })

  it('renders the three business metrics when ready', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText(String(READY_USAGE.searches))).toBeTruthy()
    expect(screen.getByText(String(READY_USAGE.ingestedDocuments))).toBeTruthy()
    expect(screen.getByText(String(READY_USAGE.documents))).toBeTruthy()
  })

  it('shows the error strip and retries through the shared refresh', () => {
    const { refresh } = mount({ stats: { status: 'error', error: 'down' }, records: [] })
    expect(screen.getByRole('alert').textContent).toContain(zh['error.unavailable'])
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })

  it('guides the empty state back to chat by closing the panel', () => {
    const { close } = mount({
      stats: { status: 'ready', usage: { documents: 0, searches: 0, ingestedDocuments: 0 } },
      records: [],
    })
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.goChat'] }))
    expect(close).toHaveBeenCalled()
  })
})
