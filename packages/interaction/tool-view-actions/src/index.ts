/**
 * Model-facing Consumer of the `ctx.viewActions` capability seam plus the
 * `ctx.viewState` cache: three tools that let the model drive the browser
 * workbench — `switch_view` (change the active tab), `view_apply` (run one
 * whitelisted action inside a view), and `view_state_get` (read the current
 * cached view state). View manipulation is reversible UI state: these tools
 * carry no approval; destructive data writes stay on the nb_* confirmation
 * contract.
 *
 * @module @deepseek-ai/dsh-tool-view-actions
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import '@deepseek-ai/dsh-view-actions'
import '@deepseek-ai/dsh-view-context'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'

export const name = 'tool-view-actions'
export const inject = ['tools', 'viewActions', 'viewState']

/** The workbench tabs this deployment exposes, in navigation order. */
const VIEW_IDS = ['chat', 'kb', 'scenarios', 'market', 'connectors', 'kg', 'business'] as const

/** One known view id or a fail-loud error naming the supported set. */
function requireViewId(view: string): string {
  if ((VIEW_IDS as readonly string[]).includes(view)) return view
  throw new Error(`view tools: unknown view "${view}" (known: ${VIEW_IDS.join(', ')})`)
}

/** The view-tools output contract: one model-readable summary line. */
const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { summary: { type: 'string' } },
  },
  render: (_args: unknown, value: { summary: string }) => [{ type: 'text' as const, text: value.summary }],
} as const

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'switch_view',
    description: 'Switch the user\'s workbench to another tab. '
      + 'Use it when the user asks to go to or look at another view, and before running view actions on a view the user is not looking at.',
    parameters: {
      view: {
        type: 'string',
        required: true,
        description: `Target tab id: ${VIEW_IDS.join(', ')}.`,
      },
    },
    output: OUTPUT,
    async execute(args, exec) {
      const result = await ctx.viewActions.apply({
        view: requireViewId(args.view),
        action: 'switch_view',
        args: {},
        ...exec.agent !== undefined ? { agent: exec.agent } : {},
        signal: exec.signal,
      })
      return { summary: result.summary }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'view_apply',
    description: 'Run one whitelisted action inside a workbench view and await the resulting view-state summary. '
      + 'Known actions: kg set_type_filter/focus_entity/clear_selection/run_phrase_query; '
      + 'market select_asset/filter_category; business select_collection/set_table_filter. '
      + 'Repeat calls with the same arguments are idempotent. When the browser is unreachable the call fails with a readable error — answer from conversation context instead.',
    parameters: {
      view: {
        type: 'string',
        required: true,
        description: `View id the action targets: ${VIEW_IDS.join(', ')}.`,
      },
      action: {
        type: 'string',
        required: true,
        description: 'Registered action name within that view (see the tool description for the known list).',
      },
      args: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: 'Action arguments, e.g. {"types":["Supplier"]} for kg set_type_filter, '
          + '{"entity":"海天味业"} for focus_entity, {"phrase":"供应酱油原料的供应商"} for run_phrase_query.',
      },
    },
    output: OUTPUT,
    async execute(args, exec) {
      const result = await ctx.viewActions.apply({
        view: requireViewId(args.view),
        action: args.action,
        args: args.args,
        ...exec.agent !== undefined ? { agent: exec.agent } : {},
        signal: exec.signal,
      })
      return { summary: result.summary }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'view_state_get',
    description: 'Read the cached state of the user\'s current workbench view: tab id, display label, state fields, '
      + 'and the registered action names. Use it when the injected 【当前工作台视图】 snapshot is not enough '
      + 'and you need the full view state before answering or acting.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          view: { type: 'string' },
          label: { type: 'string' },
          snapshot: { type: 'object', additionalProperties: true },
          actions: { type: 'object', additionalProperties: true },
          stale: { type: 'boolean' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(_args, exec) {
      const entry = exec.agent === undefined ? undefined : ctx.viewState.read(exec.agent.id)
      if (entry === undefined) return Promise.resolve({ view: 'chat', snapshot: {}, actions: {}, stale: true })
      return Promise.resolve({
        view: entry.view,
        ...entry.label === undefined ? {} : { label: entry.label },
        snapshot: entry.snapshot as Record<string, JsonValue>,
        actions: entry.actions as unknown as Record<string, JsonValue>,
        stale: Date.now() - entry.reportedAt > 5 * 60_000,
      })
    },
  }))
}
