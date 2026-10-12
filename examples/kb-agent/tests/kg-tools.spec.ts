/**
 * Keyless kg-tools snapshot over the real Loader composition: the
 * knowledge-graph stack (seam + sqlite v2 store + tool-kb's kg_* rows) with
 * seed rows written directly through the graph seam (the same
 * upsertNode/upsertEdges surface the maintenance scripts ride). The journey
 * locks the model-visible surface — kg_schema over the builtin ontology,
 * the kg_subgraph YAML answers for 张红喜 (Expert → services) and 宏发食品
 * (Customer → order), and the kg_query template miss naming every supported
 * shape. Hermetic by construction. Refresh with `DSH_SNAPSHOT=refresh
 * pnpm vitest run <this file>`.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import KbGraphRuntime, { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import type { KgEdge, KgNode } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/kg-tools.cordis.yml')
const snapshotsDir = join(here, 'snapshots/kg-tools')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal
const tenant = 'demo-food-co'
let counter = 0

let root: string | undefined
let ctx: Context | undefined

/** Fixed provenance timestamp so the seeded rows replay identically. */
const SEED_AT = '2026-09-17T08:00:00.000Z'

/** One seeded node over a builtin type. */
function node(id: string, type: string, name: string): KgNode {
  return {
    id,
    tenantId: tenant,
    type: kgNodeTypeId(type),
    name,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  }
}

/** One seeded edge with deterministic mapping provenance. */
function edge(id: string, srcId: string, relation: string, dstId: string, fact: string): KgEdge {
  return {
    id,
    tenantId: tenant,
    srcId,
    dstId,
    relation: kgRelationId(relation),
    fact,
    confidence: 1,
    provenance: { sourceSystem: 'kb', sourceId: 'kg-tools-seed', extractedAt: SEED_AT },
    validFrom: SEED_AT,
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kg-tools-'))
  await mkdir(root, { recursive: true })
  process.env.KG_TEST_ROOT = root
  const context = new Context()
  ctx = context
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
    ['@deepseek-ai/dsh-kb-graph', KbGraphRuntime],
    ['@deepseek-ai/dsh-kb-graph-sqlite', KbGraphSqlite],
    ['@deepseek-ai/dsh-tool-kb', ToolKb],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
})

afterEach(async () => {
  delete process.env.KG_TEST_ROOT
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Execute one tool through the real registry and return its model-facing text. */
async function callText(name: string, args: unknown): Promise<string> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

describe('kb-agent kg tools (keyless)', () => {
  it('runs the graph journey: schema, seeded subgraph answers, and the template miss', async () => {
    const out: string[] = ['# kb-agent kg tools (keyless)', '']

    out.push('## tool surface — v1 graph tools stay off by default')
    const registered = ctx!.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('kb_') || name.startsWith('kg_')).sort()
    out.push(`- tools: ${registered.join(', ')}`)
    expect(registered).toEqual(['kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats', 'kg_query', 'kg_schema', 'kg_subgraph'])

    out.push('## kg_schema() — the builtin ontology')
    out.push(await callText('kg_schema', { layer: 'domain' }))
    out.push('')

    // Seed the business-relation rows the way the maintenance scripts do:
    // one expert with two orderable services, one customer with one order.
    const kbGraph = ctx!.get('kbGraph')
    if (kbGraph === undefined) throw new Error('kbGraph did not compose')
    await kbGraph.upsertNode(node('seed:experts/1', 'Expert', '张红喜'))
    await kbGraph.upsertNode(node('seed:expert_services/1', 'ExpertService', '中亚货运动线方案'))
    await kbGraph.upsertNode(node('seed:expert_services/2', 'ExpertService', '海外仓风险应对咨询'))
    await kbGraph.upsertNode(node('seed:customers/1', 'Customer', '漯河宏发食品有限公司'))
    await kbGraph.upsertNode(node('seed:orders/11', 'Order', 'ORD-11'))
    const written = await kbGraph.upsertEdges([
      edge('seed:edges/1', 'seed:experts/1', 'offers', 'seed:expert_services/1', '张红喜提供中亚货运动线方案'),
      edge('seed:edges/2', 'seed:experts/1', 'offers', 'seed:expert_services/2', '张红喜提供海外仓风险应对咨询'),
      edge('seed:edges/3', 'seed:customers/1', 'places', 'seed:orders/11', '漯河宏发食品有限公司下单 ORD-11'),
    ])
    expect(written).toBe(3)

    out.push('## kg_subgraph({seeds:["张红喜"]}) — the expert-service answer')
    const zhang = await callText('kg_subgraph', { seeds: ['张红喜'], hops: 2 })
    out.push(zhang)
    out.push('')
    expect(zhang).toContain('中亚货运动线方案')
    expect(zhang).toContain('海外仓风险应对咨询')

    out.push('## kg_subgraph({seeds:["漯河宏发食品有限公司"]}) — the customer-order answer')
    const hongfa = await callText('kg_subgraph', { seeds: ['漯河宏发食品有限公司'], hops: 1 })
    out.push(hongfa)
    out.push('')
    expect(hongfa).toContain('ORD-11')

    out.push('## kg_query(备份启用流程是什么) — the miss names every supported shape')
    const miss = await callText('kg_query', { phrase: '备份启用流程是什么' })
    out.push(miss)
    out.push('')
    expect(miss).toContain('宏发食品和张红喜的关系')

    while (out.at(-1) === '') out.pop()
    const actual = `${out.join('\n')}\n`
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      const { writeFile } = await import('node:fs/promises')
      await writeFile(expectedPath, actual)
    }
    const { readFile } = await import('node:fs/promises')
    const expected = await readFile(expectedPath, 'utf8')
    expect(actual).toBe(expected)
  })
})
