/**
 * W8-B3: the mobile work projection's server-side base.
 *
 * 1. `wfl_mobile_work` — one row per work item per account (the wfl_ prefix
 *    keeps it on the engine-table read face: signed-in reads pass the
 *    collection gate and the gateway pushes the acting username down as a
 *    row filter). The client-minted `client_id` plus `user` carry the
 *    idempotent upsert key (unique index below).
 * 2. `wfl_alerts.created_at` — the column the mobile alerts page's timestamp
 *    projection reads (B2's handover: the column never existed on the live
 *    table, so the opportunistic read always answered undefined). The column
 *    lands with `DEFAULT now()` so the scanner's untouched INSERT statement
 *    starts stamping rows immediately; existing rows backfill to the ALTER
 *    moment.
 *
 * Idempotent: an existing collection keeps its rows, missing declared fields
 * join through `fields:create`, and both indexes ride `IF NOT EXISTS`.
 * `--assert` re-verifies everything (schema, index, backfill) plus one
 * create→list→destroy round-trip under a probe account.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w8b3-mobile-work.mts
 *   node --import tsx/esm examples/kb-agent/scripts/w8b3-mobile-work.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const args = process.argv.slice(2)
const assert = args.includes('--assert')
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))

const psql = (sql: string): string => {
  const env = readFileSync(here('../../../platform/nocobase/.env'), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

/** The projection columns (names explicit — collections:create mints random f_* columns otherwise). */
const WORK_FIELDS: ReadonlyArray<Record<string, unknown>> = [
  { name: 'user', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '归属账号' } },
  { name: 'client_id', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '客户端工作项ID' } },
  { name: 'title', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '标题' } },
  { name: 'owner_display', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '负责人（显示名）' } },
  { name: 'due', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '截止日期' } },
  { name: 'suggestion', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: 'AI 建议' } },
  { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: [
    { value: 'todo', label: '待处理', color: 'blue' },
    { value: 'doing', label: '进行中', color: 'orange' },
    { value: 'review', label: '待复核', color: 'gold' },
    { value: 'done', label: '已完成', color: 'green' },
  ] } },
  { name: 'source_session_id', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '来源会话' } },
  { name: 'source_anchor', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '来源消息锚' } },
  { name: 'exec_session_id', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '执行会话' } },
  { name: 'result_summary', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '执行结果摘要' } },
  { name: 'result_finished_at', type: 'bigInt', interface: 'integer', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '完成时间（epoch ms）' } },
  { name: 'artifact', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '报告工件' } },
  { name: 'pinned', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '已收藏' } },
  { name: 'demo', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '演示数据' } },
  { name: 'created_at', type: 'bigInt', interface: 'integer', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '创建时间（epoch ms）' } },
  { name: 'updated_at', type: 'bigInt', interface: 'integer', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '更新时间（epoch ms）' } },
]

/**
 * Create the collection idempotently (existing rows kept; missing declared
 * fields join through fields:create) and stamp the unique upsert index.
 * @param token - the root API token.
 */
export async function ensureMobileWorkCollection(token: string): Promise<void> {
  const present = await dataOf(token, 'GET', '/api/collections/wfl_mobile_work')
    .then(row => (row as { name?: string } | null)?.name === 'wfl_mobile_work')
    .catch(() => false)
  if (!present) {
    await dataOf(token, 'POST', '/api/collections:create', {
      name: 'wfl_mobile_work', title: '移动工作项投影', titleField: 'title', fields: WORK_FIELDS,
    })
    log('w8b3-mobile-work: collection wfl_mobile_work created')
  } else {
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wfl_mobile_work' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of WORK_FIELDS) {
      if (names.has(String(field['name']))) continue
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wfl_mobile_work', ...field })
      log(`w8b3-mobile-work: wfl_mobile_work.${String(field['name'])} added`)
    }
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_wfl_mobile_work_user_client ON wfl_mobile_work ("user", client_id);')
}

/**
 * Land the alerts timestamp column: the REST channel registers the field
 * metadata, the DDL carries the default the scanner's untouched INSERT
 * relies on, and existing rows backfill to this moment.
 * @param token - the root API token.
 */
export async function ensureAlertsCreatedAt(token: string): Promise<void> {
  psql('ALTER TABLE wfl_alerts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();')
  const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wfl_alerts' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
  if (!names.has('created_at')) {
    await dataOf(token, 'POST', '/api/fields:create', {
      collectionName: 'wfl_alerts',
      name: 'created_at', type: 'date', interface: 'datetime',
      uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '产生时间', 'x-component-props': { dateFormat: 'YYYY-MM-DD HH:mm' } },
    })
    log('w8b3-mobile-work: wfl_alerts.created_at registered')
  }
}

/** Verify every landed fact plus one probe row's create→list→destroy cycle. */
async function assertLegs(token: string): Promise<void> {
  log('— wfl_mobile_work schema/索引')
  const columns = new Set(psql("SELECT column_name FROM information_schema.columns WHERE table_name='wfl_mobile_work';").trim().split('\n').filter(line => line !== ''))
  const expected = ['id', ...WORK_FIELDS.map(field => String(field['name']))]
  const missing = expected.filter(column => !columns.has(column))
  check('wfl_mobile_work 列齐全', missing.length === 0, missing.length === 0 ? `columns=${String(columns.size)}` : `缺失：${missing.join('、')}`)
  const index = psql("SELECT count(*) FROM pg_indexes WHERE indexname = 'ux_wfl_mobile_work_user_client';").trim()
  check('(user, client_id) 唯一索引在库', index === '1')

  log('— wfl_alerts.created_at 真实投影列（B2 移交）')
  const alertsColumn = psql("SELECT count(*) FROM information_schema.columns WHERE table_name='wfl_alerts' AND column_name='created_at';").trim()
  check('wfl_alerts.created_at 列存在', alertsColumn === '1')
  const nullStamps = psql('SELECT count(*) FROM wfl_alerts WHERE created_at IS NULL;').trim()
  check('created_at 全表非空（DEFAULT 回填）', nullStamps === '0', `null=${nullStamps}`)
  const wireStamp = await dataOf(token, 'GET', '/api/wfl_alerts:list?pageSize=1&sort=-id')
    .then(rows => (Array.isArray(rows) && rows.length > 0 ? String((rows[0] as { created_at?: unknown })['created_at'] ?? '') : ''))
    .catch(() => '')
  check('REST 投影返回 created_at（ISO 字符串）', wireStamp !== '', wireStamp.slice(0, 19))

  log('— 投影行 round-trip（探针账号）')
  const clientId = `w_w8b3probe${Date.now().toString(36)}`
  await dataOf(token, 'POST', '/api/wfl_mobile_work:create', {
    user: 'w8b3-probe', client_id: clientId, title: 'W8-B3 探针行', status: 'todo',
    pinned: false, demo: true, created_at: Date.now(), updated_at: Date.now(),
  })
  const listed = await dataOf(token, 'GET', `/api/wfl_mobile_work:list?pageSize=10&filter=${encodeURIComponent(JSON.stringify({ client_id: { $eq: clientId } }))}`)
    .then(rows => Array.isArray(rows) ? rows.length : 0)
    .catch(() => -1)
  check('探针行经 REST 可读', listed === 1, `rows=${String(listed)}`)
  const idRow = psql(`SELECT id FROM wfl_mobile_work WHERE client_id='${clientId}';`).trim()
  if (idRow !== '') {
    await dataOf(token, 'POST', `/api/wfl_mobile_work:destroy?filterByTk=${idRow}`).catch(() => undefined)
  }
  const after = psql(`SELECT count(*) FROM wfl_mobile_work WHERE client_id='${clientId}';`).trim()
  check('探针行已清理', after === '0')
}

async function main(): Promise<void> {
  log(`w8b3-mobile-work: ${assert ? 'assert' : 'run'}（移动工作项投影基座）`)
  const token = await signInWithRetry()
  await ensureMobileWorkCollection(token)
  await ensureAlertsCreatedAt(token)
  await assertLegs(token)
  if (failures.length > 0) {
    throw new Error(`w8b3-mobile-work 失败 ${String(failures.length)} 项：\n  - ${failures.join('\n  - ')}`)
  }
  console.log('w8b3-mobile-work: 全部断言通过')
}

await main()
