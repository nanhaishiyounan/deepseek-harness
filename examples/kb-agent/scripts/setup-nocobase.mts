/**
 * One-command NocoBase business-backend bring-up for the kb-agent example.
 * Drives the in-repo NocoBase snapshot at platform/nocobase (an isolated
 * upstream copy; edits require a MANIFEST local-modifications entry):
 * dependency install, the full-UI client build (the gateway serves these
 * dist artifacts at :13000; without them the root is an API-only 404
 * shell), postgres bootstrap, background server start, app install, then
 * idempotent REST initialization — the five expert-dataset
 * collections (orders carries the deliverable attachment field), a
 * root-role API key, the 张红喜 seed rows (shared fixture source with the
 * connector mock), the order-approval workflow (collection trigger →
 * manual → condition → request-callback into DSH / reject-update), the
 * crm/hub module builds, the "AI 工作台" v2 page (N13), the 30/20/40/24
 * data widening (N13), and the page-tabs backfill safety net (N14).
 * "all" then replays setup-dsh-data.mts — the DSH-side data plane
 * (connector-files provisioning, lakehouse tables, market catalog,
 * knowledge-graph build, KB corpus) — so a reset world regains every
 * workbench page's data from this one command.
 * Finally writes NOCOBASE_BASE_URL/NOCOBASE_API_KEY into the repository
 * root .env so every DSH surface (connector-nocobase provider,
 * expert-orders seam) picks the real backend up on its next launch.
 *
 * Every REST payload below was verified against a live NocoBase 2.2.6
 * instance (2026-09-05); the wire notes in NocoBaseClient's module docs are
 * the same evidence. Workflow node chain: manual (both actions RESOLVED so
 * the condition can branch on the result action key) → condition
 * (`{{$jobsMapByNodeId.<manual>.result._}}` == "resolve") → request
 * (POST <dsh>/api/orders.fulfill with the RPC client-request envelope) on
 * the true branch, update (status=failed, error=审批驳回) on the false one.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts [command]
 * Commands: all (default) | install | build | start | init | plugins | verify | stop | reset
 *   | ai (point the llmService at the N22 attachment proxy) | ai-direct
 *   (point it back at api.minimaxi.com) | ai-proxy start | ai-proxy stop.
 * "ai-proxy start" launches the attachment proxy (N22, PDF file-part rewrite)
 * in the background and points the llmService at it; "ai-proxy stop" stops the
 * proxy and AUTOMATICALLY rolls the llmService back to the direct upstream
 * (when NocoBase is reachable) so the AI surface never stays wired to a dead
 * proxy — for a manual rollback without stopping, run "ai-direct".
 * Environment overrides: NOCOBASE_HOME, NOCOBASE_BASE_URL, NOCOBASE_ROOT_EMAIL,
 * NOCOBASE_ROOT_PASSWORD, NOCOBASE_DSH_CALLBACK, NOCOBASE_PG_DATA,
 * NOCOBASE_FORCE_BUILD (=1 rebuilds the client artifacts even when present),
 * NOCOBASE_AI_PROXY_PORT (N22 proxy port, default 13100).
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BRAND_TITLE } from './dsh-brand.mts'
import { resolveEnv } from './resolve-env.ts'
import { assertWflConsistency } from './nocobase-w3-approval-visual.mts'
import { collectOrgAclFailures } from './nocobase-w3-org-acl.mts'
import { withResilience } from './resilience.ts'
import type { ResilienceOptions } from './resilience.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const ncHome = process.env.NOCOBASE_HOME ?? join(repoRoot, 'platform', 'nocobase')
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'
const dshCallback = process.env.NOCOBASE_DSH_CALLBACK ?? 'http://127.0.0.1:3080'
const envFile = join(repoRoot, '.env')
const serverLog = '/tmp/nocobase-dsh-server.log'
const buildLog = '/tmp/nocobase-dsh-build.log'

const API_KEY_NAME = 'dsh-harness'
const WORKFLOW_TITLE = '专家服务订单审批交付'

/** N22 attachment-proxy wiring: the only surfaces that may vary per deployment. */
const AI_PROXY_PORT = Number(process.env.NOCOBASE_AI_PROXY_PORT ?? 13_100)
const LLM_DIRECT_BASE = 'https://api.minimaxi.com/v1'
const LLM_PROXY_BASE = `http://127.0.0.1:${AI_PROXY_PORT}/v1`
const aiProxyScript = join(repoRoot, 'examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts')
const aiProxyLog = '/tmp/nocobase-dsh-ai-proxy.log'
const aiProxyPidFile = join(repoRoot, 'examples/kb-agent/.dsh/ai-proxy.pid')

/**
 * Feature plugins shipped in the snapshot source tree but left disabled by
 * the preset (map/comments/echarts/charts/public-forms/email/departments/
 * localization/graph/backup/china-region/fdw). Enabling writes runtime rows
 * (applicationPlugins), never a source edit. TRIAL_PLUGINS are
 * enable-if-able entries: a failed enable drops them with a warning instead
 * of failing the step (audit-logs is docs-marked Enterprise with no npm 2.x
 * build).
 */
const PLUGINS = [
  'map', 'comments', 'data-visualization-echarts', 'charts', 'public-forms',
  'notification-email', 'departments', 'localization', 'graph-collection-manager',
  'backup-restore', 'field-china-region', 'collection-fdw',
] as const
const TRIAL_PLUGINS = ['audit-logs'] as const
const LLM_SERVICE_TITLE = 'MiniMax'

const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: '待支付', color: 'orange' },
  { value: 'paid', label: '已支付', color: 'blue' },
  { value: 'processing', label: '处理中', color: 'cyan' },
  { value: 'fulfilled', label: '已交付', color: 'green' },
  { value: 'failed', label: '失败', color: 'red' },
]

/**
 * The five expert-dataset collections with the fields dataset.json seeds.
 * Timestamps (`createdAt`/`updatedAt`) are deliberately NOT declared: every
 * NocoBase collection carries them as system DATE columns, and re-declaring
 * either name as a string field replaces the column type and makes Sequelize
 * reject its own automatic timestamp writes ("string violation"). Seeding
 * still sends the fixture's ISO strings — DATE columns accept them.
 */
const COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  // Every field carries interface + uiSchema: admin CollectionField cells
  // resolve the render component from field.uiSchema["x-component"], and a
  // field created without them renders blank cells (N14).
  { name: 'experts', title: '专家', fields: [
    { name: 'name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '姓名' } },
    { name: 'org', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '所属机构' } },
    { name: 'domains', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '服务领域' } },
    { name: 'bio', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '简介' } },
  ] },
  { name: 'expert_services', title: '专家服务', fields: [
    { name: 'expertId', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '专家ID' } },
    { name: 'name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '服务名称' } },
    { name: 'deliverable', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '交付物' } },
    { name: 'price', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '价格' } },
    { name: 'summary', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '概述' } },
  ] },
  { name: 'datasets', title: '知识资产登记', fields: [
    { name: 'kind', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '类别' } },
    { name: 'title', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '标题' } },
    { name: 'collection', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '集合' } },
    { name: 'tableName', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '表名' } },
    { name: 'content', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '内容' } },
  ] },
  { name: 'customs_export', title: '海关出口台账', fields: [
    { name: 'region', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '地区' } },
    { name: 'month', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '月份' } },
    { name: 'amount_t', type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '金额' } },
  ] },
  { name: 'orders', title: '专家服务订单', fields: [
    { name: 'orderNo', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '订单号' } },
    { name: 'serviceId', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '服务ID' } },
    { name: 'serviceName', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '服务名称' } },
    { name: 'price', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '价格' } },
    { name: 'brief', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '需求简述' } },
    { name: 'clientName', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '客户' } },
    { name: 'expertName', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '专家' } },
    { name: 'expertOrg', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '专家机构' } },
    { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: ORDER_STATUS_OPTIONS } },
    { name: 'error', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '错误信息' } },
    { name: 'deliverablePath', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '附件路径' } },
    { name: 'deliverableUrl', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '附件链接' } },
    { name: 'generatedAt', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '生成时间' } },
    { name: 'note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '备注' } },
    { name: 'deliverable', type: 'belongsToMany', interface: 'attachment', target: 'attachments', through: 'orders_deliverables', uiSchema: { type: 'object', 'x-component': 'AssociationField', title: '交付附件', 'x-component-props': { multiple: true } } },
  ] },
]

/** Run one child command inheriting stdio; returns whether it exited 0. */
function run(command: string, args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): boolean {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: options.cwd, env: { ...process.env, ...options.env } })
  return result.status === 0
}

/**
 * Resilience budgets for one REST call. The per-attempt timeout covers the
 * seeding client's own 30s window, so the outer budget never races it; a
 * half-open backend fails within the budget instead of hanging setup forever.
 */
const CALL_RETRY = { attempts: 2, timeoutMs: 45_000, baseDelayMs: 500 } as const
/** Timeout budget only: a retried create could land a duplicate row, a retried toggle would flip back. */
const CALL_ONCE = { ...CALL_RETRY, attempts: 1 } as const

/**
 * One authorized REST call against the running NocoBase under the shared
 * resilience policy. GETs retry (idempotent); POSTs default to the timeout
 * budget alone — a retried create could land a duplicate row, a retried
 * toggle would flip back — and idempotent-modeled call sites opt back into
 * retries explicitly, mirroring the demo runner's convention.
 */
async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown, options: ResilienceOptions = {}): Promise<unknown> {
  return withResilience(`setup ${method} ${path}`, async signal => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
    }
    return payload
  }, { ...(method === 'GET' ? CALL_RETRY : CALL_ONCE), ...options })
}

/** Extract the `data` slot of one response (the v2 wire wrapper). */
async function dataOf(token: string, method: 'GET' | 'POST', path: string, body?: unknown, options: ResilienceOptions = {}): Promise<any> {
  const payload = await call(token, method, path, body, options) as { data?: unknown } | null
  return payload?.data ?? null
}

/** Sign in as the root user and return the JWT. */
async function signIn(): Promise<string> {
  // Sign-in is idempotent (a fresh JWT per call), so it retries safely.
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword }, CALL_RETRY) as { data?: { token?: string } }
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

/** True when the server answers at all (any HTTP status, including 401/503). */
async function serverUp(): Promise<boolean> {
  try {
    await fetch(`${baseUrl}/api/app:getInfo`, { signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

/** True when the app is installed and the root account can sign in. */
async function healthy(): Promise<boolean> {
  try {
    await signIn()
    return true
  } catch {
    return false
  }
}

/** True when the built client shell answers at the app root (full UI, not the API-only 404 shell). */
async function uiReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(5000) })
    if (!response.ok) return false
    return (await response.text()).includes('__nocobase_public_path__')
  } catch {
    return false
  }
}

/** Start local postgres if the data directory exists but the server is down. */
function ensurePostgres(): void {
  const candidates = [
    process.env.NOCOBASE_PG_DATA,
    '/usr/local/var/postgresql@17',
    '/usr/local/var/postgres',
    '/opt/homebrew/var/postgresql@17',
    '/opt/homebrew/var/postgres',
  ].filter((dir): dir is string => dir !== undefined && existsSync(dir))
  const pgData = candidates[0]
  if (pgData === undefined) {
    console.log('setup-nocobase: no local postgres data dir found; assuming a server is already reachable')
    return
  }
  const status = spawnSync('pg_ctl', ['-D', pgData, 'status'], { encoding: 'utf8' })
  if ((status.output?.join('') ?? '').includes('no server running')) {
    console.log(`setup-nocobase: starting postgres (${pgData})`)
    if (!run('pg_ctl', ['-D', pgData, '-l', '/tmp/nocobase-dsh-pg.log', 'start'])) {
      throw new Error('pg_ctl start failed (see /tmp/nocobase-dsh-pg.log)')
    }
  }
  // The nocobase role/database (idempotent probes, then creates).
  const exists = (sql: string): boolean => {
    const probe = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'postgres', '-tAc', sql], { encoding: 'utf8' })
    return (probe.stdout ?? '').trim().length > 0
  }
  if (!exists("SELECT 1 FROM pg_roles WHERE rolname='nocobase'")) {
    run('psql', ['-U', process.env.USER ?? 'mac', '-d', 'postgres', '-c', "CREATE ROLE nocobase LOGIN PASSWORD 'nocobase' CREATEDB"])
  }
  if (!exists("SELECT 1 FROM pg_database WHERE datname='nocobase'")) {
    run('psql', ['-U', process.env.USER ?? 'mac', '-d', 'postgres', '-c', 'CREATE DATABASE nocobase OWNER nocobase'])
  }
}

const NC_ENV = {
  DB_DIALECT: 'postgres',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_DATABASE: 'nocobase',
  DB_USER: 'nocobase',
  DB_PASSWORD: 'nocobase',
  APP_PORT: baseUrl.endsWith(':13000') ? '13000' : new URL(baseUrl).port,
  INIT_ROOT_EMAIL: rootEmail,
  INIT_ROOT_PASSWORD: rootPassword,
  INIT_ROOT_NICKNAME: 'Super Admin',
  INIT_ROOT_USERNAME: 'nocobase',
}

/**
 * Build the full-UI artifacts (`packages/core/app/dist/client`): the legacy
 * shell plus the modern client under `v/`. Idempotent by both index files
 * existing; `NOCOBASE_FORCE_BUILD=1` rebuilds anyway. Independent of the
 * database, so `reset` keeps the artifacts.
 */
async function stepBuild(): Promise<void> {
  const shellIndex = join(ncHome, 'packages/core/app/dist/client/index.html')
  const modernIndex = join(ncHome, 'packages/core/app/dist/client/v/index.html')
  if (process.env.NOCOBASE_FORCE_BUILD !== '1' && existsSync(shellIndex) && existsSync(modernIndex)) {
    console.log('setup-nocobase: client build artifacts present (kept; set NOCOBASE_FORCE_BUILD=1 to rebuild)')
    return
  }
  if (!existsSync(join(ncHome, 'node_modules/.bin/nocobase-v1'))) {
    throw new Error(`dependencies missing under ${ncHome}; run "install" first`)
  }
  console.log(`setup-nocobase: building client + server artifacts (first run takes ~20 min; log: ${buildLog})`)
  const started = Date.now()
  const fs = await import('node:fs')
  const logFd = fs.openSync(buildLog, 'a')
  const result = spawnSync('yarn', ['build'], { cwd: ncHome, env: { ...process.env, ...NC_ENV }, stdio: ['ignore', logFd, logFd] })
  if (result.status !== 0 || !existsSync(shellIndex) || !existsSync(modernIndex)) {
    throw new Error(`yarn build did not produce the client artifacts (exit ${result.status}); inspect ${buildLog}`)
  }
  console.log(`setup-nocobase: build finished in ${Math.round((Date.now() - started) / 1000)}s`)
}

async function stepInstall(): Promise<void> {
  if (!existsSync(ncHome)) {
    throw new Error(`NocoBase snapshot not found at ${ncHome}; set NOCOBASE_HOME to a source checkout (edits there need a MANIFEST local-modifications entry)`)
  }
  if (!existsSync(join(ncHome, 'node_modules/.bin/nocobase-v1'))) {
    console.log(`setup-nocobase: yarn install in ${ncHome} (first run takes ~15 min)`)
    if (!run('yarn', ['install', '--network-timeout', '600000'], { cwd: ncHome })) throw new Error('yarn install failed')
  }
  ensurePostgres()
  console.log('setup-nocobase: yarn nocobase install (creates tables and the root user)')
  if (!run('yarn', ['nocobase', 'install'], { cwd: ncHome, env: NC_ENV })) {
    throw new Error('yarn nocobase install failed; is postgres up with the nocobase role/database?')
  }
}

async function stepStart(): Promise<void> {
  if (await serverUp()) {
    console.log(`setup-nocobase: server already answers at ${baseUrl}`)
    if (await healthy()) {
      if (!(await uiReachable())) console.log(`setup-nocobase: warning — full UI not built; ${baseUrl}/ stays an API-only 404 shell until "build" runs`)
      return
    }
    throw new Error(`server is up at ${baseUrl} but ${rootEmail} cannot sign in; run "reset" for a clean slate or check NOCOBASE_ROOT_*`)
  }
  ensurePostgres()
  console.log(`setup-nocobase: starting dev-server in the background (log: ${serverLog})`)
  const logFd = await import('node:fs').then(fs => fs.openSync(serverLog, 'a'))
  const child = spawn('yarn', ['dev-server'], {
    cwd: ncHome,
    env: { ...process.env, ...NC_ENV },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()
  const deadline = Date.now() + 5 * 60_000
  while (Date.now() < deadline) {
    if (await healthy()) {
      console.log(`setup-nocobase: server healthy at ${baseUrl}`)
      if (!(await uiReachable())) console.log(`setup-nocobase: warning — full UI not built; ${baseUrl}/ stays an API-only 404 shell until "build" runs`)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error(`server did not become healthy within 5 min; inspect ${serverLog}`)
}

async function stepInit(): Promise<void> {
  if (!(await healthy())) throw new Error(`no healthy NocoBase at ${baseUrl}; run "start" first`)
  const token = await signIn()

  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`setup-nocobase: collection ${collection.name} exists (kept)`)
      continue
    }
    // Collections are unique by name: a retried create after a lost answer
    // fails loud on the duplicate instead of double-writing, so it retries.
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields }, CALL_RETRY)
    console.log(`setup-nocobase: collection ${collection.name} created`)
  }

  // One fresh API key per init: revoke same-named leftovers first so the
  // credential in .env is always the only live one.
  const keys = await dataOf(token, 'GET', `/api/apiKeys:list?filter=${encodeURIComponent(JSON.stringify({ name: { $eq: API_KEY_NAME } }))}&pageSize=100`) as { data?: Array<{ id: number }> }
  for (const key of keys?.data ?? []) {
    // Destroying an already-destroyed key is a no-op; the retry is safe.
    await call(token, 'POST', `/api/apiKeys:destroy?filterByTk=${key.id}`, undefined, CALL_RETRY)
  }
  const keyRow = await dataOf(token, 'POST', '/api/apiKeys:create', { name: API_KEY_NAME, role: { name: 'root' }, expiresIn: '365d' }) as { token?: string }
  if (typeof keyRow?.token !== 'string' || keyRow.token.length === 0) {
    throw new Error('apiKeys:create returned no token (the v2 wire needs the fields at the body top level)')
  }
  console.log(`setup-nocobase: API key "${API_KEY_NAME}" issued (root role, 365d)`)

  // Seed the expert dataset through the same REST client path the harness
  // uses, unless a previous run already landed rows.
  const experts = await call(token, 'GET', '/api/experts:list?pageSize=1') as { data?: unknown[] }
  if ((experts?.data?.length ?? 0) > 0) {
    console.log(`setup-nocobase: experts already seeded (${experts?.data?.length}+ rows, kept)`)
  } else {
    const { NocoBaseClient } = await import('@deepseek-ai/dsh-connector-nocobase')
    const { seedExpertDataset } = await import('./seed-experts.mts')
    const fixtures = JSON.parse(readFileSync(join(repoRoot, 'examples/kb-agent/workspace/data/experts/dataset.json'), 'utf8'))
    const report = await seedExpertDataset(new NocoBaseClient({ baseUrl, token: keyRow.token }), fixtures)
    console.log(`setup-nocobase: expert dataset seeded ${JSON.stringify(report)}`)
  }

  await ensureWorkflow(token)

  writeEnv(baseUrl, keyRow.token)
  console.log(`setup-nocobase: credentials written to ${envFile} (NOCOBASE_BASE_URL / NOCOBASE_API_KEY)`)
}

/** Create the approval workflow with its four-node chain; idempotent by title. */
async function ensureWorkflow(token: string): Promise<void> {
  const found = await call(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=1`) as { data?: Array<{ id: number }> }
  if ((found?.data?.length ?? 0) > 0) {
    console.log(`setup-nocobase: workflow "${WORKFLOW_TITLE}" exists (kept)`)
    return
  }
  const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
    title: WORKFLOW_TITLE,
    enabled: true,
    type: 'collection',
    // `mode` is the CollectionTrigger's bitmap (CREATE=1 → the
    // `orders.afterCreateWithAssociations` db event), not an event string.
    config: { collection: 'orders', mode: 1 },
  }) as { id: number }
  // Enabling at create time lands the row without registering the db hook;
  // one off/on toggle cycle mounts it (verified against 2.2.6). A retried
  // toggle would flip back — the POST default keeps one attempt.
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  const manual = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id,
    title: '订单审批',
    type: 'manual',
    // Both actions resolve the job so the condition below can branch on the
    // chosen action key; a REJECTED action status would end the execution
    // before any reject branch could run.
    config: {
      assignees: [1],
      forms: { f1: { type: 'custom', actions: [{ key: 'resolve', status: 1 }, { key: 'reject', status: 1 }] } },
    },
  }) as { id: number, key: string }
  const condition = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id,
    title: '审批结果分支',
    type: 'condition',
    upstreamId: manual.id,
    config: {
      engine: 'basic',
      rejectOnFalse: false,
      // The scope exposes job results keyed by node *key* (not id): the
      // manual job's result is `{f1: {...}, _: <actionKey>}`.
      calculation: { calculator: 'equal', operands: [`{{$jobsMapByNodeKey.${manual.key}._}}`, 'resolve'] },
    },
  }) as { id: number }
  // The main chain needs the explicit downstream link — `upstreamId` alone
  // leaves the execution ending at the manual node (branch children attach
  // by upstreamId + branchIndex, main-chain siblings do not).
  // An update sets values by id; repeating it is a no-op, so it retries.
  await dataOf(token, 'POST', `/api/flow_nodes:update?filterByTk=${manual.id}`, { downstreamId: condition.id }, CALL_RETRY)
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id,
    title: '回调 DSH 生成交付物',
    type: 'request',
    upstreamId: condition.id,
    branchIndex: 1,
    config: {
      url: `${dshCallback}/api/orders.fulfill`,
      method: 'POST',
      // The gateway's write fence only admits application/json; the value
      // here becomes the literal Content-Type header ('json' would 415).
      contentType: 'application/json',
      // The collection trigger's context is `{data: <row>}`, so the row id
      // lives at `$context.data.id`.
      data: { type: 'client-request', rpcId: 'wf-{{$context.data.id}}', method: 'orders.fulfill', payload: { order_id: '{{$context.data.id}}' } },
      timeout: 300000,
    },
  })
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id,
    title: '驳回标记失败',
    type: 'update',
    upstreamId: condition.id,
    branchIndex: 0,
    config: {
      collection: 'orders',
      params: { filter: { id: '{{$context.data.id}}' }, values: { status: 'failed', error: '审批驳回' } },
    },
  })
  console.log(`setup-nocobase: workflow "${WORKFLOW_TITLE}" created (manual → condition → request | update), callback ${dshCallback}/api/orders.fulfill`)
}

/**
 * Wait until the app answers both sign-in and a pm call again. pm:enable is
 * an app command: after it returns, the app reloads its data sources
 * (503 APP_COMMANDING on every request) until the command settles, so the
 * next enable must wait for that window to close.
 */
async function waitAppReady(token: string): Promise<void> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/pm:list?pageSize=1`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)
    if (response !== null && response.ok) return
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new Error('app did not leave the pm-command maintaining window within 3 min')
}

/**
 * Wire the built-in AI employees to MiniMax through the repo's configured
 * OpenAI-compatible endpoint (batch B4), as an idempotent upsert on the
 * `options.baseURL`/`options.apiKey` pair (N22): without at least one
 * llmServices row the AI panel renders but every employee answers nothing —
 * the empty table was the root cause of "no AI employees visible in action".
 * The default target is the local N22 attachment proxy (PDF visibility); pass
 * LLM_DIRECT_BASE for the direct upstream.
 */
async function ensureLlmService(token: string, baseURL: string = LLM_PROXY_BASE): Promise<void> {
  const list = await call(token, 'GET', `/api/llmServices:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: LLM_SERVICE_TITLE } }))}&pageSize=10`) as { data?: Array<{ name?: string, id?: number, options?: { baseURL?: string, apiKey?: string } }> }
  const apiKey = resolveEnv('MINIMAX_API_KEY')
  if (apiKey === undefined) {
    throw new Error('MINIMAX_API_KEY not found in env nor the repository root .env; the AI employees need it')
  }
  const row = list?.data?.[0]
  // llmServices has no auto id column — the primary key is the `name` string,
  // so an update keyed on a missing numeric id silently matches zero rows.
  if (row === undefined || (row.name === undefined && row.id === undefined)) {
    await call(token, 'POST', '/api/llmServices:create', {
      title: LLM_SERVICE_TITLE,
      provider: 'openai-completions',
      options: { baseURL, apiKey },
      enabledModels: ['MiniMax-M3'],
      enabled: true,
    })
    console.log(`setup-nocobase: llmService "${LLM_SERVICE_TITLE}" created (openai-completions → ${baseURL}, model MiniMax-M3)`)
    return
  }
  if (row.options?.baseURL === baseURL && row.options?.apiKey === apiKey) {
    console.log(`setup-nocobase: llmService "${LLM_SERVICE_TITLE}" exists (kept, baseURL ${baseURL})`)
    return
  }
  // Repeating an update with the same values is a no-op, so it retries.
  await call(token, 'POST', `/api/llmServices:update?filterByTk=${encodeURIComponent(String(row.name ?? row.id))}`, {
    options: { ...row.options, baseURL, apiKey },
    enabledModels: ['MiniMax-M3'],
    enabled: true,
  }, CALL_RETRY)
  console.log(`setup-nocobase: llmService "${LLM_SERVICE_TITLE}" updated (baseURL ${row.options?.baseURL ?? '?'} → ${baseURL})`)
}

/** True when the N22 attachment proxy answers its keyless health probe. */
async function proxyHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${AI_PROXY_PORT}/healthz`, { signal: AbortSignal.timeout(3000) })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Bring the N22 attachment proxy up (idempotent) and point the llmService at
 * it while NocoBase is reachable. A second run while healthy is a no-op.
 */
async function stepAiProxyStart(): Promise<void> {
  if (await proxyHealthy()) {
    console.log(`setup-nocobase: ai-proxy already healthy at 127.0.0.1:${AI_PROXY_PORT} (kept)`)
  } else {
    if (existsSync(aiProxyPidFile)) rmSync(aiProxyPidFile)
    console.log(`setup-nocobase: starting ai-proxy in the background (log: ${aiProxyLog})`)
    const fs = await import('node:fs')
    const logFd = fs.openSync(aiProxyLog, 'a')
    const child = spawn(process.execPath, ['--import', 'tsx/esm', aiProxyScript], {
      cwd: repoRoot,
      env: process.env,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    })
    child.unref()
    mkdirSync(dirname(aiProxyPidFile), { recursive: true })
    writeFileSync(aiProxyPidFile, String(child.pid))
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline && !(await proxyHealthy())) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (!(await proxyHealthy())) {
      throw new Error(`ai-proxy did not become healthy within 20s; inspect ${aiProxyLog}`)
    }
    console.log(`setup-nocobase: ai-proxy healthy at 127.0.0.1:${AI_PROXY_PORT}`)
  }
  if (await healthy()) {
    await ensureLlmService(await signIn())
  } else {
    console.log(`setup-nocobase: warning — NocoBase not healthy at ${baseUrl}; run "ai" once it is up to point the llmService at the proxy`)
  }
}

/**
 * Stop the N22 attachment proxy (idempotent) and automatically roll the
 * llmService back to the direct upstream while NocoBase is reachable — the
 * chosen stop behavior (documented in the usage header) keeps the AI surface
 * from staying wired to a dead proxy.
 */
async function stepAiProxyStop(): Promise<void> {
  const wasRunning = await proxyHealthy()
  if (wasRunning) {
    const pid = existsSync(aiProxyPidFile) ? Number(readFileSync(aiProxyPidFile, 'utf8').trim()) : Number.NaN
    if (Number.isInteger(pid)) process.kill(pid, 'SIGTERM')
    else spawnSync('pkill', ['-f', 'nocobase-n22-llm-proxy'])
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && await proxyHealthy()) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (await proxyHealthy()) throw new Error('ai-proxy still healthy 10s after SIGTERM; kill it manually (pkill -f nocobase-n22-llm-proxy)')
    console.log('setup-nocobase: ai-proxy stopped')
  } else {
    console.log('setup-nocobase: ai-proxy not running (no-op)')
  }
  if (existsSync(aiProxyPidFile)) rmSync(aiProxyPidFile)
  if (await healthy()) {
    await ensureLlmService(await signIn(), LLM_DIRECT_BASE)
    console.log(`setup-nocobase: llmService "${LLM_SERVICE_TITLE}" rolled back to the direct upstream ${LLM_DIRECT_BASE}`)
  } else if (wasRunning) {
    console.log(`setup-nocobase: NocoBase not healthy at ${baseUrl}; once it is up run "ai-direct" to roll the llmService back to ${LLM_DIRECT_BASE}`)
  }
}

/** Enable every shipped-but-disabled feature plugin; idempotent by enabled state. */
async function stepPlugins(): Promise<void> {
  if (!(await healthy())) throw new Error(`no healthy NocoBase at ${baseUrl}; run "start" first`)
  const token = await signIn()
  // pm:list returns `{data: rows, meta}`; the data slot is the row array.
  const payload = await call(token, 'GET', '/api/pm:list?pageSize=300') as { data?: Array<{ name?: string, enabled?: boolean }> }
  const enabled = new Set((payload?.data ?? []).filter(plugin => plugin.enabled === true).map(plugin => plugin.name))
  let changed = 0
  for (const name of [...PLUGINS, ...TRIAL_PLUGINS]) {
    if (enabled.has(name)) {
      console.log(`setup-nocobase: plugin ${name} already enabled (kept)`)
      continue
    }
    try {
      // Enabling an already-enabled plugin is a no-op, so the retry is safe.
      await call(token, 'POST', `/api/pm:enable?filterByTk=${name}`, undefined, CALL_RETRY)
      changed += 1
      console.log(`setup-nocobase: plugin ${name} enabled`)
    } catch (error) {
      if ((TRIAL_PLUGINS as readonly string[]).includes(name)) {
        console.log(`setup-nocobase: trial plugin ${name} not enableable (dropped): ${String(error).slice(0, 200)}`)
        continue
      }
      throw error
    }
    await waitAppReady(token)
  }
  if (changed > 0) console.log('setup-nocobase: restart required for the newly enabled plugins ("stop" + "start")')
}

async function stepVerify(): Promise<void> {
  const token = await signIn()
  const failures: string[] = []
  if (!(await uiReachable())) {
    failures.push(`full UI not reachable at ${baseUrl}/ (API-only shell; run "build" for the client artifacts)`)
  }
  for (const collection of COLLECTIONS) {
    const row = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (row === null) failures.push(`collection ${collection.name} missing`)
  }
  // The attachment field lives in the fields table; collections:get does not
  // append it, so probe fields:list scoped to the orders collection.
  const fields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'orders' } }))}&pageSize=200`) as { data?: Array<{ name?: string, type?: string }> }
  const deliverableField = (fields?.data ?? []).find(field => field.name === 'deliverable')
  if (deliverableField === undefined) failures.push('orders.deliverable attachment field missing')
  else if (deliverableField.type !== 'belongsToMany') failures.push(`orders.deliverable is "${deliverableField.type}", not belongsToMany`)
  const experts = await call(token, 'GET', '/api/experts:list?pageSize=100') as { data?: Array<{ name?: string }>, meta?: { count?: number } }
  if ((experts?.data?.length ?? 0) < 1) failures.push('experts not seeded')
  else if (!(experts?.data ?? []).some(row => row.name === '张红喜')) failures.push('张红喜 row not seeded')
  const services = await call(token, 'GET', '/api/expert_services:list?pageSize=100') as { data?: unknown[] }
  if ((services?.data?.length ?? 0) < 3) failures.push('expert_services not seeded')
  const workflows = await call(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=1`) as { data?: Array<{ id: number, enabled?: boolean }> }
  const workflow = workflows?.data?.[0]
  if (workflow === undefined) {
    failures.push(`workflow "${WORKFLOW_TITLE}" missing`)
  } else {
    if (workflow.enabled !== true) failures.push('workflow not enabled')
    const nodes = await call(token, 'GET', `/api/flow_nodes:list?filter=${encodeURIComponent(JSON.stringify({ workflow: { id: workflow.id } }))}&pageSize=100`) as { data?: Array<{ type: string, title: string, branchIndex?: number, upstreamId?: number }> }
    const chain = nodes?.data ?? []
    const manual = chain.find(node => node.type === 'manual')
    const condition = chain.find(node => node.type === 'condition')
    const request = chain.find(node => node.type === 'request')
    const update = chain.find(node => node.type === 'update')
    if (manual === undefined || condition === undefined || request === undefined || update === undefined) {
      failures.push(`workflow node chain incomplete: ${JSON.stringify(chain.map(node => node.type))}`)
    } else if (condition.upstreamId !== manual.id || manual.downstreamId !== condition.id || request.upstreamId !== condition.id || request.branchIndex !== 1 || update.upstreamId !== condition.id || update.branchIndex !== 0) {
      failures.push('workflow node chain wiring is wrong')
    }
  }
  const llmServices = await call(token, 'GET', '/api/llmServices:list?pageSize=20') as { data?: Array<{ enabled?: boolean, title?: string, options?: { baseURL?: string } }> }
  if ((llmServices?.data ?? []).every(service => service.enabled !== true)) {
    failures.push('no enabled llmService (AI employees cannot answer; re-run "ai" or "init")')
  }
  // N22: the attachment proxy must be healthy and the llmService must point
  // at it — a missing proxy means PDF attachments fall back to the silently
  // ignored file part, so both states fail loud with their fix command.
  const proxyProbe = await fetch(`http://127.0.0.1:${AI_PROXY_PORT}/healthz`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
  if (proxyProbe === null || !proxyProbe.ok) {
    failures.push(`AI attachment proxy not healthy at http://127.0.0.1:${AI_PROXY_PORT}/healthz; run "node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts ai-proxy start"`)
  }
  const minimax = (llmServices?.data ?? []).find(service => service.title === LLM_SERVICE_TITLE)
  if (minimax === undefined) {
    failures.push(`llmService "${LLM_SERVICE_TITLE}" missing; run "ai" (with the proxy up) or "init"`)
  } else if (minimax.options?.baseURL !== LLM_PROXY_BASE) {
    failures.push(`llmService "${LLM_SERVICE_TITLE}" baseURL is ${JSON.stringify(minimax.options?.baseURL)}, expected the attachment proxy ${LLM_PROXY_BASE}; run "ai-proxy start" (or "ai" while the proxy is up)`)
  }
  // The admin-side AI employee entry is the "AI 工作台" v2 flowPage (N13);
  // its absence means the n13-rebuild replay never ran.
  const workbenchRoutes = await call(token, 'GET', `/api/desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: 'AI 工作台' }, type: { $eq: 'flowPage' } }))}&pageSize=1`) as { data?: Array<{ id: number }> }
  if ((workbenchRoutes?.data?.length ?? 0) === 0) failures.push('AI workbench flowPage missing (run the all chain so nocobase-n13-rebuild.mts replays)')
  // N17: platform zh-CN, the app-hub stand-in for multi-portal, and the v2
  // flowPage upgrades whose floating ball is the official AI entry.
  const settings = await dataOf(token, 'GET', '/api/systemSettings:get') as { enabledLanguages?: string[], options?: { enabledLanguages?: string[] } }
  // Both layers must say zh-CN: admin reads options.enabledLanguages, the
  // portals read the top-level column (N17 finding).
  if (JSON.stringify(settings?.enabledLanguages) !== JSON.stringify(['zh-CN']) || JSON.stringify(settings?.options?.enabledLanguages) !== JSON.stringify(['zh-CN'])) {
    failures.push(`systemSettings enabledLanguages is ${JSON.stringify(settings?.enabledLanguages)}/${JSON.stringify(settings?.options?.enabledLanguages)} (expected ["zh-CN"] on both layers)`)
  }
  const appHubRoutes = await call(token, 'GET', `/api/desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: '应用中心' } }))}&pageSize=1`) as { data?: Array<{ id: number }> }
  if ((appHubRoutes?.data?.length ?? 0) === 0) failures.push('应用中心 app hub page missing (run nocobase-n17-alignment.mts)')
  const v2Routes = await call(token, 'GET', `/api/desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ type: { $eq: 'flowPage' } }))}&pageSize=100`) as { data?: Array<{ title?: string | null }> }
  const v2Titles = new Set((v2Routes?.data ?? []).map(row => row.title ?? ''))
  const missingV2 = ['客户', '销售线索', '联系人', '订单', '报价单', '工单', '资产台账', '员工', '项目', '任务列表', '里程碑'].filter(title => !v2Titles.has(title))
  if (missingV2.length > 0) failures.push(`v2 table flowPages missing: ${missingV2.join(', ')} (run nocobase-n17-alignment.mts + nocobase-e1-pj-v2.mts for the 项目管理 pages)`)
  // F1: the two view pages ride the flowModel catalog (kanban + calendar
  // blocks on hub_pj_tasks); their trees must keep the view block plus the
  // card chain, or the "upgrade" silently degraded to a blank page.
  const missingV2Views = ['任务看板', '任务日历'].filter(title => !v2Titles.has(title))
  if (missingV2Views.length > 0) failures.push(`v2 view flowPages missing: ${missingV2Views.join(', ')} (run nocobase-f1-view-v2.mts)`)
  // F2: the five remaining CRM table pages (the two "仪表盘" pages are table
  // pages despite the name; both menu entries stay — see QUICKSTART).
  const missingV2Crm = ['产品与服务', '回款', '发票', '客户仪表盘', '销售仪表盘'].filter(title => !v2Titles.has(title))
  if (missingV2Crm.length > 0) failures.push(`v2 CRM flowPages missing: ${missingV2Crm.join(', ')} (run nocobase-f2-crm-v2.mts)`)
  // F3: the Hub/HR/master-data pages, including the two composite pages
  // (工作台 = two stacked table blocks, 分类维护 = four) and the B0
  // hub_po_suppliers read view under the 采购 group.
  const missingV2Hub = ['知识文章', '维保记录', '部门', '请假审批', '供应商', '采购联系人（历史）', '工作台', '分类维护'].filter(title => !v2Titles.has(title))
  if (missingV2Hub.length > 0) failures.push(`v2 Hub flowPages missing: ${missingV2Hub.join(', ')} (run nocobase-f3-hub-v2.mts then nocobase-w2-supplier.mts; B2 retitled 采购供应商 → 采购联系人（历史）)`)
  // B0: the mobile form-assistant writes hub_po_suppliers with status=待审核;
  // the enum must carry that literal or the v2 column filter swallows the rows.
  {
    const supplierStatus = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_po_suppliers' }, name: { $eq: 'status' } }))}&pageSize=5`) as { data?: Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> }
    const values = (supplierStatus?.data?.[0]?.uiSchema?.enum ?? []).map(option => option.value)
    if (!values.includes('待审核')) failures.push(`hub_po_suppliers.status enum lacks 待审核 (${JSON.stringify(values)}); re-run nocobase-hub-modules.mts so the enum alignment appends it`)
  }
  // H4: the SRM pages under the 供应链 group (six table/chart pages + the
  // CAPA kanban + the admission second view).
  const missingV2H4 = ['供应商档案', '供应商准入', '证照效期预警', '审核检查表', '审核评分录入', '绩效评分卡', '供应商绩效雷达', '整改跟踪'].filter(title => !v2Titles.has(title))
  if (missingV2H4.length > 0) failures.push(`v2 SRM flowPages missing: ${missingV2H4.join(', ')} (run nocobase-h4-srm.mts)`)
  const srmGroupRoutes = await call(token, 'GET', `/api/desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: '供应链' }, type: { $eq: 'group' } }))}&pageSize=1`) as { data?: Array<{ id: number }> }
  if ((srmGroupRoutes?.data?.length ?? 0) === 0) failures.push('供应链 menu group missing (run nocobase-h4-srm.mts)')
  // H5: the WMS pages under the 仓储管理 group (eight tables + the bin-map
  // page whose JSBlock is the A-route custom block).
  const missingV2H5 = ['仓库库区', '库位平面图', '入库单', '出库单', '库存查询', '批次主数据', '盘点管理', '移库管理', '库存流水'].filter(title => !v2Titles.has(title))
  if (missingV2H5.length > 0) failures.push(`v2 WMS flowPages missing: ${missingV2H5.join(', ')} (run nocobase-h5-wms.mts)`)
  const wmsGroupRoutes = await call(token, 'GET', `/api/desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: '仓储管理' }, type: { $eq: 'group' } }))}&pageSize=1`) as { data?: Array<{ id: number }> }
  if ((wmsGroupRoutes?.data?.length ?? 0) === 0) failures.push('仓储管理 menu group missing (run nocobase-h5-wms.mts)')
  // W1: the approval engine's NocoBase side — the six wfl_* collections, the
  // 审批中心 page under 协同办公, the activated pilot flow config, and the
  // receipts→purchase-order gate.
  for (const wflCollection of ['wfl_flow_configs', 'wfl_flow_states', 'wfl_flow_transitions', 'wfl_approval_records', 'wfl_approval_todos', 'wfl_gate_configs']) {
    const row = await dataOf(token, 'GET', `/api/collections/${wflCollection}`)
    if (row === null) failures.push(`wfl collection ${wflCollection} missing (run nocobase-w1-approval.mts)`)
  }
  const missingV2W1 = ['审批中心'].filter(title => !v2Titles.has(title))
  if (missingV2W1.length > 0) failures.push(`v2 approval flowPages missing: ${missingV2W1.join(', ')} (run nocobase-w1-approval.mts)`)
  const w1GroupRoutes = await call(token, 'GET', `/api/desktopRoutes:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: '协同办公' }, type: { $eq: 'group' } }))}&pageSize=1`) as { data?: Array<{ id: number }> }
  if ((w1GroupRoutes?.data?.length ?? 0) === 0) failures.push('协同办公 menu group missing (run nocobase-w1-approval.mts)')
  {
    const flowConfigs = await call(token, 'GET', `/api/wfl_flow_configs:list?filter=${encodeURIComponent(JSON.stringify({ doc_type: { $eq: 'hub_po_purchase_orders' }, is_active: true }))}&pageSize=5`) as { data?: Array<{ state_field?: string }> }
    if ((flowConfigs?.data?.length ?? 0) === 0) failures.push('hub_po_purchase_orders has no active approval flow config (run nocobase-w1-approval.mts / approval-engine.mts --seed-flow)')
    const gates = await call(token, 'GET', `/api/wfl_gate_configs:list?filter=${encodeURIComponent(JSON.stringify({ downstream_collection: { $eq: 'wms_receipts' } }))}&pageSize=5`) as { data?: unknown[] }
    if ((gates?.data?.length ?? 0) === 0) failures.push('wms_receipts→hub_po_purchase_orders gate config missing (run nocobase-w1-approval.mts)')
    const poFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_po_purchase_orders' }, name: { $eq: 'doc_status' } }))}&pageSize=5`) as { data?: unknown[] }
    if ((poFields?.data?.length ?? 0) === 0) failures.push('hub_po_purchase_orders.doc_status missing (run nocobase-w1-approval.mts)')
  }
  // B2: the supplier single source — the admission flow over srm_suppliers,
  // the AVL gate on purchase-order creation, the h4 create-triggered workflow
  // retired, and the h4 seed rows untouched by the lifecycle change.
  {
    const admissionConfigs = await call(token, 'GET', `/api/wfl_flow_configs:list?filter=${encodeURIComponent(JSON.stringify({ doc_type: { $eq: 'srm_suppliers' }, is_active: true }))}&pageSize=5`) as { data?: Array<{ state_field?: string }> }
    if ((admissionConfigs?.data?.length ?? 0) === 0) failures.push('srm_suppliers has no active admission flow config (run nocobase-w2-supplier.mts)')
    else if (admissionConfigs?.data?.[0]?.state_field !== 'lifecycle_status') failures.push('srm_suppliers admission flow must ride state_field=lifecycle_status (run nocobase-w2-supplier.mts)')
    const supplierGates = await call(token, 'GET', `/api/wfl_gate_configs:list?filter=${encodeURIComponent(JSON.stringify({ downstream_collection: { $eq: 'hub_po_purchase_orders' }, upstream_collection: { $eq: 'srm_suppliers' } }))}&pageSize=5`) as { data?: Array<{ upstream_state_field?: string | null, required_status?: string | null }> }
    const supplierGate = supplierGates?.data?.[0]
    if (supplierGate === undefined) failures.push('hub_po_purchase_orders→srm_suppliers supplier gate missing (run nocobase-w2-supplier.mts)')
    else if (supplierGate.upstream_state_field !== 'lifecycle_status' || supplierGate.required_status !== 'qualified,preferred') {
      failures.push('the supplier gate must read lifecycle_status ∈ qualified,preferred (run nocobase-w2-supplier.mts)')
    }
    const h4Workflows = await call(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: 'SRM供应商准入审批' } }))}&pageSize=5`) as { data?: Array<{ enabled?: boolean }> }
    if ((h4Workflows?.data?.length ?? 0) > 0 && h4Workflows?.data?.[0]?.enabled !== false) {
      failures.push('the h4 SRM供应商准入审批 workflow must be disabled (the wfl engine owns the admission lifecycle; run nocobase-w2-supplier.mts)')
    }
    const seeded = await call(token, 'GET', `/api/srm_suppliers:list?filter=${encodeURIComponent(JSON.stringify({ name: { $eq: '珠海鲜丰水产科技有限公司' } }))}&pageSize=5`) as { data?: Array<{ lifecycle_status?: string }> }
    if ((seeded?.data?.length ?? 0) === 0 || seeded?.data?.[0]?.lifecycle_status !== 'qualified') {
      failures.push('the h4 seed supplier 珠海鲜丰水产科技有限公司 must stay qualified (lifecycle untouched by the B2 change; run the all chain)')
    }
  }
  // B3: the procurement full chain — nine pur_* collections, the 采购管理
  // seven pages + group, the six gate rows, the four flow configs, the
  // wms_receipts PO/IQC columns, and the 待检区 seed.
  {
    for (const purCollection of ['pur_requests', 'pur_request_lines', 'pur_rfqs', 'pur_rfq_suppliers', 'pur_quotes', 'pur_orders', 'pur_order_lines', 'pur_invoices', 'pur_payments']) {
      const row = await dataOf(token, 'GET', `/api/collections/${purCollection}`)
      if (row === null) failures.push(`pur collection ${purCollection} missing (run nocobase-w3-procurement.mts)`)
    }
    const purRoutes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null, type?: string }> }
    const purTitles = new Set((purRoutes?.data ?? []).map(row => row.title ?? ''))
    const missingPur = ['采购申请', '询价管理', '供应商报价', '比价表', '采购订单', '发票匹配', '付款申请'].filter(title => !purTitles.has(title))
    if (missingPur.length > 0) failures.push(`采购域 flowPages missing: ${missingPur.join(', ')} (run nocobase-w3-procurement.mts)`)
    if (!purTitles.has('采购管理')) failures.push('采购管理 menu group missing (run nocobase-w3-procurement.mts)')
    const gatePairs: ReadonlyArray<[string, string, string]> = [
      ['pur_rfqs', 'pur_requests', 'pr_id'],
      ['pur_orders', 'srm_suppliers', 'supplier_id'],
      ['pur_orders', 'pur_rfqs', 'rfq_id'],
      ['pur_invoices', 'pur_orders', 'po_id'],
      ['pur_payments', 'pur_invoices', 'invoice_id'],
      ['wms_receipts', 'pur_orders', 'po_id'],
    ]
    const gateRows = (await dataOf(token, 'GET', '/api/wfl_gate_configs:list?pageSize=100')) as Array<Record<string, any>> ?? []
    for (const [downstream, upstream, field] of gatePairs) {
      if (!gateRows.some(gate => gate.downstream_collection === downstream && gate.upstream_collection === upstream && gate.upstream_field === field)) {
        failures.push(`gate ${downstream}→${upstream} (${field}) missing (run nocobase-w3-procurement.mts)`)
      }
    }
    const invoiceGate = gateRows.find(gate => gate.downstream_collection === 'pur_payments' && gate.upstream_collection === 'pur_invoices')
    if (invoiceGate !== undefined && (invoiceGate.upstream_state_field !== 'match_result' || invoiceGate.required_status !== 'confirmed')) {
      failures.push('the pur_payments→pur_invoices gate must read match_result=confirmed (run nocobase-w3-procurement.mts)')
    }
    for (const purDocType of ['pur_requests', 'pur_rfqs', 'pur_orders', 'pur_payments']) {
      const purFlows = await call(token, 'GET', `/api/wfl_flow_configs:list?filter=${encodeURIComponent(JSON.stringify({ doc_type: { $eq: purDocType }, is_active: true }))}&pageSize=5`) as { data?: unknown[] }
      if ((purFlows?.data?.length ?? 0) === 0) failures.push(`${purDocType} has no active flow config (run nocobase-w3-procurement.mts)`)
    }
    const receiptCols = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_receipts' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
    const receiptColNames = new Set((receiptCols?.data ?? []).map(field => field.name))
    for (const receiptCol of ['po_id', 'iqc_status']) {
      if (!receiptColNames.has(receiptCol)) failures.push(`wms_receipts.${receiptCol} missing (run nocobase-w3-procurement.mts)`)
    }
    const quarantine = await call(token, 'GET', `/api/wms_zones:list?filter=${encodeURIComponent(JSON.stringify({ code: { $eq: 'SH-Q' } }))}&pageSize=5`) as { data?: unknown[] }
    if ((quarantine?.data?.length ?? 0) === 0) failures.push('IQC 待检区 SH-Q missing (run nocobase-h5-wms.mts then nocobase-w3-procurement.mts)')
    // W2-B5: approval config — the pur_orders flow rides its extras
    // (amount_threshold 200000, invoice_match_tolerance 0.1, the
    // two-person manager tier) with the config_note audit column and the
    // demo pair's todo expansion; so_orders stays on the default threshold
    // (no key — the W-round fallback).
    {
      const w2b5Flows = (await dataOf(token, 'GET', '/api/wfl_flow_configs:list?pageSize=100')) as Array<Record<string, any>> | null ?? []
      const purFlow = w2b5Flows.find(row => row.doc_type === 'pur_orders' && row.is_active === true)
      if (purFlow === undefined) failures.push('pur_orders active flow missing (W2-B5; run nocobase-w3-procurement.mts)')
      else {
        const extras = JSON.parse(String(purFlow.extras ?? '{}')) as Record<string, unknown>
        if (extras['amount_threshold'] !== 200_000) failures.push(`pur_orders extras.amount_threshold ${JSON.stringify(extras['amount_threshold'])} ≠ 200000 (W2-B5)`)
        if (extras['invoice_match_tolerance'] !== 0.1) failures.push(`pur_orders extras.invoice_match_tolerance ${JSON.stringify(extras['invoice_match_tolerance'])} ≠ 0.1 (W2-B5)`)
        const approverMap = JSON.parse(String(purFlow.approver_map ?? '{}')) as Record<string, unknown>
        const manager = approverMap['manager']
        if (!Array.isArray(manager) || !manager.includes('quality_lead')) failures.push('pur_orders approver_map.manager must be array-form with quality_lead (W2-B5)')
        if (typeof purFlow.config_note !== 'string' || !purFlow.config_note.includes('w2b5')) failures.push('pur_orders config_note audit trail missing (W2-B5)')
      }
      const soFlow = w2b5Flows.find(row => row.doc_type === 'so_orders' && row.is_active === true)
      if (soFlow !== undefined) {
        const soExtras = JSON.parse(String(soFlow.extras ?? '{}')) as Record<string, unknown>
        if (soExtras['amount_threshold'] !== undefined) failures.push('so_orders extras must carry no amount_threshold (default 100000 fallback; W2-B5)')
      }
      const w2b5Users = (await dataOf(token, 'GET', '/api/users:list?pageSize=200')) as Array<Record<string, any>> | null ?? []
      if (!w2b5Users.some(row => row.username === 'quality_lead')) failures.push('quality_lead demo approver user missing (W2-B5; run nocobase-w3-procurement.mts)')
      const w2b5Pos = (await dataOf(token, 'GET', '/api/pur_orders:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
      const demoSmall = w2b5Pos.find(row => row.code === 'PO-B5-A')
      const demoLarge = w2b5Pos.find(row => row.code === 'PO-B5-B')
      const demoWitness = w2b5Pos.find(row => row.code === 'PO-B5-C')
      if (demoSmall?.doc_status !== 'approved') failures.push(`PO-B5-A must sit approved (got ${String(demoSmall?.doc_status)}; W2-B5 150k one-round demo)`)
      if (demoLarge?.doc_status !== 'approved') failures.push(`PO-B5-B must sit approved (got ${String(demoLarge?.doc_status)}; W2-B5 250k two-round demo)`)
      if (demoWitness?.doc_status !== 'approved') failures.push(`PO-B5-C must sit approved (got ${String(demoWitness?.doc_status)}; W2-B5 todo-expansion witness)`)
      const w2b5Todos = (await dataOf(token, 'GET', '/api/wfl_approval_todos:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
      const witnessTodos = w2b5Todos.filter(row => row.doc_type === 'pur_orders' && String(row.doc_id) === String(demoWitness?.id))
      if (witnessTodos.length !== 2 || !witnessTodos.every(row => row.status === 'completed') || !witnessTodos.some(row => row.user === 'quality_lead') || !witnessTodos.some(row => row.user === 'admin')) {
        failures.push(`PO-B5-C todos must be the two-person expansion (admin+quality_lead) completed (${JSON.stringify(witnessTodos.map(row => [row.user, row.status]))}; W2-B5)`)
      }
      const w2b5Records = (await dataOf(token, 'GET', '/api/wfl_approval_records:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
      if (!w2b5Records.some(row => row.doc_type === 'pur_orders' && String(row.doc_id) === String(demoSmall?.id) && row.approver === 'quality_lead' && row.to_state === 'approved')) {
        failures.push('PO-B5-A records must carry quality_lead one-round approval (W2-B5)')
      }
      if (!w2b5Records.some(row => row.doc_type === 'pur_orders' && String(row.doc_id) === String(demoLarge?.id) && row.to_state === 'pending_level2')) {
        failures.push('PO-B5-B records must carry the pending_level2 route (W2-B5)')
      }
    }
    // W2-B6: the execution-policy batch — the two MO-level policy columns
    // with the W-round defaults (full_lock / 0, never NULL), the
    // reservation_state enum growth (partial_allowed), and the two engine
    // selftests green (split-suggestion card + policy pure layer).
    {
      const w2b6Fields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' } }))}&pageSize=200`) as { data?: Array<{ name?: string, uiSchema?: { enum?: Array<{ value?: string }> } }> }
      const w2b6ByName = new Map((w2b6Fields?.data ?? []).map(field => [field.name, field]))
      for (const w2b6Column of ['kit_policy', 'overissue_ratio']) {
        if (!w2b6ByName.has(w2b6Column)) failures.push(`mfg_orders.${w2b6Column} missing (W2-B6; run nocobase-w6-mfg-exec.mts)`)
      }
      const kitEnum = w2b6ByName.get('kit_policy')?.uiSchema?.enum ?? []
      for (const policyValue of ['full_lock', 'partial_allowed']) {
        if (!kitEnum.some(option => option.value === policyValue)) failures.push(`mfg_orders.kit_policy enum must carry ${policyValue} (W2-B6)`)
      }
      const axisEnum = w2b6ByName.get('reservation_state')?.uiSchema?.enum ?? []
      if (!axisEnum.some(option => option.value === 'partial_allowed')) failures.push('mfg_orders.reservation_state enum must carry partial_allowed (W2-B6; run nocobase-w6-mfg-exec.mts)')
      // A NULL policy/ratio is the compliant default (the engine's fallback:
      // full_lock / 0 — mrp-run mints MOs without the columns); the gate
      // refuses every non-null value outside the closed legal domain.
      const w2b6Mos = (await dataOf(token, 'GET', '/api/mfg_orders:list?pageSize=500') as Array<Record<string, any>> | null) ?? []
      for (const mo of w2b6Mos) {
        const policy = mo.kit_policy
        if (policy !== null && policy !== undefined && String(policy) !== '' && policy !== 'full_lock' && policy !== 'partial_allowed') {
          failures.push(`mfg_orders ${String(mo.code)} kit_policy must sit full_lock|partial_allowed|NULL(default), got ${JSON.stringify(policy)} (W2-B6)`)
        }
        const rawRatio = mo.overissue_ratio
        if (rawRatio !== null && rawRatio !== undefined && String(rawRatio) !== '') {
          const ratio = Number(rawRatio)
          if (!Number.isFinite(ratio) || ratio < 0) {
            failures.push(`mfg_orders ${String(mo.code)} overissue_ratio must be a finite ≥0 number (or NULL=0), got ${JSON.stringify(rawRatio)} (W2-B6)`)
          }
        }
      }
      for (const [w2b6Script, w2b6Verb] of [['mfg-schedule.mts', '--selftest'], ['nocobase-h5-wms.mts', '--selftest-b6']] as const) {
        const selftest = spawnSync('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts', w2b6Script), w2b6Verb], { encoding: 'utf8', cwd: repoRoot })
        if (selftest.status !== 0) {
          failures.push(`${w2b6Script} ${w2b6Verb} failed (W2-B6):\n${(selftest.stdout ?? '') + (selftest.stderr ?? '')}`.slice(0, 600))
        }
      }
    }
    // B4: the inventory practice extension — the reservation/suggestion
    // collections, the three new pages, the planning columns, the virtual
    // zones, the count workflow's engine-callback leg, the bypass-guard rows,
    // and the stock == Σmovements ledger gate (any bypass write turns it red).
    {
      for (const b4Collection of ['wms_reservations', 'wms_reorder_suggestions']) {
        const row = await dataOf(token, 'GET', `/api/collections/${b4Collection}`)
        if (row === null) failures.push(`B4 collection ${b4Collection} missing (run nocobase-h5-wms.mts)`)
      }
      const b4Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null }> }
      const b4Titles = new Set((b4Routes?.data ?? []).map(row => row.title ?? ''))
      const missingB4 = ['预留管理', '补货预警', '盘点计划'].filter(title => !b4Titles.has(title))
      if (missingB4.length > 0) failures.push(`B4 WMS flowPages missing: ${missingB4.join(', ')} (run nocobase-h5-wms.mts)`)
      const productFieldsB4 = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_inv_products' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      const productFieldNamesB4 = new Set((productFieldsB4?.data ?? []).map(field => field.name))
      for (const column of ['abc_class', 'reorder_point', 'safety_stock', 'lot_size', 'lead_time_days', 'avg_daily_use']) {
        if (!productFieldNamesB4.has(column)) failures.push(`hub_inv_products.${column} missing (run nocobase-h5-wms.mts for the B4 ROP/ABC columns)`)
      }
      const countFieldsB4 = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_counts' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      if (!(new Set((countFieldsB4?.data ?? []).map(field => field.name))).has('abc_class')) failures.push('wms_counts.abc_class missing (run nocobase-h5-wms.mts)')
      const transferFieldsB4 = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_transfers' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      if (!(new Set((transferFieldsB4?.data ?? []).map(field => field.name))).has('transfer_mode')) failures.push('wms_transfers.transfer_mode missing (run nocobase-h5-wms.mts)')
      for (const virtualZone of ['SH-ADJ', 'SH-TR']) {
        const zone = await call(token, 'GET', `/api/wms_zones:list?filter=${encodeURIComponent(JSON.stringify({ code: { $eq: virtualZone } }))}&pageSize=5`) as { data?: unknown[] }
        if ((zone?.data?.length ?? 0) === 0) failures.push(`B4 virtual zone ${virtualZone} missing (run nocobase-h5-wms.mts)`)
      }
      // The count workflow must carry the B4 request leg (manual → condition →
      // request engine callback → update done) — the pre-B4 shape silently
      // skipped the engine write-back.
      const countWorkflows = await call(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: 'WMS盘点差异调整审批' } }))}&pageSize=5`) as { data?: Array<{ id?: number }> }
      const countWorkflowId = countWorkflows?.data?.[0]?.id
      if (countWorkflowId === undefined) {
        failures.push('WMS盘点差异调整审批 workflow missing (run nocobase-h5-wms.mts)')
      } else {
        const nodes = (await dataOf(token, 'GET', `/api/flow_nodes:list?filter=${encodeURIComponent(JSON.stringify({ workflowId: { $eq: countWorkflowId } }))}&pageSize=50`)) as Array<{ type?: string, title?: string }> | null
        const requestNode = (nodes ?? []).find(node => node.type === 'request')
        if (requestNode === undefined) failures.push('WMS盘点差异调整审批 lacks the B4 request node (run nocobase-h5-wms.mts to rebuild with the engine callback leg)')
      }
      // The bypass guard: admin→wms_stock / wms_movements narrowed to the
      // explicit read-only actions (the runtime 403 lives in the demo chain).
      const guardRows = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $in: ['wms_stock', 'wms_movements'] } }))}`)) as Array<Record<string, any>> | null
      for (const collection of ['wms_stock', 'wms_movements']) {
        const row = (guardRows ?? []).find(candidate => candidate.name === collection)
        if (row === undefined || row.usingActionsConfig !== true) {
          failures.push(`bypass guard admin→${collection} missing (run nocobase-h5-wms.mts; stock writes must stay engine-only)`)
        }
      }
      // The ledger gate: per (product, lot), Σ stock.qty_on_hand == Σ movements.qty.
      {
        const stocks = (await dataOf(token, 'GET', '/api/wms_stock:list?pageSize=500')) as Array<Record<string, any>> | null
        const movements = (await dataOf(token, 'GET', '/api/wms_movements:list?pageSize=1000')) as Array<Record<string, any>> | null
        const stockSums = new Map<string, number>()
        for (const row of stocks ?? []) {
          const key = `${String(row.product_id)}:${String(row.lot_id)}`
          stockSums.set(key, (stockSums.get(key) ?? 0) + Number(row.qty_on_hand ?? 0))
        }
        const ledgerSums = new Map<string, number>()
        for (const row of movements ?? []) {
          const key = `${String(row.product_id)}:${String(row.lot_id)}`
          ledgerSums.set(key, (ledgerSums.get(key) ?? 0) + Number(row.qty ?? 0))
        }
        const drift: string[] = []
        for (const [key, sum] of stockSums) {
          if (Math.abs(sum - (ledgerSums.get(key) ?? 0)) > 0.01) drift.push(`${key}: stock ${String(sum)} vs ledger ${String(ledgerSums.get(key) ?? 0)}`)
        }
        for (const [key, sum] of ledgerSums) {
          if (!stockSums.has(key) && Math.abs(sum) > 0.01) drift.push(`${key}: ledger ${String(sum)} with no stock row`)
        }
        if (drift.length > 0) failures.push(`wms_stock != Σwms_movements (bypass write suspected; run nocobase-h5-wms.mts --rebalance only after auditing): ${drift.slice(0, 4).join('; ')}`)
      }
      // W2-B3: the business-date coverage gate — every movements/counts row
      // carries biz_date (the backfill settles stock, the appendMovement
      // helper keeps new rows covered; a bypass create turns this red) — and
      // the monthly-balance snapshot exists and reconciles against a fresh
      // ledger replay (期初+收−发=期末 + continuity), per the batch contract.
      {
        const movements = (await dataOf(token, 'GET', '/api/wms_movements:list?pageSize=1000')) as Array<Record<string, any>> | null
        const counts = (await dataOf(token, 'GET', '/api/wms_counts:list?pageSize=500')) as Array<Record<string, any>> | null
        const nullMoves = (movements ?? []).filter(row => String(row.biz_date ?? '') === '')
        const nullCounts = (counts ?? []).filter(row => String(row.biz_date ?? '') === '')
        if (nullMoves.length > 0) failures.push(`wms_movements.biz_date NULL on ${String(nullMoves.length)} row(s) (run nocobase-h5-wms.mts --backfill-dates; direct creates bypassing appendMovement are forbidden): ${nullMoves.slice(0, 3).map(row => String(row.doc_no)).join(', ')}`)
        if (nullCounts.length > 0) failures.push(`wms_counts.biz_date NULL on ${String(nullCounts.length)} row(s) (run nocobase-h5-wms.mts --backfill-dates)`)
        const balances = (await dataOf(token, 'GET', '/api/wms_monthly_balances:list?pageSize=1000')) as Array<Record<string, any>> | null
        if ((balances ?? []).length === 0) {
          failures.push('wms_monthly_balances empty (run nocobase-h5-wms.mts --snapshot-month all)')
        } else {
          const replayed = new Map<string, { opening: number, inQty: number, outQty: number, bal: number }>()
          for (const row of movements ?? []) {
            const date = String(row.biz_date ?? '')
            if (date === '') continue
            const key = `${String(row.product_id)}:${date.slice(0, 7)}`
            if (!replayed.has(key)) replayed.set(key, { opening: 0, inQty: 0, outQty: 0, bal: 0 })
          }
          for (const row of movements ?? []) {
            const date = String(row.biz_date ?? '')
            if (date === '') continue
            const qty = Number(row.qty ?? 0)
            for (const [key, bucket] of replayed) {
              const [productId, period] = key.split(':')
              if (String(row.product_id) !== productId) continue
              if (date.slice(0, 7) < period) bucket.opening += qty
              if (date.slice(0, 7) === period) {
                if (qty >= 0) bucket.inQty += qty
                else bucket.outQty -= qty
              }
            }
          }
          for (const bucket of replayed.values()) bucket.bal = bucket.opening + bucket.inQty - bucket.outQty
          const balanceDrift: string[] = []
          for (const row of balances ?? []) {
            const key = `${String(row.product_id)}:${String(row.period)}`
            const bucket = replayed.get(key)
            if (bucket === undefined) {
              balanceDrift.push(`${key}: snapshot row with no replayable ledger`)
              continue
            }
            if (Math.abs(Number(row.bal_qty) - bucket.bal) > 0.01 || Math.abs(Number(row.in_qty) - bucket.inQty) > 0.01
              || Math.abs(Number(row.out_qty) - bucket.outQty) > 0.01 || Math.abs(Number(row.opening_qty) - bucket.opening) > 0.01) {
              balanceDrift.push(`${key}: snapshot ${String(row.opening_qty)}/${String(row.in_qty)}/${String(row.out_qty)}/${String(row.bal_qty)} != replay ${String(bucket.opening)}/${String(bucket.inQty)}/${String(bucket.outQty)}/${String(bucket.bal)}`)
            }
          }
          const byProduct = new Map<number, Array<{ period: string, bal: number, opening: number }>>()
          for (const row of balances ?? []) {
            const productId = Number(row.product_id)
            if (!byProduct.has(productId)) byProduct.set(productId, [])
            byProduct.get(productId)!.push({ period: String(row.period), bal: Number(row.bal_qty), opening: Number(row.opening_qty) })
          }
          for (const [productId, list] of byProduct) {
            const ordered = list.sort((a, b) => a.period.localeCompare(b.period))
            for (let index = 1; index < ordered.length; index += 1) {
              if (Math.abs(ordered[index - 1]!.bal - ordered[index]!.opening) > 0.01) {
                balanceDrift.push(`product ${String(productId)}: ${ordered[index - 1]!.period} bal ${String(ordered[index - 1]!.bal)} != ${ordered[index]!.period} opening ${String(ordered[index]!.opening)}`)
              }
            }
          }
          if (balanceDrift.length > 0) failures.push(`wms_monthly_balances != ledger replay (run nocobase-h5-wms.mts --recalc): ${balanceDrift.slice(0, 4).join('; ')}`)
        }
      }
    }
    const purFloor = async (collection: string, floor: number): Promise<string | null> => {
      const rows = await call(token, 'GET', `/api/${collection}:list?pageSize=1`) as { meta?: { count?: number } } | null
      return (rows?.meta?.count ?? 0) >= floor ? null : `${collection} has ${String(rows?.meta?.count ?? 0)} rows (< ${String(floor)})`
    }
    for (const [collection, floor] of [['pur_requests', 2], ['pur_rfqs', 1], ['pur_quotes', 3], ['pur_orders', 3]] as const) {
      const failure = await purFloor(collection, floor)
      if (failure !== null) failures.push(`${failure}; run the all chain so nocobase-w3-procurement.mts (and its demo chain) seeds`)
    }
    // B5: the manufacturing planning domain — the seven mfg_* collections, the
    // 生产制造 menu group + five pages, the mfg_orders approval flow (amount
    // routing on estimated_cost), the BOM gate, and the seed floors (versioned
    // BOMs, operations, components, calendar, MOs).
    {
      for (const b5Collection of ['mfg_boms', 'mfg_bom_lines', 'mfg_bom_operations', 'mfg_work_centers', 'mfg_holidays', 'mfg_orders', 'mfg_order_operations']) {
        const row = await dataOf(token, 'GET', `/api/collections/${b5Collection}`)
        if (row === null) failures.push(`B5 collection ${b5Collection} missing (run nocobase-w5-mfg.mts)`)
      }
      const b5Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null }> }
      const b5Titles = new Set((b5Routes?.data ?? []).map(row => row.title ?? ''))
      const missingB5 = ['BOM 管理', 'BOM 工序', '工作中心', '生产订单', '排产看板'].filter(title => !b5Titles.has(title))
      if (missingB5.length > 0) failures.push(`B5 生产域 flowPages missing: ${missingB5.join(', ')} (run nocobase-w5-mfg.mts)`)
      if (!b5Titles.has('生产制造')) failures.push('生产制造 menu group missing (run nocobase-w5-mfg.mts)')
      const b5Flows = (await dataOf(token, 'GET', '/api/wfl_flow_configs:list?pageSize=50')) as Array<Record<string, any>> | null
      if (!(b5Flows ?? []).some(row => row.doc_type === 'mfg_orders' && row.is_active === true)) failures.push('mfg_orders flow config missing (run nocobase-w5-mfg.mts)')
      const b5Gates = (await dataOf(token, 'GET', '/api/wfl_gate_configs:list?pageSize=100')) as Array<Record<string, any>> | null
      if (!(b5Gates ?? []).some(row => row.downstream_collection === 'mfg_orders' && row.upstream_collection === 'mfg_boms' && row.upstream_state_field === 'bom_status' && row.required_status === 'active')) {
        failures.push('the mfg_orders→mfg_boms gate (bom_status=active) missing (run nocobase-w5-mfg.mts)')
      }
      const b5Boms = (await dataOf(token, 'GET', '/api/mfg_boms:list?pageSize=50')) as Array<Record<string, any>> | null
      if (!(b5Boms ?? []).some(row => row.code === 'BOM-0001' && row.bom_status === 'retired')) failures.push('BOM-0001 retired version row missing (版本切换不删旧版; run nocobase-w5-mfg.mts)')
      for (const [collection, floor] of [['mfg_bom_lines', 8], ['mfg_bom_operations', 6], ['mfg_work_centers', 2], ['mfg_holidays', 9], ['mfg_orders', 2]] as const) {
        const failure = await purFloor(collection, floor)
        if (failure !== null) failures.push(`${failure}; run nocobase-w5-mfg.mts (and its demo chain) seeds`)
      }
    }
    // B6: the manufacturing-execution domain — the four execution
    // collections, the five pages (领料/退料/报工/完工 + MO 执行视图), the
    // mfg_orders execution columns and the doc_status terminals, the WIP
    // virtual zone + the three movement legs, and the draft seed floor.
    {
      for (const b6Collection of ['mfg_material_issues', 'mfg_material_returns', 'mfg_job_reports', 'mfg_completions']) {
        const row = await dataOf(token, 'GET', `/api/collections/${b6Collection}`)
        if (row === null) failures.push(`B6 collection ${b6Collection} missing (run nocobase-w6-mfg-exec.mts)`)
      }
      const b6Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null }> }
      const b6Titles = new Set((b6Routes?.data ?? []).map(row => row.title ?? ''))
      const missingB6 = ['领料单', '退料单', '报工记录', '完工单', 'MO 执行视图'].filter(title => !b6Titles.has(title))
      if (missingB6.length > 0) failures.push(`B6 生产执行 flowPages missing: ${missingB6.join(', ')} (run nocobase-w6-mfg-exec.mts)`)
      const b6MoFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      const b6MoFieldNames = new Set((b6MoFields?.data ?? []).map(field => field.name))
      for (const column of ['qty_transferred', 'qty_consumed', 'actual_cost', 'cost_variance', 'kit_data']) {
        if (!b6MoFieldNames.has(column)) failures.push(`mfg_orders.${column} missing (run nocobase-w6-mfg-exec.mts for the B6 execution columns)`)
      }
      const b6StatusField = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' }, name: { $eq: 'doc_status' } }))}&pageSize=1`) as { data?: Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> }
      const b6Stored = b6StatusField?.data?.[0]?.uiSchema?.enum ?? []
      for (const value of ['in_progress', 'completed']) {
        if (!b6Stored.some(option => option.value === value)) failures.push(`mfg_orders.doc_status enum lacks ${value} (run nocobase-w6-mfg-exec.mts)`)
      }
      const b6MoveField = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_movements' }, name: { $eq: 'move_type' } }))}&pageSize=1`) as { data?: Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> }
      const b6MoveEnum = b6MoveField?.data?.[0]?.uiSchema?.enum ?? []
      for (const leg of ['ISSUE_WIP', 'RETURN_WIP', 'RECEIPT_MFG']) {
        if (!b6MoveEnum.some(option => option.value === leg)) failures.push(`wms_movements.move_type enum lacks ${leg} (run nocobase-h5-wms.mts for the B6 legs)`)
      }
      const b6Bins = await call(token, 'GET', `/api/wms_bins:list?filter=${encodeURIComponent(JSON.stringify({ code: { $eq: 'SH-WIP-01-01' } }))}&pageSize=1`) as { data?: Array<{ id?: number }> }
      if ((b6Bins?.data?.length ?? 0) === 0) failures.push('WIP 线边库位 SH-WIP-01-01 missing (run nocobase-h5-wms.mts for the B6 virtual zone)')
      for (const [collection, floor] of [['mfg_material_issues', 4], ['mfg_material_returns', 1], ['mfg_job_reports', 3], ['mfg_completions', 1]] as const) {
        const failure = await purFloor(collection, floor)
        if (failure !== null) failures.push(`${failure}; run nocobase-w6-mfg-exec.mts seeds`)
      }
      const b6Mo3 = (await dataOf(token, 'GET', `/api/mfg_orders:list?filter=${encodeURIComponent(JSON.stringify({ code: { $eq: 'MO-2026-0003' } }))}&pageSize=1`) as Array<{ doc_status?: string }> | null)?.[0]
      if (b6Mo3 !== undefined && String(b6Mo3.doc_status) !== 'draft') failures.push(`MO-2026-0003 must stay draft（B6 复用走全链；当前 ${String(b6Mo3.doc_status)}）`)
    }
    // B7: the sales→MRP domain — the five collections, the three pages, the
    // 销售管理 group, the so_orders flow, the three gates, the confirm
    // workflow, the driver columns, the SHIPMENT_SO leg, and the seed floor.
    {
      for (const b7Collection of ['so_orders', 'so_order_lines', 'mrp_suggestions', 'mrp_snapshots', 'mrp_confirm_intents']) {
        const row = await dataOf(token, 'GET', `/api/collections/${b7Collection}`)
        if (row === null) failures.push(`B7 collection ${b7Collection} missing (run nocobase-w7-mrp.mts)`)
      }
      const b7Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null }> }
      const b7Titles = new Set((b7Routes?.data ?? []).map(row => row.title ?? ''))
      const missingB7 = ['销售订单', '计划工作台', 'MRP 快照'].filter(title => !b7Titles.has(title))
      if (missingB7.length > 0) failures.push(`B7 销售域 flowPages missing: ${missingB7.join(', ')} (run nocobase-w7-mrp.mts)`)
      if (!b7Titles.has('销售管理')) failures.push('销售管理 menu group missing (run nocobase-w7-mrp.mts)')
      const b7Flows = await call(token, 'GET', '/api/wfl_flow_configs:list?pageSize=100') as { data?: Array<{ doc_type?: string, is_active?: boolean }> }
      if (!(b7Flows?.data ?? []).some(row => row.doc_type === 'so_orders' && row.is_active === true)) failures.push('so_orders flow config missing (run nocobase-w7-mrp.mts)')
      const b7Gates = await call(token, 'GET', '/api/wfl_gate_configs:list?pageSize=200') as { data?: Array<{ downstream_collection?: string, upstream_collection?: string, upstream_field?: string, required_status?: string }> }
      const b7GateRows = b7Gates?.data ?? []
      for (const [downstream, upstream, field, required] of [
        ['mrp_suggestions', 'so_orders', 'driver_so_id', 'approved'],
        ['mfg_orders', 'mrp_suggestions', 'driver_suggestion_id', 'open'],
        ['pur_requests', 'mrp_suggestions', 'driver_suggestion_id', 'open'],
      ] as const) {
        const gate = b7GateRows.find(row => row.downstream_collection === downstream && row.upstream_collection === upstream && row.upstream_field === field)
        if (gate === undefined) failures.push(`B7 gate ${downstream}→${upstream} (${field}) missing (run nocobase-w7-mrp.mts)`)
        else if (String(gate.required_status ?? '') !== required) failures.push(`B7 gate ${downstream}→${upstream} must read ${required} (run nocobase-w7-mrp.mts to repair)`)
      }
      const b7Workflows = await call(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: 'MRP 计划单确认' } }))}&pageSize=5`) as { data?: Array<{ id?: number }> }
      if ((b7Workflows?.data?.length ?? 0) === 0) failures.push('MRP 计划单确认 workflow missing (run nocobase-w7-mrp.mts)')
      const b7MoFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      if (!(new Set((b7MoFields?.data ?? []).map(field => field.name))).has('driver_suggestion_id')) failures.push('mfg_orders.driver_suggestion_id missing (run nocobase-w7-mrp.mts)')
      const b7PrFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'pur_requests' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      if (!(new Set((b7PrFields?.data ?? []).map(field => field.name))).has('driver_suggestion_id')) failures.push('pur_requests.driver_suggestion_id missing (run nocobase-w7-mrp.mts)')
      const b7MoveField = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_movements' }, name: { $eq: 'move_type' } }))}&pageSize=1`) as { data?: Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> }
      if (!(b7MoveField?.data?.[0]?.uiSchema?.enum ?? []).some(option => option.value === 'SHIPMENT_SO')) failures.push('wms_movements.move_type enum lacks SHIPMENT_SO (run nocobase-w7-mrp.mts)')
      const b7QuoteFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'crm_quotes' }, name: { $eq: 'version' } }))}&pageSize=1`) as { data?: Array<{ name?: string }> }
      if ((b7QuoteFields?.data?.length ?? 0) === 0) failures.push('crm_quotes.version missing (run nocobase-crm-modules.mts)')
      for (const [collection, floor] of [['so_orders', 3], ['so_order_lines', 4]] as const) {
        const failure = await purFloor(collection, floor)
        if (failure !== null) failures.push(`${failure}; run nocobase-w7-mrp.mts seeds`)
      }
      const b7So3 = (await dataOf(token, 'GET', `/api/so_orders:list?filter=${encodeURIComponent(JSON.stringify({ code: { $eq: 'SO-2026-0003' } }))}&pageSize=1`) as Array<{ doc_status?: string }> | null)?.[0]
      if (b7So3 !== undefined && String(b7So3.doc_status) !== 'draft') failures.push(`SO-2026-0003 must stay draft（卡口负例素材；当前 ${String(b7So3.doc_status)}）`)
    }
    // B8: the quality domain — qm collections, the 质量管理 five pages, the
    // AQL full-table seeds (W2-B1: 135 rows × rigor), the additive columns (switch counter / CAPA
    // link / rework source / concession flag / OTD dates), the two
    // disposition movement legs, and the concession approval flow. The
    // three-way reconciliation (failed inspection + approved disposition +
    // RETURN_VENDOR movement) runs inside nocobase-w8-quality.mts
    // --demo-chain; verify asserts the reverse direction only when
    // disposition legs exist (the chain is not part of the all replay).
    {
      for (const b8Collection of ['qm_inspections', 'qm_inspection_readings', 'qm_aql_plans', 'qm_nc_dispositions']) {
        const row = await dataOf(token, 'GET', `/api/collections/${b8Collection}`)
        if (row === null) failures.push(`B8 collection ${b8Collection} missing (run nocobase-w8-quality.mts)`)
      }
      const b8Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null }> }
      const b8Titles = new Set((b8Routes?.data ?? []).map(row => row.title ?? ''))
      const missingB8 = ['质检单', '检验读数', '处置看板', 'AQL抽样方案', '季度绩效物化'].filter(title => !b8Titles.has(title))
      if (missingB8.length > 0) failures.push(`B8 质量域 flowPages missing: ${missingB8.join(', ')} (run nocobase-w8-quality.mts)`)
      if (!b8Titles.has('质量管理')) failures.push('质量管理 menu group missing (run nocobase-w8-quality.mts)')
      // W2-B1: the full-table reseed — 135 rows = 15 bands × (normal 5 rungs +
      // tightened 2 + reduced 2), with the acceptance spot cells.
      const b8Aql = (await dataOf(token, 'GET', '/api/qm_aql_plans:list?pageSize=200') as Array<Record<string, any>> | null) ?? []
      const byRigor = b8Aql.reduce<Record<string, number>>((acc, row) => { const key = String(row.rigor ?? 'normal'); acc[key] = (acc[key] ?? 0) + 1; return acc }, {})
      if (b8Aql.length !== 135 || byRigor.normal !== 75 || byRigor.tightened !== 30 || byRigor.reduced !== 30) {
        failures.push(`qm_aql_plans full-table seed must read 135 rows (normal 75 / tightened 30 / reduced 30); got ${b8Aql.length} (${String(byRigor.normal ?? 0)}/${String(byRigor.tightened ?? 0)}/${String(byRigor.reduced ?? 0)}) — run nocobase-w8-quality.mts`)
      }
      const aqlCell = (band: string, aql: string, rigor: string): { n?: unknown, ac?: unknown, re?: unknown } | undefined => b8Aql.find(row => String(row.lot_band) === band && String(row.aql) === aql && String(row.rigor ?? 'normal') === rigor)
      const gPlan = aqlCell('151-280', '2.5', 'normal')
      if (gPlan === undefined || Number(gPlan.n) !== 32 || Number(gPlan.ac) !== 2 || Number(gPlan.re) !== 3) {
        failures.push('qm_aql_plans G/2.5 normal array must read n=32 Ac=2 Re=3 (GB/T 2828.1 level II; run nocobase-w8-quality.mts)')
      }
      const hPlan = aqlCell('281-500', '2.5', 'normal')
      if (hPlan === undefined || Number(hPlan.n) !== 50 || Number(hPlan.ac) !== 3 || Number(hPlan.re) !== 4) {
        failures.push('qm_aql_plans 281-500 × 2.5 × normal must read n=50 Ac=3 Re=4 (W2-B1; run nocobase-w8-quality.mts)')
      }
      const kTight = aqlCell('1201-3200', '2.5', 'tightened')
      if (kTight === undefined || Number(kTight.n) !== 125 || Number(kTight.ac) !== 5 || Number(kTight.re) !== 6) {
        failures.push('qm_aql_plans 1201-3200 × 2.5 × tightened must read n=125 Ac=5 Re=6 (W2-B1 true tightened table; run nocobase-w8-quality.mts)')
      }
      if (!b8Aql.some(row => String(row.lot_band) === '500001+' && String(row.aql) === '1.0' && String(row.rigor ?? 'normal') === 'normal' && Number(row.n) === 1250 && Number(row.ac) === 21)) {
        failures.push('qm_aql_plans 500001+ × 1.0 × normal row missing (n=1250 Ac=21; run nocobase-w8-quality.mts)')
      }
      for (const [collection, column] of [
        ['srm_suppliers', 'reject_streak'], ['srm_suppliers', 'switch_score'],
        ['qm_inspections', 'rigor'], ['qm_inspections', 'resubmission'],
        ['srm_capas', 'inspection_code'], ['mfg_orders', 'source'],
        ['wms_lots', 'concession_flag'], ['wms_receipts', 'received_at'], ['pur_orders', 'expected_date'],
      ] as const) {
        const fields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}&pageSize=300`) as { data?: Array<{ name?: string }> }
        if (!(new Set((fields?.data ?? []).map(field => field.name))).has(column)) failures.push(`${collection}.${column} missing (run nocobase-w8-quality.mts)`)
      }
      const b8MoveField = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_movements' }, name: { $eq: 'move_type' } }))}&pageSize=1`) as { data?: Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> }
      const b8MoveEnum = b8MoveField?.data?.[0]?.uiSchema?.enum ?? []
      if (!b8MoveEnum.some(option => option.value === 'RETURN_VENDOR')) failures.push('wms_movements.move_type enum lacks RETURN_VENDOR (run nocobase-h5-wms.mts)')
      if (!b8MoveEnum.some(option => option.value === 'SCRAP')) failures.push('wms_movements.move_type enum lacks SCRAP (run nocobase-h5-wms.mts)')
      const b8Flows = await call(token, 'GET', '/api/wfl_flow_configs:list?pageSize=100') as { data?: Array<{ doc_type?: string, is_active?: boolean }> }
      if (!(b8Flows?.data ?? []).some(row => row.doc_type === 'qm_nc_dispositions' && row.is_active === true)) failures.push('qm_nc_dispositions flow config missing (run nocobase-w8-quality.mts)')
      // Reverse reconciliation: every RETURN_VENDOR / SCRAP leg must point at
      // an approved + closed disposition row of the same code.
      const b8Dispositions = (await dataOf(token, 'GET', '/api/qm_nc_dispositions:list?pageSize=200') as Array<Record<string, any>> | null) ?? []
      const b8DisposalLegs = (await dataOf(token, 'GET', '/api/wms_movements:list?pageSize=500&filter=' + encodeURIComponent(JSON.stringify({ move_type: { $in: ['RETURN_VENDOR', 'SCRAP'] } }))) as Array<Record<string, any>> | null) ?? []
      for (const leg of b8DisposalLegs) {
        const nc = b8Dispositions.find(row => String(row.code) === String(leg.doc_no))
        if (nc === undefined || String(nc.doc_status) !== 'approved' || String(nc.status) !== 'closed') {
          failures.push(`disposition leg ${String(leg.move_type)} ${String(leg.doc_no)} lacks an approved+closed QM-NC row (三方勾稽; run nocobase-w8-quality.mts --demo-chain)`)
        }
      }
    }
    // W2-B2: the MPS layer — the two collections, the 主生产计划 page, the
    // mps_plans flow, the suggestion back-link column, the demo seeds, and
    // the historical covered-exclusivity invariant (any run carrying an
    // mps:-driven level-0 row must carry mps: exclusively for that item —
    // a mixed run means SO+MPS double-counted).
    {
      for (const w2b2Collection of ['mps_plans', 'mps_plan_items']) {
        if (await dataOf(token, 'GET', `/api/collections/${w2b2Collection}`) === null) failures.push(`W2-B2 collection ${w2b2Collection} missing (run nocobase-w7-mrp.mts)`)
      }
      const w2b2Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<{ title?: string | null }> }
      if (!(new Set((w2b2Routes?.data ?? []).map(row => row.title ?? ''))).has('主生产计划')) failures.push('主生产计划 flowPage missing (run nocobase-w7-mrp.mts)')
      const w2b2Flows = await call(token, 'GET', '/api/wfl_flow_configs:list?pageSize=100') as { data?: Array<{ doc_type?: string, is_active?: boolean }> }
      if (!(w2b2Flows?.data ?? []).some(row => row.doc_type === 'mps_plans' && row.is_active === true)) failures.push('mps_plans flow config missing (run nocobase-w7-mrp.mts)')
      const w2b2SuggestFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mrp_suggestions' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
      if (!(new Set((w2b2SuggestFields?.data ?? []).map(field => field.name))).has('mps_plan')) failures.push('mrp_suggestions.mps_plan missing (run nocobase-w7-mrp.mts)')
      const w2b2Plans = (await dataOf(token, 'GET', '/api/mps_plans:list?pageSize=100') as Array<Record<string, any>> | null) ?? []
      const now = new Date()
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7)
      const w2b2Plan = w2b2Plans.find(row => String(row.code ?? '') === `MPS-${nextMonth.replace('-', '')}-01`)
      if (w2b2Plan === undefined) failures.push(`W2-B2 seed MPS plan MPS-${nextMonth.replace('-', '')}-01 missing (run nocobase-w7-mrp.mts)`)
      else {
        const w2b2Items = (await dataOf(token, 'GET', `/api/mps_plan_items:list?filter=${encodeURIComponent(JSON.stringify({ plan_id: { $eq: w2b2Plan.id } }))}&pageSize=100`) as Array<Record<string, any>> | null) ?? []
        if (w2b2Items.length < 5) failures.push(`W2-B2 mps_plan_items rows < 5 (${String(w2b2Items.length)}; run nocobase-w7-mrp.mts)`)
        if (w2b2Items.some(row => row.planned_qty === null || row.planned_qty === undefined)) failures.push('W2-B2 mps_plan_items carries never-recalculated row(s) (planned_qty null; run nocobase-w7-mrp.mts recalc)')
      }
      const w2b2Sos = (await dataOf(token, 'GET', '/api/so_orders:list?pageSize=200') as Array<Record<string, any>> | null) ?? []
      for (const w2b2SoCode of ['SO-2026-0091', 'SO-2026-0092', 'SO-2026-0093']) {
        if (!w2b2Sos.some(row => String(row.code ?? '') === w2b2SoCode)) failures.push(`W2-B2 seed ${w2b2SoCode} missing (run nocobase-w7-mrp.mts)`)
      }
      const w2b2Snapshots = (await dataOf(token, 'GET', '/api/mrp_snapshots:list?pageSize=500') as Array<Record<string, any>> | null) ?? []
      const w2b2MpsByRun = new Map<string, Set<string>>()
      for (const mpsRow of w2b2Snapshots.filter(row => Number(row.bom_level) === 0 && String(row.driver_so ?? '').startsWith('mps:'))) {
        w2b2MpsByRun.set(String(mpsRow.run_id), (w2b2MpsByRun.get(String(mpsRow.run_id)) ?? new Set<string>()).add(String(mpsRow.product_id)))
      }
      for (const [w2b2RunId, w2b2Products] of w2b2MpsByRun) {
        for (const otherRow of w2b2Snapshots.filter(row => String(row.run_id) === w2b2RunId && Number(row.bom_level) === 0 && !String(row.driver_so ?? '').startsWith('mps:'))) {
          if (w2b2Products.has(String(otherRow.product_id))) failures.push(`W2-B2 covered-exclusivity violated in run ${w2b2RunId}: item #${String(otherRow.product_id)} carries both mps: and ${String(otherRow.driver_so)} drivers`)
        }
      }
    }
    // B9: the real-data dashboards — the kpi_snapshots collection, the
    // shipped_at OTIF anchor, the 经营分析 group + four dashboard pages,
    // the chart floors (every chart reads kpi_snapshots directly; the
    // supply radar reads srm_score_cards), and the 90-day backfill floor
    // (PLAN D9: one row per code per day).
    {
      if (await dataOf(token, 'GET', '/api/collections/kpi_snapshots') === null) failures.push('kpi_snapshots collection missing (run nocobase-w9-dashboards.mts)')
      const shippedAtField = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'so_orders' }, name: { $eq: 'shipped_at' } }))}&pageSize=1`) as { data?: unknown[] }
      if ((shippedAtField?.data ?? []).length === 0) failures.push('so_orders.shipped_at missing (run nocobase-w9-dashboards.mts)')
      const b9Routes = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=200') as { data?: Array<Record<string, any>> }
      const b9Titles = new Set((b9Routes?.data ?? []).map(row => String(row?.title ?? '')))
      const missingB9 = ['经营看板', '供应链看板', '生产看板', '库存看板', '应收应付对账'].filter(title => !b9Titles.has(title))
      if (missingB9.length > 0) failures.push(`B9 经营分析 flowPages missing: ${missingB9.join(', ')} (run nocobase-w9-dashboards.mts)`)
      if (!b9Titles.has('经营分析')) failures.push('经营分析 menu group missing (run nocobase-w9-dashboards.mts)')
      const b9ChartRows = (await call(token, 'GET', '/api/flowModels:list?pageSize=12000') as { data?: Array<Record<string, any>> }).data ?? []
      const b9Charts = b9ChartRows.filter(row => row?.use === 'ChartBlockModel')
      const queryOf = (row: Record<string, any>): any => row?.stepParams?.chartSettings?.configure?.query ?? {}
      const kpiCharts = b9Charts.filter(row => queryOf(row)?.resource?.collectionName === 'kpi_snapshots'
        || (Array.isArray(queryOf(row)?.collectionPath) && queryOf(row).collectionPath.join('.') === 'main.kpi_snapshots'))
      if (kpiCharts.length < 11) failures.push(`kpi_snapshots ChartBlockModel count ${String(kpiCharts.length)} < 11 (run nocobase-w9-dashboards.mts; W2-B4 added the turnover chart, W2-B7 the AR/AP trends)`)
      const b9Radar = b9Charts.filter(row => ['q', 'd', 'p', 's', 'c'].every(alias =>
        (Array.isArray(queryOf(row)?.measures) ? queryOf(row).measures : []).some((measure: any) => String(measure?.alias ?? '') === alias)))
      if (b9Radar.length < 1) failures.push('the supplier-performance radar chart missing (run nocobase-w9-dashboards.mts)')
      const b9Snapshots = (await dataOf(token, 'GET', '/api/kpi_snapshots:list?pageSize=4000') as Array<Record<string, any>> | null) ?? []
      const b9Dates = new Set(b9Snapshots.map(row => String(row.calc_date ?? '')))
      const b9Codes = new Set(b9Snapshots.map(row => String(row.kpi_code ?? '')))
      if (b9Dates.size < 90) failures.push(`kpi_snapshots covers only ${String(b9Dates.size)} dates (< 90; run kpi-run.mts --backfill 90)`)
      if (b9Codes.size < 25) failures.push(`kpi_snapshots covers only ${String(b9Codes.size)} codes (< 25; run kpi-run.mts --calc-kpi — W2-B7 raised 24 to 25 with ap_balance)`)
      // W2-B7: the AR/AP reconciliation page — two balance-trend charts plus
      // the four read-only ledger blocks under its own grid.
      const reconPage = (b9Routes?.data ?? []).find(row => row?.title === '应收应付对账' && row?.type === 'flowPage')
      if (reconPage === undefined) {
        failures.push('应收应付对账 flowPage missing (run nocobase-w9-dashboards.mts)')
      } else {
        const reconTab = (b9Routes?.data ?? []).find(row => Number(row?.parentId) === Number(reconPage.id) && row?.type === 'tabs')
        const reconGrid = reconTab?.schemaUid == null ? null : await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${String(reconTab.schemaUid)}&subKey=grid`) as { uid?: string } | null
        if (reconGrid?.uid == null) {
          failures.push('应收应付对账 grid missing (run nocobase-w9-dashboards.mts)')
        } else {
          const under = b9ChartRows.filter(row => String(row?.parentId ?? '') === String(reconGrid.uid))
          const reconTables = new Set(under.filter(row => row?.use === 'TableBlockModel').map(row => String(row?.stepParams?.resourceSettings?.init?.collectionName ?? '')))
          for (const collection of ['so_orders', 'crm_payments', 'pur_invoices', 'pur_payments']) {
            if (!reconTables.has(collection)) failures.push(`应收应付对账 detail block on ${collection} missing (run nocobase-w9-dashboards.mts)`)
          }
          // The chart filter lands server-canonicalized ({logic, items:[{path,
          // operator, value}]}), so read a key the same way w9's
          // chartFilterValue does — a bare filter.kpi_code read misses it.
          const reconFilterValue = (row: Record<string, any>, key: string): unknown => {
            const filter = queryOf(row)?.filter
            if (filter === null || typeof filter !== 'object') return undefined
            const flat = filter as { items?: Array<{ path?: unknown, value?: unknown }>, [key: string]: unknown }
            if (Array.isArray(flat.items)) {
              for (const item of flat.items) {
                const path = Array.isArray(item.path) ? item.path[item.path.length - 1] : item.path
                if (String(path) === key) return item.value
              }
              return undefined
            }
            return flat[key]
          }
          const reconChartCodes = new Set(under.filter(row => row?.use === 'ChartBlockModel').map(row => String(reconFilterValue(row, 'kpi_code') ?? '')))
          for (const code of ['ar_balance', 'ap_balance']) {
            if (!reconChartCodes.has(code)) failures.push(`应收应付对账 ${code} trend chart missing (run nocobase-w9-dashboards.mts)`)
          }
        }
      }
    }
    // W2-B7: the two persona sources and their .dsh mirrors must stay
    // byte-identical (the R4 r4-01 convention, now wired as a gate).
    {
      for (const preset of ['business-advisor', 'mobile-form-assistant'] as const) {
        const source = readFileSync(join(repoRoot, 'examples/kb-agent/agent-presets', preset, 'agent.cordis.yml'), 'utf8')
        const mirror = readFileSync(join(repoRoot, 'examples/kb-agent/.dsh/.agent-presets', preset, 'agent.cordis.yml'), 'utf8')
        if (source !== mirror) failures.push(`${preset} persona source and .dsh mirror differ (edit both files together; diff to inspect)`)
      }
    }
  }
  // R3: every guarded doc-number column carries its partial unique index
  // (the tool-side anti-collision preflight's database backstop).
  const guardedIndexNames = ['ux_pur_orders_code', 'ux_pur_requests_code', 'ux_so_orders_code', 'ux_mfg_orders_code', 'ux_wms_receipts_receipt_no', 'ux_srm_suppliers_code']
  const guardedIndexes = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-t', '-A', '-c',
    `SELECT indexname FROM pg_indexes WHERE indexname IN (${guardedIndexNames.map(name => `'${name}'`).join(', ')})`], { encoding: 'utf8' })
  if (guardedIndexes.status !== 0 || (guardedIndexes.stdout ?? '').trim().split('\n').filter(line => line.length > 0).length !== guardedIndexNames.length) {
    failures.push('guarded doc-number unique indexes incomplete (run "setup-nocobase.mts unique-indexes")')
  }
  const flowModels = await call(token, 'GET', '/api/flowModels:list?pageSize=12000') as { data?: Array<{ use?: string, uid?: string, parentId?: string, stepParams?: Record<string, any> }>, meta?: { total?: number } }
  const flowModelRows = flowModels?.data ?? []
  if (typeof flowModels?.meta?.total === 'number' ? flowModels.meta.total > flowModelRows.length : flowModelRows.length === 12000) {
    failures.push(`flowModels:list may be truncated (${flowModelRows.length} rows); raise the verify pageSize`)
  }
  const modelCount = (use: string) => flowModelRows.filter(row => row.use === use).length
  if (modelCount('AddNewActionModel') < 8) failures.push('AddNewActionModel count < 8 (v2 table action bars incomplete)')
  if (modelCount('FormSubmitActionModel') < 8) failures.push('FormSubmitActionModel count < 8 (Add-new popups cannot submit)')
  // W3-B1: every table block carries a row-detail actions column and every
  // view action (table rows + kanban/calendar cards) resolves a persisted
  // page subtree — the load-only contract whose absence was the P0 "drawer
  // opens empty" root cause. AddNew popups must stay 100% online too. The
  // W3-B2 drawer-embedded subtable blocks (w3b2stb) carry their actions
  // column inside the nested tree, so they are out of this flat coverage
  // check (they get their own association assertion below).
  const tableBlocks = flowModelRows.filter(row => row.use === 'TableBlockModel' && !row.uid?.startsWith('w3b2stb'))
  const actionsColumns = flowModelRows.filter(row => row.use === 'TableActionsColumnModel')
  if (actionsColumns.length < tableBlocks.length) {
    failures.push(`TableActionsColumnModel ${actionsColumns.length} < TableBlockModel ${tableBlocks.length} (run w3-heal-row-details.mts to wire row-detail drawers)`)
  }
  const viewActions = flowModelRows.filter(row => row.use === 'ViewActionModel' || row.use === 'KanbanCardViewActionModel' || row.use === 'CalendarEventViewActionModel')
  let drawerSubtreesMissing = 0
  for (const action of viewActions) {
    const page = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(action.uid ?? ''))}&subKey=page`)
    if (page?.uid == null) drawerSubtreesMissing += 1
  }
  if (drawerSubtreesMissing > 0) failures.push(`${drawerSubtreesMissing} view action(s) have no persisted drawer page subtree (run w3-heal-row-details.mts)`)
  const memberGrants = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' } }))}`)) as Array<{ name?: string }> | null
  if ((memberGrants ?? []).length < 70) failures.push(`member rolesResources rows ${(memberGrants ?? []).length} < 70 (run w3-heal-row-details.mts to grant member view ACL)`)
  const memberActionSample = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=300`)) as Array<{ fields?: unknown, rolesResourceId?: number }> | null
  const memberGrantIds = new Set((memberGrants ?? []).map(row => (row as { id?: number }).id))
  const nakedMemberActions = (memberActionSample ?? []).filter(row => memberGrantIds.has(row.rolesResourceId) && !(Array.isArray(row.fields) && row.fields.length > 0))
  if (nakedMemberActions.length > 0) failures.push(`${nakedMemberActions.length} member action row(s) lack explicit field lists (fields=[] or null strips columns / skips drawer render — run w3-heal-row-details.mts ACL pass)`)
  // W3-B2: the 12 association-bound subtable blocks exist, guarded Edits
  // exclude engine-state fields, engine collections carry no Delete, and the
  // two-way approval jump is wired (todo 前往单据 + engine rows 审批进度).
  const subtableAssociations = [
    'pur_orders.order_lines', 'pur_requests.request_lines', 'pur_rfqs.rfq_suppliers', 'pur_rfqs.quotes',
    'so_orders.order_lines', 'mps_plans.plan_items', 'mfg_boms.bom_lines', 'mfg_boms.bom_operations',
    'qm_inspections.inspection_readings', 'srm_suppliers.certificates', 'srm_suppliers.audit_records', 'srm_suppliers.score_cards',
  ]
  const subtableBlocks = flowModelRows.filter(row => row.use === 'TableBlockModel' && row.uid?.startsWith('w3b2stb'))
  for (const association of subtableAssociations) {
    if (!subtableBlocks.some(row => row.stepParams?.resourceSettings?.init?.associationName === association)) {
      failures.push(`subtable block ${association} missing (run w3-heal-row-details.mts B2 pass)`)
    }
  }
  const collectFieldPaths = (node: any, into: Set<string> = new Set()): Set<string> => {
    if (Array.isArray(node)) { for (const item of node) collectFieldPaths(item, into); return into }
    if (node === null || typeof node !== 'object') return into
    const path = node?.stepParams?.fieldSettings?.init?.fieldPath
    if (typeof path === 'string' && node?.use === 'FormItemModel') into.add(path)
    if (node?.subModels) collectFieldPaths(node.subModels, into)
    return into
  }
  const engineStateSample: ReadonlyArray<[string, string[]]> = [
    ['pur_orders', ['doc_status', 'invoice_status', 'receiving_status', 'approved_by', 'approved_at']],
    ['qm_inspections', ['status', 'result']],
    ['mfg_orders', ['doc_status']],
  ]
  for (const editAction of flowModelRows.filter(row => row.use === 'EditActionModel' && row.uid?.startsWith('w3b2ea'))) {
    const pageTree = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(editAction.uid))}&subKey=page`)
    const fieldPaths = collectFieldPaths(pageTree)
    for (const [collection, banned] of engineStateSample) {
      const column = flowModelRows.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === String(editAction.parentId))
      const table = column === undefined ? undefined : flowModelRows.find(row => row.uid === column.parentId)
      if (table?.stepParams?.resourceSettings?.init?.collectionName !== collection) continue
      const leaked = [...fieldPaths].filter(path => banned.includes(path))
      if (leaked.length > 0) failures.push(`guarded Edit on ${collection} leaks engine-state fields: ${leaked.join(',')} (invariant 1 — rerun w3-heal-row-details.mts B2 pass)`)
    }
  }
  const engineNoDelete = ['pur_orders', 'so_orders', 'mfg_orders', 'qm_inspections', 'wms_receipts', 'wms_counts', 'srm_suppliers']
  for (const collection of engineNoDelete) {
    for (const table of flowModelRows.filter(row => row.use === 'TableBlockModel' && row.stepParams?.resourceSettings?.init?.collectionName === collection)) {
      const column = flowModelRows.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === String(table.uid))
      if (column === undefined) continue
      const hasDelete = flowModelRows.some(row => row.use === 'DeleteActionModel' && String(row.parentId ?? '') === String(column.uid))
      if (hasDelete) failures.push(`${collection} carries a row Delete action (engine-governed documents never get one — invariant 1)`)
    }
  }
  const todoTables = flowModelRows.filter(row => row.use === 'TableBlockModel' && row.stepParams?.resourceSettings?.init?.collectionName === 'wfl_approval_todos')
  if (todoTables.length > 0) {
    const todoJumps = flowModelRows.filter(row => row.use === 'JSRecordActionModel' && row.uid?.startsWith('w3b2ja')
      && todoTables.some(table => {
        const column = flowModelRows.find(col => col.use === 'TableActionsColumnModel' && String(col.parentId ?? '') === String(table.uid))
        return column !== undefined && String(row.parentId ?? '') === String(column.uid)
      }))
    if (todoJumps.length === 0) failures.push('wfl_approval_todos rows lack the 前往单据 jump (run w3-heal-row-details.mts B2 pass / nocobase-w1-approval.mts)')
  }
  if (flowModelRows.filter(row => row.use === 'JSRecordActionModel' && row.uid?.startsWith('w3b2ja')).length < 10) {
    failures.push('business-row 审批进度 jumps missing (run w3-heal-row-details.mts B2 pass)')
  }
  // W3-B3: read-only multi-view surfaces — four engine-object kanbans
  // (dragEnabled:false, no create paths), the v1 scheduling gantt, and the
  // two dual-block calendars. Every drawer must also be record-scoped: the
  // DetailsBlock init carries the filterByTk key or the drawer renders the
  // collection's first record (the rescope defect found in the B3 journey).
  const b3Routes = (await dataOf(token, 'GET', `/api/desktopRoutes:list?pageSize=400`)) as Array<{ title?: string, type?: string, schemaUid?: string }>
  const b3Boards: ReadonlyArray<[string, string]> = [['采购看板', 'pur_orders'], ['生产订单看板', 'mfg_orders'], ['销售看板', 'so_orders'], ['质检看板', 'qm_inspections']]
  for (const [title, collection] of b3Boards) {
    const routeRow = b3Routes.find(row => row.title === title && row.type === 'flowPage')
    if (routeRow === undefined) failures.push(`${title} flowPage route missing (run nocobase-w3-views.mts)`)
    const board = flowModelRows.find(row => row.use === 'KanbanBlockModel' && String(row.uid ?? '').startsWith('w3b3')
      && row.stepParams?.resourceSettings?.init?.collectionName === collection)
    if (board === undefined) {
      failures.push(`${title}: w3b3 KanbanBlockModel missing (run nocobase-w3-views.mts)`)
      continue
    }
    if (board.props?.dragEnabled !== false) failures.push(`${title}: dragEnabled is not false (D4 read-only violation)`)
    const boardUid = String(board.uid ?? '')
    for (const child of flowModelRows.filter(row => String(row.parentId ?? '') === boardUid)) {
      if (child.use === 'AddNewActionModel' || child.use === 'KanbanQuickCreateActionModel') {
        failures.push(`${title}: read-only board carries ${String(child.use)} (engine verbs only)`)
      }
    }
  }
  // Every kanban on an engine-governed collection is read-only, any prefix.
  for (const row of flowModelRows.filter(candidate => candidate.use === 'KanbanBlockModel'
    && ['pur_orders', 'mfg_orders', 'so_orders', 'qm_inspections'].includes(String(candidate.stepParams?.resourceSettings?.init?.collectionName ?? '')))) {
    if (row.props?.dragEnabled !== false) failures.push(`engine-collection kanban ${String(row.uid)} is drag-enabled (D4)`)
  }
  // Free-state boards keep their drag (the B1-fixed capas/dispositions pair).
  for (const collection of ['srm_capas', 'qm_nc_dispositions']) {
    const board = flowModelRows.find(row => row.use === 'KanbanBlockModel'
      && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
    if (board !== undefined && board.props?.dragEnabled !== true) failures.push(`free-state kanban ${collection} lost dragEnabled:true (regression)`)
  }
  // Drawers are record-scoped: the persisted page tree's DetailsBlock init
  // carries filterByTk (MultiRecordResource fallback = first-record defect).
  const b3ViewActions = flowModelRows.filter(row => (row.use === 'ViewActionModel' || row.use === 'KanbanCardViewActionModel' || row.use === 'CalendarEventViewActionModel'))
  let unscopedDrawers = 0
  const drawerScoped = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.every(drawerScoped)
    if (node === null || typeof node !== 'object') return true
    const row = node as Record<string, any>
    if (row.use === 'DetailsBlockModel') return typeof row?.stepParams?.resourceSettings?.init?.filterByTk === 'string'
    if (row.use === 'EditFormModel') return true
    if (row.subModels) return drawerScoped(row.subModels)
    return true
  }
  for (const action of b3ViewActions) {
    const page = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(action.uid ?? ''))}&subKey=page`)
    if (page?.uid != null && !drawerScoped(page)) unscopedDrawers += 1
  }
  if (unscopedDrawers > 0) failures.push(`${unscopedDrawers} drawer(s) render the collection's first record (DetailsBlock init lacks filterByTk — run w3-heal-row-details.mts rescope pass)`)
  // The v1 scheduling gantt: route + uiSchemas carry the read-only
  // GanttBlockProvider over mfg_order_operations planned_date.
  const ganttRoute = b3Routes.find(row => row.title === '排产甘特' && row.type === 'page')
  if (ganttRoute?.schemaUid == null) {
    failures.push('排产甘特 v1 page route/schemaUid missing (run nocobase-w3-views.mts)')
  } else {
    const ganttTree = await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${ganttRoute.schemaUid}`)
    const findGanttDecorator = (node: unknown): Record<string, any> | undefined => {
      if (node === null || typeof node !== 'object') return undefined
      const row = node as Record<string, any>
      if (row['x-decorator'] === 'GanttBlockProvider') return row
      for (const child of Object.values(row.properties ?? {})) {
        const found = findGanttDecorator(child)
        if (found !== undefined) return found
      }
      return undefined
    }
    const decorator = findGanttDecorator(ganttTree)
    if (decorator === undefined) {
      failures.push('排产甘特 uiSchemas carries no GanttBlockProvider')
    } else {
      const fieldNames = decorator['x-decorator-props']?.fieldNames ?? {}
      if (fieldNames.start !== 'planned_date' || fieldNames.end !== 'planned_date' || fieldNames.title !== 'name') {
        failures.push(`排产甘特 fieldNames wrong: ${JSON.stringify(fieldNames)}`)
      }
      if (decorator['x-decorator-props']?.enableDragToReschedule !== false) failures.push('排产甘特 enableDragToReschedule !== false (D5 read-only violation)')
    }
  }
  // Dual-block calendars: two w3b3 CalendarBlockModel rows per page, quick-create off.
  const b3Calendars: ReadonlyArray<[string, string]> = [['交期日历', 'so_orders'], ['交期日历', 'pur_orders'], ['计划日历', 'mps_plans'], ['计划日历', 'mrp_suggestions']]
  for (const [title, collection] of b3Calendars) {
    const routeRow = b3Routes.find(row => row.title === title && row.type === 'flowPage')
    if (routeRow === undefined) failures.push(`${title} flowPage route missing (run nocobase-w3-views.mts)`)
    const block = flowModelRows.find(row => row.use === 'CalendarBlockModel' && String(row.uid ?? '').startsWith('w3b3')
      && row.stepParams?.resourceSettings?.init?.collectionName === collection)
    if (block === undefined) {
      failures.push(`${title}: w3b3 CalendarBlockModel on ${collection} missing (run nocobase-w3-views.mts)`)
      continue
    }
    if (block.props?.enableQuickCreateEvent !== false) failures.push(`${collection} calendar allows quick-create events (read-only violation)`)
  }
  // The B3 views read three collections member had no prior grant for.
  const memberGrantNames = new Set(((await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' } }))}`)) ?? []).map((row: { name?: string }) => String(row.name ?? '')))
  for (const collection of ['mfg_order_operations', 'mps_plans', 'mrp_suggestions']) {
    if (!memberGrantNames.has(collection)) failures.push(`member view grant missing on ${collection} (run nocobase-w3-views.mts ACL pass)`)
  }
  // W3-B4: the approval-flow configuration center — the flowPage exists with
  // its admin+root-only menu binding (member dropped), the four wfl config
  // tables carry w3b4 row-Edit actions, the configs edit form marks
  // config_note required, member holds view-only grants on the config
  // collections, and the consistency probe (the same fail-loud 口径 the CLI
  // runs) is green.
  {
    const b4Page = b3Routes.find(row => row.title === '审批流配置' && row.type === 'flowPage')
    if (b4Page === undefined) {
      failures.push('审批流配置 flowPage route missing (run nocobase-w3-approval-visual.mts)')
    } else {
      const bindings = (await dataOf(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: b4Page.id } }))}`)) as Array<{ roleName?: string }> | null
      const roles = (bindings ?? []).map(row => String(row.roleName ?? ''))
      if (roles.includes('member')) failures.push('审批流配置 menu still binds member (admin-only violation)')
      if (!roles.includes('admin') || !roles.includes('root')) failures.push(`审批流配置 menu bindings incomplete: ${roles.join(',') || '(none)'} (want admin+root)`)
      const tab = b3Routes.find(row => row.type === 'tabs' && row.parentId === b4Page.id)
      if (tab?.schemaUid != null) {
        const b4Grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
        const b4Map = b4Grid?.uid == null ? undefined : flowModelRows.find(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(b4Grid.uid))
        if (b4Map === undefined) failures.push('审批流配置 SVG 状态图 JSBlock missing (run nocobase-w3-approval-visual.mts)')
        else if (!String(b4Map.stepParams?.jsSettings?.runJs?.code ?? '').includes('wfl_flow_transitions')) failures.push('审批流配置 JSBlock code does not read the wfl trio')
      }
    }
    for (const collection of ['wfl_flow_configs', 'wfl_flow_states', 'wfl_flow_transitions', 'wfl_gate_configs']) {
      const table = flowModelRows.find(row => row.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w3b4')
        && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
      if (table === undefined) {
        failures.push(`w3b4 config table on ${collection} missing (run nocobase-w3-approval-visual.mts)`)
        continue
      }
      const column = flowModelRows.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === String(table.uid))
      const hasEdit = column !== undefined && flowModelRows.some(row => row.use === 'EditActionModel' && String(row.uid ?? '').startsWith('w3b4') && String(row.parentId ?? '') === String(column.uid))
      if (!hasEdit) failures.push(`${collection} rows lack the w3b4 Edit action`)
    }
    const configEdits = flowModelRows.filter(row => row.use === 'EditActionModel' && String(row.uid ?? '').startsWith('w3b4')
      && String(row.stepParams?.popupSettings?.openView?.collectionName ?? '') === 'wfl_flow_configs')
    if (configEdits.length === 0) {
      failures.push('wfl_flow_configs row Edit action missing (config_note required form)')
    } else {
      const pageTree = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(configEdits[0]?.uid ?? ''))}&subKey=page`)
      const flat = JSON.stringify(pageTree ?? {})
      if (!flat.includes('"config_note"') || !flat.includes('"required":true')) failures.push('wfl_flow_configs edit form does not mark config_note required')
    }
    for (const collection of ['wfl_flow_configs', 'wfl_flow_states', 'wfl_flow_transitions', 'wfl_gate_configs']) {
      if (!memberGrantNames.has(collection)) failures.push(`member view-only grant missing on ${collection} (run nocobase-w3-approval-visual.mts ACL pass)`)
    }
    const wflConsistency = await assertWflConsistency(token)
    for (const failure of wflConsistency) failures.push(`wfl 探针：${failure}`)
  }
  // W3-B5: the organization & permission surface — one imported 口径 with the
  // org-acl script's --assert (department tree/affiliations对拍, the 组织架构
  // and 权限矩阵 pages' wires, the admin-only matrix menu, member's action
  // matrix, the dept-routed qm_nc_dispositions witness, and the B4
  // consistency probe with department-form awareness).
  {
    const orgFailures = await collectOrgAclFailures(token)
    for (const failure of orgFailures) failures.push(`w3b5 组织权限：${failure}`)
  }
  // W3-B6: the operator terminals — three flowPages carry engine-serve
  // iframes, and the serve verbs refuse their signature negatives live.
  {
    const terminalSpecs = [
      { title: '车间终端', page: 'report', operator: 'linjingyi', stranger: 'quality_lead' },
      { title: '质检工作台', page: 'inspect', operator: 'quality_lead', stranger: 'linjingyi' },
      { title: '收货终端', page: 'receive', operator: 'b4guard', stranger: 'qc_inspector' },
    ] as const
    const routesList = await call(token, 'GET', '/api/desktopRoutes:list?pageSize=400') as { data?: Array<{ title?: string, type?: string, schemaUid?: string, id?: number, parentId?: number }> }
    const routeRows = routesList?.data ?? []
    const modelsAll = (flowModels?.data ?? []) as Array<{ use?: string, uid?: string, parentId?: string, props?: { url?: string } }>
    for (const spec of terminalSpecs) {
      const flow = routeRows.find(row => row.title === spec.title && row.type === 'flowPage')
      if (flow === undefined) {
        failures.push(`w3b6 终端：flowPage「${spec.title}」missing (run nocobase-w3-views.mts)`)
        continue
      }
      const tab = routeRows.find(row => row.type === 'tabs' && row.parentId === flow.id)
      if (tab?.schemaUid == null) {
        failures.push(`w3b6 终端：「${spec.title}」tabs grid row missing`)
        continue
      }
      const grid = await call(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { data?: { uid?: string } } | null
      const gridUid = grid?.data?.uid
      const iframe = modelsAll.find(row => row.use === 'IframeBlockModel' && row.parentId === gridUid)
      if (iframe === undefined) {
        failures.push(`w3b6 终端：「${spec.title}」IframeBlockModel missing under grid ${String(gridUid)}`)
      } else if (!String(iframe.props?.url ?? '').includes(`/terminals/${spec.page}.html`)) {
        failures.push(`w3b6 终端：「${spec.title}」iframe url ${JSON.stringify(String(iframe.props?.url ?? ''))} 不指向 /terminals/${spec.page}.html`)
      }
    }
    // The serve smoke (negative pair): only when approval-engine --serve is
    // live on :13110 — otherwise a hint (the pages need it running anyway).
    try {
      const healthz = await fetch('http://127.0.0.1:13110/healthz', { signal: AbortSignal.timeout(2000) })
      if (healthz.ok) {
        const equation = await fetch('http://127.0.0.1:13110/report-job', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ operator: 'linjingyi', mo_code: 'MO-0000-NOSUCH', op_seq: 1, qty_good: 1, qty_pending: 0, qty_scrap: 0 }),
          signal: AbortSignal.timeout(8000),
        })
        if (equation.ok) failures.push('w3b6 终端：/report-job 对不存在的 MO 未拒绝（fail-loud 缺失）')
        else console.log(`setup-nocobase verify: w3b6 serve smoke — /report-job negative refused ✓ (HTTP ${String(equation.status)})`)
        const fence = await fetch(`http://127.0.0.1:13110/terminal/inspect?operator=linjingyi`, { signal: AbortSignal.timeout(8000) })
        if (fence.status !== 403) failures.push(`w3b6 终端：部门围栏负例期望 403，实际 ${String(fence.status)}`)
        else console.log('setup-nocobase verify: w3b6 serve smoke — cross-department 403 fence ✓')
      }
    } catch {
      console.log('setup-nocobase verify: no live approval-engine :13110; the w3b6 endpoint smoke was not probed (start the serve and rerun verify for the verb negatives)')
    }
  }
  // N18: every Add-new popup carries the in-form AI fill button (the official
  // AIEmployeeButtonModel on CreateFormModel.actions). Counting only the
  // deterministic `n18ai-` uid prefix keeps foreign AIEmployeeButtonModel rows
  // from padding the count, and requiring every such row to carry the prefix
  // surfaces unexpected mounts instead of letting them hide among ours.
  // This is a flowModels (DB) assertion: the button's uid never enters the
  // runtime DOM (it renders as a plain 40px ant-avatar next to the submit
  // button — see QUICKSTART's AI-button note for the render-layer shape and
  // the correct probe); do not re-introduce a "search the DOM for n18ai"
  // acceptance check.
  const aiButtons = (flowModels?.data ?? []).filter(row => row.use === 'AIEmployeeButtonModel')
  const n18Buttons = aiButtons.filter(row => row.uid?.startsWith('n18ai-'))
  // 11 = the N17d eight CRM/Hub pages + the E1 项目管理 three (项目/任务列表/里程碑);
  // +2 = the F1 kanban/calendar Add-new popups; +5 = the F2 CRM pages; +7 =
  // the F3 pages (2 Add-new popups on 工作台, 4 on 分类维护); +8 = the H4 SRM
  // pages; +9 = the H5 WMS pages (仓库库区/库位平面图/入库单/出库单/库存查询/
  // 批次主数据/盘点管理/移库管理/库存流水); +1 = the B0 采购供应商 page; +1 =
  // the W1 审批中心 intent Add-new form.
  // 53 = the W3 采购管理 nine popup forms (PR×2/RFQ×2/报价/PO×2/发票/付款) join.
  // 56 = the B4 仓储 trio (预留管理/补货预警/盘点计划) joins.
  // 62 = the B5 生产制造 six popup forms (BOM 头/组件行/工序/工作中心/节假日/MO) join.
  // 66 = the B6 生产执行 four popup forms (领料单/退料单/报工记录/完工单) join.
  // 82 = the W3-B4 审批流配置 flow_configs Add-new form + one prior
  // orphan-covered form join (n18's catalog pageSize rose 6000→12000 the same batch).
  if (n18Buttons.length < 82) failures.push(`n18ai- AIEmployeeButtonModel count ${n18Buttons.length} < 82 (form AI fill buttons missing; run nocobase-n18-form-ai.mts after the f1/f2/f3/h4/h5/w1-w3/b4/w5/w6/w8/w3b4 seeds)`)
  // H5: the bin-map custom block rides the JSBlockModel authoring channel —
  // exactly one on the 库位平面图 grid.
  if (modelCount('JSBlockModel') < 1) failures.push('JSBlockModel missing (run nocobase-h5-wms.mts for the 库位平面图 map block)')
  // Row-level AI actions configured by hand in the UI (not seeded) are legal;
  // only unknown foreign mounts may pad the AIEmployeeButtonModel census.
  const KNOWN_HAND_CONFIGURED_AI_BUTTONS = new Set(['26c6ab488b1']) // viz action on the E1 项目 table
  const foreignAiButtons = aiButtons.filter(row => !row.uid?.startsWith('n18ai-') && !KNOWN_HAND_CONFIGURED_AI_BUTTONS.has(row.uid ?? ''))
  if (foreignAiButtons.length > 0) failures.push(`${foreignAiButtons.length} AIEmployeeButtonModel row(s) carry no n18ai- uid prefix (unexpected foreign mounts; inspect flowModels)`)
  // F1 view-page spine: exactly one Kanban/Calendar block on hub_pj_tasks,
  // and the kanban card chain survives (KanbanCardItemModel + DetailsGridModel).
  if (modelCount('KanbanBlockModel') < 1) failures.push('KanbanBlockModel missing (run nocobase-f1-view-v2.mts for 任务看板)')
  if (modelCount('CalendarBlockModel') < 1) failures.push('CalendarBlockModel missing (run nocobase-f1-view-v2.mts for 任务日历)')
  if (modelCount('KanbanCardItemModel') < 1 || modelCount('DetailsGridModel') < 1) failures.push('kanban card chain incomplete (KanbanCardItemModel/DetailsGridModel missing; re-run nocobase-f1-view-v2.mts)')
  const atlas = await call(token, 'GET', `/api/aiEmployees:list?filter=${encodeURIComponent(JSON.stringify({ username: { $eq: 'atlas' } }))}&pageSize=1`) as { data?: Array<{ about?: string }> }
  if (!(atlas?.data?.[0]?.about ?? '').includes('简体中文')) failures.push('atlas about is not the Chinese prompt (re-run nocobase-n17-alignment.mts)')
  // N13 data widening floors; verify asserts presence, not the exact counts.
  const rowFloor = async (collection: string, floor: number): Promise<string | null> => {
    const rows = await call(token, 'GET', `/api/${collection}:list?pageSize=1`) as { meta?: { count?: number } } | null
    const count = rows?.meta?.count ?? 0
    return count >= floor ? null : `${collection} has ${count} rows (< ${floor}); run the all chain so nocobase-n13-seed.mts tops up`
  }
  for (const [collection, floor] of [['crm_leads', 30], ['crm_customers', 20], ['hub_tk_tickets', 40], ['hub_as_assets', 24]] as const) {
    const failure = await rowFloor(collection, floor)
    if (failure !== null) failures.push(failure)
  }
  // The expert roster and the historical orders ride the all chain through
  // setup-dsh-data (the market experts/services, the roster's document-kind
  // datasets, and the ORD-B5- history are builtin data after a reset): 32
  // roster experts + the authoritative 张红喜 row, the roster's 49 orderable
  // services, the market catalog's dataset rows, and the 24 seeded orders.
  for (const [collection, floor] of [['experts', 33], ['expert_services', 50], ['datasets', 89], ['orders', 24]] as const) {
    const failure = await rowFloor(collection, floor)
    if (failure !== null) failures.push(`${failure}; run the all chain so setup-dsh-data.mts seeds the expert roster and the historical orders`)
  }
  // H4: the SRM seed floors (9 suppliers with the three-tier grading, 15
  // certificates covering every warn band, 33 checklist rows, 12 audits, 16
  // quarter cards, 5 CAPAs) — the CAPA floor stays 5: the <60 auto-CAPA
  // workflow only fires on live low-score creates, never on seeds.
  for (const [collection, floor] of [
    ['srm_suppliers', 9], ['srm_certificates', 15], ['srm_audit_checklists', 30],
    ['srm_audit_records', 12], ['srm_score_cards', 16], ['srm_capas', 5],
  ] as const) {
    const failure = await rowFloor(collection, floor)
    if (failure !== null) failures.push(`${failure}; run nocobase-h4-srm.mts so the SRM domain seeds`)
  }
  // H5: the WMS seed floors (72 bins over six zones, 12 lots with the
  // four-date model, the stock/movement pair balanced by the opening
  // alignment, and the documents across states).
  for (const [collection, floor] of [
    ['wms_zones', 8], ['wms_bins', 86], ['wms_lots', 12], ['wms_stock', 9],
    ['wms_movements', 39], ['wms_receipts', 5], ['wms_shipments', 5],
    ['wms_transfers', 2], ['wms_counts', 3], ['wms_monthly_balances', 2],
  ] as const) {
    const failure = await rowFloor(collection, floor)
    if (failure !== null) failures.push(`${failure}; run nocobase-h5-wms.mts so the WMS domain seeds`)
  }
  // H4 foundation: hub_inv_products carries the five nullable food columns
  // (shelf-life/temp-zone/storage/GB2760/allergens — the I-round PLM anchors).
  {
    const productFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_inv_products' } }))}&pageSize=200`) as { data?: Array<{ name?: string }> }
    const productFieldNames = new Set((productFields?.data ?? []).map(field => field.name))
    for (const foodField of ['shelf_life_days', 'temp_zone', 'storage_conditions', 'gb2760_category', 'allergens']) {
      if (!productFieldNames.has(foodField)) failures.push(`hub_inv_products.${foodField} missing (run nocobase-h4-srm.mts for the food foundation columns)`)
    }
  }
  // m2o display anchor (N16): AssociationField renders the target's name
  // column only when the field uiSchema carries fieldNames.label.
  const quoteFields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'crm_quotes' }, type: { $eq: 'belongsTo' } }))}&pageSize=10`) as { data?: Array<{ name?: string, uiSchema?: { 'x-component-props'?: { fieldNames?: { label?: string } } } }> }
  for (const field of quoteFields?.data ?? []) {
    if (field.name === undefined) continue
    if (field.uiSchema?.['x-component-props']?.fieldNames?.label !== 'name') {
      failures.push(`crm_quotes.${field.name} m2o fieldNames.label missing (quotes table shows N/A); re-run the crm module step`)
    }
  }
  for (const portal of ['crm', 'hub']) {
    const probe = await fetch(`${baseUrl}/dist/${portal}/`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(5000) }).catch(() => null)
    if (probe === null || !probe.ok) failures.push(`portal /dist/${portal}/ not reachable; run nocobase-portal-deploy.mts`)
  }
  // C4: the portal's floating AI-chat icon must resolve as a real SVG —
  // before the NOCOBASE_PORTAL_BASE injection its root-absolute URL fell
  // into the gateway's HTML fallback (a fake 200 text/html, blank icon), so
  // reachability alone proves nothing. The icon is a hashed vite asset the
  // bundle imports at runtime (not in the entry HTML), so locate it in the
  // deployed assets directory and fetch its served URL.
  for (const portal of ['crm', 'hub']) {
    const assetsDir = join(repoRoot, 'platform/nocobase/storage/dist-client', portal, 'assets')
    const iconFile = existsSync(assetsDir) ? readdirSync(assetsDir).find(name => name.startsWith('nocobase-ai-chat') && name.endsWith('.svg')) : undefined
    if (iconFile === undefined) {
      failures.push(`portal ${portal} assets name no nocobase-ai-chat icon; rerun nocobase-portal-deploy.mts`)
      continue
    }
    const iconUrl = `${baseUrl}/dist/${portal}/assets/${iconFile}`
    const iconProbe = await fetch(iconUrl, { signal: AbortSignal.timeout(5000) }).catch(() => null)
    const iconType = iconProbe?.headers.get('content-type') ?? ''
    if (iconProbe === null || !iconProbe.ok) failures.push(`portal ${portal} AI icon ${iconFile} unreachable (HTTP ${iconProbe?.status ?? 'network error'}); rerun nocobase-portal-deploy.mts`)
    else if (!iconType.includes('image/svg+xml')) failures.push(`portal ${portal} AI icon ${iconFile} served "${iconType}" (HTML fallback, blank icon); rerun nocobase-portal-deploy.mts with the NOCOBASE_PORTAL_BASE injection`)
  }
  // D7 anti-forgery: the C6/C7 byte assertions were self-consistent against
  // a polluted source (the brand favicon shipped as an upstream default
  // copy), so pin the known upstream favicon digests and refuse the local
  // source itself before any probe trusts it.
  const brandFaviconPath = join(repoRoot, 'examples/kb-agent/workspace/assets/brand/favicon.ico')
  if (!existsSync(brandFaviconPath)) throw new Error(`${brandFaviconPath} missing (derive it from dsh-favicon.svg; see the C4 batch log)`)
  const brandFaviconBytes = readFileSync(brandFaviconPath)
  const UPSTREAM_FAVICON_SHA256 = new Set([
    '189d0a2f805653c64225a889f5b79078a09afb15b570da88dfd0b7f93bb9cce1', // built dist default (5496 B)
    '3c1668c3b5c6593efcfb4454b45aa9be64a6a647906b29dd2842e8b62697e562', // client public default (15406 B)
  ])
  const brandFaviconSha = createHash('sha256').update(brandFaviconBytes).digest('hex')
  if (UPSTREAM_FAVICON_SHA256.has(brandFaviconSha)) {
    failures.push(`${brandFaviconPath} is an upstream default favicon (sha256 ${brandFaviconSha}); derive it from dsh-favicon.svg, then rerun nocobase-n25-brand.mts + nocobase-portal-deploy.mts`)
  }
  // C4: brand whitelabel inside the OSS license boundary — the site title
  // and logo row must be ours, the favicon must not be the HTML fallback.
  // The logo lives in public statics (attachment ACLs block the anonymous
  // login page), so the probe fetches the stored url unauthenticated. The
  // stored url is gateway-shaped (/nocobase/...): the user-real origin is
  // the same-origin proxy, whose prefix strip resolves the client-dist
  // root — so the probe hits the static at its upstream root here and the
  // proxied fetch is asserted in the C6 acceptance evidence.
  {
    const brandSettings = await dataOf(token, 'GET', '/api/systemSettings:get') as { title?: string, logo?: { url?: string } | null }
    if (brandSettings?.title !== BRAND_TITLE) failures.push(`systemSettings.title is ${JSON.stringify(brandSettings?.title)} (expected "${BRAND_TITLE}"; run nocobase-n25-brand.mts)`)
    const logoUrl = brandSettings?.logo?.url
    if (logoUrl !== '/nocobase/dsh-brand-logo.svg') failures.push(`systemSettings.logo.url is ${JSON.stringify(logoUrl)} (expected /nocobase/dsh-brand-logo.svg; run nocobase-n25-brand.mts)`)
    else {
      const logoProbe = await fetch(`${baseUrl}/dsh-brand-logo.svg`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
      const logoType = logoProbe?.headers.get('content-type') ?? ''
      if (logoProbe === null || !logoProbe.ok || !logoType.includes('image/svg+xml')) failures.push(`systemSettings.logo static /dsh-brand-logo.svg not fetchable as SVG (HTTP ${logoProbe?.status ?? 'network error'}, "${logoType}"); run nocobase-n25-brand.mts`)
    }
    const faviconProbe = await fetch(`${baseUrl}/favicon/favicon.ico`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
    const faviconType = faviconProbe?.headers.get('content-type') ?? ''
    if (faviconProbe === null || !faviconProbe.ok) failures.push(`/favicon/favicon.ico unreachable (HTTP ${faviconProbe?.status ?? 'network error'}); run nocobase-n25-brand.mts after build`)
    else if (faviconType.includes('text/html')) failures.push('/favicon/favicon.ico served the HTML fallback; run nocobase-n25-brand.mts after build')
    else if (!Buffer.from(await faviconProbe.arrayBuffer()).equals(brandFaviconBytes)) {
      failures.push('/favicon/favicon.ico is not the overlaid DSH brand favicon; run nocobase-n25-brand.mts after build')
    }
  }
  // C6: the portal surfaces carry the DSH brand — the entry title is ours,
  // and the favicon plus the light/dark logo-marks are the overlaid brand
  // bytes, not the upstream demo marks and not the HTML fallback.
  {
    const brandDir = join(repoRoot, 'examples/kb-agent/workspace/assets/brand')
    // The byte-compare sources must ship with the example: a missing local
    // asset fails the verify outright instead of downgrading to the MIME-only
    // probe (misconfiguration fails loud).
    const markPath = join(brandDir, 'dsh-logo-mark.png')
    if (!existsSync(markPath)) throw new Error(`${markPath} missing (derive it from dsh-brand-logo.svg; see the C6 batch log)`)
    const expectedBytes = {
      'favicon.ico': brandFaviconBytes,
      'logo-mark.png': readFileSync(markPath),
      'logo-mark-dark.png': readFileSync(markPath),
    } as const
    for (const portal of ['crm', 'hub']) {
      const entryProbe = await fetch(`${baseUrl}/dist/${portal}/`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(5000) }).catch(() => null)
      const entryHtml = await entryProbe?.text().catch(() => undefined)
      const title = entryHtml?.match(/<title>([^<]*)<\/title>/u)?.[1]
      if (title !== BRAND_TITLE) failures.push(`portal ${portal} entry title is ${JSON.stringify(title)} (expected "${BRAND_TITLE}"); rerun nocobase-portal-deploy.mts`)
      for (const [asset, mime] of [['favicon.ico', 'image/'], ['logo-mark.png', 'image/png'], ['logo-mark-dark.png', 'image/png']] as const) {
        const probe = await fetch(`${baseUrl}/dist/${portal}/${asset}`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
        const type = probe?.headers.get('content-type') ?? ''
        if (probe === null || !probe.ok || !type.includes(mime)) failures.push(`portal ${portal} ${asset} not served as ${mime} (HTTP ${probe?.status ?? 'network error'}, "${type}"); rerun nocobase-portal-deploy.mts`)
        else if (!Buffer.from(await probe.arrayBuffer()).equals(expectedBytes[asset])) {
          failures.push(`portal ${portal} ${asset} is not the overlaid DSH brand asset; rerun nocobase-portal-deploy.mts`)
        }
      }
    }
  }
  // D4: the admin entry pins no favicon link, so every browser falls back to
  // the origin root /favicon.ico — the overlay must answer 200 with the ico
  // bytes (the gateway's HTML 200 was the bug), byte-identical to the brand
  // source (D7: an upstream default also passed the old MIME-only probe).
  {
    const probe = await fetch(`${baseUrl}/favicon.ico`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
    const type = probe?.headers.get('content-type') ?? ''
    if (probe === null || !probe.ok || type.includes('text/html')) {
      failures.push(`root /favicon.ico is ${probe?.status ?? 'network error'} (${type}); rerun the n25 brand overlay`)
    } else if (!Buffer.from(await probe.arrayBuffer()).equals(brandFaviconBytes)) {
      failures.push('root /favicon.ico is not the overlaid DSH brand favicon; rerun the n25 brand overlay')
    }
  }
  // D7: the user-facing chain is the dsh web gateway (:3080 by default) —
  // when one is up, all three favicon paths it serves must carry the brand
  // bytes. `all` legitimately runs before the gateway restarts (the reset
  // flow), so a silent gateway skips this group with a note instead of
  // failing; the anti-forgery digest above and the direct :13000 byte
  // assertions still run unconditionally.
  {
    let gatewayBase: string | null = null
    for (const port of DSH_WEB_GATEWAY_PORTS) {
      const probe = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`, { signal: AbortSignal.timeout(1500) }).catch(() => null)
      const body = probe === null ? '' : await probe.text().catch(() => '')
      if (probe?.ok === true && body.includes('"short_name": "DSH"')) {
        gatewayBase = `http://127.0.0.1:${port}`
        break
      }
    }
    if (gatewayBase === null) {
      console.log('setup-nocobase verify: no live dsh web gateway; the :3080 favicon chain was not probed (start dsh web and rerun verify for the user-path assertion)')
    } else {
      for (const path of ['/nocobase/favicon.ico', '/nocobase/dist/crm/favicon.ico', '/nocobase/dist/hub/favicon.ico']) {
        const probe = await fetch(`${gatewayBase}${path}`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
        const sha = probe === null ? '' : createHash('sha256').update(Buffer.from(await probe.arrayBuffer())).digest('hex')
        if (probe === null || !probe.ok) failures.push(`gateway ${path} unreachable (HTTP ${probe?.status ?? 'network error'}); check the dsh web gateway nocobase proxy`)
        else if (sha !== brandFaviconSha) failures.push(`gateway ${path} is not the overlaid DSH brand favicon (sha256 ${sha}); rerun nocobase-n25-brand.mts + nocobase-portal-deploy.mts, then restart the gateway`)
      }
    }
  }
  // C3-A: the portal list pages pin default sorters, columns, and filters on
  // fields the seeded collections must actually carry — replay the exact
  // wire requests so a missing column fails the 400 here, not in the user's
  // browser (regression class introduced by the c8eaf64e76 portal rebuild).
  const portalListProbe = async (label: string, path: string): Promise<void> => {
    try {
      await call(token, 'GET', path)
    } catch (error) {
      failures.push(`portal list ${label} failed: ${error instanceof Error ? error.message : String(error)}; re-run the crm module step`)
    }
  }
  await portalListProbe('crm_contacts?sort=name&appends=customer', `/api/crm_contacts:list?sort=name&appends[]=${encodeURIComponent('customer')}`)
  await portalListProbe('crm_activities?sort=-date&appends=customer,contact', `/api/crm_activities:list?sort=-date&appends[]=${encodeURIComponent('customer,contact')}`)
  await portalListProbe('crm_leads?sort=-score&fields=score,source', `/api/crm_leads:list?sort=-score&fields[]=${encodeURIComponent('score')}&fields[]=${encodeURIComponent('source')}`)
  await portalListProbe('crm_quotes?sort=-issue_date&filter=is_current', `/api/crm_quotes:list?sort=-issue_date&fields[]=${encodeURIComponent('root_quote_id')}&fields[]=${encodeURIComponent('version')}&filter=${encodeURIComponent('{"is_current":true}')}`)
  try {
    await call(token, 'POST', '/api/crm_activities:query', { measures: [{ field: 'id', aggregation: 'count' }], dimensions: [{ field: 'type' }] })
  } catch (error) {
    failures.push(`crm_activities:query failed: ${error instanceof Error ? error.message : String(error)} (query authorization or measure compilation broke)`)
  }
  // C3-B: the four portal domains (inventory / sales / helpdesk / finance)
  // need their tables to exist with rows — the hub module's seeded floors.
  for (const [collection, floor] of [
    ['hub_inv_products', 5], ['hub_inv_stock_moves', 5], ['hub_sales_deals', 4], ['hub_sales_activities', 4],
    ['hub_hd_tickets', 4], ['hub_fin_invoices', 4], ['hub_fin_expenses', 4], ['hub_fin_invoice_items', 3],
  ] as const) {
    const failure = await rowFloor(collection, floor)
    if (failure !== null) failures.push(`${failure}; run the hub module step so the portal-domain tables seed`)
  }
  // Appends the domain list pages wire: a missing association compiles into
  // the same 400 class as a missing column, so probe one representative each.
  await portalListProbe('hub_inv_stock_moves?appends=product,warehouse', `/api/hub_inv_stock_moves:list?sort=-moved_at&appends[]=${encodeURIComponent('product,warehouse')}`)
  await portalListProbe('hub_sales_deals?appends=account,owner', `/api/hub_sales_deals:list?sort=createdAt&appends[]=${encodeURIComponent('account,owner')}`)
  await portalListProbe('hub_hd_tickets?appends=requester,assignee,replies', `/api/hub_hd_tickets:list?sort=-createdAt&appends[]=${encodeURIComponent('requester,assignee,replies')}`)
  await portalListProbe('hub_fin_expenses?appends=employee', `/api/hub_fin_expenses:list?sort=-spent_at&appends[]=${encodeURIComponent('employee')}`)
  // D1: hub schema alignment. The portal pages filter and sort on the
  // NocoBase-derived belongsTo contract columns (hub_pj_task_assignee_id and
  // siblings) and on date/count columns the seed never had — replay the exact
  // wire requests so a missing column fails the 400 here, not in the browser.
  await portalListProbe('hub_pj_tasks?filter=hub_pj_task_assignee_id&appends=project,assignee', `/api/hub_pj_tasks:list?filter=${encodeURIComponent('{"hub_pj_task_assignee_id":1}')}&appends[]=${encodeURIComponent('project')}&appends[]=${encodeURIComponent('assignee')}`)
  await portalListProbe('hub_pj_projects?filter=hub_pj_project_owner_id', `/api/hub_pj_projects:list?filter=${encodeURIComponent('{"hub_pj_project_owner_id":{"$gt":0}}')}`)
  await portalListProbe('hub_pj_milestones?sort=due_date', `/api/hub_pj_milestones:list?sort=due_date`)
  await portalListProbe('hub_pj_checklist?filter=hub_pj_checklist_task_id&appends=task', `/api/hub_pj_checklist:list?filter=${encodeURIComponent('{"hub_pj_checklist_task_id":{"$gt":0}}')}&appends[]=${encodeURIComponent('task')}`)
  await portalListProbe('hub_kb_articles?sort=-updatedAt&appends=category,author', `/api/hub_kb_articles:list?sort=-updatedAt&appends[]=${encodeURIComponent('category,author')}`)
  await portalListProbe('hub_kb_articles?sort=-views', `/api/hub_kb_articles:list?sort=-views`)
  await portalListProbe('hub_as_assignments?sort=-assigned_date&appends=asset,assignee', `/api/hub_as_assignments:list?sort=-assigned_date&appends[]=${encodeURIComponent('asset,assignee')}`)
  await portalListProbe('hub_sales_leads?sort=-converted_at', `/api/hub_sales_leads:list?sort=-converted_at`)
  await portalListProbe('hub_po_purchase_orders?appends=supplier,owner', `/api/hub_po_purchase_orders:list?sort=-order_date&appends[]=${encodeURIComponent('supplier,owner')}`)
  // D1: the CRM deals drawer filters follow-ups and activities by the
  // camelCase dealId column, and the targets page reads crm_targets whole.
  await portalListProbe('crm_follow_ups?filter=dealId', `/api/crm_follow_ups:list?filter=${encodeURIComponent('{"dealId":{"$gt":0}}')}&sort=due_date`)
  await portalListProbe('crm_activities?filter=dealId&appends=contact', `/api/crm_activities:list?filter=${encodeURIComponent('{"dealId":{"$gt":0}}')}&sort=-date&appends[]=${encodeURIComponent('contact')}`)
  await portalListProbe('crm_targets?sort=-period&appends=owner', `/api/crm_targets:list?sort=-period&appends[]=${encodeURIComponent('owner')}`)
  // D1: the six new hub tables and crm_targets seed with row floors.
  for (const [collection, floor] of [
    ['hub_kb_categories', 4], ['hub_pj_checklist', 6], ['hub_kb_article_feedback', 4],
    ['hub_po_suppliers', 3], ['hub_po_purchase_orders', 4], ['hub_po_items', 6], ['crm_targets', 3],
  ] as const) {
    const failure = await rowFloor(collection, floor)
    if (failure !== null) failures.push(`${failure}; run the hub/crm module step so the D1 tables seed`)
  }
  // D2: the nine AI employees must exist as users rows too — the projects
  // assignee/owner pickers list users, aiEmployees alone is invisible there.
  {
    const aiUsernames = ['atlas', 'dara', 'dex', 'ellis', 'lexi', 'lina', 'nathan', 'vera', 'viz']
    const rows = await dataOf(token, 'GET', `/api/users:list?filter=${encodeURIComponent(JSON.stringify({ username: { $in: aiUsernames } }))}&pageSize=50`) as Array<{ username?: string }> | null
    const present = new Set((rows ?? []).map(row => row.username))
    const missing = aiUsernames.filter(name => !present.has(name))
    if (missing.length > 0) failures.push(`AI employees missing from users: ${missing.join(', ')}; re-run nocobase-n17-alignment.mts`)
  }
  const plugins = await call(token, 'GET', '/api/pm:list?pageSize=300') as { data?: Array<{ name?: string, enabled?: boolean }> }
  const enabledPlugins = new Set((plugins?.data ?? []).filter(plugin => plugin.enabled === true).map(plugin => plugin.name))
  for (const name of PLUGINS) {
    if (!enabledPlugins.has(name)) failures.push(`plugin ${name} not enabled`)
  }
  // The knowledge graph is builtin data now: the graph page must have nodes
  // to draw after "all" (a zero-node graph means setup-dsh-data's kg step
  // was skipped or failed — the stepVerify floor catches the fake-empty
  // world before the user opens an empty canvas).
  const kgGraph = join(repoRoot, 'examples/kb-agent/workspace/kg-graph.sqlite')
  if (!existsSync(kgGraph)) {
    failures.push('workspace/kg-graph.sqlite missing (run the all chain so setup-dsh-data.mts builds the graph)')
  } else {
    let kgNodes: number | undefined
    try {
      const db = new DatabaseSync(kgGraph, { readOnly: true })
      try {
        const row = db.prepare('SELECT COUNT(*) AS c FROM kg_nodes').get() as { c?: number } | undefined
        kgNodes = row?.c
      } finally {
        db.close()
      }
    } catch (error: unknown) {
      failures.push(`kg-graph.sqlite is not readable: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (kgNodes !== undefined && kgNodes <= 0) {
      failures.push('kg_nodes table is empty (run the all chain so kg-build.mts populates the graph)')
    }
  }
  // The all chain verifies right after init wrote the credentials, so read
  // through the shared resolver (ambient first, repository root .env second)
  // instead of demanding the key in this process's ambient environment.
  const apiKey = resolveEnv('NOCOBASE_API_KEY')
  if (apiKey !== undefined) {
    const probe = await fetch(`${baseUrl}/api/experts:list?pageSize=1`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) })
    if (!probe.ok) failures.push(`NOCOBASE_API_KEY in env was refused (HTTP ${probe.status}); re-run init`)
  } else {
    failures.push('NOCOBASE_API_KEY not in the environment nor the repository root .env; run init to issue one')
  }
  if (failures.length > 0) {
    console.error(`setup-nocobase verify: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('setup-nocobase verify: OK — full UI + collections + attachment field + seed + workflow chain + AI workbench + row floors + m2o fieldNames + n18ai- form AI buttons + portals + portal list probes + ai-proxy + API key + kg graph + h4 SRM (pages/group/floors/food columns) + h5 WMS (pages/group/floors/bin-map JSBlock) + w1 approval (wfl collections/审批中心 page/flow config/gate/doc_status column) + w2 supplier single-source (admission flow/AVL gate/h4 workflow retired/seed untouched/采购联系人 retitle) + w3 procurement (pur collections/采购管理 7 pages/gates/flows/receipt columns/待检区) + b4 inventory (reservations/reorder collections/3 pages/planning columns/virtual zones/count-workflow request leg/bypass guards/ledger balance) + w5 mfg (mfg collections/生产制造 5 pages/MO flow/BOM gate/seed floors) + b6 mfg-exec (4 execution collections/5 pages/mfg_orders columns+terminals/WIP zone/movement legs/seed floors/MO-0003 draft) + b7 sales-mrp (so collections/销售管理 3 pages/SO flow/gates/MRP workflow/driver columns/SHIPMENT_SO leg/seed floors) + b8 quality (qm collections/质量管理 5 pages/AQL full-table 135-row seeds (W2-B1)/additive columns/RETURN_VENDOR+SCRAP legs/concession flow/disposal reconciliation) + b9 dashboards (kpi_snapshots/so_orders.shipped_at/经营分析 4 pages/9 kpi charts + supplier radar/90-day backfill floor) + w2-b2 MPS (mps collections/主生产计划 page/mps flow/back-link column/seeds/covered-exclusivity invariant) + w2-b3 biz-date (movements/counts biz_date 100% coverage/appendMovement convergence/monthly balances reconcile/月度收发存 page) + w2-b5 approval-config (pur_orders extras threshold/tolerance, array approver_map, config_note audit, demo trio records/todos, so_orders default fallback, quality_lead user) + w2-b7 ops closure (kpi_snapshots 25-code floor with ap_balance/应收应付对账 page four ledger blocks + ar/ap trend charts/persona sources + .dsh mirrors) + w3 usability (b1 row-detail drawers + member ACL floors/b2 subtables + guarded actions + approval jumps/b3 four read-only kanbans + 排产甘特 v1 gantt + dual-block calendars + drawer record-scoping/b4 审批流配置中心 (SVG 状态图 + wfl 四表 row Edit + admin+root-only menu + config_note required + consistency probe + 部门形态审批人校验)/b5 组织权限 (departments 树 + 挂接 + 组织架构页 + 权限矩阵页 admin-only + member 动作矩阵 + approver_map 部门路由 qm_nc_dispositions 见证 + 员工页 org_dept 列)/b6 操作者终端 (三页 iframe + serve 动词端点 fail-loud 冒烟 + 部门围栏 403)) all verified')
}

/** Upsert the two NocoBase lines in the repository root .env, preserving the rest. */
function writeEnv(url: string, token: string): void {
  const lines = existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []
  const setLine = (key: string, value: string): void => {
    const index = lines.findIndex(line => line.startsWith(`${key}=`) || line.startsWith(`# ${key}=`))
    if (index >= 0) lines[index] = `${key}=${value}`
    else lines.push(`${key}=${value}`)
  }
  setLine('NOCOBASE_BASE_URL', url)
  setLine('NOCOBASE_API_KEY', token)
  const text = lines.filter((line, index) => line.length > 0 || index === lines.length - 1).join('\n')
  writeFileSync(envFile, text.endsWith('\n') ? text : `${text}\n`)
}

/** Common local ports for a long-lived `dsh web` gateway (QUICKSTART.zh.md, reset section). */
const DSH_WEB_GATEWAY_PORTS = [3080, 3081, 3083, 3084, 3085, 3086]

/**
 * Warn — never fail — when a `dsh web` gateway stays up across a reset: the
 * long-lived process keeps open handles to the deleted sqlite files, so
 * post-reset writes through it land in the orphaned inodes and are lost. The
 * operator may keep the gateway on purpose, hence a probe warning instead of
 * an automatic kill/restart. The probe requests the gateway's static manifest
 * and matches its DSH identity, so an unrelated HTTP listener that merely
 * occupies a listed port stays silent.
 */
async function warnLiveDshWebGateways(): Promise<void> {
  const alive: number[] = []
  for (const port of DSH_WEB_GATEWAY_PORTS) {
    const probe = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`, { signal: AbortSignal.timeout(1500) }).catch(() => null)
    const body = probe === null ? '' : await probe.text().catch(() => '')
    if (body.includes('"short_name": "DSH"')) alive.push(port)
  }
  if (alive.length === 0) return
  console.warn([
    `setup-nocobase: WARNING — live dsh web gateway detected on ${alive.map((port) => `:${port}`).join(', ')}.`,
    'A long-lived gateway keeps open handles to the deleted sqlite files; writes through it after this reset are lost.',
    'Restart the dsh web gateway after reset — see the reset section in examples/kb-agent/QUICKSTART.zh.md.',
  ].join('\n'))
}

async function stepStop(): Promise<void> {
  // The dev-server runs under tsx watch; match its command line and TERM it.
  const listed = spawnSync('pkill', ['-f', 'dev.*--server.*nocobase|nocobase.*dev.*--server'], { encoding: 'utf8' })
  void listed
  spawnSync('pkill', ['-f', 'app-supervisor'])
  await new Promise(resolve => setTimeout(resolve, 1500))
  console.log(`setup-nocobase: stopped (port free: ${!(await serverUp())})`)
}

/**
 * Widen every hub_/crm_ integer id-reference column to bigint (D7): the
 * referenced primary keys are bigint, so an integer reference column
 * overflows long before the rows it points at do. Idempotent — the ALTER
 * list comes from information_schema, so already-widened columns produce
 * no statement and a settled world stays untouched.
 */
function stepNormalizeFkColumns(): void {
  const survey = "SELECT format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint', table_name, column_name) FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'integer' AND table_name ~ '^(hub_|crm_)' AND column_name ~ '(id|Id)$'"
  const listed = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-t', '-A', '-c', survey], { encoding: 'utf8' })
  if (listed.status !== 0) throw new Error(`FK bigint survey failed: ${listed.stderr}`)
  const statements = listed.stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  for (const statement of statements) {
    const altered = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-c', statement], { encoding: 'utf8' })
    if (altered.status !== 0) throw new Error(`FK bigint widen failed (${statement}): ${altered.stderr}`)
    console.log(`setup-nocobase: ${statement}`)
  }
  console.log(`setup-nocobase: FK bigint normalization ${statements.length > 0 ? `widened ${statements.length} column(s)` : 'already bigint (kept)'}`)
}

/**
 * The guarded document-number columns' database backstop (W-round R3): the
 * write tools' preflight (enforceCodeUniqueness in dsh-tool-nocobase) is a
 * list→write TOCTOU, so a partial unique index per guarded column is the
 * authoritative guard behind it. The partial predicate (non-empty values
 * only) matches the tool guard's semantics — rows without a number never
 * collide, so unnumbered drafts stay legal. Idempotent: a duplicate preflight
 * runs first so a dirty table fails loudly with a count instead of a
 * CREATE INDEX constraint error, and IF NOT EXISTS keeps re-runs settled.
 * Rollback: DROP INDEX IF EXISTS ux_<table>_<column> per pair (no data
 * changes; the tool-side guard keeps enforcing after the drop).
 */
function stepUniqueDocIndexes(): void {
  const pairs: Array<[table: string, column: string]> = [
    ['pur_orders', 'code'],
    ['pur_requests', 'code'],
    ['so_orders', 'code'],
    ['mfg_orders', 'code'],
    ['wms_receipts', 'receipt_no'],
    ['srm_suppliers', 'code'],
  ]
  for (const [table, column] of pairs) {
    const dup = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-t', '-A', '-c',
      `SELECT count(*) FROM (SELECT ${column} FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> '' GROUP BY ${column} HAVING count(*) > 1) d`], { encoding: 'utf8' })
    if (dup.status !== 0) throw new Error(`unique-index duplicate preflight failed (${table}.${column}): ${dup.stderr}`)
    if ((dup.stdout ?? '').trim() !== '0') {
      throw new Error(`${table}.${column} already holds duplicate numbers (${(dup.stdout ?? '').trim()} groups); resolve them before the unique index lands`)
    }
    const index = `ux_${table}_${column}`
    const created = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-c',
      `CREATE UNIQUE INDEX IF NOT EXISTS ${index} ON ${table} (${column}) WHERE ${column} IS NOT NULL AND ${column} <> ''`], { encoding: 'utf8' })
    if (created.status !== 0) throw new Error(`unique index ${index} failed: ${created.stderr}`)
    console.log(`setup-nocobase: unique doc-number index ${index} ensured`)
  }
}

async function stepReset(): Promise<void> {
  await warnLiveDshWebGateways()
  await stepStop()
  run('psql', ['-U', process.env.USER ?? 'mac', '-d', 'postgres', '-c', 'DROP DATABASE IF EXISTS nocobase'])
  console.log('setup-nocobase: database dropped; re-running install + init')
  await stepInstall()
  await stepStart()
  await stepInit()
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'all'
  switch (command) {
    case 'install': return void await stepInstall()
    case 'build': return void await stepBuild()
    case 'start': return void await stepStart()
    case 'init': return void await stepInit()
    case 'plugins': return void await stepPlugins()
    case 'ai': return void await ensureLlmService(await signIn())
    case 'ai-direct': return void await ensureLlmService(await signIn(), LLM_DIRECT_BASE)
    case 'ai-proxy': {
      const action = process.argv[3]
      if (action === 'start') return void await stepAiProxyStart()
      if (action === 'stop') return void await stepAiProxyStop()
      throw new Error('ai-proxy needs "start" or "stop"')
    }
    case 'verify': return void await stepVerify()
    case 'unique-indexes': return void stepUniqueDocIndexes()
    case 'stop': return void await stepStop()
    case 'reset': return void await stepReset()
    case 'all':
      await stepInstall()
      await stepBuild()
      await stepStart()
      await stepInit()
      await stepPlugins()
      await stepAiProxyStart()
      // Replay the demo-grade module builds (collections/seeds/menus/blocks,
      // all REST-idempotent) so "all" restores the full feature surface:
      // crm/hub modules, the AI workbench page + orphan-model cleanup (N13),
      // the 30/20/40/24 data widening (N13), and the page-tabs backfill as a
      // no-op safety net (N14). Portals stay behind their own deploy script
      // (verify probes them).
      for (const script of [
        'nocobase-crm-modules.mts', 'nocobase-hub-modules.mts',
        'nocobase-n13-rebuild.mts', 'nocobase-n13-seed.mts', 'nocobase-n14-fix.mts',
        'nocobase-n17-alignment.mts', 'nocobase-e1-pj-v2.mts', 'nocobase-f1-view-v2.mts', 'nocobase-f2-crm-v2.mts', 'nocobase-f3-hub-v2.mts', 'nocobase-h4-srm.mts', 'nocobase-h5-wms.mts', 'nocobase-w1-approval.mts', 'nocobase-w2-supplier.mts', 'nocobase-w3-procurement.mts', 'nocobase-w5-mfg.mts', 'nocobase-w6-mfg-exec.mts', 'nocobase-w7-mrp.mts', 'nocobase-w8-quality.mts', 'nocobase-w9-dashboards.mts', 'nocobase-n18-form-ai.mts', 'nocobase-n25-brand.mts',
        'nocobase-f4-charts.mts',
      ]) {
        if (!run('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts', script)])) {
          throw new Error(`${script} failed during the all chain`)
        }
      }
      // W2-B3: settle every movement's business date (the module scripts
      // above append new rows through the appendMovement helper; this pass
      // backfills any stragglers and asserts zero NULL), then materialize
      // the monthly-balance snapshots from the ledger's earliest month.
      if (!run('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts/nocobase-h5-wms.mts'), '--backfill-dates'])) {
        throw new Error('nocobase-h5-wms.mts --backfill-dates failed during the all chain')
      }
      if (!run('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts/nocobase-h5-wms.mts'), '--snapshot-month', 'all'])) {
        throw new Error('nocobase-h5-wms.mts --snapshot-month all failed during the all chain')
      }
      // B9: materialize the KPI snapshots (the nightly /calc-kpi cron body;
      // the 90-day backfill replays idempotently — a settled day upserts).
      if (!run('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts/kpi-run.mts'), '--backfill', '90'])) {
        throw new Error('kpi-run.mts --backfill 90 failed during the all chain')
      }
      // The module scripts above leave id-reference columns as NocoBase
      // integer fields; align them with the bigint primary keys they point
      // at (D7, idempotent).
      stepNormalizeFkColumns()
      // R3: the doc-number partial unique indexes behind the tool-side
      // anti-collision preflight (idempotent; verify asserts them).
      stepUniqueDocIndexes()
      // The DSH-side data plane (connector-files + lakehouse + market + the
      // knowledge graph + the KB corpus): one child replay, its own steps
      // probe watermarks so a settled world stays all-kept.
      if (!run('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts/setup-dsh-data.mts')])) {
        throw new Error('setup-dsh-data.mts failed during the all chain')
      }
      return void await stepVerify()
    default:
      throw new Error(`unknown command "${command}" (install | build | start | init | plugins | ai | ai-direct | "ai-proxy start|stop" | verify | stop | reset | all)`)
  }
}

await main()
