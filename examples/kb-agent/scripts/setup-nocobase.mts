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
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEnv } from './resolve-env.ts'
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
  const missingV2 = ['客户', '销售线索', '联系人', '订单', '报价单', '工单', '资产台账', '员工'].filter(title => !v2Titles.has(title))
  if (missingV2.length > 0) failures.push(`v2 table flowPages missing: ${missingV2.join(', ')} (run nocobase-n17-alignment.mts)`)
  const flowModels = await call(token, 'GET', '/api/flowModels:list?pageSize=1000') as { data?: Array<{ use?: string, uid?: string }> }
  const modelCount = (use: string) => (flowModels?.data ?? []).filter(row => row.use === use).length
  if (modelCount('AddNewActionModel') < 8) failures.push('AddNewActionModel count < 8 (v2 table action bars incomplete)')
  if (modelCount('FormSubmitActionModel') < 8) failures.push('FormSubmitActionModel count < 8 (Add-new popups cannot submit)')
  // N18: every Add-new popup carries the in-form AI fill button (the official
  // AIEmployeeButtonModel on CreateFormModel.actions). Counting only the
  // deterministic `n18ai-` uid prefix keeps foreign AIEmployeeButtonModel rows
  // from padding the count, and requiring every such row to carry the prefix
  // surfaces unexpected mounts instead of letting them hide among ours.
  const aiButtons = (flowModels?.data ?? []).filter(row => row.use === 'AIEmployeeButtonModel')
  const n18Buttons = aiButtons.filter(row => row.uid?.startsWith('n18ai-'))
  if (n18Buttons.length < 8) failures.push(`n18ai- AIEmployeeButtonModel count ${n18Buttons.length} < 8 (form AI fill buttons missing; run nocobase-n18-form-ai.mts)`)
  if (n18Buttons.length !== aiButtons.length) failures.push(`${aiButtons.length - n18Buttons.length} AIEmployeeButtonModel row(s) carry no n18ai- uid prefix (unexpected foreign mounts; inspect flowModels)`)
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
  console.log('setup-nocobase verify: OK — full UI + collections + attachment field + seed + workflow chain + AI workbench + row floors + m2o fieldNames + n18ai- form AI buttons + portals + ai-proxy + API key + kg graph all verified')
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

async function stepStop(): Promise<void> {
  // The dev-server runs under tsx watch; match its command line and TERM it.
  const listed = spawnSync('pkill', ['-f', 'dev.*--server.*nocobase|nocobase.*dev.*--server'], { encoding: 'utf8' })
  void listed
  spawnSync('pkill', ['-f', 'app-supervisor'])
  await new Promise(resolve => setTimeout(resolve, 1500))
  console.log(`setup-nocobase: stopped (port free: ${!(await serverUp())})`)
}

async function stepReset(): Promise<void> {
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
        'nocobase-n17-alignment.mts', 'nocobase-n18-form-ai.mts',
      ]) {
        if (!run('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts', script)])) {
          throw new Error(`${script} failed during the all chain`)
        }
      }
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
