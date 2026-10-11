/**
 * Service Definition for the governance capability seam (`ctx.governance`):
 * the cross-source inventory (five W24 sources through their live surfaces),
 * lineage edges, quality rules evaluated on the lakehouse engine, and alert
 * events. The engine provider (`@deepseek-ai/dsh-governance-engine`) owns the
 * storage and evaluation; consumers are the gateway's governance domain and
 * the governance panel.
 * @module @deepseek-ai/dsh-governance
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  AlertEvent, GovernanceAsset, LineageEdge, QualityEvaluation, QualityRule,
} from './types.ts'

export type {
  AlertEvent, AlertLevel, GovernanceAsset, GovernanceSource, LineageEdge,
  QualityEvaluation, QualityRule, QualityRuleKind, QualityRuleOutcome,
} from './types.ts'

/** One lineage edge as recorded (the storage row equals the interface). */
export interface GovernanceService {
  /** Live cross-source inventory: every asset the sources expose right now. */
  inventory(): Promise<readonly GovernanceAsset[]>
  /** Case-insensitive substring search across qualified names. */
  search(query: string): Promise<readonly GovernanceAsset[]>
  /** All recorded lineage edges. */
  lineage(): Promise<readonly LineageEdge[]>
  /** Record lineage edges (idempotent upserts by source+target+transform). */
  recordEdges(edges: readonly LineageEdge[]): Promise<void>
  /** All configured quality rules. */
  rules(): Promise<readonly QualityRule[]>
  /** Insert or replace one quality rule. */
  upsertRule(rule: QualityRule): Promise<void>
  /** Remove one quality rule by id. */
  deleteRule(id: string): Promise<void>
  /**
   * Evaluate every enabled rule against the lakehouse engine; failures and
   * evaluation errors append alert events.
   */
  evaluate(): Promise<QualityEvaluation>
  /** Recorded alert events, newest first. */
  events(): Promise<readonly AlertEvent[]>
  /** Append one alert event (quality failures, sync errors, tests). */
  recordEvent(event: Omit<AlertEvent, 'id' | 'at'> & { at?: string }): Promise<AlertEvent>
  /**
   * Fire a test event through the configured webhook channel; returns the
   * delivery status. With no webhook configured the local recording still
   * happens and the status says so.
   */
  testWebhook(): Promise<{ delivered: boolean; status: string }>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    governance: GovernanceService
  }
}

/** Plugin name for loader diagnostics. */
export const name = 'governance'

/** Services required at composition time (none: the engine probes lazily). */
export const inject: readonly string[] = []

/**
 * No-op Service Definition body: the seam package exists to own the shared
 * types and the `ctx.governance` declaration; a provider registers the
 * service. Mounting this package alone leaves `ctx.governance` unset.
 * @param ctx - context (unused; the seam registers nothing).
 */
export function apply(_ctx: Context): void {
  // Intentionally empty: see the module docs.
}
