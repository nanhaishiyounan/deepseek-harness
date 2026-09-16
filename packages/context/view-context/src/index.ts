/**
 * Tab-aware workbench view context: a per-session in-memory view-state cache
 * (`ctx.viewState`, written by the gateway's `session.viewStateReport` RPC)
 * plus a durable per-step snapshot injection over `agent/pre-step` (the
 * time-context skeleton). View state is the user's screen, not conversation
 * history — the cache never touches the session log; model-visible⟺logged is
 * satisfied by the injected snapshot message itself being durable.
 *
 * @module @deepseek-ai/dsh-view-context
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { renderViewContextBlock } from './render.ts'
import type { ViewReport, ViewStateEntry } from './types.ts'

export type { ViewActionCatalog, ViewReport, ViewSnapshot, ViewSnapshotValue, ViewStateEntry } from './types.ts'
export { formatViewSnapshotValue, renderViewContextBlock } from './render.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    viewState: ViewStateService
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'view-context'

/** The agent registry that owns pre-step processing. */
export const inject = ['agents']

/** Upper bound on one report's serialized snapshot JSON size. */
export const MAX_REPORT_JSON_BYTES = 4096

/** Snapshot injection and cache retention configuration. Invalid values fail plugin load. */
export interface Config {
  /**
   * Whether to inject the workbench-view block at all. Omit or set to true to inject.
   */
  enabled?: boolean
  /**
   * Drop cached view states older than this many milliseconds so a stale screen never
   * outlives its session's usefulness. Zero or omission keeps entries until `clear`.
   */
  maxAgeMs?: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  enabled: z.boolean(),
  maxAgeMs: z.number(),
})

/** Validate a serialized report against the wire bound. */
function validateReportSize(snapshotJson: string): void {
  if (snapshotJson.length > MAX_REPORT_JSON_BYTES) {
    throw new TypeError(
      `view-context: snapshot JSON exceeds ${String(MAX_REPORT_JSON_BYTES)} bytes (got ${String(snapshotJson.length)})`,
    )
  }
}

/**
 * `ctx.viewState`: per-session latest view-state cache (screen state, never
 * logged). Fields are TypeScript-private (not `#private`): the runtime
 * service shadow Cordis hands scoped consumers is a prototype heir, which a
 * private-field brand check would reject.
 */
export class ViewStateService extends Service {
  private readonly entries = new Map<SessionId, ViewStateEntry>()

  constructor(ctx: Context) {
    super(ctx, 'viewState')
  }

  /**
   * Cache one session's latest view report, replacing any prior entry.
   *
   * @param sessionId - the session whose screen the report describes.
   * @param report - the browser's report (view, projection, action catalog).
   * @throws when the view id is empty or the serialized snapshot exceeds the wire bound.
   */
  report(sessionId: SessionId, report: ViewReport): void {
    if (report.view === '') {
      throw new TypeError('view-context: report view id must be non-empty')
    }
    validateReportSize(JSON.stringify(report.snapshot))
    this.entries.set(sessionId, { ...report, reportedAt: Date.now() })
  }

  /**
   * Read a session's cached view state under the age bound.
   *
   * @param sessionId - the session to read.
   * @param maxAgeMs - when positive, entries older than this are treated as absent.
   * @returns the cached entry, or undefined when absent or expired.
   */
  read(sessionId: SessionId, maxAgeMs = 0): ViewStateEntry | undefined {
    const entry = this.entries.get(sessionId)
    if (entry === undefined) return undefined
    if (maxAgeMs > 0 && Date.now() - entry.reportedAt > maxAgeMs) return undefined
    return entry
  }

  /**
   * Drop one session's cached view state.
   *
   * @param sessionId - the session being removed.
   */
  clear(sessionId: SessionId): void {
    this.entries.delete(sessionId)
  }

  /** Drop every cached view state (plugin teardown). */
  clearAll(): void {
    this.entries.clear()
  }
}

/** Find this plugin's latest durable injection text, if any. */
function latestInjectionText(agent: Agent): string | undefined {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === name
      && event.data.source.form === 'snapshot') {
      return event.data.source.sections[0]?.text
    }
  }
  return undefined
}

/** Static prompt-context text describing the view-tool vocabulary (pairs with the per-request snapshot). */
const VIEW_TOOLS_PROMPT_CONTEXT = [
  'Workbench views: the user may switch the browser workbench tab while chatting.',
  'Each request carries a 【当前工作台视图】snapshot of the active tab; treat the user\'s messages as targeting that view.',
  'To change what the view shows (filters, focus, in-view queries) or to switch tabs,',
  'call the view tools (switch_view, view_apply, view_state_get) instead of asking the user to operate the UI by hand.',
  'When the browser is unreachable the view tools fail with a readable error; answer from conversation context instead.',
].join(' ')

/**
 * Mount the view-state cache and the durable snapshot injection.
 *
 * @param ctx - plugin context; listeners and the service are disposed with it.
 * @param config - injection toggle and cache retention bound.
 */
export function apply(ctx: Context, config: Config): void {
  const enabled = config.enabled !== false
  const maxAgeMs = config.maxAgeMs ?? 0
  const viewState = new ViewStateService(ctx)
  ctx.effect(() => () => { viewState.clearAll() }, 'view-context: cache teardown')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    ctx.effect(() => systemPrompt.context({
      name: 'view-context:tools',
      order: 130,
      text: VIEW_TOOLS_PROMPT_CONTEXT,
    }), 'view-context: prompt context')
  }

  if (!enabled) return

  ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const entry = viewState.read(agent.id, maxAgeMs)
    const text = renderViewContextBlock(entry)
    if (latestInjectionText(agent) === text) return decision
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name: 'workbench-view', text }] },
        }),
      ],
    }
  }, { prepend: true })
}
