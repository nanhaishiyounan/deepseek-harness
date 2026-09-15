/**
 * Keyless kg-tools snapshot over the real Loader composition: the full
 * knowledge-graph stack (seam + sqlite v2 store + kg-build pipeline +
 * tool-kb's kg_* rows) against a mock NocoBase server and a fake llm module.
 * The journey locks the model-visible surface — kg_schema before and after
 * the build (derived types appear live), the deterministic pipeline report,
 * the kg_subgraph YAML answer for 张红喜 (experts → services → orders), the
 * closed-set corpus defense (hallucinated type degrades, illegal relation
 * drops), and the idempotent second run. Hermetic by construction. Refresh
 * with `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import KgBuildRuntime from '@deepseek-ai/dsh-kg-build'
import { closeHttpServer } from '../scripts/nocobase-workflow.ts'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/kg-tools.cordis.yml')
const mappingsPath = join(here, 'fixtures/kg-tools.kg-mappings.yml')
const snapshotsDir = join(here, 'snapshots/kg-tools')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal
const NC_TOKEN = 'kg-tools-snapshot-token'
let counter = 0

const META: readonly object[] = [
  { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [
    { name: 'name', type: 'string', title: '姓名' },
    { name: 'org', type: 'string' },
  ] },
  { name: 'expert_services', title: '专家服务', filterTargetKey: 'id', fields: [
    { name: 'expertId', type: 'integer' },
    { name: 'name', type: 'string' },
  ] },
  { name: 'orders', title: '专家服务订单', filterTargetKey: 'id', fields: [
    { name: 'orderNo', type: 'string' },
    { name: 'serviceId', type: 'string' },
    { name: 'clientName', type: 'string' },
  ] },
]

const ROWS = new Map<string, Array<Record<string, unknown>>>([
  ['experts', [{ id: 1, name: '张红喜', org: '漯河市电子商务协会' }]],
  ['expert_services', [
    { id: 1, expertId: 1, name: '中亚货运动线方案' },
    { id: 2, expertId: 1, name: '海外仓风险应对咨询' },
  ]],
  ['orders', [{ id: 11, orderNo: 'ORD-11', serviceId: 'expert_services/1', clientName: '漯河宏发食品有限公司' }]],
])

/** The fake-llm module: one canned extraction answer (closed-set + hallucination). */
const EXTRACTION = JSON.stringify({
  entities: [
    { type: 'experts', name: '张红喜' },
    { type: 'company', name: '漯河宏发食品有限公司' },
    { type: 'product', name: '宏发牌酱油' },
    { type: 'weather_front', name: '冷锋过境' },
  ],
  relations: [
    { subject: '漯河宏发食品有限公司', predicate: 'produces', object: '宏发牌酱油', confidence: 0.85 },
    { subject: '漯河宏发食品有限公司', predicate: 'supplies', object: '张红喜', confidence: 0.7 },
  ],
})

class FakeLlm extends Service {
  constructor(ctx: Context) {
    super(ctx, 'llm')
  }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: EXTRACTION }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const FakeLlmModule = { name: 'fake-llm', apply: async (ctx: Context): Promise<void> => { new FakeLlm(ctx) } }

let root: string | undefined
let ctx: Context | undefined
let ncServer: Server | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kg-tools-'))
  const corpusDir = join(root, 'corpus')
  await mkdir(corpusDir)
  await writeFile(join(corpusDir, 'supply-note.md'), '宏发食品生产宏发牌酱油，与张红喜会长合作。冷锋过境影响运输。', 'utf8')
  process.env.KG_TEST_ROOT = root
  process.env.KG_TEST_CORPUS = corpusDir
  process.env.KG_TEST_MAPPINGS = mappingsPath
  process.env.KG_TEST_NC_TOKEN = NC_TOKEN
  ncServer = createServer((request, response) => {
    const finish = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (request.headers.authorization !== `Bearer ${NC_TOKEN}`) {
      finish(401, { error: { code: 'INVALID_TOKEN' } })
      return
    }
    const url = new URL(request.url ?? '/', 'http://mock')
    if (url.pathname === '/api/collections:listMeta') {
      finish(200, { data: META })
      return
    }
    const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
    if (request.method === 'GET' && listMatch !== null) {
      const rows = ROWS.get(listMatch[1] as string) ?? []
      const page = Number(url.searchParams.get('page') ?? 1)
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
      finish(200, { data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { count: rows.length, page, pageSize } })
      return
    }
    finish(404, { error: { code: 'NOT_FOUND' } })
  })
  await new Promise<void>(resolve => ncServer?.listen(0, '127.0.0.1', resolve))
  const address = ncServer.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  process.env.KG_TEST_NC_URL = `http://127.0.0.1:${String(address.port)}`

  const context = new Context()
  ctx = context
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  // The fake llm provider backs the closed-set extraction but has no
  // workspace package, so the spec mounts it directly: a fixture row would
  // have to name a package that resolves from examples/package.json.
  await context.plugin(FakeLlmModule)
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
    ['@deepseek-ai/dsh-kb-graph', KbGraphRuntime],
    ['@deepseek-ai/dsh-kb-graph-sqlite', KbGraphSqlite],
    ['@deepseek-ai/dsh-tool-kb', ToolKb],
    ['@deepseek-ai/dsh-kg-build', KgBuildRuntime],
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
  delete process.env.KG_TEST_CORPUS
  delete process.env.KG_TEST_MAPPINGS
  delete process.env.KG_TEST_NC_URL
  delete process.env.KG_TEST_NC_TOKEN
  await ctx?.fiber.dispose()
  ctx = undefined
  await closeHttpServer(ncServer)
  ncServer = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Execute one tool through the real registry and return its model-facing text. */
async function callText(name: string, args: unknown): Promise<string> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

/** Render the pipeline report deterministically (timestamps stripped). */
interface ReportSlice {
  readonly scope: string
  readonly rows: number
  readonly nodesUpserted: number
  readonly edgesUpserted: number
  readonly newRows: number
  readonly tombstoned: number
  readonly skipped: boolean
  readonly watermark: string
}

interface CorpusSlice {
  readonly documents: number
  readonly extractionCalls: number
  readonly extractedEntities: number
  readonly degradedEntities: number
  readonly droppedRelations: number
  readonly mergedEntities: number
}

function reportText(report: { collections: readonly ReportSlice[]; corpus?: CorpusSlice }): string {
  const lines = report.collections.map(entry =>
    `  ${entry.scope}: rows=${String(entry.rows)} nodes=${String(entry.nodesUpserted)} edges=${String(entry.edgesUpserted)} newRows=${String(entry.newRows)} tombstoned=${String(entry.tombstoned)} skipped=${String(entry.skipped)} watermark=${entry.watermark}`)
  if (report.corpus !== undefined) {
    const corpus = report.corpus
    lines.push(`  corpus: docs=${String(corpus.documents)} calls=${String(corpus.extractionCalls)} entities=${String(corpus.extractedEntities)} degraded=${String(corpus.degradedEntities)} dropped=${String(corpus.droppedRelations)} merged=${String(corpus.mergedEntities)}`)
  }
  return lines.join('\n')
}

describe('kb-agent kg tools (keyless)', () => {
  it('runs the graph journey: schema, build, subgraph answers, closed-set defense, idempotence', async () => {
    const out: string[] = ['# kb-agent kg tools (keyless)', '']

    out.push('## kg_schema() — before the build (builtin ontology only)')
    out.push(await callText('kg_schema', { layer: 'domain' }))
    out.push('')

    const build = ctx!.get('kgBuild')
    if (build === undefined) throw new Error('kgBuild did not compose')
    const first = await build.run()
    out.push('## kgBuild.run() — full build report')
    out.push(reportText(first))
    out.push('')

    out.push('## kg_schema() — after the build (nocobase-derived types live)')
    const schemaAfter = await callText('kg_schema', {})
    out.push(schemaAfter)
    out.push('')
    expect(schemaAfter).toContain('experts')
    expect(schemaAfter).toContain('ordered_service')

    out.push('## kg_subgraph({seeds:["张红喜"]}) — the business-relation answer')
    const zhang = await callText('kg_subgraph', { seeds: ['张红喜'], hops: 2 })
    out.push(zhang)
    out.push('')
    expect(zhang).toContain('中亚货运动线方案')
    expect(zhang).toContain('ORD-11')
    expect(zhang).toContain('nocobase:orders/11')

    out.push('## kg_subgraph({seeds:["漯河宏发食品有限公司"]}) — corpus entities with the degraded bucket')
    const hongfa = await callText('kg_subgraph', { seeds: ['漯河宏发食品有限公司'], hops: 1 })
    out.push(hongfa)
    out.push('')
    // The legal produces edge landed; the hallucinated weather entity sits in
    // the Concept bucket (closed set: nothing unregistered was written).
    expect(hongfa).toContain('宏发牌酱油')
    const bucket = await ctx!.get('kbGraph')!.searchNodes('demo-food-co', '冷锋过境', undefined, 5)
    expect(bucket[0]?.id).toContain('#冷锋过境')

    const second = await build.run()
    out.push('## kgBuild.run() again — the idempotent pass')
    out.push(reportText(second))
    out.push('')
    expect(second.collections.every(entry => entry.skipped)).toBe(true)
    if (second.corpus !== undefined) expect(second.corpus.extractionCalls).toBe(0)

    while (out.at(-1) === '') out.pop()
    const actual = `${out.join('\n')}\n`
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await import('node:fs').then(fs => fs.readFileSync(expectedPath, 'utf8'))
    expect(actual).toBe(expected)
  })
})
