/**
 * Service Definition for the view-actions capability seam (`ctx.viewActions`):
 * a UI-backed service that lets an agent tool call adjust the browser
 * workbench view (filters, focus, in-view queries, tab switches) and wait for
 * the executor's summary. The model-facing tools live in
 * `@deepseek-ai/dsh-tool-view-actions`; the gateway provides the single
 * active provider (the `view-action/requested` wire channel, the question
 * channel's isomorphic sibling).
 *
 * @module @deepseek-ai/dsh-view-actions
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'

import type { ViewActionRequest, ViewActionResult } from './types.ts'

export type { ViewActionArgs, ViewActionRequest, ViewActionResult } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    viewActions: ViewActionService
  }
}

/** Full request as the service forwards it to the provider. */
export interface ViewActionApplyRequest extends ViewActionRequest {
  /** Exact live calling agent, when the request came from an agent tool call. */
  agent?: Agent
  /** Abort signal for the owning tool/step. */
  signal?: AbortSignal
}

/** UI-side provider for view actions; receives the full apply request. */
export interface ViewActionProvider {
  apply(request: ViewActionApplyRequest): Promise<ViewActionResult>
}

/** Stable error taxonomy for view-actions failures. */
export class ViewActionError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'ViewActionError'
  }
}

/** `ctx.viewActions`: one active UI provider plus an `apply()` API. */
export class ViewActionService extends Service {
  private provider: ViewActionProvider | undefined

  constructor(ctx: Context) {
    super(ctx, 'viewActions')
  }

  /**
   * Register the UI provider. Only one provider may be active in a context.
   *
   * @param provider UI-side implementation executing whitelisted actions.
   * @returns Disposer that unregisters this provider.
   */
  registerProvider(provider: ViewActionProvider): () => void {
    const dispose = this.ctx.effect(function* (this: ViewActionService) {
      if (this.provider !== undefined) {
        throw new ViewActionError('a view-actions provider is already registered', 'DUPLICATE_PROVIDER')
      }
      this.provider = provider
      yield () => {
        this.provider = undefined
      }
    }.bind(this), 'viewActions.registerProvider()')
    return () => void dispose()
  }

  /**
   * Apply one view action through the active UI provider and await its summary.
   *
   * When a caller supplies an agent, view manipulation is valid only for the
   * exact live runtime root — the same ownership boundary ask() enforces: an
   * owned child has no browser to serve it and would block until timeout,
   * while a lineage-bearing session resumed as a new runtime root may apply
   * normally.
   *
   * @param request Target view/action/args, owner agent, and abort signal.
   * @returns The executor's result summary.
   * @throws {ViewActionError} code `CALLER_NOT_LIVE` when a supplied agent is
   *   not the registry's exact live instance, `DELEGATED_CALLER` when that
   *   live agent is owned by another agent, `BAD_REQUEST_SHAPE` on empty view
   *   or action names, `NO_PROVIDER` before any provider registers, or
   *   `APPLY_ABORTED` when the owning signal fires first.
   */
  async apply(request: ViewActionApplyRequest): Promise<ViewActionResult> {
    if (request.signal?.aborted) {
      throw new ViewActionError('view_apply was aborted before the browser executed it', 'APPLY_ABORTED')
    }
    const agent = request.agent
    if (agent !== undefined) {
      const agents = this.ctx.get('agents')
      if (agents === undefined || agents.get(agent.id) !== agent) {
        throw new ViewActionError(
          'view manipulation requires the exact live calling agent when an agent is supplied',
          'CALLER_NOT_LIVE')
      }
      if (!agents.roots().includes(agent)) {
        throw new ViewActionError(
          'view manipulation is unavailable while the calling agent is owned by another live agent; '
          + 'describe the intended view change in the child result instead',
          'DELEGATED_CALLER')
      }
    }
    if (request.view === '' || request.action === '') {
      throw new ViewActionError('view and action must be non-empty', 'BAD_REQUEST_SHAPE')
    }
    if (this.provider === undefined) {
      throw new ViewActionError('no view-actions provider is registered', 'NO_PROVIDER')
    }
    return this.provider.apply(request)
  }
}

export default ViewActionService
