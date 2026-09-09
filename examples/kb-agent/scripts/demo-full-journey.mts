/**
 * Full user-journey demo: the three customer motions of the kb-agent product,
 * each run end-to-end on real infrastructure in one self-contained script
 * (composition: demo-full-journey.cordis.yml over a temp workspace).
 *
 * Scenario 1 — expert discovery & consulting: the「俄罗斯的仓库被乌克兰炸了怎么办」
 * question over the export-risk corpus (live embo-01 embeddings) plus
 * connector_discover against the LIVE NocoBase backend, answered by real
 * MiniMax-M3 with [n] citations and President Zhang's expert card.
 *
 * Scenario 2 — upload auto-routing: a customs csv and a real visit-note
 * markdown go through the gateway's unified upload channel; the csv lands as
 * a lakehouse table, the markdown lands in the kb, and two real MiniMax-M3
 * answers close the loop (numbers from the lakehouse, risk points from the kb).
 *
 * Scenario 3 — order → approval → PDF delivery: an expert-service order on the
 * LIVE NocoBase backend rides the real approval workflow (collection trigger →
 * manual approval, resolved here the way the human approver does → request-node
 * callback into orders.fulfill, which drafts with real MiniMax when the key
 * resolves, the named template otherwise), the PDF lands on disk, is compared
 * byte-for-byte against the NocoBase-served attachment, and hangs off the
 * order row's deliverable field.
 *
 * Each scenario checks its own preconditions (MINIMAX_API_KEY,
 * NOCOBASE_BASE_URL/NOCOBASE_API_KEY from the environment or the repo root
 * .env; NocoBase liveness probe) and self-skips with an explanation when they
 * are missing — the script never fails merely because a track is unavailable.
 * A failing assertion marks that scenario FAILED (naming the step it failed
 * at) and the script exits non-zero. Every LLM / NocoBase / upload call rides
 * the shared resilience policy (withResilience): bounded retries with jittered
 * exponential backoff plus a per-attempt timeout budget, so a transient
 * outage retries instead of failing the scenario; non-idempotent writes keep
 * the timeout budget but never retry.
 * The transcript of every run lands in examples/kb-agent/demos/ as markdown
 * evidence. Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { BlockAssembler, CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import * as ToolNocoBase from '@deepseek-ai/dsh-tool-nocobase'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'
import ExpertOrdersRuntime from '@deepseek-ai/dsh-expert-orders'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import type { OrdersSeam } from '@deepseek-ai/dsh-expert-orders'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { closeHttpServer, createApprovalClone, drainPendingApprovals, getJson, resolveManualApprovalTask, WorkflowLease } from './nocobase-workflow.ts'
import { resolveEnv } from './resolve-env.ts'
import { withResilience } from './resilience.ts'
import type { ResilienceOptions } from './resilience.ts'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const demosDir = join(exampleRoot, 'demos')
const configPath = join(here, 'demo-full-journey.cordis.yml')
const WORKFLOW_TITLE = '专家服务订单审批交付'
const TENANT = 'demo-food-co'
const QUESTION = '俄罗斯的仓库被乌克兰炸了怎么办'

/**
 * Per-call resilience budgets for the external services this journey rides.
 * timeoutMs values cover one full inner attempt window: NocoBaseClient
 * retries one transport failure per request under its own 30s timeout and
 * the kb-embed providers retry transient embedding failures internally, so
 * the outer budget must not race those. Non-idempotent call sites (creates
 * whose retry would double-write) override attempts to 1, keeping only the
 * timeout budget.
 */
const RESILIENCE = {
  /** Tool calls (embeddings, NocoBase reads, local lakehouse/kg faces). */
  tool: { attempts: 3, timeoutMs: 60_000, baseDelayMs: 500 },
  /** Real MiniMax-M3 chat answers (grounded answers take tens of seconds). */
  llm: { attempts: 3, timeoutMs: 180_000, baseDelayMs: 1_000 },
  /** Direct NocoBase REST calls outside the client class's own retry. */
  nocobase: { attempts: 2, timeoutMs: 75_000, baseDelayMs: 500 },
  /** Gateway uploads (csv → parquet, md → embed); same-name re-upload replaces. */
  upload: { attempts: 2, timeoutMs: 180_000, baseDelayMs: 1_000 },
} as const

/** The customs sample the demo uploads: two months, three regions, exact sums. */
const EXPORT_CSV = [
  'region,month,amount_t',
  '中亚,2026-07,120.5',
  '中亚,2026-08,98.25',
  '欧盟,2026-07,402',
  '欧盟,2026-08,455.5',
  '东南亚,2026-07,310',
  '东南亚,2026-08,320',
].join('\n')

const minimaxKey = resolveEnv('MINIMAX_API_KEY')
const ncBaseUrl = resolveEnv('NOCOBASE_BASE_URL')
const ncApiKey = resolveEnv('NOCOBASE_API_KEY')
if (minimaxKey !== undefined && process.env.MINIMAX_API_KEY === undefined) process.env.MINIMAX_API_KEY = minimaxKey
if (ncApiKey !== undefined && process.env.NOCOBASE_API_KEY === undefined) process.env.NOCOBASE_API_KEY = ncApiKey

/** Probe the live NocoBase backend: the API key must list experts successfully. */
async function backendReachable(url: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/experts:list?pageSize=1`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

const ncLive = ncBaseUrl !== undefined && ncApiKey !== undefined
  ? await backendReachable(ncBaseUrl, ncApiKey)
  : false

// ---- Transcript plumbing: every step logs to the console and accumulates
// into the markdown evidence file written at the end.
const lines: string[] = [`# kb-agent 全动线演示实录（${new Date().toISOString().slice(0, 10)}）`, '']

function say(text: string): void {
  console.log(text)
  lines.push(...text.split('\n'))
}

function code(raw: string, max = 700): void {
  console.log(raw)
  const oneLine = raw.replaceAll('\n\n+', '\n').trim()
  const body = oneLine.length > max ? `${oneLine.slice(0, max)}\n…（后文省略）` : oneLine
  lines.push('', '```text', ...body.split('\n'), '```')
}

type ScenarioStatus = 'PASS' | 'SKIP' | 'FAIL'
interface ScenarioResult { name: string; status: ScenarioStatus; note: string }
const results: ScenarioResult[] = []

function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(`断言失败: ${label}`)
  say(`  ✓ ${label}`)
}

/** The most recent step label inside the running scenario; FAIL rows report it as the failed step. */
let currentStep = '前置'

/** Announce one scenario step and remember it for the FAIL row's failed-step field. */
function step(label: string): void {
  currentStep = label
  say(`\n${label}`)
}

/**
 * Run one scenario: preconditions decide SKIP, an exception marks FAIL and
 * names the step it failed at. A FAIL never stops the remaining scenarios —
 * the summary table reports every row and the exit code stays non-zero.
 * @param name - scenario display name.
 * @param skipReason - explanation when preconditions are unmet, else undefined.
 * @param body - the scenario steps; assertions throw on failure.
 */
async function scenario(name: string, skipReason: string | undefined, body: () => Promise<void>): Promise<void> {
  say(`\n## ${name}`)
  currentStep = '前置'
  if (skipReason !== undefined) {
    say(`**SKIP** — ${skipReason}`)
    results.push({ name, status: 'SKIP', note: skipReason })
    return
  }
  try {
    await body()
    say('**PASS**')
    results.push({ name, status: 'PASS', note: '' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const note = `失败于「${currentStep}」：${message}`
    say(`**FAIL** — ${note}`)
    results.push({ name, status: 'FAIL', note })
  }
}

// ---- One shared composition over a temp workspace.
const root = await mkdtemp(join(tmpdir(), 'kb-demo-'))
const ctx = new Context()
ctx.baseUrl = pathToFileURL(root).href + '/'
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include
const modules = new Map<string, unknown>([
  ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
  ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
  ['@deepseek-ai/dsh-llm', LlmRuntime],
  ['@deepseek-ai/dsh-llm-minimax', LlmMiniMax],
  ['@deepseek-ai/dsh-agent', AgentRegistry],
  ['@deepseek-ai/dsh-session', SessionStore],
  ['@deepseek-ai/dsh-user-questions', UserQuestionService],
  ['@deepseek-ai/dsh-kb', KbRuntime],
  ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
  ['@deepseek-ai/dsh-kb-embed-minimax', KbEmbedMiniMax],
  ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
  ['@deepseek-ai/dsh-tools', ToolRuntime],
  ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
  ['@deepseek-ai/dsh-tool-kb', ToolKb],
  ['@deepseek-ai/dsh-lakehouse', LakehouseRuntime],
  ['@deepseek-ai/dsh-lakehouse-sqlite-catalog', LakehouseSqliteCatalog],
  ['@deepseek-ai/dsh-lakehouse-duckdb', LakehouseDuckDb],
  ['@deepseek-ai/dsh-tool-lakehouse', ToolLakehouse],
  ['@deepseek-ai/dsh-connector', ConnectorRuntime],
  ['@deepseek-ai/dsh-connector-nocobase', ConnectorNocoBase],
  ['@deepseek-ai/dsh-tool-connector', ToolConnector],
  ['@deepseek-ai/dsh-expert-orders', ExpertOrdersRuntime],
  ['@deepseek-ai/dsh-kb-graph', KbGraphRuntime],
  ['@deepseek-ai/dsh-kb-graph-sqlite', KbGraphSqlite],
  ['@deepseek-ai/dsh-tool-nocobase', ToolNocoBase],
])
ctx.loader.internal = {
  version: 'v2',
  async import(specifier: string) {
    if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
    return modules.get(specifier)
  },
} as unknown as NonNullable<typeof ctx.loader.internal>
process.env.DEMO_KB_DB = join(root, 'kb.sqlite')
process.env.DEMO_LH_ROOT = join(root, 'lakehouse')
process.env.DEMO_LH_DB = join(root, 'catalog.sqlite')
process.env.DEMO_CWD = exampleRoot
if (ncBaseUrl !== undefined) process.env.DEMO_NC_URL = ncBaseUrl
process.env.DEMO_DELIVERABLES = join(root, 'deliverables')
await ctx.loader.create({
  name: 'cordis:include',
  config: { path: pathToFileURL(configPath).href },
})
await ctx.loader.await()

const api = createApiProxy(ctx, {
  defaultModelSelection: () => ({ provider: 'minimax', model: 'MiniMax-M3' }),
  saveDefaultModelSelection: async () => {},
  cwd: root,
  kbTenant: TENANT,
  dataUploadEnabled: true,
})

let counter = 0

/**
 * Invoke one registered tool under the shared resilience policy and return
 * its first text block plus raw value.
 * @param name - tool name.
 * @param args - tool arguments.
 * @param options - resilience budget; non-idempotent tools (nb_create) pass
 * attempts: 1 so a retry can never double-write.
 * @returns the tool result's text projection and structured value.
 */
async function callText(name: string, args: unknown, options: ResilienceOptions = RESILIENCE.tool): Promise<{ text: string; value: unknown }> {
  const result = await withResilience(`tool:${name}`, signal => ctx.tools.execute({ signal, callId: CallId(`demo-${++counter}`) as never, name, arguments: args }), options)
  const text = result.content.find(block => block.type === 'text')
  return { text: text?.type === 'text' ? text.text : '', value: result.value }
}

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'kb-agent-demo' } })
}

/**
 * One real MiniMax-M3 answer over the assembled context, retried under the
 * shared resilience policy (the abort signal cuts a hung stream short).
 * @param system - the grounding instruction.
 * @param turn - the fully-assembled user turn.
 * @returns the visible text of the model's answer.
 */
async function ask(system: string, turn: string): Promise<string> {
  return withResilience('llm:MiniMax-M3 对话', async (signal) => {
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({ provider: 'minimax', model: 'MiniMax-M3', system, messages: [user(turn)], signal })) assembler.push(chunk)
    if (assembler.finish.kind !== 'stop') throw new Error(`MiniMax-M3 finish=${assembler.finish.kind}`)
    const answer = assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
    return answer.content.map(block => block.type === 'text' ? block.text : '').join('')
  }, RESILIENCE.llm)
}

// =====================================================================
// Scenario 1 — expert discovery & consulting (live embeddings + live
// NocoBase discovery + real MiniMax-M3 answer).
// =====================================================================
await scenario('场景1 专家发现与咨询：出海风险问答 + 张会长专家卡', minimaxKey === undefined
  ? 'MINIMAX_API_KEY 未配置（.env 或环境变量）——真实 MiniMax 轨道不可用，自跳过'
  : !ncLive
    ? '真实 NocoBase 不可达（NOCOBASE_BASE_URL/NOCOBASE_API_KEY 未配置或后端未启动）——专家发现走真实轨道的前提不满足，自跳过。启动：node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts start'
    : undefined, async () => {
  say('前置：真实 MiniMax（对话+向量）与真实 NocoBase（专家发现）均在线。')

  step('步骤1：入库出海风险语料（9 篇报告 + 2 篇法规摘录，真实 embo-01 嵌入）')
  let ingested = 0
  for (const dir of [['workspace/data/export-risk', 'report'], ['workspace/data/regulations', 'regulation']] as const) {
    for (const file of (await readdir(join(exampleRoot, dir[0]))).sort()) {
      if (!file.endsWith('.md') || (dir[1] === 'regulation' && !file.includes('force-majeure'))) continue
      const { text } = await callText('kb_ingest', { path: `${dir[0]}/${file}`, doc_kind: dir[1] })
      check(text.includes('embedded via minimax:embo-01'), `kb_ingest ${file} 真实嵌入成功`)
      ingested += 1
    }
  }
  check(ingested === 11, `共入库 ${ingested} 篇（预期 11）`)

  step('步骤2：kb_search hybrid 检索应对要点')
  const search = await callText('kb_search', { query: QUESTION })
  check((search.value as { mode: string }).mode === 'hybrid', '检索模式 hybrid（向量+文本）')
  check(/\[1\]/u.test(search.text), '命中带 [1] 编号引用')
  code(search.text, 500)

  step('步骤3：connector_discover 在真实 NocoBase 上发现专家')
  const discover = await callText('connector_discover', { query: '海外仓' })
  check(discover.text.includes('张红喜'), '返回张红喜专家卡')
  check(discover.text.includes('海外仓风险应对咨询'), '专家卡含可下单服务（海外仓风险应对咨询）')
  code(discover.text, 500)

  step('步骤4：真实 MiniMax-M3 依据检索材料 + 专家卡作答')
  const answer = await ask(
    '你是食品行业出海顾问。依据用户提供的检索材料与专家发现结果回答：先用编号 [n] 引用检索材料给出可执行的应对要点，再依据专家卡字段推荐专家（姓名、机构、可下单的服务与定价）。',
    `检索材料：\n\n${search.text}\n\n专家发现结果：\n\n${discover.text}\n\n问题：${QUESTION}`)
  code(answer)
  check(/\[\d+\]/u.test(answer), '回答含 [n] 引用')
  check(/转移|备份仓|备仓|一主两备/u.test(answer), '回答含可执行应对要点（转移/备仓）')
  check(/保险|报案|理赔/u.test(answer), '回答含保险理赔要点')
  check(/张红喜/u.test(answer) && /漯河/u.test(answer), '回答按专家卡推荐张会长（姓名+机构）')
})

// =====================================================================
// Scenario 2 — upload auto-routing (unified channel → lakehouse / kb, two
// real answers over the landed data).
// =====================================================================
await scenario('场景2 上传自动路由：csv → 湖仓表、md → 知识库，双路问答', minimaxKey === undefined
  ? 'MINIMAX_API_KEY 未配置——真实上传嵌入与 MiniMax 回答不可用，自跳过'
  : undefined, async () => {
  /**
   * One upload through the gateway's unified channel (the workbench's「添加文档」
   * rides it), retried under the shared policy; same-name re-upload replaces,
   * so a retry never duplicates. The RPC surface takes the abort signal, so
   * the per-attempt timeout budget cuts a hung upload short too.
   */
  const upload = async (name: string, bytes: Uint8Array, mime: string): Promise<{ destination: string; table?: string; rows?: number; document?: { embedded: boolean } }> => {
    const response = await withResilience(`upload:${name}`, signal => api.data.upload({
      rpcId: 'demo-full-journey' as never,
      payload: { filename: name, data: Buffer.from(bytes).toString('base64'), mime },
    }, signal), RESILIENCE.upload)
    if (!response.result.ok) throw new Error(`上传 ${name} 失败: ${response.result.error.code} ${response.result.error.message}`)
    return response.result.value as { destination: string; table?: string; rows?: number; document?: { embedded: boolean } }
  }

  say('前置：真实 MiniMax（嵌入+对话）在线；上传走网关统一通道（与工作台「添加文档」同一链路）。')

  step('步骤1：上传海关进出口 csv（模拟客户上传本机表格）')
  const csvReceipt = await upload('customs-export.csv', new TextEncoder().encode(EXPORT_CSV), 'text/csv')
  check(csvReceipt.destination === 'lakehouse', 'DataRouter 判定 csv → 数据湖')
  check(csvReceipt.table === 'customs_export' && csvReceipt.rows === 6, `湖仓表 customs_export 落 ${csvReceipt.rows} 行`)

  step('步骤2：上传宏发走访纪要 md（真实语料文件）')
  const noteBytes = await readFile(join(exampleRoot, 'workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md'))
  const mdReceipt = await upload('2026-08-20-supplier-visit-hongfa.md', noteBytes, 'text/markdown')
  check(mdReceipt.destination === 'kb', 'DataRouter 判定 md → 知识库')
  check(mdReceipt.document?.embedded === true, '文档真实嵌入（embo-01）')

  step('步骤3：数值问题走湖仓（lakehouse_tables → lakehouse_query）')
  const tables = await callText('lakehouse_tables', {})
  check(tables.text.includes('customs_export'), 'lakehouse_tables 可见表')
  const query = await callText('lakehouse_query', { sql: "SELECT region, SUM(amount_t) AS total FROM customs_export WHERE month = '2026-08' GROUP BY region ORDER BY region" })
  check(query.text.includes('98.25') && query.text.includes('455.5'), '2026-08 各地区金额正确')
  check(query.text.includes('Data source: lakehouse table customs_export'), '查询结果标注来源表')
  code(query.text, 400)

  const numericAnswer = await ask(
    '你是企业数据助手。只依据用户提供的查询结果回答，金额保留原数，并注明数据来源表名。',
    `查询结果：\n\n${query.text}\n\n问题：2026年8月（上月）的出口额合计是多少？数据来自哪张表？`)
  code(numericAnswer)
  check(/873\.75/u.test(numericAnswer), '回答合计 873.75（98.25+455.5+320）')
  check(/customs_export/u.test(numericAnswer), '回答注明来源表 customs_export')

  step('步骤4：文档问题走知识库（kb_search）')
  const kbSearch = await callText('kb_search', { query: '宏发 风险' })
  check(/\[\d+\]/u.test(kbSearch.text), 'KB 检索命中带 [n] 引用')
  const docAnswer = await ask(
    '你是企业知识助手。只依据用户提供的检索结果回答，用编号 [n] 引用来源。',
    `检索结果：\n\n${kbSearch.text}\n\n问题：宏发食品走访发现的风险点有哪些？`)
  code(docAnswer)
  check(/\[\d+\]/u.test(docAnswer), '回答带 [n] 引用')
  check(/GB ?2760|GB ?14881|添加剂|合规|白糖|成本|毛利|供应商|玻璃瓶/u.test(docAnswer), '回答覆盖走访风险要点（合规/成本/供应链任一）')
})

// =====================================================================
// Scenario 3 — order → approval → PDF delivery on the LIVE NocoBase track.
// =====================================================================
let fulfillServer: Server | undefined
let lease: WorkflowLease | undefined
await scenario('场景3 会话内下单拿 PDF：下单 → 真实审批 → 交付 → 下载', !ncLive
  ? '真实 NocoBase 不可达——订单审批轨道的前提不满足，自跳过。启动：node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts start'
  : undefined, async () => {
  const orders = ctx.get('orders') as OrdersSeam | undefined
  check(orders !== undefined, 'orders 能力缝组合成功')
  const client = new NocoBaseClient({ baseUrl: ncBaseUrl!, token: ncApiKey!, timeoutMs: 30_000 })
  const bearer = { authorization: `Bearer ${ncApiKey}` } as const
  let fulfillUrl = 'http://127.0.0.1:3080'

  say(`前置：真实 NocoBase（${ncBaseUrl}）在线；起草轨道 = ${minimaxKey !== undefined ? '真实 MiniMax-M3' : '命名模板兜底（无 key）'}。`)

  // Serve orders.fulfill exactly the way the gateway's fetch carrier does,
  // so the workflow's request node drives the real DSH pipeline.
  fulfillServer = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://dsh-callback')
    if (request.method !== 'POST' || url.pathname !== '/api/orders.fulfill') {
      response.writeHead(404).end('not found')
      return
    }
    let raw = ''
    request.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8') })
    request.on('end', () => {
      void (async () => {
        const envelope = JSON.parse(raw) as { type?: string; rpcId?: string; method?: string; payload?: { order_id?: number } }
        if (envelope.type !== 'client-request' || envelope.method !== 'orders.fulfill' || typeof envelope.payload?.order_id !== 'number') {
          response.writeHead(200).end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId ?? '', result: { ok: false, error: { code: 'bad-request', message: 'bad envelope', details: {} } } }))
          return
        }
        const settled = await orders!.fulfill(envelope.payload.order_id)
        response.writeHead(200).end(JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: true, value: { id: settled.id, order_no: settled.orderNo, status: settled.status, deliverable_url: settled.deliverableUrl } },
        }))
      })().catch(() => {
        response.writeHead(200).end(JSON.stringify({ type: 'server-response', rpcId: '', result: { ok: false, error: { code: 'orders-rejected', message: 'fulfill threw', details: {} } } }))
      })
    })
  })
  await new Promise<void>((resolve, reject) => {
    fulfillServer!.once('error', reject)
    fulfillServer!.listen(3080, '127.0.0.1', resolve)
  }).catch(async () => {
    await new Promise<void>(resolve => fulfillServer!.listen(0, '127.0.0.1', resolve))
    const address = fulfillServer!.address()
    if (address === null || typeof address === 'string') throw new Error('fulfill callback server has no address')
    fulfillUrl = `http://127.0.0.1:${address.port}`
  })
  say(`fulfill 回调服务: ${fulfillUrl}（生产轨道同款信封：POST /api/orders.fulfill）`)

  // Executed workflow nodes are immutable: pause the production workflow and
  // run a private clone whose request node targets this callback from birth;
  // the lease destroys the clone and re-enables the production one in the
  // teardown whatever happens below.
  const workflows = await withResilience('nc:workflows:list', signal => client.list<{ id: number }>('workflows', { filter: { title: { $eq: WORKFLOW_TITLE } }, page: 1, pageSize: 1 }, signal), RESILIENCE.nocobase)
  const productionId = workflows.rows[0]?.id
  check(productionId !== undefined, `生产 workflow「${WORKFLOW_TITLE}」在位`)
  const ncEndpoint = { baseUrl: ncBaseUrl!, apiKey: ncApiKey! } as const
  lease = new WorkflowLease(ncEndpoint, productionId!)
  await lease.pause()
  const cloneId = await createApprovalClone(ncEndpoint, `${WORKFLOW_TITLE}-demo`, fulfillUrl)
  lease.setClone(cloneId)
  say(`  ✓ 私有 demo workflow #${cloneId} 已创建（生产 workflow 暂停）`)
  say('demo workflow 四节点链就绪：collection 触发 → manual 审批 → condition 分支 →（通过）request 回调 fulfill /（驳回）update 标记 failed')

  await drainPendingApprovals(ncEndpoint)

  step('步骤1：connector_discover 发现张会长可下单服务（真实 NocoBase）')
  const discover = await callText('connector_discover', { query: '海外仓' })
  check(discover.text.includes('张红喜'), '返回张红喜专家卡')
  check(discover.text.includes('海外仓风险应对咨询'), '含可下单服务：海外仓风险应对咨询（PDF 方案）')
  const serviceMatch = /expert_services\/\d+/u.exec(discover.text)
  check(serviceMatch !== null, `service_id = ${serviceMatch?.[0]}`)
  const serviceId = serviceMatch?.[0] ?? ''

  step('步骤2：下单（orders.create 落真实订单行，触发审批 workflow）')
  say('  说明：order_create 工具的「一次调用完成下单+交付」语义服务 DSH 内同步闭环轨道；真实审批轨道上下单后由审批人驱动，fulfill 经 workflow request 回调进入（本演示如实呈现后者）。')
  // A create retried after a lost answer would double-write the order row:
  // timeout budget only.
  const order = await withResilience('orders.create', signal => orders!.create({
    serviceId,
    brief: '俄罗斯海外仓受损应急：货权转移、一主两备仓储切换、货运保险报案理赔与转口走廊方案。',
    clientName: '漯河宏发食品有限公司',
  }, signal), { ...RESILIENCE.nocobase, attempts: 1 })
  check(order.status === 'pending', `订单 ${order.orderNo} 落库，状态 pending（等待审批）`)
  check(order.expertName === '张红喜', '服务专家为张红喜')

  step('步骤3：以审批人身份解析 manual 审批任务（对应 NocoBase 界面的「通过」按钮）')
  const approved = await resolveManualApprovalTask(ncEndpoint)
  check(approved, '审批通过（manual 任务 RESOLVED）')

  step('步骤4：workflow request 回调 fulfill —— 等待起草与 PDF 交付（真实起草约 1-2 分钟）')
  let settled: { status: string; deliverableUrl?: string; deliverablePath?: string; error?: string } | undefined
  for (let attempt = 0; attempt < 210 && settled === undefined; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const current = await withResilience('nc:orders:get', signal => client.get<typeof settled>('orders', order.id, undefined, signal), RESILIENCE.nocobase)
    if (current?.status === 'delivered' || current?.status === 'failed') {
      if (current.status === 'failed') throw new Error(`订单在真源上 failed：${current.error ?? '?'}`)
      settled = current
    }
  }
  check(settled?.status === 'delivered', '订单状态 delivered')
  check(typeof settled?.deliverablePath === 'string' && /^\/(files|storage\/uploads)\//u.test(settled?.deliverableUrl ?? ''), `交付物 URL: ${settled?.deliverableUrl}`)

  step('步骤5：PDF 落盘校验 + NocoBase 附件字节比对')
  const localBytes = await readFile(settled!.deliverablePath!)
  check(Buffer.from(localBytes.subarray(0, 5)).toString('ascii') === '%PDF-', `本地交付物是真 PDF: ${settled!.deliverablePath}`)
  const attachmentResponse = await withResilience('nc:附件下载', signal => fetch(`${ncBaseUrl}${settled!.deliverableUrl}`, { headers: bearer, signal }), RESILIENCE.nocobase)
  const servedBytes = new Uint8Array(await attachmentResponse.arrayBuffer())
  check(Buffer.from(servedBytes).equals(localBytes), 'NocoBase 附件与本地 PDF 字节一致')
  const full = await getJson(ncEndpoint, `/api/orders/${order.id}?appends=deliverable`) as { data?: { deliverable?: Array<{ id?: number }> } }
  check((full.data?.deliverable ?? []).length > 0, '订单行 deliverable 附件字段已挂载')

  step('步骤6：order_status 工具查询（会话内视角）')
  const status = await callText('order_status', { order_id: order.id })
  code(status.text, 400)
  check(status.text.includes(order.orderNo) && status.text.includes('已交付'), 'order_status 报已交付 + 订单号')
})

// =====================================================================
// Scenario 4 — business-record management through the nb_* tools (the
// business page's write path): schema discovery, a confirmed create, a
// confirmed update, and the row landing verifiably in the live backend.
// The demo row is destroyed in a finally tail through the direct REST
// surface (deletion is not a model-facing tool by design), keeping the
// run idempotent: the experts baseline count is asserted unchanged.
// =====================================================================
await scenario('场景4 业务管理：nb_collections 发现 → nb_create 建专家 → nb_update 改名', !ncLive
  ? '真实 NocoBase 不可达——业务读写走真实轨道的前提不满足，自跳过'
  : undefined, async () => {
  const bearer = { authorization: `Bearer ${ncApiKey}` } as const

  const countExperts = async (): Promise<number> => {
    const response = await withResilience('nc:experts:list 计数', signal => fetch(`${ncBaseUrl}/api/experts:list?pageSize=1`, {
      headers: bearer,
      signal,
    }), RESILIENCE.nocobase)
    if (!response.ok) throw new Error(`experts:list 状态 ${String(response.status)}`)
    const body = await response.json() as { meta?: { count?: number } }
    if (typeof body.meta?.count !== 'number') throw new Error('experts:list 未返回 meta.count')
    return body.meta.count
  }

  say('前置：真实 NocoBase 在线；写入走业务页同一通道（预览确认流由会话承担）。')
  const baseline = await countExperts()
  say(`  基准：experts 共 ${String(baseline)} 行（结尾断言回到基准——运行零残留）`)

  let createdId: number | undefined
  try {
    step('步骤1：nb_collections 发现业务对象与字段')
    const collections = await callText('nb_collections', {})
    check(collections.text.includes('experts'), 'experts 业务对象可见')
    code(collections.text, 300)

    step('步骤2：nb_create 建专家记录（唯一名，避免重复运行冲突）')
    const stamp = new Date().toISOString().slice(11, 19).replaceAll(':', '')
    const expertName = `演示专家-${stamp}`
    // A create retried after a lost answer would double-write the demo row:
    // timeout budget only.
    const create = await callText('nb_create', { collection: 'experts', values: { name: expertName } }, { ...RESILIENCE.tool, attempts: 1 })
    const created = create.value as { id?: number }
    check(typeof created?.id === 'number', `建行成功 id=${String(created?.id)}`)
    createdId = created.id
    code(create.text, 300)

    step('步骤3：nb_update 改名（确认流的字段级 diff 由会话呈现）')
    const renamed = `${expertName}-改`
    const update = await callText('nb_update', { collection: 'experts', id: createdId, values: { name: renamed } })
    void update

    step('步骤4：nb_get 回读验证落库')
    const read = await callText('nb_get', { collection: 'experts', id: createdId })
    check(read.text.includes(renamed), '回读含改后名称')
    code(read.text, 300)
  } finally {
    if (createdId !== undefined) {
      const destroy = await withResilience(`nc:experts:destroy id=${String(createdId)}`, signal => fetch(`${ncBaseUrl}/api/experts:destroy?filterByTk=${String(createdId)}`, {
        method: 'POST',
        headers: bearer,
        signal,
      }), RESILIENCE.nocobase)
      check(destroy.ok, `演示行已销毁（id=${String(createdId)}，直连 REST，不走模型工具面）`)
    }
    const after = await countExperts()
    check(after === baseline, `幂等收尾：experts 回到基准 ${String(baseline)} 行（实测 ${String(after)}）`)
  }
})

// =====================================================================
// Scenario 5 — knowledge-graph question answering through kg_schema /
// kg_subgraph (the graph page's data path): seed a small food-chain subgraph
// into the v2 store, browse the ontology, walk the neighborhood, and (with
// the key) have real MiniMax-M3 answer from the walk.
// =====================================================================
await scenario('场景5 图谱问答：本体浏览 + kg_subgraph 邻域 + MiniMax 组织答案', undefined, async () => {
  say('前置：keyless 可跑（图谱种子 + 工具面）；MiniMax 组织答案仅在有 key 时执行。')

  step('步骤1：种子食品链子图（company → product → additive，provenance 指向语料）')
  const graph = ctx.get('kbGraph')
  if (graph === undefined) throw new Error('kbGraph missing in demo composition')
  const NOW = new Date().toISOString()
  for (const [type, name] of [['company', '宏发食品'], ['product', '酱油'], ['additive', '山梨酸钾']] as const) {
    await graph.upsertNode({
      id: `kb:demo#${name}`, tenantId: 'demo-food-co', type: kgNodeTypeId(type),
      naturalKey: name, name, createdAt: NOW, updatedAt: NOW,
    })
  }
  await graph.upsertEdges([
    {
      id: 'kb:demo#e1', tenantId: 'demo-food-co', srcId: 'kb:demo#宏发食品', dstId: 'kb:demo#酱油',
      relation: kgRelationId('produces'), confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/profiles/hongfa-food.md', extractedAt: NOW },
      validFrom: NOW,
    },
    {
      id: 'kb:demo#e2', tenantId: 'demo-food-co', srcId: 'kb:demo#酱油', dstId: 'kb:demo#山梨酸钾',
      relation: kgRelationId('contains'), confidence: 0.8, fact: '含防腐剂山梨酸钾',
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/regulations/gb2760-excerpt.md', extractedAt: NOW },
      validFrom: NOW,
    },
  ])
  check(true, '种子完成（2 节点级：宏发食品—produces→酱油—contains→山梨酸钾）')

  step('步骤2：kg_schema 本体浏览（图谱页图例同一注册表）')
  const schema = await callText('kg_schema', {})
  check(schema.text.includes('produces'), '本体含 produces 关系')
  code(schema.text, 400)

  step('步骤3：kg_subgraph 按实体名走邻域（图谱页画布同一读面）')
  const walk = await callText('kg_subgraph', { seeds: ['宏发食品'], hops: 2 })
  check(walk.text.includes('酱油'), '邻域含酱油')
  check(walk.text.includes('produces'), '关系 produces 在答案中')
  code(walk.text, 500)

  step('步骤4：真实 MiniMax-M3 依据子图回答业务问题')
  if (minimaxKey === undefined) {
    say('**SKIP（仅本步）** — MINIMAX_API_KEY 未配置，跳过组织答案，图谱读面断言已全过。')
    return
  }
  const answer = await ask(
    '你是食品行业知识助手。依据用户提供的图谱邻域回答：宏发食品生产什么、其中含哪种添加剂，引用图中的关系名。',
    `图谱邻域：\n${walk.text}`,
  )
  check(answer.includes('酱油'), '答案提到酱油')
  check(answer.includes('山梨酸钾'), '答案提到山梨酸钾')
  code(answer, 500)
})

// ---- Teardown: restore the NocoBase workflows, stop the callback server,
// dispose the composition, drop the temp workspace. The restore runs even
// when scenario 3 skipped (a no-op lease) or failed midway, and a restore
// failure is recorded as FAIL — never swallowed.
try {
  await lease?.restore()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  say(`**FAIL** — 生产 workflow 恢复失败：${message}`)
  results.push({ name: '场景3 teardown：生产 workflow 恢复', status: 'FAIL', note: message })
}
await closeHttpServer(fulfillServer)
fulfillServer = undefined
await ctx.fiber.dispose()
await rm(root, { recursive: true, force: true })
for (const name of ['DEMO_KB_DB', 'DEMO_LH_ROOT', 'DEMO_LH_DB', 'DEMO_CWD', 'DEMO_NC_URL', 'DEMO_DELIVERABLES']) delete process.env[name]

// ---- Summary + evidence file.
say('\n## 结果汇总')
lines.push('')
lines.push('| 场景 | 状态 | 说明 |')
lines.push('|---|---|---|')
for (const result of results) lines.push(`| ${result.name} | ${result.status} | ${result.note || '—'} |`)
lines.push('')
const failed = results.filter(result => result.status === 'FAIL')
const passed = results.filter(result => result.status === 'PASS')
lines.push(failed.length === 0
  ? `${passed.length}/${results.length} 场景 PASS 无 FAIL；SKIP 表示对应轨道前置不满足（自跳过并说明原因）。`
  : `存在 ${failed.length} 个 FAIL（${passed.length}/${results.length} 场景 PASS），详见上文各场景。`)

const stamp = new Date().toISOString().replaceAll(/[-:]/g, '').slice(0, 15).replace('T', '-')
await mkdir(demosDir, { recursive: true })
const outPath = join(demosDir, `full-journey-${stamp}.md`)
await writeFile(outPath, `${lines.join('\n')}\n`)
console.log(`\n实录已写入: ${outPath}`)
console.table(results.map(result => ({ 场景: result.name, 状态: result.status })))

if (failed.length > 0) process.exitCode = 1
