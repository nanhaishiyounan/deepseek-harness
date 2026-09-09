// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

/** The ready stats value every mock below shares. */
const STATS_VALUE = {
  documents: 6, chunks: 20, embedded_chunks: 0, embed_available: false,
  usage: { searches: 3, ingested_documents: 2, ingested_chunks: 20, embed_texts: 0, embed_tokens: 0 },
}

/** One ok rpc envelope. */
const ok = <T,>(value: T): { result: { ok: true; value: T } } => ({ result: { ok: true, value } })

/** Boot the client plugin over the slot/locale runtimes and a scripted api face. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const stats = vi.fn(async () => ok(STATS_VALUE))
  const search = vi.fn(async () => ok({ mode: 'text', results: [] }))
  const ingest = vi.fn(async () => ok({ doc_id: 7, chunks: 5, embedded: false }))
  const ingestUrl = vi.fn(async () => ok({ doc_id: 8, chunks: 2, embedded: false }))
  const upload = vi.fn(async (payload: { filename: string; data: string; mime?: string }) =>
    payload.filename.endsWith('.csv')
      ? ok({ destination: 'lakehouse', replaced: false, table: 'orders', rows: 6 })
      : ok({ destination: 'kb', replaced: true, document: { doc_id: 9, chunks: 3, embedded: false } }))
  const select = vi.fn(async () => ok({ sessionId: 's1', agentPreset: 'market-insight' }))
  const listDirectory = vi.fn(async () => ok({ path: '/srv', home: '/srv', crumbs: [], entries: [], truncated: false }))
  const describeHost = vi.fn(async () => ok({
    version: '1', cwd: '/srv', attachedSessions: 0, home: '/srv', canOpenPath: false,
  }))
  ctx.provide('connection', {
    api: {
      kb: { stats, search, ingest, ingestUrl, upload },
      data: { upload },
      agentPresets: { select },
      host: { listDirectory, describe: describeHost },
    },
  } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  apply(ctx)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, stats, upload }
}

/** Declare the seven seats this plugin rides, as their owning packages would. */
function declareSeats(ctx: Context): () => void {
  return ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.hero.headline': { kind: 'single', scope: 'root' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

/** Boot one world over a fully scripted api (every method configurable). */
async function scriptedWorld(overrides: {
  stats?: () => Promise<unknown>
  select?: () => Promise<unknown>
  search?: () => Promise<unknown>
  listDirectory?: () => Promise<unknown>
  describe?: () => Promise<unknown>
  ingestUrl?: () => Promise<unknown>
}): Promise<{ ctx: Context; slots: SlotRegistry }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('connection', {
    api: {
      kb: {
        stats: overrides.stats ?? vi.fn(async () => ok(STATS_VALUE)),
        search: overrides.search ?? vi.fn(async () => ok({ mode: 'text', results: [] })),
        ingest: vi.fn(async () => ok({ doc_id: 1, chunks: 1, embedded: false })),
        ingestUrl: overrides.ingestUrl ?? vi.fn(async () => ok({ doc_id: 1, chunks: 1, embedded: false })),
      },
      agentPresets: { select: overrides.select ?? vi.fn(async () => ok({})) },
      host: {
        listDirectory: overrides.listDirectory
          ?? vi.fn(async () => ok({ path: '/srv', home: '/srv', crumbs: [], entries: [], truncated: false })),
        describe: overrides.describe ?? vi.fn(async () => ok({
          version: '1', cwd: '/srv', attachedSessions: 0, home: '/srv', canOpenPath: false,
        })),
      },
    },
  } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  apply(ctx)
  declareSeats(ctx)
  return { ctx, slots: ctx.get('slots') as SlotRegistry }
}

describe('ui-kb apply', () => {
  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the seven workbench seats and the kb dictionary', async () => {
    const { ctx, slots, locale } = await bench()
    const dispose = declareSeats(ctx)
    expect(slots.entries('sidebar.footer.action')[0]?.options.id).toBe('kb')
    expect(slots.entries('conversation.input.dock')[0]?.options.id).toBe('kb-portal')
    expect(slots.entries('conversation.view').map(entry => entry.options.id)).toContain('kb')
    expect(slots.entries('conversation.session.header.actions').map(entry => entry.options.id)).toContain('kb')
    // The headline seat is single-kind: the entry registers without an id.
    expect(slots.entries('conversation.hero.headline')).toHaveLength(1)
    // The knowledge-base, connector, and order tool names' keyed holes share row components.
    expect(slots.entries('tool.call.toolview').map(entry => entry.options.key).sort())
      .toEqual(['connector_discover', 'kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats', 'order_create', 'order_status'])
    // The settings section carries a nav label resolved through zh.
    const sectionEntry = slots.entries('settings.section').find(entry => entry.options.id === 'kb')
    expect(sectionEntry?.options.label).toEqual(expect.any(Function))
    expect((sectionEntry?.options.label as () => string)()).toBe(zh['settings.nav'])
    // The view tab's label thunk resolves through the bound zh dictionary.
    const viewEntry = slots.entries('conversation.view').find(entry => entry.options.id === 'kb')
    expect(viewEntry?.options.label).toEqual(expect.any(Function))
    expect((viewEntry?.options.label as () => string)()).toBe(zh['view.kb'])
    expect(locale).toBeDefined()
    dispose()
    await ctx.fiber.dispose()
  })

  it('hands every seat an inject face over the shared store and api', async () => {
    const { ctx, slots } = await bench()
    const dispose = declareSeats(ctx)
    const entry = slots.entries('sidebar.footer.action')[0]
    expect(entry?.component).toBeTypeOf('function')
    const face = (entry?.inject as () => Record<string, unknown>)()
    expect(face.hooks).toHaveProperty('kb')
    expect(face.refresh).toEqual(expect.any(Function))
    expect(face.requestKbView).toEqual(expect.any(Function))
    const headerEntry = slots.entries('conversation.session.header.actions').find(candidate => candidate.options.id === 'kb')
    const headerFace = (headerEntry?.inject as () => Record<string, unknown>)()
    expect(headerFace.publishViewSwitch).toEqual(expect.any(Function))
    const viewEntry = slots.entries('conversation.view').find(candidate => candidate.options.id === 'kb')
    const viewFace = (viewEntry?.inject as (sessionId: string) => Record<string, unknown>)('s1')
    expect(viewFace.search).toEqual(expect.any(Function))
    expect(viewFace.ingestFile).toEqual(expect.any(Function))
    expect(viewFace.ingestUrl).toEqual(expect.any(Function))
    expect(viewFace.listDirectory).toEqual(expect.any(Function))
    const dockEntry = slots.entries('conversation.input.dock')[0]
    const dockFace = (dockEntry?.inject as (sessionId: string) => Record<string, unknown>)('s1')
    expect(dockFace.selectScenario).toEqual(expect.any(Function))
    const sectionEntry = slots.entries('settings.section').find(candidate => candidate.options.id === 'kb')
    const sectionFace = (sectionEntry?.inject as () => Record<string, unknown>)()
    expect(sectionFace.refresh).toEqual(expect.any(Function))
    dispose()
    await ctx.fiber.dispose()
  })

  it('walks the happy path over every shared face', async () => {
    const { ctx, slots, stats, upload } = await bench()
    const dispose = declareSeats(ctx)
    const entryFace = (slots.entries('sidebar.footer.action')[0]?.inject as () => {
      refresh: () => void
      requestKbView: () => void
      hooks: { kb: { getSnapshot: () => { stats: { status: string; usage?: { documents: number } } } } }
    })()
    entryFace.refresh()
    await vi.waitFor(() => {
      expect(entryFace.hooks.kb.getSnapshot().stats).toMatchObject({ status: 'ready', usage: { documents: 6 } })
    })
    entryFace.requestKbView()

    const headerFace = (slots.entries('conversation.session.header.actions').find(candidate => candidate.options.id === 'kb')
      ?.inject as () => { publishViewSwitch: (setView: (view: string) => void) => () => void })()
    const withdraw = headerFace.publishViewSwitch(() => {})
    expect(withdraw).toEqual(expect.any(Function))
    withdraw()

    const dockFace = (slots.entries('conversation.input.dock')[0]?.inject as (sessionId: string) => {
      selectScenario: (scenarioId: string) => Promise<void>
      language: () => 'zh' | 'en'
    })('s1')
    await dockFace.selectScenario('market-insight')
    expect(dockFace.language()).toBe('zh')

    const viewFace = (slots.entries('conversation.view').find(candidate => candidate.options.id === 'kb')
      ?.inject as (sessionId: string) => {
      search: (query: string) => Promise<{ results: { source_path: string }[] }>
      noteSearched: (hits: { source_path: string }[]) => void
      uploadFile: (file: File) => Promise<{ name: string; chunks: number }>
      ingestFile: (directory: string, fileName: string) => Promise<{ name: string; chunks: number }>
      ingestUrl: (url: string) => Promise<{ name: string; chunks: number }>
      listDirectory: (path?: string) => Promise<unknown>
      requestView: (view: string) => void
      settleWorkbench: (mounted: boolean) => void
      language: () => 'zh' | 'en'
    })('s1')
    await viewFace.search('山梨酸')
    viewFace.noteSearched([{ source_path: 'workspace/data/regulations/gb2760-excerpt.md' }])
    await viewFace.listDirectory('/srv')
    // Under the host cwd the directory relativizes; outside it stays absolute.
    await expect(viewFace.ingestFile('/srv/workspace/data', 'gb2760-excerpt.md')).resolves.toEqual({
      name: 'gb2760-excerpt.md', chunks: 5,
    })
    await expect(viewFace.ingestFile('/elsewhere', 'notes.md')).resolves.toEqual({ name: 'notes.md', chunks: 5 })
    await expect(viewFace.ingestUrl('https://example.com/report')).resolves.toEqual({
      name: 'example.com', chunks: 2,
    })
    // The upload face encodes the browser file's bytes as base64 with its
    // declared mime type, records the uploads-path sighting beside the
    // receipt, and carries the wire's replacement fact through to the
    // wizard's toast.
    const file = new File(['# visit'], 'visit.md', { type: 'text/markdown' })
    await expect(viewFace.uploadFile(file)).resolves.toEqual({ name: 'visit.md', chunks: 3, replaced: true, destination: 'kb' })
    expect(upload).toHaveBeenCalledWith({ filename: 'visit.md', data: 'IyB2aXNpdA==', mime: 'text/markdown' })
    // A structured body routes to the lakehouse and reports the table fact.
    const csv = new File(['region\n中亚'], 'orders.csv', { type: 'text/csv' })
    await expect(viewFace.uploadFile(csv)).resolves.toEqual({
      name: 'orders.csv', destination: 'lakehouse', table: 'orders', rows: 6, replaced: false,
    })
    // A browser file with no declared mime type omits the wire's mime field.
    const plain = new File(['a,b\n1,2'], 'plain.csv')
    await expect(viewFace.uploadFile(plain)).resolves.toMatchObject({ destination: 'lakehouse', table: 'orders' })
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ filename: 'plain.csv', data: 'YSxiCjEsMg==' }))
    viewFace.requestView('chat')
    // The mount mirror the hero portal reads: settle flips the shared boolean.
    const workbenchMirror = (slots.entries('conversation.input.dock')[0]?.inject as (sessionId: string) => {
      hooks: { workbench: { getSnapshot: () => boolean } }
    })('s1').hooks.workbench
    viewFace.settleWorkbench(true)
    expect(workbenchMirror.getSnapshot()).toBe(true)
    viewFace.settleWorkbench(false)
    expect(workbenchMirror.getSnapshot()).toBe(false)
    expect(viewFace.language()).toBe('zh')
    expect(stats).toHaveBeenCalled()
    const settingsFace = (slots.entries('settings.section').find(candidate => candidate.options.id === 'kb')
      ?.inject as () => Record<string, unknown>)()
    expect(settingsFace.refresh).toEqual(expect.any(Function))
    expect(settingsFace.hooks).toHaveProperty('kb')
    dispose()
    await ctx.fiber.dispose()
  })

  it('surfaces refused rpc results and rejections through the shared faces', async () => {
    const refusal = { result: { ok: false as const, error: { message: 'kb not composed' } } }
    const { ctx, slots } = await scriptedWorld({
      stats: vi.fn(async () => refusal),
      select: vi.fn(async () => { throw new Error('roster refused') }),
      search: vi.fn(async () => refusal),
      listDirectory: vi.fn(async () => refusal),
      describe: vi.fn(async () => refusal),
      ingestUrl: vi.fn(async () => refusal),
    })
    // refresh: a refused stats call lands on the error cache (unwrap throws,
    // messageOf keeps the Error text).
    const entryFace = (slots.entries('sidebar.footer.action')[0]?.inject as () => {
      refresh: () => void
      hooks: { kb: { getSnapshot: () => { stats: { status: string; error?: string } } } }
    })()
    entryFace.refresh()
    await vi.waitFor(() => {
      expect(entryFace.hooks.kb.getSnapshot().stats).toEqual({ status: 'error', error: 'kb not composed' })
    })

    const viewFace = (slots.entries('conversation.view').find(candidate => candidate.options.id === 'kb')
      ?.inject as (sessionId: string) => {
      search: (query: string) => Promise<unknown>
      ingestFile: (directory: string, fileName: string) => Promise<unknown>
      ingestUrl: (url: string) => Promise<unknown>
      listDirectory: (path?: string) => Promise<unknown>
    })('s1')
    await expect(viewFace.search('q')).rejects.toThrow('kb not composed')
    // ingestFile surfaces the host-describe refusal before any path join.
    await expect(viewFace.ingestFile('/srv', 'a.md')).rejects.toThrow('kb not composed')
    await expect(viewFace.ingestUrl('https://example.com/x')).rejects.toThrow('kb not composed')
    await expect(viewFace.listDirectory()).rejects.toThrow('kb not composed')

    const dockFace = (slots.entries('conversation.input.dock')[0]?.inject as (sessionId: string) => {
      selectScenario: (scenarioId: string) => Promise<void>
    })('s1')
    await expect(dockFace.selectScenario('market-insight')).rejects.toThrow('roster refused')
    await ctx.fiber.dispose()
  })

  it('rejects a refused scenario selection through the dock face', async () => {
    const { ctx, slots } = await scriptedWorld({
      select: vi.fn(async () => ({ result: { ok: false as const, error: { message: 'preset not found' } } })),
    })
    const dockFace = (slots.entries('conversation.input.dock')[0]?.inject as (sessionId: string) => {
      selectScenario: (scenarioId: string) => Promise<void>
    })('s1')
    await expect(dockFace.selectScenario('ghost')).rejects.toThrow('preset not found')
    await ctx.fiber.dispose()
  })

  it('keeps a second refresh a no-op while one stats load is in flight', async () => {
    // Never settles: the load stays in flight for the whole assertion.
    const stats = vi.fn(() => new Promise(() => {}))
    const { ctx, slots } = await scriptedWorld({ stats })
    const entryFace = (slots.entries('sidebar.footer.action')[0]?.inject as () => {
      refresh: () => void
      hooks: { kb: { getSnapshot: () => { stats: { status: string } } } }
    })()
    entryFace.refresh()
    expect(entryFace.hooks.kb.getSnapshot().stats).toEqual({ status: 'loading' })
    entryFace.refresh()
    expect(stats).toHaveBeenCalledTimes(1)
    await ctx.fiber.dispose()
  })

  it('keeps a non-Error rejection readable in the error cache', async () => {
    const stats = vi.fn(async () => { throw 'gateway went away' })
    const { ctx, slots } = await scriptedWorld({ stats })
    const entryFace = (slots.entries('sidebar.footer.action')[0]?.inject as () => {
      refresh: () => void
      hooks: { kb: { getSnapshot: () => { stats: { status: string; error?: string } } } }
    })()
    entryFace.refresh()
    await vi.waitFor(() => {
      expect(entryFace.hooks.kb.getSnapshot().stats).toEqual({ status: 'error', error: 'gateway went away' })
    })
    await ctx.fiber.dispose()
  })

  it('labels an unparseable URL ingest by its raw form', async () => {
    const { ctx, slots } = await scriptedWorld({})
    const viewFace = (slots.entries('conversation.view').find(candidate => candidate.options.id === 'kb')
      ?.inject as (sessionId: string) => { ingestUrl: (url: string) => Promise<{ name: string }> })('s1')
    // Not a parseable URL: the receipt keeps the raw string as its label.
    await expect(viewFace.ingestUrl('not-a-url')).resolves.toEqual({ name: 'not-a-url', chunks: 1 })
    await ctx.fiber.dispose()
  })
})
