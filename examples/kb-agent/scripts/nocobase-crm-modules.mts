/**
 * CRM business modules for the NocoBase demo-grade build (plan batch B2 of
 * plans/nocobase-full-features). Creates the crm_* collections (resource
 * names aligned with the official demo-portal-crm front end so a later
 * portal deploy consumes them as-is), seeds realistic food-industry rows
 * (fixture: examples/kb-agent/workspace/data/crm/dataset.json), and wires
 * the two menu groups with one page per entity (each page gets a bare Page
 * schema root; blocks are configured by hand in the browser per the plan's
 * dual-track page strategy).
 *
 * Idempotent: collections exist = kept; menu groups/pages match by title;
 * seed rows upsert by business unique key (name/quote_no/invoice_no/...).
 * Association fixtures reference targets by business name and resolve to
 * row ids at seed time.
 *
 * Wire facts verified against the live 2.2.6 instance (2026-09-09):
 * single-select fields are type "string" + interface "select" with the
 * option list in uiSchema.enum (the DB layer has no "select" field type);
 * belongsTo fields take foreignKey and render through AssociationField;
 * desktopRoutes pages are created with schemaUid null, so each page needs
 * uiSchemas:create ({type:'void', 'x-component':'Page'}) plus
 * desktopRoutes:update to point schemaUid at it.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-crm-modules.mts
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'
const fixturePath = join(repoRoot, 'examples/kb-agent/workspace/data/crm/dataset.json')

/** Select option shorthand for field declarations below. */
function options(pairs: ReadonlyArray<[string, string, string]>): object[] {
  return pairs.map(([value, label, color]) => ({ value, label, color }))
}

// Each factory takes the field name explicitly: collections:create
// generates random column names (f_xxxxx) for fields without one, so an
// omitted name silently detaches the column from every later read.
const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const belongsTo = (name: string, title: string, target: string, foreignKey: string): object => ({
  name, type: 'belongsTo', interface: 'm2o', target, foreignKey,
  // fieldNames names the target column AssociationField renders; without it
  // the viewer reads record['label'] (missing) and every m2o table cell shows
  // N/A even though the list request appends the association (N16).
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: 'name', value: 'id' } } },
})
const checkbox = (name: string, title: string): object => ({ name, type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })

const LEAD_STAGES = options([
  ['new', 'New lead', 'default'],
  ['contacted', 'Contacted', 'blue'],
  ['requirements_confirmed', 'Requirements confirmed', 'cyan'],
  ['proposal', 'Proposal or quotation', 'purple'],
  ['negotiation', 'Negotiation', 'orange'],
  ['won', 'Won', 'green'],
  ['lost', 'Lost', 'red'],
])
const QUOTE_STATUSES = options([
  ['draft', '草稿', 'default'], ['sent', '已发送', 'blue'], ['accepted', '已接受', 'green'],
  ['converted', '已转订单', 'purple'], ['void', '已作废', 'default'], ['rejected', '已拒绝', 'red'],
  ['pending_approval', '待审批', 'orange'],
])
/** demo-portal-crm's lead source enum (constants.ts LEAD_SOURCES). */
const LEAD_SOURCE_OPTIONS = options([
  ['website', 'Website', 'blue'], ['referral', 'Referral', 'green'], ['event', 'Event', 'cyan'],
  ['outbound', 'Outbound', 'orange'], ['partner', 'Partner', 'purple'],
])

/**
 * The ten CRM collections. Timestamps are deliberately not declared
 * (system DATE columns already exist, same rationale as setup-nocobase).
 */
const COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  {
    name: 'crm_leads', title: '销售线索', fields: [
      input('name', '线索名称'), input('company', '公司'), select('stage', '阶段', LEAD_STAGES),
      input('owner', '负责人'), number('expected_amount', '预计金额'), date('expected_close_date', '预计成交日期'),
    ],
  },
  {
    name: 'crm_customers', title: '客户', fields: [
      input('name', '客户名称'),
      select('type', '类型', options([['enterprise', '企业客户', 'blue'], ['trader', '贸易商', 'cyan'], ['factory', '工厂', 'green']])),
      input('industry', '行业'), input('country', '国家/地区'),
      select('level', '等级', options([['A', 'A 级', 'green'], ['B', 'B 级', 'blue'], ['C', 'C 级', 'orange']])),
      select('status', '状态', options([['active', '合作中', 'green'], ['prospect', '潜在', 'blue'], ['churned', '已流失', 'red']])),
    ],
  },
  {
    name: 'crm_contacts', title: '联系人', fields: [
      input('full_name', '姓名'), belongsTo('customer', '所属客户', 'crm_customers', 'customer_id'),
      input('job_title', '职务'), input('email', '邮箱'), input('phone', '电话'),
      checkbox('is_primary', '主要联系人'),
      select('status', '状态', options([['active', '在职', 'green'], ['inactive', '离职', 'default']])),
    ],
  },
  {
    name: 'crm_deals', title: '订单', fields: [
      input('name', '订单名称'), belongsTo('customer', '客户', 'crm_customers', 'customer_id'), date('deadline', '交付截止'),
      number('amount', '金额'),
      select('status', '状态', options([['pending', '处理中', 'blue'], ['fulfilled', '已交付', 'green'], ['cancelled', '已取消', 'red']])),
      input('owner', '负责人'),
    ],
  },
  {
    name: 'crm_quotes', title: '报价单', fields: [
      input('quote_no', '报价编号'), date('valid_until', '有效期至'),
      belongsTo('customer', '客户', 'crm_customers', 'customer_id'), belongsTo('deal', '关联订单', 'crm_deals', 'deal_id'),
      number('total_amount', '总金额'), select('status', '状态', QUOTE_STATUSES),
    ],
  },
  {
    name: 'crm_products', title: '产品与服务', fields: [
      input('name', '名称'),
      select('category', '类别', options([['compliance', '合规认证', 'blue'], ['logistics', '海外仓储', 'cyan'], ['channel', '渠道拓展', 'green'], ['brand', '品牌营销', 'purple'], ['data', '数据洞察', 'orange'], ['ops', '运营辅导', 'default']])),
      select('pricing_mode', '计价方式', options([['fixed', '固定报价', 'blue'], ['times', '按次计费', 'green'], ['subscription', '年度订阅', 'purple']])),
      input('unit', '单位'), number('base_price', '基准单价'),
    ],
  },
  {
    name: 'crm_activities', title: '销售活动', fields: [
      select('type', '类型', options([['call', '电话', 'blue'], ['meeting', '会议', 'green'], ['email', '邮件', 'cyan'], ['task', '任务', 'orange']])),
      input('title', '主题'), belongsTo('customer', '客户', 'crm_customers', 'customer_id'), belongsTo('deal', '关联订单', 'crm_deals', 'deal_id'),
      date('due_at', '截止日期'), select('status', '状态', options([['pending', '待办', 'blue'], ['done', '已完成', 'green'], ['cancelled', '已取消', 'default']])),
    ],
  },
  {
    name: 'crm_follow_ups', title: '跟进记录', fields: [
      belongsTo('customer', '客户', 'crm_customers', 'customer_id'), belongsTo('lead', '线索', 'crm_leads', 'lead_id'),
      textarea('note', '跟进内容'), date('next_at', '下次跟进'),
    ],
  },
  {
    name: 'crm_payments', title: '回款', fields: [
      belongsTo('customer', '客户', 'crm_customers', 'customer_id'), belongsTo('deal', '订单', 'crm_deals', 'deal_id'), number('amount', '金额'),
      select('method', '方式', options([['bank_transfer', '银行转账', 'blue'], ['letter_of_credit', '信用证', 'green'], ['acceptance_bill', '承兑汇票', 'orange']])),
      date('paid_at', '到账日期'), select('status', '状态', options([['pending', '待到账', 'orange'], ['received', '已到账', 'green']])),
    ],
  },
  {
    name: 'crm_invoices', title: '发票', fields: [
      input('invoice_no', '发票号码'), belongsTo('customer', '客户', 'crm_customers', 'customer_id'), belongsTo('deal', '订单', 'crm_deals', 'deal_id'), number('amount', '金额'),
      date('issued_at', '开票日期'), select('status', '状态', options([['draft', '草稿', 'default'], ['issued', '已开具', 'blue'], ['paid', '已收款', 'green'], ['void', '已作废', 'red']])),
    ],
  },
]

/** Menu groups and their pages; blocks are added by hand in the browser. */
const MENU: ReadonlyArray<{ group: string; groupIcon: string; pages: ReadonlyArray<{ title: string; icon: string }> }> = [
  {
    group: 'CRM 客户', groupIcon: 'TeamOutlined',
    pages: [
      { title: '销售线索', icon: 'FlagOutlined' },
      { title: '客户', icon: 'ShopOutlined' },
      { title: '联系人', icon: 'UserOutlined' },
      { title: '产品与服务', icon: 'AppstoreOutlined' },
      { title: '客户仪表盘', icon: 'DashboardOutlined' },
    ],
  },
  {
    group: '销售流程', groupIcon: 'DollarOutlined',
    pages: [
      { title: '订单', icon: 'ProfileOutlined' },
      { title: '报价单', icon: 'FileTextOutlined' },
      { title: '回款', icon: 'PayCircleOutlined' },
      { title: '发票', icon: 'AuditOutlined' },
      { title: '销售仪表盘', icon: 'BarChartOutlined' },
    ],
  },
]

/**
 * Seed order matters: customers/leads/deals first, then referencing rows.
 * `fixtureKey` is the array key in dataset.json; the REST resource is the
 * crm_-prefixed collection name. `refs` maps create-payload association
 * fields to the fixtureKey they resolve business names against.
 */
const SEEDS: ReadonlyArray<{ fixtureKey: string; uniqueKey: string; refs: Record<string, string> }> = [
  { fixtureKey: 'customers', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'leads', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'deals', uniqueKey: 'name', refs: { customer: 'customers' } },
  { fixtureKey: 'contacts', uniqueKey: 'full_name', refs: { customer: 'customers' } },
  { fixtureKey: 'products', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'quotes', uniqueKey: 'quote_no', refs: { customer: 'customers', deal: 'deals' } },
  { fixtureKey: 'activities', uniqueKey: 'title', refs: { customer: 'customers', deal: 'deals' } },
  { fixtureKey: 'follow_ups', uniqueKey: 'note', refs: { customer: 'customers', lead: 'leads' } },
  { fixtureKey: 'payments', uniqueKey: 'paid_at', refs: { customer: 'customers', deal: 'deals' } },
  { fixtureKey: 'invoices', uniqueKey: 'invoice_no', refs: { customer: 'customers', deal: 'deals' } },
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
      console.log(`nocobase-crm: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields })
    console.log(`nocobase-crm: collection ${collection.name} created`)
  }
}

/** One row map from a collection keyed by the given business field. */
async function keyMap(token: string, collection: string, key: string): Promise<Map<string, number>> {
  // dataOf on a :list action already unwraps the wire `data` slot to the
  // row array, so iterate it directly.
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500`)
  return new Map((rows ?? []).map((row: any) => [String(row[key]), row.id]))
}

async function seed(token: string, fixtures: Record<string, Array<Record<string, unknown>>>): Promise<void> {
  const refCache = new Map<string, Map<string, number>>()
  const resolveRefs = async (refSpec: Record<string, string>, row: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const payload: Record<string, unknown> = { ...row }
    for (const [field, fixtureKey] of Object.entries(refSpec)) {
      const value = row[field]
      if (value === null || value === undefined) {
        delete payload[field]
        continue
      }
      const target = `crm_${fixtureKey}`
      if (!refCache.has(target)) refCache.set(target, await keyMap(token, target, 'name'))
      const id = refCache.get(target)!.get(String(value))
      if (id === undefined) throw new Error(`seed ${field}: no ${target} row named "${String(value)}"`)
      payload[field] = { id }
    }
    return payload
  }
  for (const spec of SEEDS) {
    const rows = fixtures[spec.fixtureKey]
    if (rows === undefined) throw new Error(`fixture file has no "${spec.fixtureKey}" array`)
    const collection = `crm_${spec.fixtureKey}`
    const existing = new Set((await keyMap(token, collection, spec.uniqueKey)).keys())
    let added = 0
    for (const row of rows) {
      if (existing.has(String(row[spec.uniqueKey]))) continue
      await dataOf(token, 'POST', `/api/${collection}:create`, await resolveRefs(spec.refs, row))
      added += 1
    }
    console.log(`nocobase-crm: seed ${collection} +${added} (existing kept: ${existing.size}/${rows.length})`)
  }
}

/** Menu groups + pages with bare Page schema roots; idempotent by title. */
async function ensureMenus(token: string): Promise<void> {
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=300') as Array<{ id: number, title: string | null, parentId: number | null, type: string, schemaUid: string | null }> | null
  const byTitle = new Map((routes ?? []).map(row => [row.title ?? '', row]))
  for (const group of MENU) {
    let groupRow = byTitle.get(group.group)
    if (groupRow === undefined) {
      groupRow = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: group.group, icon: group.groupIcon, type: 'group' })
      console.log(`nocobase-crm: menu group "${group.group}" created`)
    } else {
      console.log(`nocobase-crm: menu group "${group.group}" exists (kept)`)
    }
    for (const page of group.pages) {
      let pageRow = byTitle.get(page.title)
      if (pageRow === undefined) {
        pageRow = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: page.title, icon: page.icon, type: 'page', parentId: groupRow.id })
        console.log(`nocobase-crm: page "${page.title}" created`)
      } else {
        console.log(`nocobase-crm: page "${page.title}" exists (kept)`)
      }
      if (pageRow.schemaUid === null || pageRow.schemaUid === undefined) {
        const schema = await dataOf(token, 'POST', '/api/uiSchemas:create', { type: 'void', 'x-component': 'Page' })
        // The bare Page node renders no "add block" button: the Grid child
        // carrying x-initializer "page:addBlock" is what the block
        // initializer attaches to, so insert it right after the Page node.
        // The insert response echoes the stored tree with server-generated
        // x-uid values, which the tabs child below must reference.
        const inserted = await dataOf(token, 'POST', `/api/uiSchemas:insertAdjacent/${schema['x-uid']}?position=afterBegin`, {
          schema: { type: 'void', 'x-component': 'Grid', 'x-initializer': 'page:addBlock' },
        }) as Record<string, unknown>
        await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${pageRow.id}`, { schemaUid: schema['x-uid'] })
        // NocoBase 2.x v1 pages render their content through a `tabs` child
        // route wired at the page Grid; a page without it shows only the
        // header (N14). tabSchemaName carries the Grid node's stored name.
        const gridUid = inserted?.['x-uid'] as string | undefined
        const gridName = inserted?.name as string | undefined
        if (typeof gridUid === 'string') {
          await call(token, 'POST', '/api/desktopRoutes:create', {
            title: '', type: 'tabs', parentId: pageRow.id, schemaUid: gridUid, tabSchemaName: gridName ?? gridUid,
          })
        }
        console.log(`nocobase-crm: page "${page.title}" wired to schema ${schema['x-uid']} (${baseUrl}/admin/${schema['x-uid']})`)
      } else {
        console.log(`nocobase-crm: page "${page.title}" at ${baseUrl}/admin/${pageRow.schemaUid}`)
      }
    }
  }
}

/**
 * Block layouts inserted per page. Table columns reuse the wire shape of
 * the hand-built experts table (TableBlockProvider → ActionBar + TableV2
 * with Column nodes); the leads kanban reuses the shape from the official
 * plugin-kanban e2e template (KanbanBlockProvider with groupField/sortField
 * and a Kanban.Card grid). Dashboards stay hand-configured in the browser
 * (echarts chart config is interactive-only).
 */
type BlockSpec = { kind: 'table'; columns: string[] } | { kind: 'kanban'; groupField: string; cardFields: string[] }

// Dashboards carry a table block as the data base so the "add block"
// button stays reachable; the echarts chart blocks are hand-added in the
// browser next to it (chart config is interactive-only).
const BLOCKS: ReadonlyArray<{ page: string; collection: string; spec: BlockSpec }> = [
  { page: '销售线索', collection: 'crm_leads', spec: { kind: 'kanban', groupField: 'stage', cardFields: ['name', 'company', 'owner'] } },
  { page: '客户', collection: 'crm_customers', spec: { kind: 'table', columns: ['name', 'industry', 'level', 'status'] } },
  { page: '联系人', collection: 'crm_contacts', spec: { kind: 'table', columns: ['full_name', 'customer', 'job_title', 'phone', 'email'] } },
  { page: '产品与服务', collection: 'crm_products', spec: { kind: 'table', columns: ['name', 'category', 'pricing_mode', 'base_price', 'unit'] } },
  { page: '订单', collection: 'crm_deals', spec: { kind: 'table', columns: ['name', 'customer', 'deadline', 'amount', 'status', 'owner'] } },
  { page: '报价单', collection: 'crm_quotes', spec: { kind: 'table', columns: ['quote_no', 'valid_until', 'customer', 'deal', 'total_amount', 'status'] } },
  { page: '回款', collection: 'crm_payments', spec: { kind: 'table', columns: ['customer', 'deal', 'amount', 'method', 'paid_at', 'status'] } },
  { page: '发票', collection: 'crm_invoices', spec: { kind: 'table', columns: ['invoice_no', 'customer', 'deal', 'amount', 'issued_at', 'status'] } },
  // 'type' collides with the JSON-Schema keyword when used as a column node
  // name, so pick different columns for the customers dashboard table.
  { page: '客户仪表盘', collection: 'crm_customers', spec: { kind: 'table', columns: ['name', 'industry', 'level', 'status'] } },
  { page: '销售仪表盘', collection: 'crm_payments', spec: { kind: 'table', columns: ['customer', 'deal', 'amount', 'method', 'paid_at', 'status'] } },
]

/**
 * Random node key in the NocoBase uid style (11 lowercase base36 chars).
 *
 * Wire keys double as uiSchemas `name` values. Container nodes (Grid.Col,
 * TableV2, ActionBar, ...) must use random keys: node identity is the x-uid
 * server-side, but repeated literal keys like `col`/`table` across pages
 * historically grafted later inserts onto unrelated trees and left earlier
 * pages with a broken Grid.Row -> CardItem chain that renders blank.
 *
 * CollectionField child nodes are the exception: TableV2 derives each
 * column's dataIndex from the CollectionField schema `name` (the properties
 * key), and the cell value is read as record[name], so those keys MUST be
 * the field name — a random key renders the column with empty cells.
 */
const nodeKey = (): string => Math.random().toString(36).slice(2, 13)

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

function tableBlock(collection: string, columns: string[]): Record<string, unknown> {
  return {
    _isJSONSchemaObject: true, version: '2.0', type: 'void',
    'x-decorator': 'TableBlockProvider',
    'x-acl-action': `${collection}:list`,
    'x-use-decorator-props': 'useTableBlockDecoratorProps',
    'x-decorator-props': { collection, dataSource: 'main', action: 'list', params: { pageSize: 20 }, showIndex: true, dragSort: false },
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
    'x-decorator-props': {
      collection, dataSource: 'main', action: 'list', groupField, sortField: 'sort',
      params: { paginate: false, sort: ['sort'] },
    },
    'x-toolbar': 'BlockSchemaToolbar', 'x-settings': 'blockSettings:kanban',
    'x-component': 'CardItem',
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

/** Depth-first search for a component name anywhere in a schema tree. */
function schemaHasComponent(node: unknown, component: string): boolean {
  if (node === null || typeof node !== 'object') return false
  const record = node as Record<string, unknown>
  if (record['x-component'] === component) return true
  for (const child of Object.values(record.properties ?? {})) {
    if (schemaHasComponent(child, component)) return true
  }
  return false
}

/** Insert each page's first block under its Grid; idempotent by CardItem presence. */
async function ensureBlocks(token: string): Promise<void> {
  // The kanban's drag order needs a sort field scoped to the group column;
  // plain string columns cannot store per-card positions.
  for (const block of BLOCKS) {
    if (block.spec.kind !== 'kanban') continue
    const fields = await dataOf(token, 'GET', `/api/fields:${'list'}?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: block.collection } }))}&pageSize=200`) as { name?: string }[] | null
    if ((fields ?? []).some(field => field.name === 'sort')) continue
    await dataOf(token, 'POST', `/api/collections/${block.collection}/fields:create`, { name: 'sort', type: 'sort', interface: 'sort', scopeKey: block.spec.groupField })
    console.log(`nocobase-crm: sort field added to ${block.collection} (kanban drag order)`)
  }
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=300') as Array<{ id: number, title: string | null, schemaUid: string | null }> | null
  const routeByTitle = new Map((routes ?? []).map(row => [row.title ?? '', row]))
  for (const block of BLOCKS) {
    const route = routeByTitle.get(block.page)
    // N17: a flowPage of the same title owns the page now (v2 table with the
    // AI floating ball); the v1 block replay must not touch it.
    if ((route as { type?: string } | undefined)?.type === 'flowPage') {
      console.log(`nocobase-crm: block on "${block.page}" owned by an N17 v2 flowPage (kept)`)
      continue
    }
    if (route === undefined || route.schemaUid === null || route.schemaUid === undefined) {
      throw new Error(`page "${block.page}" has no schemaUid; run the menu step first`)
    }
    const pageTree = await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${route.schemaUid}`)
    if (schemaHasComponent(pageTree, 'CardItem')) {
      console.log(`nocobase-crm: block on "${block.page}" exists (kept)`)
      continue
    }
    const gridUid = Object.values((pageTree?.properties ?? {})).find(child => (child as Record<string, unknown>)['x-component'] === 'Grid') as Record<string, unknown> | undefined
    if (gridUid === undefined) throw new Error(`page "${block.page}" schema has no Grid child`)
    const inner = block.spec.kind === 'table'
      ? tableBlock(block.collection, block.spec.columns)
      : kanbanBlock(block.collection, block.spec.groupField, block.spec.cardFields)
    await call(token, 'POST', `/api/uiSchemas:insertAdjacent/${gridUid['x-uid']}?position=afterBegin`, {
      schema: {
        type: 'void', 'x-component': 'Grid.Row',
        properties: { [nodeKey()]: { type: 'void', 'x-component': 'Grid.Col', properties: { [nodeKey()]: inner } } },
      },
    })
    console.log(`nocobase-crm: ${block.spec.kind} block inserted on "${block.page}"`)
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
  console.log(`nocobase-crm: m2o fieldNames backfill ${patched > 0 ? `${patched} field(s) patched` : 'all present (kept)'}`)
}

/**
 * demo-portal-crm reads a slightly different field set than the admin-facing
 * names (it queries crm_leads.status, crm_customers.company_name,
 * crm_deals.stage/expected_close_date/closed_date, and
 * crm_follow_ups.status/due_date). Add those columns and backfill them from
 * the existing rows so the portal dashboard aggregates resolve; idempotent
 * by field presence and by already-equal target values.
 *
 * The c8eaf64e76 portal rebuild (N24, 2026-09-10) also pinned each list
 * page's default sorter and column set onto fields the seeded collections
 * never had — crm_contacts.name, crm_activities.date (plus the appended
 * contact association), crm_leads.score/source, and crm_quotes
 * issue_date/root_quote_id/version/is_current/total — so every portal list
 * request compiled into ORDER BY over a missing column and failed 400.
 * Same repair shape: add the column, backfill from the semantic twin or a
 * deterministic distribution, and the sort request returns 200.
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
  const added: string[] = []
  if (await addField('crm_leads', { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态(portal)', enum: LEAD_STAGES } })) added.push('crm_leads.status')
  if (await addField('crm_customers', { name: 'company_name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '公司名(portal)' } })) added.push('crm_customers.company_name')
  const DEAL_STAGES = options([['inquiry', '询价', 'default'], ['quote', '报价', 'blue'], ['negotiation', '谈判', 'orange'], ['won', '赢单', 'green'], ['lost', '丢失', 'red']])
  if (await addField('crm_deals', { name: 'stage', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '阶段(portal)', enum: DEAL_STAGES } })) added.push('crm_deals.stage')
  if (await addField('crm_deals', { name: 'expected_close_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '预计成交(portal)' } })) added.push('crm_deals.expected_close_date')
  if (await addField('crm_deals', { name: 'closed_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '成交日期(portal)' } })) added.push('crm_deals.closed_date')
  if (await addField('crm_follow_ups', { name: 'status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '状态(portal)', enum: options([['pending', '待办', 'orange'], ['done', '已完成', 'green']]) } })) added.push('crm_follow_ups.status')
  if (await addField('crm_follow_ups', { name: 'due_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '到期(portal)' } })) added.push('crm_follow_ups.due_date')
  // Portal list-page sorters and columns the N24 rebuild pinned (C3-A).
  if (await addField('crm_contacts', { name: 'name', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '姓名(portal)' } })) added.push('crm_contacts.name')
  if (await addField('crm_activities', { name: 'date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '日期(portal)' } })) added.push('crm_activities.date')
  if (await addField('crm_activities', { name: 'contact', type: 'belongsTo', interface: 'm2o', target: 'crm_contacts', foreignKey: 'contact_id', uiSchema: { type: 'object', 'x-component': 'AssociationField', title: '联系人(portal)', 'x-component-props': { multiple: false, fieldNames: { label: 'name', value: 'id' } } } })) added.push('crm_activities.contact')
  if (await addField('crm_leads', { name: 'score', type: 'integer', interface: 'integer', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '评分(portal)' } })) added.push('crm_leads.score')
  if (await addField('crm_leads', { name: 'source', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '来源(portal)', enum: LEAD_SOURCE_OPTIONS } })) added.push('crm_leads.source')
  if (await addField('crm_quotes', { name: 'issue_date', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '开立日期(portal)' } })) added.push('crm_quotes.issue_date')
  if (await addField('crm_quotes', { name: 'root_quote_id', type: 'integer', interface: 'integer', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '根报价ID(portal)' } })) added.push('crm_quotes.root_quote_id')
  if (await addField('crm_quotes', { name: 'version', type: 'integer', interface: 'integer', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '版本(portal)' } })) added.push('crm_quotes.version')
  if (await addField('crm_quotes', { name: 'is_current', type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title: '当前版本(portal)' } })) added.push('crm_quotes.is_current')
  if (await addField('crm_quotes', { name: 'total', type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '总金额(portal)' } })) added.push('crm_quotes.total')
  const dealStage = ['inquiry', 'quote', 'negotiation'] as const
  const leadScores = [45, 62, 78, 88, 55, 95, 70, 40, 82, 58] as const
  const leadSources = ['website', 'referral', 'event', 'outbound', 'partner'] as const
  const backfill: Array<{ collection: string; assign: (row: any, index: number) => Array<[string, unknown]> }> = [
    { collection: 'crm_leads', assign: row => [['status', row.stage]] },
    { collection: 'crm_customers', assign: row => [['company_name', row.name]] },
    {
      collection: 'crm_deals', assign: (row, index) => [
        ['stage', row.status === 'fulfilled' ? 'won' : row.status === 'cancelled' ? 'lost' : dealStage[index % dealStage.length]],
        ['expected_close_date', row.deadline ?? null],
        ['closed_date', row.status === 'fulfilled' ? row.deadline : null],
      ],
    },
    { collection: 'crm_follow_ups', assign: row => [['status', row.next_at && String(row.next_at) <= '2026-09-10' ? 'done' : 'pending'], ['due_date', row.next_at ?? null]] },
    // C3-A portal sorters: name mirrors full_name, date mirrors due_at, the
    // contact association picks the customer's first contact, scores and
    // sources get a deterministic spread so sorting and grade filters bite.
    { collection: 'crm_contacts', assign: row => [['name', row.full_name ?? null]] },
    {
      collection: 'crm_activities', assign: (row, index) => {
        // The bare foreign key keeps the idempotence check scalar; row.contact
        // arrives null without an append, so comparing the association object
        // would re-update every row on every run.
        const patch: Array<[string, unknown]> = [['date', row.due_at ?? null]]
        const contacts = contactsByCustomer.get(row.customer_id ?? null) ?? []
        if (contacts.length > 0) patch.push(['contact_id', contacts[index % contacts.length]])
        return patch
      },
    },
    {
      collection: 'crm_leads', assign: (_row, index) => [
        ['score', leadScores[index % leadScores.length]],
        ['source', leadSources[index % leadSources.length]],
      ],
    },
    {
      collection: 'crm_quotes', assign: row => [
        ['issue_date', String(row.valid_until ?? '2026-08-01').slice(0, 10)],
        ['root_quote_id', row.id],
        ['version', 1],
        ['is_current', true],
        ['total', row.total_amount ?? 0],
      ],
    },
  ]
  // crm_contacts rows grouped by customer for the activities contact backfill.
  const contactsByCustomer = new Map<number | null, number[]>()
  for (const row of await dataOf(token, 'GET', '/api/crm_contacts:list?pageSize=500') as any[] ?? []) {
    const bucket = contactsByCustomer.get(row.customer_id ?? null) ?? []
    bucket.push(row.id)
    contactsByCustomer.set(row.customer_id ?? null, bucket)
  }
  for (const spec of backfill) {
    const rows = await dataOf(token, 'GET', `/api/${spec.collection}:list?pageSize=500`) as any[] | null
    let updated = 0
    for (const [index, row] of (rows ?? []).entries()) {
      const patchEntries = spec.assign(row, index).filter(([key, value]) => row[key] !== value)
      if (patchEntries.length === 0) continue
      await dataOf(token, 'POST', `/api/${spec.collection}:update?filterByTk=${row.id}`, Object.fromEntries(patchEntries))
      updated += 1
    }
    console.log(`nocobase-crm: portal backfill ${spec.collection} (${updated} rows)`)
  }
  console.log(`nocobase-crm: portal alignment fields ${added.length > 0 ? added.join(', ') : 'all present (kept)'}`)
}

async function main(): Promise<void> {
  const token = await signIn()
  await ensureCollections(token)
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await seed(token, fixtures)
  await ensureMenus(token)
  await ensureBlocks(token)
  await ensureAssociationFieldNames(token)
  await ensurePortalFields(token)
  console.log('nocobase-crm: done — only the two dashboards need hand-configured charts in the browser')
}

await main()
