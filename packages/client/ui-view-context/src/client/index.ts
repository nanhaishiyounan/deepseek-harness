/**
 * View-context surface plugin, browser half: publishes `ctx.viewContext`
 * (provider registry, action whitelist, switch capture, the debounced
 * `session.viewStateReport` loop) so business view packages can project their
 * tab state into the model's per-request workbench snapshot and register the
 * whitelisted executors the automatic view-action loop dispatches to. Also
 * claims the three view-tool toolview rows and captures the header's view
 * switch. A deployment without the host view-context plugin simply leaves the
 * reports refused (view-state-unavailable) and harmless.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation slot declaration the header rider rides.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ui-tool toolview hole this package claims.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { ViewContextService } from './viewContextService.ts'
import { ViewSwitchCapture } from './ViewSwitchCapture.tsx'
import { ViewToolRow } from './ViewToolRow.tsx'
import { en, zh, type ViewContextKey } from './locales.ts'

export { ViewContextService } from './viewContextService.ts'
export type { ViewActionExecutor, ViewActionsEntry, ViewProviderEntry } from './viewContextService.ts'
export type { ViewSwitchCaptureInjected, ViewSwitchCaptureProps } from './ViewSwitchCapture.tsx'
export type { ViewToolRowProps } from './ViewToolRow.tsx'
export { viewToolRowModel, type ViewToolRowModel, type ViewToolRowState } from './viewToolModel.ts'
export type { ViewContextKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Business-view state providers, the action whitelist, and the report loop. */
    viewContext: ViewContextService
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The view-context surfaces' copy. */
    viewContext: ViewContextKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'viewContext'

/** Required services: the slot registry, the locale dictionaries, the connection api, and the sessions runtime. */
export const inject = ['slots', 'locale', 'connection', 'sessions']

/**
 * Mount the view-context service and its seats for the lifetime of `ctx`.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const api = (ctx.get('connection') as ConnectionHandle).api
  const viewContext = new ViewContextService(ctx, api)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-view-context: dictionaries')

  // The automatic view-action loop: serve every pending view-action wait of
  // the current session as it appears. The effect owns the per-session
  // subscription; a session switch re-subscribes through the list store.
  const served = new Set<string>()
  ctx.effect(() => {
    const sessions = ctx.sessions
    let unsubscribeSession: (() => void) | undefined
    let lastCurrent: SessionId | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const clearRetry = (): void => {
      if (retryTimer !== undefined) clearTimeout(retryTimer)
      retryTimer = undefined
    }
    const bind = (sessionId: SessionId, attempt: number): void => {
      /* v8 ignore next 1 -- defensive: the only re-entry is the retry timer,
       * and trackSession clears that timer before changing lastCurrent, so a
       * stale session id can never reach this comparison. */
      if (sessionId !== lastCurrent) return
      const binding = sessions.binding(sessionId)
      if (binding === undefined) {
        // A just-created session may not have its scope record yet; the list
        // store emits no event for scope creation, so retry on a bounded
        // backoff until the binding appears (the current session is where
        // view-action frames land).
        if (attempt >= 20) return
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          bind(sessionId, attempt + 1)
        }, 500)
        return
      }
      const drain = (): void => {
        for (const wait of binding.session.getSnapshot().pending) {
          if (wait.kind !== 'viewAction' || served.has(wait.key)) continue
          served.add(wait.key)
          // Serve asynchronously: the executor may await api calls, and the
          // drain must not block the snapshot read. The key frees when the
          // promise settles, so a later frame with the same identity re-serves.
          void viewContext.serve(wait).finally(() => { served.delete(wait.key) })
        }
      }
      drain()
      unsubscribeSession = binding.session.subscribe(drain)
    }
    const trackSession = (sessionId: SessionId | undefined): void => {
      if (sessionId === undefined) return
      if (sessionId === lastCurrent) return
      lastCurrent = sessionId
      unsubscribeSession?.()
      unsubscribeSession = undefined
      clearRetry()
      bind(sessionId, 0)
    }
    const unsubscribeList = sessions.list.subscribe(() => {
      trackSession(sessions.list.getSnapshot().current)
    })
    trackSession(sessions.list.getSnapshot().current)
    return () => {
      unsubscribeList()
      unsubscribeSession?.()
      clearRetry()
    }
  }, 'ui-view-context: view-action executor loop')

  // The invisible header rider capturing the session's view switch.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'view-context',
    order: 0.5,
    locale: NS,
    inject: () => ({
      publishViewSwitch: (setView: (view: string) => void) => viewContext.publishViewSwitch(setView),
    }),
  }, ViewSwitchCapture))

  // The three view-tool rows (generic render intent lives in the tool
  // definitions; the rows add the shared summary chrome).
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'switch_view', locale: NS }, ViewToolRow)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'view_apply', locale: NS }, ViewToolRow)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'view_state_get', locale: NS }, ViewToolRow)
  })
}
