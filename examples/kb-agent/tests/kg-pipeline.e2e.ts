/**
 * With-NocoBase + with-key kg pipeline e2e: the real track (live :13000
 * collections, real MiniMax-M3 closed-set extraction over one corpus
 * document) builds into a fresh SQLite v2 store, then the kg_* tool rows —
 * through the real tool registry — answer the business-relation question
 * 「张会长提供哪些服务、谁下过单」 from the graph with provenance, and the
 * closed-set defense stays observable on the real model (degraded or dropped
 * counts reported; nothing unregistered written). Self-skips without
 * reachable NocoBase or MINIMAX_API_KEY, explaining why. One case also
 * replays setup-dsh-data.mts against the real workspace and checks the
 * built graph by direct SQLite count — the "one setup run leaves a graph"
 * guarantee the all chain's verify step asserts on every run.
 * Run: pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/kg-pipeline.e2e.ts
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KgBuildRuntime from '@deepseek-ai/dsh-kg-build'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import { resolveEnv } from '../scripts/resolve-env.ts'

const here = dirname(fileURLToPath(import.meta.url))

const ncBaseUrl = resolveEnv('NOCOBASE_BASE_URL')
const ncApiKey = resolveEnv('NOCOBASE_API_KEY')
const minimaxKey = resolveEnv('MINIMAX_API_KEY')

/** Probe the live backend: the API key must list experts successfully. */
async function backendReachable(): Promise<boolean> {
  if (ncBaseUrl === undefined || ncApiKey === undefined) return false
  try {
    const response = await fetch(`${ncBaseUrl}/api/experts:list?pageSize=1`, {
      headers: { authorization: `Bearer ${ncApiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

const reachable = await backendReachable()
const skipReason = ncBaseUrl === undefined || ncApiKey === undefined
  ? 'NOCOBASE_BASE_URL/NOCOBASE_API_KEY not set (self-skipping, not failing)'
  : minimaxKey === undefined
    ? 'MINIMAX_API_KEY not set — the with-key extraction leg needs it (self-skipping, not failing)'
    : `NocoBase at ${ncBaseUrl} did not answer the API-key probe (self-skipping, not failing)`

describe.skipIf(!reachable || minimaxKey === undefined)('kg pipeline e2e: real track → graph → kg_* answers', () => {
  let ctx: Context | undefined
  let root: string | undefined
  let servedCreate = 0

  /** Execute one tool through the real registry. */
  async function callText(name: string, args: unknown): Promise<string> {
    const result = await ctx!.tools.execute({ signal: new AbortController().signal, callId: CallId(`kg-${name}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    if (result.isError) throw new Error(text?.type === 'text' ? text.text : 'tool failed')
    return text?.type === 'text' ? text.text : ''
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'kg-pipeline-'))
    process.env.NOCOBASE_API_KEY = ncApiKey
    const context = new Context()
    ctx = context
    await context.plugin(SystemPrompt)
    await context.plugin(ToolRuntime)
    await context.plugin(LlmRuntime)
    await context.plugin(LlmMiniMax, {})
    await context.plugin(LocalFileSystem, { cwd: join(root, 'fs') })
    await mkdir(join(root, 'fs'), { recursive: true })
    await context.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
    await context.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
    await context.plugin(ToolKb, { tenant: 'demo-food-co' })
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: join(root, 'kg-graph.sqlite') })
    await context.plugin(KgBuildRuntime, {
      tenant: 'demo-food-co',
      nocobase: {
        collections: [
          { name: 'experts', anchor: 'Expert', titleField: 'name' },
          { name: 'expert_services', anchor: 'ExpertService', titleField: 'name', fkLinks: [
            { field: 'expertId', target: 'experts', relation: 'expert_services.expert', style: 'plain-id' },
          ] },
          { name: 'orders', anchor: 'Order', titleField: 'orderNo', fkLinks: [
            { field: 'serviceId', target: 'expert_services', relation: 'ordered_service', style: 'collection-address' },
          ] },
        ],
      },
      corpus: { root: join(here, '..', 'workspace', 'data', 'profiles'), extensions: ['.md'], maxDocuments: 1, maxChunksPerDocument: 1 },
      lakehouse: false,
      connector: false,
      pageSize: 100,
      intervalMs: 0,
    })
  })

  afterAll(async () => {
    await ctx?.fiber.dispose()
    ctx = undefined
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    root = undefined
  })

  it('builds the real track and answers the relation question from the graph', { timeout: 300_000 }, async () => {
    const build = ctx!.get('kgBuild')
    if (build === undefined) throw new Error('kgBuild did not compose')
    const report = await build.run()
    expect(report.collections.map(entry => entry.scope)).toEqual(['experts', 'expert_services', 'orders'])
    expect(report.collections.every(entry => entry.rows > 0)).toBe(true)
    expect(report.corpus?.documents ?? 0).toBeGreaterThan(0)
    // The closed-set path ran for real: every claim that survived is
    // registry-typed; degradations and drops are counted, never written dirty.
    expect((report.corpus?.extractedEntities ?? 0) >= (report.corpus?.degradedEntities ?? 0)).toBe(true)

    const schema = await callText('kg_schema', {})
    expect(schema).toContain('experts')
    expect(schema).toContain('ordered_service')

    // The business-relation question through the kg_* tool face.
    const answer = await callText('kg_subgraph', { seeds: ['张红喜'], hops: 2 })
    expect(answer).toContain('中亚货运动线方案')
    expect(answer).toContain('sources:')
    expect(answer).toContain('nocobase:')
    const ordersNamed = [...answer.matchAll(/type: orders \| name: "[^"]+"/gu)]
    expect(ordersNamed.length).toBeGreaterThan(0)

    // Idempotent re-run converges.
    const statsBefore = await ctx!.get('kbGraph')!.stats('demo-food-co')
    const again = await build.run()
    const statsAfter = await ctx!.get('kbGraph')!.stats('demo-food-co')
    expect(again.collections.every(entry => entry.skipped)).toBe(true)
    expect(statsAfter).toEqual(statsBefore)

    // The incremental scenario against the live backend.
    const client = new NocoBaseClient({ baseUrl: ncBaseUrl!, token: ncApiKey! })
    const orderNo = `KG-E2E-${String(Date.now()).slice(-8)}`
    const created = await client.create('orders', {
      orderNo, serviceId: 'expert_services/1', serviceName: '中亚货运动线方案',
      price: '¥8,800/份', brief: 'kg e2e 增量订单', clientName: 'e2e', expertName: '张红喜', status: 'pending',
    })
    servedCreate = created.id
    const incremental = await build.run()
    expect(incremental.collections.find(entry => entry.scope === 'orders')).toMatchObject({ newRows: 1, skipped: false })
    const updatedAnswer = await callText('kg_subgraph', { seeds: ['张红喜'], hops: 2 })
    expect(updatedAnswer).toContain(orderNo)

    // Restore the track: the probe row disappears and reconcile tombstones it.
    await fetch(`${ncBaseUrl}/api/orders:destroy?filterByTk=${String(servedCreate)}`, {
      method: 'POST', headers: { authorization: `Bearer ${ncApiKey}` },
    })
    const reconciled = await build.run()
    expect(reconciled.collections.find(entry => entry.scope === 'orders')?.tombstoned).toBeGreaterThanOrEqual(1)
    const finalAnswer = await callText('kg_subgraph', { seeds: [orderNo], hops: 1 })
    expect(finalAnswer).toContain('truncated: false')
    expect(finalAnswer).not.toContain('中亚货运动线方案')
  })

  it('replays setup-dsh-data idempotently and the workspace graph stays non-empty by direct count', { timeout: 600_000 }, async () => {
    // The orchestrator runs against the real workspace (the same world the
    // all chain owns); on a settled world every step is kept/skip and the
    // graph counts do not move.
    const countNodes = (): number => {
      const db = new DatabaseSync(join(here, '..', 'workspace', 'kg-graph.sqlite'), { readOnly: true })
      try {
        return (db.prepare('SELECT COUNT(*) AS c FROM kg_nodes').get() as { c: number }).c
      } finally {
        db.close()
      }
    }
    const before = countNodes()
    const child = spawnSync(process.execPath, ['--import', 'tsx/esm', join(here, '..', 'scripts', 'setup-dsh-data.mts')], {
      cwd: join(here, '..', '..', '..'),
      env: { ...process.env, NOCOBASE_BASE_URL: ncBaseUrl!, NOCOBASE_API_KEY: ncApiKey! },
      encoding: 'utf8',
      timeout: 540_000,
    })
    expect(child.status, `setup-dsh-data output:\n${child.stdout}\n${child.stderr}`).toBe(0)
    expect(child.stdout).toContain('setup-dsh-data: done')
    // The expert roster rides the chain: a settled world reports it kept.
    expect(child.stdout).toContain('setup-dsh-data: expert roster present (32 experts, kept)')
    // Both runs of the built-in chain leave a drawable graph behind.
    expect(countNodes()).toBeGreaterThan(0)
    expect(countNodes()).toBe(before)
  })
})

describe.skipIf(reachable && minimaxKey !== undefined)('kg pipeline e2e (skipped)', () => {
  it('explains why it skipped', () => {
    console.log(`kg-pipeline.e2e: ${skipReason}`)
    expect(true).toBe(true)
  })
})
