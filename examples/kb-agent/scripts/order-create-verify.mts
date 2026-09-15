/**
 * I0 verification: reproduce the AI-conversation `order_create` path end to
 * end — the tools/execute surface under the timeout-policy wrapper, the same
 * budget the gateway composition pins — and prove the order settles
 * `delivered` inside that budget (no `TOOL_TIMEOUT` at the old 60000ms).
 *
 * Composition: demo-full-journey.cordis.yml (real MiniMax-M3 drafting, real
 * NocoBase source of truth at NOCOBASE_BASE_URL) plus the timeout-policy
 * plugin mounted the way bundle/base mounts it. The production approval
 * workflow is paused for the run (the in-conversation synchronous track
 * fulfills the order itself; an un-paused trigger would strand a manual
 * approval task) and restored in the teardown.
 *
 * Evidence lands in examples/kb-agent/demos/order-create-verify-<stamp>.md.
 * Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/order-create-verify.mts
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
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
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import * as ToolNocoBase from '@deepseek-ai/dsh-tool-nocobase'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'
import ExpertOrdersRuntime from '@deepseek-ai/dsh-expert-orders'
import * as TimeoutPolicy from '@deepseek-ai/dsh-tool-call-timeout-policy'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import { WorkflowLease } from './nocobase-workflow.ts'
import { resolveEnv } from './resolve-env.ts'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const demosDir = join(exampleRoot, 'demos')
const configPath = join(here, 'demo-full-journey.cordis.yml')
const WORKFLOW_TITLE = '专家服务订单审批交付'

const minimaxKey = resolveEnv('MINIMAX_API_KEY')
const ncBaseUrl = resolveEnv('NOCOBASE_BASE_URL')
const ncApiKey = resolveEnv('NOCOBASE_API_KEY')
if (minimaxKey !== undefined && process.env.MINIMAX_API_KEY === undefined) process.env.MINIMAX_API_KEY = minimaxKey
if (ncApiKey !== undefined && process.env.NOCOBASE_API_KEY === undefined) process.env.NOCOBASE_API_KEY = ncApiKey

const lines: string[] = [`# order_create 超时修复实机验证（${new Date().toISOString().slice(0, 10)}）`, '']
function say(text: string): void {
  console.log(text)
  lines.push(...text.split('\n'))
}
function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(`断言失败: ${label}`)
  say(`  ✓ ${label}`)
}

if (ncBaseUrl === undefined || ncApiKey === undefined) {
  say('**SKIP** — NOCOBASE_BASE_URL/NOCOBASE_API_KEY 未解析（根 .env 或环境变量），实机验证前提不满足。')
} else {
  const probe = await fetch(`${ncBaseUrl}/api/experts:list?pageSize=1`, {
    headers: { authorization: `Bearer ${ncApiKey}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!probe.ok) {
    say(`**SKIP** — 真实 NocoBase（${ncBaseUrl}）探活失败（HTTP ${String(probe.status)}）。`)
  } else {
    // ---- Boot the demo composition over a temp workspace, plus the
    // timeout-policy wrapper the gateway composition rides.
    const root = await mkdtemp(join(tmpdir(), 'order-verify-'))
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
      ['@deepseek-ai/dsh-tool-kb', ToolKb],
      ['@deepseek-ai/dsh-lakehouse', LakehouseRuntime],
      ['@deepseek-ai/dsh-lakehouse-sqlite-catalog', LakehouseSqliteCatalog],
      ['@deepseek-ai/dsh-lakehouse-duckdb', LakehouseDuckDb],
      ['@deepseek-ai/dsh-tool-lakehouse', ToolLakehouse],
      ['@deepseek-ai/dsh-kb-graph', KbGraphRuntime],
      ['@deepseek-ai/dsh-kb-graph-sqlite', KbGraphSqlite],
      ['@deepseek-ai/dsh-tool-nocobase', ToolNocoBase],
      ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-connector', ConnectorRuntime],
      ['@deepseek-ai/dsh-connector-nocobase', ConnectorNocoBase],
      ['@deepseek-ai/dsh-tool-connector', ToolConnector],
      ['@deepseek-ai/dsh-expert-orders', ExpertOrdersRuntime],
      ['@deepseek-ai/dsh-tool-call-timeout-policy', TimeoutPolicy],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    process.env.DEMO_KB_DB = join(root, 'kb.sqlite')
    process.env.DEMO_KG_DB = join(root, 'kg-graph.sqlite')
    process.env.DEMO_LH_ROOT = join(root, 'lakehouse')
    process.env.DEMO_LH_DB = join(root, 'catalog.sqlite')
    process.env.DEMO_CWD = exampleRoot
    process.env.DEMO_NC_URL = ncBaseUrl
    process.env.DEMO_DELIVERABLES = join(root, 'deliverables')
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.create({ name: '@deepseek-ai/dsh-tool-call-timeout-policy' })
    await ctx.loader.await()

    // ---- Pause the production approval workflow so the synchronous track's
    // create does not strand a manual approval task; restored in teardown.
    const ncClient = new NocoBaseClient({ baseUrl: ncBaseUrl, token: ncApiKey, timeoutMs: 30_000 })
    const { rows } = await ncClient.list<{ id: number }>('workflows', { filter: { title: { $eq: WORKFLOW_TITLE } }, page: 1, pageSize: 1 })
    const productionId = rows[0]?.id
    const lease = productionId === undefined ? undefined : new WorkflowLease({ baseUrl: ncBaseUrl, apiKey: ncApiKey }, productionId)
    if (lease !== undefined) await lease.pause()
    say(`前置：真实 NocoBase（${ncBaseUrl}）在线；生产 workflow「${WORKFLOW_TITLE}」${lease === undefined ? '未找到（跳过暂停）' : `#${String(productionId)} 已暂停（teardown 恢复）`}。`)

    const tool = ctx.tools.get('order_create')
    say(`order_create 工具预算 timeoutMs = ${String(tool?.timeoutMs)}（timeout-policy 包装生效）`)
    check(tool?.timeoutMs === 180_000, '组合 pin 的 orderCreateTimeoutMs=180000 已挂到工具定义')

    // The orders collection has no createdAt column (creation rides the wire
    // payload only), so the segment timeline comes from a concurrent poll of
    // the newest orders rows: the first sighting of the new row's pending /
    // generating / delivered statuses approximates each segment boundary.
    const baseline = await ncClient.list<{ id: number }>('orders', { page: 1, pageSize: 5 })
    const maxOrderId = Math.max(0, ...baseline.rows.map(row => row.id))
    const timeline: Array<{ orderNo: string; status: string; t: number }> = []
    let polling = true
    const poll = (async (): Promise<void> => {
      while (polling) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        try {
          const { rows } = await ncClient.list<{ id: number; orderNo?: string; status?: string }>('orders', { page: 1, pageSize: 20, sort: '-id' })
          for (const row of rows) {
            if (row.id > maxOrderId && row.orderNo !== undefined && row.status !== undefined) {
              timeline.push({ orderNo: row.orderNo, status: row.status, t: performance.now() })
            }
          }
        } catch {
          // One lost poll round only blurs a boundary by its own interval.
        }
      }
    })()

    try {
      const started = performance.now()
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId('order-create-verify') as never,
        name: 'order_create',
        arguments: {
          service_id: 'expert_services/2',
          brief: '海外仓风险应对咨询：货物滞留海外仓，需要货权转移、一主两备仓储切换与货运保险理赔的应对方案。',
          client_name: '漯河宏发食品有限公司',
        },
      })
      const totalMs = Math.round(performance.now() - started)
      const text = result.content.find(block => block.type === 'text')
      say(`\norder_create 返回（总耗时 ${String(totalMs)}ms）：`)
      say(`\`\`\`text\n${text?.type === 'text' ? text.text : ''}\n\`\`\``)
      check(!result.isError, `不再是 TOOL_TIMEOUT/报错（isError=false，60s 预算下此前超时）`)

      const value = result.value as {
        order_id?: number; order_no?: string; status?: string
        deliverable_path?: string; deliverable_url?: string
      }
      check(value.status === 'delivered', `订单 ${String(value.order_no)} 状态 delivered（同步闭环完成）`)
      const firstSeen = new Map<string, number>()
      for (const entry of timeline.filter(entry => entry.orderNo === value.order_no)) {
        if (!firstSeen.has(entry.status)) firstSeen.set(entry.status, entry.t)
      }
      const at = (status: string): string => {
        const seen = firstSeen.get(status)
        return seen === undefined ? '未观测到' : `+${String(Math.max(0, Math.round(seen - started)))}ms`
      }
      const segment = (from: string, to: string): string => {
        const a = firstSeen.get(from)
        const b = firstSeen.get(to)
        return a === undefined || b === undefined ? '未观测到' : `${String(Math.max(0, Math.round(b - a)))}ms`
      }
      const pdf = await readFile(value.deliverable_path!)
      check(Buffer.from(pdf.subarray(0, 5)).toString('ascii') === '%PDF-', `交付物是真 PDF: ${String(value.deliverable_path)}`)
      check(/^\/(files|storage\/uploads)\//u.test(value.deliverable_url ?? ''), `NocoBase 附件 URL: ${String(value.deliverable_url)}`)

      const settled = await ncClient.get<{ orderNo?: string }>('orders', value.order_id!, undefined)
      check(settled?.orderNo === value.order_no, `真源回读订单行一致（${String(value.order_no)}）`)
      const observed = firstSeen.size > 0
      say(`\n## 分段计时${observed ? '（1s 轮询订单行状态首见时刻，边界含 ±1s 轮询粒度）' : '（本次轮询未覆盖到状态窗口，分段以独立实测为准）'}`)
      if (observed) {
        say(`- create（落库 pending）：${at('pending')}\n- 进入 generating（kb 检索 + 起草 + PDF + 上传开始）：${at('generating')}（pending→generating 约 ${segment('pending', 'generating')}）\n- 交付 delivered：${at('delivered')}（generating→delivered 约 ${segment('generating', 'delivered')}）`)
      }
      say(`- 工具总耗时：${String(totalMs)}ms，工具预算 180000ms（修复前 60000ms）\n- 独立实测参考：MiniMax-M3 同款 draft 提示词直连计时 38.9s（TTFB 0.9s，生产长 brief/带 refs 更长）；NocoBase REST 单次读写 12-21ms；PDF 渲染与附件上传为本地毫秒级`)
      say(`\n**PASS** — 同一单（expert_services/2 张红喜·海外仓风险应对咨询）在 180s 预算内同步交付落库，不再 60s 超时。`)
    } finally {
      polling = false
      await Promise.race([poll, new Promise(resolve => setTimeout(resolve, 3000))])
      try {
        await lease?.restore()
      } finally {
        await ctx.fiber.dispose()
        await rm(root, { recursive: true, force: true })
        for (const name of ['DEMO_KB_DB', 'DEMO_KG_DB', 'DEMO_LH_ROOT', 'DEMO_LH_DB', 'DEMO_CWD', 'DEMO_NC_URL', 'DEMO_DELIVERABLES']) delete process.env[name]
      }
    }
  }
}

const stamp = new Date().toISOString().replaceAll(/[-:]/g, '').slice(0, 15).replace('T', '-')
await mkdir(demosDir, { recursive: true })
const outPath = join(demosDir, `order-create-verify-${stamp}.md`)
await writeFile(outPath, `${lines.join('\n')}\n`)
console.log(`\n验证实录已写入: ${outPath}`)
