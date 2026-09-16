/**
 * View-context surface plugin, browser half: publishes `ctx.viewContext`
 * (provider registry plus the debounced `session.viewStateReport` loop) so
 * business view packages can project their tab state into the model's
 * per-request workbench snapshot. The chat view registers nothing; a
 * deployment without the host view-context plugin simply leaves the reports
 * refused (view-state-unavailable) and harmless.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { ViewContextService } from './viewContextService.ts'

export { ViewContextService } from './viewContextService.ts'
export type { ViewProviderEntry } from './viewContextService.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Business-view state providers plus the debounced report loop. */
    viewContext: ViewContextService
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ui-view-context'

/** Required services: the wire client carrying the report RPC. */
export const inject = ['connection']

/**
 * Mount the view-context service for the lifetime of `ctx`.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const api = (ctx.get('connection') as ConnectionHandle).api
  new ViewContextService(ctx, api)
}
