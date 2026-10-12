/**
 * Governance panel surface plugin, browser half: the sidebar first-class
 * entry and the `governance` conversation view (four tabs — catalog with
 * cross-source search, lineage edges, quality rules with run-evaluation,
 * alert events with the webhook test). All data rides the connection's
 * `api.governance` face; a deployment without the engine shows the
 * structured refusal inline.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-nav slot declaration the menu row rides.
import type {} from '@deepseek-ai/dsh-client-ui-nav/client'
// Type-only: pulls the ui-conversation slot declarations (the view ring).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createGovernanceClientStore } from './governanceStore.ts'
import { GovernanceEntry } from './GovernanceEntry.tsx'
import { GovernanceView } from './GovernanceView.tsx'
import { en, zh } from './locales.ts'
import type { GovernanceKey } from './locales.ts'

export type { GovernanceEntryInjected, GovernanceEntryProps } from './GovernanceEntry.tsx'
export type { GovernanceViewInjected, GovernanceViewProps } from './GovernanceView.tsx'
export type {
  GovernanceAssetRow, GovernanceClientState, GovernanceClientStore, GovernanceEdgeRow,
  GovernanceEventRow, GovernanceOutcomeRow, GovernanceRuleRow,
} from './governanceStore.ts'
export type { GovernanceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The governance panel's copy. */
    governance: GovernanceKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'governance'

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

interface GovernanceAssetWire {
  readonly source: string
  readonly qualified_name: string
  readonly name: string
  readonly count?: number
  readonly detail?: string
}
interface GovernanceEdgeWire {
  readonly source: string
  readonly target: string
  readonly transform: string
  readonly recorded_at: string
}
type RuleKindWire = 'row_count_threshold' | 'null_rate' | 'uniqueness' | 'freshness' | 'custom_sql'
interface GovernanceRuleWire {
  readonly id: string
  readonly name: string
  readonly kind: RuleKindWire
  readonly table: string
  readonly column?: string
  readonly threshold?: number
  readonly sql?: string
  readonly enabled: boolean
}
interface GovernanceEventWire {
  readonly id: number
  readonly at: string
  readonly kind: string
  readonly level: 'info' | 'warning' | 'critical'
  readonly title: string
  readonly detail?: string
}

/**
 * Client plugin body: register the dictionaries and the panel's seats over
 * one shared client-session store.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-governance: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createGovernanceClientStore()
  const bound = ctx.locale.bind(NS)

  /** Load or reload the inventory cache. */
  const refresh = (): void => {
    if (store.store.getSnapshot().assets?.status === 'loading') return
    store.beginAssets()
    api.governance.inventory({}).then((response) => {
      const value = unwrap<{ assets: readonly GovernanceAssetWire[] }>(response)
      store.setAssets(value.assets.map(row => ({
        source: row.source,
        qualifiedName: row.qualified_name,
        name: row.name,
        count: row.count,
        detail: row.detail,
      })))
    }).catch((error: unknown) => { store.failAssets(messageOf(error)) })
  }

  /** Load or reload the lineage edges. */
  const refreshLineage = (): void => {
    if (store.store.getSnapshot().edges?.status === 'loading') return
    store.beginEdges()
    api.governance.lineage({}).then((response) => {
      const value = unwrap<{ edges: readonly GovernanceEdgeWire[] }>(response)
      store.setEdges(value.edges.map(row => ({
        source: row.source, target: row.target, transform: row.transform, recordedAt: row.recorded_at,
      })))
    }).catch((error: unknown) => { store.failEdges(messageOf(error)) })
  }

  /** Load or reload the quality rules. */
  const refreshRules = (): void => {
    if (store.store.getSnapshot().rules?.status === 'loading') return
    store.beginRules()
    api.governance.rules({}).then((response) => {
      const value = unwrap<{ rules: readonly GovernanceRuleWire[] }>(response)
      store.setRules(value.rules.map(row => ({
        id: row.id, name: row.name, kind: row.kind, table: row.table,
        column: row.column, threshold: row.threshold, sql: row.sql, enabled: row.enabled,
      })))
    }).catch((error: unknown) => { store.failRules(messageOf(error)) })
  }

  /** Load or reload the alert events. */
  const refreshEvents = (): void => {
    if (store.store.getSnapshot().events?.status === 'loading') return
    store.beginEvents()
    api.governance.events({}).then((response) => {
      const value = unwrap<{ events: readonly GovernanceEventWire[] }>(response)
      store.setEvents(value.events.map(row => ({
        id: row.id, at: row.at, kind: row.kind, level: row.level, title: row.title, detail: row.detail,
      })))
    }).catch((error: unknown) => { store.failEvents(messageOf(error)) })
  }

  /** Run the quality evaluation; failures land in the panel, events reload. */
  const runEvaluation = (): void => {
    if (store.store.getSnapshot().evaluating) return
    store.beginEvaluate()
    api.governance.evaluate({}).then((response) => {
      const value = unwrap<{
        evaluated_at: string
        outcomes: readonly { rule: GovernanceRuleWire; status: 'pass' | 'fail'; measured: number | null; error?: string }[]
      }>(response)
      store.setEvaluation(value.outcomes.map(row => ({
        ruleId: row.rule.id, ruleName: row.rule.name, status: row.status, measured: row.measured, error: row.error,
      })), value.evaluated_at)
      refreshEvents()
    }).catch((error: unknown) => { store.failEvaluate(messageOf(error)) })
  }

  /** Fire the webhook test event, then reload the events list. */
  const testWebhook = (): void => {
    void api.governance.webhookTest({}).then(() => { refreshEvents() }).catch(() => { refreshEvents() })
  }

  /** Update the catalog search query (the view's input box). */
  const setSearch = (query: string): void => {
    store.setSearchQuery(query)
  }

  // Main-nav menu row: the shared inject hands the row the activation
  // channel, so only data hooks stay here.
  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'governance',
    order: 12.6,
    locale: NS,
    inject: () => ({
      hooks: { governance: store.store },
      refresh,
    }),
  }, GovernanceEntry))

  // Conversation view tab: the same store serves the panel page.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'governance',
    order: 12.6,
    locale: NS,
    label: () => bound('view.governance'),
    inject: () => ({
      hooks: { governance: store.store },
      refresh,
      refreshLineage,
      refreshRules,
      refreshEvents,
      runEvaluation,
      testWebhook,
      setSearch,
    }),
  }, GovernanceView))
}
