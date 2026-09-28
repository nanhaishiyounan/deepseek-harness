/**
 * W3-B5: the organization & permission surface — department tree + employee
 * affiliation + the role×collection action matrix page + department-routed
 * approval (plans/2026-09-27-w3-usability/05-b5-org-acl.md).
 *
 * Six effects, one script:
 *
 * 1. Seeds: the department tree (新源食品集团 → 采购部/计划部（PMC）/生产车间/
 *    质检部/仓储部/销售部/行政人事部 + the empty 储备人才池 negative fixture)
 *    on plugin-departments' own collections — no org_departments/org_employees
 *    is ever built (PLAN D7); demo users attach through departmentsUsers
 *    (whose afterSave hook syncs users.mainDepartmentId); the qc_inspector
 *    demo user joins 质检部 so department routing expands to a real
 *    multi-person tier.
 * 2. The hub roster column: hub_hr_employees gains the org_dept m2o (→
 *    departments) and shows it on the f3 员工 page — the roster keeps only
 *    extension info; the single source of truth stays departments/users.
 * 3. The 组织架构 page (人事管理): a JSBlock SVG org chart (departments ×
 *    members with #id labels) plus editable departments / departmentsUsers /
 *    users tables (Add-new + row Edit) — a real operator can maintain the
 *    tree and affiliations without the settings center.
 * 4. The 权限矩阵 page (协同办公, admin+root only — member menu binding
 *    dropped, the B4 bindAdminOnlyMenu pattern): a JSBlock read-only matrix
 *    (role × collection × view/create/update/destroy/export) rendered from
 *    rolesResources/rolesResourcesActions, plus the two direct-write tables
 *    (rolesResourcesActions Add-new/Edit = granting a cell) — the D7
 *    「只读渲染 + 表单直写」split.
 * 5. member's business action matrix: view/list stay (B1) and create/update
 *    join per business domain (采购 pur_*, 仓储 wms_* documents, 质量 qm_*,
 *    生产执行 mfg_*, 销售 so_orders, wfl todos update); engine-owned ledgers
 *    (wms_stock, wms_movements) and every destroy/export stay admin-only.
 *    Grants land before any probe runs (the risk-④ authorize-first order).
 * 6. Department routing live: qm_nc_dispositions' approver_map manager
 *    becomes {type:'department', value:'质检部'} through the B4 config-center
 *    data channel (REST + config_note audit), a witness disposition submits
 *    → todos expand to every 质检部 member → one member acts → the rest void
 *    (W2 OR-sign-off semantics).
 *
 * Modes: (default) build | --assert | --probe-acl-flip | --probe-dept-routing
 * | --rollback (destroys w3b5 flowModels + the two pages' routes; the seeds
 * and member grants are data and stay — the matrix page can revoke them).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-org-acl.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-org-acl.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-org-acl.mts --probe-acl-flip
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-org-acl.mts --probe-dept-routing
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-org-acl.mts --rollback
 */
import {
  call,
  dataOf,
  ensureTableRowDetail,
  listFlowModels,
  listRoutes,
  rowDetailOpenView,
  signInWithRetry,
  withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import { assertWflConsistency } from './nocobase-w3-approval-visual.mts'
import { act, submitForApproval, type NocoIO } from './approval-engine.mts'
import { pathToFileURL } from 'node:url'

/** uid for W3-B5 rows; the `w3b5` prefix is the --rollback anchor. */
const withW3b5Prefix = (tag: string): string => withN17Prefix('w3b5', tag)

const ORG_PAGE_TITLE = '组织架构'
const MATRIX_PAGE_TITLE = '权限矩阵'
const ORG_GROUP = '组织与系统'
const MATRIX_GROUP = '项目与协同'
/**
 * The department-routed flow: w8's amount-less concession flow — b9's 9-step
 * chain and setup verify pin no approver_map on it, and 质检部 approving
 * dispositions is the business-correct routing.
 */
const DEPT_ROUTED_DOC_TYPE = 'qm_nc_dispositions'
const DEPT_ROUTED_DEPARTMENT = '质检部'
/** The witness disposition code prefix (the routing demo's idempotence anchor). */
const WITNESS_CODE_PREFIX = 'NC-W3B5-DEPT'

/** The department tree root's children, in seed order. */
const DEPT_CHILDREN = [
  '采购部', '计划部（PMC）', '生产车间', '质检部', '仓储部', '销售部', '行政人事部', '储备人才池',
] as const
const ROOT_DEPT_TITLE = '新源食品集团'

/**
 * Department → member usernames. 储备人才池 stays member-less on purpose —
 * the engine's empty-department fail-loud negative needs a real fixture.
 */
const DEPT_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  '采购部': ['chenliqun', 'admin'],
  '计划部（PMC）': ['wangyifan'],
  '生产车间': ['linjingyi'],
  '质检部': ['quality_lead', 'qc_inspector'],
  '仓储部': ['b4guard'],
  '销售部': ['zhaoxiaofang'],
  '行政人事部': ['nocobase'],
  '储备人才池': [],
}

/** The one demo user this batch creates (a second sign-in-able 质检部 member so department routing expands to two todos). */
const QC_INSPECTOR = { username: 'qc_inspector', nickname: '质检员·王倩', password: 'Qc#2026' } as const

/** hub_hr_employees roster rows backfill org_dept by employee name → department title. */
const EMPLOYEE_DEPT: Readonly<Record<string, string>> = {
  '陈立群': '采购部', '王一帆': '计划部（PMC）', '林静怡': '生产车间', '赵晓芳': '销售部',
  '刘一诺': '行政人事部', '周子墨': '质检部',
}

/**
 * member's business action matrix (W3-B5 §3): the granted action names per
 * collection. view/list ride the B1 grants; create/update land here per
 * business domain. Engine-owned ledgers (wms_stock, wms_movements) and every
 * destroy/export stay admin-only — the matrix page is the maintenance entry.
 */
const MEMBER_MATRIX: ReadonlyArray<{ collection: string, actions: readonly string[] }> = [
  { collection: 'pur_requests', actions: ['create', 'update'] },
  { collection: 'pur_rfqs', actions: ['create', 'update'] },
  { collection: 'pur_quotes', actions: ['create', 'update'] },
  { collection: 'pur_orders', actions: ['create', 'update'] },
  { collection: 'pur_invoices', actions: ['create', 'update'] },
  { collection: 'pur_payments', actions: ['create', 'update'] },
  { collection: 'wms_receipts', actions: ['create', 'update'] },
  { collection: 'wms_shipments', actions: ['create', 'update'] },
  { collection: 'wms_transfers', actions: ['create', 'update'] },
  { collection: 'wms_counts', actions: ['create', 'update'] },
  { collection: 'qm_inspections', actions: ['create', 'update'] },
  { collection: 'qm_inspection_readings', actions: ['create', 'update'] },
  { collection: 'qm_nc_dispositions', actions: ['update'] },
  { collection: 'mfg_job_reports', actions: ['create', 'update'] },
  { collection: 'mfg_material_issues', actions: ['create', 'update'] },
  { collection: 'mfg_material_returns', actions: ['create', 'update'] },
  { collection: 'mfg_completions', actions: ['create', 'update'] },
  { collection: 'so_orders', actions: ['create', 'update'] },
  { collection: 'wfl_approval_todos', actions: ['update'] },
]

/** The matrix page's row collections (core business surface + governance + org). */
const MATRIX_ROWS: readonly string[] = [
  ...new Set([
    'pur_requests', 'pur_rfqs', 'pur_quotes', 'pur_orders', 'pur_invoices', 'pur_payments',
    'wms_receipts', 'wms_shipments', 'wms_transfers', 'wms_counts', 'wms_stock', 'wms_movements',
    'qm_inspections', 'qm_inspection_readings', 'qm_nc_dispositions', 'qm_aql_plans',
    'mfg_orders', 'mfg_job_reports', 'mfg_material_issues', 'mfg_completions',
    'so_orders', 'mps_plans', 'mrp_suggestions', 'srm_suppliers', 'srm_capas', 'kpi_snapshots',
    'wfl_flow_configs', 'wfl_approval_todos', 'wfl_approval_records',
    'departments', 'departmentsUsers', 'users',
  ]),
]

const MATRIX_ACTIONS = ['view', 'create', 'update', 'destroy', 'export'] as const

// ─── a token-backed NocoIO (the engine's submit/act entry points) ───

const listFilter = (filter: Record<string, unknown> | undefined): string =>
  filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`

/** NocoIO over the root token — the same REST wire the engine's RestIO rides. */
class TokenIO implements NocoIO {
  constructor(private readonly token: string) {}

  async list(collection: string, filter?: Record<string, unknown>): Promise<Array<Record<string, any>>> {
    return await dataOf(this.token, 'GET', `/api/${collection}:list?pageSize=500${listFilter(filter)}`) ?? []
  }

  async get(collection: string, id: number): Promise<Record<string, any> | undefined> {
    return await dataOf(this.token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined
  }

  async create(collection: string, values: Record<string, unknown>): Promise<Record<string, any>> {
    return await dataOf(this.token, 'POST', `/api/${collection}:create`, values)
  }

  async update(collection: string, id: number, values: Record<string, unknown>): Promise<void> {
    await dataOf(this.token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  }

  async updateWhere(collection: string, filter: Record<string, unknown>, values: Record<string, unknown>): Promise<number> {
    const rows = await dataOf(this.token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  }

  async destroy(collection: string, id: number): Promise<void> {
    await call(this.token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  }
}

// ─── seeds ───

/** The department tree, idempotent by title (root first, then children by parentId). */
async function ensureDepartments(token: string): Promise<void> {
  const rows = await dataOf(token, 'GET', '/api/departments:list?pageSize=200') as Array<Record<string, any>> | null ?? []
  const byTitle = new Map(rows.map(row => [String(row.title ?? ''), Number(row.id)]))
  let rootId = byTitle.get(ROOT_DEPT_TITLE)
  if (rootId === undefined) {
    rootId = Number((await dataOf(token, 'POST', '/api/departments:create', { title: ROOT_DEPT_TITLE }))?.id)
    console.log(`nocobase-w3-org-acl: department root「${ROOT_DEPT_TITLE}」created (#${rootId})`)
  }
  let created = 0
  for (const title of DEPT_CHILDREN) {
    if (byTitle.has(title)) continue
    await dataOf(token, 'POST', '/api/departments:create', { title, parentId: rootId })
    created += 1
  }
  console.log(`nocobase-w3-org-acl: department tree — ${DEPT_CHILDREN.length} business departments ${created > 0 ? `(${created} created)` : '(in place)'} under ${ROOT_DEPT_TITLE}`)
}

/** The qc_inspector demo user (idempotent by username). */
async function ensureDemoUser(token: string): Promise<void> {
  const users = await dataOf(token, 'GET', `/api/users:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ username: { $eq: QC_INSPECTOR.username } }))}`) as Array<Record<string, any>> | null ?? []
  if ((users ?? []).length > 0) return
  await dataOf(token, 'POST', '/api/users:create', {
    username: QC_INSPECTOR.username, nickname: QC_INSPECTOR.nickname,
    email: `${QC_INSPECTOR.username}@w3b5.demo`, password: QC_INSPECTOR.password,
  })
  console.log(`nocobase-w3-org-acl: ${QC_INSPECTOR.username} demo user created (${QC_INSPECTOR.nickname})`)
}

/**
 * Attach members through departmentsUsers (idempotent by the
 * (userId, departmentId) pair). The plugin's afterSave hook syncs
 * users.mainDepartmentId on every row this creates.
 */
async function attachMembers(token: string): Promise<void> {
  let departments = await dataOf(token, 'GET', '/api/departments:list?pageSize=200') as Array<Record<string, any>> | null ?? []
  // Sweep the plugin-install residue first: two title-less department rows
  // the departments desktop table would otherwise render as blank rows (the
  // cascade clears their stale affiliations; mainDepartment re-syncs).
  const residual = (departments ?? []).filter(row => String(row.title ?? '').trim() === '')
  for (const row of residual) {
    await call(token, 'POST', `/api/departments:destroy?filterByTk=${row.id}`).catch(() => undefined)
  }
  if (residual.length > 0) {
    console.log(`nocobase-w3-org-acl: swept ${residual.length} title-less residual department row(s)`)
    departments = await dataOf(token, 'GET', '/api/departments:list?pageSize=200') as Array<Record<string, any>> | null ?? []
  }
  const users = await dataOf(token, 'GET', '/api/users:list?pageSize=300') as Array<Record<string, any>> | null ?? []
  const deptId = new Map(departments.map(row => [String(row.title ?? ''), Number(row.id)]))
  const userId = new Map(users.map(row => [String(row.username ?? ''), Number(row.id)]))
  const links = await dataOf(token, 'GET', '/api/departmentsUsers:list?pageSize=500') as Array<Record<string, any>> | null ?? []
  const existing = new Set((links ?? []).map(row => `${String(row.userId)}@${String(row.departmentId)}`))
  let attached = 0
  const missing: string[] = []
  for (const [dept, members] of Object.entries(DEPT_MEMBERS)) {
    const departmentId = deptId.get(dept)
    if (departmentId === undefined) {
      missing.push(dept)
      continue
    }
    for (const username of members) {
      const uid = userId.get(username)
      if (uid === undefined) {
        missing.push(`${username}(user)`)
        continue
      }
      if (existing.has(`${uid}@${departmentId}`)) continue
      await dataOf(token, 'POST', '/api/departmentsUsers:create', { userId: uid, departmentId })
      attached += 1
    }
  }
  if (missing.length > 0) throw new Error(`部门挂接缺行：${missing.join('、')}（先跑部门/用户种子）`)
  console.log(`nocobase-w3-org-acl: member affiliations — ${attached > 0 ? `${attached} departmentsUsers row(s) attached` : 'all in place'} (mainDepartmentId auto-syncs per row)`)
}

/** hub_hr_employees.org_dept (m2o → departments) + the roster backfill by employee name. */
async function ensureEmployeeOrgDept(token: string): Promise<void> {
  const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_hr_employees' } }))}&pageSize=200`) as Array<{ name?: string }> | null
  if (!(fields ?? []).some(field => field.name === 'org_dept')) {
    await dataOf(token, 'POST', '/api/fields:create', {
      collectionName: 'hub_hr_employees',
      type: 'belongsTo', name: 'org_dept', target: 'departments', foreignKey: 'org_dept_id',
      interface: 'm2o',
      uiSchema: { type: 'object', 'x-component': 'AssociationField', title: '所属部门（组织架构）', 'x-component-props': { multiple: false, fieldNames: { label: 'title', value: 'id' } } },
    })
    console.log('nocobase-w3-org-acl: hub_hr_employees.org_dept m2o field created (→ departments)')
  }
  const departments = await dataOf(token, 'GET', '/api/departments:list?pageSize=200') as Array<Record<string, any>> | null ?? []
  const deptId = new Map(departments.map(row => [String(row.title ?? ''), Number(row.id)]))
  const employees = await dataOf(token, 'GET', '/api/hub_hr_employees:list?pageSize=100') as Array<Record<string, any>> | null ?? []
  let backfilled = 0
  for (const row of employees ?? []) {
    const target = EMPLOYEE_DEPT[String(row.name ?? '')]
    const departmentId = target === undefined ? undefined : deptId.get(target)
    if (departmentId === undefined) continue
    if (Number(row.org_dept_id ?? 0) === departmentId) continue
    await dataOf(token, 'POST', `/api/hub_hr_employees:update?filterByTk=${row.id}`, { org_dept_id: departmentId })
    backfilled += 1
  }
  console.log(`nocobase-w3-org-acl: roster org_dept — ${backfilled > 0 ? `${backfilled} row(s) backfilled` : 'all in place'} (hub_hr_employees shows the org department; the source of truth stays departments/users)`)
}

// ─── the org-chart JSBlock (h5 bin-map vocabulary) ───

/** The org-chart code (the B4 FLOW_MAP_CODE quoting style): three MultiRecordResource reads, one SVG tree with #id labels. */
export const ORG_CHART_CODE = [
  "const deptRes = ctx.makeResource('MultiRecordResource');",
  "deptRes.setResourceName('departments');",
  'deptRes.setPageSize(500);',
  'await deptRes.refresh();',
  "const linkRes = ctx.makeResource('MultiRecordResource');",
  "linkRes.setResourceName('departmentsUsers');",
  'linkRes.setPageSize(1000);',
  'await linkRes.refresh();',
  "const userRes = ctx.makeResource('MultiRecordResource');",
  "userRes.setResourceName('users');",
  'userRes.setPageSize(500);',
  'await userRes.refresh();',
  'const depts = (deptRes.getData() || []).filter((d) => d.title);',
  'const links = linkRes.getData() || [];',
  'const users = userRes.getData() || [];',
  'const esc = (s) => String(s == null ? "" : s).replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/>/g,"&"+"gt;").replace(/"/g,"&"+"quot;");',
  'const userById = {};',
  'users.forEach((u) => { userById[String(u.id)] = u; });',
  'const membersOf = (deptId) => links.filter((l) => String(l.departmentId) === String(deptId))',
  '  .map((l) => userById[String(l.userId)]).filter(Boolean);',
  'const roots = depts.filter((d) => !d.parentId);',
  'let body = "";',
  'for (const root of roots) {',
  '  const kids = depts.filter((d) => String(d.parentId) === String(root.id));',
  '  let g = "<text x=\'8\' y=\'20\' font-size=\'15\' font-weight=\'700\' fill=\'#111827\'>" + esc(root.title) + " #" + esc(root.id) + "</text>";',
  '  const colW = 260, rowH = 200;',
  '  kids.forEach((kid, i) => {',
  '    const x = 8 + (i % 4) * colW, y = 44 + Math.floor(i / 4) * rowH;',
  '    const members = membersOf(kid.id);',
  '    const boxH = 58 + members.length * 22 + 12;',
  '    g += "<rect x=\'" + x + "\' y=\'" + y + "\' width=\'240\' height=\'" + boxH + "\' rx=\'10\' fill=\'#ffffff\' stroke=\'#2563eb\' stroke-width=\'1.6\'/>";',
  '    g += "<text x=\'" + (x + 12) + "\' y=\'" + (y + 24) + "\' font-size=\'13\' font-weight=\'600\' fill=\'#111827\'>" + esc(kid.title) + "</text>";',
  '    g += "<text x=\'" + (x + 12) + "\' y=\'" + (y + 42) + "\' font-size=\'11\' fill=\'#6b7280\'>部门 #" + esc(kid.id) + " · 成员 " + members.length + "</text>";',
  '    members.forEach((m, j) => {',
  '      g += "<text x=\'" + (x + 14) + "\' y=\'" + (y + 62 + j * 22) + "\' font-size=\'11\' fill=\'#374151\'>· " + esc(m.nickname || m.username) + " @" + esc(m.username) + " #" + esc(m.id) + "</text>";',
  '    });',
  '    g += "<line x1=\'" + (x + 120) + "\' y1=\'" + (y - 14) + "\' x2=\'" + (x + 120) + "\' y2=\'" + y + "\' stroke=\'#93c5fd\' stroke-width=\'1.4\'/>";',
  '  });',
  '  const width = Math.max(4, kids.length) * colW + 16, height = 44 + Math.ceil(kids.length / 4) * rowH + 40;',
  '  body += "<svg viewBox=\'0 0 " + width + " " + height + "\' style=\'width:100%;height:auto;font-size:12px\'>" + g + "</svg>";',
  '}',
  'const head = "<div style=\'font-weight:600;font-size:14px;margin:8px 0 2px\'>组织架构图（实时读 departments/departmentsUsers/users）</div>"',
  '  + "<div style=\'color:#6b7280;font-size:12px;margin:2px 0 6px\'>成员挂接与主部门维护：系统设置 → 用户权限 → 部门（原生管理页 /admin/settings/users-permissions/departments，部门树 + 成员 + 负责人全功能）</div>";',
  'ctx.render("<div data-w3b5=\'org-chart\' style=\'padding:4px\'>" + head + body + "</div>");',
].join('\n')

// ─── the matrix JSBlock ───

/** The matrix code: rolesResources + rolesResourcesActions + roles → role × collection × action ✅/— grid. */
export const MATRIX_CODE = [
  "const resRes = ctx.makeResource('MultiRecordResource');",
  "resRes.setResourceName('rolesResources');",
  'resRes.setPageSize(500);',
  'await resRes.refresh();',
  "const actRes = ctx.makeResource('MultiRecordResource');",
  "actRes.setResourceName('rolesResourcesActions');",
  'actRes.setPageSize(2000);',
  'await actRes.refresh();',
  "const roleRes = ctx.makeResource('MultiRecordResource');",
  "roleRes.setResourceName('roles');",
  'roleRes.setPageSize(100);',
  'await roleRes.refresh();',
  'const resources = resRes.getData() || [];',
  'const actions = actRes.getData() || [];',
  'const roles = (roleRes.getData() || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));',
  'const ROWS = ' + JSON.stringify(MATRIX_ROWS) + ';',
  'const ACTS = ' + JSON.stringify(MATRIX_ACTIONS) + ';',
  'const esc = (s) => String(s == null ? "" : s).replace(/&/g,"&"+"amp;").replace(/</g,"&"+"lt;").replace(/>/g,"&"+"gt;").replace(/"/g,"&"+"quot;");',
  'const grants = {};',
  'actions.forEach((a) => { const key = String(a.rolesResourceId); grants[key] = grants[key] || []; grants[key].push(String(a.name)); });',
  'const byRole = {};',
  'resources.forEach((r) => {',
  '  const role = r.roleName || (typeof r.role === "string" ? r.role : (r.role && r.role.name)) || "?";',
  '  byRole[role] = byRole[role] || {};',
  '  byRole[role][String(r.name)] = grants[String(r.id)] || [];',
  '});',
  'const wild = {};',
  'Object.keys(byRole).forEach((role) => { const w = byRole[role]["*"]; if (w && w.length) wild[role] = w; });',
  'const cell = (role, coll, act) => {',
  '  const direct = (byRole[role] || {})[coll] || [];',
  '  const viaWild = wild[role] || [];',
  '  return direct.indexOf(act) >= 0 || viaWild.indexOf(act) >= 0 ? \'<span style="color:#16a34a;font-weight:700">✅</span>\' : \'<span style="color:#d1d5db">—</span>\';',
  '};',
  'let head = \'<tr style="background:#f3f4f6"><th style="text-align:left;padding:4px 8px;border:1px solid #e5e7eb">集合</th>\';',
  'roles.forEach((r) => { ACTS.forEach((a) => { head += \'<th style="padding:4px 6px;border:1px solid #e5e7eb;font-size:11px">\' + esc(r.title || r.name) + "<br>" + a + "</th>"; }); });',
  'head += "</tr>";',
  'let rows = "";',
  'ROWS.forEach((coll) => {',
  '  rows += \'<tr><td style="padding:4px 8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px">\' + esc(coll) + "</td>";',
  '  roles.forEach((r) => { ACTS.forEach((a) => { rows += \'<td style="text-align:center;border:1px solid #e5e7eb">\' + cell(String(r.name), coll, a) + "</td>"; }); });',
  '  rows += "</tr>";',
  '});',
  'const wildNote = Object.keys(wild).length ? \'<div style="color:#6b7280;font-size:12px;margin:4px 0">通配资源（name="*"）角色：\' + Object.keys(wild).map((r) => esc(r) + "(" + wild[r].join(",") + ")").join("、") + " —— 其动作计入所有集合列</div>" : "";',
  'ctx.render(`<div data-w3b5="acl-matrix" style="padding:4px"><div style="font-weight:600;font-size:14px;margin:8px 0 2px">角色 × 集合动作矩阵（实时读 rolesResources/rolesResourcesActions；只读渲染）</div>${wildNote}<table style="border-collapse:collapse;background:#fff">${head}${rows}</table><div style="color:#9ca3af;font-size:12px;margin:6px 0">授权/收权编辑入口：系统设置 → 用户权限 → 角色 → 选中角色 → 权限配置（原生角色编辑器，按集合勾动作；rolesResources/rolesResourcesActions 为插件私有集合，页面表单不直接承载）。</div></div>`);',
].join('\n')

// ─── page assembly (the B4 shapes, w3b5-prefixed) ───

type FieldKind = 'input' | 'select' | 'number' | 'boolean' | 'textarea'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean, description?: string }

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'number': return 'DisplayNumberFieldModel'
    case 'boolean': return 'DisplayCheckboxFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

const editModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'SelectFieldModel'
    case 'number': return 'NumberFieldModel'
    case 'boolean': return 'CheckboxFieldModel'
    default: return 'InputFieldModel'
  }
}

/** One table spec (columns + row-Edit fields + optional Add-new fields). */
type TableSpec = {
  heading: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  editFields: ReadonlyArray<FieldSpec>
  addNew?: ReadonlyArray<FieldSpec>
}

const ORG_TABLES: ReadonlyArray<TableSpec> = [
  {
    heading: '部门树（plugin-departments 原生集合；title + parentId 两级维护，组织图上方有 #id 标注）',
    collection: 'departments',
    columns: [
      { name: 'title', title: '部门名称', kind: 'input' },
      { name: 'parentId', title: '上级部门ID', kind: 'number' },
    ],
    editFields: [
      { name: 'title', title: '部门名称', kind: 'input', required: true },
      { name: 'parentId', title: '上级部门ID（顶级留空）', kind: 'number', description: '上级部门的 #id，见上方组织架构图标注' },
    ],
    addNew: [
      { name: 'title', title: '部门名称', kind: 'input', required: true },
      { name: 'parentId', title: '上级部门ID（顶级留空）', kind: 'number', description: '上级部门的 #id，见上方组织架构图标注' },
    ],
  },
  {
    heading: '员工档案（users：#id 供挂接引用；主部门列由插件按挂接自动同步；成员挂接在原生设置页维护——见图上方指引）',
    collection: 'users',
    columns: [
      { name: 'id', title: 'ID', kind: 'number' },
      { name: 'nickname', title: '姓名', kind: 'input' },
      { name: 'username', title: '用户名', kind: 'input' },
      { name: 'mainDepartment.title', title: '主部门', kind: 'input' },
    ],
    editFields: [
      { name: 'nickname', title: '姓名', kind: 'input' },
    ],
  },
]

/**
 * The matrix page carries no direct-write tables: rolesResources and
 * rolesResourcesActions are plugin-acl's private collections — absent from
 * the collection manager, so any v2 table block on them renders the
 * 「可能已被删除」 placeholder (the same wall the departmentsUsers block hit).
 * The direct-write face is NocoBase's own role editor (系统设置 → 用户权限 →
 * 角色), which the JSBlock's footer names; the matrix itself stays the
 * read-only rendering (D7).
 */
const MATRIX_TABLES: ReadonlyArray<TableSpec> = []

/** The EditActionModel's persisted popup subtree (the B4 editPopupTree shape, w3b5-prefixed). */
function editPopupTree(actionUid: string, spec: { collection: string, fields: ReadonlyArray<FieldSpec> }): Record<string, unknown> {
  const formUid = withW3b5Prefix('efm')
  const itemUids = spec.fields.map(() => withW3b5Prefix('efi'))
  const layoutRows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    uid: withW3b5Prefix('ewp'), parentId: actionUid, subKey: 'page', subType: 'object', use: 'ChildPageModel', props: {},
    stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
    subModels: {
      tabs: [{
        use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
        stepParams: { pageTabSettings: { tab: { title: '编辑' } } },
        subModels: {
          grid: {
            use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {}, filterManager: [],
            subModels: {
              items: [{
                uid: formUid, use: 'EditFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } } },
                subModels: {
                  grid: {
                    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
                    props: { layout: { version: 2, rows: layoutRows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: layoutRows.map(row => row.id) } },
                    stepParams: { gridSettings: { grid: { layout: { version: 2, rows: layoutRows } } } },
                    subModels: {
                      items: spec.fields.map((field, index) => ({
                        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
                        props: {
                          ...(field.required === true ? { required: true } : {}),
                          ...(field.description === undefined ? {} : { description: field.description }),
                        },
                        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: field.name } } },
                        subModels: {
                          field: {
                            uid: withW3b5Prefix('eff'), use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
                            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
                          },
                        },
                      })),
                    },
                  },
                  actions: [{
                    uid: withW3b5Prefix('efs'), parentId: formUid, subKey: 'actions', subType: 'array', sortIndex: 1,
                    use: 'FormSubmitActionModel', props: { type: 'primary' },
                    stepParams: { buttonSettings: { general: { title: '保存', type: 'primary' } } },
                  }],
                },
              }],
            },
          },
        },
      }],
    },
  }
}

/** One FormGrid subtree for the Add-new popup (the B4 createFormGrid shape). */
function createFormGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withW3b5Prefix('cfi'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
    props: { layout: { version: 2, rows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: rows.map(row => row.id) } },
    stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
    subModels: {
      items: fields.map((field, index) => ({
        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
        props: {
          ...(field.required === true ? { required: true } : {}),
          ...(field.description === undefined ? {} : { description: field.description }),
        },
        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } } },
        subModels: {
          field: {
            use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

/** Next free sort position among the group's direct children. */
async function nextSortInGroup(token: string, groupId: number): Promise<number> {
  const children = (await listRoutes(token, 'w3-org-acl')).filter(row => row.parentId === groupId)
  return children.reduce((max, row) => Math.max(max, row.sort ?? 0), 0) + 1
}

/** The grid uid of an existing flowPage (the B4 wire: findOne subKey=grid under the tabs schemaUid). */
async function gridUidOfExistingPage(token: string, title: string): Promise<string> {
  const routes = await listRoutes(token, 'w3-org-acl')
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  const tab = flow === undefined ? undefined : routes.find(row => row.type === 'tabs' && row.parentId === flow.id)
  if (tab?.schemaUid == null) {
    throw new Error(`"${title}" flowPage exists but has no tabs grid row; run --rollback and rebuild`)
  }
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
  if (grid?.uid == null) {
    throw new Error(`"${title}" flowPage has no BlockGridModel under its tabs row; run --rollback and rebuild`)
  }
  return String(grid.uid)
}

/** Create the flowPage route shell and return the grid uid blocks hang under (the B4 w3-views shape). */
async function ensureV2RouteShell(token: string, title: string, icon: string, groupId: number): Promise<{ routeUid: string, gridUid: string }> {
  const routes = await listRoutes(token, 'w3-org-acl')
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  if (flow !== undefined) return { routeUid: String(flow.schemaUid ?? ''), gridUid: await gridUidOfExistingPage(token, title) }
  const sort = await nextSortInGroup(token, groupId)
  const routeUid = withW3b5Prefix('')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withW3b5Prefix('t')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withW3b5Prefix('ts') })
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withW3b5Prefix('p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withW3b5Prefix('g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  console.log(`nocobase-w3-org-acl: v2 route shell "${title}" created (/admin/${routeUid})`)
  return { routeUid, gridUid }
}

/** Whether the page grid already carries this batch's table for one collection. */
async function pageHasBlock(token: string, gridUid: string, use: string, collection: string): Promise<boolean> {
  const rows = await listFlowModels(token, 'w3-org-acl')
  return rows.some(row => row.use === use && String(row.uid ?? '').startsWith('w3b5')
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
}

/** One editable table (columns + B1 row-detail triple + w3b5 row Edit + optional Add-new). */
async function ensureOrgTable(token: string, gridUid: string, spec: TableSpec, sortIndex: number): Promise<void> {
  if (await pageHasBlock(token, gridUid, 'TableBlockModel', spec.collection)) {
    console.log(`nocobase-w3-org-acl: table on ${spec.collection} exists (kept)`)
    return
  }
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  const tableUid = withW3b5Prefix('tb')
  await save({
    uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex,
    props: { title: spec.heading },
    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
  })
  let columnIndex = 1
  for (const column of spec.columns) {
    const uid = withW3b5Prefix('c')
    const model = displayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex: columnIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: column.name } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none' },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false },
    })
    columnIndex += 1
  }
  await ensureTableRowDetail(token, tableUid, {
    collection: spec.collection,
    fields: spec.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind) })),
    tabTitle: '详情',
    actionsColumnSortIndex: columnIndex,
  })
  const models = await listFlowModels(token, 'w3-org-acl')
  const actionsColumn = models.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === tableUid)
  if (actionsColumn?.uid === undefined) throw new Error(`actions column not found under ${spec.collection} table (ensureTableRowDetail)`)
  const editUid = withW3b5Prefix('ea')
  await save({
    uid: editUid, parentId: actionsColumn.uid, subKey: 'actions', subType: 'array', sortIndex: 2,
    use: 'EditActionModel', props: { title: '编辑' },
    stepParams: {
      popupSettings: { openView: rowDetailOpenView(spec.collection) },
      buttonSettings: { general: { title: '编辑', type: 'link', icon: null, iconOnly: false } },
    },
    subModels: { page: editPopupTree(editUid, { collection: spec.collection, fields: spec.editFields }) },
  })
  if (spec.addNew !== undefined) {
    await save({
      uid: withW3b5Prefix('an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      subModels: {
        page: {
          use: 'ChildPageModel', subKey: 'page', subType: 'object', sortIndex: 0, props: {},
          stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
          subModels: {
            tabs: [{
              use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
              stepParams: { pageTabSettings: { tab: { title: '{{t("Add new")}}' } } },
              subModels: {
                grid: {
                  use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {},
                  subModels: {
                    items: [{
                      use: 'CreateFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
                      subModels: { grid: createFormGrid(spec.collection, spec.addNew) },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    })
  }
  await save({
    uid: withW3b5Prefix('rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'RefreshActionModel',
    props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  console.log(`nocobase-w3-org-acl: table on ${spec.collection} built (row Edit + ${spec.addNew === undefined ? 'no' : 'Add-new'} form)`)
}

/** One JSBlock on the page grid (existence rides the parent grid, the B4 addBlock pattern). */
async function ensureJsBlock(token: string, gridUid: string, code: string, label: string): Promise<void> {
  const rows = await listFlowModels(token, 'w3-org-acl')
  if (rows.some(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === gridUid)) {
    console.log(`nocobase-w3-org-acl: ${label} JSBlock exists (kept)`)
    return
  }
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'jsBlock',
    settings: { showBlockCard: true, code },
  })
  const blockUid = block?.uid ?? block?.tree?.uid
  if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for ${label}: ${JSON.stringify(block).slice(0, 200)}`)
  console.log(`nocobase-w3-org-acl: ${label} JSBlock created (uid ${blockUid})`)
}

/**
 * Menu ACL: bind the page admin+root and drop the auto-created member row
 * (the B4 bindAdminOnlyMenu pattern — listAccessible has no super-user bypass).
 */
async function bindAdminOnlyMenu(token: string, routeTitle: string): Promise<void> {
  const routes = await listRoutes(token, 'w3-org-acl')
  const page = routes.find(row => row.title === routeTitle && row.type === 'flowPage')
  if (page === undefined) throw new Error(`flowPage "${routeTitle}" missing; cannot bind admin-only menu`)
  const bindings = (await dataOf(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: page.id } }))}`)) as Array<{ roleName?: string }> | null
  const boundRoles = new Set((bindings ?? []).map(row => String(row.roleName ?? '')))
  for (const role of ['admin', 'root']) {
    if (!boundRoles.has(role)) {
      await dataOf(token, 'POST', '/api/rolesDesktopRoutes:create', { desktopRouteId: page.id, roleName: role })
    }
  }
  if (boundRoles.has('member')) {
    // The table's primary key is the (desktopRouteId, roleName) pair — the
    // member row dies by filter, never by filterByTk.
    await call(token, 'POST', `/api/rolesDesktopRoutes:destroy?filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: page.id }, roleName: { $eq: 'member' } }))}`)
    console.log(`nocobase-w3-org-acl: member menu binding on "${routeTitle}" destroyed (admin-only page)`)
  }
  console.log(`nocobase-w3-org-acl: "${routeTitle}" menu bindings = admin + root (member dropped)`)
}

// ─── member's business action matrix (grants BEFORE probes — risk ④) ───

/**
 * Land member's action matrix: for every MEMBER_MATRIX collection, the
 * (member, collection) rolesResources row exists with view/list/get (the B1
 * read face) plus this batch's create/update entries — each added action
 * row carrying the full field list (the B1 explicit-fields convention).
 * Existing actions union with the wanted set; nothing is ever revoked here.
 */
async function grantMemberMatrix(token: string): Promise<void> {
  for (const entry of MEMBER_MATRIX) {
    const existing = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: entry.collection } }))}`)) as Array<{ id?: number }> | null
    let resourceId = existing?.[0]?.id
    if (resourceId === undefined) {
      const created = await dataOf(token, 'POST', '/api/rolesResources:create', {
        role: { name: 'member' }, name: entry.collection, usingActionsConfig: true,
        actions: [...new Set(['view', 'list', 'get', ...entry.actions])].map(name => ({ name })),
      })
      resourceId = created?.id
      if (resourceId !== undefined) {
        console.log(`nocobase-w3-org-acl: member matrix row created on ${entry.collection} (actions ${entry.actions.join('/')})`)
        continue
      }
    }
    if (resourceId === undefined) throw new Error(`member rolesResources row on ${entry.collection} missing after create`)
    const actionRows = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`)) as Array<{ id?: number, name?: string }> | null
    const present = new Set((actionRows ?? []).map(row => String(row.name ?? '')))
    const fieldRows = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: entry.collection } }))}`)) as Array<{ name?: string }> | null
    const fieldNames = (fieldRows ?? []).map(field => String(field.name)).filter(name => name.length > 0)
    let added = 0
    let touchId: number | undefined
    for (const action of [...new Set(['view', 'list', 'get', ...entry.actions])]) {
      if (present.has(action)) continue
      const row = await dataOf(token, 'POST', '/api/rolesResourcesActions:create', {
        rolesResourceId: resourceId, name: action,
      })
      added += 1
      if (touchId === undefined) touchId = Number(row?.id)
    }
    if (touchId === undefined) {
      // Everything already granted on a prior run — pick an existing row for
      // the unconditional write-through touch below.
      touchId = Number((actionRows ?? []).find(row => entry.actions.includes(String(row.name ?? '')))?.id
        ?? (actionRows ?? [])[0]?.id)
    }
    // plugin-acl rewrites the runtime face on rolesResourcesActions
    // afterUpdate only — an action-row create alone writes nothing through
    // (found live in the B5 probe). Touch one row per resource per build
    // (idempotent) carrying the full field list — the B1 explicit-fields
    // convention — so the rewrite re-reads every action of the resource.
    if (touchId === undefined || Number.isNaN(touchId)) throw new Error(`member matrix touch row missing on ${entry.collection}`)
    // An action row whose fields array is empty hides every column (rows come
    // back blank — found live on the departments read face), so the touch
    // only writes a field list when the manager actually has field rows.
    await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${touchId}`,
      fieldNames.length > 0 ? { fields: fieldNames } : { name: entry.actions[0] })
    if (added > 0) console.log(`nocobase-w3-org-acl: member matrix +${added} action(s) on ${entry.collection} (${entry.actions.join('/')})`)
  }
  console.log('nocobase-w3-org-acl: member business action matrix in place (engine-owned ledgers and destroy/export stay admin-only)')
}

/**
 * The org-chart's read face: every role the demo browsers ride needs
 * view/list/get on the two department collections (the pm.departments
 * snippet only declares configurable actions — it grants nothing; the admin
 * strategy carries no list/get, and a browser session otherwise 403s
 * departmentsUsers:list so the JSBlock dies mid-render — found live).
 * Read-only, explicit full field lists, same touch-write-through as the
 * matrix grants.
 */
async function grantOrgReadFace(token: string): Promise<void> {
  for (const [role, collections] of [
    ['admin', ['departments', 'departmentsUsers', 'rolesResources', 'rolesResourcesActions', 'roles']],
    ['member', ['departments', 'departmentsUsers']],
    ['root', ['departments', 'departmentsUsers', 'rolesResources', 'rolesResourcesActions', 'roles']],
  ] as const) {
    for (const collection of collections) {
      const existing = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: role }, name: { $eq: collection } }))}`)) as Array<{ id?: number }> | null
      let resourceId = existing?.[0]?.id
      if (resourceId === undefined) {
        const created = await dataOf(token, 'POST', '/api/rolesResources:create', {
          role: { name: role }, name: collection, usingActionsConfig: true,
          actions: [{ name: 'view' }, { name: 'list' }, { name: 'get' }],
        })
        resourceId = created?.id
        console.log(`nocobase-w3-org-acl: org read face — (${role}, ${collection}) view/list/get granted`)
        continue
      }
      const actionRows = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`)) as Array<{ id?: number, name?: string }> | null
      const present = new Set((actionRows ?? []).map(row => String(row.name ?? '')))
      const fieldRows = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}`)) as Array<{ name?: string }> | null
      const fieldNames = (fieldRows ?? []).map(field => String(field.name)).filter(name => name.length > 0)
      let touchId: number | undefined
      for (const action of ['view', 'list', 'get']) {
        if (present.has(action)) continue
        const row = await dataOf(token, 'POST', '/api/rolesResourcesActions:create', {
          rolesResourceId: resourceId, name: action,
        })
        if (touchId === undefined) touchId = Number(row?.id)
      }
      if (touchId === undefined) touchId = Number((actionRows ?? [])[0]?.id)
      if (touchId !== undefined && !Number.isNaN(touchId)) {
        await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${touchId}`,
          fieldNames.length > 0 ? { fields: fieldNames } : { name: 'view' })
      }
      // Repair pass: an earlier run may have written fields: [] (every
      // column hidden); null restores the all-fields face.
      for (const row of actionRows ?? []) {
        if (row.id === undefined || row.name === undefined) continue
        await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${row.id}`, { fields: null })
      }
    }
  }
}

// ─── the roster column on the f3 员工 page ───

/**
 * Append the org_dept column to the f3 员工 page's hub_hr_employees table
 * (the DisplayTextFieldModel-on-association pattern every m2o column in
 * this repo rides). Editing stays on the 组织架构 page — the roster column
 * is the read face (batch doc §2: 员工页看到部门).
 */
async function ensureEmployeeColumn(token: string): Promise<void> {
  const models = await listFlowModels(token, 'w3-org-acl')
  const tables = models.filter(row => row.use === 'TableBlockModel'
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'hub_hr_employees')
  const target = tables.find(row => !String(row.uid ?? '').startsWith('w3b5')) ?? tables[0]
  if (target === undefined) throw new Error('hub_hr_employees table (员工 page) not found; run nocobase-f3-hub-v2.mts first')
  const columns = models.filter(row => row.use === 'TableColumnModel' && String(row.parentId ?? '') === String(target.uid))
  const already = columns.some(row => {
    const field = models.find(candidate => candidate.use === 'DisplayTextFieldModel' && String(candidate.parentId ?? '') === String(row.uid))
    return String(field?.stepParams?.fieldSettings?.init?.fieldPath ?? '') === 'org_dept'
  })
  if (already) {
    console.log('nocobase-w3-org-acl: 员工 page org_dept column exists (kept)')
    return
  }
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  const sortIndex = columns.reduce((max, row) => Math.max(max, Number(row.sortIndex ?? 0)), 0) + 1
  const uid = withW3b5Prefix('c')
  await save({
    uid, use: 'TableColumnModel', parentId: target.uid, subKey: 'columns', subType: 'array', sortIndex,
    stepParams: {
      fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'hub_hr_employees', fieldPath: 'org_dept' } },
      tableColumnSettings: { model: { use: 'DisplayTextFieldModel' } },
    },
    props: { title: '所属部门（组织架构）', dataIndex: 'org_dept', width: 170, editable: false, sorter: false, fixed: 'none' },
  })
  await save({
    uid: `${uid}f`, use: 'DisplayTextFieldModel', parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
    stepParams: { popupSettings: { openView: { collectionName: 'hub_hr_employees', dataSourceKey: 'main' } } },
    props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false },
  })
  console.log('nocobase-w3-org-acl: 员工 page gained the org_dept column (display; editing rides the 组织架构 page)')
}

// ─── department routing (the B4 config-center data channel + a live witness) ───

/** Append one config_note audit line (the B4 channel leaves who/when/old→new on every edit). */
async function auditFlowEdit(token: string, flowId: number, existing: string, line: string): Promise<void> {
  const base = existing.trim() === '' ? '' : `${existing}\n`
  await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${flowId}`, {
    config_note: `${base}${new Date().toISOString()} ${line}`,
  })
}

/**
 * Point qm_nc_dispositions' manager tier at 质检部 through the same REST row
 * the B4 config center edits (config_note audited), then drive one witness
 * disposition: submit → todos expand to every 质检部 member → one member
 * acts → the rest void. Idempotent: an existing witness doc skips the demo.
 */
async function ensureDeptRoutedFlow(token: string): Promise<void> {
  const io = new TokenIO(token)
  const flows = await io.list('wfl_flow_configs', { doc_type: DEPT_ROUTED_DOC_TYPE, is_active: true })
  const flow = flows[0]
  if (flow === undefined) throw new Error(`${DEPT_ROUTED_DOC_TYPE} has no active flow; run nocobase-w8-quality.mts first`)
  const currentMap = JSON.parse(String(flow.approver_map ?? '{}')) as Record<string, unknown>
  const manager = currentMap['manager']
  const isDeptForm = typeof manager === 'object' && manager !== null && (manager as Record<string, unknown>)['type'] === 'department'
  if (!isDeptForm) {
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${flow.id}`, {
      approver_map: JSON.stringify({ ...currentMap, manager: { type: 'department', value: DEPT_ROUTED_DEPARTMENT } }),
    })
    await auditFlowEdit(token, Number(flow.id), String(flow.config_note ?? ''),
      `w3b5 dept-routing: approver_map.manager ${JSON.stringify(manager)}→{"type":"department","value":"${DEPT_ROUTED_DEPARTMENT}"} (operator=admin)`)
    console.log(`nocobase-w3-org-acl: ${DEPT_ROUTED_DOC_TYPE} manager tier → 部门路由「${DEPT_ROUTED_DEPARTMENT}」(config_note audited)`)
  }
  const witness = (await io.list('qm_nc_dispositions', {})).find(row => String(row.code ?? '').startsWith(WITNESS_CODE_PREFIX))
  if (witness !== undefined) {
    console.log(`nocobase-w3-org-acl: routing witness ${String(witness.code)} already driven (${String(witness.doc_status)}); demo skipped`)
    return
  }
  const inspection = (await io.list('qm_inspections', {}))[0]
  if (inspection === undefined) throw new Error('qm_inspections has no rows; run the w8 seed first')
  const doc = await io.create('qm_nc_dispositions', {
    code: `${WITNESS_CODE_PREFIX}-${new Date().toISOString().slice(0, 10)}`,
    inspection_id: Number(inspection.id), action: 'concession',
    reason: 'W3-B5 部门路由演示：质检部全员展开待办，任一人可审',
    doc_status: 'draft',
  })
  await submitForApproval(io, DEPT_ROUTED_DOC_TYPE, Number(doc.id), 'chenliqun')
  const openTodos = await io.list('wfl_approval_todos', { doc_type: DEPT_ROUTED_DOC_TYPE, doc_id: Number(doc.id), status: 'open' })
  const expanded = openTodos.map(row => String(row.user)).sort()
  const expected = [...DEPT_MEMBERS[DEPT_ROUTED_DEPARTMENT] ?? []].sort()
  if (JSON.stringify(expanded) !== JSON.stringify(expected)) {
    throw new Error(`部门路由展开不符：todos=${expanded.join(',')} 期望=${expected.join(',')}（departmentsUsers 对拍失败）`)
  }
  console.log(`nocobase-w3-org-acl: routing witness ${String(doc.code)} — todos expanded to 质检部全员 [${expanded.join('、')}]`)
  const result = await act(io, DEPT_ROUTED_DOC_TYPE, Number(doc.id), 'approve', 'quality_lead', '部门路由：质检部代审')
  if (result.to_state !== 'approved') throw new Error(`部门路由见证单未生效（to_state=${result.to_state}）`)
  const after = await io.list('wfl_approval_todos', { doc_type: DEPT_ROUTED_DOC_TYPE, doc_id: Number(doc.id) })
  if (!after.every(row => row.status === 'completed')) throw new Error('部门路由任一人 act 后存在未作废待办')
  console.log('nocobase-w3-org-acl: routing witness approved by quality_lead; every tier todo completed (W2 OR-sign-off semantics)')
}

// ─── --assert ───

/** Sign in as an arbitrary local user (the ACL probe path). */
async function signInAs(account: string, password: string): Promise<string | null> {
  const base = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
  const response = await fetch(`${base}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  const payload = await response.json().catch(() => null) as { data?: { token?: string } } | null
  const token = payload?.data?.token
  return typeof token === 'string' && token !== '' ? token : null
}

/**
 * The W3-B5 assertion pass: seeds对拍, page wires, menu ACL, member matrix,
 * dept-routing witness, and the B4 consistency probe. Returns the failure
 * list (empty = green); setup-nocobase verify imports this same function —
 * one 口径.
 */
export async function collectOrgAclFailures(token: string): Promise<string[]> {
  const failures: string[] = []
  const models = await listFlowModels(token, 'w3-org-acl assert')
  const routes = await listRoutes(token, 'w3-org-acl assert')

  // 1) the department tree + affiliations对拍 (API vs DEPT_MEMBERS).
  const departments = (await dataOf(token, 'GET', '/api/departments:list?pageSize=200')) as Array<Record<string, any>> | null ?? []
  const titles = new Set(departments.map(row => String(row.title ?? '')))
  for (const title of [ROOT_DEPT_TITLE, ...DEPT_CHILDREN]) {
    if (!titles.has(title)) failures.push(`department「${title}」missing (run the build)`)
  }
  const users = (await dataOf(token, 'GET', '/api/users:list?pageSize=300')) as Array<Record<string, any>> | null ?? []
  const userId = new Map(users.map(row => [String(row.username ?? ''), Number(row.id)]))
  const deptId = new Map(departments.map(row => [String(row.title ?? ''), Number(row.id)]))
  const links = (await dataOf(token, 'GET', '/api/departmentsUsers:list?pageSize=500')) as Array<Record<string, any>> | null ?? []
  const linkSet = new Set((links ?? []).map(row => `${String(row.userId)}@${String(row.departmentId)}`))
  for (const [dept, members] of Object.entries(DEPT_MEMBERS)) {
    for (const username of members) {
      const uid = userId.get(username)
      const did = deptId.get(dept)
      if (uid === undefined || did === undefined || !linkSet.has(`${uid}@${did}`)) {
        failures.push(`affiliation missing: ${username} ↔ ${dept}`)
      }
    }
  }
  const qcLead = users.find(row => String(row.username ?? '') === 'quality_lead')
  const qcDeptId = deptId.get(DEPT_ROUTED_DEPARTMENT)
  if (qcLead !== undefined && qcDeptId !== undefined && Number(qcLead.mainDepartmentId ?? 0) !== qcDeptId) {
    failures.push(`quality_lead.mainDepartmentId is ${JSON.stringify(qcLead.mainDepartmentId)} (expected 质检部 #${qcDeptId}; the plugin sync rides every departmentsUsers save)`)
  }
  console.log(`assert: 部门树 ${String(titles.size)} 名 · 挂接 ${String(linkSet.size)} 行 · quality_lead 主部门同步 ✓`)

  // 2) the org + matrix pages: JSBlocks, tables, edit actions.
  for (const [title, collections] of [
    [ORG_PAGE_TITLE, ['departments', 'users']],
    [MATRIX_PAGE_TITLE, []],
  ] as const) {
    const page = routes.find(row => row.title === title && row.type === 'flowPage')
    if (page === undefined) {
      failures.push(`${title} flowPage route missing (run the build)`)
      continue
    }
    for (const collection of collections) {
      const table = models.find(row => row.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w3b5')
        && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
      if (table === undefined) {
        failures.push(`${title}: w3b5 table on ${collection} missing`)
        continue
      }
      const column = models.find(row => row.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === String(table.uid))
      const hasEdit = column !== undefined && models.some(row => row.use === 'EditActionModel' && String(row.uid ?? '').startsWith('w3b5') && String(row.parentId ?? '') === String(column.uid))
      if (!hasEdit) failures.push(`${title}: ${collection} rows lack the w3b5 Edit action`)
    }
    const tab = routes.find(row => row.type === 'tabs' && row.parentId === page.id)
    if (tab?.schemaUid != null) {
      const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
      const js = grid?.uid == null ? undefined : models.find(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid))
      if (js === undefined) failures.push(`${title}: JSBlock missing`)
    }
  }
  // The matrix page binds admin+root only.
  {
    const page = routes.find(row => row.title === MATRIX_PAGE_TITLE && row.type === 'flowPage')
    if (page !== undefined) {
      const bindings = (await dataOf(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: page.id } }))}`)) as Array<{ roleName?: string }> | null
      const roles = (bindings ?? []).map(row => String(row.roleName ?? ''))
      if (roles.includes('member')) failures.push(`${MATRIX_PAGE_TITLE} menu still binds member (admin-only violation)`)
      if (!roles.includes('admin') || !roles.includes('root')) failures.push(`${MATRIX_PAGE_TITLE} menu bindings incomplete: ${roles.join(',')}`)
    }
  }
  // The roster column.
  {
    const field = models.find(row => row.use === 'TableColumnModel'
      && String(row.uid ?? '').startsWith('w3b5')
      && String(row.stepParams?.fieldSettings?.init?.collectionName ?? '') === 'hub_hr_employees'
      && String(row.stepParams?.fieldSettings?.init?.fieldPath ?? '') === 'org_dept')
    if (field === undefined) failures.push('员工 page org_dept column missing')
    const fields = (await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_hr_employees' } }))}&pageSize=200`)) as Array<{ name?: string }> | null
    if (!(fields ?? []).some(candidate => candidate.name === 'org_dept')) failures.push('hub_hr_employees.org_dept field missing')
    const employees = (await dataOf(token, 'GET', '/api/hub_hr_employees:list?pageSize=100')) as Array<Record<string, any>> | null ?? []
    const unfilled = (employees ?? []).filter(row => row.name !== undefined && EMPLOYEE_DEPT[String(row.name)] !== undefined && (row.org_dept_id === null || row.org_dept_id === undefined))
    if (unfilled.length > 0) failures.push(`${unfilled.length} roster row(s) lack org_dept backfill (${unfilled.map(row => String(row.name)).join('、')})`)
  }

  // 3) member's action matrix对拍 (the matrix JSBlock renders this same API).
  for (const entry of MEMBER_MATRIX) {
    const rows = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: entry.collection } }))}`)) as Array<{ id?: number }> | null
    const resourceId = rows?.[0]?.id
    if (resourceId === undefined) {
      failures.push(`member matrix row missing on ${entry.collection}`)
      continue
    }
    const actions = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`)) as Array<{ name?: string }> | null
    const present = new Set((actions ?? []).map(row => String(row.name ?? '')))
    for (const action of entry.actions) {
      if (!present.has(action)) failures.push(`member ${entry.collection}:${action} not granted (matrix cell ✅ missing)`)
    }
  }
  // The engine-owned ledger guard stays at rest (the flip probe restores it).
  {
    const narrow = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: 'wms_counts' } }))}`)) as Array<{ id?: number }> | null
    if ((narrow ?? []).length > 0) failures.push('(admin, wms_counts) carries a narrowed rolesResources row at rest — the 403 flip probe must destroy it after flipping back')
  }

  // 4) department routing: the dept-form map + the witness expansion.
  {
    const io = new TokenIO(token)
    const flows = await io.list('wfl_flow_configs', { doc_type: DEPT_ROUTED_DOC_TYPE, is_active: true })
    const map = flows[0] === undefined ? {} : JSON.parse(String(flows[0].approver_map ?? '{}')) as Record<string, unknown>
    const manager = map['manager']
    const isDeptForm = typeof manager === 'object' && manager !== null && (manager as Record<string, unknown>)['type'] === 'department' && (manager as Record<string, unknown>)['value'] === DEPT_ROUTED_DEPARTMENT
    if (!isDeptForm) failures.push(`${DEPT_ROUTED_DOC_TYPE} approver_map.manager is not the department form「${DEPT_ROUTED_DEPARTMENT}」`)
    const witness = (await io.list('qm_nc_dispositions', {})).find(row => String(row.code ?? '').startsWith(WITNESS_CODE_PREFIX))
    if (witness === undefined) {
      failures.push(`routing witness (${WITNESS_CODE_PREFIX}-*) missing`)
    } else {
      if (String(witness.doc_status) !== 'approved') failures.push(`routing witness ${String(witness.code)} doc_status=${String(witness.doc_status)} (expected approved)`)
      const todos = await io.list('wfl_approval_todos', { doc_type: DEPT_ROUTED_DOC_TYPE, doc_id: Number(witness.id) })
      const expected = [...DEPT_MEMBERS[DEPT_ROUTED_DEPARTMENT] ?? []].sort()
      const got = todos.map(row => String(row.user)).sort()
      if (JSON.stringify(got) !== JSON.stringify(expected)) {
        failures.push(`routing witness todos = [${got.join(',')}] 期望 质检部全员 [${expected.join(',')}]`)
      }
      if (!todos.every(row => row.status === 'completed')) failures.push('routing witness todos not all completed (任一人 act 作废语义破坏)')
    }
  }

  // 5) the B4 consistency probe (dept-form maps must pass it too).
  for (const failure of await assertWflConsistency(token)) failures.push(`wfl 探针：${failure}`)
  return failures
}

/** The --assert entry: collect then fail loud. */
async function assertOrgAcl(token: string): Promise<void> {
  const failures = await collectOrgAclFailures(token)
  if (failures.length > 0) throw new Error(`--assert FAILED:\n  - ${failures.join('\n  - ')}`)
  console.log('nocobase-w3-org-acl: --assert OK (部门树/挂接对拍 + 双页 wires + admin-only 矩阵菜单 + member 矩阵 + 部门路由 witness + 一致性探针)')
}

// ─── --probe-acl-flip (the 403 flip + the member journey terminal) ───

/**
 * The matrix-effect probes (risk-④ order: grants landed in build):
 * 1. Narrow (admin, wms_counts) to view/list/get → b4guard's empty update
 *    refuses 403; destroy the narrow row → the same update passes 200 (the
 *    wildcard face is back; the empty body writes nothing).
 * 2. quality_lead (member) creates a real draft inspection — the journey's
 *    terminal row (QM-W3B5-JOURNEY-*).
 */
async function probeAclFlip(token: string): Promise<void> {
  const base = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
  const guardToken = await signInAs('b4guard', 'B4guard-2026')
  if (guardToken === null) throw new Error('b4guard 登录失败（先跑 nocobase-h5-wms.mts）')
  const counts = (await dataOf(token, 'GET', '/api/wms_counts:list?pageSize=1&sort=-id')) as Array<Record<string, any>> | null ?? []
  const targetId = Number(counts[0]?.id)
  if (!Number.isInteger(targetId) || targetId < 1) throw new Error('wms_counts 无行可探（先跑 h5 种子）')
  const probeUpdate = async (bearer: string): Promise<number> => {
    const probe = await fetch(`${base}/api/wms_counts:update?filterByTk=${targetId}`, {
      method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    return probe.status
  }
  // Sweep residue from an aborted earlier run first (the throw paths below
  // die before cleanup; a leftover row would pin the narrow runtime face).
  const stale = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: 'wms_counts' } }))}`)) as Array<{ id?: number }> | null
  for (const row of stale ?? []) {
    if (row.id !== undefined) await call(token, 'POST', `/api/rolesResources:destroy?filterByTk=${row.id}`)
  }
  // Flip to narrowed: a specific (admin, wms_counts) row replaces the
  // strategy face (rolesResources saves write the runtime ACL through).
  const narrowRow = await dataOf(token, 'POST', '/api/rolesResources:create', {
    role: { name: 'admin' }, name: 'wms_counts', usingActionsConfig: true,
    actions: [{ name: 'view' }, { name: 'list' }, { name: 'get' }],
  })
  if (narrowRow?.id === undefined) throw new Error('窄化 rolesResources 行创建失败')
  const refused = await probeUpdate(guardToken)
  console.log(`probe-acl-flip: 矩阵收窄 (admin, wms_counts) 无 update → b4guard update → HTTP ${String(refused)} ${refused === 403 ? '✓' : '✗（期望 403）'}`)
  if (refused !== 403) throw new Error(`403 翻转负例失败：HTTP ${String(refused)}`)
  // Flip back through the save path: plugin-acl rewrites the runtime face on
  // rolesResources afterSave and on rolesResourcesActions afterUpdate — an
  // action-row CREATE alone writes nothing through, and no afterDestroy
  // listener exists at all. So: add the strategy actions, then touch one
  // action row (update) to force the rewrite that re-reads them all.
  const FULL_ACTIONS = ['view', 'list', 'get', 'create', 'update', 'destroy', 'export'] as const
  const actionRows = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: narrowRow.id } }))}`)) as Array<{ id?: number, name?: string }> | null
  const actionIds = new Map((actionRows ?? []).map(row => [String(row.name ?? ''), Number(row.id)]))
  for (const action of FULL_ACTIONS) {
    if (actionIds.has(action)) continue
    const created = await dataOf(token, 'POST', '/api/rolesResourcesActions:create', {
      rolesResourceId: narrowRow.id, name: action,
    })
    actionIds.set(action, Number(created?.id))
  }
  const touchId = actionIds.get('update')
  if (touchId === undefined) throw new Error('翻转恢复：update 动作行缺失')
  await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${touchId}`, { name: 'update' })
  const passed = await probeUpdate(guardToken)
  console.log(`probe-acl-flip: 动作补齐 + 写穿触发（全动作面恢复）→ b4guard update → HTTP ${String(passed)} ${passed === 200 ? '✓（空 body 零写入）' : '✗（期望 200）'}`)
  if (passed !== 200) throw new Error(`403 翻转正例失败：HTTP ${String(passed)}`)
  // DB cleanup: the specific row dies, restoring the strategy-only rest
  // state (the runtime face the save path last wrote equals the strategy).
  await call(token, 'POST', `/api/rolesResources:destroy?filterByTk=${narrowRow.id}`)
  console.log('probe-acl-flip: 窄化行已销毁（库内无 (admin, wms_counts) 残留）')
  // The member journey terminal: quality_lead creates a real draft inspection.
  const leadToken = await signInAs('quality_lead', 'Quality#2026')
  if (leadToken === null) throw new Error('quality_lead 登录失败（先跑 nocobase-w3-procurement.mts）')
  const existing = (await dataOf(token, 'GET', `/api/qm_inspections:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ code: { $includes: 'QM-W3B5-JOURNEY' } }))}`)) as Array<Record<string, any>> | null ?? []
  if ((existing ?? []).length > 0) {
    console.log(`probe-acl-flip: 质检旅程单 ${String(existing[0]?.code)} 已存在（重放跳过）`)
    return
  }
  const created = await fetch(`${base}/api/qm_inspections:create`, {
    method: 'POST', headers: { authorization: `Bearer ${leadToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      code: `QM-W3B5-JOURNEY-${new Date().toISOString().slice(0, 10)}`,
      insp_type: 'incoming', status: 'open', doc_status: 'draft',
      note: 'W3-B5 旅程终局：member 矩阵授予 qm_inspections:create 后由 quality_lead 创建',
    }),
  })
  console.log(`probe-acl-flip: member(quality_lead) qm_inspections:create → HTTP ${String(created.status)} ${created.ok ? '✓' : '✗（期望 200）'}`)
  if (!created.ok) throw new Error(`member 质检建单失败：HTTP ${String(created.status)} ${(await created.text()).slice(0, 200)}`)
}

// ─── --probe-dept-routing (the two live negatives; restores the map) ───

/**
 * Drive the engine's department-routing negatives against the live flow:
 * an unknown department and the member-less 储备人才池 each refuse at submit
 * (zero todos land); the map restores to the original with one audit line
 * per edit. Scratch draft rows are destroyed after each refusal.
 */
async function probeDeptRouting(token: string): Promise<void> {
  const io = new TokenIO(token)
  const flows = await io.list('wfl_flow_configs', { doc_type: DEPT_ROUTED_DOC_TYPE, is_active: true })
  const flow = flows[0]
  if (flow === undefined) throw new Error(`${DEPT_ROUTED_DOC_TYPE} has no active flow`)
  const originalMap = String(flow.approver_map ?? '{}')
  const inspection = (await io.list('qm_inspections', {}))[0]
  if (inspection === undefined) throw new Error('qm_inspections has no rows')
  let seq = 0
  for (const [label, value, marker] of [
    ['幽灵部门', '幽灵部', '不存在的部门'],
    ['空部门（储备人才池）', '储备人才池', '没有成员'],
  ] as const) {
    seq += 1
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${flow.id}`, {
      approver_map: JSON.stringify({ manager: { type: 'department', value }, gm: 'admin' }),
    })
    await auditFlowEdit(token, Number(flow.id), String((await io.get('wfl_flow_configs', Number(flow.id)))?.config_note ?? ''),
      `w3b5 probe-dept-routing: approver_map.manager → "${value}"（${label} 负例探针，稍后恢复）(operator=admin)`)
    const doc = await io.create('qm_nc_dispositions', {
      code: `NC-W3B5-NEG${seq}-${new Date().toISOString().slice(0, 10)}`,
      inspection_id: Number(inspection.id), action: 'concession',
      reason: `W3-B5 负例：${label}`, doc_status: 'draft',
    })
    let refusal = ''
    try {
      await submitForApproval(io, DEPT_ROUTED_DOC_TYPE, Number(doc.id), 'chenliqun')
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error)
    }
    const todos = await io.list('wfl_approval_todos', { doc_type: DEPT_ROUTED_DOC_TYPE, doc_id: Number(doc.id) })
    console.log(`probe-dept-routing: ${label} → submit 拒绝 ${refusal.includes(marker) ? '✓' : '✗'}（${refusal.slice(0, 80)}）；待办 ${String(todos.length)} 行 ${todos.length === 0 ? '✓' : '✗'}`)
    if (!refusal.includes(marker)) throw new Error(`${label} 负例未命中「${marker}」：${refusal}`)
    if (todos.length !== 0) throw new Error(`${label} 负例残留 ${todos.length} 行待办`)
    await io.destroy('qm_nc_dispositions', Number(doc.id))
  }
  await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${flow.id}`, { approver_map: originalMap })
  await auditFlowEdit(token, Number(flow.id), String((await io.get('wfl_flow_configs', Number(flow.id)))?.config_note ?? ''),
    `w3b5 probe-dept-routing: approver_map restored (operator=admin)`)
  console.log('probe-dept-routing: approver_map 已恢复（config_note 留痕），负例草稿已清理')
}

// ─── --rollback ───

async function rollback(token: string): Promise<void> {
  const routes = await listRoutes(token, 'w3-org-acl rollback')
  const own = routes.filter(row => (row.title === ORG_PAGE_TITLE || row.title === MATRIX_PAGE_TITLE) && (row.type === 'page' || String(row.schemaUid ?? '').startsWith('w3b5')))
  const tabsRows = routes.filter(row => row.type === 'tabs' && own.some(parent => row.parentId === parent.id))
  for (const row of [...tabsRows, ...own]) {
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${row.id}`)
  }
  if (own.length > 0) console.log(`nocobase-w3-org-acl: rollback destroyed routes "${ORG_PAGE_TITLE}" + "${MATRIX_PAGE_TITLE}" (+tabs)`)
  const models = await listFlowModels(token, 'w3-org-acl rollback')
  const mine = models.filter(row => String(row.uid ?? '').startsWith('w3b5'))
  for (const row of mine) {
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`).catch(() => undefined)
  }
  console.log(`nocobase-w3-org-acl: rollback destroyed ${mine.length} w3b5 flowModels row(s) — seeds, member grants, and the dept-routed flow config stay (data; revoke via the matrix page)`)
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w3-org-acl: done (rollback)')
    return
  }
  if (args.includes('--assert')) {
    await assertOrgAcl(token)
    return
  }
  if (args.includes('--probe-acl-flip')) {
    await probeAclFlip(token)
    console.log('nocobase-w3-org-acl: --probe-acl-flip OK')
    return
  }
  if (args.includes('--probe-dept-routing')) {
    await probeDeptRouting(token)
    console.log('nocobase-w3-org-acl: --probe-dept-routing OK')
    return
  }
  // Data first (risk ④: grants land before any probe).
  await ensureDepartments(token)
  await ensureDemoUser(token)
  await attachMembers(token)
  await ensureEmployeeOrgDept(token)
  await grantMemberMatrix(token)
  await grantOrgReadFace(token)
  await ensureDeptRoutedFlow(token)
  // Pages.
  const routes = await listRoutes(token, 'w3-org-acl')
  const orgGroup = routes.find(row => row.title === ORG_GROUP && row.type === 'group')
  const matrixGroup = routes.find(row => row.title === MATRIX_GROUP && row.type === 'group')
  if (orgGroup === undefined) throw new Error(`menu group "${ORG_GROUP}" not found; run nocobase-hub-modules.mts first`)
  if (matrixGroup === undefined) throw new Error(`menu group "${MATRIX_GROUP}" not found; run nocobase-w1-approval.mts first`)
  const { gridUid: orgGrid } = await ensureV2RouteShell(token, ORG_PAGE_TITLE, 'ApartmentOutlined', orgGroup.id)
  let sortIndex = 1
  for (const table of ORG_TABLES) {
    await ensureOrgTable(token, orgGrid, table, sortIndex)
    sortIndex += 1
  }
  await ensureJsBlock(token, orgGrid, ORG_CHART_CODE, 'org-chart')
  const { gridUid: matrixGrid } = await ensureV2RouteShell(token, MATRIX_PAGE_TITLE, 'SafetyOutlined', matrixGroup.id)
  sortIndex = 1
  for (const table of MATRIX_TABLES) {
    await ensureOrgTable(token, matrixGrid, table, sortIndex)
    sortIndex += 1
  }
  await ensureJsBlock(token, matrixGrid, MATRIX_CODE, 'acl-matrix')
  await bindAdminOnlyMenu(token, MATRIX_PAGE_TITLE)
  await ensureEmployeeColumn(token)
  console.log('nocobase-w3-org-acl: done (build)')
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
