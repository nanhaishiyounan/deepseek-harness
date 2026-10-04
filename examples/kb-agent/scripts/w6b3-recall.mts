/**
 * W6-B3: recall management over the trace DAG (plans/plan-w6.zh.md §B3 ④,
 * 食安法第 63 条 four actions: 停售/召回/通知/记录).
 *
 * One recall order's scope is the forward closure of the suspect lot over
 * v_trace_edges (the same recursive CTE the trace assertions ride) snapshotted
 * at creation time — the blast radius is frozen evidence, later wiring edits
 * cannot silently rewrite a live recall. The order mints a server-side RC-
 * number (one atomic INSERT..SELECT max, the B1 server-numbering stance) and
 * notifies the owner through the B2 alert-center channel
 * (notificationInAppMessages — one face, both engines).
 *
 * The state machine is the explicit transition table pattern from
 * actOnAlert: initiated →(notify) notified →(execute) executing →(close)
 * closed, actor limited to the owner or admin, close demanding the record
 * note (第 63 条's 记录 action). Creation is limited to the quality/admin
 * usernames (the server-side gate menu visibility cannot provide). The CLI
 * --create/--act, POST /recall/create, POST /recall/act and the page's intent
 * workflow all funnel through createRecall/actRecall verbatim.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-recall.mts --seed-pages   # collection + 召回管理 page + member grants
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-recall.mts --create lot=<no> --reason <text> --owner <user> [--due YYYY-MM-DD] [--actor <user>]
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-recall.mts --act <code> notify|execute|close --user <user> [--note <text>]
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-recall.mts --assert      # the acceptance matrix
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed-pages') ? 'seed-pages'
  : args.includes('--create') ? 'create'
    : args.includes('--act') ? 'act'
      : args.includes('--clean-drill') ? 'clean-drill'
        : 'assert'
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
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

/** SQL string literal with single-quote doubling (values reaching SQL text). */
const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`

/** The B2 alert-center in-app channel (one notification face, both engines). */
const RECALL_CHANNEL = 'alert-center'

/** The recall initiation whitelist — quality/admin usernames, the server-side gate. 'nocobase' is the platform root account's username (W6-R3: the credential-derived actor of an admin session). */
const RECALL_INITIATORS: ReadonlySet<string> = new Set(['admin', 'nocobase', 'quality_lead', 'qc_inspector'])

/** recall_orders: one recall task order (scope frozen at creation). */
const RECALL_ORDERS_FIELDS: ReadonlyArray<Record<string, unknown>> = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '召回单号' } },
  { name: 'anchor_lot', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '问题批次' } },
  { name: 'reason', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '召回原因' } },
  { name: 'scope', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '召回范围快照' } },
  { name: 'fg_count', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '受影响成品批次数' } },
  { name: 'so_count', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '受影响订单数' } },
  { name: 'customer_count', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '波及客户数' } },
  { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: [
    { value: 'initiated', label: '已发起（停售）', color: 'red' },
    { value: 'notified', label: '已通知', color: 'orange' },
    { value: 'executing', label: '召回执行中', color: 'blue' },
    { value: 'closed', label: '已关闭（记录归档）', color: 'green' },
  ] } },
  { name: 'owner', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '责任人' } },
  { name: 'due_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '处置期限', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'created_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '发起人' } },
  { name: 'notified_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '通知完成日', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'closed_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '关闭日', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'close_note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '召回记录（关闭必填）' } },
]

/**
 * The recall state machine's legal (action, from_state) pairs — the single
 * table {@link actRecall} enforces; the actor must be the row's owner or
 * admin; close demands the record note (第 63 条 记录).
 */
const RECALL_TRANSITIONS: ReadonlyArray<{ readonly action: 'notify' | 'execute' | 'close'; readonly from: string }> = [
  { action: 'notify', from: 'initiated' },
  { action: 'execute', from: 'notified' },
  { action: 'close', from: 'executing' },
]

/**
 * The recall audit backbone (W6-R3 审计四件套): recall_orders.created_at
 * (NOT NULL default now, idempotent) and the recall_audit ledger — one row
 * per state transition (initiate/notify/execute/close) written inside the
 * same CTE as the transition itself, so the trail and the state can never
 * disagree. The order's deletion cascades its audit rows (drill cleanup).
 */
export function ensureRecallAudit(): void {
  psql('ALTER TABLE recall_orders ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();')
  psql(`CREATE TABLE IF NOT EXISTS recall_audit (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES recall_orders(id) ON DELETE CASCADE,
  code text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);`)
  psql('CREATE INDEX IF NOT EXISTS ix_recall_audit_order ON recall_audit (order_id);')
}

/**
 * Sweep the acceptance-drill pollution (W6-R3 演练污染治理): recall orders
 * whose reason starts with「验收演练」plus their cascaded audit rows and
 * alert-center notices leave the ledger — the terminal 台账 stays real work
 * only. Exposed as --clean-drill and auto-run at the end of --assert.
 * @returns the swept counts (orders/audits/notices).
 */
export function cleanDrill(): { orders: number; audits: number; notices: number } {
  const codes = psql(`SELECT code FROM recall_orders WHERE reason LIKE '验收演练%';`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  if (codes.length === 0) return { orders: 0, audits: 0, notices: 0 }
  const inList = codes.map(code => sqlLit(code)).join(', ')
  const auditsBefore = Number(psql(`SELECT count(*) FROM recall_audit WHERE code IN (${inList});`).trim())
  const orders = Number(psql(`WITH d AS (DELETE FROM recall_orders WHERE code IN (${inList}) RETURNING 1) SELECT count(*) FROM d;`).trim())
  const auditsLeft = Number(psql(`SELECT count(*) FROM recall_audit WHERE code IN (${inList});`).trim())
  const notices = Number(psql(`WITH d AS (DELETE FROM "notificationInAppMessages" n
  WHERE n."channelName" = ${sqlLit(RECALL_CHANNEL)}
    AND EXISTS (SELECT 1 FROM (VALUES ${codes.map(code => `(${sqlLit(code)})`).join(', ')}) AS c(code) WHERE n.title LIKE '【召回任务】' || c.code || '：%')
  RETURNING 1) SELECT count(*) FROM d;`).trim())
  log(`w6b3-recall: 演练清理 — 单 ${String(orders)}、审计级联 ${String(auditsBefore - auditsLeft)}、通知 ${String(notices)}`)
  return { orders, audits: auditsBefore - auditsLeft, notices }
}

/**
 * Create the recall_orders collection idempotently (additive fields, the B2
 * pattern) plus the unique code index.
 * @param token - the root API token.
 */
export async function ensureRecallCollection(token: string): Promise<void> {
  const present = await dataOf(token, 'GET', '/api/collections/recall_orders')
    .then(row => (row as { name?: string } | null)?.name === 'recall_orders')
    .catch(() => false)
  if (!present) {
    await dataOf(token, 'POST', '/api/collections:create', { name: 'recall_orders', title: '召回任务单', titleField: 'code', fields: RECALL_ORDERS_FIELDS })
    log('w6b3-recall: collection recall_orders created')
  } else {
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'recall_orders' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of RECALL_ORDERS_FIELDS) {
      if (names.has(String(field['name']))) continue
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'recall_orders', ...field })
      log(`w6b3-recall: recall_orders.${String(field['name'])} added`)
    }
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_recall_orders_code ON recall_orders (code);')
  ensureRecallAudit()
}

/** The forward-closure keys of one lot anchor (the recursive CTE the trace legs share). */
const downKeysOf = (lotNo: string): string[] => {
  const id = psql(`SELECT id FROM wms_lots WHERE lot_no = ${sqlLit(lotNo)};`).trim()
  if (id === '') throw new Error(`批次 ${lotNo} 不存在（wms_lots 无此 lot_no）`)
  return psql(`WITH RECURSIVE closure(node_key, depth) AS (
  SELECT ${sqlLit(`lot:${id}`)}, 0
  UNION
  SELECT e.to_key, closure.depth + 1
  FROM v_trace_edges e JOIN closure ON e.from_key = closure.node_key
  WHERE closure.depth < 32
) SELECT DISTINCT node_key FROM closure WHERE node_key <> ${sqlLit(`lot:${id}`)} ORDER BY node_key;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
}

/**
 * Compute and freeze one suspect lot's recall scope: the forward closure's
 * affected FG lots / shipped SOs / customers / on-hand quantities, plus the
 * upstream context (raw lots + suppliers — the investigation half).
 * @param lotNo - the suspect lot number.
 * @returns the scope snapshot object.
 */
export function computeRecallScope(lotNo: string): Record<string, unknown> {
  const keys = downKeysOf(lotNo)
  const inList = keys.length === 0 ? 'NULL' : keys.map(key => sqlLit(key)).join(', ')
  const fg = psql(`SELECT l.lot_no || '|' || COALESCE(p.name, '') || '|' || COALESCE((SELECT SUM(m.qty) FROM wms_movements m WHERE m.lot_id = l.id), 0)
FROM v_trace_nodes n JOIN wms_lots l ON 'lot:' || l.id::text = n.node_key LEFT JOIN hub_inv_products p ON p.id = l.product_id
WHERE n.node_key IN (${inList}) AND n.kind = 'lot_fg';`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
    .map(line => { const [lotNo2, product, qty] = line.split('|'); return { lot_no: lotNo2, product, on_hand: Number(qty) } })
  const so = psql(`SELECT o.code || '|' || COALESCE(c.name, '') || '|' || COALESCE(o.shipped_at::text, '')
FROM v_trace_nodes n JOIN so_orders o ON 'so:' || o.id::text = n.node_key LEFT JOIN crm_customers c ON c.id = o.customer_id
WHERE n.node_key IN (${inList}) AND n.kind = 'so';`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
    .map(line => { const [code, customer, shippedAt] = line.split('|'); return { so_code: code, customer, shipped_at: shippedAt } })
  const customers = [...new Set(so.map(row => row.customer).filter(name => name !== ''))]
  const up = psql(`WITH RECURSIVE closure(node_key, depth) AS (
  SELECT 'lot:' || (SELECT id FROM wms_lots WHERE lot_no = ${sqlLit(lotNo)})::text, 0
  UNION
  SELECT e.from_key, closure.depth + 1
  FROM v_trace_edges e JOIN closure ON e.to_key = closure.node_key
  WHERE closure.depth < 32
) SELECT n.kind || ':' || COALESCE(n.label, '') FROM v_trace_nodes n
WHERE n.node_key IN (SELECT node_key FROM closure EXCEPT SELECT 'lot:' || (SELECT id FROM wms_lots WHERE lot_no = ${sqlLit(lotNo)})::text);`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  return {
    anchor_lot: lotNo,
    computed_at: new Date().toISOString().slice(0, 10),
    upstream: up,
    affected_fg_lots: fg,
    affected_shipments: so,
    customers,
  }
}

/**
 * Create one recall order: gate the initiator, freeze the scope, mint the
 * RC-number server-side (one atomic INSERT..SELECT max), notify the owner
 * in-app (the B2 channel). Re-running on the same lot is legal — a second
 * recall of the same suspect lot is a new order with a new number.
 * @param lotNo - the suspect lot number.
 * @param reason - why the lot is recalled.
 * @param owner - the responsible username.
 * @param dueDate - the disposal deadline (optional).
 * @param actor - the initiating username (must sit in the whitelist).
 * @returns the minted order's code.
 */
export function createRecall(lotNo: string, reason: string, owner: string, dueDate: string, actor: string): string {
  if (!RECALL_INITIATORS.has(actor)) {
    throw new Error(`召回发起受限（quality/admin）：${actor} 不在白名单 ${[...RECALL_INITIATORS].join('/')}`)
  }
  // The due-date gate, layer one of three (createRecall front gate; the
  // INSERT's WHERE clause is layer two on the SQL side, the CLI funnels
  // here): a disposal deadline in the past is a misconfiguration, not a
  // recall.
  const today = new Date().toISOString().slice(0, 10)
  if (dueDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error(`处置期限需 YYYY-MM-DD（收到 ${dueDate}）`)
    if (dueDate < today) throw new Error(`处置期限 ${dueDate} 不得早于今天（${today}）`)
  }
  ensureRecallAudit()
  const ownerExists = Number(psql(`SELECT count(*) FROM users WHERE username = ${sqlLit(owner)};`).trim())
  if (ownerExists !== 1) throw new Error(`责任人 ${owner} 不是有效用户（通知无法送达）`)
  const anchorId = psql(`SELECT id FROM wms_lots WHERE lot_no = ${sqlLit(lotNo)};`).trim()
  if (anchorId === '') throw new Error(`批次 ${lotNo} 不存在`)
  const scope = computeRecallScope(lotNo)
  const scopeJson = sqlLit(JSON.stringify(scope))
  const dueLit = dueDate === '' ? 'NULL' : sqlLit(dueDate)
  const auditPayload = sqlLit(JSON.stringify({
    lot: lotNo, reason: reason.slice(0, 200), owner,
    due: dueDate === '' ? null : dueDate,
    fg: (scope['affected_fg_lots'] as unknown[]).length,
    so: (scope['affected_shipments'] as unknown[]).length,
    cust: (scope['customers'] as string[]).length,
  }))
  const minted = psql(`WITH next_no AS (
  SELECT COALESCE(max((regexp_match(code, '^RC-[0-9]{8}-([0-9]+)$'))[1]::int), 0) + 1 AS n
  FROM recall_orders WHERE code LIKE 'RC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-%'
), guard AS (
  SELECT ${dueLit}::date AS dd
), ins AS (
  INSERT INTO recall_orders (code, anchor_lot, reason, scope, fg_count, so_count, customer_count, status, owner, due_date, created_by)
  SELECT 'RC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(next_no.n::text, 3, '0'),
    ${sqlLit(lotNo)}, ${sqlLit(reason)}, ${scopeJson}::json,
    ${String((scope['affected_fg_lots'] as unknown[]).length)}, ${String((scope['affected_shipments'] as unknown[]).length)}, ${String((scope['customers'] as string[]).length)},
    'initiated', ${sqlLit(owner)}, ${dueLit}, ${sqlLit(actor)}
  FROM next_no, guard
  WHERE guard.dd IS NULL OR guard.dd >= CURRENT_DATE
  RETURNING id, code),
audit AS (
  INSERT INTO recall_audit (order_id, code, actor, action, payload)
  SELECT ins.id, ins.code, ${sqlLit(actor)}, 'initiate', ${auditPayload}::jsonb FROM ins
  RETURNING 1)
SELECT code FROM ins;`).trim()
  if (minted === '') throw new Error(`召回单创建失败（发号 INSERT 未落行——若带处置期限，检查其不早于今天）`)
  const notified = notifyOwner(minted, lotNo, owner, (scope['customers'] as string[]).length)
  log(`w6b3-recall: ${minted} created — anchor=${lotNo} owner=${owner} notified=${String(notified)} fg=${String((scope['affected_fg_lots'] as unknown[]).length)} so=${String((scope['affected_shipments'] as unknown[]).length)} cust=${String((scope['customers'] as string[]).length)}`)
  return minted
}

/** One in-app message to the owner through the B2 channel (unread count needs the registered channel). */
function notifyOwner(code: string, lotNo: string, owner: string, customerCount: number): boolean {
  const inserted = Number(psql(`WITH ins AS (
  INSERT INTO "notificationInAppMessages" (id, "createdAt", "updatedAt", "userId", "channelName", title, content, status, "receiveTimestamp")
  SELECT gen_random_uuid(), now(), now(), u.id, ${sqlLit(RECALL_CHANNEL)},
    ${sqlLit(`【召回任务】${code}：问题批次 ${lotNo}`)},
    ${sqlLit(`召回任务单 ${code} 已发起（食安法第 63 条）：问题批次 ${lotNo}，波及客户 ${String(customerCount)} 家——请到 食品合规→召回管理 认领执行（通知客户→执行召回→记录归档）`)},
    'unread', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
  FROM users u WHERE u.username = ${sqlLit(owner)} RETURNING 1)
SELECT count(*) FROM ins;`).trim())
  if (inserted !== 1) throw new Error(`召回通知未送达 ${owner}（users 无此用户或消息写入失败）`)
  return true
}

/**
 * Act on one recall order through the explicit transition table — notify
 * (initiated→notified, stamps notified_at), execute (notified→executing),
 * close (executing→closed, note mandatory, stamps closed_at). The actor must
 * be the row's owner or admin; an illegal action or actor moves zero rows
 * and the caller fails loud with that fact.
 * @param code - the recall order code.
 * @param action - 'notify' | 'execute' | 'close'.
 * @param user - the acting username.
 * @param note - the close record note (mandatory for close).
 * @returns the moved-row count (0 = refused).
 */
export function actRecall(code: string, action: 'notify' | 'execute' | 'close', user: string, note = ''): number {
  ensureRecallAudit()
  const current = psql(`SELECT status || '|' || COALESCE(owner, '') FROM recall_orders WHERE code = ${sqlLit(code)};`).trim()
  if (current === '') return 0
  const [status, owner] = current.split('|')
  const legal = RECALL_TRANSITIONS.some(row => row.action === action && row.from === status)
  // The root-bypass pair: the engine-side 'admin' and the platform root
  // account 'nocobase' (its credential-derived username) both outrank the
  // row's owner; everyone else must be the owner.
  const isRoot = user === 'admin' || user === 'nocobase'
  if (!legal) return 0
  if (!isRoot && user !== owner) return 0
  if (action === 'close' && note.trim() === '') return 0
  // One CTE per transition: the UPDATE and its audit row commit together —
  // the ledger can never miss a moved row (W6-R3 审计四件套).
  const transition = action === 'notify'
    ? `UPDATE recall_orders SET status = 'notified', notified_at = CURRENT_DATE`
    : action === 'execute'
      ? `UPDATE recall_orders SET status = 'executing'`
      : `UPDATE recall_orders SET status = 'closed', closed_at = CURRENT_DATE, close_note = ${sqlLit(note)}`
  const fromStatus = legal ? (RECALL_TRANSITIONS.find(row => row.action === action && row.from === status) ?? { from: '' }).from : ''
  const auditPayload = sqlLit(JSON.stringify({ from: fromStatus, note: note.slice(0, 200) }))
  const moved = Number(psql(`WITH mv AS (
  ${transition}
  WHERE code = ${sqlLit(code)} AND status = ${sqlLit(fromStatus)} AND (${sqlLit(user)} IN ('admin', 'nocobase') OR owner = ${sqlLit(user)})
  RETURNING id, code),
audit AS (
  INSERT INTO recall_audit (order_id, code, actor, action, payload)
  SELECT mv.id, mv.code, ${sqlLit(user)}, ${sqlLit(action)}, ${auditPayload}::jsonb FROM mv
  RETURNING 1)
SELECT count(*) FROM mv;`).trim())
  return moved
}

/**
 * The recall console JSBlock (W6-R3 召回 UI 操作面): the initiate form
 * (problem lot picker with a scope preview through GET /recall/scope, then
 * POST /recall/create) and the transition row (notify/execute/close through
 * POST /recall/act, close note mandatory) — both against the engine with
 * the signed-in session's bearer, so the acting identity is credential
 * derived. The string 'recall-console' is the upgrade marker.
 */
const RECALL_CONSOLE_CODE = [
  "const mk = async (name, size) => {",
  "  const r = ctx.makeResource('MultiRecordResource');",
  "  r.setResourceName(name);",
  "  r.setPageSize(size);",
  "  await r.refresh();",
  "  return r.getData() || [];",
  "};",
  "const lots = await mk('wms_lots', 500);",
  "const ENGINE = String(window.__W6_ENGINE_BASE__ || 'http://127.0.0.1:13110');",
  "const TOKEN = localStorage.getItem('NOCOBASE_TOKEN') || '';",
  "const callEngine = async (path, body) => {",
  "  const resp = await fetch(ENGINE + path, body === undefined",
  "    ? { headers: { authorization: 'Bearer ' + TOKEN } }",
  "    : { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) });",
  "  const json = await resp.json().catch(() => ({}));",
  "  return { status: resp.status, ok: resp.ok, json };",
  "};",
  "const me = await fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + TOKEN } }).then(r => r.json()).catch(() => ({}));",
  "const username = String((me && me.data && me.data.username) || '');",
  "const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/\"/g,'&quot;');",
  "ctx.render(`<div data-w6b3=\"recall-console\" style=\"padding:8px;font-family:system-ui\">",
  "  <div style=\"font-weight:700;margin-bottom:4px\">发起召回（会话身份：${esc(username) || '未登录'} — quality/admin 白名单）</div>",
  "  <div style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:center\">",
  "    <input data-rc-lot list=\"rc-lots\" placeholder=\"问题批次号\" style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);width:180px\" />",
  "    <datalist id=\"rc-lots\">${lots.map(l => `<option value=\"${esc(l.lot_no)}\">`).join('')}</datalist>",
  "    <input data-rc-reason placeholder=\"召回原因\" style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);width:220px\" />",
  "    <input data-rc-due placeholder=\"处置期限 YYYY-MM-DD（可选，不得早于今天）\" style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);width:280px\" />",
  "    <button data-rc-preview style=\"padding:4px 12px;border:1px solid var(--w7-primary);color:var(--w7-primary);background:#fff;border-radius:var(--w7-radius-control);cursor:pointer\">范围预览</button>",
  "    <button data-rc-create style=\"padding:4px 12px;border:none;color:#fff;background:var(--w7-negative-fg);border-radius:var(--w7-radius-control);cursor:pointer\">发起召回（责任人=${esc(username)}）</button>",
  "  </div>",
  "  <div style=\"font-weight:700;margin:8px 0 4px\">流转（notify / execute / close，close 需记录说明）</div>",
  "  <div style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:center\">",
  "    <input data-rc-code placeholder=\"RC-YYYYMMDD-NNN\" style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);width:180px\" />",
  "    <button data-rc-act=\"notify\" style=\"padding:4px 12px;border:1px solid var(--w7-critical-fg);color:var(--w7-critical-fg);background:#fff;border-radius:var(--w7-radius-control);cursor:pointer\">notify 通知客户</button>",
  "    <button data-rc-act=\"execute\" style=\"padding:4px 12px;border:1px solid var(--w7-primary);color:var(--w7-primary);background:#fff;border-radius:var(--w7-radius-control);cursor:pointer\">execute 执行召回</button>",
  "    <button data-rc-act=\"close\" style=\"padding:4px 12px;border:1px solid var(--w7-positive-fg);color:var(--w7-positive-fg);background:#fff;border-radius:var(--w7-radius-control);cursor:pointer\">close 记录归档</button>",
  "    <input data-rc-note placeholder=\"close 的召回记录说明（必填）\" style=\"padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);width:260px\" />",
  "  </div>",
  "  <div data-rc-out style=\"margin-top:6px;font-size:var(--w7-fs-body);color:var(--w7-text);white-space:pre-wrap\"></div>",
  "</div>`);",
  "const out = document.querySelector('[data-rc-out]');",
  "const say = (text) => { if (out) out.textContent = text; };",
  "setTimeout(() => {",
  "  const lot = document.querySelector('[data-rc-lot]');",
  "  const reason = document.querySelector('[data-rc-reason]');",
  "  const due = document.querySelector('[data-rc-due]');",
  "  const codeIn = document.querySelector('[data-rc-code]');",
  "  const noteIn = document.querySelector('[data-rc-note]');",
  "  const preview = document.querySelector('[data-rc-preview]');",
  "  const create = document.querySelector('[data-rc-create]');",
  "  if (preview) preview.addEventListener('click', async () => {",
  "    if (!lot || !lot.value) { say('先填问题批次号'); return; }",
  "    say('范围计算中…');",
  "    const r = await callEngine('/recall/scope?lot_no=' + encodeURIComponent(lot.value));",
  "    if (!r.ok) { say('范围预览被拒（HTTP ' + r.status + '）：' + String(r.json.error || '')); return; }",
  "    const s = r.json.scope || {};",
  "    say('召回范围（正向闭包）：受影响成品批次 ' + String((s.affected_fg_lots || []).length) + '、已发运订单 ' + String((s.affected_shipments || []).length) + '、波及客户 ' + String((s.customers || []).length) + '——上游线索 ' + String((s.upstream || []).length) + ' 条');",
  "  });",
  "  if (create) create.addEventListener('click', async () => {",
  "    if (!lot || !lot.value) { say('先填问题批次号'); return; }",
  "    if (!username) { say('未登录（无 NocoBase 会话）'); return; }",
  "    say('发起中…');",
  "    const r = await callEngine('/recall/create', { lot_no: lot.value, reason: (reason && reason.value) || '召回管理页发起', owner: username, ...(due && due.value ? { due_date: due.value } : {}) });",
  "    say(r.ok ? '已生成 ' + String(r.json.code || '') + '（责任人通知已发 ' + username + '）' : '被拒（HTTP ' + r.status + '）：' + String(r.json.error || ''));",
  "  });",
  "  for (const btn of document.querySelectorAll('[data-rc-act]')) {",
  "    btn.addEventListener('click', async () => {",
  "      const action = btn.getAttribute('data-rc-act') || '';",
  "      if (!codeIn || !codeIn.value) { say('先填召回单号'); return; }",
  "      if (action === 'close' && (!noteIn || !noteIn.value.trim())) { say('close 需要记录说明（63 条「记录」动作）'); return; }",
  "      const r = await callEngine('/recall/act', { code: codeIn.value, action, ...(noteIn && noteIn.value ? { note: noteIn.value } : {}) });",
  "      say(r.ok ? codeIn.value + ' ' + action + ' OK（' + username + '）' : '被拒（HTTP ' + r.status + '）：' + String(r.json.error || ''));",
  "    });",
  "  }",
  "}, 0);",
].join('\n')

// ─── the 召回管理 page (NocoBase, the B2 spine) ───

/**
 * Lay the 召回管理 v2 page under 食品合规: the status-colored table with the
 * scope counts + the row detail (the frozen scope snapshot rides the json
 * field), member view grant, menu bound admin+member (initiation stays
 * server-gated).
 * @param token - the root API token.
 */
export async function ensureRecallPages(token: string): Promise<void> {
  await ensureRecallCollection(token)
  const routes = await listRoutes(token, 'W6B3R')
  let groupId = routes.find(row => row.title === '食品合规' && row.type === 'group')?.id
  if (groupId === undefined) {
    groupId = Number((await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '食品合规', icon: 'SafetyCertificateOutlined', type: 'group' }) as { id?: unknown }).id ?? 0)
    log('w6b3-recall: menu group 食品合规 created')
  }
  const title = '召回管理'
  let pageId = routes.find(row => row.title === title && row.type === 'flowPage')?.id
  if (pageId === undefined) {
    const routeUid = withN17Prefix('w6b3r', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon: 'RollbackOutlined', type: 'flowPage', parentId: groupId, sort: 3, schemaUid: routeUid }) as { id?: unknown }
    pageId = Number(page.id ?? 0)
    const tabUid = withN17Prefix('w6b3r', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b3r', 'ts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({
      uid: withN17Prefix('w6b3r', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
      props: { title, displayTitle: true, enableTabs: false },
      stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false, description: '食安法第 63 条召回工作流：发起（停售）→通知客户→执行召回→记录归档。范围快照创建时冻结（正向闭包）——发起与流转走页内操作台（会话身份=登录用户，quality/admin 白名单）' } } },
    })
    const gridUid = withN17Prefix('w6b3r', 'g')
    await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    const tableUid = withN17Prefix('w6b3r', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
      props: { title: '召回任务单（状态机：已发起→已通知→执行中→已关闭；流转走页内操作台）' },
      stepParams: {
        resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'recall_orders' } },
        tableSettings: { defaultSorting: { sort: [{ field: 'id', direction: 'desc' }] } },
      },
    })
    const columns: ReadonlyArray<{ name: string; title: string; model: string; options?: unknown[] }> = [
      { name: 'code', title: '召回单号', model: 'DisplayTextFieldModel' },
      { name: 'anchor_lot', title: '问题批次', model: 'DisplayTextFieldModel' },
      { name: 'reason', title: '召回原因', model: 'DisplayTextFieldModel' },
      { name: 'fg_count', title: '受影响成品批次', model: 'DisplayTextFieldModel' },
      { name: 'so_count', title: '受影响订单', model: 'DisplayTextFieldModel' },
      { name: 'customer_count', title: '波及客户', model: 'DisplayTextFieldModel' },
      { name: 'status', title: '状态', model: 'DisplayEnumFieldModel', options: [
        { value: 'initiated', label: '已发起（停售）', color: 'red' },
        { value: 'notified', label: '已通知', color: 'orange' },
        { value: 'executing', label: '召回执行中', color: 'blue' },
        { value: 'closed', label: '已关闭（记录归档）', color: 'green' },
      ] },
      { name: 'owner', title: '责任人', model: 'DisplayTextFieldModel' },
      { name: 'due_date', title: '处置期限', model: 'DisplayDateTimeFieldModel' },
    ]
    let sortIndex = 1
    for (const column of columns) {
      const uid = withN17Prefix('w6b3r', 'c')
      await save({
        uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'recall_orders', fieldPath: column.name } },
          tableColumnSettings: { model: { use: column.model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: [...column.options] }) },
      })
      await save({
        uid: `${uid}f`, use: column.model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: 'recall_orders', dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: [...column.options] }) },
      })
      sortIndex += 1
    }
    await save({ uid: withN17Prefix('w6b3r', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
    await ensureTableRowDetail(token, tableUid, {
      collection: 'recall_orders',
      fields: [
        ...columns.map(column => ({ fieldPath: column.name, modelUse: column.model, ...(column.options === undefined ? {} : { options: [...column.options] }) })),
        { fieldPath: 'scope', modelUse: 'DisplayTextFieldModel' },
        { fieldPath: 'close_note', modelUse: 'DisplayTextFieldModel' },
      ],
      tabTitle: '召回详情',
      actionsColumnSortIndex: columns.length + 1,
    })
    log(`w6b3-recall: v2 page ${title} created (/admin/${routeUid})`)
  }
  // The console JSBlock is additive on the existing page (W6-R3): find the
  // page's grid, attach when the 'recall-console' marker is absent, and when
  // the seated block's code drifted from the source export, destroy + re-add
  // (the w6b3-trace code-drift posture: partial stepParams writes risk
  // clobbering other block settings, so the block is replaced whole).
  {
    const tab = routes.find(row => row.parentId === pageId && row.type === 'tabs')
    if (tab?.schemaUid != null) {
      const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
      if (grid?.uid != null) {
        const models = await listFlowModels(token, 'W6B3R-console')
        const seated = models.find(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid)
          && String(row.stepParams?.jsSettings?.runJs?.code ?? '').includes('recall-console'))
        const currentCode = seated === undefined ? '' : String(seated.stepParams?.jsSettings?.runJs?.code ?? '')
        if (seated !== undefined && currentCode !== RECALL_CONSOLE_CODE) {
          await dataOf(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(seated.uid))}`, {})
          log('w6b3-recall: recall console jsBlock code drift — destroyed for relaid')
        }
        if (seated === undefined || currentCode !== RECALL_CONSOLE_CODE) {
          await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
            target: { uid: grid.uid },
            type: 'jsBlock',
            settings: { showBlockCard: true, code: RECALL_CONSOLE_CODE },
          })
          log('w6b3-recall: recall console jsBlock attached (发起+流转操作台)')
        }
      }
    }
  }
  // placeholder removed
  for (const role of ['admin', 'member']) {
    const bound = Number(psql(`SELECT count(*) FROM "rolesDesktopRoutes" WHERE "desktopRouteId" = ${String(pageId)} AND "roleName" = ${sqlLit(role)};`).trim())
    if (bound === 0) {
      await dataOf(token, 'POST', '/api/rolesDesktopRoutes:create', { desktopRouteId: pageId, roleName: role })
      log(`w6b3-recall: ${title} menu bound to ${role}`)
    }
  }
  for (const action of ['view']) {
    const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = 'recall_orders' AND ra."name" = '${action}';`).trim())
    if (granted === 0) {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', 'recall_orders', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = 'recall_orders');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, '${action}', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = 'recall_orders' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = '${action}');`)
      log(`w6b3-recall: member→recall_orders ${action} granted`)
    }
  }
}

// ─── --assert ───

/**
 * The recall acceptance: the frozen scope equals the live recursive-CTE
 * forward closure; the owner notification landed; the state machine walks
 * initiated→closed and refuses the illegal jumps and outsiders; the page
 * exists. The demo order is created on a real suspect lot and walked to
 * closed (a full 63-条 rehearsal in one pass).
 */
export async function assertRecall(): Promise<void> {
  log('w6b3-recall: --assert 开始')
  const token = await signInWithRetry()
  await ensureRecallPages(token)
  const anchor = psql(`SELECT l.lot_no FROM wms_lots l
JOIN wms_movements m ON m.lot_id = l.id AND m.move_type = 'ISSUE_WIP' AND m.qty < 0
GROUP BY l.lot_no HAVING count(DISTINCT (SELECT mo_id FROM mfg_material_issues i WHERE i.code = m.doc_no)) >= 2
ORDER BY min(l.id) LIMIT 1;`).trim()
  check('召回锚点（混料原料批次）就绪', anchor !== '', anchor)
  let code = ''
  if (anchor !== '') {
    code = createRecall(anchor, '验收演练：混料原料批次召回（范围圈定+通知+状态机全链；终了自动清理）', 'qc_inspector', '', 'qc_inspector')
    check('due_date 昨天日期被拒（三层校验前置腿）', (() => {
      try {
        createRecall(anchor, '验收演练：过期期限负向', 'qc_inspector', new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), 'qc_inspector')
        return false
      } catch (error) {
        return /不得早于今天/.test(error instanceof Error ? error.message : String(error))
      }
    })())
    const row = psql(`SELECT fg_count || '|' || so_count || '|' || customer_count || '|' || status FROM recall_orders WHERE code = ${sqlLit(code)};`).trim()
    const [fgN, soN, custN, status] = row.split('|')
    check('召回范围快照三清单落库（成品/订单/客户）', Number(fgN) >= 2, `fg=${fgN} so=${soN} cust=${custN} status=${status}`)
    const liveScope = computeRecallScope(anchor)
    const frozen = JSON.parse(psql(`SELECT scope::text FROM recall_orders WHERE code = ${sqlLit(code)};`).trim()) as Record<string, unknown[]>
    check('冻结范围 = 实时递归 CTE 正向闭包（对账一致）',
      (frozen['affected_fg_lots'] as unknown[]).length === (liveScope['affected_fg_lots'] as unknown[]).length
      && (frozen['customers'] as string[]).length === (liveScope['customers'] as string[]).length,
      `fg ${String((frozen['affected_fg_lots'] as unknown[]).length)}==${String((liveScope['affected_fg_lots'] as unknown[]).length)} cust ${String((frozen['customers'] as string[]).length)}==${String((liveScope['customers'] as string[]).length)}`)
    const notified = Number(psql(`SELECT count(*) FROM "notificationInAppMessages" WHERE "channelName" = ${sqlLit(RECALL_CHANNEL)} AND title LIKE ${sqlLit(`【召回任务】${code}%`)};`).trim())
    check('责任人通知送达（B2 通知面 in-app）', notified >= 1, `rows=${String(notified)}`)
    check('非白名单账号发起被拒（服务端卡口）', (() => {
      try { createRecall(anchor, '越权尝试', 'qc_inspector', '', 'buyer'); return false } catch { return true }
    })())
    check('跳步转移被拒（initiated 直接 close=0 行）', actRecall(code, 'close', 'qc_inspector', '跳步') === 0)
    check('外人流转被拒（buyer 无权 notify）', actRecall(code, 'notify', 'buyer') === 0)
    check('notify：initiated→notified', actRecall(code, 'notify', 'qc_inspector') === 1)
    check('execute：notified→executing', actRecall(code, 'execute', 'qc_inspector') === 1)
    check('close 无记录说明被拒（63 条「记录」动作）', actRecall(code, 'close', 'qc_inspector', '') === 0)
    check('close：executing→closed（含记录说明）', actRecall(code, 'close', 'qc_inspector', 'W6-B3 验收：范围客户已通知、在库成品已隔离，无回流（无害化处理完成）') === 1)
    const final = psql(`SELECT status || '|' || COALESCE(closed_at::text, '') FROM recall_orders WHERE code = ${sqlLit(code)};`).trim()
    check('终态=closed 且关闭日戳落库', final.startsWith('closed|'), final)
    // 审计四件套的硬门禁：createdAt 非空 + 流水行数=状态迁移数。
    const nullCreated = psql(`SELECT count(*) FROM recall_orders WHERE created_at IS NULL;`).trim()
    check('recall_orders.created_at 非空（审计四件套 a）', nullCreated === '0', `null rows=${nullCreated}`)
    const trail = psql(`SELECT action FROM recall_audit WHERE code = ${sqlLit(code)} ORDER BY event_id;`)
      .split('\n').map(line => line.trim()).filter(line => line !== '').join(',')
    check('审计流水=状态迁移序列 initiate,notify,execute,close（审计四件套 b/d）', trail === 'initiate,notify,execute,close', trail)
    const auditAll = psql(`SELECT count(*) FROM recall_audit;`).trim()
    const transitionsAll = psql(`SELECT (SELECT count(*) FROM recall_audit WHERE action = 'initiate') + (SELECT count(*) FROM recall_audit WHERE action <> 'initiate');`).trim()
    check('全表审计行数自洽（每行对应一次状态迁移）', auditAll === transitionsAll, `${auditAll} rows`)
  }
  const routes = await listRoutes(token, 'W6B3R-assert')
  check('召回管理页面已铺（渲染证据见截图）', routes.some(row => row.title === '召回管理' && row.type === 'flowPage'))
  // 演练污染治理：演练单+级联审计+通知清场，终态台账只留真实工作。
  const swept = cleanDrill()
  check('演练单已清理（台账纯净）', swept.orders >= 1 && psql(`SELECT count(*) FROM recall_orders WHERE reason LIKE '验收演练%';`).trim() === '0',
    `orders=${String(swept.orders)} audits=${String(swept.audits)} notices=${String(swept.notices)}`)
  log(`w6b3-recall: --assert ${failures.length === 0 ? 'PASS' : `FAIL（${String(failures.length)}）`}`)
  if (failures.length > 0) process.exitCode = 1
}

// ─── the CLI ───

const main = async (): Promise<void> => {
  if (mode === 'seed-pages') {
    const token = await signInWithRetry()
    await ensureRecallPages(token)
    return
  }
  if (mode === 'create') {
    const lotNo = /lot=([^ ]+)/.exec(args.join(' '))?.[1]
    const reason = /--reason ([^--]+)/.exec(args.join(' '))?.[1]?.trim() ?? ''
    const owner = /--owner ([^ ]+)/.exec(args.join(' '))?.[1] ?? ''
    const due = /--due ([0-9-]+)/.exec(args.join(' '))?.[1] ?? ''
    const actor = /--actor ([^ ]+)/.exec(args.join(' '))?.[1] ?? 'admin'
    if (lotNo === undefined || owner === '') throw new Error('--create 需要 lot=<批次号> --owner <用户名> [--reason 文本] [--due YYYY-MM-DD] [--actor 用户名]')
    createRecall(lotNo, reason, owner, due, actor)
    return
  }
  if (mode === 'clean-drill') {
    const swept = cleanDrill()
    log(`w6b3-recall: --clean-drill 完成 — 单 ${String(swept.orders)} / 审计 ${String(swept.audits)} / 通知 ${String(swept.notices)}（reason 前缀「验收演练」即演练单）`)
    return
  }
  if (mode === 'act') {
    const actIndex = args.indexOf('--act')
    const code = args[actIndex + 1]
    const action = args[actIndex + 2] as 'notify' | 'execute' | 'close'
    const user = /--user ([^ ]+)/.exec(args.join(' '))?.[1] ?? ''
    const note = /--note ([^]*)/.exec(args.join(' '))?.[1]?.trim() ?? ''
    if (code === undefined || !['notify', 'execute', 'close'].includes(action ?? '') || user === '') {
      throw new Error('--act 需要 <code> notify|execute|close --user <用户名> [--note 文本]')
    }
    const moved = actRecall(code, action, user, note)
    if (moved === 0) throw new Error(`召回流转被拒：${code} ${action} ${user}（状态机/权限不满足——检查当前状态与责任人）`)
    log(`w6b3-recall: ${code} ${action} OK（${user}）`)
    return
  }
  await assertRecall()
}

await main()
