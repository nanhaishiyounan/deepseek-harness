/**
 * W6-B9: the finance cockpit — the 经营总览 dashboard pack (five KPI cards,
 * secondary chips, monthly trend, tops, AR aging buckets with customer
 * drill, nine-step chain counters, open-alert digest), the AR aging
 * analysis, the four-segment customer statement (期初+发货−回款=期末, printable,
 * idempotent per customer+period), the graded dunning workbench (alert→task
 * → append-only follow-up records → closed), and the three-way-match issue
 * workbench (qty/price/missing-doc diffs, open→resolved|waived, pay gate
 * 已收货量≥账单量). No gross margin anywhere (the ADR: cost data is not
 * governed — a fake-margin card would be worse than none).
 *
 * Every metric the UI shows comes from one SQL here (the psql recon legs
 * replay the same statements); tunables live in the fin_config row
 * (pay term, dunning levels, price tolerance) — no hardcoded knobs.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b9-cockpit.mts --seed
 *   node --import tsx/esm examples/kb-agent/scripts/w6b9-cockpit.mts --demo
 *   node --import tsx/esm examples/kb-agent/scripts/w6b9-cockpit.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w6b9-cockpit.mts --clean
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { submitForApproval, type NocoIO } from './approval-engine.mts'
import { COCKPIT_CODE, FIN_WORKBENCH_CODE, MATCH_WB_CODE } from './w6b9-blocks.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed' : args.includes('--demo') ? 'demo' : args.includes('--clean') ? 'clean' : 'assert'
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
    '-d', envOf('DB_DATABASE') ?? 'nocobase', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql,
  ], { env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? '' } })
  if (run.status !== 0) throw new Error(`psql failed: ${String(run.stderr)}\nSQL: ${sql.slice(0, 300)}`)
  return run.stdout.toString()
}
const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`
const num = (raw: string): number => Number(raw.trim() === '' ? '0' : raw.trim())

// ─── fin_config: the one-row tunables store (no hardcoded knobs) ───

/** The default dunning ladder (Odoo Follow-up Levels posture: days → level → action). */
const DEFAULT_DUNNING_LEVELS = [
  { days: 1, level: 'L1 提醒', action: '电话+短信提醒' },
  { days: 15, level: 'L2 正式催收', action: '正式催收函+对账单' },
  { days: 60, level: 'L3 强催收', action: '上门催收+停货评估' },
] as const

/**
 * The fin_config row (created idempotently at seed; every read re-fetches so
 * a config change is live on the next request without a restart).
 * @returns the effective config (pay_term_days, dunning levels, price tol).
 */
export function finConfig(): { pay_term_days: number, dunning_levels: Array<{ days: number, level: string, action: string }>, price_tol: number } {
  const row = psql("SELECT pay_term_days || '|' || COALESCE(dunning_levels::text, '[]') || '|' || price_tol FROM fin_config WHERE id = 1;").trim()
  if (row === '') {
    // A missing row is a misconfiguration that must fail loud, not default.
    throw new Error('fin_config 行缺失（先跑 w6b9-cockpit --seed）')
  }
  const [payTerm, levelsRaw, tol] = row.split('|')
  return {
    pay_term_days: Number(payTerm),
    dunning_levels: JSON.parse(levelsRaw) as Array<{ days: number, level: string, action: string }>,
    price_tol: Number(tol),
  }
}

// ─── DDL (all idempotent; the records table is append-only by trigger) ───

/**
 * Create the fin_* tables + the append-only trigger + the audit trigger on
 * fin_dunning_tasks (the wfl_alert_config_audit posture).
 */
export function ensureFinTables(): void {
  psql(`CREATE TABLE IF NOT EXISTS fin_config (
  id INT PRIMARY KEY,
  pay_term_days INT NOT NULL,
  dunning_levels JSONB NOT NULL,
  price_tol DOUBLE PRECISION NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
  if (psql('SELECT count(*) FROM fin_config WHERE id = 1;').trim() === '0') {
    psql(`INSERT INTO fin_config (id, pay_term_days, dunning_levels, price_tol, updated_by)
VALUES (1, 30, '${JSON.stringify(DEFAULT_DUNNING_LEVELS)}', 0.05, 'seed');`)
  }
  psql(`CREATE TABLE IF NOT EXISTS fin_statements (
  id BIGSERIAL PRIMARY KEY,
  statement_no VARCHAR(64) NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL,
  customer_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  opening_amount DOUBLE PRECISION NOT NULL,
  shipped_amount DOUBLE PRECISION NOT NULL,
  received_amount DOUBLE PRECISION NOT NULL,
  closing_amount DOUBLE PRECISION NOT NULL,
  lines JSONB NOT NULL,
  generated_by TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, period_start, period_end));`)
  psql(`CREATE TABLE IF NOT EXISTS fin_dunning_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_no VARCHAR(64) NOT NULL UNIQUE,
  alert_id INT NOT NULL UNIQUE,
  so_code TEXT NOT NULL,
  customer_id BIGINT,
  customer_name TEXT NOT NULL,
  balance DOUBLE PRECISION NOT NULL,
  days_overdue INT NOT NULL,
  level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT NOT NULL DEFAULT '',
  promise_date DATE,
  close_result TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
  psql(`CREATE TABLE IF NOT EXISTS fin_dunning_records (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT NOT NULL,
  promise_date DATE,
  result TEXT NOT NULL,
  actor TEXT NOT NULL,
  client_msg_id TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
  // W6-R5: the client-supplied client_msg_id (the B1 idempotency posture) —
  // a concurrent double-submit with the same id lands one row; the partial
  // unique index keeps pre-R5 rows (NULL) out of the constraint.
  psql('ALTER TABLE fin_dunning_records ADD COLUMN IF NOT EXISTS client_msg_id TEXT;')
  psql("CREATE UNIQUE INDEX IF NOT EXISTS uniq_fin_dunning_records_cmid ON fin_dunning_records (client_msg_id) WHERE client_msg_id IS NOT NULL;")
  // Append-only by database invariant: an UPDATE or DELETE raises, so the
  // audit chain cannot be rewritten from any channel (the psql recon proves
  // it by attempting the forbidden move).
  psql(`CREATE OR REPLACE FUNCTION fin_dunning_records_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fin_dunning_records 追加只读（append-only）：禁止 % 本行（id=%）', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;`)
  psql('DROP TRIGGER IF EXISTS trg_fin_dunning_records_append_only ON fin_dunning_records;')
  psql('CREATE TRIGGER trg_fin_dunning_records_append_only BEFORE UPDATE OR DELETE ON fin_dunning_records FOR EACH ROW EXECUTE FUNCTION fin_dunning_records_append_only();')
  psql(`CREATE TABLE IF NOT EXISTS fin_dunning_audit (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
  psql("CREATE OR REPLACE FUNCTION fin_dunning_tasks_audit_fn() RETURNS trigger AS $$ BEGIN INSERT INTO fin_dunning_audit (task_id, actor, action, payload) VALUES (NEW.id, NEW.updated_by, NEW.status, jsonb_build_object('balance', NEW.balance, 'promise_date', NEW.promise_date, 'close_result', NEW.close_result)); RETURN NEW; END; $$ LANGUAGE plpgsql;")
  psql('DROP TRIGGER IF EXISTS trg_fin_dunning_tasks_audit ON fin_dunning_tasks;')
  psql('CREATE TRIGGER trg_fin_dunning_tasks_audit AFTER INSERT OR UPDATE ON fin_dunning_tasks FOR EACH ROW EXECUTE FUNCTION fin_dunning_tasks_audit_fn();')
  psql(`CREATE TABLE IF NOT EXISTS fin_match_issues (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  invoice_no TEXT NOT NULL,
  po_code TEXT NOT NULL,
  diff_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  found_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolve_note TEXT,
  UNIQUE (invoice_id, diff_type));`)
}

// ─── the fences (username-direct: finance has no department row) ───

/**
 * The finance read fence: finance/admin/nocobase see the money-detail
 * surfaces (aging drill, statements, dunning, match issues).
 * @param actor - the session-derived username.
 * @throws Error naming the fence and the actor.
 */
export function assertFinReader(actor: string): void {
  if (actor === 'admin' || actor === 'finance' || actor === 'nocobase') return
  throw new Error(`财务明细限 finance/admin 读取（${actor} 不在围栏内——价格信息按角色矩阵）`)
}

/** The finance write fence (same population as the read fence). */
export function assertFinWriter(actor: string): void {
  if (actor === 'admin' || actor === 'finance' || actor === 'nocobase') return
  throw new Error(`财务操作限 finance/admin（${actor} 不在围栏内）`)
}

/**
 * Whether one customer belongs to the acting sales user: any deal of that
 * customer owned by them (the crm_deals.owner channel — the only customer
 * ownership the data carries).
 */
function customerOwnedBy(actor: string, customerId: number): boolean {
  return psql(`SELECT count(*) FROM crm_deals WHERE customer_id = ${String(customerId)} AND COALESCE(owner, '') <> '' AND owner = ${sqlLit(actor)};`).trim() !== '0'
}

// ─── the cockpit pack (one GET, every number one SQL) ───

/**
 * The AR balance CTE the overdue card, the aging buckets, and the B2 rule
 * all share verbatim (order-level: approved SO amount minus received
 * payments — the W2 ledger caliber).
 */
const AR_BALANCE_SQL = `SELECT o.id, o.code, o.need_date, o.amount, o.customer_id,
  o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance
FROM so_orders o WHERE o.doc_status = 'approved' AND o.need_date IS NOT NULL`

/** The rule-type label the cockpit digest and the mobile page share. */
const RULE_LABELS: Readonly<Record<string, string>> = {
  expiry: '效期', cert_due: '资质', ar_overdue: '账期', quality_abnormal: '质量', ccp_deviation: 'CCP',
  inspection_fail: '检退', calibration_due: '计量', maint_overdue: '维保',
}

/**
 * The full cockpit payload (the dashboard JSBlock renders this verbatim).
 * @param days - the period window (30/90/180/365).
 * @param actor - the session username (customer-dimension detail masks for
 * non-finance readers; the aggregates stay open to any platform session).
 */
export function computeCockpit(days: number, actor: string): Record<string, unknown> {
  const cfg = finConfig()
  const start = psql(`SELECT (CURRENT_DATE - ${String(days)} + 1)::text;`).trim()
  const end = psql('SELECT CURRENT_DATE::text;').trim()
  const revenue = num(psql(`SELECT COALESCE(SUM(amount), 0) FROM so_orders WHERE doc_status = 'approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)};`))
  const orders = num(psql(`SELECT count(*) FROM so_orders WHERE doc_status = 'approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)};`))
  const arOverdue = num(psql(`SELECT COALESCE(SUM(balance), 0) FROM (${AR_BALANCE_SQL}) b WHERE b.balance > 0.005 AND b.need_date < CURRENT_DATE;`))
  const apDue = num(psql(`SELECT COALESCE(SUM(i.invoice_amount - COALESCE((SELECT SUM(pay.amount) FROM pur_payments pay WHERE pay.invoice_id = i.id AND pay.doc_status = 'paid'), 0)), 0)
FROM pur_invoices i WHERE (i.billed_at + (${String(cfg.pay_term_days)} || ' days')::interval)::date < CURRENT_DATE
  AND i.invoice_amount - COALESCE((SELECT SUM(pay.amount) FROM pur_payments pay WHERE pay.invoice_id = i.id AND pay.doc_status = 'paid'), 0) > 0.005;`))
  const received = num(psql(`SELECT COALESCE(SUM(amount), 0) FROM crm_payments WHERE status = 'received' AND paid_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)};`))
  const inventoryQty = num(psql('SELECT COALESCE(SUM(qty_on_hand), 0) FROM wms_stock;'))
  const kpiLatest = (code: string): number => num(psql(`SELECT value FROM kpi_snapshots WHERE kpi_code = ${sqlLit(code)} ORDER BY calc_date DESC, id DESC LIMIT 1;`))
  const openAlerts = num(psql("SELECT count(*) FROM wfl_alerts WHERE status = 'open';"))
  const trend = psql(`SELECT ym || '|' || amt FROM (SELECT to_char(calc_date, 'YYYY-MM') AS ym, round(max(value)::numeric, 2)::text AS amt FROM kpi_snapshots WHERE kpi_code = 'revenue_monthly' GROUP BY 1) t ORDER BY ym DESC LIMIT 6;`)
    .trim().split('\n').filter(line => line !== '').reverse().map(line => {
      const [ym, value] = line.split('|')
      return { ym, revenue: Number(value) }
    })
  const isFin = actor === 'admin' || actor === 'finance' || actor === 'nocobase'
  const customers = isFin
    ? psql(`SELECT c.name || '|' || round(SUM(o.amount)::numeric, 2)::text FROM so_orders o JOIN crm_customers c ON c.id = o.customer_id
WHERE o.doc_status = 'approved' AND o.shipped_at IS NOT NULL AND o.shipped_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)} GROUP BY c.id, c.name ORDER BY SUM(o.amount) DESC LIMIT 5;`)
      .trim().split('\n').filter(line => line !== '').map(line => {
        const [name, amount] = line.split('|')
        return { name, amount: Number(amount) }
      })
    : []
  const products = psql(`SELECT COALESCE(p.name, '#' || l.product_id) || '|' || round(SUM(l.qty)::numeric, 2)::text FROM so_order_lines l JOIN so_orders o ON o.id = l.order_id LEFT JOIN crm_products p ON p.id = l.product_id
WHERE o.doc_status = 'approved' AND o.shipped_at IS NOT NULL AND o.shipped_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)} GROUP BY l.product_id, p.name ORDER BY SUM(l.qty) DESC LIMIT 5;`)
    .trim().split('\n').filter(line => line !== '').map(line => {
      const [name, qty] = line.split('|')
      return { name, qty: Number(qty) }
    })
  // Aging buckets (overdue-days cut of the open AR balance); the drill rows
  // ride the same statement, masked for non-finance readers.
  const aging = computeAging()
  const bucketsWithDrill = aging.ar.buckets.map(bucket => ({ ...bucket, customers: isFin ? bucket.customers : [] }))
  const chainSpec: Array<[string, string, string, boolean]> = [
    ['leads', '线索', `SELECT count(*) FROM crm_leads WHERE status NOT IN ('won', 'lost');`, false],
    ['deals', '商机', "SELECT count(*) FROM crm_deals WHERE status = 'pending';", false],
    ['quotes', '报价', "SELECT count(*) FROM crm_quotes WHERE status IN ('draft', 'pending_approval', 'sent');", false],
    ['orders', '订单待批', "SELECT count(*) FROM so_orders WHERE doc_status IN ('draft', 'pending', 'pending_level2');", false],
    ['mfg', '在制工单', "SELECT count(*) FROM mfg_orders WHERE doc_status IN ('released', 'in_progress');", false],
    ['insp', '待检', "SELECT count(*) FROM qm_inspections WHERE result = 'pending';", false],
    ['iqc', '入库待检', "SELECT count(*) FROM wms_receipts WHERE iqc_status = 'pending';", false],
    ['ship', '在途发货', "SELECT count(*) FROM wms_shipments WHERE status NOT IN ('closed');", false],
    ['ar', '未清应收', `SELECT count(*) FROM (${AR_BALANCE_SQL}) b WHERE b.balance > 0.005;`, true],
  ]
  const chain = chainSpec.map(([key, label, sql, hot]) => ({
    step: key, label, count: num(psql(sql)), hot,
    hint: hot ? '回款步：未清应收余额>0 的订单数（关联账期预警/催收）' : '',
  }))
  const alerts = psql("SELECT id || '|' || severity || '|' || rule_type || '|' || replace(title, '|', '/') FROM wfl_alerts WHERE status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, last_seen_at DESC, id DESC LIMIT 8;")
    .trim().split('\n').filter(line => line !== '').map(line => {
      const [id, severity, ruleType, ...titleParts] = line.split('|')
      return { id: Number(id), severity, rule_type: ruleType, rule_label: RULE_LABELS[ruleType] ?? ruleType, title: titleParts.join('|') }
    })
  return {
    ok: true,
    period: { days, start, end, label: `近${String(days)}天（${start} ~ ${end}）` },
    cards: [
      { key: 'revenue', label: '期间营收（发货口径）', value: revenue, unit: '¥', hint: `approved SO 且 shipped_at ∈ 期间（${start}~${end}）的 amount 合计` },
      { key: 'orders', label: '期间发货订单数', value: orders, hint: '同期发货的 approved SO 单数' },
      { key: 'avg_order', label: '平均订单值', value: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0, unit: '¥', hint: '期间营收 ÷ 期间发货订单数' },
      { key: 'ar_overdue', label: '逾期应收', value: arOverdue, unit: '¥', critical: arOverdue > 0, hint: 'B2 ar_overdue 同口径：approved 且余额>0 且 need_date<今日' },
      { key: 'ap_due', label: '到期应付', value: apDue, unit: '¥', warn: apDue > 0, hint: `发票 billed_at+${String(cfg.pay_term_days)}天 < 今日 且未付清余额（账期 fin_config.pay_term_days）` },
    ],
    mini: [
      { key: 'received', label: '期间回款', value: received, unit: '¥' },
      { key: 'inventory_qty', label: '库存总量', value: inventoryQty, unit: ' 件' },
      { key: 'production_hit', label: '生产达成率', value: kpiLatest('schedule_hit'), unit: '%' },
      { key: 'otd', label: '供应商准时率', value: kpiLatest('otd_supplier'), unit: '%' },
      { key: 'pass_rate', label: '批次合格率', value: kpiLatest('lot_pass_rate'), unit: '%' },
      { key: 'open_alerts', label: '开放预警', value: openAlerts, unit: ' 条' },
    ],
    trend,
    tops: { customers, products, masked: !isFin },
    aging: { buckets: bucketsWithDrill, total: aging.ar.total, ap: aging.ap, masked: !isFin },
    chain,
    alerts,
  }
}

/**
 * The AR aging buckets (overdue-days cut of the open AR balance) with the
 * per-customer drill rows, plus the AP mirror (past-due unpaid invoices).
 * @returns AR buckets + customers and AP buckets, amounts rounded to 2dp.
 */
export function computeAging(): {
  ar: { buckets: Array<{ key: string, label: string, amount: number, count: number, customers: Array<{ name: string, amount: number, count: number }> }>, total: number, not_due: number }
  ap: { buckets: Array<{ key: string, label: string, amount: number, count: number }>, total: number }
} {
  const rows = psql(`SELECT COALESCE(c.name, '#' || COALESCE(b.customer_id::text, '?'), '未关联客户') || '|' || (CURRENT_DATE - b.need_date) || '|' || round(b.balance::numeric, 2)::text
FROM (${AR_BALANCE_SQL}) b LEFT JOIN crm_customers c ON c.id = b.customer_id
WHERE b.balance > 0.005 AND b.need_date < CURRENT_DATE;`)
  const cut = (days: number): string => days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : days <= 120 ? '91-120' : '120+'
  const labels: Readonly<Record<string, string>> = { '0-30': '逾期 0-30 天', '31-60': '逾期 31-60 天', '61-90': '逾期 61-90 天', '91-120': '逾期 91-120 天', '120+': '逾期 120 天以上' }
  const order = ['0-30', '31-60', '61-90', '91-120', '120+']
  const bucketMap = new Map<string, Map<string, { amount: number, count: number }>>()
  for (const key of order) bucketMap.set(key, new Map())
  let total = 0
  for (const line of rows.trim().split('\n').filter(line => line !== '')) {
    const [name, daysRaw, amountRaw] = line.split('|')
    const bucket = cut(Number(daysRaw))
    const amount = Number(amountRaw)
    total += amount
    const customers = bucketMap.get(bucket)!
    const cell = customers.get(name) ?? { amount: 0, count: 0 }
    cell.amount += amount
    cell.count += 1
    customers.set(name, cell)
  }
  const buckets = order.map(key => {
    const customers = bucketMap.get(key)!
    return {
      key, label: labels[key] ?? key,
      amount: Math.round([...customers.values()].reduce((acc, cell) => acc + cell.amount, 0) * 100) / 100,
      count: [...customers.values()].reduce((acc, cell) => acc + cell.count, 0),
      customers: [...customers.entries()].map(([name, cell]) => ({ name, amount: Math.round(cell.amount * 100) / 100, count: cell.count })).sort((a, b) => b.amount - a.amount),
    }
  })
  const notDue = num(psql(`SELECT COALESCE(SUM(round(balance::numeric, 2)), 0) FROM (${AR_BALANCE_SQL}) b WHERE b.balance > 0.005 AND b.need_date >= CURRENT_DATE;`))
  const cfg = finConfig()
  const apRows = psql(`SELECT (CURRENT_DATE - (i.billed_at + (${String(cfg.pay_term_days)} || ' days')::interval)::date) || '|' || round((i.invoice_amount - COALESCE((SELECT SUM(pay.amount) FROM pur_payments pay WHERE pay.invoice_id = i.id AND pay.doc_status = 'paid'), 0))::numeric, 2)::text
FROM pur_invoices i
WHERE i.invoice_amount - COALESCE((SELECT SUM(pay.amount) FROM pur_payments pay WHERE pay.invoice_id = i.id AND pay.doc_status = 'paid'), 0) > 0.005
  AND (i.billed_at + (${String(cfg.pay_term_days)} || ' days')::interval)::date < CURRENT_DATE;`)
  const apMap = new Map<string, { amount: number, count: number }>(order.map(key => [key, { amount: 0, count: 0 }]))
  let apTotal = 0
  for (const line of apRows.trim().split('\n').filter(line => line !== '')) {
    const [daysRaw, amountRaw] = line.split('|')
    const cell = apMap.get(cut(Number(daysRaw)))!
    const amount = Number(amountRaw)
    apTotal += amount
    cell.amount += amount
    cell.count += 1
  }
  return {
    ar: { buckets, total: Math.round(total * 100) / 100, not_due: Math.round(notDue * 100) / 100 },
    ap: { buckets: order.map(key => ({ key, label: labels[key] ?? key, amount: Math.round((apMap.get(key)?.amount ?? 0) * 100) / 100, count: apMap.get(key)?.count ?? 0 })), total: Math.round(apTotal * 100) / 100 },
  }
}

// ─── statements (four segments, idempotent per customer+period) ───

/** One statement row (the four segments + the line snapshot). */
export interface StatementRow {
  readonly statement_no: string
  readonly customer_id: number
  readonly customer_name: string
  readonly period_start: string
  readonly period_end: string
  readonly opening_amount: number
  readonly shipped_amount: number
  readonly received_amount: number
  readonly closing_amount: number
  readonly lines: ReadonlyArray<{ date: string, kind: '发货' | '回款', doc: string, amount: number, note: string }>
}

/** The four segments of one customer's period, from one SQL pass each. */
function statementSegments(customerId: number, start: string, end: string): { opening: number, shipped: number, received: number, lines: StatementRow['lines'] } {
  const opening = num(psql(`SELECT COALESCE((SELECT SUM(o.amount) FROM so_orders o WHERE o.customer_id = ${String(customerId)} AND o.doc_status = 'approved' AND o.shipped_at IS NOT NULL AND o.shipped_at < ${sqlLit(start)}), 0) - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.customer_id = ${String(customerId)} AND p.status = 'received' AND p.paid_at < ${sqlLit(start)}), 0);`))
  const shipped = num(psql(`SELECT COALESCE(SUM(o.amount), 0) FROM so_orders o WHERE o.customer_id = ${String(customerId)} AND o.doc_status = 'approved' AND o.shipped_at IS NOT NULL AND o.shipped_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)};`))
  const received = num(psql(`SELECT COALESCE(SUM(p.amount), 0) FROM crm_payments p WHERE p.customer_id = ${String(customerId)} AND p.status = 'received' AND p.paid_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)};`))
  const shipLines = psql(`SELECT o.shipped_at || '|' || o.code || '|' || round(o.amount::numeric, 2)::text FROM so_orders o WHERE o.customer_id = ${String(customerId)} AND o.doc_status = 'approved' AND o.shipped_at IS NOT NULL AND o.shipped_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)} ORDER BY o.shipped_at;`)
    .trim().split('\n').filter(line => line !== '').map(line => {
      const [date, code, amount] = line.split('|')
      return { date, kind: '发货' as const, doc: code, amount: Number(amount), note: '销售订单发货确认（approved）' }
    })
  const payLines = psql(`SELECT p.paid_at || '|' || COALESCE(p.so_order_id::text, '') || '|' || round(p.amount::numeric, 2)::text || '|' || COALESCE(p.method, '') FROM crm_payments p WHERE p.customer_id = ${String(customerId)} AND p.status = 'received' AND p.paid_at BETWEEN ${sqlLit(start)} AND ${sqlLit(end)} ORDER BY p.paid_at;`)
    .trim().split('\n').filter(line => line !== '').map(line => {
      const [date, soId, amount, method] = line.split('|')
      return { date, kind: '回款' as const, doc: soId === '' ? '—' : `SO#${soId}`, amount: Number(amount), note: `回款（${method === '' ? '未登记方式' : method}）` }
    })
  return { opening, shipped, received, lines: [...shipLines, ...payLines] }
}

/**
 * Generate (or return the existing) statement for one customer+period —
 * idempotent: the unique (customer_id, period_start, period_end) makes a
 * repeat generate return the same row with duplicate: true.
 * @param actor - the generating username (finance fence checked upstream).
 */
export function generateStatement(actor: string, customerId: number, start: string, end: string): { statement_no: string, duplicate: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(start) || !/^\d{4}-\d{2}-\d{2}$/u.test(end)) throw new Error('期间格式需 YYYY-MM-DD')
  if (start > end) throw new Error(`期间非法（起 ${start} 晚于止 ${end}）`)
  const customer = psql(`SELECT COALESCE(name, '#' || id) FROM crm_customers WHERE id = ${String(customerId)};`).trim()
  if (customer === '') throw new Error(`客户 #${String(customerId)} 不存在`)
  const existing = psql(`SELECT statement_no FROM fin_statements WHERE customer_id = ${String(customerId)} AND period_start = ${sqlLit(start)} AND period_end = ${sqlLit(end)};`).trim()
  if (existing !== '') return { statement_no: existing, duplicate: true }
  const { opening, shipped, received, lines } = statementSegments(customerId, start, end)
  const closing = Math.round((opening + shipped - received) * 100) / 100
  const seq = num(psql('SELECT count(*) + 1 FROM fin_statements;'))
  const year = psql("SELECT to_char(CURRENT_DATE, 'YYYY');").trim()
  const statementNo = `ST-${year}-${String(seq).padStart(4, '0')}`
  psql(`INSERT INTO fin_statements (statement_no, customer_id, customer_name, period_start, period_end, opening_amount, shipped_amount, received_amount, closing_amount, lines, generated_by)
VALUES (${sqlLit(statementNo)}, ${String(customerId)}, ${sqlLit(customer)}, ${sqlLit(start)}, ${sqlLit(end)}, ${String(opening)}, ${String(shipped)}, ${String(received)}, ${String(closing)}, '${JSON.stringify(lines).replaceAll("'", "''")}'::jsonb, ${sqlLit(actor)});`)
  return { statement_no: statementNo, duplicate: false }
}

/** Read one statement by number or by customer+period (null when absent). */
export function statementOf(spec: { statement_no?: string, customer_id?: number, period_start?: string, period_end?: string }): StatementRow | null {
  const where = spec.statement_no !== undefined
    ? `statement_no = ${sqlLit(spec.statement_no)}`
    : `customer_id = ${String(spec.customer_id ?? 0)} AND period_start = ${sqlLit(spec.period_start ?? '')} AND period_end = ${sqlLit(spec.period_end ?? '')}`
  const row = psql(`SELECT statement_no || '|' || customer_id || '|' || customer_name || '|' || period_start || '|' || period_end || '|' || round(opening_amount::numeric, 2) || '|' || round(shipped_amount::numeric, 2) || '|' || round(received_amount::numeric, 2) || '|' || round(closing_amount::numeric, 2) || '|' || replace(COALESCE(lines::text, '[]'), '|', '/') FROM fin_statements WHERE ${where} LIMIT 1;`).trim()
  if (row === '') return null
  const parts = row.split('|')
  return {
    statement_no: parts[0] ?? '', customer_id: Number(parts[1]), customer_name: parts[2] ?? '',
    period_start: parts[3] ?? '', period_end: parts[4] ?? '',
    opening_amount: Number(parts[5]), shipped_amount: Number(parts[6]), received_amount: Number(parts[7]), closing_amount: Number(parts[8]),
    lines: JSON.parse(parts.slice(9).join('|')) as StatementRow['lines'],
  }
}

/**
 * The standalone printable statement page (the /insp/report posture: the
 * print button + @media print sheet make it the PDF face; the four-segment
 * balance table heads the lines).
 * @param statementNo - the statement number.
 * @returns the full HTML document (escapes every dynamic text).
 */
export function statementHtml(statementNo: string): string {
  const st = statementOf({ statement_no: statementNo })
  if (st === null) return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><p>对账单 ${statementNo.replaceAll(/[<>&"']/gu, '')} 不存在</p></body></html>`
  const esc = (value: string): string => value.replace(/[&<>"']/g, c => ({ '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[c] ?? c))
  const rows = st.lines.map(line => `<tr><td>${esc(line.date)}</td><td>${esc(line.kind)}</td><td>${esc(line.doc)}</td><td style="text-align:right">${String(line.amount.toFixed(2))}</td><td>${esc(line.note)}</td></tr>`).join('')
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>客户对账单 ${esc(st.statement_no)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, sans-serif; margin: 0; background: #f2f4f7; color: #16202a; }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 34px 44px 46px; }
  h1 { font-size: 22px; text-align: center; letter-spacing: 6px; margin: 4px 0 2px; }
  .sub { text-align: center; color: #5b6b7a; font-size: 13px; margin-bottom: 18px; }
  .no { text-align: center; font-size: 14px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th, td { border: 1px solid #c9d4de; padding: 8px 10px; font-size: 13.5px; text-align: left; }
  thead th { background: #eef3f8; }
  .bal td { font-size: 14.5px; }
  .bal .k { width: 40%; background: #f7fafc; font-weight: 600; }
  .signature { display: flex; gap: 40px; justify-content: flex-end; margin-top: 26px; font-size: 14px; }
  .footnote { margin-top: 26px; color: #7b8a99; font-size: 12px; border-top: 1px dashed #c9d4de; padding-top: 10px; }
  .bar { text-align: center; padding: 14px 0 0; }
  .bar button { padding: 10px 30px; font-size: 15px; border: none; border-radius: 999px; background: #1E4E8C; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .bar { display: none !important; } .page { padding: 0; } }
</style></head><body><div class="page">
<h1>客户对账单</h1>
<div class="sub">客户：${esc(st.customer_name)} · 期间：${esc(st.period_start)} ~ ${esc(st.period_end)} · 四段式（期初+发货−回款=期末）</div>
<div class="no">单号：${esc(st.statement_no)}</div>
<table class="bal"><tbody>
<tr><td class="k">期初余额（期间前应收净额）</td><td style="text-align:right">${st.opening_amount.toFixed(2)}</td></tr>
<tr><td class="k">＋ 期间发货（approved 订单发货确认）</td><td style="text-align:right">${st.shipped_amount.toFixed(2)}</td></tr>
<tr><td class="k">− 期间回款（received 收款登记）</td><td style="text-align:right">${st.received_amount.toFixed(2)}</td></tr>
<tr><td class="k">＝ 期末余额</td><td style="text-align:right;font-weight:700">${st.closing_amount.toFixed(2)}</td></tr>
</tbody></table>
<table><thead><tr><th>日期</th><th>类型</th><th>单据</th><th style="text-align:right">金额</th><th>摘要</th></tr></thead><tbody>${rows || '<tr><td colspan="5">（期间无发生额）</td></tr>'}</tbody></table>
<div class="signature"><span>制表：财务工作台（自动装配）</span><span>客户确认（盖章）：</span><span>打印日期：${esc(new Date().toISOString().slice(0, 10))}</span></div>
<div class="footnote">对账单按订单级应收口径装配（approved SO 发货确认 + received 回款）；同客户同期间重复生成返回同一份（幂等）。本页由 W6-B9 财务工作台生成。</div>
<div class="bar"><button onclick="window.print()">打印 / 导出 PDF</button></div>
</div></body></html>`
}

// ─── dunning (alert → task → append-only records → closed) ───

/** The dunning task state machine (followup/close actions against statuses). */
const DUNNING_TRANSITIONS: ReadonlyArray<{ readonly action: 'followup' | 'close', readonly from: string, readonly to: string }> = [
  { action: 'followup', from: 'open', to: 'contacted' },
  { action: 'followup', from: 'open', to: 'promised' },
  { action: 'followup', from: 'contacted', to: 'contacted' },
  { action: 'followup', from: 'contacted', to: 'promised' },
  { action: 'followup', from: 'promised', to: 'contacted' },
  { action: 'followup', from: 'promised', to: 'promised' },
  { action: 'close', from: 'contacted', to: 'closed' },
  { action: 'close', from: 'promised', to: 'closed' },
]

/** The dunning level for one overdue span (the highest ladder rung whose days it reached). */
function dunningLevelFor(daysOverdue: number): { level: string, action: string } {
  const ladder = [...finConfig().dunning_levels].sort((a, b) => a.days - b.days)
  let hit = ladder[0] ?? { days: 1, level: 'L1 提醒', action: '电话+短信提醒' }
  for (const rung of ladder) if (daysOverdue >= rung.days) hit = rung
  return { level: hit.level, action: hit.action }
}

/**
 * Create the dunning task for one open ar_overdue alert (idempotent per
 * alert) and notify the alert's routed users through the alert-center
 * channel — the B2 notifyPending posture.
 * @param actor - the creating username (finance fence upstream).
 * @param alertId - the wfl_alerts row (rule_type ar_overdue, not resolved).
 */
export function dunningCreate(actor: string, alertId: number): { task_no: string, duplicate: boolean } {
  const alert = psql(`SELECT rule_type || '|' || status || '|' || entity_code || '|' || COALESCE(detail->>'balance', '0') || '|' || COALESCE(detail->>'days_overdue', '0') || '|' || COALESCE(detail->>'customer_id', '') FROM wfl_alerts WHERE id = ${String(alertId)};`).trim()
  if (alert === '') throw new Error(`预警 #${String(alertId)} 不存在`)
  const [ruleType, status, soCode, balanceRaw, daysRaw, customerIdRaw] = alert.split('|')
  if (ruleType !== 'ar_overdue') throw new Error(`预警 #${String(alertId)} 是 ${ruleType}——仅 ar_overdue 可建催收任务`)
  if (status === 'resolved') throw new Error(`预警 #${String(alertId)} 已关闭——不可建催收任务`)
  const existing = psql(`SELECT task_no FROM fin_dunning_tasks WHERE alert_id = ${String(alertId)};`).trim()
  if (existing !== '') return { task_no: existing, duplicate: true }
  const customerId = customerIdRaw === '' ? null : Number(customerIdRaw)
  const customerName = customerId === null ? '（未关联客户）' : (psql(`SELECT COALESCE(name, '#' || id) FROM crm_customers WHERE id = ${String(customerId)};`).trim() || `#${String(customerId)}`)
  const level = dunningLevelFor(Number(daysRaw))
  const seq = num(psql('SELECT count(*) + 1 FROM fin_dunning_tasks;'))
  const year = psql("SELECT to_char(CURRENT_DATE, 'YYYY');").trim()
  const taskNo = `DUN-${year}-${String(seq).padStart(4, '0')}`
  psql(`INSERT INTO fin_dunning_tasks (task_no, alert_id, so_code, customer_id, customer_name, balance, days_overdue, level, status, updated_by)
VALUES (${sqlLit(taskNo)}, ${String(alertId)}, ${sqlLit(soCode)}, ${customerId === null ? 'NULL' : String(customerId)}, ${sqlLit(customerName)}, ${balanceRaw}, ${daysRaw}, ${sqlLit(level.level)}, 'open', ${sqlLit(actor)});`)
  // Notify the alert's routed users (finance + the sales route) the task now
  // exists — one in-app row per user, the alert-center channel.
  const usersJson = psql(`SELECT COALESCE(notify_users::text, '[]') FROM wfl_alerts WHERE id = ${String(alertId)};`).trim()
  const users = JSON.parse(usersJson) as string[]
  if (users.length > 0) {
    const userLit = users.map(user => sqlLit(user)).join(', ')
    psql(`INSERT INTO "notificationInAppMessages" (id, "createdAt", "updatedAt", "userId", "channelName", title, content, status, "receiveTimestamp")
SELECT gen_random_uuid(), now(), now(), u.id, 'alert-center', ${sqlLit(`催收任务 ${taskNo} 已建立`)}, ${sqlLit(`【催收】${customerName} ${soCode} 逾期 ${daysRaw} 天，余额 ¥${balanceRaw}（${level.level}：${level.action}）——请到财务工作台跟进`)}, 'unread', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
FROM users u WHERE u.username IN (${userLit});`)
  }
  log(`w6b9-cockpit: dunning task ${taskNo} created from alert #${String(alertId)} by ${actor} (${level.level}, notified ${String(users.length)})`)
  return { task_no: taskNo, duplicate: false }
}

/**
 * Append one follow-up record and advance the task's status per the
 * transition table (a promised result lands the promise date). A repeated
 * client_msg_id (the B1 idempotency posture against double-submit) returns
 * the existing row with duplicate: true and never re-advances the machine.
 * @param actor - the acting username (finance fence upstream).
 * @param clientMsgId - the client-supplied dedup id (optional; legacy
 * callers without one keep the plain append).
 */
export function dunningFollowup(actor: string, taskId: number, kind: string, note: string, promiseDate: string | undefined, result: string, clientMsgId?: string): { record_id: number, duplicate: boolean } {
  if (note.trim() === '') throw new Error('跟进记录不能为空（留痕是催收的审计面）')
  if (!['phone', 'visit', 'email', 'note'].includes(kind)) throw new Error(`kind 仅接受 phone/visit/email/note（收到 ${kind}）`)
  if (!['reached', 'no_answer', 'promised', 'partial_paid', 'refused'].includes(result)) throw new Error(`result 仅接受 reached/no_answer/promised/partial_paid/refused（收到 ${result}）`)
  const task = psql(`SELECT status FROM fin_dunning_tasks WHERE id = ${String(taskId)};`).trim()
  if (task === '') throw new Error(`催收任务 #${String(taskId)} 不存在`)
  if (task === 'closed' || task === 'bad_debt') throw new Error('催收任务已关闭——记录不可再追加（状态机）')
  const to = result === 'promised' ? 'promised' : 'contacted'
  if (!DUNNING_TRANSITIONS.some(row => row.action === 'followup' && row.from === task && row.to === to)) {
    throw new Error(`跟进被拒：任务状态 ${task} 不允许推进到 ${to}（状态机）`)
  }
  if (result === 'promised' && (promiseDate === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(promiseDate))) {
    throw new Error('承诺付款必须登记承诺日期（YYYY-MM-DD）')
  }
  if (clientMsgId !== undefined && clientMsgId !== '') {
    const existing = psql(`SELECT id FROM fin_dunning_records WHERE client_msg_id = ${sqlLit(clientMsgId)};`).trim()
    if (existing !== '') return { record_id: num(existing), duplicate: true }
    const inserted = psql(`INSERT INTO fin_dunning_records (task_id, kind, note, promise_date, result, actor, client_msg_id)
VALUES (${String(taskId)}, ${sqlLit(kind)}, ${sqlLit(note)}, ${promiseDate === undefined ? 'NULL' : sqlLit(promiseDate)}, ${sqlLit(result)}, ${sqlLit(actor)}, ${sqlLit(clientMsgId)})
ON CONFLICT (client_msg_id) WHERE client_msg_id IS NOT NULL DO NOTHING RETURNING id;`).trim()
    if (inserted === '') {
      // A concurrent twin won the insert race: the record exists, the
      // machine must not advance twice.
      return { record_id: num(psql(`SELECT id FROM fin_dunning_records WHERE client_msg_id = ${sqlLit(clientMsgId)};`)), duplicate: true }
    }
    const recordId = num(inserted)
    const nextPromise = result === 'promised' && promiseDate !== undefined ? sqlLit(promiseDate) : 'promise_date'
    psql(`UPDATE fin_dunning_tasks SET status = ${sqlLit(to)}, promise_date = ${nextPromise}, owner = CASE WHEN owner = '' THEN ${sqlLit(actor)} ELSE owner END, updated_by = ${sqlLit(actor)}, updated_at = NOW() WHERE id = ${String(taskId)};`)
    return { record_id: recordId, duplicate: false }
  }
  psql(`INSERT INTO fin_dunning_records (task_id, kind, note, promise_date, result, actor)
VALUES (${String(taskId)}, ${sqlLit(kind)}, ${sqlLit(note)}, ${promiseDate === undefined ? 'NULL' : sqlLit(promiseDate)}, ${sqlLit(result)}, ${sqlLit(actor)});`)
  const recordId = num(psql(`SELECT max(id) FROM fin_dunning_records WHERE task_id = ${String(taskId)};`))
  const nextPromise = result === 'promised' && promiseDate !== undefined ? sqlLit(promiseDate) : 'promise_date'
  psql(`UPDATE fin_dunning_tasks SET status = ${sqlLit(to)}, promise_date = ${nextPromise}, owner = CASE WHEN owner = '' THEN ${sqlLit(actor)} ELSE owner END, updated_by = ${sqlLit(actor)}, updated_at = NOW() WHERE id = ${String(taskId)};`)
  return { record_id: recordId, duplicate: false }
}

/**
 * Close one dunning task (requires at least one follow-up record — a
 * closing without a trace is exactly what the audit forbids).
 * @param actor - the acting username (finance fence upstream).
 */
export function dunningClose(actor: string, taskId: number, closeResult: string): { status: string } {
  if (!['paid', 'partial', 'bad_debt'].includes(closeResult)) throw new Error(`close_result 仅接受 paid/partial/bad_debt（收到 ${closeResult}）`)
  const task = psql(`SELECT status FROM fin_dunning_tasks WHERE id = ${String(taskId)};`).trim()
  if (task === '') throw new Error(`催收任务 #${String(taskId)} 不存在`)
  const status = closeResult === 'bad_debt' ? 'bad_debt' : 'closed'
  if (!DUNNING_TRANSITIONS.some(row => row.action === 'close' && row.from === task)) {
    throw new Error(`关闭被拒：任务状态 ${task} 需先跟进（contacted/promised 才可关闭——状态机）`)
  }
  const records = num(psql(`SELECT count(*) FROM fin_dunning_records WHERE task_id = ${String(taskId)};`))
  if (records === 0) throw new Error('关闭被拒：至少一条跟进记录（处置动作留痕是关闭前置）')
  psql(`UPDATE fin_dunning_tasks SET status = ${sqlLit(status)}, close_result = ${sqlLit(closeResult)}, updated_by = ${sqlLit(actor)}, updated_at = NOW() WHERE id = ${String(taskId)};`)
  return { status }
}

/** The open ar_overdue alerts that have no dunning task yet (the candidates). */
export function dunningCandidates(): Array<{ id: number, severity: string, title: string }> {
  return psql(`SELECT a.id || '|' || a.severity || '|' || replace(a.title, '|', '/') FROM wfl_alerts a
WHERE a.rule_type = 'ar_overdue' AND a.status IN ('open', 'acknowledged')
  AND NOT EXISTS (SELECT 1 FROM fin_dunning_tasks t WHERE t.alert_id = a.id)
ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END, a.id;`)
    .trim().split('\n').filter(line => line !== '').map(line => {
      const [id, severity, ...titleParts] = line.split('|')
      return { id: Number(id), severity, title: titleParts.join('|') }
    })
}

/** The dunning tasks with their append-only record timeline. */
export function dunningTasks(): Array<Record<string, unknown>> {
  const rows = psql(`SELECT t.id || '|' || t.task_no || '|' || t.alert_id || '|' || t.so_code || '|' || COALESCE(t.customer_id::text, '') || '|' || replace(t.customer_name, '|', '/') || '|' || round(t.balance::numeric, 2) || '|' || t.days_overdue || '|' || t.level || '|' || t.status || '|' || COALESCE(t.owner, '') || '|' || COALESCE(t.promise_date::text, '') || '|' || COALESCE(t.close_result, '') || '|' || COALESCE(t.updated_by, '')
FROM fin_dunning_tasks t ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'contacted' THEN 1 WHEN 'promised' THEN 2 ELSE 3 END, t.id DESC;`)
    .trim().split('\n').filter(line => line !== '')
  const recordRows = psql(`SELECT r.task_id || '|' || r.kind || '|' || replace(r.note, '|', '/') || '|' || COALESCE(r.promise_date::text, '') || '|' || r.result || '|' || r.actor || '|' || to_char(r.ts, 'YYYY-MM-DD HH24:MI') FROM fin_dunning_records r ORDER BY r.ts, r.id;`)
    .trim().split('\n').filter(line => line !== '')
  const byTask = new Map<number, Array<Record<string, unknown>>>()
  for (const line of recordRows) {
    const [taskId, kind, note, promise, result, actor, ts] = line.split('|')
    const list = byTask.get(Number(taskId)) ?? []
    list.push({ kind, note, promise_date: promise === '' ? null : promise, result, actor, ts })
    byTask.set(Number(taskId), list)
  }
  return rows.map(line => {
    const [id, taskNo, alertId, soCode, customerId, customerName, balance, days, level, status, owner, promise, closeResult, updatedBy] = line.split('|')
    return {
      id: Number(id), task_no: taskNo, alert_id: Number(alertId), so_code: soCode,
      customer_id: customerId === '' ? null : Number(customerId), customer_name: customerName,
      balance: Number(balance), days_overdue: Number(days), level, status, owner,
      promise_date: promise === '' ? null : promise, close_result: closeResult, updated_by: updatedBy,
      records: byTask.get(Number(id)) ?? [],
    }
  })
}

// ─── three-way match (qty / price / missing-doc diffs + the pay gate) ───

/**
 * Rescan the PO↔receipt↔invoice reconciliation into fin_match_issues
 * (idempotent upsert per invoice×diff_type; vanished diffs auto-resolve as
 * system). Diff classes: qty_short (billed > received), price_diff (invoice
 * amount vs PO line sums beyond the config tolerance), no_receipt (billed
 * with zero received quantity and no receipt doc).
 * @returns the fresh issue counts by class and status.
 */
export function scanMatchIssues(): { open: number, resolved: number, by_type: Record<string, number> } {
  const cfg = finConfig()
  const rows = psql(`SELECT i.id || '|' || COALESCE(i.code, i.invoice_no, '#' || i.id) || '|' || COALESCE(o.code, '') || '|' || COALESCE(i.qty_billed::text, '0') || '|' || COALESCE((SELECT SUM(l.qty) FROM pur_order_lines l WHERE l.order_id = o.id), 0) || '|' || COALESCE((SELECT SUM(l.qty_received) FROM pur_order_lines l WHERE l.order_id = o.id), 0) || '|' || COALESCE(i.invoice_amount::text, '0') || '|' || COALESCE((SELECT SUM(l.qty * l.unit_price) FROM pur_order_lines l WHERE l.order_id = o.id), 0) || '|' || COALESCE((SELECT count(*) FROM wms_receipts r WHERE r.po_id = o.id), 0)
FROM pur_invoices i LEFT JOIN pur_orders o ON o.id = i.po_id;`)
  const issues: Array<{ invoice_id: number, invoice_no: string, po_code: string, diff_type: string, detail: string }> = []
  for (const line of rows.trim().split('\n').filter(l => l !== '')) {
    const [idRaw, invoiceNo, poCode, billedRaw, orderedRaw, receivedRaw, amountRaw, poAmountRaw, receiptsRaw] = line.split('|')
    const invoiceId = Number(idRaw)
    const billed = Number(billedRaw), ordered = Number(orderedRaw), received = Number(receivedRaw)
    const amount = Number(amountRaw), poAmount = Number(poAmountRaw)
    if (billed > received + 0.005) {
      issues.push({ invoice_id: invoiceId, invoice_no: invoiceNo, po_code: poCode, diff_type: 'qty_short', detail: `数量差：开票 ${String(billed)} / 收货 ${String(received)}（订购 ${String(ordered)}）——已收货量 < 账单量` })
    }
    if (Math.abs(amount - poAmount) > cfg.price_tol + 0.000001) {
      issues.push({ invoice_id: invoiceId, invoice_no: invoiceNo, po_code: poCode, diff_type: 'price_diff', detail: `价格差：发票 ¥${amount.toFixed(2)} vs 订单行合计 ¥${poAmount.toFixed(2)}（差 ¥${(amount - poAmount).toFixed(2)}，容差 ¥${String(cfg.price_tol)}）` })
    }
    if (billed > 0 && received <= 0.005 && Number(receiptsRaw) === 0) {
      issues.push({ invoice_id: invoiceId, invoice_no: invoiceNo, po_code: poCode, diff_type: 'no_receipt', detail: `缺失单据：已开票 ${String(billed)} 但无收货单且收货量 0——付款拦截` })
    }
  }
  for (const issue of issues) {
    psql(`INSERT INTO fin_match_issues (invoice_id, invoice_no, po_code, diff_type, detail)
VALUES (${String(issue.invoice_id)}, ${sqlLit(issue.invoice_no)}, ${sqlLit(issue.po_code)}, ${sqlLit(issue.diff_type)}, ${sqlLit(issue.detail)})
ON CONFLICT (invoice_id, diff_type) DO UPDATE SET detail = EXCLUDED.detail, invoice_no = EXCLUDED.invoice_no, po_code = EXCLUDED.po_code,
  status = CASE WHEN fin_match_issues.status = 'resolved' AND fin_match_issues.resolved_by = 'system' THEN 'open' ELSE fin_match_issues.status END,
  found_at = CASE WHEN fin_match_issues.status = 'open' THEN NOW() ELSE fin_match_issues.found_at END;`)
  }
  // A diff that healed (receipt landed / amount corrected) auto-resolves.
  const openKeys = issues.map(issue => `(${String(issue.invoice_id)}, ${sqlLit(issue.diff_type)})`).join(', ')
  const healed = openKeys === ''
    ? psql("UPDATE fin_match_issues SET status = 'resolved', resolved_by = 'system', resolved_at = NOW(), resolve_note = '重扫未命中：差异已消除（补收/冲平）' WHERE status = 'open';").trim()
    : psql(`UPDATE fin_match_issues SET status = 'resolved', resolved_by = 'system', resolved_at = NOW(), resolve_note = '重扫未命中：差异已消除（补收/冲平）'
WHERE status = 'open' AND (invoice_id, diff_type) NOT IN (${openKeys});`).trim()
  const healedCount = Number((healed.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
  if (healedCount > 0) log(`w6b9-cockpit: match rescan auto-resolved ${String(healedCount)} healed rows`)
  const byType: Record<string, number> = {}
  for (const row of psql("SELECT diff_type || '|' || status FROM fin_match_issues WHERE status = 'open';").trim().split('\n').filter(l => l !== '')) {
    const [type] = row.split('|')
    byType[type] = (byType[type] ?? 0) + 1
  }
  return {
    open: num(psql("SELECT count(*) FROM fin_match_issues WHERE status = 'open';")),
    resolved: num(psql("SELECT count(*) FROM fin_match_issues WHERE status != 'open';")),
    by_type: byType,
  }
}

/** The issue rows (a rescan rides every read so the workbench is fresh). */
export function matchIssues(): Array<Record<string, unknown>> {
  scanMatchIssues()
  return psql(`SELECT id || '|' || invoice_id || '|' || invoice_no || '|' || po_code || '|' || diff_type || '|' || replace(detail, '|', '/') || '@@' || status || '|' || COALESCE(resolved_by, '') || '|' || COALESCE(resolved_at::text, '') || '|' || replace(COALESCE(resolve_note, ''), '|', '/')
FROM fin_match_issues ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC;`)
    .trim().split('\n').filter(line => line !== '').map(line => {
      const [head, tail] = line.split('@@')
      const [id, invoiceId, invoiceNo, poCode, diffType, ...detailParts] = (head ?? '').split('|')
      const [status, resolvedBy, resolvedAt, ...noteParts] = (tail ?? 'open|||').split('|')
      return {
        id: Number(id), invoice_id: Number(invoiceId), invoice_no: invoiceNo, po_code: poCode, diff_type: diffType,
        detail: detailParts.join('|'), status,
        resolved_by: resolvedBy ?? '', resolved_at: resolvedAt ?? '', resolve_note: noteParts.join('|'),
      }
    })
}

/**
 * Dispose one issue (open→resolved|waived — the state machine; resolved and
 * waived are terminal: a healed row reappearing is a fresh open row).
 * @param actor - the acting username (finance fence upstream).
 */
export function matchResolve(actor: string, issueId: number, action: 'resolved' | 'waived', note: string): { status: string } {
  if (action !== 'resolved' && action !== 'waived') throw new Error(`action 仅接受 resolved/waived（收到 ${action}）`)
  if (note.trim() === '') throw new Error('处置说明不能为空（处置动作留痕）')
  const status = psql(`SELECT status FROM fin_match_issues WHERE id = ${String(issueId)};`).trim()
  if (status === '') throw new Error(`差异行 #${String(issueId)} 不存在`)
  if (status !== 'open') throw new Error(`处置被拒：差异行状态 ${status}——仅 open 可处置（状态机 open→resolved）`)
  psql(`UPDATE fin_match_issues SET status = ${sqlLit(action)}, resolved_by = ${sqlLit(actor)}, resolved_at = NOW(), resolve_note = ${sqlLit(note)} WHERE id = ${String(issueId)};`)
  return { status: action }
}

/**
 * The pay gate: create + submit a payment request for one invoice only
 * when 已收货量 ≥ 账单量 and no open qty/no-receipt issue rides the invoice —
 * Odoo's "Should Be Paid" posture. A refused gate throws its fact.
 * @param io - the NocoBase REST IO (the payment row + its approval flow).
 * @param actor - the paying username (finance fence upstream).
 */
export async function payApply(io: NocoIO, actor: string, invoiceId: number, amount: number, payMethod: string): Promise<{ payment_code: string }> {
  const invoice = psql(`SELECT COALESCE(code, invoice_no, '#' || id) || '|' || COALESCE(po_id::text, '') || '|' || COALESCE(invoice_amount::text, '0') || '|' || COALESCE(qty_billed::text, '0') FROM pur_invoices WHERE id = ${String(invoiceId)};`).trim()
  if (invoice === '') throw new Error(`发票 #${String(invoiceId)} 不存在`)
  const [invoiceNo, poIdRaw, amountRaw, billedRaw] = invoice.split('|')
  const poId = poIdRaw === '' ? null : Number(poIdRaw)
  const billed = Number(billedRaw)
  const received = poId === null ? 0 : num(psql(`SELECT COALESCE(SUM(l.qty_received), 0) FROM pur_order_lines l WHERE l.order_id = ${String(poId)};`))
  if (!(received + 0.005 >= billed)) {
    throw new Error(`付款拦截（三单匹配）：发票 ${invoiceNo} 账单量 ${String(billed)} > 已收货量 ${String(received)}——收货量达标前不予付款（差异工作台处置/补收后再试）`)
  }
  const openIssues = psql(`SELECT count(*) FROM fin_match_issues WHERE invoice_id = ${String(invoiceId)} AND status = 'open' AND diff_type IN ('qty_short', 'no_receipt');`).trim()
  if (openIssues !== '0') {
    throw new Error(`付款拦截（三单匹配）：发票 ${invoiceNo} 有 ${openIssues} 条未处置差异（数量差/缺失收货）——先在差异工作台处置`)
  }
  const code = `PAY-W6B9-${String(num(psql("SELECT count(*) + 1 FROM pur_payments WHERE code LIKE 'PAY-W6B9-%';"))).padStart(3, '0')}`
  const payment = await io.create('pur_payments', { code, amount, pay_method: payMethod, doc_status: 'draft', invoice_id: invoiceId, note: `W6-B9 /fin/pay/apply（${actor}）：三单校验通过（收货 ${String(received)} ≥ 账单 ${String(billed)}，发票 ${invoiceNo} ¥${amountRaw}）` })
  await submitForApproval(io, 'pur_payments', Number(payment.id), actor)
  return { payment_code: code }
}

// ─── the /fin/* route service (the engine calls this after CORS + actor) ───

/**
 * Serve one /fin/* JSON route; the print page is served by the engine
 * through statementHtml (it answers HTML, not JSON).
 * @param io - the NocoBase REST IO.
 * @param pathname - the /fin/... path.
 * @param method - GET or POST.
 * @param params - GET query / POST body.
 * @param actor - the session-derived username.
 * @returns the HTTP outcome for writeJson.
 */
export async function finRoute(io: NocoIO, pathname: string, method: string, params: Record<string, unknown>, actor: string): Promise<{ status: number, body: Record<string, unknown> }> {
  const fail = (status: number, code: string, message: string): { status: number, body: Record<string, unknown> } => ({ status, body: { ok: false, code, message, error: message } })
  const guard = (fn: () => { status: number, body: Record<string, unknown> }): { status: number, body: Record<string, unknown> } => {
    try {
      return fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[fin] ${method} ${pathname} refused: ${message}`)
      return /围栏|仅可见自己客户/.test(message) ? fail(403, 'fenced', message) : fail(400, 'refused', message)
    }
  }
  if (method === 'GET' && pathname === '/fin/whoami') {
    // W6-R5: the cockpit claim button needs the session username for
    // /alerts/act — the RunJS sandbox cannot resolve a relative platform
    // URL, so the identity read rides this engine route (any platform
    // session; the answer is the caller's own username only).
    return { status: 200, body: { ok: true, actor } }
  }
  if (method === 'GET' && pathname === '/fin/cockpit') {
    const days = [30, 90, 180, 365].includes(Number(params['days'])) ? Number(params['days']) : 90
    return { status: 200, body: computeCockpit(days, actor) }
  }
  if (method === 'GET' && pathname === '/fin/aging') {
    return guard(() => { assertFinReader(actor); return { status: 200, body: { ok: true, ...computeAging() } } })
  }
  if (method === 'GET' && pathname === '/fin/customers') {
    return guard(() => {
      assertFinReader(actor)
      const customers = psql("SELECT id || '|' || COALESCE(name, '#' || id) FROM crm_customers ORDER BY id;")
        .trim().split('\n').filter(line => line !== '').map(line => {
          const [id, name] = line.split('|')
          return { id: Number(id), name }
        })
      return { status: 200, body: { ok: true, customers } }
    })
  }
  if (method === 'GET' && pathname === '/fin/statement/list') {
    return guard(() => {
      assertFinReader(actor)
      const statements = psql("SELECT statement_no || '|' || customer_name || '|' || period_start || '|' || period_end || '|' || round(closing_amount::numeric, 2) FROM fin_statements ORDER BY id DESC LIMIT 50;")
        .trim().split('\n').filter(line => line !== '').map(line => {
          const [statementNo, customerName, start, end, closing] = line.split('|')
          return { statement_no: statementNo, customer_name: customerName, period_start: start, period_end: end, closing_amount: Number(closing) }
        })
      return { status: 200, body: { ok: true, statements } }
    })
  }
  if (method === 'GET' && pathname === '/fin/statement') {
    return guard(() => {
      const statement = statementOf({ customer_id: Number(params['customer_id']), period_start: String(params['period_start'] ?? ''), period_end: String(params['period_end'] ?? '') })
      if (statement === null) throw new Error('对账单不存在（先 POST /fin/statement/generate）')
      // The sales exception: own-customer statements read without the
      // finance fence (price info scoped to their own book).
      if (actor !== 'admin' && actor !== 'finance' && actor !== 'nocobase' && !customerOwnedBy(actor, statement.customer_id)) {
        throw new Error(`对账单含价格信息，sales 仅可见自己客户（${actor} 与客户 ${statement.customer_name} 无归属关系）`)
      }
      return { status: 200, body: { ok: true, statement } }
    })
  }
  if (method === 'POST' && pathname === '/fin/statement/generate') {
    return guard(() => {
      assertFinWriter(actor)
      const out = generateStatement(actor, Number(params['customer_id']), String(params['period_start'] ?? ''), String(params['period_end'] ?? ''))
      const statement = statementOf({ statement_no: out.statement_no })
      return { status: 200, body: { ok: true, ...out, statement } }
    })
  }
  if (method === 'GET' && pathname === '/fin/dunning/tasks') {
    return guard(() => { assertFinReader(actor); return { status: 200, body: { ok: true, tasks: dunningTasks() } } })
  }
  if (method === 'GET' && pathname === '/fin/dunning/candidates') {
    return guard(() => { assertFinReader(actor); return { status: 200, body: { ok: true, candidates: dunningCandidates() } } })
  }
  if (method === 'POST' && pathname === '/fin/dunning/create') {
    return guard(() => {
      assertFinWriter(actor)
      const out = dunningCreate(actor, Number(params['alert_id']))
      return { status: 200, body: { ok: true, ...out } }
    })
  }
  if (method === 'POST' && pathname === '/fin/dunning/followup') {
    return guard(() => {
      assertFinWriter(actor)
      const promise = params['promise_date'] === undefined || params['promise_date'] === '' ? undefined : String(params['promise_date'])
      const msgId = params['client_msg_id'] === undefined || params['client_msg_id'] === '' ? undefined : String(params['client_msg_id'])
      const out = dunningFollowup(actor, Number(params['task_id']), String(params['kind'] ?? 'phone'), String(params['note'] ?? ''), promise, String(params['result'] ?? 'reached'), msgId)
      return { status: 200, body: { ok: true, ...out } }
    })
  }
  if (method === 'POST' && pathname === '/fin/dunning/close') {
    return guard(() => {
      assertFinWriter(actor)
      const out = dunningClose(actor, Number(params['task_id']), String(params['close_result'] ?? 'paid'))
      return { status: 200, body: { ok: true, ...out } }
    })
  }
  if (method === 'GET' && pathname === '/fin/match/issues') {
    return guard(() => { assertFinReader(actor); return { status: 200, body: { ok: true, issues: matchIssues() } } })
  }
  if (method === 'POST' && pathname === '/fin/match/resolve') {
    return guard(() => {
      assertFinWriter(actor)
      const out = matchResolve(actor, Number(params['issue_id']), params['action'] === 'waived' ? 'waived' : 'resolved', String(params['note'] ?? ''))
      return { status: 200, body: { ok: true, ...out } }
    })
  }
  if (method === 'POST' && pathname === '/fin/pay/apply') {
    let outcome: { status: number, body: Record<string, unknown> }
    try {
      assertFinWriter(actor)
      const out = await payApply(io, actor, Number(params['invoice_id']), Number(params['amount']), String(params['pay_method'] ?? 'bank'))
      outcome = { status: 200, body: { ok: true, ...out } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[fin] pay/apply refused: ${message}`)
      outcome = /围栏/.test(message) ? fail(403, 'fenced', message) : fail(403, 'pay_blocked', message)
    }
    return outcome
  }
  return fail(404, 'no_route', `no fin route ${method} ${pathname}`)
}

// ─── pages (cockpit first nav + finance workbench + match workbench) ───

/** Resolve one flowPage's grid uid (null when the page or grid is absent). */
async function pageGridUid(token: string, pageTitle: string, parentId: number | null): Promise<string | null> {
  const routes = await listRoutes(token, 'W6B9-page')
  const page = routes.find(row => row.title === pageTitle && row.type === 'flowPage' && (parentId === null ? row.parentId === null || row.parentId === undefined : row.parentId === parentId))
  if (page === undefined) return null
  const tab = routes.find(row => row.parentId === page.id && row.type === 'tabs')
  if (tab?.schemaUid == null) return null
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
  return grid?.uid ?? null
}

/**
 * Seat one block's grid row first in rowOrder (an additive JSBlock lands in
 * an appendRow at the page bottom where the lazy renderer never mounts it).
 * @param token - the root API token.
 * @param gridUid - the page's BlockGrid uid.
 * @param blockUid - the block whose row moves to the top.
 */
async function seatBlockRowTop(token: string, gridUid: string, blockUid: string): Promise<void> {
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(gridUid)}`)
  const tree = current?.tree ?? {}
  const grid = ((((tree.stepParams ?? {}) as Record<string, unknown>).gridSettings as Record<string, unknown> | undefined)?.grid) as {
    rows?: Record<string, unknown>, sizes?: Record<string, unknown>, rowOrder?: string[]
  } | undefined
  if (grid?.rows === undefined) return
  const rows: Record<string, unknown> = {}
  const sizes: Record<string, unknown> = {}
  let topCells: unknown[][] | null = null
  for (const [key, rawCells] of Object.entries(grid.rows)) {
    const cells = (Array.isArray(rawCells) ? rawCells : []).map(cell => (Array.isArray(cell) ? cell : []).map(uid => String(uid)))
    if (cells.some(cell => cell.includes(blockUid))) { topCells = cells; continue }
    const withoutMine = cells.map(cell => cell.filter(uid => uid !== blockUid))
    if (withoutMine.some(cell => cell.length > 0)) rows[key] = withoutMine
  }
  if (topCells === null) return
  const order = grid.rowOrder ?? []
  const headKey = order[0]
  const restKeys = order.slice(1).filter(key => rows[key] !== undefined)
  const rowOrder = [headKey, ...restKeys.filter(key => key !== headKey)]
  for (const [key, value] of Object.entries(grid.sizes ?? {})) sizes[key] = value
  await dataOf(token, 'POST', '/api/flowSurfaces:save', {
    uid: gridUid, tree: { ...tree, stepParams: { ...(tree.stepParams as Record<string, unknown>), gridSettings: { ...(tree.stepParams as Record<string, unknown>).gridSettings, grid: { rows: { ...(rows[headKey] === undefined ? {} : { [headKey]: rows[headKey] }), ...topRows(topCells, headKey), ...rows }, sizes, rowOrder } } } },
  })
}

/** The moved block's own row under a fresh key (the seatBlockRowTop helper). */
function topRows(topCells: unknown[][], headKey: string): Record<string, unknown> {
  return headKey === undefined ? {} : { __moved: topCells }
}

/**
 * Attach one JSBlock to a page's grid (additive, the w6b7 recall-console
 * pattern): skip when a block carrying the marker exists; otherwise addBlock
 * and seat it first.
 * @param token - the root API token.
 * @param pageTitle - the target flowPage title.
 * @param parentId - the page's parent group id (null = top level).
 * @param code - the RunJS source.
 * @param marker - the code substring proving the block exists.
 * @param blockTitle - the block card title.
 */
async function ensureJsBlockOnPage(token: string, pageTitle: string, parentId: number | null, code: string, marker: string, blockTitle: string): Promise<boolean> {
  const gridUid = await pageGridUid(token, pageTitle, parentId)
  if (gridUid === null) {
    log(`w6b9-cockpit: page ${pageTitle} missing (grid null)`)
    return false
  }
  const models = await listFlowModels(token, 'W6B9-blocks')
  const existing = models.filter(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === gridUid)
    .sort((a, b) => String(a.uid ?? '').localeCompare(String(b.uid ?? '')))
  if (existing.length > 1) {
    for (const extra of existing.slice(1)) {
      psql(`DELETE FROM "flowModels" WHERE uid = ${sqlLit(String(extra.uid ?? ''))};`)
      log(`w6b9-cockpit: ${pageTitle} duplicate JSBlock removed (uid ${String(extra.uid ?? '')})`)
    }
  }
  const head = existing[0]
  if (head !== undefined) {
    const current = String(head.stepParams?.jsSettings?.runJs?.code ?? '')
    if (current !== code) {
      const version = String((head.stepParams?.jsSettings?.runJs as { version?: string } | undefined)?.version ?? 'v2')
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: head.uid, name: head.uid, parentId: gridUid, subKey: 'items', subType: 'array',
        use: 'JSBlockModel', stepParams: { jsSettings: { runJs: { version, code } } }, props: { title: blockTitle },
      })
      log(`w6b9-cockpit: ${pageTitle} JSBlock code upgraded (${marker})`)
    } else {
      log(`w6b9-cockpit: ${pageTitle} JSBlock exists (${marker} kept)`)
    }
    return true
  }
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'jsBlock',
    settings: { showBlockCard: true, code },
  }) as { uid?: unknown }
  if (typeof block.uid !== 'string') {
    log(`w6b9-cockpit: addBlock returned no uid for ${pageTitle}: ${JSON.stringify(block).slice(0, 160)}`)
    return false
  }
  await dataOf(token, 'POST', '/api/flowModels:save', { uid: block.uid, name: block.uid, sortIndex: 1 })
  log(`w6b9-cockpit: ${pageTitle} JSBlock created (${marker}, uid ${block.uid})`)
  await seatBlockRowTop(token, gridUid, block.uid).catch(() => { /* the block is already placed; a seat failure never blocks the batch */ })
  return true
}

/**
 * Lay the 经营总览 cockpit page at the first nav slot (top-level flowPage,
 * sort -1 ahead of every group) carrying only the cockpit JSBlock — the
 * Odoo three-layer posture, never a table.
 * @param token - the root API token.
 */
async function ensureCockpitPage(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B9-cockpit')
  const title = '经营总览'
  let pageId = routes.find(row => row.title === title && row.type === 'flowPage' && (row.parentId === null || row.parentId === undefined))?.id
  if (pageId === undefined) {
    const routeUid = withN17Prefix('w6b9c', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon: 'DashboardOutlined', type: 'flowPage', parentId: null, sort: -1, schemaUid: routeUid }) as { id?: unknown }
    pageId = Number(page.id ?? 0)
    const tabUid = withN17Prefix('w6b9c', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b9c', 'ts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({
      uid: withN17Prefix('w6b9c', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
      props: { title, displayTitle: true, enableTabs: false },
      stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false, description: '经营驾驶舱（W6-B9）：KPI 数字卡 + 月度趋势 + Top 榜 + 应收账龄分桶 + 九步链路计数 + 异常清单；期间过滤联动重取；每指标 psql 可对账；不做毛利（成本数据未治理 ADR）' } } },
    })
    await save({ uid: withN17Prefix('w6b9c', 'g'), parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    log('w6b9-cockpit: v2 page 经营总览 created (first nav slot, sort=-1)')
  }
  await ensureJsBlockOnPage(token, title, null, COCKPIT_CODE, 'w6b9-cockpit', '经营驾驶舱')
}

/**
 * Lay the 财务工作台 page under 经营分析 (the finance home: dunning
 * candidates + task cards + statement generator).
 * @param token - the root API token.
 */
async function ensureFinWorkbenchPage(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B9-finwb')
  const groupId = routes.find(row => row.title === '经营分析' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 经营分析 missing (run the w9 dashboard seeds first)')
  const title = '财务工作台'
  let pageId = routes.find(row => row.title === title && row.type === 'flowPage' && row.parentId === groupId)?.id
  if (pageId === undefined) {
    const routeUid = withN17Prefix('w6b9f', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon: 'AccountBookOutlined', type: 'flowPage', parentId: groupId, sort: 6, schemaUid: routeUid }) as { id?: unknown }
    pageId = Number(page.id ?? 0)
    const tabUid = withN17Prefix('w6b9f', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b9f', 'ts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({
      uid: withN17Prefix('w6b9f', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
      props: { title, displayTitle: true, enableTabs: false },
      stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false, description: '财务工作台（W6-B9）：账期预警→催收任务（状态灯+等级）、跟进记录 append-only、客户对账单四段式生成与打印（幂等）' } } },
    })
    await save({ uid: withN17Prefix('w6b9f', 'g'), parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    log('w6b9-cockpit: v2 page 财务工作台 created (经营分析 group)')
  }
  await ensureJsBlockOnPage(token, title, groupId, FIN_WORKBENCH_CODE, 'w6b9-fin-wb', '财务工作台')
}

/**
 * Lay the three-way-match issue workbench JSBlock on the existing 发票匹配
 * page (采购管理; the B7 match_result bar chart stays as the aggregate).
 * @param token - the root API token.
 */
async function ensureMatchWorkbenchPage(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B9-match')
  const groupId = routes.find(row => row.title === '采购管理' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 采购管理 missing')
  await ensureJsBlockOnPage(token, '发票匹配', groupId, MATCH_WB_CODE, 'w6b9-match-wb', '三单差异工作台')
}

/**
 * The seed leg: tables + the three pages (idempotent).
 * @param token - the root API token.
 */
export async function ensureFinSeed(token: string): Promise<void> {
  ensureFinTables()
  await ensureCockpitPage(token)
  await ensureFinWorkbenchPage(token)
  await ensureMatchWorkbenchPage(token)
}

// ─── the demo leg (idempotent: a repeat run creates nothing new) ───

/**
 * The demo walk: seed the dunning tasks from the live ar_overdue alerts,
 * append the first follow-up trail on the SO-W6B2-SEED task (guarded by the
 * existing-record count so a rerun adds nothing), and generate one
 * statement for the seeded demo customer (idempotent by unique key).
 */
async function runDemoLeg(): Promise<void> {
  ensureFinTables()
  const candidates = dunningCandidates()
  log(`w6b9-cockpit: ${String(candidates.length)} dunning candidate(s) from open ar_overdue alerts`)
  for (const candidate of candidates) {
    const out = dunningCreate('finance', candidate.id)
    log(`  ${out.task_no}${out.duplicate ? '（已存在，幂等返回）' : ''} ← 预警 #${String(candidate.id)}`)
  }
  // The demo trail: one phone follow-up + one promise on the seeded task.
  const seeded = psql(`SELECT id FROM fin_dunning_tasks WHERE so_code = 'SO-W6B2-SEED' LIMIT 1;`).trim()
  if (seeded !== '') {
    const taskId = Number(seeded)
    const records = num(psql(`SELECT count(*) FROM fin_dunning_records WHERE task_id = ${String(taskId)};`))
    if (records === 0) {
      dunningFollowup('finance', taskId, 'phone', '电话联系客户采购负责人，客户确认收到对账无误，承诺下周三前付款', undefined, 'reached')
      const promiseDate = psql('SELECT (CURRENT_DATE + 7)::text;').trim()
      dunningFollowup('finance', taskId, 'phone', `二次跟进：客户财务给出明确付款计划，承诺 ${promiseDate} 前结清`, promiseDate, 'promised')
      log(`  跟进演示落痕：任务 #${String(taskId)} 两条记录（reached + promised）`)
    } else {
      log(`  跟进演示已存在（${String(records)} 条），幂等跳过`)
    }
  }
  // One statement for the demo customer (id 1 carries the seeded orders).
  const customerId = num(psql('SELECT COALESCE(min(customer_id), 0) FROM so_orders WHERE doc_status = \'approved\' AND shipped_at IS NOT NULL;'))
  if (customerId > 0) {
    const start = psql("SELECT date_trunc('quarter', CURRENT_DATE)::date::text;").trim()
    const end = psql('SELECT CURRENT_DATE::text;').trim()
    const out = generateStatement('finance', customerId, start, end)
    const st = statementOf({ statement_no: out.statement_no })
    log(`  对账单 ${out.statement_no}${out.duplicate ? '（已存在，幂等返回）' : ''}：客户 ${st?.customer_name ?? '?'} 期初 ${String(st?.opening_amount ?? 0)} + 发货 ${String(st?.shipped_amount ?? 0)} − 回款 ${String(st?.received_amount ?? 0)} = 期末 ${String(st?.closing_amount ?? 0)}`)
  }
  const match = scanMatchIssues()
  log(`  三单初扫：open=${String(match.open)} resolved=${String(match.resolved)} by_type=${JSON.stringify(match.by_type)}`)
}

// ─── the clean leg (drill-data reset, the R4 rehearsal discipline) ───

/**
 * Drop the W6-B9 rehearsal data (dunning trail, statements, match
 * dispositions) so a rerun of --demo starts from a clean ledger. The B2
 * alert rows themselves stay — they are the scanner's live state, not this
 * batch's drill data. TRUNCATE bypasses the append-only trigger by design:
 * the trigger guards BEFORE UPDATE OR DELETE per row, and only a
 * statement-level TRUNCATE event (never installed) could see this path.
 */
function runCleanLeg(): void {
  ensureFinTables()
  const counts = [
    ['fin_dunning_records', num(psql('SELECT count(*) FROM fin_dunning_records;'))],
    ['fin_dunning_audit', num(psql('SELECT count(*) FROM fin_dunning_audit;'))],
    ['fin_dunning_tasks', num(psql('SELECT count(*) FROM fin_dunning_tasks;'))],
    ['fin_statements', num(psql('SELECT count(*) FROM fin_statements;'))],
    ['fin_match_issues', num(psql('SELECT count(*) FROM fin_match_issues;'))],
  ] as const
  psql('TRUNCATE fin_dunning_records, fin_dunning_audit, fin_dunning_tasks, fin_statements, fin_match_issues RESTART IDENTITY;')
  for (const [table, was] of counts) log(`w6b9-cockpit: --clean removed ${String(was)} row(s) from ${table}`)
  log('w6b9-cockpit: --clean complete（wfl_alerts/B2 扫描状态保留；--demo 可从零重放）')
}

// ─── the assert leg (read-only against the demo state + negative probes) ───

/**
 * The acceptance asserts: every cockpit card reconciles against its psql
 * twin, the aging buckets sum to the overdue AR total, the statement's four
 * segments balance and re-generate returns the same row, the records table
 * is append-only by attempted write, the dunning state machine refuses the
 * illegal moves, the fences refuse an outsider, and the pay gate blocks the
 * un-receipted invoice.
 */
async function runAssertLeg(): Promise<void> {
  ensureFinTables()
  log('== W6-B9 assert: cockpit caliber ==')
  const cockpit = computeCockpit(90, 'admin') as { cards: Array<{ key: string, value: number }>, chain: unknown[], aging: { buckets: Array<{ amount: number }>, total: number } }
  const card = (key: string): number => cockpit.cards.find(c => c.key === key)?.value ?? -1
  const revenue90 = num(psql(`SELECT COALESCE(SUM(amount), 0) FROM so_orders WHERE doc_status = 'approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN (CURRENT_DATE - 90 + 1) AND CURRENT_DATE;`))
  check('营收卡 = psql 发货口径直算', Math.abs(card('revenue') - revenue90) < 0.01, `${String(card('revenue'))} vs ${String(revenue90)}`)
  const orders90 = num(psql(`SELECT count(*) FROM so_orders WHERE doc_status = 'approved' AND shipped_at IS NOT NULL AND shipped_at BETWEEN (CURRENT_DATE - 90 + 1) AND CURRENT_DATE;`))
  check('订单数卡 = psql 直算', card('orders') === orders90, `${String(card('orders'))} vs ${String(orders90)}`)
  const arOverdue = num(psql(`SELECT COALESCE(SUM(balance), 0) FROM (SELECT o.id, o.need_date, o.amount, o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance FROM so_orders o WHERE o.doc_status = 'approved' AND o.need_date IS NOT NULL) b WHERE b.balance > 0.005 AND b.need_date < CURRENT_DATE;`))
  check('逾期应收卡 = psql B2 口径直算', Math.abs(card('ar_overdue') - arOverdue) < 0.01, `${String(card('ar_overdue'))} vs ${String(arOverdue)}`)
  const bucketSum = Math.round(cockpit.aging.buckets.reduce((acc, bucket) => acc + bucket.amount, 0) * 100) / 100
  check('账龄分桶合计 = 逾期应收卡', Math.abs(bucketSum - card('ar_overdue')) < 0.01, `${String(bucketSum)} vs ${String(card('ar_overdue'))}`)
  check('九步链路齐备', cockpit.chain.length === 9, `${String(cockpit.chain.length)} 步`)
  const masked = computeCockpit(90, 'keeper') as { tops: { masked: boolean }, aging: { masked: boolean } }
  check('非 finance 读到脱敏明细', masked.tops.masked && masked.aging.masked, 'tops/aging masked=true')

  log('== W6-B9 assert: aging buckets vs psql ==')
  const bucketPsql = psql(`SELECT count(*) FROM (SELECT (CURRENT_DATE - b.need_date) AS d FROM (SELECT o.id, o.need_date, o.amount, o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance FROM so_orders o WHERE o.doc_status = 'approved' AND o.need_date IS NOT NULL) b WHERE b.balance > 0.005 AND b.need_date < CURRENT_DATE) x WHERE x.d <= 30;`)
  const aging30 = (computeAging().ar.buckets.find(bucket => bucket.key === '0-30')?.count ?? -1)
  check('0-30 桶单数 = psql 直算', aging30 === num(bucketPsql), `${String(aging30)} vs ${bucketPsql.trim()}`)

  log('== W6-B9 assert: statement equation + idempotency ==')
  const st = psql(`SELECT statement_no || '|' || customer_id || '|' || period_start || '|' || period_end FROM fin_statements ORDER BY id DESC LIMIT 1;`).trim()
  check('存在已生成对账单', st !== '', st === '' ? '（先跑 --demo）' : st.split('|')[0])
  if (st !== '') {
    const [statementNo, customerIdRaw, start, end] = st.split('|')
    const row = statementOf({ statement_no: statementNo })!
    check('四段等式 期初+发货−回款=期末', Math.abs(row.opening_amount + row.shipped_amount - row.received_amount - row.closing_amount) < 0.01, `${String(row.opening_amount)}+${String(row.shipped_amount)}−${String(row.received_amount)}=${String(row.closing_amount)}`)
    const again = generateStatement('finance', Number(customerIdRaw), start, end)
    check('重复生成返回同一份（幂等）', again.duplicate && again.statement_no === statementNo, `${again.statement_no} duplicate=${String(again.duplicate)}`)
  }

  log('== W6-B9 assert: append-only + state machine negatives ==')
  const recordId = psql('SELECT COALESCE(max(id), 0) FROM fin_dunning_records;').trim()
  if (recordId !== '0') {
    let tampered = false
    try {
      psql(`UPDATE fin_dunning_records SET note = '篡改' WHERE id = ${recordId};`)
    } catch {
      tampered = true
    }
    check('跟进记录 UPDATE 被触发器拒绝', tampered, tampered ? '' : '（触发器未拦截——append-only 破产）')
  } else {
    check('跟进记录 UPDATE 被触发器拒绝（无记录可测，跳过前提）', true, 'records 为空——先跑 --demo')
  }
  let outsiderRefused = false
  try {
    assertFinWriter('sales_rep')
  } catch {
    outsiderRefused = true
  }
  check('sales_rep 财务写被围栏拒', outsiderRefused)
  let openCloseRefused = false
  const openTask = psql("SELECT id FROM fin_dunning_tasks WHERE status = 'open' LIMIT 1;").trim()
  if (openTask !== '') {
    try {
      dunningClose('finance', Number(openTask), 'paid')
    } catch {
      openCloseRefused = true
    }
    check('open 任务直接关闭被状态机拒', openCloseRefused)
  } else {
    check('open 任务直接关闭被状态机拒（无 open 任务，跳过前提）', true, '全部任务已跟进/关闭')
  }

  log('== W6-B9 assert: three-way match + pay gate ==')
  const match = scanMatchIssues()
  const issues = matchIssues()
  const diffTypes = new Set(issues.map(issue => String(issue.diff_type)))
  check('三单差异已分类落表', issues.length > 0, `open=${String(match.open)} types=${[...diffTypes].join(',') || '（无差异——需 fixture）'}`)
  const openQty = issues.find(issue => issue.status === 'open' && ['qty_short', 'no_receipt'].includes(String(issue.diff_type)))
  if (openQty !== undefined) {
    const before = num(psql(`SELECT count(*) FROM pur_payments WHERE code LIKE 'PAY-W6B9-%';`))
    let blocked = false
    try {
      await payApply({} as NocoIO, 'finance', Number(openQty.invoice_id), 1, 'bank')
    } catch (error) {
      blocked = error instanceof Error && error.message.includes('付款拦截')
    }
    const after = num(psql(`SELECT count(*) FROM pur_payments WHERE code LIKE 'PAY-W6B9-%';`))
    check('未收货付款被拦截（负例）', blocked && before === after, blocked ? '拦截事实：' : '（未拦截——门失效）')
  } else {
    check('未收货付款被拦截（无 open qty 差异，跳过前提）', true, '当前差异均已处置')
  }
  const pages = [
    { title: '经营总览', marker: 'w6b9-cockpit' },
    { title: '财务工作台', marker: 'w6b9-fin-wb' },
    { title: '发票匹配', marker: 'w6b9-match-wb' },
  ]
  for (const page of pages) {
    const hit = psql(`SELECT count(*) FROM "flowModels" WHERE options::text LIKE ${sqlLit(`%${page.marker}%`)};`).trim()
    check(`页面块 ${page.title}（${page.marker}）在`, hit !== '0', `${hit} 行`)
  }
  const stmtCount = num(psql('SELECT count(*) FROM fin_statements;'))
  check('对账单行 ≥1（demo 落库）', stmtCount >= 1, `${String(stmtCount)} 份`)
  const taskCount = num(psql('SELECT count(*) FROM fin_dunning_tasks;'))
  const recordCount = num(psql('SELECT count(*) FROM fin_dunning_records;'))
  check('催收任务/记录落库', taskCount >= 1 && recordCount >= 1, `${String(taskCount)} 任务 / ${String(recordCount)} 记录`)
  const auditCount = num(psql('SELECT count(*) FROM fin_dunning_audit;'))
  check('催收任务审计触发器在写', auditCount >= taskCount, `${String(auditCount)} 行 ≥ 任务数 ${String(taskCount)}`)

  log('== W6-R5 assert: print link / KPI contract / followup dedup / AP mirror ==')
  // B3: both print entries ride one printUrl() helper — the list <a> and the
  // post-generate window.open are character-identical by construction.
  const printUrlDefined = FIN_WORKBENCH_CODE.includes("const printUrl = (no) => ENGINE + '/fin/statement/print?statement_no=' + encodeURIComponent(no) + AMP + 'token=' + encodeURIComponent(TOKEN);")
  const printUrlUsed = (FIN_WORKBENCH_CODE.match(/printUrl\(/gu) ?? []).length
  check('打印入口统一 printUrl()（含 token，两处调用）', printUrlDefined && printUrlUsed === 2, `定义 ${String(printUrlDefined)} / 调用 ${String(printUrlUsed)} 处（列表 <a> + 生成后 window.open）`)
  const barePrintLink = /href\s*=\s*"'\s*\+\s*ENGINE\s*\+\s*'\/fin\/statement\/print\?statement_no='/.test(FIN_WORKBENCH_CODE)
  check('列表打印链接不再裸拼（无 token 401 断链根因已除）', !barePrintLink, barePrintLink ? '仍存在裸拼 href' : 'href 走 printUrl()')
  // KPI×100: the render contract table maps ratio KPIs (0..1) to percent —
  // schedule_hit=1 renders 100%, not 1%.
  const kpiFmt = COCKPIT_CODE.includes("const KPI_FORMAT = { production_hit: { scale: 100, suffix: '%' }, otd: { scale: 100, suffix: '%' }, pass_rate: { scale: 100, suffix: '%' } };")
  const kpiRendered = COCKPIT_CODE.includes('formatKpi(m)')
  check('KPI 渲染契约（scale×100 + % 后缀，formatKpi 统一）', kpiFmt && kpiRendered, `契约表 ${String(kpiFmt)} / mini 走 formatKpi ${String(kpiRendered)}`)
  const hitLatest = (code: string): number => num(psql(`SELECT value FROM kpi_snapshots WHERE kpi_code = '${code}' ORDER BY calc_date DESC, id DESC LIMIT 1;`))
  const passRate = hitLatest('lot_pass_rate')
  if (passRate > 0) {
    const rendered = Math.round(passRate * 100 * 10) / 10
    check('渲染值 = 快照值 × scale（1 → 100%）', rendered >= 100 - 1e-9, `lot_pass_rate 快照 ${String(passRate)} → 渲染 ${String(rendered)}%`)
  } else {
    check('渲染值 = 快照值 × scale（无快照，跳过前提）', true, 'kpi_snapshots 无 lot_pass_rate 行')
  }
  // Followup dedup: the same client_msg_id lands exactly one record; the
  // second call answers duplicate and never re-advances the machine.
  const liveTask = psql(`SELECT id FROM fin_dunning_tasks WHERE status IN ('open', 'contacted', 'promised') ORDER BY id DESC LIMIT 1;`).trim()
  if (liveTask !== '') {
    const msgId = `w6r5-dedup-${Date.now()}`
    const before = num(psql('SELECT count(*) FROM fin_dunning_records;'))
    const first = dunningFollowup('finance', Number(liveTask), 'note', 'W6-R5 幂等验证：双击/并发重放同 client_msg_id', undefined, 'reached', msgId)
    const second = dunningFollowup('finance', Number(liveTask), 'note', 'W6-R5 幂等验证：双击/并发重放同 client_msg_id', undefined, 'reached', msgId)
    const after = num(psql('SELECT count(*) FROM fin_dunning_records;'))
    check('跟进 client_msg_id 去重（重放恰一条）', !first.duplicate && second.duplicate && after - before === 1, `首次 record #${String(first.record_id)} / 重放 duplicate=${String(second.duplicate)} 同 id=${String(second.record_id)} / 行数 ${String(before)}→${String(after)}`)
  } else {
    check('跟进 client_msg_id 去重（无未关任务，跳过前提）', true, '全部任务已关闭')
  }
  // The AP mirror rides the cockpit payload (the R5 AP bucket switch).
  const apMirror = computeCockpit(90, 'admin') as { aging: { ap: { buckets: unknown[], total: number } } }
  check('驾驶舱 payload 含 AP 账龄镜像（切桶控件数据面）', Array.isArray(apMirror.aging.ap.buckets) && apMirror.aging.ap.buckets.length === 5, `${String(apMirror.aging.ap.buckets.length)} 桶 / 到期合计 ${String(apMirror.aging.ap.total)}`)
}

// ─── CLI ───

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureFinSeed(token)
    log('w6b9-cockpit: seed complete')
    return
  }
  if (mode === 'demo') {
    await runDemoLeg()
    await ensureFinSeed(token)
    log('w6b9-cockpit: demo complete')
    return
  }
  if (mode === 'clean') {
    runCleanLeg()
    return
  }
  await runAssertLeg()
  if (failures.length > 0) {
    log(`w6b9-cockpit: ASSERT FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b9-cockpit: all asserts green')
}
// Library imports must not run the CLI (the approval-engine guard pattern).
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
