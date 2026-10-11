/**
 * Governance capability types: the data shapes shared by the Service
 * Definition, the engine provider, and the gateway/UI consumers.
 * @module @deepseek-ai/dsh-governance/types
 */

/** The five W24 sources plus the legacy NocoBase export the inventory also covers. */
export type GovernanceSource =
  | 'lakehouse'
  | 'kb'
  | 'business'
  | 'ontology'
  | 'graph'
  | 'legacy'

/** One asset in the cross-source inventory. */
export interface GovernanceAsset {
  /** Which of the five sources the asset belongs to. */
  readonly source: GovernanceSource
  /** Qualified, human-readable asset name (`lake.carbon.customers`, KB name, graph label...). */
  readonly qualifiedName: string
  /** Short display name. */
  readonly name: string
  /** Live row/node/document count when the source exposes one. */
  readonly count?: number
  /** Extra source-specific facts (columns, version, bucket...). */
  readonly detail?: string
}

/** One directed lineage edge: how data moved from source to target. */
export interface LineageEdge {
  /** Upstream asset (`business.carbon.customers`). */
  readonly source: string
  /** Downstream asset (`lake.carbon.customers`). */
  readonly target: string
  /** Human-readable transformation description (e.g. `lakehouse-sync watermark append`). */
  readonly transform: string
  /** ISO-8601 stamp of when the edge was recorded. */
  readonly recordedAt: string
}

/** The shape of a quality rule and its evaluation knobs. */
export type QualityRuleKind =
  | 'row_count_threshold'
  | 'null_rate'
  | 'uniqueness'
  | 'freshness'
  | 'custom_sql'

/** One configured quality rule. */
export interface QualityRule {
  /** Stable rule id. */
  readonly id: string
  /** Human-readable rule name. */
  readonly name: string
  /** The rule shape; decides which fields the evaluation reads. */
  readonly kind: QualityRuleKind
  /** Fully-qualified lakehouse table the rule evaluates against. */
  readonly table: string
  /** Column for null_rate/uniqueness/freshness rules. */
  readonly column?: string
  /** Threshold: row minimum, max null rate, max duplicate count, or max watermark age in hours. */
  readonly threshold?: number
  /** Custom assertion SQL for `custom_sql` rules: passing = at least one row. */
  readonly sql?: string
  /** Whether the rule participates in evaluations. */
  readonly enabled: boolean
}

/** One rule's outcome in an evaluation run. */
export interface QualityRuleOutcome {
  /** The rule this outcome belongs to. */
  readonly rule: QualityRule
  /** `pass` or `fail`. */
  readonly status: 'pass' | 'fail'
  /** The measured value the threshold compared against. */
  readonly measured: number | null
  /** Failure text when the rule failed or could not run. */
  readonly error?: string
}

/** One evaluation run's result. */
export interface QualityEvaluation {
  /** ISO-8601 stamp of the run. */
  readonly evaluatedAt: string
  /** Per-rule outcomes in rule order. */
  readonly outcomes: readonly QualityRuleOutcome[]
  /** Number of failed rules. */
  readonly failed: number
}

/** Alert severity levels. */
export type AlertLevel = 'info' | 'warning' | 'critical'

/** One recorded alert event. */
export interface AlertEvent {
  /** Monotonic event id. */
  readonly id: number
  /** ISO-8601 stamp. */
  readonly at: string
  /** What raised the event (`quality`, `sync`, `webhook-test`). */
  readonly kind: string
  readonly level: AlertLevel
  /** One-line summary. */
  readonly title: string
  /** Structured detail (rule outcome, sync error...). */
  readonly detail?: string
}
