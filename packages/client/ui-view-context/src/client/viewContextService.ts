/**
 * The `ctx.viewContext` service: business views register state projections
 * and action executors here; the service keeps the host's per-session view
 * cache in sync over the debounced `session.viewStateReport` uplink, and
 * automatically serves `view-action/requested` pending waits by dispatching to
 * the whitelisted executors (the question channel's automatic sibling). The
 * chat view never registers — its report is the minimal `{}` snapshot the host
 * renders as the one-line conversation-view block. Fields are
 * TypeScript-private (not `#private`): the runtime service shadow Cordis
 * hands scoped consumers is a prototype heir, which a private-field brand
 * check would reject.
 * @module @deepseek-ai/dsh-client-ui-view-context/client/viewContextService
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { PendingWait, SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ViewActionArgs } from '@deepseek-ai/dsh-view-actions/types'
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

/** One whitelisted action executor: pure view-state work returning a summary. */
export type ViewActionExecutor = (args: ViewActionArgs) => Promise<{ summary: string }> | { summary: string }

/** One view's action registration: action name to executor. */
export interface ViewActionsEntry {
  /** Conversation view id the actions belong to. */
  readonly view: string
  /** Whitelisted executors keyed by action name. */
  readonly actions: Readonly<Record<string, ViewActionExecutor>>
}

/** The active screen the conversation targets: one session, one view. */
interface ActiveView {
  readonly sessionId: SessionId
  readonly view: string
}

/** `ctx.viewContext`: provider registry, action whitelist, switch capture, and the two loops. */
export class ViewContextService extends Service {
  private readonly providers = new Map<string, ViewProviderEntry>()
  private readonly actionSets = new Map<string, Readonly<Record<string, ViewActionExecutor>>>()
  private active: ActiveView | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private liveSetView: ((view: string) => void) | undefined

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
   * Register (or replace) one view's action executors. Registration re-triggers
   * a report so the host's action catalog (which gates `view_apply`) follows.
   *
   * @param entry - view id plus the name→executor whitelist.
   * @returns Disposer removing the action set.
   */
  registerActions(entry: ViewActionsEntry): () => void {
    this.actionSets.set(entry.view, entry.actions)
    this.notify()
    return () => {
      if (this.actionSets.get(entry.view) === entry.actions) this.actionSets.delete(entry.view)
    }
  }

  /**
   * The per-view action names the next report carries (the host's gate).
   *
   * @returns registered executor names keyed by view id.
   */
  actionCatalog(): Record<string, readonly string[]> {
    const catalog: Record<string, readonly string[]> = {}
    for (const [view, actions] of this.actionSets) {
      catalog[view] = Object.keys(actions).sort()
    }
    return catalog
  }

  /**
   * Capture the session header's live view switch (the header rider publishes
   * it while mounted); `switch_view` rides it.
   *
   * @param setView - the header-owned switch, or a revoker when unmounting.
   * @returns The revoker.
   */
  publishViewSwitch(setView: (view: string) => void): () => void {
    this.liveSetView = setView
    return () => {
      if (this.liveSetView === setView) this.liveSetView = undefined
    }
  }

  /**
   * Best-effort switch to a view.
   *
   * @param view - the conversation view id to switch to.
   * @returns whether a header switch was mounted and received the request.
   */
  switchView(view: string): boolean {
    if (this.liveSetView === undefined) return false
    this.liveSetView(view)
    return true
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

  /**
   * Serve one pending view-action wait: switch to the target view when the
   * user is elsewhere, dispatch to the whitelisted executor, and answer the
   * wire with the executor's summary or a readable failure. Unknown actions
   * and unreachable switches fail loud without touching the view.
   *
   * @param wait - the runtime carrier minted from `view-action/requested`.
   */
  async serve(wait: PendingWait<'viewAction'>): Promise<void> {
    const { view, action, args } = wait.payload
    if (action === 'switch_view') {
      if (!this.switchView(view)) {
        await this.fail(wait, `无法切换视图：当前没有可用的视图切换入口（${view}）`)
        return
      }
      await this.succeed(wait, `已切换到视图 ${view}`)
      return
    }
    const executor = this.actionSets.get(view)?.[action]
    if (executor === undefined) {
      const known = this.actionSets.get(view) === undefined
        ? `视图 ${view} 未注册任何动作`
        : `视图 ${view} 的已知动作：${Object.keys(this.actionSets.get(view) as object).sort().join(', ')}`
      await this.fail(wait, `未注册的视图动作 ${action}（${known}）`)
      return
    }
    // Auto-switch first so the user sees the view the action lands in; store
    // writes do not depend on the view being mounted.
    if (this.active !== undefined && this.active.view !== view) this.switchView(view)
    try {
      const result = await executor(args)
      await this.succeed(wait, result.summary)
    } catch (error: unknown) {
      await this.fail(wait, error instanceof Error ? error.message : String(error))
    }
  }

  /** Answer one wait with the executor's summary. */
  private async succeed(wait: PendingWait<'viewAction'>, summary: string): Promise<void> {
    const receipt = await wait.respond({
      ok: true,
      value: { sessionId: wait.sessionId, summary },
    })
    if (!receipt.accepted) throw new Error(`view-action response rejected: ${receipt.reason}`)
  }

  /** Answer one wait with a readable failure the model can relay. */
  private async fail(wait: PendingWait<'viewAction'>, message: string): Promise<void> {
    const receipt = await wait.respond({
      ok: false,
      error: { code: 'view-action-failed', message, details: {} },
    })
    if (!receipt.accepted) throw new Error(`view-action response rejected: ${receipt.reason}`)
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
      actions: this.actionCatalog(),
    }).catch(() => {})
  }
}
