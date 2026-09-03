// @vitest-environment jsdom
// The workbench view tab: the search zone's state matrix (idle chips, busy
// skeletons, results with highlight and carry-to-chat, empty, failure), the
// document zone (empty guidance, session records, totals-only), the usage
// card, and the ingest wizard's URL and browsed-file paths.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbClientState } from '../src/client/kbStore.ts'
import type { KbHitState, KbSearchState } from '../src/client/KbTypes.ts'
import { KbWorkbench } from '../src/client/workbench/KbWorkbench.tsx'
import { KbIngestDialog } from '../src/client/workbench/KbIngestDialog.tsx'
import { zh } from '../src/client/locales.ts'
import { clearRecentSearches } from '../src/client/recentSearches.ts'
import { bindStoreHook, READY_USAGE, SESSION_KIT } from './kb-fixture.client.ts'

/** The zh dictionary as the workbench's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

const HIT: KbHitState = {
  source_path: 'workspace/data/regulations/gb2760-excerpt.md',
  heading_path: '三、调味品行业常见关注事项',
  doc_kind: 'regulation',
  content: '酱油中山梨酸钾最大使用量为 0.5 g/kg（以山梨酸计）。',
}

const HOME_LISTING: DirectoryListing = {
  path: '/srv/host',
  home: '/srv/host',
  crumbs: [{ name: 'host', path: '/srv/host', hidden: false }],
  entries: [{ name: 'workspace', path: '/srv/host/workspace', hidden: false }],
  truncated: false,
}

function mount(state: KbClientState, overrides: {
  search?: (query: string) => Promise<KbSearchState>
  uploadFile?: (file: File) => Promise<{ name: string; chunks: number }>
  ingestFile?: (directory: string, fileName: string) => Promise<{ name: string; chunks: number }>
  ingestUrl?: (url: string) => Promise<{ name: string; chunks: number }>
  listDirectory?: (path?: string) => Promise<DirectoryListing>
} = {}) {
  const store = createSnapshotStore<KbClientState>(state)
  const search = overrides.search ?? vi.fn(async () => ({ mode: 'text' as const, results: [HIT] }))
  const uploadFile = overrides.uploadFile ?? vi.fn(async (file: File) => ({ name: file.name, chunks: 3 }))
  const ingestFile = overrides.ingestFile ?? vi.fn(async (_directory: string, fileName: string) => ({ name: fileName, chunks: 5 }))
  const ingestUrl = overrides.ingestUrl ?? vi.fn(async (url: string) => ({ name: new URL(url).host, chunks: 2 }))
  const listDirectory = overrides.listDirectory ?? vi.fn(async () => HOME_LISTING)
  const noteSearched = vi.fn()
  const refresh = vi.fn()
  const requestView = vi.fn()
  const settleWorkbench = vi.fn()
  const setDraft = vi.fn()
  const view = render(
    <KbWorkbench
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useKb={bindStoreHook(store) as never}
      settleWorkbench={settleWorkbench}
      refresh={refresh}
      search={search}
      noteSearched={noteSearched}
      uploadFile={uploadFile}
      ingestFile={ingestFile}
      ingestUrl={ingestUrl}
      listDirectory={listDirectory}
      requestView={requestView}
      language={() => 'zh'}
      t={t}
    />,
  )
  return {
    view, store, search, noteSearched, refresh, requestView, settleWorkbench,
    setDraft, uploadFile, ingestFile, ingestUrl, listDirectory,
  }
}

/** Open the wizard and switch to the URL tab (the upload tab now opens first). */
function openUrlWizard(): void {
  fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
  fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
}

afterEach(() => {
  cleanup()
  // The search zone records each completed query into localStorage; wipe the
  // entry so a search in one test never seeds another's expectations.
  clearRecentSearches()
})

describe('KbWorkbench search zone', () => {
  it('loads stats on mount and shows the sample chips before the first search', () => {
    const { refresh } = mount({ stats: undefined, records: [] })
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: zh['workbench.sample1'] })).toBeTruthy()
  })

  it('publishes its mount state to the bridge workbench mirror', () => {
    // The blank-session hero portal reads this mirror to step aside; true on
    // mount, false on unmount (the tab can mount on a still-blank session).
    const { view, settleWorkbench } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(settleWorkbench).toHaveBeenCalledWith(true)
    view.unmount()
    expect(settleWorkbench).toHaveBeenLastCalledWith(false)
  })

  it('runs a search, renders the numbered highlighted card, and carries it to chat', async () => {
    const { search, noteSearched, setDraft, requestView, refresh } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    fireEvent.change(screen.getByPlaceholderText(zh['workbench.searchPlaceholder']), { target: { value: '山梨酸 酱油' } })
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.searchAction'] }))
    await waitFor(() => { expect(screen.getByText(zh['workbench.resultSummary'].replaceAll('{hits}', '1').replaceAll('{docs}', '1'))).toBeTruthy() })
    expect(search).toHaveBeenCalledWith('山梨酸 酱油')
    expect(noteSearched).toHaveBeenCalledWith([HIT])
    // A completed search refreshes the shared counters (the search count
    // increments server-side, mirroring the ingest path).
    expect(refresh).toHaveBeenCalledTimes(1)
    // Business-language source line: label — heading path, no doc_kind.
    expect(screen.getByText(/gb2760 excerpt — 三、调味品行业常见关注事项/u)).toBeTruthy()
    expect(screen.getByText('[1]')).toBeTruthy()
    // Both occurrences of the query term render as marked matches.
    expect(screen.getAllByText('山梨酸').map(element => element.tagName)).toEqual(['MARK', 'MARK'])

    fireEvent.click(screen.getByRole('button', { name: zh['result.carryToChat'] }))
    expect(setDraft).toHaveBeenCalledWith('关于「gb2760 excerpt」：山梨酸 酱油，请结合上下文进一步说明')
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('shows the empty result with the go-chat action and the failure strip with retry', async () => {
    const empty = vi.fn(async () => ({ mode: 'text' as const, results: [] }))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { search: empty })
    fireEvent.change(screen.getByPlaceholderText(zh['workbench.searchPlaceholder']), { target: { value: '无结果' } })
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.searchAction'] }))
    await waitFor(() => { expect(screen.getByText(zh['workbench.searchEmpty'])).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.goChat'] }))
    expect(screen.getByText(zh['workbench.searchEmpty'])).toBeTruthy()

    cleanup()
    const failing = vi.fn(async () => { throw new Error('gateway down') })
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { search: failing })
    fireEvent.change(screen.getByPlaceholderText(zh['workbench.searchPlaceholder']), { target: { value: '失败' } })
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.searchAction'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['error.searchFailed']) })
  })
})

/** Two-level listing: the host home, and the workspace folder beneath it. */
const WORKSPACE_LISTING_FOR = (path?: string): DirectoryListing => path === '/srv/host/workspace'
  ? {
    path, home: '/srv/host',
    crumbs: [
      { name: 'srv', path: '/srv', hidden: false },
      { name: 'host', path: '/srv/host', hidden: false },
      { name: 'workspace', path: '/srv/host/workspace', hidden: false },
    ],
    entries: [], truncated: false,
  }
  : HOME_LISTING

describe('KbWorkbench document zone and ingest wizard', () => {
  it('shows the empty guidance when the KB has no documents', () => {
    mount({ stats: { status: 'ready', usage: { documents: 0, searches: 0, ingestedDocuments: 0 } }, records: [] })
    expect(screen.getByText(zh['docs.empty.title'])).toBeTruthy()
    expect(screen.getByText(zh['docs.empty.body'])).toBeTruthy()
  })

  it('lists session records with passage counts and the ready badge', () => {
    mount({
      stats: { status: 'ready', usage: READY_USAGE },
      records: [{ name: 'gb2760 excerpt', path: 'workspace/data/gb2760-excerpt.md', chunks: 4, at: Date.now() - 60000 }],
    })
    expect(screen.getByText(zh['docs.sessionNote'])).toBeTruthy()
    expect(screen.getByText(/gb2760 excerpt/u)).toBeTruthy()
    expect(screen.getByText(zh['docs.chunksUnit'].replaceAll('{n}', '4'))).toBeTruthy()
    expect(screen.getByText(zh['docs.ready'])).toBeTruthy()
  })

  it('ingests a URL through the wizard and reports the receipt', async () => {
    const { ingestUrl } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    openUrlWizard()
    fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/gb2760' } })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    await waitFor(() => { expect(ingestUrl).toHaveBeenCalledWith('https://example.com/gb2760') })
    await waitFor(() => {
      expect(screen.getByText(zh['ingest.done'].replaceAll('{name}', 'example.com').replaceAll('{chunks}', '2'))).toBeTruthy()
    })
  })

  it('browses directories, names the file, and submits under the browsed folder', async () => {
    const { ingestFile } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      listDirectory: vi.fn(async (path?: string) => WORKSPACE_LISTING_FOR(path)),
    })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    await waitFor(() => { expect(screen.getByRole('listitem')).toBeTruthy() })
    fireEvent.click(screen.getByRole('listitem'))
    await waitFor(() => { expect(screen.getByLabelText(zh['ingest.fileNameLabel'])).toBeTruthy() })
    fireEvent.change(screen.getByLabelText(zh['ingest.fileNameLabel']), { target: { value: 'gb2760-excerpt.md' } })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    await waitFor(() => { expect(ingestFile).toHaveBeenCalledWith('/srv/host/workspace', 'gb2760-excerpt.md') })
  })

  it('shows the host-unavailable copy when directory browsing fails', async () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      listDirectory: vi.fn(async () => { throw new Error('directory-picker-unavailable') }),
    })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    await waitFor(() => { expect(screen.getByText(zh['ingest.hostUnavailable'])).toBeTruthy() })
  })

  it('drops a superseded directory response once a newer browse resolves', async () => {
    // A StrictMode double mount dispatches the initial browse twice; the
    // stale first resolution must land nowhere once the newer one arrived.
    const resolvers: Array<(listing: DirectoryListing) => void> = []
    const listDirectory = vi.fn((): Promise<DirectoryListing> =>
      new Promise((resolve) => { resolvers.push(resolve) }))
    render(
      <StrictMode>
        <KbIngestDialog
          open
          onClose={() => {}}
          uploadFile={vi.fn(async () => { throw new Error('unused') })}
          ingestFile={vi.fn(async () => { throw new Error('unused') })}
          ingestUrl={vi.fn(async () => { throw new Error('unused') })}
          listDirectory={listDirectory}
          onDone={() => {}}
          onFailed={() => {}}
          t={t}
        />
      </StrictMode>,
    )
    await waitFor(() => { expect(listDirectory.mock.calls.length).toBeGreaterThanOrEqual(2) })
    // The browse race is a file-tab concern; hop there before resolving.
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    // The newer browse (B) resolves first with the home level to show.
    await act(async () => { resolvers.at(-1)!(HOME_LISTING) })
    await waitFor(() => { expect(screen.getByRole('listitem')).toBeTruthy() })
    // The stale first response (A) resolves afterwards with an empty level;
    // had it landed, the level rows would vanish — the shown level stays B's.
    const EMPTY: DirectoryListing = { path: '/gone', home: '/gone', crumbs: [], entries: [], truncated: false }
    await act(async () => { resolvers[0]!(EMPTY) })
    expect(screen.getByRole('listitem')).toBeTruthy()
  })

  it('drops a superseded directory rejection once a newer browse resolved', async () => {
    const settles: Array<{ resolve: (listing: DirectoryListing) => void; reject: (reason: unknown) => void }> = []
    const listDirectory = vi.fn((): Promise<DirectoryListing> =>
      new Promise((resolve, reject) => { settles.push({ resolve, reject }) }))
    render(
      <StrictMode>
        <KbIngestDialog
          open
          onClose={() => {}}
          uploadFile={vi.fn(async () => { throw new Error('unused') })}
          ingestFile={vi.fn(async () => { throw new Error('unused') })}
          ingestUrl={vi.fn(async () => { throw new Error('unused') })}
          listDirectory={listDirectory}
          onDone={() => {}}
          onFailed={() => {}}
          t={t}
        />
      </StrictMode>,
    )
    await waitFor(() => { expect(listDirectory.mock.calls.length).toBeGreaterThanOrEqual(2) })
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    // The newer browse resolves with a level to show; the stale first call
    // rejects afterwards — the failure copy stays hidden.
    await act(async () => { settles.at(-1)!.resolve(HOME_LISTING) })
    await waitFor(() => { expect(screen.getByRole('listitem')).toBeTruthy() })
    await act(async () => { settles[0]!.reject(new Error('late failure')) })
    expect(screen.getByRole('listitem')).toBeTruthy()
    expect(screen.queryByText(zh['ingest.hostUnavailable'])).toBeNull()
  })
})

describe('KbWorkbench upload tab', () => {
  /** The wizard's hidden file input, reached through its pick label. */
  function fileInput() {
    return screen.getByLabelText(zh['ingest.uploadPick'], { selector: 'input' })
  }

  it('opens the wizard on the upload tab with the pick affordance and no footer action', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    expect(screen.getByRole('tab', { name: zh['ingest.tabUpload'] })).toHaveProperty('ariaSelected', 'true')
    expect(fileInput()).toHaveProperty('multiple', true)
    expect(fileInput()).toHaveProperty('accept', '.md,.txt,.pdf,.docx')
    expect(screen.getByText(zh['ingest.uploadHint'])).toBeTruthy()
    // The URL and file inputs stay unmounted until their tabs are picked.
    expect(screen.queryByPlaceholderText(zh['ingest.urlPlaceholder'])).toBeNull()
    // The upload tab's action is the pick itself; the footer keeps only cancel.
    expect(screen.queryByRole('button', { name: zh['ingest.action'] })).toBeNull()
    expect(screen.getByRole('button', { name: zh['scenario.cancel'] })).toBeTruthy()
  })

  it('uploads picked files one by one, reporting each receipt row and toast', async () => {
    const uploadFile = vi.fn(async (file: File) => ({ name: file.name, chunks: file.name.endsWith('.pdf') ? 7 : 2 }))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { uploadFile })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.change(fileInput(), {
      target: { files: [new File(['# 走访'], 'visit.md'), new File([new Uint8Array([37, 80])], 'audit.pdf')] },
    })
    await waitFor(() => {
      expect(screen.getByText(zh['ingest.uploadRowDone'].replaceAll('{chunks}', '2'))).toBeTruthy()
      expect(screen.getByText(zh['ingest.uploadRowDone'].replaceAll('{chunks}', '7'))).toBeTruthy()
    })
    expect(uploadFile).toHaveBeenCalledTimes(2)
    // The last receipt still lands as the workbench toast.
    expect(screen.getByRole('alert').textContent).toContain(zh['ingest.done'].replaceAll('{name}', 'audit.pdf').replaceAll('{chunks}', '7'))
    // The dialog stays open so the rows remain readable.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('classifies a too-large rejection and a generic failure per row', async () => {
    const uploadFile = vi.fn(async (file: File) => {
      if (file.name === 'huge.pdf') throw new Error('upload exceeds the workbench limit of 67108864 bytes')
      if (file.name === 'raw.md') throw 'transport gone'
      throw new Error('boom')
    })
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { uploadFile })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.change(fileInput(), {
      target: { files: [new File([new Uint8Array([1])], 'huge.pdf'), new File(['x'], 'note.md'), new File(['y'], 'raw.md')] },
    })
    await waitFor(() => { expect(screen.getByText(zh['ingest.uploadTooLarge'])).toBeTruthy() })
    // Both the Error and the non-Error rejection land their own generic row.
    expect(screen.getAllByText(zh['ingest.uploadRowFailed'])).toHaveLength(2)
    // The raw transport text never reaches a row.
    expect(document.body.textContent).not.toContain('67108864')
  })

  it('shows the busy state while an upload is in flight, then the done row', async () => {
    let release: ((value: { name: string; chunks: number }) => void) | undefined
    const uploadFile = vi.fn(() => new Promise<{ name: string; chunks: number }>((resolve) => { release = resolve }))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { uploadFile })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'note.md')] } })
    await waitFor(() => { expect(screen.getByText(zh['ingest.uploadRowBusy'])).toBeTruthy() })
    await act(async () => { release!({ name: 'note.md', chunks: 4 }) })
    await waitFor(() => { expect(screen.getByText(zh['ingest.uploadRowDone'].replaceAll('{chunks}', '4'))).toBeTruthy() })
    expect(screen.queryByText(zh['ingest.uploadRowBusy'])).toBeNull()
  })

  it('drops row updates from a batch the next open supersedes', async () => {
    let release: ((value: { name: string; chunks: number }) => void) | undefined
    const uploadFile = vi.fn(() => new Promise<{ name: string; chunks: number }>((resolve) => { release = resolve }))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { uploadFile })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'note.md')] } })
    await waitFor(() => { expect(screen.getByText(zh['ingest.uploadRowBusy'])).toBeTruthy() })
    // Close and reopen; the closed batch's late resolution must not seed rows.
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.cancel'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    await act(async () => { release!({ name: 'note.md', chunks: 9 }) })
    expect(screen.queryByText(zh['ingest.uploadRowDone'].replaceAll('{chunks}', '9'))).toBeNull()
    expect(screen.queryByText(zh['ingest.uploadRowBusy'])).toBeNull()
  })

  it('drops a superseded batch\'s late rejection without failing the fresh rows', async () => {
    let rejectIt: ((reason: unknown) => void) | undefined
    const uploadFile = vi.fn(() => new Promise<{ name: string; chunks: number }>((_, reject) => { rejectIt = reject }))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { uploadFile })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'note.md')] } })
    await waitFor(() => { expect(screen.getByText(zh['ingest.uploadRowBusy'])).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.cancel'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    await act(async () => { rejectIt!(new Error('late failure')) })
    expect(screen.queryByText(zh['ingest.uploadRowFailed'])).toBeNull()
    expect(screen.queryByText(zh['ingest.uploadRowBusy'])).toBeNull()
  })

  it('ignores an empty pick and returns to the upload tab from a sibling', () => {
    const { uploadFile } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    // A cleared chooser round (empty file list) dispatches nothing.
    fireEvent.change(fileInput(), { target: { files: [] } })
    expect(uploadFile).not.toHaveBeenCalled()
    expect(screen.queryByRole('listitem')).toBeNull()
    // Hop away and back: the upload tab's affordance returns.
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    expect(screen.queryByLabelText(zh['ingest.uploadPick'], { selector: 'input' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUpload'] }))
    expect(fileInput()).toBeTruthy()
  })
})

describe('KbWorkbench usage card', () => {
  it('shows the three cumulative business metrics with no subscription line', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText('35')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText(zh['usage.searches'])).toBeTruthy()
    expect(screen.getByText(zh['usage.documents'])).toBeTruthy()
    expect(screen.getByText(zh['usage.ingested'])).toBeTruthy()
    expect(screen.getByRole('heading', { name: zh['usage.title'] })).toBeTruthy()
  })

  it('shows the unavailable strip with retry and the first-search guidance on all-zero', () => {
    const { refresh } = mount({ stats: { status: 'error', error: 'kb-not-composed' }, records: [] })
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: zh['error.retry'] }).at(-1)!)
    expect(refresh).toHaveBeenCalled()

    cleanup()
    mount({ stats: { status: 'ready', usage: { documents: 0, searches: 0, ingestedDocuments: 0 } }, records: [] })
    expect(screen.getByText(zh['usage.firstSearch'])).toBeTruthy()
  })
})

describe('KbWorkbench ingest wizard failure and reset matrix', () => {
  function openWizard(overrides: Parameters<typeof mount>[1] = {}) {
    const kit = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, overrides)
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    return kit
  }

  it('submits nothing while the active tab has no value', async () => {
    const { ingestUrl, ingestFile } = openWizard()
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    // URL tab with an empty input: no call, dialog stays open.
    expect(ingestUrl).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    await waitFor(() => { expect(screen.getByRole('listitem')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    expect(ingestFile).not.toHaveBeenCalled()
  })

  it('translates a missing-path failure and clears it on tab switch', async () => {
    openWizard({ ingestUrl: vi.fn(async () => { throw new Error('open failed: ENOENT no such file') }) })
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/x' } })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['ingest.pathMissing']) })
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
  })

  it('translates an unreachable-URL failure and maps every other rejection onto the server copy', async () => {
    openWizard({ ingestUrl: vi.fn(async () => { throw new Error('fetch failed: ECONNREFUSED') }) })
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/y' } })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['ingest.urlUnreachable']) })

    cleanup()
    openWizard({ ingestUrl: vi.fn(async () => { throw new Error('quota exceeded') }) })
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/z' } })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    // The raw transport text never reaches the strip.
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['ingest.failed']) })
    expect(screen.getByRole('alert').textContent).not.toContain('quota exceeded')
  })

  it('submits the URL on Enter and resets the form when reopened', async () => {
    const { ingestUrl } = openWizard()
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    const input = screen.getByPlaceholderText(zh['ingest.urlPlaceholder'])
    fireEvent.change(input, { target: { value: 'https://example.com/enter' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(ingestUrl).toHaveBeenCalledWith('https://example.com/enter') })
    // The successful submit closed the dialog; reopening starts fresh.
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    // The fresh dialog opens on the upload tab; its URL input starts empty
    // once that tab is picked again.
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    expect(screen.getByPlaceholderText(zh['ingest.urlPlaceholder'])).toHaveProperty('value', '')
  })
})

describe('KbWorkbench hit card and document list edges', () => {
  it('walks the crumbs back up, submits the file name on Enter, and returns to the URL tab', async () => {
    const { ingestFile } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      listDirectory: vi.fn(async (path?: string) => WORKSPACE_LISTING_FOR(path)),
    })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabFile'] }))
    await waitFor(() => { expect(screen.getByRole('listitem')).toBeTruthy() })
    fireEvent.click(screen.getByRole('listitem'))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'host' })).toBeTruthy() })
    // The crumb jumps back to the host level.
    fireEvent.click(screen.getByRole('button', { name: /^host$/ }))
    await waitFor(() => { expect(screen.getByRole('listitem')).toBeTruthy() })
    fireEvent.click(screen.getByRole('listitem'))
    await waitFor(() => { expect(screen.getByLabelText(zh['ingest.fileNameLabel'])).toBeTruthy() })
    const input = screen.getByLabelText(zh['ingest.fileNameLabel'])
    // A plain keystroke submits nothing; Enter does.
    fireEvent.keyDown(input, { key: 'a' })
    expect(ingestFile).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'notes.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(ingestFile).toHaveBeenCalled() })
    // Reopen and hop back to the URL tab.
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    expect(screen.getByPlaceholderText(zh['ingest.urlPlaceholder'])).toBeTruthy()
  })

  it('ignores a second submit while one ingest is in flight', async () => {
    const ingestUrl = vi.fn(() => new Promise<{ name: string; chunks: number }>(() => {}))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { ingestUrl })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    // A plain keystroke in the URL box submits nothing.
    fireEvent.keyDown(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { key: 'Tab' })
    fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/slow' } })
    const submit = screen.getByRole('button', { name: zh['ingest.action'] })
    fireEvent.click(submit)
    // The busy label replaces the action text; the second click is a no-op.
    fireEvent.click(submit)
    expect(ingestUrl).toHaveBeenCalledTimes(1)
  })

  it('runs the search zone edges: empty submit, sample chip, Enter, retry, and non-Error failures', async () => {
    const search = vi.fn(async (query: string) => {
      if (query === '失败') throw new Error('gateway down')
      if (query === '崩溃') throw 'transport gone'
      return { mode: 'text' as const, results: [HIT] }
    })
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { search })
    const input = screen.getByPlaceholderText(zh['workbench.searchPlaceholder'])
    // An empty query submits nothing.
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.searchAction'] }))
    expect(search).not.toHaveBeenCalled()
    // A sample chip fills and runs in one click.
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.sample2'] }))
    await waitFor(() => { expect(search).toHaveBeenCalledWith('车间虫控') })
    // Enter in the box runs the trimmed query.
    fireEvent.change(input, { target: { value: '  山梨酸  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(search).toHaveBeenCalledWith('山梨酸') })
    // An Error rejection shows the retry strip; retrying re-runs the query.
    fireEvent.change(input, { target: { value: '失败' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['error.searchFailed']) })
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    await waitFor(() => { expect(search).toHaveBeenCalledTimes(4) })
    // A non-Error rejection still renders as the failure message.
    fireEvent.change(input, { target: { value: '崩溃' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['error.searchFailed']) })
  })

  it('maps a raw transport ingest rejection onto the localized failure copy and ignores non-Enter keys in the search box', async () => {
    const { refresh } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      ingestUrl: vi.fn(async () => { throw 'transport refused' }),
    })
    // A plain keystroke in the search box submits nothing.
    fireEvent.keyDown(screen.getByPlaceholderText(zh['workbench.searchPlaceholder']), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
    fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/x' } })
    fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
    // The raw transport text never reaches the strip; the failure still
    // reloads the shared counters (the server-side state is authoritative).
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['ingest.failed']) })
    expect(screen.getByRole('alert').textContent).not.toContain('transport refused')
    expect(refresh).toHaveBeenCalled()
  })

  it('expires the ingest toast and routes the usage card back to chat', async () => {
    vi.useFakeTimers()
    try {
      mount({ stats: { status: 'ready', usage: { documents: 0, searches: 0, ingestedDocuments: 0 } }, records: [] })
      fireEvent.click(screen.getByRole('button', { name: zh['docs.addDocument'] }))
      fireEvent.click(screen.getByRole('tab', { name: zh['ingest.tabUrl'] }))
      fireEvent.change(screen.getByPlaceholderText(zh['ingest.urlPlaceholder']), { target: { value: 'https://example.com/t' } })
      fireEvent.click(screen.getByRole('button', { name: zh['ingest.action'] }))
      // Flush the ingest promise chain under fake timers, then query synchronously.
      await act(async () => { await Promise.resolve() })
      const toast = screen.getByRole('alert')
      expect(toast.textContent).toContain(zh['ingest.done'].replaceAll('{name}', 'example.com').replaceAll('{chunks}', '2'))
      // The empty-state guidance routes back to the chat view.
      fireEvent.click(screen.getByRole('button', { name: zh['workbench.goChat'] }))
      // Four seconds later the shared toast primitive reports done and unmounts.
      act(() => { vi.advanceTimersByTime(4000) })
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders a hit without a heading path and toggles its passage', async () => {
    const one = vi.fn(async (): Promise<KbSearchState> => {
      const { heading_path: _ignored, ...hit } = HIT
      return { mode: 'text', results: [hit] }
    })
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { search: one })
    fireEvent.change(screen.getByPlaceholderText(zh['workbench.searchPlaceholder']), { target: { value: '供应商' } })
    fireEvent.click(screen.getByRole('button', { name: zh['workbench.searchAction'] }))
    await waitFor(() => { expect(screen.getByText('[1]')).toBeTruthy() })
    // The source line carries no heading separator, and the passage toggles.
    expect(screen.getByText('gb2760 excerpt', { exact: true })).toBeTruthy()
    fireEvent.click(screen.getByText(zh['result.expand']))
    expect(screen.getByText(zh['result.collapse'])).toBeTruthy()
    fireEvent.click(screen.getByText(zh['result.collapse']))
    expect(screen.getByText(zh['result.expand'])).toBeTruthy()
  })

  it('lists a search sighting without a passage count beside an ingest receipt', () => {
    mount({
      stats: { status: 'ready', usage: READY_USAGE },
      records: [
        { name: 'hongda notes', path: 'workspace/suppliers/hongda.md', at: Date.now() - 60000 },
        { name: 'gb2760 excerpt', path: 'workspace/data/gb2760-excerpt.md', chunks: 4, at: Date.now() - 120000 },
      ],
    })
    // The sighting row carries no passage count; the receipt row does.
    expect(screen.getAllByText(/hongda notes/u).length).toBeGreaterThan(0)
    expect(screen.queryByText(zh['docs.chunksUnit'].replaceAll('{n}', '4'))).toBeTruthy()
  })
})
