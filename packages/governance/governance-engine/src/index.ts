/**
 * Governance engine provider: implements `ctx.governance` over the SQLite
 * store (lineage edges, quality rules, alert events), live cross-source
 * collectors, the lakehouse-backed quality evaluator, and an optional
 * webhook channel for alert delivery (Config-switched, off by default).
 * @module @deepseek-ai/dsh-governance-engine
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { DatabaseSync } from 'node:sqlite'
import type {
  AlertEvent, GovernanceAsset, LineageEdge, QualityEvaluation, QualityRule,
} from '@deepseek-ai/dsh-governance'
import { collectInventory } from './collectors.ts'
import { evaluateRule, validateRule } from './quality.ts'
import type { QualityQueryEngine } from './quality.ts'
import { openStore, readEdges, readEvents, readRules, removeRule, writeEdges, writeEvent, writeRule } from './store.ts'

export { collectInventory } from './collectors.ts'
export type { CollectorDeps } from './collectors.ts'
export { evaluateRule, ruleSql, validateRule } from './quality.ts'
export type { QualityQueryEngine } from './quality.ts'
export { openStore, readEdges, readEvents, readRules, removeRule, writeEdges, writeEvent, writeRule } from './store.ts'

/** Plugin configuration. */
export interface Config {
  /** Store file path; the parent directory is created on open. */
  readonly path: string
  /** Gravitino base URL for the business-table inventory (empty disables that collector). */
  readonly gravitinoUrl?: string
  /** Gravitino metalake name the business inventory reads. */
  readonly metalake: string
  /** WeKnora base URL for the KB inventory (empty disables that collector). */
  readonly weknoraUrl?: string
  /** WeKnora API key env-resolved value (Bearer); empty = anonymous (and refused). */
  readonly weknoraApiKey?: string
  /** kg-graph SQLite path for the graph/ontology fallback collector. */
  readonly kgGraphPath?: string
  /** kb-sqlite path for the KB fallback collector. */
  readonly kbSqlitePath?: string
  /** Webhook endpoint alert events POST to; empty (the default) keeps delivery off. */
  readonly webhookUrl?: string
}

export const Config: z<Config> = z.object({
  path: z.string().default('workspace/governance/governance.sqlite'),
  gravitinoUrl: z.string(),
  metalake: z.string().default('dsh'),
  weknoraUrl: z.string(),
  weknoraApiKey: z.string(),
  kgGraphPath: z.string().default('examples/kb-agent/workspace/kg-graph.sqlite'),
  kbSqlitePath: z.string().default('examples/kb-agent/workspace/kb.sqlite'),
  webhookUrl: z.string(),
})

/**
 * The governance engine service. Quality evaluation needs the lakehouse
 * engine; a deployment without it keeps every other surface working and
 * evaluation fails loud per rule.
 */
export class GovernanceEngineService extends Service implements
  Pick<import('@deepseek-ai/dsh-governance').GovernanceService,
  'inventory' | 'search' | 'lineage' | 'recordEdges' | 'rules' | 'upsertRule'
  | 'deleteRule' | 'evaluate' | 'events' | 'recordEvent' | 'testWebhook'> {
  private readonly db: DatabaseSync
  private readonly options: Config
  private readonly queryEngine: QualityQueryEngine | undefined

  /**
   * @param ctx - the owning context; the service registers as `ctx.governance`.
   * @param db - the opened governance store.
   * @param options - the validated plugin configuration.
   * @param queryEngine - the lakehouse engine read surface, when composed.
   */
  constructor(ctx: Context, db: DatabaseSync, options: Config, queryEngine?: QualityQueryEngine) {
    super(ctx, 'governance')
    this.db = db
    this.options = options
    this.queryEngine = queryEngine
  }

  /** Live cross-source inventory (see the collectors module). */
  async inventory(): Promise<readonly GovernanceAsset[]> {
    const lakehouseEngine = this.ctx.get('lakehouseEngine') as QualityQueryEngine & { listTables(): Promise<readonly { schema: string; table: string; rowCount: number }[]> } | undefined
    const neo4jGraph = this.ctx.get('neo4jGraph') as Parameters<typeof collectInventory>[0]['neo4jGraph'] | undefined
    return collectInventory({
      ...(lakehouseEngine === undefined ? {} : { lakehouseEngine }),
      ...(neo4jGraph === undefined ? {} : { neo4jGraph }),
      ...(this.options.gravitinoUrl === undefined ? {} : { gravitinoUrl: this.options.gravitinoUrl }),
      ...(this.options.weknoraUrl === undefined ? {} : { weknoraUrl: this.options.weknoraUrl }),
      ...(this.options.weknoraApiKey === undefined ? {} : { weknoraApiKey: this.options.weknoraApiKey }),
      ...(this.options.kgGraphPath === undefined ? {} : { kgGraphPath: this.options.kgGraphPath }),
      ...(this.options.kbSqlitePath === undefined ? {} : { kbSqlitePath: this.options.kbSqlitePath }),
      metalake: this.options.metalake,
    })
  }

  /** Case-insensitive substring search across qualified names. */
  async search(query: string): Promise<readonly GovernanceAsset[]> {
    const needle = query.toLowerCase()
    return (await this.inventory()).filter(asset => asset.qualifiedName.toLowerCase().includes(needle))
  }

  /** All recorded lineage edges. */
  async lineage(): Promise<readonly LineageEdge[]> {
    return readEdges(this.db)
  }

  /** Record lineage edges (idempotent by source+target+transform). */
  async recordEdges(edges: readonly LineageEdge[]): Promise<void> {
    writeEdges(this.db, edges)
  }

  /** All configured quality rules. */
  async rules(): Promise<readonly QualityRule[]> {
    return readRules(this.db)
  }

  /** Insert or replace one quality rule. */
  async upsertRule(rule: QualityRule): Promise<void> {
    const problem = validateRule(rule)
    if (problem !== undefined) throw new Error(`governance rule "${rule.id}" invalid: ${problem}`)
    writeRule(this.db, rule)
  }

  /** Remove one quality rule by id. */
  async deleteRule(id: string): Promise<void> {
    removeRule(this.db, id)
  }

  /** Evaluate every enabled rule; failures append alert events. */
  async evaluate(): Promise<QualityEvaluation> {
    // Resolve the engine lazily per run: composition order at load time does
    // not have to place the lakehouse engine before this plugin.
    const engine = this.queryEngine ?? (this.ctx.get('lakehouseEngine') as QualityQueryEngine | undefined)
    if (engine === undefined) throw new Error('governance evaluate: no lakehouse engine composed')
    const rules = (await this.rules()).filter(rule => rule.enabled)
    const outcomes = []
    for (const rule of rules) {
      const outcome = await evaluateRule(rule, engine)
      outcomes.push(outcome)
      if (outcome.status === 'fail') {
        await this.recordEvent({
          kind: 'quality',
          level: 'critical',
          title: `质量规则未通过: ${rule.name}`,
          detail: `rule=${rule.id} table=${rule.table} measured=${String(outcome.measured)}${outcome.error === undefined ? '' : ` error=${outcome.error}`}`,
        })
      }
    }
    return { evaluatedAt: new Date().toISOString(), outcomes, failed: outcomes.filter(outcome => outcome.status === 'fail').length }
  }

  /** Recorded alert events, newest first. */
  async events(): Promise<readonly AlertEvent[]> {
    return readEvents(this.db)
  }

  /** Append one alert event; webhook delivery rides the configured channel. */
  async recordEvent(event: Omit<AlertEvent, 'id' | 'at'> & { at?: string }): Promise<AlertEvent> {
    const stored = writeEvent(this.db, { ...event, at: event.at ?? new Date().toISOString() })
    await this.deliverWebhook(stored)
    return stored
  }

  /** Fire a test event through the webhook channel (or record its absence). */
  async testWebhook(): Promise<{ delivered: boolean; status: string }> {
    if (this.options.webhookUrl === undefined || this.options.webhookUrl === '') {
      await this.recordEvent({ kind: 'webhook-test', level: 'info', title: 'webhook 通道默认关闭（本地事件已记录）' })
      return { delivered: false, status: 'webhook disabled (config.webhookUrl unset); event recorded locally' }
    }
    try {
      const response = await fetch(this.options.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'governance.test', at: new Date().toISOString() }),
        signal: AbortSignal.timeout(6000),
      })
      const status = `POST ${this.options.webhookUrl} -> ${String(response.status)}`
      await this.recordEvent({ kind: 'webhook-test', level: response.ok ? 'info' : 'warning', title: `webhook 测试 ${response.ok ? '送达' : '失败'}`, detail: status })
      return { delivered: response.ok, status }
    } catch (error: unknown) {
      const status = String(error).slice(0, 200)
      await this.recordEvent({ kind: 'webhook-test', level: 'warning', title: 'webhook 测试失败', detail: status })
      return { delivered: false, status }
    }
  }

  /** POST one event to the configured webhook, best-effort. */
  private async deliverWebhook(event: AlertEvent): Promise<void> {
    if (this.options.webhookUrl === undefined || this.options.webhookUrl === '') return
    try {
      await fetch(this.options.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(6000),
      })
      // Delivery status rides the events panel through testWebhook; quality
      // failures stay non-blocking either way.
    } catch {
      // The alert is already recorded locally; a dead webhook must not fail
      // the evaluation that raised it.
    }
  }
}

/**
 * Register the governance engine service.
 * @param ctx - context whose `governance` service this registers.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const db = await openStore(config.path)
  const lakehouseEngine = ctx.get('lakehouseEngine') as QualityQueryEngine | undefined
  new GovernanceEngineService(ctx, db, config, lakehouseEngine)
  ctx.effect(() => () => {
    db.close()
  }, 'governance-engine.dispose')
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'governance-engine'
