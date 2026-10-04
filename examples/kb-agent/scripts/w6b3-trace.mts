/**
 * W6-B3: the food-compliance traceability base (plans/plan-w6.zh.md §B3).
 *
 * One anchor, both directions, layered swimlanes — never a tree. The lineage
 * model is two PG views over the live business tables: v_trace_nodes (one row
 * per supplier / receipt / lot / MO / SO / unlinked shipment / customer, the
 * layer column is the swimlane) and v_trace_edges (one row per material-flow
 * hop: po_receive / receipt_lot / lot_supplier / issue / completion /
 * shipment / ship_unlinked / sold). The same graph logic is re-implemented in
 * the trace page's JSBlock (NocoBase collections cannot ride a raw SQL view),
 * and --assert proves the two agree by counting closures against the
 * recursive-CTE SQL (the kpi-run --trace gold standard's data, same wiring:
 * ISSUE_WIP legs carry the component lots, completions mint the FG lots,
 * SHIPMENT_SO legs reach the customers).
 *
 * --migrate is the data-completion leg of the plan: wms_receipts.lot_no text
 * gets a real wms_receipts.lot_id FK (backfilled, orphans asserted zero — the
 * plan's ⑥), and completions without a lot_no inherit a fresh wms_lots row
 * with the four dates derived from hub_inv_products.shelf_life_days (the
 * plan's ③, expiry inheritance). Lineage stays append-only: the views never
 * write, the backfills run once and report what they touched.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-trace.mts --migrate        # FK backfill + completion expiry inheritance + the two views
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-trace.mts --seed-pages     # 食品合规 group: 效期看板 + 批次追溯 JSBlock pages + role grants
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-trace.mts --trace-up lot=<no>   # the up closure (raw material + suppliers), CLI reconciliation leg
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-trace.mts --trace-down lot=<no> # the down closure (FG lots + SOs + customers)
 *   node --import tsx/esm examples/kb-agent/scripts/w6b3-trace.mts --assert        # the acceptance matrix
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'

const args = process.argv.slice(2)
const mode = args.includes('--migrate') ? 'migrate'
  : args.includes('--seed-pages') ? 'seed-pages'
    : args.includes('--trace-up') ? 'trace-up'
      : args.includes('--trace-down') ? 'trace-down'
        : 'assert'
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))

// ─── the psql runner (same credentials path as every w6 script; the PG zone
// is Asia/Shanghai so CURRENT_DATE is the business day — the reconciliation
// SQL shares it verbatim, one 口径 everywhere) ───

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

// ─── the two lineage views (the recursive-CTE substrate; append-only by
// construction — nothing writes through a view) ───

/**
 * v_trace_nodes: one row per graph node. kind is the swimlane vocabulary;
 * layer is the swimlane order (supplier 0 … customer 6). A lot that is both
 * consumed and produced (rework / re-blend) keeps one row; its kind stays
 * lot_fg when any completion references it (the layer draw then bends the
 * rare left-going edge, which is the honest DAG rendering).
 */
const NODES_VIEW = `
CREATE OR REPLACE VIEW v_trace_nodes AS
SELECT 'sup:' || s.id::text AS node_key, 'supplier' AS kind, s.id AS ref_id,
  COALESCE(s.name, s.code) AS label, NULL::date AS occurred_at, 0 AS layer
FROM srm_suppliers s
WHERE s.id IN (SELECT supplier_id FROM wms_lots WHERE supplier_id IS NOT NULL
    UNION SELECT supplier_id FROM wms_receipts WHERE supplier_id IS NOT NULL)
UNION ALL
SELECT 'rcpt:' || r.id::text, 'receipt', r.id, r.receipt_no, r.received_at, 1
FROM wms_receipts r
UNION ALL
SELECT 'lot:' || l.id::text,
  CASE WHEN EXISTS (SELECT 1 FROM mfg_completions c WHERE c.lot_no = l.lot_no AND COALESCE(c.lot_no, '') <> '')
        OR EXISTS (SELECT 1 FROM wms_movements m WHERE m.move_type = 'RECEIPT_MFG' AND m.lot_id = l.id)
       THEN 'lot_fg' ELSE 'lot_in' END,
  l.id, l.lot_no, l.production_date,
  CASE WHEN EXISTS (SELECT 1 FROM mfg_completions c WHERE c.lot_no = l.lot_no AND COALESCE(c.lot_no, '') <> '')
        OR EXISTS (SELECT 1 FROM wms_movements m WHERE m.move_type = 'RECEIPT_MFG' AND m.lot_id = l.id)
       THEN 4 ELSE 2 END
FROM wms_lots l
UNION ALL
SELECT 'mo:' || o.id::text, 'mo', o.id, o.code, o.released_at, 3
FROM mfg_orders o
WHERE o.id IN (SELECT mo_id FROM mfg_material_issues UNION SELECT mo_id FROM mfg_completions)
UNION ALL
SELECT 'so:' || o.id::text, 'so', o.id, o.code, o.shipped_at, 5
FROM so_orders o
WHERE o.id IN (SELECT s2.id FROM so_orders s2
    JOIN wms_movements m ON m.move_type = 'SHIPMENT_SO' AND m.doc_no = s2.code)
UNION ALL
SELECT 'ship:' || d.doc_no, 'shipment', NULL, d.doc_no, d.biz_date, 5
FROM (SELECT DISTINCT doc_no, max(biz_date) AS biz_date FROM wms_movements WHERE move_type = 'SHIP' GROUP BY doc_no) d
UNION ALL
SELECT 'cust:' || c.id::text, 'customer', c.id, c.name, NULL::date, 6
FROM crm_customers c
WHERE c.id IN (SELECT o.customer_id FROM so_orders o JOIN wms_movements m ON m.move_type = 'SHIPMENT_SO' AND m.doc_no = o.code WHERE o.customer_id IS NOT NULL);`

/**
 * v_trace_edges: one row per material-flow hop. ISSUE_WIP legs come in ±
 * pairs; the minus leg is the stock-out that feeds the MO (the kpi-run
 * --trace wiring: the movement row, not the issue row, carries the lot).
 * SHIP legs that match no SO become ship_unlinked edges into a shipment
 * node — the visible broken-chain signal, not a hidden drop.
 */
const EDGES_VIEW = `
CREATE OR REPLACE VIEW v_trace_edges AS
SELECT 'sup:' || r.supplier_id::text AS from_key, 'rcpt:' || r.id::text AS to_key,
  'po_receive' AS edge_type, r.qty, COALESCE(po.code, r.source_no) AS doc_no, r.received_at AS occurred_at
FROM wms_receipts r LEFT JOIN pur_orders po ON po.id = r.po_id
WHERE r.supplier_id IS NOT NULL
UNION ALL
SELECT 'rcpt:' || r.id::text, 'lot:' || l.id::text, 'receipt_lot', r.qty, r.receipt_no, r.received_at
FROM wms_receipts r JOIN wms_lots l ON l.id = r.lot_id
UNION ALL
SELECT 'sup:' || l.supplier_id::text, 'lot:' || l.id::text, 'lot_supplier', NULL::double precision, NULL, l.production_date
FROM wms_lots l
WHERE l.supplier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM wms_receipts r WHERE r.lot_id = l.id)
UNION ALL
SELECT 'lot:' || m.lot_id::text, 'mo:' || i.mo_id::text, 'issue', ABS(m.qty), m.doc_no, m.biz_date
FROM wms_movements m JOIN mfg_material_issues i ON i.code = m.doc_no
WHERE m.move_type = 'ISSUE_WIP' AND m.qty < 0
UNION ALL
SELECT 'mo:' || c.mo_id::text, 'lot:' || l.id::text, 'completion', c.qty, c.code, c.completed_at
FROM mfg_completions c JOIN wms_lots l ON l.lot_no = c.lot_no
WHERE COALESCE(c.lot_no, '') <> ''
UNION ALL
SELECT 'lot:' || m.lot_id::text, 'so:' || o.id::text, 'shipment', ABS(m.qty), m.doc_no, m.biz_date
FROM wms_movements m JOIN so_orders o ON o.code = m.doc_no
WHERE m.move_type = 'SHIPMENT_SO'
UNION ALL
SELECT 'lot:' || m.lot_id::text, 'ship:' || m.doc_no, 'ship_unlinked', ABS(m.qty), m.doc_no, m.biz_date
FROM wms_movements m
WHERE m.move_type = 'SHIP'
  AND NOT EXISTS (SELECT 1 FROM so_orders o WHERE o.code = m.doc_no)
UNION ALL
SELECT 'so:' || o.id::text, 'cust:' || o.customer_id::text, 'sold', NULL::double precision, o.code, o.shipped_at
FROM so_orders o
WHERE o.customer_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM wms_movements m WHERE m.move_type = 'SHIPMENT_SO' AND m.doc_no = o.code);`

/** The recursive-closure CTE body the trace legs and the recall scoping share (direction-templated). */
const closureCte = (anchorKey: string, direction: 'up' | 'down'): string => {
  const [fromCol, toCol] = direction === 'down' ? ['from_key', 'to_key'] : ['to_key', 'from_key']
  return `WITH RECURSIVE closure(node_key, depth) AS (
  SELECT ${sqlLit(anchorKey)}, 0
  UNION
  SELECT e.${toCol}, closure.depth + 1
  FROM v_trace_edges e JOIN closure ON e.${fromCol} = closure.node_key
  WHERE closure.depth < 32
) SELECT DISTINCT node_key FROM closure WHERE node_key <> ${sqlLit(anchorKey)}`
}

/** One lot_no → its v_trace_nodes node_key (the lot anchor resolution). */
const lotNodeKey = (lotNo: string): string => {
  const id = psql(`SELECT id FROM wms_lots WHERE lot_no = ${sqlLit(lotNo)};`).trim()
  if (id === '') throw new Error(`批次 ${lotNo} 不存在（wms_lots 无此 lot_no）`)
  return `lot:${id}`
}

// ─── --migrate: the FK backfill + completion expiry inheritance + the views ───

/** The completion expiry inheritance: one minted lot's four dates from shelf_life_days (Odoo's four-date model, §2.1). completed_at falls back to the MO's released_at then today (the live rows carry NULL completions). */
function inheritCompletionLots(): void {
  const minted = psql(`WITH cand AS (
  SELECT c.id, c.mo_id, c.code, c.qty,
    COALESCE(c.completed_at, mo.released_at, CURRENT_DATE) AS prod_date,
    mo.product_id,
    COALESCE(p.shelf_life_days, 365) AS shelf_days
  FROM mfg_completions c
  JOIN mfg_orders mo ON mo.id = c.mo_id
  JOIN hub_inv_products p ON p.id = mo.product_id
  WHERE COALESCE(c.lot_no, '') = ''
), minted_keys AS (
  SELECT cand.id, 'MFG-' || to_char(cand.prod_date, 'YYYYMMDD') || '-C' || lpad(cand.id::text, 2, '0') AS lot_no, cand.*
  FROM cand
)
INSERT INTO wms_lots (lot_no, production_date, expiry_date, removal_date, alert_date, status, product_id)
SELECT k.lot_no, k.prod_date,
  k.prod_date + k.shelf_days,
  k.prod_date + (k.shelf_days * 0.85)::int,
  k.prod_date + (k.shelf_days * 0.7)::int,
  'quarantined', k.product_id
FROM minted_keys k
WHERE NOT EXISTS (SELECT 1 FROM wms_lots l WHERE l.lot_no = k.lot_no);`).trim()
  const updated = psql(`WITH cand AS (
  SELECT c.id,
    COALESCE(c.completed_at, mo.released_at, CURRENT_DATE) AS prod_date
  FROM mfg_completions c JOIN mfg_orders mo ON mo.id = c.mo_id
  WHERE COALESCE(c.lot_no, '') = ''
)
UPDATE mfg_completions c SET lot_no = 'MFG-' || to_char(x.prod_date, 'YYYYMMDD') || '-C' || lpad(x.id::text, 2, '0')
FROM (SELECT id, prod_date FROM cand) x
WHERE c.id = x.id AND COALESCE(c.lot_no, '') = ''
  AND EXISTS (SELECT 1 FROM wms_lots l WHERE l.lot_no = 'MFG-' || to_char(x.prod_date, 'YYYYMMDD') || '-C' || lpad(x.id::text, 2, '0'));`).trim()
  log(`w6b3-trace: 完工效期继承回填 — 建档 ${minted} / 回填 ${updated}`)
  const fgNoSupplier = Number(psql(`SELECT count(*) FROM wms_lots l WHERE l.supplier_id IS NULL AND EXISTS (SELECT 1 FROM mfg_completions c WHERE c.lot_no = l.lot_no);`).trim())
  if (fgNoSupplier > 0) {
    log(`w6b3-trace: 数据质量提示 — ${String(fgNoSupplier)} 个成品批次档案缺 supplier_id（成品由本厂生产；如需标签供应商行落到具体主体，请在 srm_suppliers 建档生产主体并回填，此前标签印「供应商未维护」占位）`)
  }
}

/**
 * The orphan receipts' lot minting (the 补批次档案 leg): a receipt whose
 * lot_no matches no wms_lots row gets one, four dates derived from
 * shelf_life_days (the product's, or 365 when the row carries no product —
 * status quarantined so the pending review owns the correction). The minted
 * rows are reported, never silent.
 */
function backfillOrphanReceiptLots(): number {
  const minted = psql(`WITH cand AS (
  SELECT r.id, r.lot_no, r.received_at, r.product_id, r.supplier_id,
    COALESCE((SELECT shelf_life_days FROM hub_inv_products p WHERE p.id = r.product_id), 365) AS shelf_days
  FROM wms_receipts r
  WHERE COALESCE(r.lot_no, '') <> ''
    AND NOT EXISTS (SELECT 1 FROM wms_lots l WHERE l.lot_no = r.lot_no)
), ins AS (
  INSERT INTO wms_lots (lot_no, production_date, expiry_date, removal_date, alert_date, status, product_id, supplier_id)
  SELECT cand.lot_no, cand.received_at,
    cand.received_at + cand.shelf_days,
    cand.received_at + (cand.shelf_days * 0.85)::int,
    cand.received_at + (cand.shelf_days * 0.7)::int,
    'quarantined', cand.product_id, cand.supplier_id
  FROM cand
  RETURNING lot_no)
SELECT count(*) FROM ins;`).trim()
  if (minted !== '0') log(`w6b3-trace: 孤儿收货补建批次档案 ${minted} 条（四日期按 shelf_life_days 推导，状态待检）`)
  return Number(minted)
}

/**
 * The whole --migrate leg: orphan-receipt lot minting, the receipts FK
 * backfill (orphans must land zero — the mint above owns the repair, a
 * leftover orphan fails loud), completion expiry inheritance, the two views.
 */
export function migrateTrace(): { receiptsBackfilled: number; orphanReceipts: number } {
  psql(`ALTER TABLE wms_receipts ADD COLUMN IF NOT EXISTS lot_id bigint REFERENCES wms_lots(id);`)
  backfillOrphanReceiptLots()
  const backfilled = psql(`UPDATE wms_receipts r SET lot_id = l.id
FROM wms_lots l WHERE l.lot_no = r.lot_no AND r.lot_id IS NULL AND COALESCE(r.lot_no, '') <> '';`).trim()
  const orphans = Number(psql(`SELECT count(*) FROM wms_receipts r
WHERE COALESCE(r.lot_no, '') <> '' AND NOT EXISTS (SELECT 1 FROM wms_lots l WHERE l.lot_no = r.lot_no);`).trim())
  if (orphans > 0) {
    throw new Error(`wms_receipts 孤儿行 ${String(orphans)} 条（lot_no 无 wms_lots 匹配）——先补批次档案再迁移`)
  }
  inheritCompletionLots()
  psql(NODES_VIEW)
  psql(EDGES_VIEW)
  const nodeCount = psql('SELECT count(*) FROM v_trace_nodes;').trim()
  const edgeCount = psql('SELECT count(*) FROM v_trace_edges;').trim()
  log(`w6b3-trace: views live — v_trace_nodes=${nodeCount} v_trace_edges=${edgeCount}（receipts.lot_id 回填 ${backfilled}，孤儿 0）`)
  return { receiptsBackfilled: Number((backfilled.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0), orphanReceipts: orphans }
}

// ─── the JSBlock vocabulary (the two 食品合规 pages) ───

/**
 * The expiry board JSBlock: KPI band + category × days-bucket heat matrix +
 * click-through lot detail. The regulatory tier rides the same CASE as the
 * B2 scanner (one 口径: shelf ≥365→45, ≥180→20, ≥90→15, ≥30→10, else 3 —
 * the red band is LEAST(fixed 30, regulatory)), and the alert band consumes
 * wfl_alerts expiry rows (open/acknowledged counts per lot) — B2's output is
 * this board's first-class input, never a second scanner.
 */
const EXPIRY_BOARD_CODE = [
  // Probe-verified vocabulary (the h5 bin-map channel): collection access
  // rides FlowResource makeResource/setResourceName/setPageSize/refresh/getData.
  "const mk = async (name, size) => {",
  "  const r = ctx.makeResource('MultiRecordResource');",
  "  r.setResourceName(name);",
  "  r.setPageSize(size);",
  "  await r.refresh();",
  "  return r.getData() || [];",
  "};",
  "const lots = await mk('wms_lots', 500);",
  "const products = await mk('hub_inv_products', 500);",
  "const moves = await mk('wms_movements', 1000);",
  "const alerts = (await mk('wfl_alerts', 500)).filter(a => a.rule_type === 'expiry');",
  // The red-band ceiling reads the B2 configuration center (single source of
  // truth — W6-R3: the fixed 30 was a second scanner in disguise).
  "const expiryRule = (await mk('alert_rules', 50)).find(r => r.rule_type === 'expiry');",
  "const warnDays = Number(expiryRule && expiryRule.params && expiryRule.params.warn_days) > 0 ? Number(expiryRule.params.warn_days) : 30;",
  "const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/\"/g,'&quot;')",
  "const prodOf = {};",
  "for (const p of products) prodOf[p.id] = p;",
  "const onHand = {};",
  "for (const m of moves) onHand[m.lot_id] = (onHand[m.lot_id] || 0) + Number(m.qty || 0);",
  "const today = new Date();",
  "const dayDiff = (d) => d == null ? null : Math.round((new Date(String(d) + 'T00:00:00Z').getTime() - today.getTime()) / 86400000);",
  "const regTier = (pdate, edate) => {",
  "  if (!pdate || !edate) return 45;",
  "  const shelf = Math.round((new Date(edate) - new Date(pdate)) / 86400000);",
  "  if (shelf >= 365) return 45;",
  "  if (shelf >= 180) return 20;",
  "  if (shelf >= 90) return 15;",
  "  if (shelf >= 30) return 10;",
  "  return 3;",
  "};",
  "const alertOf = {};",
  "for (const a of alerts) { if (a.status !== 'resolved') alertOf[a.entity_id] = a; }",
  "const rows = lots.map(l => {",
  "  const p = prodOf[l.product_id] || {};",
  "  const left = dayDiff(l.expiry_date);",
  "  const tier = regTier(l.production_date, l.expiry_date);",
  "  const bucket = left == null ? 'nodate' : left < 0 ? 'expired' : left <= Math.min(warnDays, tier) ? 'critical' : left <= 90 ? 'warn' : 'ok';",
  "  return { lot: l, prod: p, left, tier, bucket,",
  "    qty: onHand[l.id] || 0,",
  "    alert: alertOf[l.id] || null,",
  "    cat: p.category || '未分类', zone: p.temp_zone || '—' };",
  "});",
  "const BUCKETS = [['expired','已过期'],['critical','临期(监管线)'],['warn','30-90天'],['ok','>90天'],['nodate','缺日期']];",
  "const BCOLOR = { expired:['var(--w7-negative-fg)','var(--w7-negative-bg)'], critical:['var(--w7-negative-fg)','var(--w7-negative-bg)'], warn:['var(--w7-critical-fg)','var(--w7-critical-bg)'], ok:['var(--w7-positive-fg)','var(--w7-positive-bg)'], nodate:['var(--w7-neutral-fg)','var(--w7-neutral-bg)'] };",
  "const kpi = { near: 0, expired: 0, week: 0, month: 0, openAlerts: 0 };",
  "for (const r of rows) {",
  "  if (r.bucket === 'expired') { kpi.expired++; kpi.near++; }",
  "  else if (r.bucket === 'critical') { kpi.near++; if (r.left != null && r.left <= 7) kpi.week++; if (r.left != null && r.left <= 30) kpi.month++; }",
  "  if (r.alert) kpi.openAlerts++;",
  "}",
  "const card = (n, label, color) => `<div style=\"flex:1;min-width:120px;background:var(--w7-surface);border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:10px 14px;box-shadow:var(--w7-shadow-card)\"><div style=\"font-size:var(--w7-fs-kpi);font-weight:600;color:${color};font-variant-numeric:tabular-nums\">${n}</div><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-secondary)\">${label}</div></div>`;",
  "const kpiBand = `<div style=\"display:flex;gap:10px;margin:8px 0;flex-wrap:wrap\">`",
  "  + card(kpi.near, '临期+过期批次', 'var(--w7-critical-fg)')",
  "  + card(kpi.expired, '已过期待处置', 'var(--w7-negative-fg)')",
  "  + card(kpi.week, '≤7天到期', 'var(--w7-negative-fg)')",
  "  + card(kpi.month, '≤30天到期', 'var(--w7-critical-fg)')",
  "  + card(kpi.openAlerts, '效期预警未关闭(B2)', 'var(--w7-informational-fg)')",
  "  + `</div>`;",
  // The heat matrix: category rows × bucket columns, cell = lot count (hover = lot list).
  "const cats = [...new Set(rows.map(r => r.cat))].sort();",
  "let matrix = '';",
  "window.__expiryDrill = null;",
  "for (const cat of cats) {",
  "  let cells = '';",
  "  for (const [bk, bl] of BUCKETS) {",
  "    const hit = rows.filter(r => r.cat === cat && r.bucket === bk);",
  "    const strong = bk === 'expired' || bk === 'critical';",
  "    cells += `<td style=\"padding:0\"><div data-expiry-cell=\"${cat}|${bk}\" style=\"margin:2px;min-width:86px;height:34px;border-radius:var(--w7-radius-control);display:flex;align-items:center;justify-content:center;cursor:${hit.length ? 'pointer' : 'default'};background:${hit.length ? BCOLOR[bk][1] : 'var(--w7-surface-2)'};color:${hit.length ? BCOLOR[bk][0] : 'var(--w7-text-weak)'};font-weight:${strong && hit.length ? 700 : 400}\" title=\"${esc(hit.map(r => r.lot.lot_no + '(' + (r.left == null ? '?' : r.left) + '天)').join('、'))}\">${hit.length}</div></td>`;",
  "  }",
  "  matrix += `<tr><th style=\"text-align:left;padding:4px 10px 4px 2px;font-weight:600\">${cat}<div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak);font-weight:400\">温区 ${[...new Set(rows.filter(r => r.cat === cat).map(r => r.zone))].join('/')}</div></th>${cells}</tr>`;",
  "}",
  "const legend = BUCKETS.map(([bk, bl]) => `<span style=\"color:${BCOLOR[bk][0]}\">■ ${bl}</span>`).join('　') + `　<span style=\"color:var(--w7-text-weak)\">红档=LEAST(${warnDays},监管分档)（≥1年→45 / 半年→20 / 90天→15 / 30天→10 / 更短→3）——红线天数读自 alert_rules.warn_days，与 B2 规则引擎同口径</span>`;",
  "const table = rows.map(r => `<tr data-expiry-row=\"1\"><td style=\"padding:2px 8px\">${esc(r.lot.lot_no)}</td><td style=\"padding:2px 8px\">${esc(r.prod.name || '—')}</td><td style=\"padding:2px 8px\">${String(r.lot.production_date || '—')}</td><td style=\"padding:2px 8px\">${String(r.lot.expiry_date || '—')}</td><td style=\"padding:2px 8px;color:${BCOLOR[r.bucket][0]};font-weight:${r.bucket === 'expired' || r.bucket === 'critical' ? 700 : 400}\">${r.left == null ? '缺' : r.left + '天'}</td><td style=\"padding:2px 8px\">${r.qty}</td><td style=\"padding:2px 8px\">${esc(r.lot.status || '—')}</td><td style=\"padding:2px 8px\">${r.alert ? (r.alert.status === 'open' ? '🔴未处理' : '🟠已认领') : '—'}</td></tr>`).join('');",
  "const detailTable = `<div id=\"expiry-drill\" style=\"margin-top:10px;display:none\"><div style=\"font-weight:600;margin:6px 0\" id=\"expiry-drill-title\"></div><table style=\"border-collapse:collapse;font-size:var(--w7-fs-caption);width:100%\"><thead><tr style=\"color:var(--w7-text-secondary)\"><th style=\"text-align:left\">批次</th><th style=\"text-align:left\">品名</th><th style=\"text-align:left\">生产日期</th><th style=\"text-align:left\">到期日</th><th style=\"text-align:left\">剩余</th><th style=\"text-align:left\">在库</th><th style=\"text-align:left\">状态</th><th style=\"text-align:left\">预警</th></tr></thead><tbody id=\"expiry-drill-body\">${table}</tbody></table></div>`;",
  "const html = `<div data-w6b3=\"expiry-board\" style=\"padding:8px\">`",
  "  + kpiBand",
  "  + `<div style=\"font-size:var(--w7-fs-caption);margin:6px 0\">${legend}</div>`",
  "  + `<table style=\"border-collapse:separate\"><thead><tr><th></th>${BUCKETS.map(([, bl]) => `<th style=\"padding:2px 6px;font-size:var(--w7-fs-caption);color:var(--w7-text-secondary)\">${bl}</th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table>`",
  "  + `<div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak);margin-top:4px\">点击色格下钻该品类该档批次清单；「在库」= wms_movements 台账聚合（Σ流水）</div>`",
  "  + detailTable",
  "  + `</div>`;",
  "ctx.render(html);",
  "setTimeout(() => {",
  "  const drill = document.querySelector('#expiry-drill');",
  "  const title = document.querySelector('#expiry-drill-title');",
  "  const body = document.querySelector('#expiry-drill-body');",
  "  if (!drill) return;",
  "  document.querySelectorAll('[data-expiry-cell]').forEach(cell => {",
  "    cell.addEventListener('click', () => {",
  "      const [cat, bk] = cell.getAttribute('data-expiry-cell').split('|');",
  "      drill.style.display = 'block';",
  "      title.textContent = `下钻：${cat} · ${BUCKETS.find(b => b[0] === bk)[1]}`;",
  "      body.innerHTML = table;",
  "      for (const tr of body.querySelectorAll('tr[data-expiry-row]')) tr.style.display = 'none';",
  "      const catRows = rows.filter(r => r.cat === cat && r.bucket === bk);",
  "      const lotNos = new Set(catRows.map(r => r.lot.lot_no));",
  "      for (const tr of body.querySelectorAll('tr[data-expiry-row]')) {",
  "        const first = tr.querySelector('td');",
  "        if (first && lotNos.has(first.textContent)) tr.style.display = '';",
  "      }",
  "    });",
  "  });",
  "}, 0);",
].join('\n')

/**
 * The trace-DAG JSBlock: layered swimlanes (supplier / receipt / lot-in / MO
 * / lot-FG / SO+shipment / customer), both-direction closure from one lot
 * anchor, a recall-scope switch that highlights the forward closure and dims
 * the rest, a side panel with the affected lists, and the explicit
 * broken-chain notice («链路不完整：缺 XX 环节» — a data-quality signal, not
 * an error). The footer prints the node/edge counts for the reconciliation
 * legs. The graph build mirrors v_trace_edges verbatim (same wiring columns;
 * --assert proves the counts agree).
 */
const TRACE_DAG_CODE = [
  "const mk = async (name, size) => {",
  "  const r = ctx.makeResource('MultiRecordResource');",
  "  r.setResourceName(name);",
  "  r.setPageSize(size);",
  "  await r.refresh();",
  "  return r.getData() || [];",
  "};",
  "const [lots, moves, receipts, mos, comps, issues, sos, sups, custs, prods] = await Promise.all([",
  "  mk('wms_lots', 500), mk('wms_movements', 1000), mk('wms_receipts', 500),",
  "  mk('mfg_orders', 500), mk('mfg_completions', 500), mk('mfg_material_issues', 500),",
  "  mk('so_orders', 500), mk('srm_suppliers', 500), mk('crm_customers', 500), mk('hub_inv_products', 500),",
  "]);",
  "const prodName = {}; for (const p of prods) prodName[p.id] = p.name || '';",
  "const lotById = {}; for (const l of lots) lotById[l.id] = l;",
  "const supById = {}; for (const s of sups) supById[s.id] = s;",
  "const custById = {}; for (const c of custs) custById[c.id] = c;",
  "const moById = {}; for (const o of mos) moById[o.id] = o;",
  "const soByCode = {}; for (const o of sos) soByCode[o.code] = o;",
  "const issueByCode = {}; for (const i of issues) issueByCode[i.code] = i;",
  // Build the same node/edge sets as the SQL views (one wiring, two runtimes).
  "const nodes = new Map(), edges = [];",
  "const node = (key, kind, label, sub, qty, status) => {",
  "  if (!nodes.has(key)) nodes.set(key, { key, kind, label, sub: sub || '', qty: qty == null ? '' : qty, status: status || '' });",
  "  return nodes.get(key);",
  "};",
  "const edge = (from, to, etype, qty, doc) => edges.push({ from, to, etype, qty: qty == null ? '' : Math.abs(qty), doc: doc || '' });",
  "const isFgLot = (l) => comps.some(c => c.lot_no && c.lot_no === l.lot_no) || moves.some(m => m.move_type === 'RECEIPT_MFG' && m.lot_id === l.id);",
  "for (const l of lots) node('lot:' + l.id, isFgLot(l) ? 'lot_fg' : 'lot_in', l.lot_no, prodName[l.product_id] || '', null, l.status);",
  "for (const r of receipts) {",
  "  node('rcpt:' + r.id, 'receipt', r.receipt_no, (supById[r.supplier_id] || {}).name || '', r.qty, r.status);",
  "  if (r.supplier_id != null) { node('sup:' + r.supplier_id, 'supplier', (supById[r.supplier_id] || {}).name || ('sup#' + r.supplier_id), '', null, ''); edge('sup:' + r.supplier_id, 'rcpt:' + r.id, 'po_receive', r.qty, r.source_no || ''); }",
  "  if (r.lot_id != null && lotById[r.lot_id]) edge('rcpt:' + r.id, 'lot:' + r.lot_id, 'receipt_lot', r.qty, r.receipt_no);",
  "}",
  "for (const l of lots) if (l.supplier_id != null && !receipts.some(r => r.lot_id === l.id)) {",
  "  node('sup:' + l.supplier_id, 'supplier', (supById[l.supplier_id] || {}).name || ('sup#' + l.supplier_id), '', null, '');",
  "  edge('sup:' + l.supplier_id, 'lot:' + l.id, 'lot_supplier', null, '');",
  "}",
  "for (const m of moves) if (m.move_type === 'ISSUE_WIP' && Number(m.qty) < 0) {",
  "  const iss = issueByCode[m.doc_no];",
  "  if (iss && m.lot_id != null) { node('mo:' + iss.mo_id, 'mo', (moById[iss.mo_id] || {}).code || ('mo#' + iss.mo_id), prodName[(moById[iss.mo_id] || {}).product_id] || '', iss.qty, (moById[iss.mo_id] || {}).doc_status); edge('lot:' + m.lot_id, 'mo:' + iss.mo_id, 'issue', m.qty, m.doc_no); }",
  "}",
  "for (const c of comps) if (c.lot_no) {",
  "  const l = lots.find(x => x.lot_no === c.lot_no);",
  "  if (l) { node('mo:' + c.mo_id, 'mo', (moById[c.mo_id] || {}).code || ('mo#' + c.mo_id), prodName[(moById[c.mo_id] || {}).product_id] || '', c.qty, (moById[c.mo_id] || {}).doc_status); edge('mo:' + c.mo_id, 'lot:' + l.id, 'completion', c.qty, c.code); }",
  "}",
  "for (const m of moves) if (m.move_type === 'SHIPMENT_SO') {",
  "  const so = soByCode[m.doc_no];",
  "  if (so && m.lot_id != null) { node('so:' + so.id, 'so', so.code, (custById[so.customer_id] || {}).name || '', null, so.doc_status); edge('lot:' + m.lot_id, 'so:' + so.id, 'shipment', m.qty, m.doc_no); }",
  "}",
  "for (const m of moves) if (m.move_type === 'SHIP' && !soByCode[m.doc_no]) {",
  "  if (m.lot_id != null) { node('ship:' + m.doc_no, 'shipment', m.doc_no, '未关联销售订单', m.qty, ''); edge('lot:' + m.lot_id, 'ship:' + m.doc_no, 'ship_unlinked', m.qty, m.doc_no); }",
  "}",
  "for (const o of sos) if (o.customer_id != null && moves.some(m => m.move_type === 'SHIPMENT_SO' && m.doc_no === o.code)) {",
  "  node('so:' + o.id, 'so', o.code, (custById[o.customer_id] || {}).name || '', null, o.doc_status);",
  "  node('cust:' + o.customer_id, 'customer', (custById[o.customer_id] || {}).name || ('cust#' + o.customer_id), '', null, '');",
  "  edge('so:' + o.id, 'cust:' + o.customer_id, 'sold', null, o.code);",
  "}",
  // The closure BFS (direction-templated, the same rule as the SQL CTE).
  "const closure = (anchor, dir) => {",
  "  const seen = new Set([anchor]), queue = [anchor];",
  "  while (queue.length) {",
  "    const cur = queue.shift();",
  "    for (const e of edges) {",
  "      const next = dir === 'down' ? (e.from === cur ? e.to : null) : (e.to === cur ? e.from : null);",
  "      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }",
  "    }",
  "  }",
  "  seen.delete(anchor);",
  "  return seen;",
  "};",
  "const LAYERS = [['supplier','供应商'],['receipt','收货'],['lot_in','原料/在库批次'],['mo','生产工单'],['lot_fg','成品批次'],['so','销售订单'],['shipment','发运'],['customer','客户']];",
  "const KCOLOR = { supplier:'var(--w7-chart-4)', receipt:'var(--w7-chart-3)', lot_in:'var(--w7-chart-1)', mo:'var(--w7-chart-2)', lot_fg:'var(--w7-primary)', so:'var(--w7-informational-fg)', shipment:'var(--w7-neutral-fg)', customer:'var(--w7-primary-active)' };",
  "const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/\"/g,'&quot;')",
  // The renderer: swimlane columns, anchor highlighted, recall mode = forward closure red + rest dimmed.
  "const render = () => {",
  "  const sel = document.querySelector('[data-trace-anchor]');",
  "  const dirSel = document.querySelector('[data-trace-dir]');",
  "  const recallSel = document.querySelector('[data-trace-recall]');",
  "  if (!sel) return;",
  "  const lotNo = sel.value;",
  "  const anchorLot = lots.find(l => l.lot_no === lotNo);",
  "  const box = document.querySelector('#trace-dag-svg');",
  "  const side = document.querySelector('#trace-side');",
  "  const miss = document.querySelector('#trace-missing');",
  "  if (!anchorLot) { box.innerHTML = '<div style=\"padding:20px;color:var(--w7-text-weak)\">选择一个批次开始追溯</div>'; side.innerHTML = ''; miss.style.display = 'none'; return; }",
  "  const anchor = 'lot:' + anchorLot.id;",
  "  const dir = dirSel ? dirSel.value : 'both';",
  "  const upSet = dir === 'down' ? new Set() : closure(anchor, 'up');",
  "  const downSet = dir === 'up' ? new Set() : closure(anchor, 'down');",
  "  const active = new Set([anchor, ...upSet, ...downSet]);",
  "  const recall = recallSel != null && String(recallSel.value) === 'on';",
  "  const hlSet = recall ? new Set([anchor, ...closure(anchor, 'down')]) : active;",
  "  const visNodes = [...nodes.values()].filter(n => active.has(n.key));",
  "  const visEdges = edges.filter(e => active.has(e.from) && active.has(e.to));",
  "  const layerNo = {}; LAYERS.forEach(([, label], i) => layerNo[label] = i);",
  // W6-R3: swimlane columns must be integers — the 5.5 half-column used to
  // index colCount[5.5] (undefined * 78 = NaN y) and poison the SVG.
  "  const kindLayer = (n) => Math.max(0, LAYERS.findIndex(([k]) => k === n.kind));",
  "  const colCount = new Array(8).fill(0);",
  "  const pos = {};",
  "  for (const n of visNodes) { const li = kindLayer(n); pos[n.key] = { x: li * 230, y: colCount[li] * 78 }; colCount[li]++; }",
  "  const W = 8 * 230 + 40, H = Math.max(...colCount) * 78 + 130;",
  "  let svg = `<svg viewBox=\"0 0 ${W} ${H}\" style=\"width:100%;height:auto;background:var(--w7-surface-2);border-radius:var(--w7-radius-card)\">`;",
  "  for (let i = 0; i < LAYERS.length; i++) {",
  "    svg += `<rect x=\"${i * 230 + 10}\" y=\"34\" width=\"214\" height=\"${H - 70}\" rx=\"8\" style=\"fill:var(--w7-surface);stroke:var(--w7-border)\"/>`;",
  "    svg += `<text x=\"${i * 230 + 20}\" y=\"24\" style=\"font-size:var(--w7-fs-body);font-weight:600;fill:var(--w7-text-secondary)\">${LAYERS[i][1]}</text>`;",
  "  }",
  "  const dimNode = (n) => recall && !hlSet.has(n.key);",
  "  const dimEdge = (e) => recall && !(hlSet.has(e.from) && hlSet.has(e.to));",
  "  for (const e of visEdges) {",
  "    const a = pos[e.from], b = pos[e.to];",
  "    if (!a || !b) continue;",
  "    const x1 = a.x + 128, y1 = a.y + 58, x2 = b.x + 18, y2 = b.y + 58;",
  "    const mx = (x1 + x2) / 2;",
  "    const hot = recall && hlSet.has(e.from) && hlSet.has(e.to);",
  "    svg += `<path d=\"M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}\" fill=\"none\" style=\"stroke:${hot ? 'var(--w7-negative-fg)' : 'var(--w7-border-strong)'};stroke-width:${hot ? 2.5 : 1.4}\" ${dimEdge(e) ? 'opacity=\"0.25\"' : ''} marker-end=\"url(#arrow${hot ? '-hot' : ''})\"><title>${esc(e.etype)} ${esc(e.doc)} ${esc(e.qty)}</title></path>`;",
  "  }",
  "  svg += `<defs><marker id=\"arrow\" markerWidth=\"8\" markerHeight=\"6\" refX=\"7\" refY=\"3\" orient=\"auto\"><path d=\"M0 0 L8 3 L0 6 z\" style=\"fill:var(--w7-border-strong)\"/></marker><marker id=\"arrow-hot\" markerWidth=\"8\" markerHeight=\"6\" refX=\"7\" refY=\"3\" orient=\"auto\"><path d=\"M0 0 L8 3 L0 6 z\" style=\"fill:var(--w7-negative-fg)\"/></marker></defs>`;",
  "  for (const n of visNodes) {",
  "    const p = pos[n.key];",
  "    const isAnchor = n.key === anchor;",
  "    const stroke = isAnchor ? 'var(--w7-primary)' : recall && hlSet.has(n.key) ? 'var(--w7-negative-fg)' : KCOLOR[n.kind];",
  "    svg += `<g opacity=\"${dimNode(n) ? 0.25 : 1}\"><rect x=\"${p.x + 18}\" y=\"${p.y + 34}\" width=\"210\" height=\"48\" rx=\"8\" style=\"fill:var(--w7-surface);stroke:${stroke};stroke-width:${isAnchor ? 2.5 : 1.5}\"><title>${esc(n.key)}</title></rect>`",
  "      + `<text x=\"${p.x + 28}\" y=\"${p.y + 52}\" style=\"font-size:var(--w7-fs-caption);font-weight:600;fill:var(--w7-text)\">${esc(n.label).slice(0, 18)}</text>`",
  "      + `<text x=\"${p.x + 28}\" y=\"${p.y + 68}\" style=\"font-size:var(--w7-fs-caption);fill:var(--w7-text-weak)\">${esc(n.sub).slice(0, 16)}${n.qty === '' ? '' : ' · ' + esc(n.qty)}${n.status ? ' · ' + esc(n.status) : ''}</text>`",
  "      + `<circle cx=\"${p.x + 214}\" cy=\"${p.y + 44}\" r=\"5\" style=\"fill:${KCOLOR[n.kind]}\"/></g>`;",
  "  }",
  "  svg += '</svg>';",
  "  box.innerHTML = svg;",
  // The broken-chain notice: which swimlanes the anchor's own chain never reaches.
  // The broken-chain notice is direction-scoped (W6-R3): the backward view
  // only audits upstream lanes, the forward view only downstream ones — a
  // one-directional view must not report the other side's absence.
  "  const reachedKinds = new Set(visNodes.map(n => n.kind));",
  "  const anchorIsFg = nodes.get(anchor).kind === 'lot_fg';",
  "  const expectUp = anchorIsFg ? ['supplier', 'receipt', 'mo'] : [];",
  "  const expectDown = anchorIsFg ? ['so', 'customer'] : ['mo', 'lot_fg', 'so', 'customer'];",
  "  const expect = dir === 'up' ? expectUp : dir === 'down' ? expectDown : expectUp.concat(expectDown);",
  "  const missing = expect.filter(k => !reachedKinds.has(k) && !(k === 'receipt' && reachedKinds.has('supplier')));",
  "  miss.style.display = missing.length ? 'block' : 'none';",
  "  miss.innerHTML = '链路不完整：缺 <b>' + missing.map(k => LAYERS.find(l => l[0] === k)[1]).join('、') + '</b> 环节（数据质量信号——补录收货/完工/发运单据后自动接通）';",
  // The recall-scope side panel (affected FG lots / shipments / customers / on-hand).
  "  if (recall) {",
  "    const fg = visNodes.filter(n => n.kind === 'lot_fg' && hlSet.has(n.key));",
  "    const so = visNodes.filter(n => n.kind === 'so' && hlSet.has(n.key));",
  "    const cust = visNodes.filter(n => n.kind === 'customer' && hlSet.has(n.key));",
  "    side.innerHTML = `<div style=\"font-weight:600;color:var(--w7-negative-fg)\">召回范围（正向波及）</div>`",
  "      + `<div style=\"margin:4px 0\">受影响成品批次 <b>${fg.length}</b>：${fg.map(n => esc(n.label)).join('、') || '—'}</div>`",
  "      + `<div style=\"margin:4px 0\">已发运订单 <b>${so.length}</b>：${so.map(n => esc(n.label)).join('、') || '—'}</div>`",
  "      + `<div style=\"margin:4px 0\">波及客户 <b>${cust.length}</b>：${cust.map(n => esc(n.label)).join('、') || '—'}</div>`",
  "      + `<div style=\"margin:4px 0\"><button data-recall-create=\"1\" data-lot=\"${esc(lotNo)}\" style=\"background:var(--w7-negative-fg);color:#fff;border:none;border-radius:var(--w7-radius-control);padding:4px 12px;cursor:pointer\">对 ${esc(lotNo)} 发起召回</button> <span data-recall-create-out style=\"font-size:var(--w7-fs-caption)\"></span></div>`",
  "      + `<div style=\"margin:4px 0;font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">按钮走引擎 POST /recall/create（会话身份=当前登录用户，quality/admin 白名单；RC 单生成并通知责任人）；台账与流转见 食品合规→召回管理</div>`;",
  "  } else {",
  "    side.innerHTML = `<div style=\"font-weight:600\">追溯概况</div><div style=\"margin:4px 0\">锚点 <b>${esc(lotNo)}</b>（${nodes.get(anchor).kind === 'lot_fg' ? '成品批次·反向' : '原料批次·正向'}）</div><div>上游节点 ${upSet.size} · 下游节点 ${downSet.size}</div><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">勾选「召回范围」高亮正向波及链并统计成品/订单/客户清单</div>`;",
  "  }",
  "  const foot = document.querySelector('#trace-count');",
  "  if (foot) foot.textContent = `节点 ${String(visNodes.length)}（去重 DAG，非树形展开） · 边 ${String(visEdges.length)}`;",
  "};",
  "const fgFirst = [...lots].sort((a, b) => (isFgLot(b) ? 1 : 0) - (isFgLot(a) ? 1 : 0));",
  "const opts = fgFirst.map(l => `<option value=\"${esc(l.lot_no)}\">${esc(l.lot_no)}${isFgLot(l) ? '（成品）' : ''}</option>`).join('');",
  "const ctrl = `<div style=\"display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px\">`",
  "  + `<label>锚点批次 <select data-trace-anchor>${opts}</select></label>`",
  "  + `<label>方向 <select data-trace-dir><option value=\"both\">双向</option><option value=\"down\">正向（原料→客户）</option><option value=\"up\">反向（成品→供应商）</option></select></label>`",
  "  + `<label>召回范围 <select data-trace-recall><option value=\"off\">关</option><option value=\"on\">开（正向波及高亮）</option></select></label>`",
  "  + `</div>`;",
  "ctx.render(`<div data-w6b3=\"trace-dag\" style=\"padding:8px\">`",
  "  + ctrl",
  "  + `<div id=\"trace-missing\" style=\"display:none;background:var(--w7-critical-bg);border:1px solid var(--w7-critical-fg);border-radius:var(--w7-radius-card);padding:8px 12px;margin:4px 0;font-size:var(--w7-fs-body)\"></div>`",
  "  + `<div id=\"trace-dag-svg\"></div>`",
  "  + `<div style=\"display:flex;gap:16px;align-items:baseline\"><div id=\"trace-count\" style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\"></div></div>`",
  "  + `<div id=\"trace-side\" style=\"margin-top:8px;background:var(--w7-surface);border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px 12px;font-size:var(--w7-fs-body)\"></div>`",
  "  + `</div>`);",
  // All three controls are selects: the select change channel is the one the
  // embedded context delivers reliably (a checkbox's browser-dispatched
  // change did not reach this listener — live W6-B3 finding).
  "setTimeout(() => { render();",
  "  for (const s of document.querySelectorAll('[data-trace-anchor],[data-trace-dir],[data-trace-recall]')) {",
  "    s.addEventListener('change', render);",
  "  }",
  // The recall-create button (W6-R3): resolves the signed-in username from
  // the platform session, then posts the engine's /recall/create with that
  // session's bearer — the actor is the credential-derived identity, never a
  // self-reported one.
  "  const recallBtn = document.querySelector('[data-recall-create]');",
  "  if (recallBtn) recallBtn.addEventListener('click', async () => {",
  "    const out = document.querySelector('[data-recall-create-out]');",
  "    if (out) out.textContent = '发起中…';",
  "    const engine = String(window.__W6_ENGINE_BASE__ || 'http://127.0.0.1:13110');",
  "    const token = localStorage.getItem('NOCOBASE_TOKEN') || '';",
  "    try {",
  "      const me = await fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + token } }).then(r => r.json());",
  "      const username = String((me && me.data && me.data.username) || '');",
  "      const lot = recallBtn.getAttribute('data-lot') || '';",
  "      const resp = await fetch(engine + '/recall/create', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ lot_no: lot, reason: '追溯侧栏发起（召回范围确认）', owner: username }) });",
  "      const body = await resp.json().catch(() => ({}));",
  "      if (out) out.textContent = resp.ok ? '已生成 ' + String(body.code || '') + '（通知已发 ' + username + '）' : '被拒（HTTP ' + resp.status + '）：' + String(body.error || '');",
  "    } catch (err) { if (out) out.textContent = '发起失败：' + String(err); }",
  "  });",
  "}, 0);",
].join('\n')

/** Lay one JSBlock page (group + flowPage + tabs + grid + the block, the B2 spine). */
async function ensureJsBlockPage(token: string, opts: {
  groupTitle: string; groupIcon: string; title: string; icon: string; sort: number
  description: string; code: string; label: string
}): Promise<string> {
  const routes = await listRoutes(token, 'W6B3')
  let groupId = routes.find(row => row.title === opts.groupTitle && row.type === 'group')?.id
  if (groupId === undefined) {
    groupId = Number((await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: opts.groupTitle, icon: opts.groupIcon, type: 'group' }) as { id?: unknown }).id ?? 0)
    log(`w6b3-trace: menu group ${opts.groupTitle} created`)
  }
  const existing = routes.find(row => row.title === opts.title && row.type === 'flowPage')
  if (existing !== undefined) {
    // Code drift upgrade: a JSBlock whose code changed is destroyed with its
    // page and relaid (the page-route destroy cascades the blocks; a partial
    // stepParams write risks clobbering the block's other settings — the W5
    // lesson). Same code = kept as-is (idempotent).
    const tab = routes.find(row => row.parentId === existing.id && row.type === 'tabs')
    let stale = false
    if (tab?.schemaUid != null) {
      const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
      if (grid?.uid != null) {
        const models = await listFlowModels(token, 'W6B3-upgrade')
        const block = models.find(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid))
        const current = String(block?.stepParams?.jsSettings?.runJs?.code ?? '')
        stale = block === undefined || current !== opts.code
      }
    }
    if (!stale) {
      log(`w6b3-trace: v2 page ${opts.title} exists (kept)`)
      return String(existing.id)
    }
    await dataOf(token, 'POST', `/api/desktopRoutes:destroy?filter=${encodeURIComponent(JSON.stringify({ id: { $eq: existing.id } }))}`, {})
    log(`w6b3-trace: v2 page ${opts.title} relaid (JSBlock code upgraded)`)
  }
  const routeUid = withN17Prefix('w6b3', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: opts.title, icon: opts.icon, type: 'flowPage', parentId: groupId, sort: opts.sort, schemaUid: routeUid }) as { id?: unknown }
  const tabUid = withN17Prefix('w6b3', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b3', 'ts') })
  const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  await save({
    uid: withN17Prefix('w6b3', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
    props: { title: opts.title, displayTitle: true, enableTabs: false },
    stepParams: { pageSettings: { general: { title: opts.title, displayTitle: true, enableTabs: false, description: opts.description } } },
  })
  const gridUid = withN17Prefix('w6b3', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'jsBlock',
    settings: { showBlockCard: true, code: opts.code },
  }) as { uid?: unknown }
  if (typeof block.uid !== 'string') throw new Error(`addBlock returned no uid for ${opts.label}: ${JSON.stringify(block).slice(0, 200)}`)
  log(`w6b3-trace: v2 page ${opts.title} created (/admin/${routeUid})`)
  return String(page.id ?? '')
}

/**
 * Lay the two 食品合规 pages (效期看板 + 批次追溯), grant member view on the
 * collections the blocks read (the B2 grant pattern), and bind the menu to
 * admin+member (keeper/qc_inspector ride member — the recall *initiation*
 * gate lives server-side in w6b3-recall, not in menu visibility).
 * @param token - the root API token.
 */
export async function ensureTracePages(token: string): Promise<void> {
  const expiryPageId = await ensureJsBlockPage(token, {
    groupTitle: '食品合规', groupIcon: 'SafetyCertificateOutlined',
    title: '效期看板', icon: 'FieldTimeOutlined', sort: 1,
    description: '四日期×监管分档双轨（红档=LEAST(30,监管阈值)：≥1年→45/半年→20/90天→15/30天→10/更短→3，与 B2 规则引擎同口径）——KPI 条+品类×剩余天数热力矩阵+点格下钻批次清单；预警状态消费 wfl_alerts 效期规则产出',
    code: EXPIRY_BOARD_CODE, label: 'expiry board',
  })
  const tracePageId = await ensureJsBlockPage(token, {
    groupTitle: '食品合规', groupIcon: 'SafetyCertificateOutlined',
    title: '批次追溯', icon: 'ApartmentOutlined', sort: 2,
    description: '分层泳道 DAG（供应商/收货/原料批/生产工单/成品批/销售订单/发运/客户）——选锚点批次双向展开（非树形，混料/分批不重复展开）；「召回范围」开关正向波及高亮+侧栏受影响清单；断链环节明确提示（数据质量信号）。食安法第 42/50/51 条追溯记录底座',
    code: TRACE_DAG_CODE, label: 'trace dag',
  })
  // Menu visibility: admin + member (every business role reads; recall
  // initiation stays server-gated).
  for (const [title, pageId] of [['效期看板', expiryPageId], ['批次追溯', tracePageId]] as const) {
    const pageIdNum = Number(pageId)
    if (!Number.isInteger(pageIdNum) || pageIdNum <= 0) continue
    for (const role of ['admin', 'member']) {
      const bound = Number(psql(`SELECT count(*) FROM "rolesDesktopRoutes" WHERE "desktopRouteId" = ${String(pageId)} AND "roleName" = ${sqlLit(role)};`).trim())
      if (bound === 0) {
        await dataOf(token, 'POST', '/api/rolesDesktopRoutes:create', { desktopRouteId: pageIdNum, roleName: role })
        log(`w6b3-trace: ${title} menu bound to ${role}`)
      }
    }
  }
  // The JSBlock reads these through the member face; the grants are the B2
  // additive pattern (existing rows untouched).
  for (const name of [
    'wms_lots', 'wms_movements', 'wms_receipts', 'wfl_alerts', 'alert_rules',
    'mfg_orders', 'mfg_completions', 'mfg_material_issues',
    'so_orders', 'srm_suppliers', 'crm_customers', 'hub_inv_products',
  ]) {
    const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim())
    if (granted === 0) {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      log(`w6b3-trace: member→${name} view granted`)
    }
  }
}

// ─── the trace CLI legs (reconciliation output) ───

/** Print one direction's closure with kind grouping (the CLI reconciliation leg). */
function printClosure(lotNo: string, direction: 'up' | 'down'): number {
  const anchor = lotNodeKey(lotNo)
  const keys = psql(`${closureCte(anchor, direction)} ORDER BY node_key;`).split('\n').map(line => line.trim()).filter(line => line !== '')
  const meta = psql('SELECT node_key || \'|\' || kind || \'|\' || COALESCE(label, \'\') FROM v_trace_nodes;')
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  const byKey = new Map(meta.map(line => { const [key, kind, ...rest] = line.split('|'); return [key, `${kind}:${rest.join('|')}`] as const }))
  log(`w6b3-trace: [${direction}] ${lotNo} 闭包 ${String(keys.length)} 节点`)
  for (const kindGroup of [['supplier', 'supplier'], ['receipt', 'receipt'], ['lot_in', 'lot_in'], ['mo', 'mo'], ['lot_fg', 'lot_fg'], ['so', 'so'], ['shipment', 'shipment'], ['customer', 'customer']] as const) {
    const hit = keys.map(key => byKey.get(key) ?? key).filter(label => label.startsWith(`${kindGroup[0]}:`))
    if (hit.length > 0) log(`  ${kindGroup[1]} ×${String(hit.length)} — ${hit.map(label => label.slice(label.indexOf(':') + 1)).join('、')}`)
  }
  return keys.length
}

// ─── --assert: the acceptance matrix ───

/**
 * The B3 trace assertions: views live and non-empty; the receipts FK backfill
 * left zero orphans; the FG lot backward closure reaches the raw-material
 * suppliers (the kpi-run --trace gold standard's three-level chain, counted
 * on the same wiring); the blend scenario (one raw lot feeding three MOs)
 * deduplicates instead of tree-expanding; and the recall-scope SQL (the
 * forward closure) is printed for the recall leg's reconciliation.
 */
export async function assertTrace(): Promise<void> {
  log('w6b3-trace: --assert 开始')
  const nodeCount = Number(psql('SELECT count(*) FROM v_trace_nodes;').trim())
  const edgeCount = Number(psql('SELECT count(*) FROM v_trace_edges;').trim())
  check('v_trace_nodes/v_trace_edges 视图存在且非空', nodeCount > 0 && edgeCount > 0, `nodes=${String(nodeCount)} edges=${String(edgeCount)}`)
  const orphans = Number(psql(`SELECT count(*) FROM wms_receipts r WHERE COALESCE(r.lot_no, '') <> '' AND r.lot_id IS NULL;`).trim())
  check('wms_receipts.lot_id 回填后孤儿行=0（验收⑥）', orphans === 0, `orphans=${String(orphans)}`)
  const noLotCompletions = Number(psql(`SELECT count(*) FROM mfg_completions WHERE COALESCE(lot_no, '') = '';`).trim())
  check('完工单效期继承（无 lot_no 的完工单=0，验收③）', noLotCompletions === 0, `remaining=${String(noLotCompletions)}`)

  // ① Backward from a real FG lot: must reach ≥1 raw-material lot and ≥1 supplier.
  const fgLot = psql(`SELECT l.lot_no FROM wms_lots l
WHERE EXISTS (SELECT 1 FROM mfg_completions c WHERE c.lot_no = l.lot_no)
  AND EXISTS (SELECT 1 FROM wms_movements m JOIN mfg_material_issues i ON i.code = m.doc_no
              JOIN mfg_orders o ON o.id = i.mo_id
              WHERE m.move_type = 'ISSUE_WIP' AND m.qty < 0 AND o.id IN
                (SELECT mo_id FROM mfg_completions c2 WHERE c2.lot_no = l.lot_no))
ORDER BY l.id LIMIT 1;`).trim()
  check('存在完整三级链成品批次（完工←领料←供应商）', fgLot !== '', fgLot)
  if (fgLot !== '') {
    const anchor = lotNodeKey(fgLot)
    const upKeys = psql(`${closureCte(anchor, 'up')} ORDER BY node_key;`).split('\n').map(line => line.trim()).filter(line => line !== '')
    const kinds = psql(`SELECT node_key || '~' || kind FROM v_trace_nodes WHERE node_key IN (${upKeys.map(key => sqlLit(key)).join(', ')});`)
      .split('\n').map(line => line.trim()).filter(line => line !== '').map(line => line.split('~')[1])
    const rawLots = kinds.filter(kind => kind === 'lot_in').length
    const suppliers = kinds.filter(kind => kind === 'supplier').length
    check(`反向追溯 ${fgLot} 到达原料批次（验收①）`, rawLots >= 1, `lot_in=${String(rawLots)}`)
    check(`反向追溯 ${fgLot} 到达供应商（三级追溯链闭合）`, suppliers >= 1, `supplier=${String(suppliers)}`)
    // The kpi-run gold standard parity: the same MO's component lots via the
    // kpi-run wiring (ISSUE_WIP movement lots) must be exactly the closure's
    // lot_in set for that MO's leg.
    const moId = psql(`SELECT c.mo_id FROM mfg_completions c JOIN wms_lots l ON l.lot_no = c.lot_no WHERE l.lot_no = ${sqlLit(fgLot)} LIMIT 1;`).trim()
    const kpiComponentLots = new Set(psql(`SELECT DISTINCT l.lot_no FROM wms_movements m
JOIN mfg_material_issues i ON i.code = m.doc_no JOIN wms_lots l ON l.id = m.lot_id
WHERE m.move_type = 'ISSUE_WIP' AND m.qty < 0 AND i.mo_id = ${moId};`).split('\n').map(line => line.trim()).filter(line => line !== ''))
    const closureLotIn = new Set(psql(`SELECT n.label FROM v_trace_nodes n
WHERE n.kind = 'lot_in' AND n.node_key IN (${upKeys.map(key => sqlLit(key)).join(', ')});`).split('\n').map(line => line.trim()).filter(line => line !== ''))
    const blend = [...kpiComponentLots].filter(lot => closureLotIn.has(lot)).length
    check('与 kpi-run --trace 同口径（该 MO 的 ISSUE_WIP 组件批次全部落在反向闭包内）', blend === kpiComponentLots.size, `${String(blend)}/${String(kpiComponentLots.size)}（${[...kpiComponentLots].join('、')}）`)
  }

  // ③ The blend/split scenario: one raw lot feeding multiple MOs — the
  // closure deduplicates (a tree expansion would double-count the downstream).
  const blendLot = psql(`SELECT l.lot_no FROM wms_lots l
JOIN wms_movements m ON m.lot_id = l.id AND m.move_type = 'ISSUE_WIP' AND m.qty < 0
JOIN mfg_material_issues i ON i.code = m.doc_no
GROUP BY l.lot_no HAVING count(DISTINCT i.mo_id) >= 2 ORDER BY count(DISTINCT i.mo_id) DESC LIMIT 1;`).trim()
  check('存在混料/分批场景原料批次（一料入多单）', blendLot !== '', blendLot)
  if (blendLot !== '') {
    const anchor = lotNodeKey(blendLot)
    const downKeys = psql(`${closureCte(anchor, 'down')} ORDER BY node_key;`).split('\n').map(line => line.trim()).filter(line => line !== '')
    const distinct = new Set(downKeys).size
    check('混料闭包去重（DAG 非树形——节点不重复展开）', distinct === downKeys.length, `down=${String(distinct)} 节点全部唯一`)
    const fgDown = psql(`SELECT count(*) FROM v_trace_nodes n WHERE n.kind = 'lot_fg' AND n.node_key IN (${downKeys.map(key => sqlLit(key)).join(', ')});`).trim()
    check('混料原料正向到达 ≥2 个成品批次（树形失真反例）', Number(fgDown) >= 2, `lot_fg=${fgDown}`)
  }

  // ② Forward from a raw-material lot: the recall-scope triple (FG lots /
  // shipped SOs / customers) — the recall leg reconciles against this SQL.
  const rawLot = blendLot !== '' ? blendLot : psql(`SELECT l.lot_no FROM wms_lots l WHERE l.supplier_id IS NOT NULL AND EXISTS (SELECT 1 FROM wms_movements m WHERE m.lot_id = l.id) LIMIT 1;`).trim()
  check('正向追溯锚点原料批次就绪', rawLot !== '', rawLot)
  if (rawLot !== '') {
    const anchor = lotNodeKey(rawLot)
    const downKeys = psql(`${closureCte(anchor, 'down')} ORDER BY node_key;`).split('\n').map(line => line.trim()).filter(line => line !== '')
    const triple = psql(`SELECT
  (SELECT count(*) FROM v_trace_nodes n WHERE n.kind IN ('lot_fg') AND n.node_key IN (${downKeys.map(key => sqlLit(key)).join(', ')}))
  || '|' || (SELECT count(*) FROM v_trace_nodes n WHERE n.kind = 'so' AND n.node_key IN (${downKeys.map(key => sqlLit(key)).join(', ')}))
  || '|' || (SELECT count(*) FROM v_trace_nodes n WHERE n.kind = 'customer' AND n.node_key IN (${downKeys.map(key => sqlLit(key)).join(', ')}));`).trim()
    const [fgN, soN, custN] = triple.split('|')
    check('正向召回范围三元组（成品批次/发运订单/客户）非空', Number(fgN) > 0 || Number(soN) > 0, `fg=${fgN} so=${soN} cust=${custN}`)
  }

  // The pages exist (existence alone is never acceptance — the browser
  // screenshots in demos/acceptance-w6 carry the rendered proof).
  const token = await signInWithRetry()
  const routes = await listRoutes(token, 'W6B3-assert')
  check('效期看板/批次追溯 页面已铺（渲染证据见截图）', routes.some(row => row.title === '效期看板' && row.type === 'flowPage') && routes.some(row => row.title === '批次追溯' && row.type === 'flowPage'))

  log(`w6b3-trace: --assert ${failures.length === 0 ? 'PASS' : `FAIL（${String(failures.length)}）`}`)
  if (failures.length > 0) process.exitCode = 1
}

// ─── the CLI ───

const main = async (): Promise<void> => {
  if (mode === 'migrate') {
    migrateTrace()
    return
  }
  if (mode === 'seed-pages') {
    const token = await signInWithRetry()
    await ensureTracePages(token)
    return
  }
  if (mode === 'trace-up' || mode === 'trace-down') {
    const lotNo = /lot=([^ ]+)/.exec(args.join(' '))?.[1]
    if (lotNo === undefined) throw new Error(`--${mode} 需要 lot=<批次号>`)
    const count = printClosure(lotNo, mode === 'trace-up' ? 'up' : 'down')
    log(`w6b3-trace: [${mode}] ${lotNo} PASS — ${String(count)} 节点`)
    return
  }
  await assertTrace()
}

await main()
