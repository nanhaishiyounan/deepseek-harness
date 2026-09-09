/**
 * Enterprise hub modules for the NocoBase demo-grade build (plan batch B3):
 * projects / tasks / tickets / knowledge articles / assets / HR / master
 * data plus a Workbench page. Same construction pattern as
 * nocobase-crm-modules.mts (REST, idempotent by title / business unique
 * key / CardItem presence), with three extra block kinds: calendar
 * (official plugin-calendar e2e template shape), gantt (plugin-gantt
 * template shape), and a filtered table (Workbench lists).
 *
 * Deviation logged in the batch record: the plan's "Tasks page with four
 * tabs" is delivered as four sibling pages (kanban / table / calendar /
 * gantt) — same view set, stable programmatic path instead of the
 * interactive-only tab wiring.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/nocobase-hub-modules.mts
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'
const fixturePath = join(repoRoot, 'examples/kb-agent/workspace/data/hub/dataset.json')

const options = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))
const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const checkbox = (name: string, title: string): object => ({ name, type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const belongsTo = (name: string, title: string, target: string, foreignKey: string): object => ({
  name, type: 'belongsTo', interface: 'm2o', target, foreignKey,
  // fieldNames names the target column AssociationField renders; without it
  // the viewer reads record['label'] (missing) and every m2o table cell shows
  // N/A even though the list request appends the association (N16).
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: 'name', value: 'id' } } },
})

const TASK_STATUS = options([
  ['backlog', '待规划', 'default'], ['todo', '待处理', 'blue'], ['in_progress', '进行中', 'cyan'],
  ['review', '评审中', 'purple'], ['done', '已完成', 'green'], ['blocked', '受阻', 'red'], ['cancelled', '已取消', 'default'],
])
const PRIORITY = options([['low', '低', 'default'], ['medium', '中', 'blue'], ['high', '高', 'orange'], ['urgent', '紧急', 'red']])
const PROJECT_STATUS = options([['planning', '规划中', 'blue'], ['in_progress', '进行中', 'cyan'], ['blocked', '受阻', 'red'], ['completed', '已完成', 'green'], ['archived', '已归档', 'default']])
const TICKET_STATUS = options([
  ['new', '新建', 'default'], ['assigned', '已指派', 'blue'], ['waiting_customer', '待客户', 'orange'],
  ['waiting_internal', '待内部', 'purple'], ['in_progress', '处理中', 'cyan'], ['resolved', '已解决', 'green'], ['closed', '已关闭', 'default'], ['reopened', '重开', 'red'],
])

/** The sixteen hub collections, resource names aligned with demo-portal-hub. */
const COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  {
    name: 'hub_pj_projects', title: '项目', fields: [
      input('name', '项目名称'), input('no', '项目编号'), input('customer', '客户'), input('owner', '负责人'),
      select('status', '状态', PROJECT_STATUS), integer('progress', '进度 %'), select('priority', '优先级', PRIORITY), date('planned_end_date', '计划完成'),
    ],
  },
  {
    name: 'hub_pj_tasks', title: '任务', fields: [
      input('title', '任务标题'), belongsTo('project', '所属项目', 'hub_pj_projects', 'project_id'), input('assignee', '负责人'),
      select('status', '状态', TASK_STATUS), select('priority', '优先级', PRIORITY),
      date('due_at', '截止日期'), date('plan_start', '计划开始'), date('plan_end', '计划结束'),
    ],
  },
  {
    name: 'hub_pj_milestones', title: '里程碑', fields: [
      input('name', '里程碑'), belongsTo('project', '所属项目', 'hub_pj_projects', 'project_id'), date('due_at', '到期日'),
      select('status', '状态', options([['pending', '待达成', 'blue'], ['reached', '已达成', 'green']])),
    ],
  },
  {
    name: 'hub_tk_tickets', title: '工单', fields: [
      input('title', '工单标题'), select('priority', '优先级', PRIORITY), input('customer', '客户'),
      select('category', '类别', options([['customs', '关务', 'blue'], ['logistics', '物流仓储', 'cyan'], ['compliance', '合规认证', 'purple'], ['channel', '渠道上架', 'green'], ['payment', '结算支付', 'orange'], ['policy', '政策咨询', 'default'], ['after_sales', '售后', 'red'], ['legal', '法务', 'default']])),
      input('assignee', '处理人'), select('status', '状态', TICKET_STATUS), date('planned_resolve_at', '计划解决'), checkbox('is_overdue', '已逾期'),
    ],
  },
  {
    name: 'hub_kb_articles', title: '知识文章', fields: [
      input('title', '标题'),
      select('category', '类别', options([['compliance', '合规认证', 'blue'], ['logistics', '物流仓储', 'cyan'], ['payment', '结算支付', 'orange'], ['channel', '渠道拓展', 'green']])),
      select('status', '状态', options([['draft', '草稿', 'default'], ['published', '已发布', 'green']])),
    ],
  },
  {
    name: 'hub_as_vendors', title: '供应商', fields: [
      input('name', '供应商'), input('contact', '联系方式'),
      select('category', '类别', options([['certification', '认证服务', 'blue'], ['logistics', '物流仓储', 'cyan'], ['legal', '法务代理', 'purple'], ['misc', '综合', 'default']])),
      select('status', '状态', options([['active', '合作中', 'green'], ['inactive', '停用', 'default']])),
    ],
  },
  {
    name: 'hub_as_assets', title: '资产', fields: [
      input('name', '资产名称'), input('no', '资产编号'),
      select('category', '类别', options([['it', 'IT 设备', 'blue'], ['equipment', '专业设备', 'cyan'], ['furniture', '办公家具', 'default']])),
      input('brand', '品牌'),
      select('status', '状态', options([['in_use', '在用', 'green'], ['idle', '闲置', 'default'], ['repair', '维修中', 'orange'], ['retired', '报废', 'red']])),
      belongsTo('vendor', '供应商', 'hub_as_vendors', 'vendor_id'), date('purchase_date', '采购日期'), date('warranty_until', '保修截止'),
    ],
  },
  {
    name: 'hub_as_assignments', title: '资产领用', fields: [
      belongsTo('asset', '资产', 'hub_as_assets', 'asset_id'), input('assignee', '领用人'), date('assigned_at', '领用日期'), date('returned_at', '归还日期'), textarea('note', '备注'),
    ],
  },
  {
    name: 'hub_as_maintenance', title: '维保记录', fields: [
      belongsTo('asset', '资产', 'hub_as_assets', 'asset_id'),
      select('type', '类型', options([['repair', '维修', 'red'], ['inspection', '巡检', 'blue'], ['calibration', '校准', 'cyan']])),
      date('scheduled_at', '计划日期'), belongsTo('vendor', '服务商', 'hub_as_vendors', 'vendor_id'), number('cost', '费用'),
      select('status', '状态', options([['pending', '待执行', 'orange'], ['done', '已完成', 'green']])),
    ],
  },
  {
    name: 'hub_hr_departments', title: '部门', fields: [
      input('name', '部门'), input('code', '编码'), input('manager', '负责人'), integer('headcount', '编制人数'),
    ],
  },
  {
    name: 'hub_hr_employees', title: '员工', fields: [
      input('name', '姓名'), input('employee_no', '工号'), belongsTo('department', '部门', 'hub_hr_departments', 'department_id'),
      input('title', '职务'), input('phone', '电话'),
      select('status', '状态', options([['active', '在职', 'green'], ['on_leave', '休假', 'orange'], ['resigned', '离职', 'default']])),
    ],
  },
  {
    name: 'hub_hr_leave_requests', title: '请假申请', fields: [
      belongsTo('employee', '员工', 'hub_hr_employees', 'employee_id'),
      select('type', '类型', options([['annual', '年假', 'blue'], ['sick', '病假', 'red'], ['personal', '事假', 'orange']])),
      date('start_at', '开始'), date('end_at', '结束'), number('days', '天数'),
      select('status', '状态', options([['pending', '待审批', 'orange'], ['approved', '已批准', 'green'], ['rejected', '已驳回', 'red']])),
      input('reason', '事由'),
    ],
  },
  {
    name: 'hub_md_customer_categories', title: '客户分类', fields: [input('name', '分类'), input('code', '编码'), checkbox('is_active', '启用')],
  },
  {
    name: 'hub_md_ticket_categories', title: '工单分类', fields: [input('name', '分类'), input('code', '编码'), checkbox('is_active', '启用')],
  },
  {
    name: 'hub_md_asset_categories', title: '资产分类', fields: [input('name', '分类'), input('code', '编码'), checkbox('is_active', '启用')],
  },
  {
    name: 'hub_md_product_categories', title: '产品分类', fields: [input('name', '分类'), input('code', '编码'), checkbox('is_active', '启用')],
  },
]

const MENU: ReadonlyArray<{ group: string | null; groupIcon?: string; pages: ReadonlyArray<{ title: string; icon: string }> }> = [
  { group: null, pages: [{ title: '工作台', icon: 'DashboardOutlined' }] },
  {
    group: '项目管理', groupIcon: 'ProjectOutlined',
    pages: [
      { title: '项目', icon: 'ContainerOutlined' },
      { title: '任务看板', icon: 'AppstoreOutlined' },
      { title: '任务列表', icon: 'OrderedListOutlined' },
      { title: '任务日历', icon: 'CalendarOutlined' },
      { title: '任务甘特', icon: 'BarChartOutlined' },
      { title: '里程碑', icon: 'FlagOutlined' },
    ],
  },
  {
    group: '工单中心', groupIcon: 'CustomerServiceOutlined',
    pages: [{ title: '工单', icon: 'MessageOutlined' }, { title: '知识文章', icon: 'ReadOutlined' }],
  },
  {
    group: '资产管理', groupIcon: 'DatabaseOutlined',
    pages: [{ title: '资产台账', icon: 'HddOutlined' }, { title: '供应商', icon: 'ShopOutlined' }, { title: '维保记录', icon: 'ToolOutlined' }],
  },
  {
    group: '人事管理', groupIcon: 'TeamOutlined',
    pages: [{ title: '员工', icon: 'IdcardOutlined' }, { title: '部门', icon: 'ApartmentOutlined' }, { title: '请假审批', icon: 'FileProtectOutlined' }],
  },
  {
    group: '基础数据', groupIcon: 'BookOutlined',
    pages: [{ title: '分类维护', icon: 'TableOutlined' }],
  },
]

const SEEDS: ReadonlyArray<{ fixtureKey: string; collection: string; uniqueKey: string; refs: Record<string, string> }> = [
  { fixtureKey: 'projects', collection: 'hub_pj_projects', uniqueKey: 'no', refs: {} },
  { fixtureKey: 'tasks', collection: 'hub_pj_tasks', uniqueKey: 'title', refs: { project: 'hub_pj_projects' } },
  { fixtureKey: 'milestones', collection: 'hub_pj_milestones', uniqueKey: 'name', refs: { project: 'hub_pj_projects' } },
  { fixtureKey: 'tickets', collection: 'hub_tk_tickets', uniqueKey: 'title', refs: {} },
  { fixtureKey: 'articles', collection: 'hub_kb_articles', uniqueKey: 'title', refs: {} },
  { fixtureKey: 'vendors', collection: 'hub_as_vendors', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'assets', collection: 'hub_as_assets', uniqueKey: 'no', refs: { vendor: 'hub_as_vendors' } },
  { fixtureKey: 'assignments', collection: 'hub_as_assignments', uniqueKey: 'note', refs: { asset: 'hub_as_assets' } },
  { fixtureKey: 'maintenance', collection: 'hub_as_maintenance', uniqueKey: 'scheduled_at', refs: { asset: 'hub_as_assets', vendor: 'hub_as_vendors' } },
  { fixtureKey: 'departments', collection: 'hub_hr_departments', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'employees', collection: 'hub_hr_employees', uniqueKey: 'employee_no', refs: { department: 'hub_hr_departments' } },
  { fixtureKey: 'leave_requests', collection: 'hub_hr_leave_requests', uniqueKey: 'reason', refs: { employee: 'hub_hr_employees' } },
  { fixtureKey: 'customer_categories', collection: 'hub_md_customer_categories', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'ticket_categories', collection: 'hub_md_ticket_categories', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'asset_categories', collection: 'hub_md_asset_categories', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'product_categories', collection: 'hub_md_product_categories', uniqueKey: 'code', refs: {} },
]

async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  }
  return payload
}

async function dataOf(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const payload = await call(token, method, path, body)
  return payload?.data ?? null
}

async function signIn(): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`nocobase-hub: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields })
    console.log(`nocobase-hub: collection ${collection.name} created`)
  }
}

async function keyMap(token: string, collection: string, key: string): Promise<Map<string, number>> {
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500`)
  return new Map((rows ?? []).map((row: any) => [String(row[key]), row.id]))
}

async function seed(token: string, fixtures: Record<string, Array<Record<string, unknown>>>): Promise<void> {
  const refCache = new Map<string, Map<string, number>>()
  const refKey = new Map([['hub_pj_projects', 'name'], ['hub_as_assets', 'name'], ['hub_as_vendors', 'name'], ['hub_hr_departments', 'name'], ['hub_hr_employees', 'name']])
  for (const spec of SEEDS) {
    const rows = fixtures[spec.fixtureKey]
    if (rows === undefined) throw new Error(`fixture file has no "${spec.fixtureKey}" array`)
    const existing = new Set((await keyMap(token, spec.collection, spec.uniqueKey)).keys())
    let added = 0
    for (const row of rows) {
      if (existing.has(String(row[spec.uniqueKey]))) continue
      const payload: Record<string, unknown> = { ...row }
      for (const [field, target] of Object.entries(spec.refs)) {
        const value = row[field]
        if (value === null || value === undefined) { delete payload[field]; continue }
        if (!refCache.has(target)) refCache.set(target, await keyMap(token, target, refKey.get(target) ?? 'name'))
        const id = refCache.get(target)!.get(String(value))
        if (id === undefined) throw new Error(`seed ${field}: no ${target} row named "${String(value)}"`)
        payload[field] = { id }
      }
      await dataOf(token, 'POST', `/api/${spec.collection}:create`, payload)
      added += 1
    }
    console.log(`nocobase-hub: seed ${spec.collection} +${added} (existing kept: ${existing.size}/${rows.length})`)
  }
}

async function ensureMenus(token: string): Promise<Map<string, string>> {
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=300') as Array<{ id: number, title: string | null, type: string, schemaUid: string | null }> | null
  const byTitle = new Map((routes ?? []).map(row => [row.title ?? '', row]))
  const pageByUrl = new Map<string, string>()
  for (const group of MENU) {
    let groupId: number | null = null
    if (group.group !== null) {
      let groupRow = byTitle.get(group.group)
      if (groupRow === undefined) {
        groupRow = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: group.group, icon: group.groupIcon, type: 'group' })
        console.log(`nocobase-hub: menu group "${group.group}" created`)
      } else {
        console.log(`nocobase-hub: menu group "${group.group}" exists (kept)`)
      }
      groupId = groupRow.id
    }
    for (const page of group.pages) {
      let pageRow = byTitle.get(page.title)
      if (pageRow === undefined) {
        pageRow = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: page.title, icon: page.icon, type: 'page', ...(groupId === null ? {} : { parentId: groupId }) })
        console.log(`nocobase-hub: page "${page.title}" created`)
      }
      if (pageRow.schemaUid === null || pageRow.schemaUid === undefined) {
        const schema = await dataOf(token, 'POST', '/api/uiSchemas:create', { type: 'void', 'x-component': 'Page' })
        // The insert response echoes the stored Grid with its server-generated
        // x-uid, which the tabs child below must reference (N14: a v1 page
        // without a tabs child renders only the header, never the content).
        const inserted = await dataOf(token, 'POST', `/api/uiSchemas:insertAdjacent/${schema['x-uid']}?position=afterBegin`, {
          schema: { type: 'void', 'x-component': 'Grid', 'x-initializer': 'page:addBlock' },
        }) as Record<string, unknown>
        await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${pageRow.id}`, { schemaUid: schema['x-uid'] })
        const gridUid = inserted?.['x-uid'] as string | undefined
        const gridName = inserted?.name as string | undefined
        if (typeof gridUid === 'string') {
          await call(token, 'POST', '/api/desktopRoutes:create', {
            title: '', type: 'tabs', parentId: pageRow.id, schemaUid: gridUid, tabSchemaName: gridName ?? gridUid,
          })
        }
        pageByUrl.set(page.title, schema['x-uid'])
        console.log(`nocobase-hub: page "${page.title}" wired (${baseUrl}/admin/${schema['x-uid']})`)
      } else {
        pageByUrl.set(page.title, pageRow.schemaUid)
        console.log(`nocobase-hub: page "${page.title}" at ${baseUrl}/admin/${pageRow.schemaUid}`)
      }
    }
  }
  return pageByUrl
}

/**
 * Random node key in the NocoBase uid style (11 lowercase base36 chars).
 *
 * Wire keys double as uiSchemas `name` values; insertAdjacent treats a
 * repeated name as the same node, so literal keys like `col`/`table` across
 * pages graft later inserts onto unrelated trees and leave earlier pages
 * with a broken Grid.Row -> CardItem chain that renders blank.
 */
const nodeKey = (): string => Math.random().toString(36).slice(2, 13)

// The CollectionField child key must be the field name: TableV2 derives the
// column dataIndex from that schema `name` and the cell reads record[name];
// a random key renders the column with empty cells (N14).
const columnNode = (collection: string, field: string): Record<string, unknown> => ({
  type: 'void',
  'x-decorator': 'TableV2.Column.Decorator',
  'x-toolbar': 'TableColumnSchemaToolbar',
  'x-settings': 'fieldSettings:TableColumn',
  'x-component': 'TableV2.Column',
  properties: {
    [field]: {
      'x-collection-field': `${collection}.${field}`,
      'x-component': 'CollectionField',
      'x-component-props': { ellipsis: true },
      'x-read-pretty': true,
      'x-decorator': null,
      'x-decorator-props': { labelStyle: { display: 'none' } },
    },
  },
})

function tableBlock(collection: string, columns: string[], filter?: object): Record<string, unknown> {
  return {
    _isJSONSchemaObject: true, version: '2.0', type: 'void',
    'x-decorator': 'TableBlockProvider',
    'x-acl-action': `${collection}:list`,
    'x-use-decorator-props': 'useTableBlockDecoratorProps',
    'x-decorator-props': { collection, dataSource: 'main', action: 'list', params: { pageSize: 20, ...(filter === undefined ? {} : { filter }) }, showIndex: true, dragSort: false },
    'x-toolbar': 'BlockSchemaToolbar', 'x-settings': 'blockSettings:table', 'x-filter-targets': [],
    'x-component': 'CardItem',
    properties: {
      [nodeKey()]: { type: 'void', 'x-initializer': 'table:configureActions', 'x-component': 'ActionBar', 'x-component-props': { style: { marginBottom: 'var(--nb-spacing)' } } },
      [nodeKey()]: {
        type: 'array', 'x-initializer': 'table:configureColumns', 'x-component': 'TableV2',
        'x-use-component-props': 'useTableBlockProps', 'x-component-props': { rowKey: 'id', rowSelection: { type: 'checkbox' } },
        properties: Object.fromEntries(columns.map(field => [nodeKey(), columnNode(collection, field)])),
      },
    },
  }
}

function kanbanCardField(collection: string, field: string): Record<string, unknown> {
  return {
    _isJSONSchemaObject: true, version: '2.0', type: 'string',
    'x-toolbar': 'FormItemSchemaToolbar', 'x-settings': 'fieldSettings:FormItem',
    'x-component': 'CollectionField', 'x-decorator': 'FormItem',
    'x-collection-field': `${collection}.${field}`,
    'x-component-props': { style: { width: '100%' } }, 'x-read-pretty': true,
  }
}

function kanbanBlock(collection: string, groupField: string, cardFields: string[]): Record<string, unknown> {
  return {
    _isJSONSchemaObject: true, version: '2.0', type: 'void',
    'x-acl-action': `${collection}:list`,
    'x-decorator': 'KanbanBlockProvider',
    'x-decorator-props': { collection, dataSource: 'main', action: 'list', groupField, sortField: 'sort', params: { paginate: false, sort: ['sort'] } },
    'x-toolbar': 'BlockSchemaToolbar', 'x-settings': 'blockSettings:kanban', 'x-component': 'CardItem',
    properties: {
      [nodeKey()]: { type: 'void', 'x-initializer': 'kanban:configureActions', 'x-component': 'ActionBar', 'x-component-props': { style: { marginBottom: 'var(--nb-spacing)' } } },
      [nodeKey()]: {
        type: 'array', 'x-component': 'Kanban', 'x-use-component-props': 'useKanbanBlockProps',
        properties: {
          [nodeKey()]: {
            type: 'void', 'x-read-pretty': true, 'x-label-disabled': true,
            'x-decorator': 'BlockItem', 'x-component': 'Kanban.Card',
            'x-component-props': { openMode: 'drawer' },
            'x-action-context': { dataSource: 'main', collection },
            properties: {
              [nodeKey()]: {
                type: 'void', 'x-component': 'Grid', 'x-component-props': { dndContext: false },
                properties: Object.fromEntries(cardFields.map(field => [field, kanbanCardField(collection, field)])),
              },
            },
          },
        },
      },
    },
  }
}
function calendarBlock(collection: string, startField: string, titleField: string): Record<string, unknown> {
  return {
    _isJSONSchemaObject: true, version: '2.0', type: 'void',
    'x-acl-action': `${collection}:list`,
    'x-decorator': 'CalendarBlockProvider', 'x-use-decorator-props': 'useCalendarBlockDecoratorProps',
    'x-decorator-props': { collection, dataSource: 'main', action: 'list', fieldNames: { id: 'id', start: startField, title: titleField, end: [] }, params: { paginate: false } },
    'x-toolbar': 'BlockSchemaToolbar', 'x-settings': 'blockSettings:calendar', 'x-component': 'CardItem',
    properties: {
      [nodeKey()]: {
        type: 'void', 'x-component': 'CalendarV2', 'x-use-component-props': 'useCalendarBlockProps',
        properties: {
          [nodeKey()]: { type: 'void', 'x-component': 'CalendarV2.ActionBar', 'x-component-props': { style: { marginBottom: 24 } }, 'x-initializer': 'calendar:configureActions' },
        },
      },
    },
  }
}

function ganttBlock(collection: string, startField: string, endField: string, titleField: string): Record<string, unknown> {
  return {
    _isJSONSchemaObject: true, version: '2.0', type: 'void',
    'x-acl-action': `${collection}:list`,
    'x-decorator': 'GanttBlockProvider',
    'x-decorator-props': { collection, dataSource: 'main', action: 'list', fieldNames: { id: 'id', start: startField, end: endField, title: titleField, range: 'day' }, params: { paginate: false } },
    'x-designer': 'Gantt.Designer', 'x-component': 'CardItem',
    properties: {
      [nodeKey()]: {
        type: 'void', 'x-component': 'Gantt', 'x-component-props': { useProps: '{{ useGanttBlockProps }}' },
        properties: {
          [nodeKey()]: { type: 'void', 'x-component': 'ActionBar', 'x-component-props': { style: { marginBottom: 24 } }, 'x-initializer': 'gantt:configureActions' },
        },
      },
    },
  }
}

function schemaHasComponent(node: unknown, component: string): boolean {
  if (node === null || typeof node !== 'object') return false
  const record = node as Record<string, unknown>
  if (record['x-component'] === component) return true
  for (const child of Object.values(record.properties ?? {})) {
    if (schemaHasComponent(child, component)) return true
  }
  return false
}

type BlockSpec =
  | { kind: 'table'; collection: string; columns: string[]; filter?: object }
  | { kind: 'kanban'; collection: string; groupField: string; cardFields: string[] }
  | { kind: 'calendar'; collection: string; start: string; title: string }
  | { kind: 'gantt'; collection: string; start: string; end: string; title: string }

/** Page → ordered block specs; multiple entries stack rows in one Grid. */
const PAGE_BLOCKS: ReadonlyArray<{ page: string; blocks: ReadonlyArray<BlockSpec> }> = [
  {
    page: '工作台', blocks: [
      { kind: 'table', collection: 'hub_pj_tasks', columns: ['title', 'project', 'assignee', 'status', 'priority', 'due_at'], filter: { status: { $notIn: ['done', 'cancelled'] } } },
      { kind: 'table', collection: 'hub_tk_tickets', columns: ['title', 'customer', 'assignee', 'status', 'planned_resolve_at'], filter: { is_overdue: true } },
    ],
  },
  { page: '项目', blocks: [{ kind: 'table', collection: 'hub_pj_projects', columns: ['name', 'no', 'customer', 'owner', 'status', 'progress', 'priority', 'planned_end_date'] }] },
  { page: '任务看板', blocks: [{ kind: 'kanban', collection: 'hub_pj_tasks', groupField: 'status', cardFields: ['title', 'project', 'assignee', 'priority'] }] },
  { page: '任务列表', blocks: [{ kind: 'table', collection: 'hub_pj_tasks', columns: ['title', 'project', 'assignee', 'status', 'priority', 'due_at', 'plan_start', 'plan_end'] }] },
  { page: '任务日历', blocks: [{ kind: 'calendar', collection: 'hub_pj_tasks', start: 'due_at', title: 'title' }] },
  { page: '任务甘特', blocks: [{ kind: 'gantt', collection: 'hub_pj_tasks', start: 'plan_start', end: 'plan_end', title: 'title' }] },
  { page: '里程碑', blocks: [{ kind: 'table', collection: 'hub_pj_milestones', columns: ['name', 'project', 'due_at', 'status'] }] },
  { page: '工单', blocks: [{ kind: 'table', collection: 'hub_tk_tickets', columns: ['title', 'priority', 'customer', 'category', 'assignee', 'status', 'planned_resolve_at', 'is_overdue'] }] },
  { page: '知识文章', blocks: [{ kind: 'table', collection: 'hub_kb_articles', columns: ['title', 'category', 'status'] }] },
  { page: '资产台账', blocks: [{ kind: 'table', collection: 'hub_as_assets', columns: ['name', 'no', 'category', 'brand', 'status', 'vendor', 'purchase_date', 'warranty_until'] }] },
  { page: '供应商', blocks: [{ kind: 'table', collection: 'hub_as_vendors', columns: ['name', 'contact', 'category', 'status'] }] },
  { page: '维保记录', blocks: [{ kind: 'table', collection: 'hub_as_maintenance', columns: ['asset', 'type', 'scheduled_at', 'vendor', 'cost', 'status'] }] },
  { page: '员工', blocks: [{ kind: 'table', collection: 'hub_hr_employees', columns: ['name', 'employee_no', 'department', 'title', 'phone', 'status'] }] },
  { page: '部门', blocks: [{ kind: 'table', collection: 'hub_hr_departments', columns: ['name', 'code', 'manager', 'headcount'] }] },
  { page: '请假审批', blocks: [{ kind: 'table', collection: 'hub_hr_leave_requests', columns: ['employee', 'type', 'start_at', 'end_at', 'days', 'status', 'reason'] }] },
  {
    page: '分类维护', blocks: [
      { kind: 'table', collection: 'hub_md_customer_categories', columns: ['name', 'code', 'is_active'] },
      { kind: 'table', collection: 'hub_md_ticket_categories', columns: ['name', 'code', 'is_active'] },
      { kind: 'table', collection: 'hub_md_asset_categories', columns: ['name', 'code', 'is_active'] },
      { kind: 'table', collection: 'hub_md_product_categories', columns: ['name', 'code', 'is_active'] },
    ],
  },
]

async function ensureBlocks(token: string, pageByUrl: Map<string, string>): Promise<void> {
  for (const block of PAGE_BLOCKS) {
    if (block.blocks.some(spec => spec.kind === 'kanban')) {
      const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: block.blocks[0].collection } }))}&pageSize=200`) as { name?: string }[] | null
      if (!(fields ?? []).some(field => field.name === 'sort')) {
        const kanban = block.blocks.find(spec => spec.kind === 'kanban') as { collection: string, groupField: string }
        await dataOf(token, 'POST', `/api/collections/${kanban.collection}/fields:create`, { name: 'sort', type: 'sort', interface: 'sort', scopeKey: kanban.groupField })
        console.log(`nocobase-hub: sort field added to ${kanban.collection}`)
      }
    }
  }
  for (const page of PAGE_BLOCKS) {
    const pageUid = pageByUrl.get(page.page)
    if (pageUid === undefined) throw new Error(`page "${page.page}" was not created in the menu step`)
    const pageTree = await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${pageUid}`)
    const grid = Object.values((pageTree?.properties ?? {})).find(child => (child as Record<string, unknown>)['x-component'] === 'Grid') as Record<string, unknown> | undefined
    if (grid === undefined) throw new Error(`page "${page.page}" schema has no Grid child`)
    for (const spec of page.blocks) {
      // Idempotency per block kind: stop when this page already carries one
      // block of the same kind (table pages with multiple table blocks stack
      // in insertion order on first run only).
      const already = schemaHasComponent(pageTree, spec.kind === 'table' ? 'TableV2' : spec.kind === 'kanban' ? 'Kanban' : spec.kind === 'calendar' ? 'CalendarV2' : 'Gantt')
      if (already && spec.kind !== 'table') {
        console.log(`nocobase-hub: ${spec.kind} block on "${page.page}" exists (kept)`)
        continue
      }
      if (already && spec.kind === 'table') {
        // Idempotency for stacked table pages: once the Grid holds every
        // configured table block (row count matches), nothing to add.
        const expectedTables = page.blocks.filter(s => s.kind === 'table').length
        if (Object.keys(grid.properties ?? {}).length >= expectedTables) continue
      }
      const inner = spec.kind === 'table' ? tableBlock(spec.collection, spec.columns, spec.filter)
        : spec.kind === 'kanban' ? kanbanBlock(spec.collection, spec.groupField, spec.cardFields)
        : spec.kind === 'calendar' ? calendarBlock(spec.collection, spec.start, spec.title)
        : ganttBlock(spec.collection, spec.start, spec.end, spec.title)
      const inserted = await call(token, 'POST', `/api/uiSchemas:insertAdjacent/${grid['x-uid']}?position=beforeEnd`, {
        schema: { type: 'void', 'x-component': 'Grid.Row', properties: { [nodeKey()]: { type: 'void', 'x-component': 'Grid.Col', properties: { [nodeKey()]: inner } } } },
      })
      // Refresh the working copy so subsequent specs see the updated Grid.
      ;(grid.properties as Record<string, unknown>) = { ...(grid.properties ?? {}), [inserted?.data?.name ?? `row${Object.keys(grid.properties ?? {}).length}`]: inserted?.data ?? {} }
      console.log(`nocobase-hub: ${spec.kind} block inserted on "${page.page}" (${spec.collection})`)
    }
  }
}

/**
 * Backfill `fieldNames.label` on every existing belongsTo field (N16): rows
 * created before the factory carried the property render record['label'] as
 * N/A in every m2o table cell. fields:update merges uiSchema, so already
 * correct fields stay untouched and the step replays as a no-op.
 */
async function ensureAssociationFieldNames(token: string): Promise<void> {
  let patched = 0
  for (const collection of COLLECTIONS) {
    const hasM2o = collection.fields.some((field) => (field as { type?: string }).type === 'belongsTo')
    if (!hasM2o) continue
    const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection.name }, type: { $eq: 'belongsTo' } }))}&pageSize=100`) as Array<{ name?: string, uiSchema?: { 'x-component-props'?: { fieldNames?: { label?: string } } } }> | null
    for (const row of rows ?? []) {
      if (row.name === undefined) continue
      if (row.uiSchema?.['x-component-props']?.fieldNames?.label === 'name') continue
      await dataOf(token, 'POST', `/api/collections/${collection.name}/fields:update?filterByTk=${row.name}`, {
        uiSchema: { 'x-component-props': { fieldNames: { label: 'name', value: 'id' } } },
      })
      patched += 1
    }
  }
  console.log(`nocobase-hub: m2o fieldNames backfill ${patched > 0 ? `${patched} field(s) patched` : 'all present (kept)'}`)
}

/**
 * demo-portal-hub reads a few field names that differ from the admin-facing
 * ones (tasks.due_date, leave_requests.start_date/end_date, and
 * kb_articles.createdAt for recent-article sorting). Add them and backfill
 * from existing rows; idempotent by field presence and equal values.
 */
async function ensurePortalFields(token: string): Promise<void> {
  const hasField = async (collection: string, name: string): Promise<boolean> => {
    const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection }, name: { $eq: name } }))}&pageSize=5`)
    return (rows ?? []).length > 0
  }
  const addField = async (collection: string, field: Record<string, unknown>): Promise<boolean> => {
    if (await hasField(collection, field.name as string)) return false
    await dataOf(token, 'POST', `/api/collections/${collection}/fields:create`, field)
    return true
  }
  const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
  const added: string[] = []
  if (await addField('hub_pj_tasks', date('due_date', '截止(portal)'))) added.push('hub_pj_tasks.due_date')
  if (await addField('hub_hr_leave_requests', date('start_date', '开始(portal)'))) added.push('hub_hr_leave_requests.start_date')
  if (await addField('hub_hr_leave_requests', date('end_date', '结束(portal)'))) added.push('hub_hr_leave_requests.end_date')
  // hub_kb_articles has no system createdAt column (tables created through
  // collections:create in this snapshot only gain id + declared fields), and
  // the portal sorts recent articles by createdAt, so add it as a plain
  // dateOnly column.
  if (await addField('hub_kb_articles', { name: 'createdAt', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '发布日(portal)' } })) added.push('hub_kb_articles.createdAt')
  const backfill: Array<{ collection: string; assign: (row: any) => Array<[string, unknown]> }> = [
    { collection: 'hub_pj_tasks', assign: row => [['due_date', row.due_at ?? null]] },
    { collection: 'hub_hr_leave_requests', assign: row => [['start_date', row.start_at ?? null], ['end_date', row.end_at ?? null]] },
    { collection: 'hub_kb_articles', assign: row => [['createdAt', '2026-09-01']] },
  ]
  for (const spec of backfill) {
    const rows = await dataOf(token, 'GET', `/api/${spec.collection}:list?pageSize=500`) as any[] | null
    let updated = 0
    for (const row of rows ?? []) {
      const patchEntries = spec.assign(row).filter(([key, value]) => row[key] !== value)
      if (patchEntries.length === 0) continue
      await dataOf(token, 'POST', `/api/${spec.collection}:update?filterByTk=${row.id}`, Object.fromEntries(patchEntries))
      updated += 1
    }
    console.log(`nocobase-hub: portal backfill ${spec.collection} (${updated} rows)`)
  }
  console.log(`nocobase-hub: portal alignment fields ${added.length > 0 ? added.join(', ') : 'all present (kept)'}`)
}

async function main(): Promise<void> {
  const token = await signIn()
  await ensureCollections(token)
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await seed(token, fixtures)
  const pageByUrl = await ensureMenus(token)
  await ensureBlocks(token, pageByUrl)
  await ensureAssociationFieldNames(token)
  await ensurePortalFields(token)
  console.log('nocobase-hub: done')
}

await main()
