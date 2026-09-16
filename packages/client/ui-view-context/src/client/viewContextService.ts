/**
 * The `ctx.viewContext` service: business views register state projections,
 * and the service keeps the host's per-session view cache in sync over the
 * `session.viewStateReport` RPC (debounced). The chat view never registers —
 * its report is the minimal `{}` snapshot the host renders as the one-line
 * conversation-view block. Fields are TypeScript-private (not `#private`):
 * the runtime service shadow Cordis hands scoped consumers is a prototype
 * heir, which a private-field brand check would reject.
 * @module @deepseek-ai/dsh-client-ui-view-context/client/viewContextService
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ViewSnapshot } from '@deepseek-ai/dsh-view-context/types'

/** Debounce window for view-state reports. */
const REPORT_DEBOUNCE_MS = 500

/** One business view's registration: identity plus state projection. */
export interface ViewProviderEntry {
  /** Conversation view id this provider projects (`conversation.view` entry id). */
  readonly view: string
  /** Optional display label thunk rendered into the injected block (locale-following). */
  readonly label?: () => string
  /** Flat projection of the view's current state (Set fields become arrays). */
  readonly snapshot: () => ViewSnapshot
  /** Optional store whose changes re-trigger the debounced report. */
  readonly changes?: SnapshotStore<unknown> | undefined
}

/** The active screen the conversation targets: one session, one view. */
interface ActiveView {
  readonly sessionId: SessionId
  readonly view: string
}

/** `ctx.viewContext`: provider registry plus the debounced report loop. */
export class ViewContextService extends Service {
  private readonly providers = new Map<string, ViewProviderEntry>()
  private active: ActiveView | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param ctx - the client root context; the service registers as `viewContext`.
   * @param api - the shared connection api client carrying the report RPC.
   */
  constructor(ctx: Context, api: ConnectionHandle['api']) {
    super(ctx, 'viewContext')
    this.reportApi = api
  }

  private readonly reportApi: ConnectionHandle['api']

  /**
   * Register (or replace) one view's state provider.
   *
   * @param entry - view identity, projection, and optional change source.
   * @returns Disposer removing the provider.
   */
  provide(entry: ViewProviderEntry): () => void {
    this.providers.set(entry.view, entry)
    const unsubscribe = entry.changes?.subscribe(() => { this.notify() })
    this.notify()
    return () => {
      if (this.providers.get(entry.view) === entry) this.providers.delete(entry.view)
      unsubscribe?.()
    }
  }

  /**
   * Publish the current screen from the session body's own view resolution
   * (`reportActiveView` on the conversation.session slot contract); schedules
   * a report so the host cache follows tab switches.
   *
   * @param sessionId - the session whose body resolved the view.
   * @param view - the resolved conversation view id.
   */
  reportActiveView(sessionId: SessionId, view: string): void {
    this.active = { sessionId, view }
    this.notify()
  }

  /** Schedule a debounced report of the active view's current state. */
  notify(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.flush()
    }, REPORT_DEBOUNCE_MS)
  }

  /** Read the current provider's projection; `{}` for chat and unknown views. */
  private snapshotOf(view: string): { label?: string; snapshot: ViewSnapshot } {
    const provider = this.providers.get(view)
    if (provider === undefined) return { snapshot: {} }
    return {
      ...provider.label === undefined ? {} : { label: provider.label() },
      snapshot: provider.snapshot(),
    }
  }

  /** Send one report for the active screen (transport failures await the next notify). */
  private flush(): void {
    const active = this.active
    if (active === undefined) return
    const { label, snapshot } = this.snapshotOf(active.view)
    // Swallows transport/carrier failures only: the report is a best-effort
    // uplink whose retry is the next notify() (tab switch or store change);
    // nothing else can reach this catch because viewStateReport itself
    // resolves business refusals into a normal RpcResponse.
    void this.reportApi.sessions.viewStateReport({
      sessionId: active.sessionId,
      view: active.view,
      ...label === undefined ? {} : { label },
      snapshot,
      actions: {},
    }).catch(() => {})
  }
}
