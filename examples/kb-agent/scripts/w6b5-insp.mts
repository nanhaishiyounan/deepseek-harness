/**
 * W6-B5: the QMS inspection workbench base — queue + AQL wizard + four-way
 * disposal + the nine-element factory report, on the existing qm_* spine.
 *
 * 1. Additive fields: qm_inspections gains submit_key (the verdict CAS —
 *    one claim per pending row, double-tap replays land once) and
 *    photo_evidence (the wizard's compressed on-site photo dataURL).
 * 2. The archive collection qm_factory_reports: one row per issued report
 *    (report_no = the 检验合格证号 of 食安法 §51; unique per inspection — one
 *    inspection issues exactly once).
 * 3. The sixth alert rule inspection_fail (quality/critical): a failed
 *    verdict is an alert row the moment /insp/submit's scanAlerts pass runs
 *    — the same B2 channel ccp_deviation rides. This also repairs the B2
 *    assert's rule-count drift (four → six).
 * 4. Two pages under 质量管理: 检验工作台 (iframe onto approval-engine /insp,
 *    the designer-embed posture) and 出厂检验报告 (the archive table).
 * 5. Two rehearsal inspections (QI-W6B5-* — IQC lot 300 / OQC lot 350) so
 *    the wizard walkthrough touches identifiable, cleanable rows; --cleanup
 *    removes them and their readings/reports/alerts/CAPA aftermath.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --seed     # fields + collection + rule + pages + rehearsal rows
 *   node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --assert   # the acceptance matrix
 *   node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --cleanup  # drop the rehearsal rows and aftermath
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, ensureFilterForm, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import { inspPlan, inspReport } from '../insp/src/server.ts'

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

// ─── the additive fields + the archive collection ───

/** qm_inspections additive fields (present rows keep everything). */
const INSPECTION_FIELDS = [
  { name: 'submit_key', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '提交幂等键' } },
  { name: 'photo_evidence', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '现场照片留证（dataURL）' } },
] as const

/** qm_factory_reports: one archived report row (the nine elements' snapshot). */
const REPORT_FIELDS = [
  { name: 'report_no', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '报告编号（检验合格证号）' } },
  { name: 'inspection_id', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '检验单行' } },
  { name: 'inspection_code', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '检验单号' } },
  { name: 'insp_type', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '检验类型' } },
  { name: 'product_name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '产品名称' } },
  { name: 'qty', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '数量' } },
  { name: 'lot_no', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '生产批号' } },
  { name: 'basis', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '检验依据（执行标准号）' } },
  { name: 'items', type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: '检验项目明细（JSON）' } },
  { name: 'conclusion', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '检验结论' } },
  { name: 'reporter', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '报告人' } },
  { name: 'reviewer', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '审核人' } },
  { name: 'issued_at', type: 'date', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '签发日期' } },
] as const

/**
 * Add the two qm_inspections fields and create qm_factory_reports (the B4
 * additive pattern), then the uniqueness backstops the REST channel cannot
 * declare: one archive row per report_no and per inspection.
 * @param token - the root API token.
 */
export async function ensureInspCollections(token: string): Promise<void> {
  const inspNames = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'qm_inspections' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
  for (const field of INSPECTION_FIELDS) {
    if (inspNames.has(field.name)) continue
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'qm_inspections', ...field })
    log(`w6b5-insp: qm_inspections.${field.name} added`)
  }
  const present = await dataOf(token, 'GET', '/api/collections/qm_factory_reports')
    .then(row => (row as { name?: string } | null)?.name === 'qm_factory_reports')
    .catch(() => false)
  if (!present) {
    await dataOf(token, 'POST', '/api/collections:create', { name: 'qm_factory_reports', title: '出厂检验报告', titleField: 'report_no', fields: REPORT_FIELDS })
    log('w6b5-insp: collection qm_factory_reports created')
  }
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_qm_factory_reports_no ON qm_factory_reports (report_no);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_qm_factory_reports_insp ON qm_factory_reports (inspection_code);')
}

// ─── the sixth alert rule ───

/** Seed the inspection_fail rule row (the scanner branch lives in w6b2-rules hitsSelect). */
function seedInspectionFailRule(): void {
  psql(`INSERT INTO alert_rules (rule_type, title, entity, params, schedule, actions, route_to, enabled, note)
VALUES ('inspection_fail', '检验拒收预警', 'qm_inspections', '{}'::json, 'on-write', '["notify_inapp"]'::json, '{"departments": ["质检部"], "users": ["quality_lead", "planner"]}'::json, TRUE, 'W6-B5 seed——检验工作台提交拒收判定时引擎即时扫描产出；critical 级；特采处置另走 quality_abnormal 未闭环')
ON CONFLICT (rule_type) DO UPDATE SET title = EXCLUDED.title, entity = EXCLUDED.entity, route_to = EXCLUDED.route_to;`)
  log('w6b5-insp: rule inspection_fail seeded (route 质检部+quality_lead+planner)')
}

// ─── the two pages ───

/** Display model per column kind (the w6b2 vocabulary). */
const displayModelFor = (kind: string): string =>
  kind === 'date' ? 'DisplayDateTimeFieldModel' : 'DisplayTextFieldModel'

const REPORT_COLUMNS = [
  { name: 'report_no', title: '报告编号（合格证号）', kind: 'text' },
  { name: 'inspection_code', title: '检验单', kind: 'text' },
  { name: 'insp_type', title: '类型', kind: 'text' },
  { name: 'product_name', title: '产品', kind: 'text' },
  { name: 'qty', title: '数量', kind: 'number' },
  { name: 'lot_no', title: '批号', kind: 'text' },
  { name: 'conclusion', title: '结论', kind: 'text' },
  { name: 'reporter', title: '报告人', kind: 'text' },
  { name: 'reviewer', title: '审核人', kind: 'text' },
  { name: 'issued_at', title: '签发日期', kind: 'date' },
] as const

/**
 * Lay the two pages idempotently: the workbench (group + flowPage + tabs +
 * grid + one IframeBlockModel onto the engine's /insp — runjs strips
 * <iframe> tags so mode:url IframeBlockModel is the supported path) and the
 * report archive table (the B2 table-page spine).
 * @param token - the root API token.
 */
export async function ensureInspPages(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W6B5INSP')
  const groupId = routes.find(row => row.title === '质量管理' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 质量管理 missing (run the W-round mfg seeds first)')
  if (!routes.some(row => row.title === '检验工作台' && row.type === 'flowPage')) {
    const routeUid = withN17Prefix('w6b5i', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '检验工作台', icon: 'AuditOutlined', type: 'flowPage', parentId: groupId, sort: 8, schemaUid: routeUid }) as { id?: unknown }
    const tabUid = withN17Prefix('w6b5i', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b5i', 'ts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({ uid: withN17Prefix('w6b5i', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: '检验工作台', displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: '检验工作台', displayTitle: true, enableTabs: false, description: '质检员工作台：待检队列（IQC/IPQC/OQC 分组+逾期高亮）→ AQL 徽章向导卡（15 段表抽样方案+逐项实测+超差双按钮防误）→ 判定落库 → 拒收四路处置；触屏友好（现场平板）' } } } })
    const gridUid = withN17Prefix('w6b5i', 'g')
    await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid }, type: 'iframe',
      settings: { mode: 'url', url: `${ENGINE_BASE}/insp`, height: 940 },
    })
    const blockUid = block?.uid ?? block?.tree?.uid
    if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for the workbench embed: ${JSON.stringify(block).slice(0, 200)}`)
    log(`w6b5-insp: v2 page 检验工作台 created (iframe ${blockUid} → ${ENGINE_BASE}/insp)`)
  } else {
    log('w6b5-insp: v2 page 检验工作台 exists (kept)')
  }
  if (!routes.some(row => row.title === '出厂检验报告' && row.type === 'flowPage')) {
    const routeUid = withN17Prefix('w6b5r', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '出厂检验报告', icon: 'FileDoneOutlined', type: 'flowPage', parentId: groupId, sort: 9, schemaUid: routeUid }) as { id?: unknown }
    const tabUid = withN17Prefix('w6b5r', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b5r', 'ts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({ uid: withN17Prefix('w6b5r', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: '出厂检验报告', displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: '出厂检验报告', displayTitle: true, enableTabs: false, description: '九要素报告台账（沪市监食监〔2025〕195 号：产品名称/规格/数量/生产日期或批号/保质期/检验依据/结论/报告人/审核人）；报告编号=检验合格证号（食安法第 51 条）——从检验工作台签发留档' } } } })
    const gridUid = withN17Prefix('w6b5r', 'g')
    await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    const tableUid = withN17Prefix('w6b5r', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
      props: { title: '出厂检验报告' },
      stepParams: {
        resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'qm_factory_reports' } },
        tableSettings: { defaultSorting: { sort: [{ field: 'id', direction: 'desc' }] } },
      },
    })
    let sortIndex = 1
    for (const column of REPORT_COLUMNS) {
      const uid = withN17Prefix('w6b5r', 'k')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'qm_factory_reports', fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 130, editable: false, sorter: false, fixed: 'none' },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: 'qm_factory_reports', dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false },
      })
      sortIndex += 1
    }
    await save({ uid: withN17Prefix('w6b5r', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' }, stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } } })
    await ensureTableRowDetail(token, tableUid, {
      collection: 'qm_factory_reports',
      fields: REPORT_COLUMNS.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind) })),
      tabTitle: '报告详情', actionsColumnSortIndex: REPORT_COLUMNS.length + 1,
    })
    await ensureFilterForm(token, { gridUid, tableUid, collection: 'qm_factory_reports', fields: [{ fieldPath: 'insp_type' }, { fieldPath: 'conclusion' }] })
    log('w6b5-insp: v2 page 出厂检验报告 created')
  } else {
    log('w6b5-insp: v2 page 出厂检验报告 exists (kept)')
  }
  for (const name of ['qm_factory_reports']) {
    const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim())
    if (granted === 0) {
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      log(`w6b5-insp: member→${name} view granted`)
    }
  }
}

// ─── the rehearsal rows (identifiable, cleanable) ───

/**
 * Two rehearsal inspections: IQC lot 300 (a real supplier + product so the
 * rigor switch and the report assembly exercise real joins) and OQC lot 350
 * (the factory-report leg). ref_no points at W6B5-marked placeholders so no
 * live receipt/completion row is touched by the verdict's anchor write-back
 * (a missing anchor row is skipped by inspectInspection).
 */
function seedRehearsalRows(): void {
  const product = psql("SELECT id FROM hub_inv_products WHERE status = 'active' ORDER BY id LIMIT 1;").trim()
  const supplier = psql("SELECT id FROM srm_suppliers ORDER BY id LIMIT 1;").trim()
  if (product === '' || supplier === '') throw new Error('rehearsal rows need one active product + one supplier (run the W-round seeds)')
  psql(`INSERT INTO qm_inspections (code, insp_type, ref_type, ref_no, lot_no, lot_qty, result, status, product_id, supplier_id, note)
VALUES ('QI-W6B5-01', 'IQC', 'receipt', 'W6B5-RCV-DEMO', 'W6B5-LOT-IQC', 300, 'pending', 'pending', ${product}, ${supplier}, 'W6-B5 演练数据（IQC 向导全流程）——可清理')
ON CONFLICT DO NOTHING;`)
  psql(`INSERT INTO qm_inspections (code, insp_type, ref_type, ref_no, lot_no, lot_qty, result, status, product_id, supplier_id, note)
VALUES ('QI-W6B5-F1', 'OQC', 'completion', 'W6B5-CMP-DEMO', 'W6B5-LOT-FQC', 350, 'pending', 'pending', ${product}, NULL, 'W6-B5 演练数据（OQC 出厂报告九要素）——可清理')
ON CONFLICT DO NOTHING;`)
  log('w6b5-insp: rehearsal inspections QI-W6B5-01 (IQC N=300) + QI-W6B5-F1 (OQC N=350) ensured')
}

/** Remove the rehearsal rows and every row their verdicts produced. */
function cleanupRehearsalRows(): void {
  const ids = psql("SELECT string_agg(id::text, ',') FROM qm_inspections WHERE code LIKE 'QI-W6B5-%';").trim()
  if (ids !== '') {
    psql(`DELETE FROM qm_inspection_readings WHERE inspection_id IN (${ids});`)
    psql(`DELETE FROM wfl_alerts WHERE dedup_key LIKE 'inspection_fail:qm_inspections:%' AND entity_id IN (${ids});`)
    psql(`DELETE FROM srm_capas WHERE title LIKE '检验不合格·QI-W6B5-%';`)
    psql(`DELETE FROM qm_nc_dispositions WHERE reason LIKE '%QI-W6B5-%' OR inspection_id IN (${ids});`)
  }
  psql("DELETE FROM qm_factory_reports WHERE inspection_code LIKE 'QI-W6B5-%';")
  psql("DELETE FROM qm_inspections WHERE code LIKE 'QI-W6B5-%';")
  log('w6b5-insp: rehearsal rows + readings + reports + alerts + CAPA aftermath removed')
}

// ─── --assert: the acceptance matrix ───

function assertBase(): void {
  log('— 集合与规则')
  const submitKey = psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'qm_inspections' AND column_name = 'submit_key';").trim()
  check('qm_inspections.submit_key 列在位（幂等 CAS）', submitKey === '1', `cols=${submitKey}`)
  const photo = psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'qm_inspections' AND column_name = 'photo_evidence';").trim()
  check('qm_inspections.photo_evidence 列在位（拍照留证）', photo === '1', `cols=${photo}`)
  const reportCols = psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'qm_factory_reports' AND column_name IN ('report_no','inspection_code','insp_type','product_name','qty','lot_no','basis','items','conclusion','reporter','reviewer','issued_at');").trim()
  check('qm_factory_reports 九要素档案列齐全（12 列）', reportCols === '12', `cols=${reportCols}`)
  const noIdx = psql("SELECT count(*) FROM pg_indexes WHERE indexname IN ('ux_qm_factory_reports_no','ux_qm_factory_reports_insp');").trim()
  check('报告编号唯一 + 一检验一报告 唯一索引', noIdx === '2', `idx=${noIdx}`)
  const rule = psql("SELECT enabled FROM alert_rules WHERE rule_type = 'inspection_fail';").trim()
  check('inspection_fail 规则行启用', rule === 't', rule)
  const pending = Number(psql("SELECT count(*) FROM qm_inspections WHERE status = 'pending' AND result = 'pending';").trim())
  check('队列口径有待检单（status=pending ∧ result=pending）', pending >= 2, `rows=${String(pending)}`)
  // W6-B6 fix-debt smokes: the judged column reads psql's boolean::text
  // ('true'/'false') and the issued report carries its signing reviewer.
  const passRaw = psql("SELECT COALESCE(pass::text,'') FROM qm_inspection_readings WHERE inspection_id = (SELECT id FROM qm_inspections WHERE code = 'QI-W6B5-01') ORDER BY id LIMIT 1;").trim()
  if (passRaw !== '') {
    const report = inspReport('QI-W6B5-01')
    const first = report.items[0]
    const expected = passRaw === 'true' ? '合格' : passRaw === 'false' ? '不合格' : '—'
    check('报告明细「单项判定」首行非恒 — 且语义与 pass 一致', first !== undefined && first.judged === expected, `judged=${first?.judged ?? '无行'} pass=${passRaw}`)
  } else {
    check('报告明细判定冒烟（演练读数在册）', false, 'QI-W6B5-01 无读数——先 --seed')
  }
  const reportCount = psql("SELECT count(*) FROM qm_factory_reports WHERE inspection_code LIKE 'QI-W6B5-%';").trim()
  if (reportCount !== '0') {
    const reviewer = psql("SELECT COALESCE(reviewer,'') || '|' || COALESCE(report_no,'') FROM qm_factory_reports WHERE inspection_code LIKE 'QI-W6B5-%' ORDER BY id LIMIT 1;").trim()
    const rendered = inspReport(psql("SELECT inspection_code FROM qm_factory_reports WHERE inspection_code LIKE 'QI-W6B5-%' ORDER BY id LIMIT 1;").trim())
    const reviewerElement = rendered.elements.find(element => element.label === '审核人（复核放行）')
    check('签发报告 reviewer 非空（签发人回填）且渲染按档案回读', reviewer.split('|')[0] !== '' && reviewerElement?.value === reviewer.split('|')[0], `db=${reviewer} render=${reviewerElement?.value ?? '无'} 报告=${reviewer.split('|')[1] ?? ''}`)
  } else {
    check('出厂报告签发留档在册（reviewer 冒烟前提）', false, '无 W6B5 报告——先走签发腿')
  }
}

function assertPlanEngine(): void {
  log('— AQL 15 段对拍（psql 直查 × 向导 inspPlan × W2 种子锚点三方一致）')
  // (N, aql, rigor, n, ac, re) — the W2 seed's three regression anchors. The
  // first two also ride inspPlan with a null supplier (rigor stays normal —
  // the wizard path); the tightened anchor is direct-SQL only because the
  // switch state needs a tightened supplier row (GB/T 2828.1 9.2), which the
  // rehearsal data does not seed.
  const anchors: ReadonlyArray<[number, string, string, number, number, number]> = [
    [200, '2.5', 'normal', 32, 2, 3],
    [300, '2.5', 'normal', 50, 3, 4],
    [350, '2.5', 'normal', 50, 3, 4],
    [2000, '2.5', 'tightened', 125, 5, 6],
  ]
  for (const [lotQty, aql, rigor, n, ac, re] of anchors) {
    const direct = psql(`SELECT n || '|' || ac || '|' || re FROM qm_aql_plans WHERE lot_band = (SELECT lot_band FROM qm_aql_plans WHERE ${String(lotQty)} BETWEEN split_part(lot_band,'-',1)::int AND split_part(lot_band,'-',2)::int LIMIT 1) AND aql = '${aql}' AND rigor = '${rigor}' LIMIT 1;`).trim()
    const directOk = direct === `${String(n)}|${String(ac)}|${String(re)}`
    if (rigor === 'normal') {
      const wizard = inspPlan(lotQty, aql, 'IPQC', null)
      check(`N=${String(lotQty)} × AQL ${aql} × ${rigor} → n=${String(n)} Ac=${String(ac)} Re=${String(re)}（直查=${direct} 向导=${String(wizard.n)}/${String(wizard.ac)}/${String(wizard.re)}）`, directOk && wizard.n === n && wizard.ac === ac && wizard.re === re, `band=${wizard.lot_band}/${wizard.code}`)
    } else {
      check(`N=${String(lotQty)} × AQL ${aql} × ${rigor} → n=${String(n)} Ac=${String(ac)} Re=${String(re)}（直查=${direct}；tightened 需加严供应商，向导侧不虚演）`, directOk, '')
    }
  }
}

async function assertPages(token: string): Promise<void> {
  log('— 治理面铺页')
  const routes = await listRoutes(token, 'W6B5INSP-assert')
  for (const title of ['检验工作台', '出厂检验报告']) {
    check(`v2 页「${title}」在质量管理组下`, routes.some(row => row.title === title && row.type === 'flowPage'))
  }
  const models = await listFlowModels(token, 'W6B5INSP-iframe')
  const embed = models.find(row => row.use === 'IframeBlockModel' && String(row.props?.url ?? '').endsWith('/insp'))
  check('检验工作台 iframe 块指向引擎 /insp', embed !== undefined, embed === undefined ? 'no IframeBlockModel→/insp' : String(embed.props?.url))
  const granted = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = 'qm_factory_reports' AND ra."name" = 'view';`).trim())
  check('member 对 qm_factory_reports view 授权（其他角色只读）', granted === 1, `grants=${String(granted)}`)
}

async function main(): Promise<void> {
  if (mode === 'cleanup') {
    cleanupRehearsalRows()
    log('w6b5-insp: cleanup complete')
    return
  }
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureInspCollections(token)
    seedInspectionFailRule()
    await ensureInspPages(token)
    seedRehearsalRows()
    log('w6b5-insp: seed complete')
    return
  }
  assertBase()
  assertPlanEngine()
  await assertPages(token)
  if (failures.length > 0) {
    log(`w6b5-insp: assert FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b5-insp: assert PASS')
}

await main()
