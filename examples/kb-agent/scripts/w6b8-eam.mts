/**
 * W6-B8: the EAM face — 设备台账 + 预防性维保 + 车间 Andon 维护请求 + 计量校准
 * (plans/plan-w6.zh.md §5.6; the food-plant strong-inspection domain GB
 * 14881-2025 计量器具台面).
 *
 * 1. Four collections (the B2 additive field style): eam_assets (设备台账 —
 *    code/category/workshop/status/owner + workcenter_id linking the W-round
 *    FCS spine + ccp_code marking the CCP-keyed equipment), eam_maint_plans
 *    (预防性维保计划 — frequency_days/checklist/next_due_date),
 *    eam_maint_orders (维保工单 — the four-state machine
 *    new→accepted→done→closed, source plan|andon|manual, CAS transitions),
 *    eam_calibrations (计量校准台账 — calibrated_at/period_days/next_due_date,
 *    the calibration_due alert's entity).
 * 2. The preventive engine (scanMaintPlans): every due plan mints one work
 *    order per missed period (dedup_key = plan:{id}:{due_date} — idempotent),
 *    then advances next_due_date by frequency_days until it is in the future.
 *    The engine mounts it beside the hourly alert scan; POST /eam/scan-plans
 *    triggers the same pass by hand.
 * 3. eamRoute (engine-consumed): GET /eam/orders (the calendar/board feed),
 *    POST /eam/act (accept/done/close with the 生产车间+admin write fence and
 *    the requester-verifies close rule), POST /eam/scan-plans. The Andon leg
 *    lives in the engine terminal group (POST /andon/maintenance) where the
 *    card-flow session derives the operator.
 * 4. Pages (资产管理): 设备台账 / 维保计划 / 维保工单 / 计量校准 table pages
 *    (the B4 spine) + 维保日历 — a month-grid JSBlock (非表格月历形态) with
 *    per-day order chips and in-page state actions.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b8-eam.mts --seed
 *   node --import tsx/esm examples/kb-agent/scripts/w6b8-eam.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, ensureFilterForm, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import type { NocoIO } from './approval-engine.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed' : 'assert'
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

const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`

// ─── the four collections' field dictionaries (the B2 field style) ───

const ASSET_CATEGORY_ENUM = [
  { value: 'freezer', label: '速冻设备', color: 'blue' },
  { value: 'metal_detect', label: '金检设备', color: 'default' },
  { value: 'mixing', label: '搅拌设备', color: 'cyan' },
  { value: 'packing', label: '包装设备', color: 'blue' },
  { value: 'instrument', label: '计量器具', color: 'gold' },
  { value: 'other', label: '其他', color: 'default' },
]

const ASSET_STATUS_ENUM = [
  { value: 'running', label: '运行', color: 'green' },
  { value: 'standby', label: '停机', color: 'default' },
  { value: 'repair', label: '维修', color: 'orange' },
  { value: 'scrapped', label: '报废', color: 'red' },
]

const ORDER_STATUS_ENUM = [
  { value: 'new', label: '待受理', color: 'blue' },
  { value: 'accepted', label: '维修中', color: 'orange' },
  { value: 'done', label: '待验收', color: 'gold' },
  { value: 'closed', label: '已验收', color: 'green' },
]

const ORDER_SOURCE_ENUM = [
  { value: 'plan', label: '预防性计划', color: 'blue' },
  { value: 'andon', label: '车间Andon', color: 'default' },
  { value: 'manual', label: '手动', color: 'default' },
]

const ORDER_PRIORITY_ENUM = [
  { value: 'P1', label: 'P1紧急', color: 'red' },
  { value: 'P2', label: 'P2普通', color: 'blue' },
  { value: 'P3', label: 'P3低', color: 'default' },
]

const CAL_RESULT_ENUM = [
  { value: 'passed', label: '合格', color: 'green' },
  { value: 'failed', label: '不合格', color: 'red' },
]

/** eam_assets: one row per physical equipment (the ledger the QR code names). */
const ASSETS_FIELDS = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '设备编号' } },
  { name: 'name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '设备名称' } },
  { name: 'category', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '类别', enum: ASSET_CATEGORY_ENUM } },
  { name: 'workshop', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '所在车间' } },
  { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: ASSET_STATUS_ENUM } },
  { name: 'owner', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '责任人' } },
  { name: 'workcenter_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '工作中心行（排产联动）' } },
  { name: 'ccp_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: 'CCP监控点（关键设备标记）' } },
  { name: 'note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '备注' } },
] as const

/** eam_maint_plans: one row per periodic maintenance rule (frequency + checklist). */
const PLANS_FIELDS = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '计划编号' } },
  { name: 'asset_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '设备行' } },
  { name: 'asset_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '设备编号（快照）' } },
  { name: 'title', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '保养内容' } },
  { name: 'frequency_days', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '周期（天）' } },
  { name: 'checklist', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '点检项清单' } },
  { name: 'next_due_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '下次保养日', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'last_generated', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '最近生成工单日', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'enabled', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '启用' } },
] as const

/** eam_maint_orders: one row per work order (new→accepted→done→closed, CAS transitions only). */
const ORDERS_FIELDS = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '工单号' } },
  { name: 'asset_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '设备行' } },
  { name: 'asset_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '设备编号（快照）' } },
  { name: 'workcenter_name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '工作中心（快照）' } },
  { name: 'source', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '来源', enum: ORDER_SOURCE_ENUM } },
  { name: 'priority', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '优先级', enum: ORDER_PRIORITY_ENUM } },
  { name: 'problem', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '问题描述' } },
  { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: ORDER_STATUS_ENUM } },
  { name: 'planned_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '计划日期', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'requested_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '发起人' } },
  { name: 'accepted_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '受理维修人' } },
  { name: 'done_note', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '维修说明' } },
  { name: 'actual_min', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '实际工时（分）' } },
  { name: 'closed_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '验收人' } },
  { name: 'closed_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '验收日期', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'mo_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '关联 MO' } },
  { name: 'plan_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '来源计划' } },
  { name: 'dedup_key', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '幂等键（计划生成专用）' } },
] as const

/** eam_calibrations: one row per instrument's current calibration state (the alert's entity). */
const CALIBRATIONS_FIELDS = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '校准证行号' } },
  { name: 'instrument', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '计量器具' } },
  { name: 'asset_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '设备行（可空）' } },
  { name: 'asset_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '设备编号（快照）' } },
  { name: 'ccp_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '关联CCP监控点' } },
  { name: 'calibrated_at', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '本次校准日', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'period_days', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '检定周期（天）' } },
  { name: 'next_due_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '下次校准日', 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } },
  { name: 'agency', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '检定机构' } },
  { name: 'result', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '结论', enum: CAL_RESULT_ENUM } },
  { name: 'cert_no', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '证书号' } },
] as const

/**
 * Create the four collections idempotently (a present collection keeps its
 * rows; a missing declared field joins through fields:create), then the
 * uniqueness backstops: asset/plan/order/calibration codes unique, and the
 * plan-generation dedup key unique so one missed period mints exactly one
 * order however often the scanner re-runs.
 * @param token - the root API token.
 */
export async function ensureEamCollections(token: string): Promise<void> {
  for (const spec of [
    { name: 'eam_assets', title: '设备台账', titleField: 'name', fields: ASSETS_FIELDS },
    { name: 'eam_maint_plans', title: '维保计划', titleField: 'title', fields: PLANS_FIELDS },
    { name: 'eam_maint_orders', title: '维保工单', titleField: 'code', fields: ORDERS_FIELDS },
    { name: 'eam_calibrations', title: '计量校准', titleField: 'instrument', fields: CALIBRATIONS_FIELDS },
  ]) {
    const present = await dataOf(token, 'GET', `/api/collections/${spec.name}`)
      .then(row => (row as { name?: string } | null)?.name === spec.name)
      .catch(() => false)
    if (!present) {
      await dataOf(token, 'POST', '/api/collections:create', { name: spec.name, title: spec.title, titleField: spec.titleField, fields: spec.fields })
      log(`w6b8-eam: collection ${spec.name} created`)
      continue
    }
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: spec.name } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of spec.fields) {
      if (names.has(field.name)) continue
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: spec.name, ...field })
      log(`w6b8-eam: ${spec.name}.${field.name} added`)
    }
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_eam_assets_code ON eam_assets (code);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_eam_maint_plans_code ON eam_maint_plans (code);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_eam_maint_orders_code ON eam_maint_orders (code);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_eam_maint_orders_dedup ON eam_maint_orders (dedup_key);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_eam_calibrations_code ON eam_calibrations (code);')
}

// ─── seeds (the demo line's equipment; thresholds live on rows, never in code) ───

/** Today's ISO date in the PG zone the scanner's CURRENT_DATE rides. */
function todayIso(): string {
  return psql('SELECT CURRENT_DATE::text;').trim()
}

/** Shift an ISO date by n days (the seed window arithmetic). */
function isoShift(iso: string, days: number): string {
  return psql(`SELECT (${sqlLit(iso)}::date + ${String(days)})::text;`).trim()
}

/**
 * Seed the 速冻水饺产线 equipment idempotently by code: the CCP-keyed four
 * (馅料搅拌→CCP-XT-01 / 速冻机→CCP-SD-01 / 速冻库温度计→CCP-SD-01 /
 * 金检机→CCP-JC-01) carry the key-equipment marker the ledger page badges;
 * workcenter_id ties each asset to the FCS spine so the Andon request
 * auto-links the operation's center.
 */
function seedAssets(): void {
  const rows: ReadonlyArray<{ code: string, name: string, category: string, workshop: string, status: string, owner: string, workcenter_id: number | null, ccp_code: string, note: string }> = [
    { code: 'EQ-HX-01', name: '馅料搅拌机（双轴）', category: 'mixing', workshop: '和馅区', status: 'running', owner: 'shop_lead', workcenter_id: 1, ccp_code: 'CCP-XT-01', note: '馅料中心温度 CCP 监控对象（W6-B4 种子点）' },
    { code: 'EQ-SD-01', name: '螺旋速冻机', category: 'freezer', workshop: '成型速冻区', status: 'running', owner: 'shop_lead', workcenter_id: 1, ccp_code: 'CCP-SD-01', note: '速冻库温度 CCP 监控对象' },
    { code: 'EQ-JJ-01', name: '金检机（Fe/NonFe/Sus 三试块）', category: 'metal_detect', workshop: '内包装区', status: 'running', owner: 'shop_lead', workcenter_id: 2, ccp_code: 'CCP-JC-01', note: '金属检测 CCP 监控对象；强检计量器具（关联 eam_calibrations CB-001）' },
    { code: 'EQ-BZ-01', name: '自动包装机', category: 'packing', workshop: '内包装区', status: 'running', owner: 'shop_lead', workcenter_id: 2, ccp_code: '', note: '' },
    { code: 'EQ-WD-01', name: '速冻库温度计', category: 'instrument', workshop: '成型速冻区', status: 'running', owner: 'qc_inspector', workcenter_id: 1, ccp_code: 'CCP-SD-01', note: 'CCP 监控用温度计；强检计量器具' },
    { code: 'EQ-TD-01', name: '电子天平（0.1g）', category: 'instrument', workshop: '化验室', status: 'running', owner: 'qc_inspector', workcenter_id: null, ccp_code: '', note: '配料称量用；强检计量器具' },
    { code: 'EQ-PH-01', name: 'pH 计', category: 'instrument', workshop: '化验室', status: 'standby', owner: 'qc_inspector', workcenter_id: null, ccp_code: '', note: '清洁剂残留检测用；强检计量器具' },
    { code: 'EQ-QM-01', name: '和面前处理线', category: 'other', workshop: '和馅区', status: 'scrapped', owner: 'shop_lead', workcenter_id: null, ccp_code: '', note: '2025 年退役设备（报废态样例）' },
  ]
  for (const row of rows) {
    psql(`INSERT INTO eam_assets (code, name, category, workshop, status, owner, workcenter_id, ccp_code, note)
VALUES (${sqlLit(row.code)}, ${sqlLit(row.name)}, ${sqlLit(row.category)}, ${sqlLit(row.workshop)}, ${sqlLit(row.status)}, ${sqlLit(row.owner)}, ${row.workcenter_id === null ? 'NULL' : String(row.workcenter_id)}, ${sqlLit(row.ccp_code)}, ${sqlLit(row.note)})
ON CONFLICT (code) DO NOTHING;`)
  }
  log(`w6b8-eam: assets present (eam_assets rows=${psql('SELECT count(*) FROM eam_assets;').trim()})`)
}

/**
 * Seed the periodic plans: one weekly (速冻机), two monthly (金检机 due soon →
 * the calendar's forward occupancy, 包装机 overdue → the preventive engine's
 * generation case).
 */
function seedPlans(): void {
  const today = todayIso()
  const rows: ReadonlyArray<{ code: string, asset: string, title: string, frequency_days: number, checklist: string, next_due_date: string }> = [
    { code: 'MP-SD-01', asset: 'EQ-SD-01', title: '速冻机周保养', frequency_days: 7, checklist: '① 压缩机压力表读数 ② 传送带张紧与跑偏 ③ 冷凝器清洁 ④ 库温记录仪校验 ⑤ 链条润滑', next_due_date: isoShift(today, 7) },
    { code: 'MP-JJ-01', asset: 'EQ-JJ-01', title: '金检机月度保养+灵敏度校验', frequency_days: 30, checklist: '① Fe/NonFe/Sus 标准试块通过验证 ② 传送带清洁 ③ 拒绝机构动作测试 ④ 记录校验值', next_due_date: isoShift(today, 12) },
    { code: 'MP-BZ-01', asset: 'EQ-BZ-01', title: '包装机月保养', frequency_days: 30, checklist: '① 封口温度带校验 ② 膜张力调整 ③ 打码机清晰度 ④ 润滑点加油', next_due_date: isoShift(today, -1) },
  ]
  for (const row of rows) {
    psql(`INSERT INTO eam_maint_plans (code, asset_id, asset_code, title, frequency_days, checklist, next_due_date, enabled)
SELECT ${sqlLit(row.code)}, a.id, a.code, ${sqlLit(row.title)}, ${String(row.frequency_days)}, ${sqlLit(row.checklist)}, ${sqlLit(row.next_due_date)}, TRUE
FROM eam_assets a WHERE a.code = ${sqlLit(row.asset)}
ON CONFLICT (code) DO NOTHING;`)
  }
  log(`w6b8-eam: plans present (eam_maint_plans rows=${psql('SELECT count(*) FROM eam_maint_plans;').trim()})`)
}

/**
 * Seed the calibration ledger — the GB 14881 strong-inspection instruments.
 * The four seeds spread the alert tiers: 金检机 10 days overdue (critical),
 * pH 计 due in 3 days (critical inside critical_days), 速冻库温度计 due in 14
 * days (warning at the warn edge), 天平 freshly calibrated (no hit).
 */
function seedCalibrations(): void {
  const today = todayIso()
  const rows: ReadonlyArray<{ code: string, instrument: string, asset: string, ccp_code: string, calibrated_at: string, period_days: number, agency: string, result: string, cert_no: string }> = [
    { code: 'CB-JJ-26Q3', instrument: '金检机（灵敏度）', asset: 'EQ-JJ-01', ccp_code: 'CCP-JC-01', calibrated_at: isoShift(today, -190), period_days: 180, agency: '市计量质量检测研究院', result: 'passed', cert_no: 'JL-2026-1187' },
    { code: 'CB-WD-26Q3', instrument: '速冻库温度计', asset: 'EQ-WD-01', ccp_code: 'CCP-SD-01', calibrated_at: isoShift(today, -351), period_days: 365, agency: '市计量质量检测研究院', result: 'passed', cert_no: 'JL-2026-0932' },
    { code: 'CB-TD-26Q3', instrument: '电子天平', asset: 'EQ-TD-01', ccp_code: '', calibrated_at: isoShift(today, -30), period_days: 365, agency: '省计量科学研究院', result: 'passed', cert_no: 'JL-2026-1203' },
    { code: 'CB-PH-26Q3', instrument: 'pH 计', asset: 'EQ-PH-01', ccp_code: '', calibrated_at: isoShift(today, -177), period_days: 180, agency: '省计量科学研究院', result: 'passed', cert_no: 'JL-2026-0871' },
  ]
  for (const row of rows) {
    const due = isoShift(row.calibrated_at, row.period_days)
    psql(`INSERT INTO eam_calibrations (code, instrument, asset_id, asset_code, ccp_code, calibrated_at, period_days, next_due_date, agency, result, cert_no)
SELECT ${sqlLit(row.code)}, ${sqlLit(row.instrument)}, a.id, a.code, ${sqlLit(row.ccp_code)}, ${sqlLit(row.calibrated_at)}, ${String(row.period_days)}, ${sqlLit(due)}, ${sqlLit(row.agency)}, ${sqlLit(row.result)}, ${sqlLit(row.cert_no)}
FROM eam_assets a WHERE a.code = ${sqlLit(row.asset)}
ON CONFLICT (code) DO NOTHING;`)
  }
  log(`w6b8-eam: calibrations present (eam_calibrations rows=${psql('SELECT count(*) FROM eam_calibrations;').trim()})`)
}

/**
 * Seed the two B8 rule rows. The scanner branches live in w6b2-rules.mts
 * hitsSelect; these rows only carry thresholds and routing, so an ops edit on
 * the 预警中心 page re-tunes the domain without a deploy.
 */
function seedEamRules(): void {
  psql(`INSERT INTO alert_rules (rule_type, title, entity, params, schedule, actions, route_to, enabled, note)
VALUES ('calibration_due', '计量校准到期预警（GB 14881 强检器具）', 'eam_calibrations', '{"warn_days": 14, "critical_days": 3}'::json, 'hourly', '["notify_inapp"]'::json, '{"departments": ["质检部"], "users": ["planner"]}'::json, TRUE, 'W6-B8 seed——到期前14天预警、3天内/过期 critical；送检合格后写新行自动解除')
ON CONFLICT (rule_type) DO UPDATE SET title = EXCLUDED.title, entity = EXCLUDED.entity, route_to = EXCLUDED.route_to;`)
  psql(`INSERT INTO alert_rules (rule_type, title, entity, params, schedule, actions, route_to, enabled, note)
VALUES ('maint_overdue', '维保工单逾期预警', 'eam_maint_orders', '{"overdue_days": 2}'::json, 'hourly', '["notify_inapp"]'::json, '{"departments": ["生产车间"], "users": ["planner"]}'::json, TRUE, 'W6-B8 seed——计划日已过且状态 new/accepted 即预警；超 2 天 critical；完成/验收后自动解除')
ON CONFLICT (rule_type) DO UPDATE SET title = EXCLUDED.title, entity = EXCLUDED.entity, route_to = EXCLUDED.route_to;`)
  log('w6b8-eam: rules calibration_due + maint_overdue seeded (route 质检部/生产车间+planner)')
}

// ─── the preventive engine (hourly; idempotent per missed period) ───

/** One pass's preventive outcome (the assert leg and the engine log share it). */
export interface MaintPlanOutcome { readonly created: number; readonly advanced: number }

/**
 * The preventive maintenance engine: every enabled plan whose next_due_date
 * has arrived mints one work order per missed period (dedup_key
 * plan:{id}:{due} — replays create nothing), then advances next_due_date by
 * frequency_days until it is in the future. Guard: the collection not yet
 * seeded is a quiet no-op (the engine's hourly arm runs before --seed).
 * @returns how many orders were created and plans advanced.
 */
export function scanMaintPlans(): MaintPlanOutcome {
  const table = psql("SELECT to_regclass('eam_maint_plans')::text;").trim()
  if (table === '') return { created: 0, advanced: 0 }
  const today = todayIso()
  const plans = psql(`SELECT id || '|' || COALESCE(code, '') || '|' || COALESCE(asset_id::text, '') || '|' || COALESCE(asset_code, '') || '|' || COALESCE(title, '') || '|' || frequency_days || '|' || next_due_date FROM eam_maint_plans WHERE enabled = TRUE AND next_due_date IS NOT NULL AND next_due_date <= ${sqlLit(today)};`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  let created = 0
  let advanced = 0
  for (const line of plans) {
    const [idPart, planCode, assetId, assetCode, title, freqPart, duePart] = line.split('|')
    const freq = Number(freqPart)
    if (!Number.isInteger(freq) || freq < 1) {
      console.error(`w6b8-eam: 计划 #${idPart} 周期非正（${freqPart}）——跳过（修正 frequency_days）`)
      continue
    }
    const centerName = assetId === '' ? '' : psql(`SELECT COALESCE(w.name, '') FROM eam_assets a LEFT JOIN mfg_work_centers w ON w.id = a.workcenter_id WHERE a.id = ${assetId};`).trim()
    let due = duePart
    // Catch up every missed period (bounded — a stale plan refuses silently
    // looping): one order per period, each with its own dedup key.
    for (let guard = 0; guard < 24; guard += 1) {
      if (due > today) break
      const dedup = `plan:${idPart}:${due}`
      const nextCode = `WO-P${idPart}-${due.replaceAll('-', '')}`
      const inserted = psql(`INSERT INTO eam_maint_orders (code, asset_id, asset_code, workcenter_name, source, priority, problem, status, planned_date, requested_by, plan_code, dedup_key)
VALUES (${sqlLit(nextCode)}, ${assetId === '' ? 'NULL' : assetId}, ${sqlLit(assetCode)}, ${sqlLit(centerName)}, 'plan', 'P2', ${sqlLit(`预防性保养：${title}`)}, 'new', ${sqlLit(due)}, 'system', ${sqlLit(planCode)}, ${sqlLit(dedup)})
ON CONFLICT (dedup_key) DO NOTHING;`).trim()
      if (inserted === 'INSERT 0 1') created += 1
      due = isoShift(due, freq)
    }
    const upd = psql(`UPDATE eam_maint_plans SET next_due_date = ${sqlLit(due)}, last_generated = CURRENT_DATE WHERE id = ${idPart} AND next_due_date <> ${sqlLit(due)};`).trim()
    if (/^UPDATE [1-9]/.test(upd)) advanced += 1
  }
  return { created, advanced }
}

// ─── the engine route (fences + CAS state machine) ───

/** The usernames of 生产车间 members (the maintenance write fence population). */
function workshopUsernames(): Set<string> {
  const rows = psql(`SELECT u.username FROM "departmentsUsers" du JOIN users u ON u.id = du."userId" JOIN departments d ON d.id = du."departmentId" WHERE d.title = '生产车间';`).trim()
  return new Set(rows === '' ? [] : rows.split('\n'))
}

/**
 * The maintenance write fence: 生产车间 members plus admin (no dedicated
 * 设备部 exists in the org tree — the workshop owns the equipment role).
 * @param io - the NocoBase REST IO (unused; the fence reads the org via psql).
 * @param actor - the session-derived username.
 * @throws Error naming the fence when the actor is outside 生产车间/admin.
 */
export async function assertMaintActor(io: NocoIO, actor: string): Promise<void> {
  void io
  if (actor === 'admin' || actor === 'nocobase') return
  if (!workshopUsernames().has(actor)) {
    throw new Error(`维保处理限 设备/生产/admin 操作（${actor} 不在围栏内）`)
  }
}

/** The route outcome shape the engine and the assert leg share. */
type RouteOutcome = { status: number, body: Record<string, unknown> }

const eamFail = (status: number, code: string, message: string): RouteOutcome => ({ status, body: { ok: false, code, message, error: message } })

/**
 * The EAM engine surface. GET /eam/orders feeds the calendar/board blocks;
 * POST /eam/act walks the order state machine (accept new→accepted and
 * accepted→done fenced to 生产车间/admin; done→closed verified by the
 * requester or admin — the plan §5.6 requester-verifies rule); POST
 * /eam/scan-plans runs the preventive pass by hand. Every transition is one
 * CAS UPDATE … WHERE status = <expected> RETURNING — a wrong-state call maps
 * to 409 with the live state in the message, never a silent no-op.
 * @param io - the NocoBase REST IO (kept for signature parity with the route family).
 * @param pathname - /eam/orders | /eam/act | /eam/scan-plans.
 * @param method - GET or POST.
 * @param params - POST: the parsed JSON body; GET: the URL query params.
 * @param actor - the session-derived username.
 * @returns the HTTP outcome for writeJson.
 */
export async function eamRoute(io: NocoIO, pathname: string, method: string, params: Record<string, unknown>, actor: string): Promise<RouteOutcome> {
  void io
  if (pathname === '/eam/orders' && method === 'GET') {
    const rows = psql(`SELECT o.id || '|' || o.code || '|' || COALESCE(o.asset_code, '') || '|' || COALESCE(a.name, '') || '|' || COALESCE(o.workcenter_name, '') || '|' || o.source || '|' || o.priority || '|' || COALESCE(o.status, 'new') || '|' || COALESCE(o.planned_date::text, '') || '|' || COALESCE(o.requested_by, '') || '|' || COALESCE(o.accepted_by, '') || '|' || COALESCE(o.mo_code, '') || '|' || COALESCE(o.problem, '') FROM eam_maint_orders o LEFT JOIN eam_assets a ON a.id = o.asset_id ORDER BY o.planned_date NULLS LAST, o.id DESC;`).trim()
    const orders = rows === '' ? [] : rows.split('\n').map(line => {
      const [id, code, assetCode, assetName, workcenter, source, priority, status, plannedDate, requestedBy, acceptedBy, moCode, problem] = line.split('|')
      return { id: Number(id), code, asset_code: assetCode, asset_name: assetName, workcenter_name: workcenter, source, priority, status, planned_date: plannedDate, requested_by: requestedBy, accepted_by: acceptedBy, mo_code: moCode, problem }
    })
    return { status: 200, body: { ok: true, actor, orders } }
  }
  if (pathname === '/eam/act' && method === 'POST') {
    const orderId = Number(params['order_id'])
    const action = String(params['action'] ?? '')
    if (!Number.isInteger(orderId) || orderId < 1) return eamFail(400, 'bad_order', '需要正整数 order_id')
    const note = typeof params['note'] === 'string' ? params['note'].slice(0, 400) : ''
    const actualMin = Number(params['actual_min'])
    const current = psql(`SELECT code || '|' || status || '|' || COALESCE(requested_by, '') FROM eam_maint_orders WHERE id = ${String(orderId)};`).trim()
    if (current === '') return eamFail(404, 'order_not_found', `维保工单 #${String(orderId)} 不存在`)
    const [code, status, requestedBy] = current.split('|')
    try {
      if (action === 'accept' || action === 'done') {
        await assertMaintActor(io, actor)
      } else if (action === 'close') {
        if (actor !== 'admin' && actor !== 'nocobase' && actor !== requestedBy) {
          throw new Error(`验收关闭限发起人 ${requestedBy} 或 admin（${actor} 不在围栏内）`)
        }
      } else {
        return eamFail(400, 'bad_action', `action 仅接受 accept/done/close（收到 ${action}）`)
      }
      if (action === 'done' && note.trim() === '') return eamFail(400, 'note_required', '完成维修需要维修说明（note）')
      const expected = action === 'accept' ? 'new' : action === 'done' ? 'accepted' : 'done'
      if (status !== expected) return eamFail(409, 'wrong_state', `工单 ${code} 状态为 ${status}，${action} 需要状态 ${expected}（状态机 new→accepted→done→closed 单向）`)
      const sets = action === 'accept'
        ? `status = 'accepted', accepted_by = ${sqlLit(actor)}`
        : action === 'done'
          ? `status = 'done', done_note = ${sqlLit(note)}${Number.isFinite(actualMin) && actualMin > 0 ? `, actual_min = ${String(Math.round(actualMin))}` : ''}`
          : `status = 'closed', closed_by = ${sqlLit(actor)}, closed_at = CURRENT_DATE`
      // -t -A prints the RETURNING rows followed by the command tag; the code
      // rides the first line.
      const outcome = psql(`UPDATE eam_maint_orders SET ${sets} WHERE id = ${String(orderId)} AND status = ${sqlLit(expected)} RETURNING code;`)
        .split('\n').map(line => line.trim()).filter(line => line !== '')[0] ?? ''
      if (outcome === '') return eamFail(409, 'cas_lost', `工单 ${code} 状态已被并发修改（CAS 未命中）——刷新后重试`)
      // 维保逾期预警随状态即时收敛：工单离场即补一轮扫描（幂等）。
      const rules = await import('./w6b2-rules.mts')
      await rules.scanAlerts()
      return { status: 200, body: { ok: true, code: outcome, action, actor, order_id: orderId } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[eam] act refused: ${message}`)
      return eamFail(/围栏/.test(message) ? 403 : 500, 'refused', message)
    }
  }
  if (pathname === '/eam/scan-plans' && method === 'POST') {
    await assertMaintActor(io, actor)
    const outcome = scanMaintPlans()
    return { status: 200, body: { ok: true, actor, ...outcome } }
  }
  return eamFail(404, 'no_route', `no eam route ${method} ${pathname}`)
}

// ─── the 维保日历 JSBlock (month grid, in-page actions) ───

/**
 * The 维保日历 block source: month grid (7 columns, ‹ › nav), one chip per
 * order on its planned_date (status-colored; overdue = red rail), a detail
 * panel under the grid, and the state actions (受理/完成/验收) through POST
 * /eam/act — refusals surface inline (403/409 with their facts). All server
 * strings pass esc(); the marker 'w6b8-calendar' identifies the block.
 */
export const EAM_CALENDAR_CODE = [
  "// w6b8-calendar: the upgrade marker (ensure + assert match this)",
  "const ENGINE = String(window.__W6_ENGINE_BASE__ || 'http://127.0.0.1:13110');",
  "const TOKEN = localStorage.getItem('NOCOBASE_TOKEN') || '';",
  "const AMP = '\\u0026';",
  "const esc = (s) => String(s == null ? '' : s).replace(/[&<>\"']/g, (c) => ({ '&': AMP + 'amp;', '<': AMP + 'lt;', '>': AMP + 'gt;', '\"': AMP + 'quot;', \"'\": AMP + '#39;' }[c]));",
  "const TODAY = new Date().toISOString().slice(0, 10);",
  "const state = { month: TODAY.slice(0, 7), orders: [], sel: 0, note: '', busy: false, moreDate: '' };",
  "const STATUS = { new: ['待受理', 'var(--w7-informational-bg)', 'var(--w7-informational-fg)'], accepted: ['维修中', 'var(--w7-critical-bg)', 'var(--w7-critical-fg)'], done: ['待验收', 'var(--w7-critical-bg)', 'var(--w7-critical-fg)'], closed: ['已验收', 'var(--w7-positive-bg)', 'var(--w7-positive-fg)'] };",
  "const SRC = { plan: '预防性计划', andon: '车间Andon', manual: '手动' };",
  "const api = async (path, post) => {",
  "  const resp = await fetch(ENGINE + path, post === undefined",
  "    ? { headers: { authorization: 'Bearer ' + TOKEN } }",
  "    : { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(post) });",
  "  return { status: resp.status, ok: resp.ok, json: await resp.json().catch(() => ({})) };",
  "};",
  "const load = async () => {",
  "  const out = await api('/eam/orders');",
  "  state.orders = (out.json && out.json.orders) || [];",
  "  paint();",
  "};",
  "const act = async (id, action, note, actualMin) => {",
  "  if (state.busy) return;",
  "  state.busy = true; paint();",
  "  const out = await api('/eam/act', { order_id: id, action: action, note: note || '', actual_min: actualMin });",
  "  state.busy = false;",
  "  if (out.json && out.json.ok) { state.note = '✓ 工单 ' + esc(out.json.code) + ' 已' + (action === 'accept' ? '受理' : action === 'done' ? '完成维修（待验收）' : '验收关闭'); state.sel = 0; await load(); }",
  "  else { state.note = '✗ ' + esc((out.json && (out.json.message || out.json.error)) || ('HTTP ' + String(out.status))); paint(); }",
  "};",
  "const monthOf = (offset) => {",
  "  const y = Number(state.month.slice(0, 4)); const m = Number(state.month.slice(5, 7)) + offset;",
  "  const d = new Date(Date.UTC(y, m - 1, 1));",
  "  state.month = d.toISOString().slice(0, 7);",
  "  paint();",
  "};",
  "const chip = (o) => {",
  "  const meta = STATUS[o.status] || ['?', 'var(--w7-neutral-bg)', 'var(--w7-neutral-fg)'];",
  "  const overdue = o.planned_date && o.planned_date < TODAY && (o.status === 'new' || o.status === 'accepted');",
  "  return '<button data-act=\"sel\" data-id=\"' + String(o.id) + '\" style=\"display:block;width:100%;text-align:left;margin:2px 0;border:1px solid ' + (overdue ? 'var(--w7-negative-fg)' : 'var(--w7-border-strong)') + ';border-left:4px solid ' + (overdue ? 'var(--w7-negative-fg)' : meta[2]) + ';border-radius:var(--w7-radius-control);background:' + meta[1] + ';color:var(--w7-text);padding:2px 6px;font-size:var(--w7-fs-caption);cursor:pointer\">'",
  "    + esc(o.code) + ' · ' + esc(o.asset_code || o.workcenter_name || '?') + (overdue ? ' <b style=\"color:var(--w7-negative-fg)\">逾期</b>' : '') + '</button>';",
  "};",
  "function paint() {",
  "  const root = document.querySelector('[data-w6b8=\"calendar\"]');",
  "  if (!root) return;",
  "  const y = Number(state.month.slice(0, 4)); const m = Number(state.month.slice(5, 7));",
  "  const firstDay = new Date(Date.UTC(y, m - 1, 1));",
  "  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();",
  "  const lead = (firstDay.getUTCDay() + 6) % 7;",
  "  const cells = [];",
  "  for (let i = 0; i < lead; i += 1) cells.push('<td style=\"border:1px solid var(--w7-border);min-height:64px\"></td>');",
  "  for (let d = 1; d <= daysInMonth; d += 1) {",
  "    const iso = state.month + '-' + (d < 10 ? '0' : '') + String(d);",
  "    const dayOrders = state.orders.filter(o => o.planned_date === iso);",
  "    const expanded = state.moreDate === iso;",
  "    const shown = expanded ? dayOrders : dayOrders.slice(0, 2);",
  "    const more = dayOrders.length - shown.length;",
  "    const isToday = iso === TODAY;",
  "    cells.push('<td style=\"border:1px solid ' + (isToday ? 'var(--w7-primary)' : 'var(--w7-border)') + ';vertical-align:top;padding:3px;width:14.2%;min-height:64px\">'",
  "      + '<div style=\"font-size:var(--w7-fs-caption);color:' + (isToday ? 'var(--w7-primary)' : 'var(--w7-text-weak)') + ';font-weight:' + (isToday ? '700' : '400') + '\">' + String(d) + '</div>'",
  "      + shown.map(chip).join('')",
  "      + (more > 0 ? '<button data-act=\"more\" data-date=\"' + iso + '\" style=\"display:block;width:100%;margin:2px 0;border:none;background:transparent;color:var(--w7-primary);font-size:var(--w7-fs-caption);cursor:pointer;text-align:left;padding:0 4px\">+ ' + String(more) + ' more</button>' : ''),",
  "      (expanded && dayOrders.length > 2 ? '<button data-act=\"more\" data-date=\"' + iso + '\" style=\"display:block;width:100%;margin:2px 0;border:none;background:transparent;color:var(--w7-text-weak);font-size:var(--w7-fs-caption);cursor:pointer;text-align:left;padding:0 4px\">收起</button>' : ''),",
  "      '</td>');",
  "  }",
  "  while (cells.length % 7 !== 0) cells.push('<td style=\"border:1px solid var(--w7-border)\"></td>');",
  "  const rows = [];",
  "  for (let i = 0; i < cells.length; i += 7) rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');",
  "  const sel = state.orders.find(o => o.id === state.sel) || null;",
  "  const detail = sel",
  "    ? '<div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:10px 12px;margin-top:10px;background:var(--w7-surface)\">'",
  "      + '<div style=\"font-weight:600;margin-bottom:4px\">' + esc(sel.code) + ' · ' + esc(sel.asset_name || sel.asset_code || '?') + (sel.asset_code ? '（' + esc(sel.asset_code) + '）' : '') + '</div>'",
  "      + '<div style=\"font-size:var(--w7-fs-body);color:var(--w7-text-secondary);margin-bottom:4px\">来源 ' + esc(SRC[sel.source] || sel.source) + ' · 优先级 ' + esc(sel.priority) + ' · 计划日 ' + esc(sel.planned_date || '—') + ' · 发起 ' + esc(sel.requested_by) + (sel.accepted_by ? ' · 受理 ' + esc(sel.accepted_by) : '') + (sel.mo_code ? ' · 关联 ' + esc(sel.mo_code) : '') + '</div>'",
  "      + '<div style=\"font-size:var(--w7-fs-body);color:var(--w7-text);margin-bottom:8px\">' + esc(sel.problem) + '</div>'",
  "      + (sel.status === 'new' ? '<button data-act=\"accept\" style=\"padding:4px 16px;border:1px solid var(--w7-primary);color:var(--w7-primary);background:var(--w7-surface);border-radius:var(--w7-radius-control);cursor:pointer\">受理开工</button>' : '')",
  "      + (sel.status === 'accepted' ? '<div style=\"margin-bottom:6px\"><input data-in=\"note\" placeholder=\"维修说明（必填）\" style=\"width:60%;padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control)\" /> <input data-in=\"min\" type=\"number\" placeholder=\"工时分\" style=\"width:90px;padding:4px 8px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control)\" /></div>'",
  "        + '<button data-act=\"done\" style=\"padding:4px 16px;border:1px solid var(--w7-critical-fg);color:var(--w7-critical-fg);background:var(--w7-surface);border-radius:var(--w7-radius-control);cursor:pointer\">完成维修（转待验收）</button>' : '')",
  "      + (sel.status === 'done' ? '<button data-act=\"close\" style=\"padding:4px 16px;border:1px solid var(--w7-positive-fg);color:var(--w7-positive-fg);background:var(--w7-surface);border-radius:var(--w7-radius-control);cursor:pointer\">验收关闭（限发起人/admin）</button>' : '')",
  "      + (sel.status === 'closed' ? '<span style=\"color:var(--w7-positive-fg)\">已验收关闭</span>' : '')",
  "      + '</div>'",
  "    : '<div style=\"color:var(--w7-text-weak);padding:8px 0\">点击日历中的工单条查看详情并处理（受理/完成/验收走引擎状态机）</div>';",
  "  const legend = Object.keys(STATUS).map(k => '<span style=\"display:inline-block;margin-right:10px;font-size:var(--w7-fs-caption)\"><span style=\"display:inline-block;width:10px;height:10px;border-radius:var(--w7-radius-badge);background:' + STATUS[k][1] + ';border:1px solid ' + STATUS[k][2] + ';margin-right:4px;vertical-align:-1px\"></span>' + STATUS[k][0] + '</span>').join('')",
  "    + '<span style=\"font-size:var(--w7-fs-caption);margin-left:6px\"><span style=\"display:inline-block;width:10px;height:10px;border-radius:var(--w7-radius-badge);background:var(--w7-negative-bg);border:1px solid var(--w7-negative-fg);margin-right:4px;vertical-align:-1px\"></span>逾期（计划日已过未完成）</span>';",
  "  root.innerHTML = [",
  "    '<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:8px\">',",
  "    '<button data-act=\"prev\" style=\"padding:2px 12px;border:1px solid var(--w7-border-strong);border-radius:6px;cursor:pointer\">‹</button>',",
  "    '<b style=\"font-size:16px\">' + String(y) + ' 年 ' + String(m) + ' 月 · 维保日历</b>',",
  "    '<button data-act=\"next\" style=\"padding:2px 12px;border:1px solid var(--w7-border-strong);border-radius:6px;cursor:pointer\">›</button>',",
  "    '<span style=\"flex:1\"></span><button data-act=\"reload\" style=\"padding:2px 12px;border:1px solid var(--w7-border-strong);border-radius:6px;cursor:pointer\">刷新</button></div>',",
  "    '<div style=\"margin-bottom:6px\">' + legend + '</div>',",
  "    '<table style=\"border-collapse:collapse;width:100%;table-layout:fixed\"><thead><tr style=\"background:var(--w7-surface-2);font-size:var(--w7-fs-caption);font-weight:600;color:var(--w7-text-secondary)\">',",
  "    + ['一', '二', '三', '四', '五', '六', '日'].map(d => '<th style=\"padding:4px;border:1px solid var(--w7-border)\">周' + d + '</th>').join('') + '</tr></thead>'",
  "    + '<tbody>' + rows.join('') + '</tbody></table>',",
  "    detail,",
  "    '<div data-w6b8-note style=\"font-size:var(--w7-fs-caption);color:' + (String(state.note).indexOf('✗') === 0 ? 'var(--w7-negative-fg)' : 'var(--w7-positive-fg)') + ';margin-top:6px;min-height:16px\">' + esc(state.note) + '</div>',",
  "  ].join('');",
  "};",
  "ctx.render('<div data-w6b8=\"calendar\" style=\"padding:8px\"></div>');",
  "const root = () => document.querySelector('[data-w6b8=\"calendar\"]');",
  "document.addEventListener('click', (ev) => {",
  "  const t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;",
  "  if (!t || !root() || !root().contains(t)) return;",
  "  const kind = t.getAttribute('data-act');",
  "  if (kind === 'prev') return monthOf(-1);",
  "  if (kind === 'next') return monthOf(1);",
  "  if (kind === 'reload') { state.note = ''; return void load(); }",
  "  if (kind === 'more') { const dt = String(t.getAttribute('data-date') || ''); state.moreDate = state.moreDate === dt ? '' : dt; return paint(); }",
  "  if (kind === 'sel') { state.sel = Number(t.getAttribute('data-id')); state.note = ''; return paint(); }",
  "  if (kind === 'accept') return void act(state.sel, 'accept');",
  "  if (kind === 'done') {",
  "    const panel = root().querySelector('[data-in=\"note\"]');",
  "    const mins = root().querySelector('[data-in=\"min\"]');",
  "    return void act(state.sel, 'done', panel ? panel.value : '', mins ? Number(mins.value) : NaN);",
  "  }",
  "  if (kind === 'close') return void act(state.sel, 'close');",
  "});",
  "void load();",
].join('\n')

// ─── pages (the B4 table spine + one JSBlock calendar page) ───

type EamColumnKind = 'text' | 'select' | 'number' | 'date' | 'boolean'
type EamColumn = { name: string, title: string, kind: EamColumnKind, options?: ReadonlyArray<{ value: string, label: string, color: string }> }

const eamDisplayModelFor = (kind: EamColumnKind): string =>
  kind === 'select' ? 'DisplayEnumFieldModel'
    : kind === 'date' ? 'DisplayDateTimeFieldModel'
      : 'DisplayTextFieldModel'

/**
 * Lay one EAM table page under 资产管理 idempotently (the B4 spine: group +
 * flowPage + tabs + grid + TableBlock + columns + row detail + filter).
 * @param token - the root API token.
 * @param opts - the page's titles, collection, columns, and sort.
 */
async function ensureTablePage(token: string, opts: {
  title: string, icon: string, sort: number, description: string
  collection: string, columns: ReadonlyArray<EamColumn>
  filterFields: readonly string[], defaultSort: 'asc' | 'desc'
}): Promise<void> {
  const routes = await listRoutes(token, 'W6B8EAM')
  const groupId = routes.find(row => row.title === '资产管理' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 资产管理 missing (run the n17 alignment seeds first)')
  if (routes.some(row => row.title === opts.title && row.type === 'flowPage')) {
    log(`w6b8-eam: v2 page ${opts.title} exists (kept)`)
    return
  }
  const routeUid = withN17Prefix('w6b8e', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: opts.title, icon: opts.icon, type: 'flowPage', parentId: groupId, sort: opts.sort, schemaUid: routeUid }) as { id?: unknown }
  const tabUid = withN17Prefix('w6b8e', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b8e', 'ts') })
  const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  await save({ uid: withN17Prefix('w6b8e', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: opts.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: opts.title, displayTitle: true, enableTabs: false, description: opts.description } } } })
  const gridUid = withN17Prefix('w6b8e', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  const tableUid = withN17Prefix('w6b8e', 'tb')
  await save({
    uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
    props: { title: opts.title },
    stepParams: {
      resourceSettings: { init: { dataSourceKey: 'main', collectionName: opts.collection } },
      tableSettings: { defaultSorting: { sort: [{ field: 'id', direction: opts.defaultSort }] } },
    },
  })
  let sortIndex = 1
  for (const column of opts.columns) {
    const uid = withN17Prefix('w6b8e', 'k')
    const model = eamDisplayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: opts.collection, fieldPath: column.name } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title: column.title, dataIndex: column.name, width: 130, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: [...column.options] }) },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: opts.collection, dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: [...column.options] }) },
    })
    sortIndex += 1
  }
  await save({ uid: withN17Prefix('w6b8e', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
  await ensureTableRowDetail(token, tableUid, {
    collection: opts.collection,
    fields: opts.columns.map(column => ({ fieldPath: column.name, modelUse: eamDisplayModelFor(column.kind), ...(column.options === undefined ? {} : { options: [...column.options] }) })),
    tabTitle: `${opts.title}详情`,
    actionsColumnSortIndex: opts.columns.length + 1,
  })
  await ensureFilterForm(token, { gridUid, tableUid, collection: opts.collection, fields: opts.filterFields.map(fieldPath => ({ fieldPath })) })
  log(`w6b8-eam: v2 page ${opts.title} created (/admin/${routeUid})`)
}

/**
 * Lay the 维保日历 page (月历形态): a fresh flowPage whose grid carries only
 * the w6b8-calendar JSBlock — no table anywhere on the page (the plan §5.6
 * month-calendar form). Idempotent by page title + block marker.
 * @param token - the root API token.
 */
async function ensureCalendarPage(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B8EAM-cal')
  const groupId = routes.find(row => row.title === '资产管理' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 资产管理 missing')
  const title = '维保日历'
  let pageId = routes.find(row => row.title === title && row.type === 'flowPage')?.id
  if (pageId === undefined) {
    const routeUid = withN17Prefix('w6b8e', 'c')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon: 'CalendarOutlined', type: 'flowPage', parentId: groupId, sort: 6, schemaUid: routeUid }) as { id?: unknown }
    pageId = Number(page.id ?? 0)
    const tabUid = withN17Prefix('w6b8e', 'ct')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b8e', 'cts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({
      uid: withN17Prefix('w6b8e', 'cp'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
      props: { title, displayTitle: true, enableTabs: false },
      stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false, description: '维保月历（非表格）：预防性计划生成的工单与车间 Andon 维护请求按计划日落到日历格；逾期红边高亮；页内走完 受理→完成→验收 状态机（会话身份推导）' } } },
    })
    await save({ uid: withN17Prefix('w6b8e', 'cg'), parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    log(`w6b8-eam: v2 page ${title} created (/admin/${routeUid})`)
  }
  // The calendar JSBlock rides the page grid (idempotent by marker). The tab
  // row is re-listed after a fresh create (the pre-create snapshot cannot
  // know the new page's children).
  const tab = (await listRoutes(token, 'W6B8EAM-cal-tab')).find(row => row.parentId === pageId && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error('维保日历 tabs 路由不在（页面铺设异常）')
  const schemaUid = tab.schemaUid
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(schemaUid))}&subKey=grid`) as { uid?: string } | null
  if (grid?.uid == null) throw new Error('维保日历 grid 不在（页面铺设异常）')
  const models = await listFlowModels(token, 'W6B8EAM-cal2')
  const head = models.filter(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid))
    .sort((a, b) => String(a.uid ?? '').localeCompare(String(b.uid ?? '')))[0]
  const currentCode = head === undefined ? '' : String(head.stepParams?.jsSettings?.runJs?.code ?? '')
  if (currentCode === EAM_CALENDAR_CODE) {
    log('w6b8-eam: 维保日历 JSBlock exists (w6b8-calendar kept)')
    return
  }
  if (head === undefined) {
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', { target: { uid: grid.uid }, type: 'jsBlock', settings: { showBlockCard: true, code: EAM_CALENDAR_CODE } }) as { uid?: unknown }
    log(`w6b8-eam: 维保日历 JSBlock created (uid ${String(block.uid ?? '')})`)
    return
  }
  const version = String((head.stepParams?.jsSettings?.runJs as { version?: string } | undefined)?.version ?? 'v2')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: head.uid, name: head.uid, parentId: grid.uid, subKey: 'items', subType: 'array',
    use: 'JSBlockModel', stepParams: { jsSettings: { runJs: { version, code: EAM_CALENDAR_CODE } } }, props: { title: '维保月历' },
  })
  log('w6b8-eam: 维护日历 JSBlock code upgraded (w6b8-calendar)')
}

/**
 * Lay the five EAM pages and grant member view on the four collections (the
 * B2/B4 grant pattern — pages render for every signed-in member; the write
 * fences live in the engine).
 * @param token - the root API token.
 */
export async function ensureEamPages(token: string): Promise<void> {
  await ensureTablePage(token, {
    title: '设备台账', icon: 'DesktopOutlined', sort: 1,
    description: '速冻水饺产线设备台账：编号/类别/所在车间/状态（运行/停机/维修/报废）/责任人；CCP 监控点列标记关键设备（金检机/速冻机/馅料搅拌——与 W6-B4 CCP 监控配置同编号）；工作中心列联动 FCS 排产（Andon 维护请求自动挂接）',
    collection: 'eam_assets',
    columns: [
      { name: 'code', title: '设备编号', kind: 'text' },
      { name: 'name', title: '设备名称', kind: 'text' },
      { name: 'category', title: '类别', kind: 'select', options: ASSET_CATEGORY_ENUM },
      { name: 'workshop', title: '所在车间', kind: 'text' },
      { name: 'status', title: '状态', kind: 'select', options: ASSET_STATUS_ENUM },
      { name: 'owner', title: '责任人', kind: 'text' },
      { name: 'workcenter_id', title: '工作中心', kind: 'number' },
      { name: 'ccp_code', title: 'CCP 监控点', kind: 'text' },
      { name: 'note', title: '备注', kind: 'text' },
    ],
    filterFields: ['category', 'status', 'workshop'], defaultSort: 'asc',
  })
  await ensureTablePage(token, {
    title: '维保计划', icon: 'ScheduleOutlined', sort: 2,
    description: '预防性维保计划（周期规则）：保养内容/周期天数/点检清单/下次保养日——预防性引擎每小时扫描，到期自动生成维保工单（每个错过的周期一张，幂等）',
    collection: 'eam_maint_plans',
    columns: [
      { name: 'code', title: '计划编号', kind: 'text' },
      { name: 'asset_code', title: '设备编号', kind: 'text' },
      { name: 'title', title: '保养内容', kind: 'text' },
      { name: 'frequency_days', title: '周期（天）', kind: 'number' },
      { name: 'next_due_date', title: '下次保养日', kind: 'date' },
      { name: 'last_generated', title: '最近生成', kind: 'date' },
      { name: 'checklist', title: '点检清单', kind: 'text' },
      { name: 'enabled', title: '启用', kind: 'boolean' },
    ],
    filterFields: ['enabled', 'asset_code'], defaultSort: 'asc',
  })
  await ensureTablePage(token, {
    title: '维保工单', icon: 'ToolOutlined', sort: 3,
    description: '维保工单状态机：待受理→维修中→待验收→已验收（单向 CAS；完成需维修说明；验收限发起人或 admin）。来源三路：预防性计划/车间 Andon 维护请求/手动；逾期未完成自动进预警中心（maint_overdue）',
    collection: 'eam_maint_orders',
    columns: [
      { name: 'code', title: '工单号', kind: 'text' },
      { name: 'status', title: '状态', kind: 'select', options: ORDER_STATUS_ENUM },
      { name: 'source', title: '来源', kind: 'select', options: ORDER_SOURCE_ENUM },
      { name: 'priority', title: '优先级', kind: 'select', options: ORDER_PRIORITY_ENUM },
      { name: 'asset_code', title: '设备编号', kind: 'text' },
      { name: 'workcenter_name', title: '工作中心', kind: 'text' },
      { name: 'planned_date', title: '计划日期', kind: 'date' },
      { name: 'problem', title: '问题描述', kind: 'text' },
      { name: 'requested_by', title: '发起人', kind: 'text' },
      { name: 'accepted_by', title: '受理人', kind: 'text' },
      { name: 'actual_min', title: '实际工时(分)', kind: 'number' },
      { name: 'mo_code', title: '关联 MO', kind: 'text' },
    ],
    filterFields: ['status', 'source', 'priority', 'asset_code'], defaultSort: 'desc',
  })
  await ensureTablePage(token, {
    title: '计量校准', icon: 'ExperimentOutlined', sort: 4,
    description: '强检计量器具台账（GB 14881-2025）：器具/检定周期/本次校准日/下次校准日/检定机构/证书号——到期前 14 天预警、3 天内或过期 critical（calibration_due 规则，挂预警中心+mobile）；金检机校准行关联 CCP-JC-01 监控点',
    collection: 'eam_calibrations',
    columns: [
      { name: 'code', title: '校准行号', kind: 'text' },
      { name: 'instrument', title: '计量器具', kind: 'text' },
      { name: 'asset_code', title: '设备编号', kind: 'text' },
      { name: 'ccp_code', title: '关联 CCP', kind: 'text' },
      { name: 'calibrated_at', title: '本次校准日', kind: 'date' },
      { name: 'period_days', title: '周期(天)', kind: 'number' },
      { name: 'next_due_date', title: '下次校准日', kind: 'date' },
      { name: 'agency', title: '检定机构', kind: 'text' },
      { name: 'result', title: '结论', kind: 'select', options: CAL_RESULT_ENUM },
      { name: 'cert_no', title: '证书号', kind: 'text' },
    ],
    filterFields: ['result', 'instrument', 'asset_code'], defaultSort: 'asc',
  })
  await ensureCalendarPage(token)
  for (const name of ['eam_assets', 'eam_maint_plans', 'eam_maint_orders', 'eam_calibrations']) {
    const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim())
    if (granted === 0) {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      log(`w6b8-eam: member→${name} view granted`)
    }
  }
}

// ─── --assert: the acceptance matrix ───

function assertBase(): void {
  log('— 集合与种子')
  const assets = Number(psql('SELECT count(*) FROM eam_assets;').trim())
  check('eam_assets 台账种子 ≥8（速冻水饺产线关键设备）', assets >= 8, `rows=${String(assets)}`)
  const ccpAssets = Number(psql("SELECT count(*) FROM eam_assets WHERE ccp_code <> '';").trim())
  check('CCP 关键设备标记 ≥4（金检/速冻/搅拌/温度计）', ccpAssets >= 4, `rows=${String(ccpAssets)}`)
  const linked = Number(psql('SELECT count(*) FROM eam_assets a JOIN mfg_work_centers w ON w.id = a.workcenter_id;').trim())
  check('设备↔工作中心挂接 ≥5（Andon 自动关联底座）', linked >= 5, `rows=${String(linked)}`)
  const plans = Number(psql('SELECT count(*) FROM eam_maint_plans;').trim())
  check('维保计划种子 =3（周/月/逾期三种形态）', plans === 3, `rows=${String(plans)}`)
  const cals = Number(psql('SELECT count(*) FROM eam_calibrations;').trim())
  check('计量校准种子 =4（过期/临期3天/临期14天/在期）', cals === 4, `rows=${String(cals)}`)
  const jjLink = psql("SELECT count(*) FROM eam_calibrations c JOIN eam_assets a ON a.id = c.asset_id WHERE a.ccp_code = 'CCP-JC-01' AND c.ccp_code = 'CCP-JC-01';").trim()
  check('金检机校准行与 CCP-JC-01 双向关联', Number(jjLink) >= 1, `rows=${jjLink}`)
  for (const idx of ['ux_eam_assets_code', 'ux_eam_maint_orders_code', 'ux_eam_maint_orders_dedup', 'ux_eam_calibrations_code']) {
    check(`唯一索引 ${idx} 在位`, psql(`SELECT indexname FROM pg_indexes WHERE indexname = '${idx}';`).trim() === idx, idx)
  }
  log('— 规则与预警')
  for (const rule of ['calibration_due', 'maint_overdue']) {
    check(`alert_rules ${rule} 启用`, psql(`SELECT enabled FROM alert_rules WHERE rule_type = '${rule}';`).trim() === 't', rule)
  }
}

async function assertPages(token: string): Promise<void> {
  log('— 铺页')
  const routes = await listRoutes(token, 'W6B8EAM-assert')
  for (const title of ['设备台账', '维保计划', '维保工单', '计量校准', '维保日历']) {
    check(`v2 页「${title}」在资产管理组下`, routes.some(row => row.title === title && row.type === 'flowPage'))
  }
  const grants = Number(psql(`SELECT count(DISTINCT rr."name") FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" IN ('eam_assets','eam_maint_plans','eam_maint_orders','eam_calibrations') AND ra."name" = 'view';`).trim())
  check('member 对四集合 view 授权', grants === 4, `grants=${String(grants)}`)
  const models = await listFlowModels(token, 'W6B8EAM-assert2')
  const calBlock = models.find(row => row.use === 'JSBlockModel' && String(row.stepParams?.jsSettings?.runJs?.code ?? '').includes('w6b8-calendar'))
  check('维保日历 JSBlock 挂载（w6b8-calendar 标记）', calBlock !== undefined, calBlock === undefined ? 'missing' : String(calBlock.uid ?? ''))
  const hasCalendarEsc = calBlock !== undefined && String(calBlock.stepParams?.jsSettings?.runJs?.code ?? '').includes('const esc =')
  check('日历块含 esc() 转义（XSS 防线）', hasCalendarEsc)
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureEamCollections(token)
    seedAssets()
    seedPlans()
    seedCalibrations()
    seedEamRules()
    await ensureEamPages(token)
    const rules = await import('./w6b2-rules.mts')
    await rules.ensureAlertPages(token)
    const outcome = scanMaintPlans()
    log(`w6b8-eam: seed complete（预防性引擎首扫：生成 ${String(outcome.created)} 张/推进 ${String(outcome.advanced)} 个计划）`)
    return
  }
  assertBase()
  await assertPages(token)
  if (failures.length > 0) {
    log(`w6b8-eam: assert FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b8-eam: assert PASS')
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}