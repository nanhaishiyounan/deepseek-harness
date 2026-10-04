/**
 * W6-B4: the CCP (critical control point) monitoring base — HACCP semantics
 * on the existing mfg spine.
 *
 * 1. Two collections: mfg_ccp_points (the configuration surface — parameter,
 *    unit, CL bounds, frequency, corrective-action guidance, operation scope;
 *    every threshold lives in a row, never in code) and mfg_ccp_records (the
 *    monitoring ledger the shop-floor card flow appends — who/when/measured/
 *    limit snapshots, the deviation flag, and the operator's corrective
 *    action). The card flow's /job-report writes both through the engine
 *    (:13110) with the session-derived operator.
 * 2. The fifth alert rule ccp_deviation: a deviation record is an alert row
 *    (severity critical, routed per alert_rules.route_to) — the engine's
 *    post-write scanAlerts() pass lands it in wfl_alerts + the in-app
 *    notification, the same B2 channel the other four rules ride.
 * 3. Two governance pages under 质量管理: CCP 监控配置 (the editable point
 *    table) and CCP 监控记录 (the read ledger with deviation highlight).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b4-ccp.mts --seed     # collections + rule + seed points + pages
 *   node --import tsx/esm examples/kb-agent/scripts/w6b4-ccp.mts --assert   # the acceptance matrix
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, ensureFilterForm, ensureTableRowDetail, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'

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

// ─── the two collections' field dictionaries (the B2 field style) ───

/** mfg_ccp_points: one row per monitored CCP parameter (the config surface). */
const CCP_POINTS_FIELDS = [
  { name: 'code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: 'CCP编号' } },
  { name: 'name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '监控参数' } },
  { name: 'unit', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '单位' } },
  { name: 'cl_min', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: 'CL下限' } },
  { name: 'cl_max', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: 'CL上限' } },
  { name: 'frequency', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '监控频率' } },
  { name: 'operation_name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '适用工序名' } },
  { name: 'product_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '限定产品id（空=全部）' } },
  { name: 'corrective_action', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '纠偏动作指引' } },
  { name: 'active', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '启用' } },
] as const

/** mfg_ccp_records: one row per CCP reading (the monitoring ledger, append-only from the terminal). */
const CCP_RECORDS_FIELDS = [
  { name: 'point_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '监控点行' } },
  { name: 'point_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: 'CCP编号（快照）' } },
  { name: 'name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '参数名（快照）' } },
  { name: 'unit', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '单位（快照）' } },
  { name: 'mo_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: 'MO行' } },
  { name: 'mo_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: 'MO编号' } },
  { name: 'op_seq', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '工序号' } },
  { name: 'lot_no', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '批次号' } },
  { name: 'measured', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '实测值' } },
  { name: 'cl_min', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: 'CL下限（快照）' } },
  { name: 'cl_max', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: 'CL上限（快照）' } },
  { name: 'deviation', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '越限' } },
  { name: 'action_taken', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '纠偏动作' } },
  { name: 'operator', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '操作工' } },
  { name: 'recorded_at', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '监控时间（ISO）' } },
  { name: 'submit_key', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '幂等键' } },
] as const

/**
 * Create both collections idempotently (the B2 additive pattern: a present
 * collection keeps its rows; a missing declared field joins through
 * fields:create), then the uniqueness backstops the REST channel cannot
 * declare: one reading per (submit_key, point_id) so a double-tapped card
 * replay lands exactly one ledger row.
 * @param token - the root API token.
 */
export async function ensureCcpCollections(token: string): Promise<void> {
  for (const spec of [
    { name: 'mfg_ccp_points', title: 'CCP监控点', titleField: 'name', fields: CCP_POINTS_FIELDS },
    { name: 'mfg_ccp_records', title: 'CCP监控记录', titleField: 'mo_code', fields: CCP_RECORDS_FIELDS },
  ]) {
    const present = await dataOf(token, 'GET', `/api/collections/${spec.name}`)
      .then(row => (row as { name?: string } | null)?.name === spec.name)
      .catch(() => false)
    if (!present) {
      await dataOf(token, 'POST', '/api/collections:create', { name: spec.name, title: spec.title, titleField: spec.titleField, fields: spec.fields })
      log(`w6b4-ccp: collection ${spec.name} created`)
      continue
    }
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: spec.name } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of spec.fields) {
      if (names.has(field.name)) continue
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: spec.name, ...field })
      log(`w6b4-ccp: ${spec.name}.${field.name} added`)
    }
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_mfg_ccp_records_submit ON mfg_ccp_records (submit_key, point_id);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_mfg_ccp_points_code ON mfg_ccp_points (code);')
}

// ─── the seeded CCP points (the demo line's operations; thresholds live here, the page edits them) ───

/**
 * The three seeded points anchor the operations the in-production line
 * carries (MO-2026-0002 / BOM-0003: 和馅 / 成型速冻 / 内包装 — the operation
 * names verified against mfg_order_operations at batch start; 速冻水饺 classic
 * HACCP plan). product_id NULL = every product whose routing names the
 * operation; the one-sided metal-detection CL exercises the null-bound
 * openness the reader shares with qm_inspection_readings.
 */
const SEED_POINTS: ReadonlyArray<{
  code: string, name: string, unit: string, cl_min: number | null, cl_max: number | null
  frequency: string, operation_name: string, corrective_action: string
}> = [
  {
    code: 'CCP-XT-01', name: '馅料中心温度', unit: '°C', cl_min: 0, cl_max: 10, frequency: '每2小时',
    operation_name: '和馅', corrective_action: '超温即停机，馅料退回冷藏间（≤4°C）隔离存放，本时段和馅评估后处置；制冷设备排查后复测合格再复产',
  },
  {
    code: 'CCP-SD-01', name: '速冻库温度', unit: '°C', cl_min: -30, cl_max: -18, frequency: '每30分钟',
    operation_name: '成型速冻', corrective_action: '调整速冻库温并空库循环一个周期；该时段产品隔离待质量评估（中心温度复测），放行前不得转内包装',
  },
  {
    code: 'CCP-JC-01', name: '金属检测（Fe试块）', unit: 'mm', cl_min: null, cl_max: 2.0, frequency: '每小时+转班首件',
    operation_name: '内包装', corrective_action: '停机校验金探（标准Fe/NonFe/Sus三试块），自上次合格检测起的产品全部隔离重过金探；校验合格并留记录后复产',
  },
]

/**
 * Seed the points idempotently by code (threshold edits made through the
 * page survive a re-seed only when the row is gone — --seed is the baseline,
 * the page is the live config, the same contract seedRules carries).
 * @param token - the root API token (unused psql writes the rows directly —
 * the points carry no uiSchema-side state worth the REST round-trips).
 */
function seedPoints(): void {
  for (const point of SEED_POINTS) {
    psql(`INSERT INTO mfg_ccp_points (code, name, unit, cl_min, cl_max, frequency, operation_name, product_id, corrective_action, active)
VALUES (${sqlLit(point.code)}, ${sqlLit(point.name)}, ${sqlLit(point.unit)}, ${point.cl_min === null ? 'NULL' : String(point.cl_min)}, ${point.cl_max === null ? 'NULL' : String(point.cl_max)}, ${sqlLit(point.frequency)}, ${sqlLit(point.operation_name)}, NULL, ${sqlLit(point.corrective_action)}, TRUE)
ON CONFLICT (code) DO NOTHING;`)
  }
  const count = psql('SELECT count(*) FROM mfg_ccp_points;').trim()
  log(`w6b4-ccp: CCP points present (mfg_ccp_points rows=${count})`)
}

/**
 * Seed the fifth rule row ccp_deviation (quality/critical route). The
 * scanner branch lives in w6b2-rules.mts hitsSelect; this row only carries
 * the routing, so an ops edit on the page re-routes alerts without a deploy.
 */
function seedCcpRule(): void {
  psql(`INSERT INTO alert_rules (rule_type, title, entity, params, schedule, actions, route_to, enabled, note)
VALUES ('ccp_deviation', 'CCP关键限值越限预警', 'mfg_ccp_records', '{}'::json, 'on-write', '["notify_inapp"]'::json, '{"departments": ["质检部"], "users": ["planner", "shop_lead"]}'::json, TRUE, 'W6-B4 seed——车间报工落 CCP 记录时引擎即时扫描产出；critical 级')
ON CONFLICT (rule_type) DO UPDATE SET title = EXCLUDED.title, entity = EXCLUDED.entity, route_to = EXCLUDED.route_to;`)
  log('w6b4-ccp: rule ccp_deviation seeded (route 质检部+planner+shop_lead)')
}

// ─── the two governance pages (the B2 table-page spine) ───

/** Column kinds the two tables render (kind → display model picked by the lib). */
const POINT_COLUMNS = [
  { name: 'code', title: 'CCP编号', kind: 'text' },
  { name: 'name', title: '监控参数', kind: 'text' },
  { name: 'unit', title: '单位', kind: 'text' },
  { name: 'cl_min', title: 'CL下限', kind: 'number' },
  { name: 'cl_max', title: 'CL上限', kind: 'number' },
  { name: 'frequency', title: '监控频率', kind: 'text' },
  { name: 'operation_name', title: '适用工序', kind: 'text' },
  { name: 'active', title: '启用', kind: 'boolean' },
] as const

const RECORD_COLUMNS = [
  { name: 'recorded_at', title: '监控时间', kind: 'text' },
  { name: 'point_code', title: 'CCP编号', kind: 'text' },
  { name: 'name', title: '参数（快照）', kind: 'text' },
  { name: 'mo_code', title: 'MO', kind: 'text' },
  { name: 'op_seq', title: '工序', kind: 'number' },
  { name: 'lot_no', title: '批次', kind: 'text' },
  { name: 'measured', title: '实测值', kind: 'number' },
  { name: 'cl_min', title: 'CL下限', kind: 'number' },
  { name: 'cl_max', title: 'CL上限', kind: 'number' },
  { name: 'deviation', title: '越限', kind: 'boolean' },
  { name: 'operator', title: '操作工', kind: 'text' },
  { name: 'action_taken', title: '纠偏动作', kind: 'text' },
] as const

/** The display model each column kind uses (the w6b2 vocabulary: everything
 * rides DisplayTextFieldModel except enum/date, which have dedicated models). */
const displayModelFor = (kind: string): string =>
  kind === 'select' ? 'DisplayEnumFieldModel'
    : kind === 'date' ? 'DisplayDateTimeFieldModel'
      : 'DisplayTextFieldModel'

/**
 * Lay one table page under 质量管理 idempotently (the B2 spine: group +
 * flowPage + tabs + grid + TableBlock + columns + row detail + filter).
 * @param token - the root API token.
 * @param opts - the page's titles, collection, columns, and sort.
 */
async function ensureTablePage(token: string, opts: {
  title: string, icon: string, sort: number, description: string
  collection: string, columns: ReadonlyArray<{ name: string, title: string, kind: string }>
  filterFields: readonly string[], defaultSort: string
}): Promise<void> {
  const routes = await listRoutes(token, 'W6B4CCP')
  const groupId = routes.find(row => row.title === '质量管理' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 质量管理 missing (run the W-round mfg seeds first)')
  if (routes.some(row => row.title === opts.title && row.type === 'flowPage')) {
    log(`w6b4-ccp: v2 page ${opts.title} exists (kept)`)
    return
  }
  const routeUid = withN17Prefix('w6b4c', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: opts.title, icon: opts.icon, type: 'flowPage', parentId: groupId, sort: opts.sort, schemaUid: routeUid }) as { id?: unknown }
  const tabUid = withN17Prefix('w6b4c', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b4c', 'ts') })
  const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  await save({ uid: withN17Prefix('w6b4c', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: opts.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: opts.title, displayTitle: true, enableTabs: false, description: opts.description } } } })
  const gridUid = withN17Prefix('w6b4c', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  const tableUid = withN17Prefix('w6b4c', 'tb')
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
    const uid = withN17Prefix('w6b4c', 'k')
    const model = displayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: opts.collection, fieldPath: column.name } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title: column.title, dataIndex: column.name, width: 130, editable: false, sorter: false, fixed: 'none' },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: opts.collection, dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false },
    })
    sortIndex += 1
  }
  await save({ uid: withN17Prefix('w6b4c', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
  await ensureTableRowDetail(token, tableUid, {
    collection: opts.collection,
    fields: opts.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind) })),
    tabTitle: `${opts.title}详情`,
    actionsColumnSortIndex: opts.columns.length + 1,
  })
  await ensureFilterForm(token, { gridUid, tableUid, collection: opts.collection, fields: opts.filterFields.map(fieldPath => ({ fieldPath })) })
  log(`w6b4-ccp: v2 page ${opts.title} created (/admin/${routeUid})`)
}

/** Lay both pages and grant member view on the two collections (the B2/B3 grant pattern). */
export async function ensureCcpPages(token: string): Promise<void> {
  await ensureTablePage(token, {
    title: 'CCP监控配置', icon: 'DashboardOutlined', sort: 6,
    description: 'HACCP 关键控制点配置：参数/单位/CL 关键限值上下限/监控频率/适用工序/纠偏动作指引——修改后下一张卡片即按新限值判定（限值在行上，不在代码里）',
    collection: 'mfg_ccp_points', columns: POINT_COLUMNS, filterFields: ['operation_name', 'active'], defaultSort: 'asc',
  })
  await ensureTablePage(token, {
    title: 'CCP监控记录', icon: 'FileSearchOutlined', sort: 7,
    description: 'CCP 监控台账（车间卡片流落库，只读留痕）：谁/何时/实测值/CL限值快照/是否越限/纠偏动作——越限行同步产出 critical 预警与纠偏单',
    collection: 'mfg_ccp_records', columns: RECORD_COLUMNS, filterFields: ['deviation', 'point_code', 'mo_code'], defaultSort: 'desc',
  })
  for (const name of ['mfg_ccp_points', 'mfg_ccp_records']) {
    const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim())
    if (granted === 0) {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      log(`w6b4-ccp: member→${name} view granted`)
    }
  }
}

// ─── --assert: the acceptance matrix ───

function assertBase(): void {
  log('— 集合与规则')
  const points = Number(psql('SELECT count(*) FROM mfg_ccp_points;').trim())
  check('mfg_ccp_points 三条种子监控点', points >= 3, `rows=${String(points)}`)
  const ops = psql("SELECT string_agg(DISTINCT operation_name, ',' ORDER BY operation_name) FROM mfg_ccp_points;").trim()
  check('监控点锚定在产 MO 的真实工序名（和馅/成型速冻/内包装）', ops === '内包装,和馅,成型速冻', ops)
  const oneSided = psql('SELECT count(*) FROM mfg_ccp_points WHERE cl_min IS NULL AND cl_max IS NOT NULL;').trim()
  check('单侧 CL（金检只有上限）', Number(oneSided) >= 1, `rows=${String(oneSided)}`)
  const idx = psql("SELECT indexname FROM pg_indexes WHERE indexname = 'ux_mfg_ccp_records_submit';").trim()
  check('(submit_key, point_id) 唯一索引在位', idx === 'ux_mfg_ccp_records_submit', idx)
  const rule = psql("SELECT enabled FROM alert_rules WHERE rule_type = 'ccp_deviation';").trim()
  check('ccp_deviation 规则行启用', rule === 't', rule)
}

async function assertPages(token: string): Promise<void> {
  log('— 治理面铺页')
  const routes = await listRoutes(token, 'W6B4CCP-assert')
  for (const title of ['CCP监控配置', 'CCP监控记录']) {
    check(`v2 页「${title}」在质量管理组下`, routes.some(row => row.title === title && row.type === 'flowPage'))
  }
  const grants = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" IN ('mfg_ccp_points','mfg_ccp_records') AND ra."name" = 'view';`).trim())
  check('member 对两集合 view 授权', grants === 2, `grants=${String(grants)}`)
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureCcpCollections(token)
    seedPoints()
    seedCcpRule()
    await ensureCcpPages(token)
    log('w6b4-ccp: seed complete')
    return
  }
  assertBase()
  await assertPages(token)
  if (failures.length > 0) {
    log(`w6b4-ccp: assert FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b4-ccp: assert PASS')
}

await main()
