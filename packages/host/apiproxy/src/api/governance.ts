/**
 * governance domain contract: the governance panel's surface over the
 * optional governance seam (`ctx.governance`) — the cross-source inventory
 * with search, lineage edges, quality rules (CRUD + evaluate), alert events,
 * and the webhook test. Every method fails with the structured
 * `governance-not-composed` error when no governance engine is composed.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One inventory asset as the wire projects it. */
export interface GovernanceAssetView {
  readonly source: string
  readonly qualified_name: string
  readonly name: string
  readonly count?: number
  readonly detail?: string
}

/** One lineage edge as the wire projects it. */
export interface GovernanceEdgeView {
  readonly source: string
  readonly target: string
  readonly transform: string
  readonly recorded_at: string
}

/** One quality rule as the wire carries it (both directions). */
export interface GovernanceRuleView {
  readonly id: string
  readonly name: string
  readonly kind: 'row_count_threshold' | 'null_rate' | 'uniqueness' | 'freshness' | 'custom_sql'
  readonly table: string
  readonly column?: string
  readonly threshold?: number
  readonly sql?: string
  readonly enabled: boolean
}

/** One rule outcome in an evaluation run. */
export interface GovernanceOutcomeView {
  readonly rule: GovernanceRuleView
  readonly status: 'pass' | 'fail'
  readonly measured: number | null
  readonly error?: string
}

/** governance.evaluate response value. */
export interface GovernanceEvaluationView {
  readonly evaluated_at: string
  readonly outcomes: readonly GovernanceOutcomeView[]
  readonly failed: number
}

/** One alert event as the wire projects it. */
export interface GovernanceEventView {
  readonly id: number
  readonly at: string
  readonly kind: string
  readonly level: 'info' | 'warning' | 'critical'
  readonly title: string
  readonly detail?: string
}

/** governance.webhookTest response value. */
export interface GovernanceWebhookView {
  readonly delivered: boolean
  readonly status: string
}

/** Governance domain methods; every call fails loud when unconfigured. */
export interface GovernanceApi {
  /** Live cross-source inventory. */
  inventory(
    request: RpcRequest<Record<string, never>>, signal?: AbortSignal,
  ): Promise<RpcResponse<{ assets: readonly GovernanceAssetView[] }>>
  /** Case-insensitive substring search across qualified names. */
  search(request: RpcRequest<{ query: string }>, signal?: AbortSignal): Promise<RpcResponse<{ assets: readonly GovernanceAssetView[] }>>
  /** All recorded lineage edges. */
  lineage(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<{ edges: readonly GovernanceEdgeView[] }>>
  /** All configured quality rules. */
  rules(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<{ rules: readonly GovernanceRuleView[] }>>
  /** Insert or replace one quality rule. */
  ruleUpsert(request: RpcRequest<{ rule: GovernanceRuleView }>, signal?: AbortSignal): Promise<RpcResponse<Record<string, never>>>
  /** Delete one quality rule by id. */
  ruleDelete(request: RpcRequest<{ id: string }>, signal?: AbortSignal): Promise<RpcResponse<Record<string, never>>>
  /** Evaluate every enabled rule; failures append alert events. */
  evaluate(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<GovernanceEvaluationView>>
  /** Recorded alert events, newest first. */
  events(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<{ events: readonly GovernanceEventView[] }>>
  /** Fire a test event through the configured webhook channel. */
  webhookTest(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<GovernanceWebhookView>>
}
