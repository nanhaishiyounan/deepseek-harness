/**
 * Knowledge-base workbench surface plugin, browser half: the sidebar
 * first-class entry, the blank-session portal (hero headline seat plus the
 * input-dock portal), the `kb` conversation view tab (search, documents,
 * usage), the session-header switch button, the four kb_* toolview rows, and
 * the knowledge-base settings section. All data rides the connection's
 * `api.kb` face (plus `agentPresets` and `host.listDirectory` for the portal
 * scenarios and the ingest wizard); a deployment without the kb capability
 * shows the structured refusal inline.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar slot declaration the entry rides.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the ui-conversation slot declarations (headline, dock,
// view ring, header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ui-tool keyed toolview declaration the kb rows ride.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the ui-settings section declaration the settings page rides.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbHitState, KbSearchState, KbStatsState } from './KbTypes.ts'
import { createKbClientStore, createKbViewBridge } from './kbStore.ts'
import { documentLabelOf } from './workbench/source.ts'
import type { IngestReceipt } from './workbench/KbIngestDialog.tsx'
import { KbEntry } from './KbEntry.tsx'
import { KbHeaderButton } from './KbHeaderButton.tsx'
import { KbSettingsSection } from './KbSettingsSection.tsx'
import { KbHeroDock } from './hero/KbHeroDock.tsx'
import { KbHeroHeadline } from './hero/KbHeroHeadline.tsx'
import { KbToolRow } from './toolviews/KbToolRow.tsx'
import { KbWorkbench } from './workbench/KbWorkbench.tsx'
import { en, zh } from './locales.ts'
import type { KbKey } from './locales.ts'

export type {
  KbEntryInjected, KbEntryProps,
} from './KbEntry.tsx'
export type {
  KbHeaderButtonInjected, KbHeaderButtonProps,
} from './KbHeaderButton.tsx'
export type { KbSettingsSectionInjected, KbSettingsSectionProps } from './KbSettingsSection.tsx'
export type { KbToolRowProps } from './toolviews/KbToolRow.tsx'
export type {
  KbCitation, KbIngestRowModel, KbSearchRowModel, KbStatsRowModel,
  KbToolRowState, KbUsageFigures,
} from './toolviews/kb-tool-model.ts'
export { parseCitations, resultTextOf } from './toolviews/kb-tool-model.ts'
export type {
  KbHeroDockInjected, KbHeroDockProps,
} from './hero/KbHeroDock.tsx'
export type { KbHeroHeadlineProps } from './hero/KbHeroHeadline.tsx'
export type { KbWorkbenchInjected, KbWorkbenchProps } from './workbench/KbWorkbench.tsx'
export type { IngestReceipt } from './workbench/KbIngestDialog.tsx'
export type {
  KbClientState, KbClientStore, KbDocumentRecord, KbStatsCache, KbUsageSnapshot, KbViewBridge,
} from './kbStore.ts'
export type {
  KbHitState, KbIngestState, KbSearchState, KbStatsState,
} from './KbTypes.ts'
export type { KbScenario, KbScenarioCategory } from './hero/scenarios.ts'
export type { KbKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The KB workbench's copy. */
    kb: KbKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'kb'

/** Required services: the slot registry, the locale dictionaries, and the connection's api face. */
export const inject = ['slots', 'locale', 'connection']

/** Unwrap a unary response or rethrow its error text (the inline failure path). */
function unwrap<T>(response: { result: { ok: true; value: T } | { ok: false; error: { message: string } } }): T {
  if (response.result.ok) return response.result.value
  throw new Error(response.result.error.message)
}

/** Failure text for any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Encode one browser file's bytes as canonical base64 for the `kb.upload`
 * wire. Chunked through a binary string: `String.fromCharCode` spread is
 * capped near the argument limit, and one giant template would double the
 * peak memory for multi-megabyte files.
 * @param bytes - the file's contents.
 * @returns the base64 text.
 */
function base64Of(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

/**
 * Client plugin body: register the dictionaries and the five workbench seats
 * over one shared client-session store and one view bridge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-kb: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createKbClientStore()
  const bridge = createKbViewBridge()
  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration.
  const bound = ctx.locale.bind(NS)
  const language = (): 'zh' | 'en' => ctx.locale.getLocale().active

  /** Load or reload the shared stats cache (a no-op while one load is in flight). */
  const refresh = (): (void) => {
    if (store.store.getSnapshot().stats?.status === 'loading') return
    store.beginStats()
    api.kb.stats({}).then((response) => {
      const value = unwrap<KbStatsState>(response)
      store.setStats({
        documents: value.documents,
        searches: value.usage.searches,
        ingestedDocuments: value.usage.ingested_documents,
      })
    }).catch((error: unknown) => {
      store.failStats(messageOf(error))
    })
  }

  /** Record one completed ingest and refresh the counters. */
  const noteIngested = (receipt: IngestReceipt, path: string): (void) => {
    store.noteIngested({ name: receipt.name, path, chunks: receipt.chunks })
    refresh()
  }

  /** The host process cwd (the ingest path currency is cwd-relative); cached after the first browse. */
  let hostCwd: string | undefined
  const relativeDirectory = async (directory: string): Promise<string> => {
    if (hostCwd === undefined) {
      hostCwd = unwrap(await api.host.describe({})).cwd
    }
    return directory.startsWith(`${hostCwd}/`) ? directory.slice(hostCwd.length + 1) : directory
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kb',
    order: 5,
    locale: NS,
    inject: () => ({
      hooks: { kb: store.store },
      refresh,
      requestKbView: () => { bridge.request('kb') },
    }),
  }, KbEntry))

  ctx.slots.inject('conversation.hero.headline', () => ctx.slots.register({
    name: 'conversation.hero.headline',
    locale: NS,
  }, KbHeroHeadline))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'kb-portal',
    order: 5,
    locale: NS,
    inject: (sessionId: string) => ({
      hooks: { kb: store.store, workbench: bridge.workbench },
      refresh,
      language,
      selectScenario: (scenarioId: string) => api.agentPresets.select({
        sessionId: sessionId as never,
        agentPreset: scenarioId,
      }).then((response) => {
        if (!response.result.ok) throw new Error(response.result.error.message)
      }),
    }),
  }, KbHeroDock))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'kb',
    order: 10,
    locale: NS,
    label: () => bound('view.kb'),
    inject: () => ({
      hooks: { kb: store.store },
      settleWorkbench: (mounted: boolean) => { bridge.workbench.set(mounted) },
      refresh,
      language,
      requestView: (view: string) => { bridge.request(view) },
      search: (query: string) => api.kb.search({ query }).then(response => unwrap<KbSearchState>(response)),
      noteSearched: (hits: readonly KbHitState[]) => {
        store.noteSearched(hits.map(hit => hit.source_path), documentLabelOf)
      },
      uploadFile: (file: File) => file.arrayBuffer().then(buffer =>
        api.kb.upload({ filename: file.name, data: base64Of(new Uint8Array(buffer)) }).then((response) => {
          const value = unwrap(response)
          noteIngested({ name: file.name, chunks: value.chunks }, `workspace/data/uploads/${file.name}`)
          return { name: file.name, chunks: value.chunks } satisfies IngestReceipt
        })),
      ingestFile: (directory: string, fileName: string) =>
        relativeDirectory(directory).then(path =>
          api.kb.ingest({ path: `${path}/${fileName}` }).then((response) => {
            const value = unwrap(response)
            noteIngested({ name: fileName, chunks: value.chunks }, `${path}/${fileName}`)
            return { name: fileName, chunks: value.chunks } satisfies IngestReceipt
          })),
      ingestUrl: (url: string) => api.kb.ingestUrl({ url }).then((response) => {
        const value = unwrap(response)
        let host = url
        try {
          host = new URL(url).host
        } catch {
          // The gateway already accepted the URL; its raw form is the best label.
        }
        noteIngested({ name: host, chunks: value.chunks }, url)
        return { name: host, chunks: value.chunks } satisfies IngestReceipt
      }),
      listDirectory: (path?: string) =>
        api.host.listDirectory(path === undefined ? {} : { path }).then(response => unwrap<DirectoryListing>(response)),
    }),
  }, KbWorkbench))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'kb',
    order: 10,
    locale: NS,
    inject: () => ({
      hooks: { kb: store.store },
      publishViewSwitch: (setView: (view: string) => void) => bridge.provide(setView),
    }),
  }, KbHeaderButton))

  // One row component owns all four knowledge-base tool names' keyed holes.
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'kb_search', locale: NS }, KbToolRow)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'kb_ingest', locale: NS }, KbToolRow)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'kb_ingest_url', locale: NS }, KbToolRow)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'kb_stats', locale: NS }, KbToolRow)
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'kb',
    order: 20,
    label: () => bound('settings.nav'),
    locale: NS,
    inject: () => ({
      hooks: { kb: store.store },
      refresh,
    }),
  }, KbSettingsSection))
}
