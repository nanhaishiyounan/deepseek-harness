/**
 * Shared client-session store for the governance panel: the cross-source
 * inventory cache, the search query, the lineage edges, the quality rules
 * with the latest evaluation, and the alert events. One store instance
 * serves the nav row and the conversation view.
 * @module @deepseek-ai/dsh-client-ui-governance/client/governanceStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** One inventory asset row. */
export interface GovernanceAssetRow {
  readonly source: string
  readonly qualifiedName: string
  readonly name: string
  readonly count: number | undefined
  readonly detail: string | undefined
}

/** One lineage edge row. */
export interface GovernanceEdgeRow {
  readonly source: string
  readonly target: string
  readonly transform: string
  readonly recordedAt: string
}

/** One quality rule row. */
export interface GovernanceRuleRow {
  readonly id: string
  readonly name: string
  readonly kind: 'row_count_threshold' | 'null_rate' | 'uniqueness' | 'freshness' | 'custom_sql'
  readonly table: string
  readonly column: string | undefined
  readonly threshold: number | undefined
  readonly sql: string | undefined
  readonly enabled: boolean
}

/** One rule outcome in an evaluation run. */
export interface GovernanceOutcomeRow {
  readonly ruleId: string
  readonly ruleName: string
  readonly status: 'pass' | 'fail'
  readonly measured: number | null
  readonly error: string | undefined
}

/** One alert event row. */
export interface GovernanceEventRow {
  readonly id: number
  readonly at: string
  readonly kind: string
  readonly level: 'info' | 'warning' | 'critical'
  readonly title: string
  readonly detail: string | undefined
}

/** Loading-or-settled wrapper. */
type Phase<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string }

/** The full panel state. */
export interface GovernanceClientState {
  readonly assets: Phase<readonly GovernanceAssetRow[]> | undefined
  readonly searchQuery: string
  readonly edges: Phase<readonly GovernanceEdgeRow[]> | undefined
  readonly rules: Phase<readonly GovernanceRuleRow[]> | undefined
  readonly events: Phase<readonly GovernanceEventRow[]> | undefined
  readonly evaluation: readonly GovernanceOutcomeRow[] | undefined
  readonly evaluationAt: string | undefined
  readonly evaluating: boolean
  readonly evaluatingError: string | undefined
}

/** The store handle bound by the renderer into props hooks. */
export interface GovernanceClientStore {
  readonly store: SnapshotStore<GovernanceClientState>
  beginAssets(): void
  setAssets(rows: readonly GovernanceAssetRow[]): void
  failAssets(message: string): void
  setSearchQuery(query: string): void
  beginEdges(): void
  setEdges(rows: readonly GovernanceEdgeRow[]): void
  failEdges(message: string): void
  beginRules(): void
  setRules(rows: readonly GovernanceRuleRow[]): void
  failRules(message: string): void
  beginEvents(): void
  setEvents(rows: readonly GovernanceEventRow[]): void
  failEvents(message: string): void
  beginEvaluate(): void
  setEvaluation(outcomes: readonly GovernanceOutcomeRow[], at: string): void
  failEvaluate(message: string): void
}

/**
 * Create one shared store (the plugin registers it once per session).
 * @returns the shared governance client store.
 */
export function createGovernanceClientStore(): GovernanceClientStore {
  const store = createSnapshotStore<GovernanceClientState>({
    assets: undefined,
    searchQuery: '',
    edges: undefined,
    rules: undefined,
    events: undefined,
    evaluation: undefined,
    evaluationAt: undefined,
    evaluating: false,
    evaluatingError: undefined,
  })
  const patch = (next: Partial<GovernanceClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  return {
    store,
    beginAssets() {
      patch({ assets: { status: 'loading' } })
    },
    setAssets(rows) {
      patch({ assets: { status: 'ready', value: rows } })
    },
    failAssets(message) {
      patch({ assets: { status: 'error', message } })
    },
    setSearchQuery(query) {
      patch({ searchQuery: query })
    },
    beginEdges() {
      patch({ edges: { status: 'loading' } })
    },
    setEdges(rows) {
      patch({ edges: { status: 'ready', value: rows } })
    },
    failEdges(message) {
      patch({ edges: { status: 'error', message } })
    },
    beginRules() {
      patch({ rules: { status: 'loading' } })
    },
    setRules(rows) {
      patch({ rules: { status: 'ready', value: rows } })
    },
    failRules(message) {
      patch({ rules: { status: 'error', message } })
    },
    beginEvents() {
      patch({ events: { status: 'loading' } })
    },
    setEvents(rows) {
      patch({ events: { status: 'ready', value: rows } })
    },
    failEvents(message) {
      patch({ events: { status: 'error', message } })
    },
    beginEvaluate() {
      patch({ evaluating: true, evaluatingError: undefined })
    },
    setEvaluation(outcomes, at) {
      patch({ evaluating: false, evaluatingError: undefined, evaluation: outcomes, evaluationAt: at })
    },
    failEvaluate(message) {
      patch({ evaluating: false, evaluatingError: message })
    },
  }
}
