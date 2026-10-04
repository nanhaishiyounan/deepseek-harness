/**
 * W6-B6: the CRM activation batch — the deal pipeline (drag Kanban over
 * crm_deals.stage with probability write-back + crm_stage_audit), the
 * customer-360 aggregate (engine /crm — the insp workbench posture, embedded
 * in NocoBase as the v2 page 商机管道), and the quote→SO conversion leg
 * (crm_quotes.converted_so_code CAS + server-minted SO code).
 *
 * 1. Additive fields: crm_deals.probability (integer percent, backfilled
 *    from the stage vocabulary) and crm_quotes.converted_so_code (the
 *    idempotency marker; partial unique index as the DB backstop).
 * 2. crm_stage_audit: one row per drag move (from/to/probability/amount/
 *    actor/moved_at) — also the dwell-days anchor the cards render.
 * 3. One v2 page 商机管道 under 销售管理 (IframeBlockModel onto the engine's
 *    /crm — runjs strips <iframe> tags so mode:url is the supported path).
 * 4. Rehearsal rows (W6B6-prefixed — identifiable, cleanable): a customer
 *    whose name carries an XSS probe (render-inertness is the browser leg's
 *    assertion), a deal for the pipe-move leg, and a quote for the
 *    conversion leg (submit → so_orders approval flow, never approved in
 *    rehearsal so no reservation side effects).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b6-crm.mts --seed     # fields + audit table + page + rehearsal rows
 *   node --import tsx/esm examples/kb-agent/scripts/w6b6-crm.mts --assert   # the acceptance matrix (live engine)
 *   node --import tsx/esm examples/kb-agent/scripts/w6b6-crm.mts --cleanup  # drop the rehearsal rows and aftermath
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import { crmPipe, PIPE_STAGES } from '../crm/src/server.ts'
import { scanAlerts } from './w6b2-rules.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed' : args.includes('--cleanup') ? 'cleanup' : 'assert'
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}

const psql = (sql: string): string => {
  const env = readFileSync(hereRef('../../../platform/nocobase/.env'), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

function hereRef(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`
const ENGINE_BASE = process.env.W3_TERMINAL_BASE ?? 'http://127.0.0.1:13110'

/** The rehearsal markers (every seeded row is findable and cleanable by them). */
export const W6B6_DEAL = 'W6B6演练·管道迁移'
export const W6B6_QUOTE = 'QT-W6B6-01'
const W6B6_CUSTOMER = 'W6B6<img src=x onerror="window.__w6b6xss=1">客户'

// ─── the additive fields + the audit table ───

/** crm_deals.probability + crm_quotes.converted_so_code (REST additive fields). */
const CRM_FIELDS: ReadonlyArray<{ collection: string, field: { name: string, type: string, interface: string, uiSchema: Record<string, unknown> } }> = [
  {
    collection: 'crm_deals',
    field: { name: 'probability', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '赢单概率 %（随阶段回写）' } },
  },
  {
    collection: 'crm_quotes',
    field: { name: 'converted_so_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '已转销售订单（转单幂等标记）' } },
  },
]

/**
 * Add the two additive fields (kept when present), backfill probability from
 * the stage vocabulary once, then create crm_stage_audit and the
 * one-convert-per-quote partial unique index straight in SQL (the REST
 * channel cannot declare either).
 * @param token - the root API token.
 */
export async function ensureCrmCollections(token: string): Promise<void> {
  for (const { collection, field } of CRM_FIELDS) {
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(row => row.name))
    if (!names.has(field.name)) {
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: collection, ...field })
      log(`w6b6-crm: ${collection}.${field.name} added`)
    }
  }
  const backfill = psql(`UPDATE crm_deals SET probability = CASE COALESCE(stage,'')
    WHEN 'inquiry' THEN 10 WHEN 'quote' THEN 40 WHEN 'negotiation' THEN 70
    WHEN 'won' THEN 100 WHEN 'lost' THEN 0 END
  WHERE probability IS NULL AND COALESCE(stage,'') IN ('inquiry','quote','negotiation','won','lost');`)
  if (backfill !== 'UPDATE 0') log(`w6b6-crm: crm_deals.probability backfilled (${backfill.replace(/^UPDATE /u, '')} rows)`)
  psql(`CREATE TABLE IF NOT EXISTS crm_stage_audit (
  id BIGSERIAL PRIMARY KEY,
  deal_id BIGINT NOT NULL,
  deal_name TEXT NOT NULL DEFAULT '',
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  probability INTEGER NOT NULL DEFAULT 0,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  actor TEXT NOT NULL,
  moved_at DATE NOT NULL DEFAULT CURRENT_DATE);`)
  psql('CREATE INDEX IF NOT EXISTS ix_crm_stage_audit_deal ON crm_stage_audit (deal_id, moved_at);')
  psql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_quotes_converted ON crm_quotes (converted_so_code) WHERE COALESCE(converted_so_code,'') <> '';`)
  log('w6b6-crm: crm_stage_audit + indexes ensured')
}

// ─── the page ───

/**
 * Lay the v2 page 商机管道 idempotently under the 销售管理 group: flowPage +
 * tabs + grid + one IframeBlockModel onto the engine's /crm (the B5
 * workbench-embed posture).
 * @param token - the root API token.
 */
export async function ensureCrmPages(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B6CRM')
  const groupId = routes.find(row => row.title === '销售管理' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 销售管理 missing (run the CRM modules seed first)')
  if (routes.some(row => row.title === '商机管道' && row.type === 'flowPage')) {
    log('w6b6-crm: v2 page 商机管道 exists (kept)')
    return
  }
  const routeUid = withN17Prefix('w6b6c', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '商机管道', icon: 'PartitionOutlined', type: 'flowPage', parentId: groupId, sort: 1, schemaUid: routeUid }) as { id?: unknown }
  const tabUid = withN17Prefix('w6b6c', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b6c', 'ts') })
  const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  await save({ uid: withN17Prefix('w6b6c', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: '商机管道', displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: '商机管道', displayTitle: true, enableTabs: false, description: 'CRM 激活：商机管道 Kanban（拖拽换阶段+概率回写+列头金额/加权汇总）→ 客户 360（信息/订单/报价/应收/交往时间线）→ 报价一键转销售订单（服务端发号+审批流+幂等防重）' } } } })
  const gridUid = withN17Prefix('w6b6c', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid }, type: 'iframe',
    settings: { mode: 'url', url: `${ENGINE_BASE}/crm`, height: 1080 },
  })
  const blockUid = block?.uid ?? block?.tree?.uid
  if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for the CRM embed: ${JSON.stringify(block).slice(0, 200)}`)
  log(`w6b6-crm: v2 page 商机管道 created (iframe ${blockUid} → ${ENGINE_BASE}/crm)`)
}

// ─── the rehearsal rows ───

/**
 * Seed the rehearsal rows: the XSS-probe customer (render-inertness is the
 * browser leg's assertion), the pipe-move deal (inquiry), and the
 * conversion-eligible quote (sent). All W6B6-prefixed.
 */
function seedRehearsalRows(): void {
  psql(`INSERT INTO crm_customers (name, type, level, status)
VALUES (${sqlLit(W6B6_CUSTOMER)}, 'enterprise', 'B', 'prospect');`)
  const customerId = psql(`SELECT id FROM crm_customers WHERE name = ${sqlLit(W6B6_CUSTOMER)} LIMIT 1;`).trim()
  psql(`INSERT INTO crm_deals (name, stage, status, amount, owner, customer_id, expected_close_date, probability)
VALUES (${sqlLit(W6B6_DEAL)}, 'inquiry', 'pending', 88000, '赵晓芳', ${customerId}, CURRENT_DATE + 45, 10);`)
  const dealId = psql(`SELECT id FROM crm_deals WHERE name = ${sqlLit(W6B6_DEAL)} LIMIT 1;`).trim()
  psql(`INSERT INTO crm_quotes (quote_number, quote_no, valid_until, total_amount, total, status, customer_id, deal_id, issue_date, is_current, revision_note)
VALUES (${sqlLit(W6B6_QUOTE)}, ${sqlLit(W6B6_QUOTE)}, CURRENT_DATE + 30, 88000, 88000, 'sent', ${customerId}, ${dealId}, CURRENT_DATE, TRUE, 'W6-B6 演练（报价转单腿）——可清理');`)
  log('w6b6-crm: rehearsal rows ensured (customer XSS 探针 / deal 管道迁移 / quote 转单)')
}

/**
 * Remove the rehearsal rows and every row their legs produced: the
 * conversion's so_orders (+ lines + approval aftermath — the rehearsal never
 * approves, so no reservation side effects exist), the audit rows, and the
 * seeded customer/deal/quote.
 */
function cleanupRehearsalRows(): void {
  const soIds = psql(`SELECT string_agg(id::text, ',') FROM so_orders WHERE note LIKE '%W6B6%' OR note LIKE ${sqlLit(`%${W6B6_QUOTE}%`)};`).trim()
  if (soIds !== '') {
    psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'so_orders' AND doc_id IN (${soIds});`)
    psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'so_orders' AND doc_id IN (${soIds});`)
    psql(`DELETE FROM so_order_lines WHERE order_id IN (${soIds});`)
    psql(`DELETE FROM so_orders WHERE id IN (${soIds});`)
  }
  psql(`DELETE FROM crm_quotes WHERE quote_number LIKE 'QT-W6B6-%';`)
  psql(`DELETE FROM crm_stage_audit WHERE deal_name LIKE 'W6B6%';`)
  psql(`DELETE FROM crm_deals WHERE name LIKE 'W6B6%';`)
  psql(`DELETE FROM crm_customers WHERE name LIKE 'W6B6%';`)
  log('w6b6-crm: rehearsal rows + SO/lines/审批 aftermath removed')
}

// ─── the live-engine helpers (the assert leg) ───

/** One engine call with the root token (admin passes the sales fence). */
async function engine<T>(token: string, path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await fetch(`${ENGINE_BASE}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${String(response.status)}` })) as { ok?: boolean; error?: string } & T
  if (!response.ok || payload.ok === false) throw new Error(payload.error ?? `HTTP ${String(response.status)} ${path}`)
  return payload
}

// ─── --assert: the acceptance matrix ───

function assertBase(): void {
  log('— 字段与审计表')
  const prob = psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'crm_deals' AND column_name = 'probability';").trim()
  check('crm_deals.probability 列在位（拖拽概率回写）', prob === '1', `cols=${prob}`)
  const converted = psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'crm_quotes' AND column_name = 'converted_so_code';").trim()
  check('crm_quotes.converted_so_code 列在位（转单幂等标记）', converted === '1', `cols=${converted}`)
  const audit = psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'crm_stage_audit' AND column_name IN ('deal_id','from_stage','to_stage','probability','amount','actor','moved_at');").trim()
  check('crm_stage_audit 审计列齐全（7 列）', audit === '7', `cols=${audit}`)
  const uniq = psql("SELECT count(*) FROM pg_indexes WHERE indexname = 'ux_crm_quotes_converted';").trim()
  check('一报价一转单 部分唯一索引', uniq === '1', `idx=${uniq}`)
  const unbackfilled = psql("SELECT count(*) FROM crm_deals WHERE probability IS NULL AND COALESCE(stage,'') IN ('inquiry','quote','negotiation','won','lost');").trim()
  check('存量商机概率已按阶段回填', unbackfilled === '0', `nulls=${unbackfilled}`)
}

async function assertPages(token: string): Promise<void> {
  log('— 铺页')
  const routes = await listRoutes(token, 'W6B6CRM-assert')
  check('v2 页「商机管道」在销售管理组下', routes.some(row => row.title === '商机管道' && row.type === 'flowPage'))
  const models = await listFlowModels(token, 'W6B6CRM-iframe')
  const embed = models.find(row => row.use === 'IframeBlockModel' && String(row.props?.url ?? '').endsWith('/crm'))
  check('商机管道 iframe 块指向引擎 /crm', embed !== undefined, embed === undefined ? 'no IframeBlockModel→/crm' : String(embed.props?.url))
}

async function assertPipe(token: string): Promise<void> {
  log('— 管道看板对拍（engine pipe.json × psql 按阶段聚合）')
  const pipe = await engine<ReturnType<typeof crmPipe>>(token, '/crm/pipe.json', 'GET')
  for (const stage of PIPE_STAGES) {
    const direct = psql(`SELECT count(*) || '|' || COALESCE(round(SUM(amount)::numeric, 2), 0) FROM crm_deals WHERE COALESCE(stage,'') = '${stage.key}';`).trim()
    const [countRaw, sumRaw] = direct.split('|')
    const column = pipe.columns.find(row => row.key === stage.key)
    const ok = column !== undefined && column.count === Number(countRaw) && String(column.amount_sum) === String(Number(sumRaw ?? 0))
    check(`列「${stage.label}」计数+Σ金额 = psql 对账`, ok, `board=${column === undefined ? '?' : `${String(column.count)}/${String(column.amount_sum)}`} psql=${countRaw}/${sumRaw}`)
  }
  const weightedDirect = Number(psql(`SELECT COALESCE(round(SUM(amount * probability / 100.0)::numeric, 2), 0) FROM crm_deals WHERE COALESCE(stage,'') IN ('inquiry','quote','negotiation');`).trim() || '0')
  check('加权管道总额 = psql Σ(金额×概率) 对账', Math.abs(pipe.weighted_total - weightedDirect) < 0.01, `board=${String(pipe.weighted_total)} psql=${String(weightedDirect)}`)
  const moveDealId = Number(psql(`SELECT id FROM crm_deals WHERE name = ${sqlLit(W6B6_DEAL)} LIMIT 1;`).trim() || '0')
  check('演练商机在册（管道迁移腿）', moveDealId > 0, `id=${String(moveDealId)}`)
  if (moveDealId > 0) {
    const before = psql(`SELECT COALESCE(stage,'') || '|' || COALESCE(probability::text,'') FROM crm_deals WHERE id = ${String(moveDealId)};`).trim()
    const target = before.startsWith('inquiry') ? 'quote' : before.startsWith('quote') ? 'negotiation' : before.startsWith('negotiation') ? 'won' : 'inquiry'
    const move = await engine<{ from_stage: string; to_stage: string; probability: number; actor: string }>(token, '/crm/move', 'POST', { deal_id: moveDealId, to_stage: target })
    const after = psql(`SELECT COALESCE(stage,'') || '|' || COALESCE(probability::text,'') || '|' || COALESCE(status,'') FROM crm_deals WHERE id = ${String(moveDealId)};`).trim()
    const expectedStatus = target === 'won' ? 'fulfilled' : target === 'lost' ? 'cancelled' : 'pending'
    check(`拖拽迁移写回（${move.from_stage}→${move.to_stage}：stage+probability+status）`, after === `${target}|${String(move.probability)}|${expectedStatus}`, `${after}（期望 ${target}|${String(move.probability)}|${expectedStatus}）`)
    const audit = psql(`SELECT count(*) FROM crm_stage_audit WHERE deal_id = ${String(moveDealId)} AND from_stage = ${sqlLit(move.from_stage)} AND to_stage = ${sqlLit(move.to_stage)} AND actor = ${sqlLit(move.actor)};`).trim()
    check('迁移审计行落库（actor=会话身份）', audit === '1', `rows=${audit}`)
  }
}

async function assertCustomer(token: string): Promise<void> {
  log('— 客户 360 聚合对拍')
  const customerId = Number(psql(`SELECT id FROM crm_customers WHERE name LIKE 'W6B6%' LIMIT 1;`).trim() || '0')
  check('演练客户在册（360 腿）', customerId > 0, `id=${String(customerId)}`)
  if (customerId <= 0) return
  const view = await engine<{ counts: { orders: number }, ar_balance: number, timeline: ReadonlyArray<{ kind: string }> }>(token, `/crm/customer.json?id=${String(customerId)}`, 'GET')
  const ordersDirect = psql(`SELECT count(*) FROM so_orders WHERE customer_id = ${String(customerId)};`).trim()
  check('360 订单计数 = psql', view.counts.orders === Number(ordersDirect), `board=${String(view.counts.orders)} psql=${ordersDirect}`)
  const arDirect = Number(psql(`SELECT COALESCE(round(SUM(bal.balance)::numeric, 2), 0) FROM (
    SELECT o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance
    FROM so_orders o WHERE o.doc_status = 'approved' AND o.customer_id = ${String(customerId)}) bal;`).trim() || '0')
  check('360 应收余额 = ar_overdue 口径对拍', Math.abs(view.ar_balance - arDirect) < 0.01, `board=${String(view.ar_balance)} psql=${String(arDirect)}`)
  const nodesDirect = psql(`SELECT
    (SELECT count(*) FROM crm_quotes q WHERE q.customer_id = ${String(customerId)} AND COALESCE(q.is_current, TRUE) AND q.issue_date IS NOT NULL)
  + (SELECT count(*) FROM so_orders o WHERE o.customer_id = ${String(customerId)} AND o.need_date IS NOT NULL)
  + (SELECT count(*) FROM so_orders o WHERE o.customer_id = ${String(customerId)} AND o.shipped_at IS NOT NULL)
  + (SELECT count(*) FROM crm_payments p WHERE p.customer_id = ${String(customerId)} AND p.status = 'received' AND p.paid_at IS NOT NULL);`).trim()
  check('360 时间线节点数 = psql（报价+订单+发货+收款）', view.timeline.length === Number(nodesDirect), `board=${String(view.timeline.length)} psql=${nodesDirect}`)
  const kinds = new Set(view.timeline.map(node => node.kind))
  check('时间线节点种类 ⊆ 四类（quote/order/ship/payment）', [...kinds].every(kind => ['quote', 'order', 'ship', 'payment'].includes(kind)), [...kinds].join(','))
}

async function assertFixDebts(): Promise<void> {
  log('— B5 修复债回归（让步预警在册 / 六路枚举面）')
  // Fix-debt 3: a conceded (特采) verdict keeps its critical inspection_fail
  // alert in the ledger — one scan pass first, so a pre-fix vanish-resolved
  // row reopens; then every concession row's alert must stand open until a
  // human closes it.
  await scanAlerts()
  const concessions = psql("SELECT string_agg(DISTINCT id::text, ',') FROM qm_inspections WHERE result = 'concession';").trim()
  if (concessions !== '') {
    const resolved = psql(`SELECT count(*) FROM wfl_alerts WHERE rule_type = 'inspection_fail' AND status = 'resolved' AND entity_id IN (${concessions});`).trim()
    const open = psql(`SELECT count(*) FROM wfl_alerts WHERE rule_type = 'inspection_fail' AND status IN ('open','acknowledged') AND entity_id IN (${concessions});`).trim()
    check('让步（特采）后 critical 预警仍在册（人工关闭才 resolved）', resolved === '0' && Number(open) >= 1, `open=${open} resolved=${resolved}`)
  } else {
    check('让步预警断言前提（库内有让步判定单）', false, '无 result=concession 行——先走 B5 让步演练')
  }
  // Fix-debt 7: the six-rule enum rides both field-metadata selects.
  for (const collection of ['alert_rules', 'wfl_alerts']) {
    const enumRaw = psql(`SELECT COALESCE(options->'uiSchema'->'enum', '[]'::json)::text FROM fields WHERE "collectionName" = '${collection}' AND name = 'rule_type';`).trim()
    // jsonb normalization inserts spaces around ':' — the match tolerates both spellings.
    const values = [...enumRaw.matchAll(/"value"\s*:\s*"([a-z_]+)"/gu)].map(match => match[1])
    check(`${collection}.rule_type 字段枚举含六路（+ccp_deviation/inspection_fail）`,
      ['ccp_deviation', 'inspection_fail'].every(type => values.includes(type)), values.join('/'))
  }
}

async function assertQuoteToSo(token: string): Promise<void> {
  log('— 报价转单（发号+行项目+审批流+幂等防重）')
  const quoteId = Number(psql(`SELECT id FROM crm_quotes WHERE quote_number = ${sqlLit(W6B6_QUOTE)} LIMIT 1;`).trim() || '0')
  check('演练报价在册（转单腿）', quoteId > 0, `id=${String(quoteId)}`)
  if (quoteId <= 0) return
  const product = Number(psql('SELECT id FROM hub_inv_products ORDER BY id LIMIT 1;').trim() || '0')
  const outcome = await engine<{ refused: boolean; so_code?: string; so_id?: number; amount?: number; lines?: number; submitted_to?: string }>(token, '/crm/quote-to-so', 'POST', {
    quote_id: quoteId, need_date: '', lines: [{ product_id: product, qty: 10, unit_price: 100 }],
  })
  check('转单生成 SO（服务端发号）', outcome.refused === false && (outcome.so_code ?? '').startsWith('SO-'), outcome.so_code ?? 'refused')
  const soRow = psql(`SELECT code || '|' || COALESCE(amount::text,'') || '|' || COALESCE(doc_status,'') FROM so_orders WHERE id = ${String(outcome.so_id ?? 0)};`).trim()
  const [code, amount, docStatus] = soRow.split('|')
  check('SO 金额 = Σ行（数量×单价）', amount === '1000', `${code} amount=${amount}`)
  check('SO 已提交审批流（doc_status 离开 draft）', docStatus !== '' && docStatus !== 'draft', `${code} doc_status=${docStatus}`)
  const lines = psql(`SELECT count(*) FROM so_order_lines WHERE order_id = ${String(outcome.so_id ?? 0)};`).trim()
  check('SO 产品行落库', lines === '1', `lines=${lines}`)
  const quoteRow = psql(`SELECT COALESCE(status,'') || '|' || COALESCE(converted_so_code,'') FROM crm_quotes WHERE id = ${String(quoteId)};`).trim()
  check('报价标记已转（status=converted + 单号回写）', quoteRow === `converted|${outcome.so_code ?? ''}`, quoteRow)
  const before = psql("SELECT count(*) FROM so_orders WHERE note LIKE '%QT-W6B6-%';").trim()
  const replay = await engine<{ refused: boolean; duplicate: boolean; existing_so_code?: string }>(token, '/crm/quote-to-so', 'POST', { quote_id: quoteId, need_date: '', lines: [] })
  const after = psql("SELECT count(*) FROM so_orders WHERE note LIKE '%QT-W6B6-%';").trim()
  check('二次转单被幂等拒绝（不重复发号）', replay.refused === true && replay.duplicate === true && replay.existing_so_code === outcome.so_code && before === after, `replay→${String(replay.existing_so_code ?? '')} rows=${before}→${after}`)
}

async function main(): Promise<void> {
  if (mode === 'cleanup') {
    cleanupRehearsalRows()
    log('w6b6-crm: cleanup complete')
    return
  }
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureCrmCollections(token)
    await ensureCrmPages(token)
    seedRehearsalRows()
    log('w6b6-crm: seed complete')
    return
  }
  const health = await fetch(`${ENGINE_BASE}/healthz`).then(response => response.ok).catch(() => false)
  check('引擎在线（/healthz）', health, ENGINE_BASE)
  assertBase()
  await assertPages(token)
  if (health) {
    await assertPipe(token)
    await assertCustomer(token)
    await assertQuoteToSo(token)
    await assertFixDebts()
  }
  if (failures.length > 0) {
    log(`w6b6-crm: assert FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b6-crm: assert PASS')
}

await main()
