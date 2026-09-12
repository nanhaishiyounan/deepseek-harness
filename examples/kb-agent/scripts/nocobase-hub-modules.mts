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
// Users associations render nickname (users has no name column).
const belongsToUser = (name: string, title: string, foreignKey: string): object => ({
  name, type: 'belongsTo', interface: 'm2o', target: 'users', foreignKey,
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: 'nickname', value: 'id' } } },
})
const hasMany = (name: string, title: string, target: string, foreignKey: string): object => ({
  name, type: 'hasMany', interface: 'o2m', target, foreignKey,
  uiSchema: { type: 'array', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: true, fieldNames: { label: 'name', value: 'id' } } },
})
// Tables created through collections:create in this snapshot only gain id +
// declared fields, so every portal-sorted table declares createdAt itself.
const createdAt = (title: string): object => ({ name: 'createdAt', type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })

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

/**
 * The sixteen admin-facing hub collections, resource names aligned with
 * demo-portal-hub. D1: assignee/owner are declared as the belongsTo
 * associations the portal filters and appends (foreign keys take the
 * portal's derived contract names, e.g. hub_pj_task_assignee_id);
 * existing installs migrate to this shape (migrateTextFieldToAssociation).
 */
const HUB_CORE_COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  {
    name: 'hub_pj_projects', title: '项目', fields: [
      input('name', '项目名称'), input('no', '项目编号'), input('customer', '客户'),
      belongsToUser('owner', '负责人', 'hub_pj_project_owner_id'),
      select('status', '状态', PROJECT_STATUS), integer('progress', '进度 %'), select('priority', '优先级', PRIORITY), date('planned_end_date', '计划完成'),
      date('start_date', '开始日期'), date('due_date', '到期日'),
    ],
  },
  {
    name: 'hub_pj_tasks', title: '任务', fields: [
      input('title', '任务标题'), belongsTo('project', '所属项目', 'hub_pj_projects', 'project_id'),
      belongsToUser('assignee', '负责人', 'hub_pj_task_assignee_id'),
      select('status', '状态', TASK_STATUS), select('priority', '优先级', PRIORITY),
      date('due_at', '截止日期'), date('plan_start', '计划开始'), date('plan_end', '计划结束'),
      integer('hub_pj_task_project_id', '项目ID(portal)'),
    ],
  },
  {
    name: 'hub_pj_milestones', title: '里程碑', fields: [
      input('name', '里程碑'), belongsTo('project', '所属项目', 'hub_pj_projects', 'project_id'), date('due_at', '到期日'),
      select('status', '状态', options([['pending', '待达成', 'blue'], ['reached', '已达成', 'green']])),
      checkbox('done', '已达成'), date('due_date', '到期日(portal)'), integer('hub_pj_ms_project_id', '项目ID(portal)'),
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
    name: 'hub_kb_categories', title: '知识分类', fields: [
      input('name', '分类'), textarea('description', '描述'),
      belongsTo('parent', '上级分类', 'hub_kb_categories', 'parent_id'),
      hasMany('children', '子分类', 'hub_kb_categories', 'parent_id'),
    ],
  },
  {
    name: 'hub_kb_articles', title: '知识文章', fields: [
      input('title', '标题'),
      belongsTo('category', '分类', 'hub_kb_categories', 'category_id'),
      belongsToUser('author', '作者', 'author_id'),
      select('status', '状态', options([['draft', '草稿', 'default'], ['published', '已发布', 'green']])),
      date('updatedAt', '更新日'), integer('views', '浏览量'),
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
      belongsTo('asset', '资产', 'hub_as_assets', 'asset_id'),
      belongsToUser('assignee', '领用人', 'assignee_id'),
      date('assigned_at', '领用日期'), date('returned_at', '归还日期'), textarea('note', '备注'),
      date('assigned_date', '领用日(portal)'), date('returned_date', '归还日(portal)'),
    ],
  },
  {
    name: 'hub_as_maintenance', title: '维保记录', fields: [
      belongsTo('asset', '资产', 'hub_as_assets', 'asset_id'),
      select('type', '类型', options([['repair', '维修', 'red'], ['inspection', '巡检', 'blue'], ['calibration', '校准', 'cyan']])),
      date('scheduled_at', '计划日期'), belongsTo('vendor', '服务商', 'hub_as_vendors', 'vendor_id'), number('cost', '费用'),
      select('status', '状态', options([['pending', '待执行', 'orange'], ['done', '已完成', 'green']])),
      date('scheduled_date', '计划日(portal)'), date('completed_date', '完成日(portal)'),
      input('title', '标题(portal)'), textarea('notes', '备注(portal)'), integer('assetId', '资产ID(portal)'),
    ],
  },
  {
    name: 'hub_hr_departments', title: '部门', fields: [
      input('name', '部门'), input('code', '编码'), input('manager', '负责人'), integer('headcount', '编制人数'),
      date('updatedAt', '更新日(portal)'),
      belongsTo('parent', '上级部门', 'hub_hr_departments', 'parentId'),
      hasMany('children', '子部门', 'hub_hr_departments', 'parentId'),
    ],
  },
  {
    name: 'hub_hr_employees', title: '员工', fields: [
      input('name', '姓名'), input('employee_no', '工号'), belongsTo('department', '部门', 'hub_hr_departments', 'department_id'),
      input('title', '职务'), input('phone', '电话'),
      select('status', '状态', options([['active', '在职', 'green'], ['on_leave', '休假', 'orange'], ['resigned', '离职', 'default']])),
      date('hire_date', '入职日(portal)'), input('email', '邮箱(portal)'), input('job_title', '职务(portal)'), date('updatedAt', '更新日(portal)'),
      belongsTo('manager', '上级', 'hub_hr_employees', 'manager_id'),
    ],
  },
  {
    name: 'hub_hr_leave_requests', title: '请假申请', fields: [
      belongsTo('employee', '员工', 'hub_hr_employees', 'employee_id'),
      select('type', '类型', options([['annual', '年假', 'blue'], ['sick', '病假', 'red'], ['personal', '事假', 'orange']])),
      date('start_at', '开始'), date('end_at', '结束'), number('days', '天数'),
      select('status', '状态', options([['pending', '待审批', 'orange'], ['approved', '已批准', 'green'], ['rejected', '已驳回', 'red']])),
      input('reason', '事由'),
      date('approved_at', '批准日(portal)'),
      belongsToUser('approver', '审批人', 'approver_id'),
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

/**
 * The four portal domains the seed never covered (C3-B): inventory, sales,
 * helpdesk, and finance. Field names, enums, appended associations, and
 * createdAt sort columns mirror demo-portal-hub's list pages
 * (src/pages/{inventory,sales,helpdesk,finance}) so every page's list,
 * sort, and filter request compiles against a real column.
 */
const INVENTORY_MOVE_TYPES = options([['in', '入库', 'green'], ['out', '出库', 'orange'], ['adjust', '调整', 'default']])
const PRODUCT_STATUSES = options([['active', '在售', 'green'], ['discontinued', '停售', 'default']])
const SALES_DEAL_STAGES = options([['inquiry', '询价', 'default'], ['quote', '报价', 'blue'], ['negotiation', '谈判', 'orange'], ['won', '赢单', 'green'], ['lost', '丢失', 'red']])
const SALES_LEAD_STATUSES = options([['new', '新线索', 'default'], ['qualified', '已验证', 'blue'], ['converted', '已转化', 'green']])
const SALES_LEAD_SOURCES = options([['website', 'Website', 'blue'], ['referral', 'Referral', 'green'], ['event', 'Event', 'cyan'], ['outbound', 'Outbound', 'orange'], ['partner', 'Partner', 'purple']])
const SALES_ACTIVITY_TYPES = options([['call', '电话', 'blue'], ['email', '邮件', 'cyan'], ['meeting', '会议', 'green']])
const HD_TICKET_STATUSES = options([['open', 'Open', 'blue'], ['pending', 'Pending', 'orange'], ['resolved', 'Resolved', 'green'], ['closed', 'Closed', 'default']])
const HD_TICKET_PRIORITIES = options([['low', 'Low', 'default'], ['med', 'Medium', 'blue'], ['high', 'High', 'orange'], ['urgent', 'Urgent', 'red']])
const HD_TICKET_CATEGORIES = options([['billing', 'Billing', 'blue'], ['technical', 'Technical', 'cyan'], ['account', 'Account', 'purple'], ['other', 'Other', 'default']])
const FIN_INVOICE_STATUSES = options([['draft', 'Draft', 'default'], ['sent', 'Sent', 'blue'], ['paid', 'Paid', 'green'], ['overdue', 'Overdue', 'red']])
const FIN_EXPENSE_CATEGORIES = options([['travel', 'Travel', 'blue'], ['meals', 'Meals', 'cyan'], ['software', 'Software', 'green'], ['equipment', 'Equipment', 'purple'], ['other', 'Other', 'default']])
const FIN_EXPENSE_STATUSES = options([['pending', 'Pending', 'orange'], ['approved', 'Approved', 'green'], ['rejected', 'Rejected', 'red'], ['reimbursed', 'Reimbursed', 'blue']])

const PORTAL_DOMAIN_COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  {
    name: 'hub_inv_warehouses', title: '仓库', fields: [
      input('name', '名称'), input('code', '编码'), input('location', '位置'), createdAt('建仓日'),
    ],
  },
  {
    name: 'hub_inv_products', title: '库存产品', fields: [
      input('sku', 'SKU'), input('name', '名称'), input('category', '分类'), number('unit_price', '单价'),
      integer('reorder_level', '补货点'), select('status', '状态', PRODUCT_STATUSES), createdAt('建档日'),
    ],
  },
  {
    name: 'hub_inv_stock_moves', title: '库存流水', fields: [
      select('type', '类型', INVENTORY_MOVE_TYPES), integer('qty', '数量'), date('moved_at', '移动日'), textarea('note', '备注'),
      belongsTo('product', '产品', 'hub_inv_products', 'product_id'), belongsTo('warehouse', '仓库', 'hub_inv_warehouses', 'warehouse_id'),
    ],
  },
  {
    name: 'hub_sales_accounts', title: '销售客户', fields: [
      input('name', '名称'), input('industry', '行业'), input('website', '网站'),
      belongsToUser('owner', '负责人', 'owner_id'), createdAt('建档日'),
    ],
  },
  {
    name: 'hub_sales_contacts', title: '销售联系人', fields: [
      input('name', '姓名'), input('title', '职务'), input('email', '邮箱'), input('phone', '电话'),
      belongsTo('account', '客户', 'hub_sales_accounts', 'account_id'), createdAt('建档日'),
    ],
  },
  {
    name: 'hub_sales_leads', title: '销售线索', fields: [
      input('name', '名称'), input('company', '公司'), input('email', '邮箱'),
      select('source', '来源', SALES_LEAD_SOURCES), select('status', '状态', SALES_LEAD_STATUSES),
      belongsToUser('owner', '负责人', 'owner_id'), createdAt('建档日'),
      date('converted_at', '转化日(portal)'), input('conversion_key', '转化键(portal)'),
      belongsTo('converted_account', '转化客户', 'hub_sales_accounts', 'converted_account_id'),
      belongsTo('converted_contact', '转化联系人', 'hub_sales_contacts', 'converted_contact_id'),
      belongsTo('converted_deal', '转化订单', 'hub_sales_deals', 'converted_deal_id'),
    ],
  },
  {
    name: 'hub_sales_deals', title: '销售订单', fields: [
      input('title', '名称'), select('stage', '阶段', SALES_DEAL_STAGES), number('amount', '金额'),
      date('expected_close_date', '预计成交'),
      belongsTo('account', '客户', 'hub_sales_accounts', 'account_id'), belongsToUser('owner', '负责人', 'owner_id'), createdAt('建档日'),
    ],
  },
  {
    name: 'hub_sales_activities', title: '销售活动', fields: [
      select('type', '类型', SALES_ACTIVITY_TYPES), input('subject', '主题'), textarea('notes', '备注'), date('date', '日期'),
      belongsTo('deal', '订单', 'hub_sales_deals', 'deal_id'), createdAt('建档日'),
    ],
  },
  {
    name: 'hub_hd_tickets', title: '帮助台工单', fields: [
      input('subject', '主题'), textarea('description', '描述'),
      select('category', '分类', HD_TICKET_CATEGORIES), select('priority', '优先级', HD_TICKET_PRIORITIES), select('status', '状态', HD_TICKET_STATUSES),
      belongsToUser('requester', '请求人', 'requesterId'), belongsToUser('assignee', '经办人', 'assigneeId'),
      hasMany('replies', '回复', 'hub_hd_replies', 'ticketId'), createdAt('创建日'),
      date('updatedAt', '更新日(portal)'),
    ],
  },
  {
    name: 'hub_hd_replies', title: '工单回复', fields: [
      textarea('body', '内容'),
      belongsTo('ticket', '工单', 'hub_hd_tickets', 'ticketId'), belongsToUser('author', '作者', 'authorId'),
    ],
  },
  {
    name: 'hub_hd_sla_policies', title: 'SLA 策略', fields: [
      input('name', '名称'), select('priority', '优先级', HD_TICKET_PRIORITIES),
      integer('response_mins', '响应分钟'), integer('resolve_mins', '解决分钟'), createdAt('创建日'),
    ],
  },
  {
    name: 'hub_hd_faqs', title: 'FAQ', fields: [
      input('question', '问题'), textarea('answer', '答案'), select('category', '分类', HD_TICKET_CATEGORIES),
    ],
  },
  {
    name: 'hub_fin_invoices', title: '发票', fields: [
      input('invoice_number', '发票号'), input('client_name', '客户'), number('amount', '金额'),
      date('issue_date', '开票日'), date('due_date', '到期日'), select('status', '状态', FIN_INVOICE_STATUSES), createdAt('创建日'),
    ],
  },
  {
    name: 'hub_fin_invoice_items', title: '发票明细', fields: [
      input('description', '描述'), integer('quantity', '数量'), number('unit_price', '单价'), number('amount', '金额'),
      belongsTo('invoice', '发票', 'hub_fin_invoices', 'invoice_id'),
    ],
  },
  {
    name: 'hub_fin_expenses', title: '费用报销', fields: [
      input('title', '标题'), select('category', '类别', FIN_EXPENSE_CATEGORIES), number('amount', '金额'),
      date('spent_at', '支出日'), select('status', '状态', FIN_EXPENSE_STATUSES),
      belongsToUser('employee', '员工', 'employee_id'), createdAt('创建日'),
    ],
  },
  {
    name: 'hub_fin_budgets', title: '预算', fields: [
      input('category', '类别'), input('period', '期间'), number('amount', '金额'),
    ],
  },
]
const PO_STATUSES = options([['draft', '草稿', 'default'], ['sent', '已发出', 'blue'], ['received', '已到货', 'green'], ['cancelled', '已取消', 'red']])

/**
 * D1: collections whole tables the portal reads but the seed never created
 * (checklist / kb categories / article feedback / procurement), field and
 * foreign-key names per the replicate-prompt contract.
 */
const D1_PORTAL_COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  {
    name: 'hub_pj_checklist', title: '任务清单', fields: [
      input('title', '事项'), checkbox('done', '已完成'),
      belongsTo('task', '任务', 'hub_pj_tasks', 'hub_pj_checklist_task_id'),
    ],
  },
  {
    name: 'hub_kb_article_feedback', title: '文章反馈', fields: [
      select('rating', '评价', options([['helpful', '有帮助', 'green'], ['not_helpful', '没帮助', 'orange']])),
      textarea('comment', '意见'),
      belongsToUser('author', '反馈人', 'author_id'),
      belongsTo('article', '文章', 'hub_kb_articles', 'article_id'),
      createdAt('反馈日'),
    ],
  },
  {
    name: 'hub_po_suppliers', title: '采购供应商', fields: [
      input('name', '供应商'), input('email', '邮箱'), input('contact_name', '联系人'),
      integer('rating', '评分'), select('status', '状态', options([['active', '合作中', 'green'], ['inactive', '停用', 'default']])),
    ],
  },
  {
    name: 'hub_po_purchase_orders', title: '采购单', fields: [
      input('po_number', '采购单号'), select('status', '状态', PO_STATUSES), number('total', '总额'),
      date('order_date', '下单日'),
      belongsTo('supplier', '供应商', 'hub_po_suppliers', 'supplier_id'),
      belongsToUser('owner', '经办人', 'owner_id'),
      hasMany('items', '明细', 'hub_po_items', 'purchase_order_id'),
      createdAt('创建日'),
    ],
  },
  {
    name: 'hub_po_items', title: '采购明细', fields: [
      input('product_name', '品名'), integer('qty', '数量'), number('unit_price', '单价'),
      belongsTo('purchase_order', '采购单', 'hub_po_purchase_orders', 'purchase_order_id'),
    ],
  },
]
const COLLECTIONS: ReadonlyArray<{ name: string; title: string; fields: object[] }> = [
  ...HUB_CORE_COLLECTIONS, ...PORTAL_DOMAIN_COLLECTIONS, ...D1_PORTAL_COLLECTIONS,
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
  { fixtureKey: 'projects', collection: 'hub_pj_projects', uniqueKey: 'no', refs: { owner: 'users' } },
  { fixtureKey: 'tasks', collection: 'hub_pj_tasks', uniqueKey: 'title', refs: { project: 'hub_pj_projects', assignee: 'users' } },
  { fixtureKey: 'milestones', collection: 'hub_pj_milestones', uniqueKey: 'name', refs: { project: 'hub_pj_projects' } },
  { fixtureKey: 'tickets', collection: 'hub_tk_tickets', uniqueKey: 'title', refs: {} },
  { fixtureKey: 'articles', collection: 'hub_kb_articles', uniqueKey: 'title', refs: { author: 'users', category: 'hub_kb_categories' } },
  { fixtureKey: 'vendors', collection: 'hub_as_vendors', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'assets', collection: 'hub_as_assets', uniqueKey: 'no', refs: { vendor: 'hub_as_vendors' } },
  { fixtureKey: 'assignments', collection: 'hub_as_assignments', uniqueKey: 'note', refs: { asset: 'hub_as_assets', assignee: 'users' } },
  { fixtureKey: 'maintenance', collection: 'hub_as_maintenance', uniqueKey: 'scheduled_at', refs: { asset: 'hub_as_assets', vendor: 'hub_as_vendors' } },
  { fixtureKey: 'kb_categories', collection: 'hub_kb_categories', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'pj_checklist', collection: 'hub_pj_checklist', uniqueKey: 'title', refs: { task: 'hub_pj_tasks' } },
  { fixtureKey: 'article_feedback', collection: 'hub_kb_article_feedback', uniqueKey: 'comment', refs: { author: 'users', article: 'hub_kb_articles' } },
  { fixtureKey: 'po_suppliers', collection: 'hub_po_suppliers', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'po_purchase_orders', collection: 'hub_po_purchase_orders', uniqueKey: 'po_number', refs: { supplier: 'hub_po_suppliers', owner: 'users' } },
  { fixtureKey: 'po_items', collection: 'hub_po_items', uniqueKey: 'product_name', refs: { purchase_order: 'hub_po_purchase_orders' } },
  { fixtureKey: 'departments', collection: 'hub_hr_departments', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'employees', collection: 'hub_hr_employees', uniqueKey: 'employee_no', refs: { department: 'hub_hr_departments' } },
  { fixtureKey: 'leave_requests', collection: 'hub_hr_leave_requests', uniqueKey: 'reason', refs: { employee: 'hub_hr_employees' } },
  { fixtureKey: 'customer_categories', collection: 'hub_md_customer_categories', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'ticket_categories', collection: 'hub_md_ticket_categories', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'asset_categories', collection: 'hub_md_asset_categories', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'product_categories', collection: 'hub_md_product_categories', uniqueKey: 'code', refs: {} },
  // C3-B portal-domain seeds; user-facing refs resolve against users.nickname.
  { fixtureKey: 'inv_warehouses', collection: 'hub_inv_warehouses', uniqueKey: 'code', refs: {} },
  { fixtureKey: 'inv_products', collection: 'hub_inv_products', uniqueKey: 'sku', refs: {} },
  { fixtureKey: 'inv_stock_moves', collection: 'hub_inv_stock_moves', uniqueKey: 'note', refs: { product: 'hub_inv_products', warehouse: 'hub_inv_warehouses' } },
  { fixtureKey: 'sales_accounts', collection: 'hub_sales_accounts', uniqueKey: 'name', refs: { owner: 'users' } },
  { fixtureKey: 'sales_contacts', collection: 'hub_sales_contacts', uniqueKey: 'email', refs: { account: 'hub_sales_accounts' } },
  { fixtureKey: 'sales_leads', collection: 'hub_sales_leads', uniqueKey: 'name', refs: { owner: 'users' } },
  { fixtureKey: 'sales_deals', collection: 'hub_sales_deals', uniqueKey: 'title', refs: { account: 'hub_sales_accounts', owner: 'users' } },
  { fixtureKey: 'sales_activities', collection: 'hub_sales_activities', uniqueKey: 'subject', refs: { deal: 'hub_sales_deals' } },
  { fixtureKey: 'hd_tickets', collection: 'hub_hd_tickets', uniqueKey: 'subject', refs: { requester: 'users', assignee: 'users' } },
  { fixtureKey: 'hd_replies', collection: 'hub_hd_replies', uniqueKey: 'body', refs: { ticket: 'hub_hd_tickets', author: 'users' } },
  { fixtureKey: 'hd_sla_policies', collection: 'hub_hd_sla_policies', uniqueKey: 'name', refs: {} },
  { fixtureKey: 'hd_faqs', collection: 'hub_hd_faqs', uniqueKey: 'question', refs: {} },
  { fixtureKey: 'fin_invoices', collection: 'hub_fin_invoices', uniqueKey: 'invoice_number', refs: {} },
  { fixtureKey: 'fin_invoice_items', collection: 'hub_fin_invoice_items', uniqueKey: 'description', refs: { invoice: 'hub_fin_invoices' } },
  { fixtureKey: 'fin_expenses', collection: 'hub_fin_expenses', uniqueKey: 'title', refs: { employee: 'users' } },
  { fixtureKey: 'fin_budgets', collection: 'hub_fin_budgets', uniqueKey: 'category', refs: {} },
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

/**
 * D1: the four Chinese names the legacy text columns carried as plain
 * strings. They get password-less users rows so the migrated belongsTo
 * foreign keys can point somewhere (demo semantics: not sign-in accounts).
 */
const LEGACY_USERS: ReadonlyArray<{ nickname: string; username: string }> = [
  { nickname: '陈立群', username: 'chenliqun' },
  { nickname: '王一帆', username: 'wangyifan' },
  { nickname: '林静怡', username: 'linjingyi' },
  { nickname: '赵晓芳', username: 'zhaoxiaofang' },
]

/** nickname -> users.id for every LEGACY_USERS row, creating missing rows. */
async function ensureLegacyUsers(token: string): Promise<Map<string, number>> {
  const byNickname = new Map<string, number>()
  for (const person of LEGACY_USERS) {
    const found = await dataOf(token, 'GET', `/api/users:list?filter=${encodeURIComponent(JSON.stringify({ nickname: { $eq: person.nickname } }))}&pageSize=5`)
    const existing = (found ?? [])[0]?.id
    if (existing !== undefined) {
      byNickname.set(person.nickname, existing)
      continue
    }
    const created = await dataOf(token, 'POST', '/api/users:create', { username: person.username, nickname: person.nickname })
    byNickname.set(person.nickname, created?.id)
    console.log(`nocobase-hub: legacy user ${person.nickname} ensured (id ${created?.id})`)
  }
  return byNickname
}

/** Current type of a collection field, or null when the field does not exist. */
async function fieldType(token: string, collection: string, name: string): Promise<string | null> {
  const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection }, name: { $eq: name } }))}&pageSize=5`)
  return (rows ?? [])[0]?.type ?? null
}

/**
 * Three-state idempotent migration of a legacy text field to a belongsTo
 * association under the same name (D1). The portal appends and filters these
 * fields as associations, while seeded tables carried them as plain inputs,
 * and NocoBase refuses two same-name fields — so the text column must be
 * destroyed before the association is created. A `*_text` backup column
 * preserves the original values first (kept as the rollback channel), which
 * makes every interruption point safe to re-run:
 * - type string   -> backup column + copy values + destroy + create association
 * - field missing -> previous run died between destroy and create: create only
 * - type belongsTo -> already migrated (kept)
 */
async function migrateTextFieldToAssociation(token: string, collection: string, name: string, title: string, association: Record<string, unknown>, backupName: string): Promise<void> {
  const type = await fieldType(token, collection, name)
  if (type === 'belongsTo') {
    console.log(`nocobase-hub: ${collection}.${name} already belongsTo (kept)`)
    return
  }
  if (type === null) {
    await dataOf(token, 'POST', `/api/collections/${collection}/fields:create`, association)
    console.log(`nocobase-hub: ${collection}.${name} created as belongsTo (resumed or fresh)`)
    return
  }
  if (await fieldType(token, collection, backupName) === null) {
    await dataOf(token, 'POST', `/api/collections/${collection}/fields:create`, input(backupName, `${title}(原文本)`))
    const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500`)
    for (const row of rows ?? []) {
      if (row[name] === null || row[name] === undefined) continue
      await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${row.id}`, { [backupName]: row[name] })
    }
  }
  await dataOf(token, 'POST', `/api/collections/${collection}/fields:destroy?filterByTk=${name}`)
  await dataOf(token, 'POST', `/api/collections/${collection}/fields:create`, association)
  console.log(`nocobase-hub: ${collection}.${name} migrated text -> belongsTo (${backupName} retained)`)
}

/** Runs every D1 same-name field migration (idempotent per three-state check). */
async function migrateLegacyTextFields(token: string): Promise<Map<string, number>> {
  const usersByNickname = await ensureLegacyUsers(token)
  await migrateTextFieldToAssociation(token, 'hub_pj_tasks', 'assignee', '负责人',
    belongsToUser('assignee', '负责人', 'hub_pj_task_assignee_id'), 'assignee_text')
  await migrateTextFieldToAssociation(token, 'hub_pj_projects', 'owner', '负责人',
    belongsToUser('owner', '负责人', 'hub_pj_project_owner_id'), 'owner_text')
  await migrateTextFieldToAssociation(token, 'hub_as_assignments', 'assignee', '领用人',
    belongsToUser('assignee', '领用人', 'assignee_id'), 'assignee_text')
  await migrateTextFieldToAssociation(token, 'hub_kb_articles', 'category', '分类',
    belongsTo('category', '分类', 'hub_kb_categories', 'category_id'), 'category_text')
  return usersByNickname
}

async function keyMap(token: string, collection: string, key: string): Promise<Map<string, number>> {
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500`)
  return new Map((rows ?? []).map((row: any) => [String(row[key]), row.id]))
}

async function seed(token: string, fixtures: Record<string, Array<Record<string, unknown>>>): Promise<void> {
  const refCache = new Map<string, Map<string, number>>()
  const refKey = new Map([['hub_pj_projects', 'name'], ['hub_pj_tasks', 'title'], ['hub_as_assets', 'name'], ['hub_as_vendors', 'name'], ['hub_hr_departments', 'name'], ['hub_hr_employees', 'name'], ['hub_inv_products', 'name'], ['hub_inv_warehouses', 'name'], ['hub_sales_accounts', 'name'], ['hub_sales_deals', 'title'], ['hub_hd_tickets', 'subject'], ['hub_fin_invoices', 'invoice_number'], ['hub_kb_articles', 'title'], ['hub_kb_categories', 'name'], ['hub_po_suppliers', 'name'], ['hub_po_purchase_orders', 'po_number'], ['users', 'nickname']])
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
      } else if ((pageRow as { type?: string }).type === 'flowPage') {
        // N17 v2 upgrade: no uiSchemas tree to wire; the block replay must
        // skip this title (flowOwnedPages).
        flowOwnedPages.add(page.title)
        console.log(`nocobase-hub: page "${page.title}" owned by an N17 v2 flowPage (kept)`)
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
    // N17: pages upgraded to v2 flowPages (same title, no uiSchemas Grid)
    // are owned by nocobase-n17-alignment.mts; the v1 block replay skips them.
    if (flowOwnedPages.has(page.page)) {
      console.log(`nocobase-hub: blocks on "${page.page}" owned by an N17 v2 flowPage (kept)`)
      continue
    }
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
    const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection.name }, type: { $eq: 'belongsTo' } }))}&pageSize=100`) as Array<{ name?: string, target?: string, uiSchema?: { 'x-component-props'?: { fieldNames?: { label?: string } } } }> | null
    for (const row of rows ?? []) {
      if (row.name === undefined) continue
      // Users associations render nickname; every other target has a name column.
      const label = row.target === 'users' ? 'nickname' : 'name'
      if (row.uiSchema?.['x-component-props']?.fieldNames?.label === label) continue
      await dataOf(token, 'POST', `/api/collections/${collection.name}/fields:update?filterByTk=${row.name}`, {
        uiSchema: { 'x-component-props': { fieldNames: { label, value: 'id' } } },
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
 *
 * D1 widened this step to the full portal-contract alignment: every column,
 * association, and migrated foreign key the rebuilt portal pages filter,
 * sort, or append (plan 01-hub-schema-alignment B/C lists). Backfills read
 * the `*_text` backup columns left by migrateLegacyTextFields so an
 * interrupted migration still recovers its original values.
 */
async function ensurePortalFields(token: string, usersByNickname: Map<string, number>): Promise<void> {
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
  // D1-B columns on existing tables (all plain ALTER ADD COLUMN, lossless).
  if (await addField('hub_kb_articles', date('updatedAt', '更新日(portal)'))) added.push('hub_kb_articles.updatedAt')
  if (await addField('hub_kb_articles', integer('views', '浏览量(portal)'))) added.push('hub_kb_articles.views')
  if (await addField('hub_as_assignments', date('assigned_date', '领用日(portal)'))) added.push('hub_as_assignments.assigned_date')
  if (await addField('hub_as_assignments', date('returned_date', '归还日(portal)'))) added.push('hub_as_assignments.returned_date')
  if (await addField('hub_as_maintenance', date('scheduled_date', '计划日(portal)'))) added.push('hub_as_maintenance.scheduled_date')
  if (await addField('hub_as_maintenance', date('completed_date', '完成日(portal)'))) added.push('hub_as_maintenance.completed_date')
  if (await addField('hub_as_maintenance', input('title', '标题(portal)'))) added.push('hub_as_maintenance.title')
  if (await addField('hub_as_maintenance', textarea('notes', '备注(portal)'))) added.push('hub_as_maintenance.notes')
  if (await addField('hub_as_maintenance', integer('assetId', '资产ID(portal)'))) added.push('hub_as_maintenance.assetId')
  if (await addField('hub_hr_employees', date('hire_date', '入职日(portal)'))) added.push('hub_hr_employees.hire_date')
  if (await addField('hub_hr_employees', input('email', '邮箱(portal)'))) added.push('hub_hr_employees.email')
  if (await addField('hub_hr_employees', input('job_title', '职务(portal)'))) added.push('hub_hr_employees.job_title')
  if (await addField('hub_hr_employees', date('updatedAt', '更新日(portal)'))) added.push('hub_hr_employees.updatedAt')
  if (await addField('hub_hr_departments', date('updatedAt', '更新日(portal)'))) added.push('hub_hr_departments.updatedAt')
  if (await addField('hub_hr_leave_requests', date('approved_at', '批准日(portal)'))) added.push('hub_hr_leave_requests.approved_at')
  if (await addField('hub_sales_leads', date('converted_at', '转化日(portal)'))) added.push('hub_sales_leads.converted_at')
  if (await addField('hub_sales_leads', input('conversion_key', '转化键(portal)'))) added.push('hub_sales_leads.conversion_key')
  if (await addField('hub_hd_tickets', date('updatedAt', '更新日(portal)'))) added.push('hub_hd_tickets.updatedAt')
  if (await addField('hub_pj_projects', date('start_date', '开始日期(portal)'))) added.push('hub_pj_projects.start_date')
  if (await addField('hub_pj_projects', date('due_date', '到期日(portal)'))) added.push('hub_pj_projects.due_date')
  if (await addField('hub_pj_milestones', checkbox('done', '已达成(portal)'))) added.push('hub_pj_milestones.done')
  if (await addField('hub_pj_milestones', date('due_date', '到期日(portal)'))) added.push('hub_pj_milestones.due_date')
  if (await addField('hub_pj_milestones', integer('hub_pj_ms_project_id', '项目ID(portal)'))) added.push('hub_pj_milestones.hub_pj_ms_project_id')
  if (await addField('hub_pj_tasks', integer('hub_pj_task_project_id', '项目ID(portal)'))) added.push('hub_pj_tasks.hub_pj_task_project_id')
  // D1-C associations on existing tables (fresh installs already declare
  // them; this branch only lifts older seeded tables).
  if (await addField('hub_kb_articles', belongsToUser('author', '作者', 'author_id'))) added.push('hub_kb_articles.author')
  if (await addField('hub_kb_articles', belongsTo('category', '分类', 'hub_kb_categories', 'category_id'))) added.push('hub_kb_articles.category')
  if (await addField('hub_hr_leave_requests', belongsToUser('approver', '审批人', 'approver_id'))) added.push('hub_hr_leave_requests.approver')
  if (await addField('hub_hr_employees', belongsTo('manager', '上级', 'hub_hr_employees', 'manager_id'))) added.push('hub_hr_employees.manager')
  if (await addField('hub_hr_departments', belongsTo('parent', '上级部门', 'hub_hr_departments', 'parentId'))) added.push('hub_hr_departments.parent')
  if (await addField('hub_hr_departments', hasMany('children', '子部门', 'hub_hr_departments', 'parentId'))) added.push('hub_hr_departments.children')
  if (await addField('hub_sales_leads', belongsTo('converted_account', '转化客户', 'hub_sales_accounts', 'converted_account_id'))) added.push('hub_sales_leads.converted_account')
  if (await addField('hub_sales_leads', belongsTo('converted_contact', '转化联系人', 'hub_sales_contacts', 'converted_contact_id'))) added.push('hub_sales_leads.converted_contact')
  if (await addField('hub_sales_leads', belongsTo('converted_deal', '转化订单', 'hub_sales_deals', 'converted_deal_id'))) added.push('hub_sales_leads.converted_deal')

  // Legacy category enum keys -> hub_kb_categories row names.
  const categoryByName = await keyMap(token, 'hub_kb_categories', 'name')
  const categoryByKey = new Map([
    ['compliance', categoryByName.get('合规认证')], ['logistics', categoryByName.get('物流仓储')],
    ['payment', categoryByName.get('结算支付')], ['channel', categoryByName.get('渠道拓展')],
  ])
  const superAdmin = (await dataOf(token, 'GET', `/api/users:list?filter=${encodeURIComponent(JSON.stringify({ nickname: { $eq: 'Super Admin' } }))}&pageSize=5`) ?? [])[0]?.id
  const userId = (name: unknown): number | null => (name === null || name === undefined ? null : usersByNickname.get(String(name)) ?? null)
  const hireDates = ['2021-03-01', '2022-07-15', '2020-01-06', '2023-09-11', '2019-05-20', '2024-02-26'] as const
  const backfill: Array<{ collection: string; assign: (row: any, index: number) => Array<[string, unknown]> }> = [
    { collection: 'hub_pj_tasks', assign: row => [['due_date', row.due_at ?? null], ['hub_pj_task_project_id', row.project_id ?? null], ['hub_pj_task_assignee_id', userId(row.assignee_text)]] },
    { collection: 'hub_hr_leave_requests', assign: row => [['start_date', row.start_at ?? null], ['end_date', row.end_at ?? null], ['approved_at', row.status === 'approved' ? row.start_at ?? null : null], ['approver_id', row.status === 'approved' && superAdmin !== undefined ? superAdmin : null]] },
    {
      collection: 'hub_kb_articles', assign: (row, index) => [
        ['createdAt', '2026-09-01'],
        ['updatedAt', row.createdAt ?? '2026-09-01'],
        ['views', 10 + (index * 37) % 190],
        ['author_id', superAdmin ?? null],
        ['category_id', categoryByKey.get(String(row.category_text)) ?? null],
      ],
    },
    { collection: 'hub_pj_projects', assign: row => [['due_date', row.planned_end_date ?? null], ['hub_pj_project_owner_id', userId(row.owner_text)]] },
    { collection: 'hub_as_assignments', assign: row => [['assigned_date', row.assigned_at ?? null], ['returned_date', row.returned_at ?? null], ['assignee_id', userId(row.assignee_text)]] },
    { collection: 'hub_as_maintenance', assign: row => [['scheduled_date', row.scheduled_at ?? null], ['completed_date', row.status === 'done' ? row.scheduled_at ?? null : null], ['assetId', row.asset_id ?? null]] },
    { collection: 'hub_hr_employees', assign: (row, index) => [['job_title', row.title ?? null], ['hire_date', hireDates[index % hireDates.length]], ['updatedAt', '2026-07-01']] },
    { collection: 'hub_hr_departments', assign: () => [['updatedAt', '2026-07-01']] },
    { collection: 'hub_sales_leads', assign: row => [['converted_at', row.status === 'converted' ? row.createdAt ?? null : null], ['conversion_key', row.status === 'converted' ? `CONV-${row.id}` : null]] },
    { collection: 'hub_hd_tickets', assign: row => [['updatedAt', row.createdAt ?? null]] },
    { collection: 'hub_pj_milestones', assign: row => [['done', row.status === 'reached'], ['due_date', row.due_at ?? null], ['hub_pj_ms_project_id', row.project_id ?? null]] },
  ]
  for (const spec of backfill) {
    const rows = await dataOf(token, 'GET', `/api/${spec.collection}:list?pageSize=500`) as any[] | null
    let updated = 0
    for (const [index, row] of (rows ?? []).entries()) {
      const patchEntries = spec.assign(row, index).filter(([key, value]) => row[key] !== value)
      if (patchEntries.length === 0) continue
      await dataOf(token, 'POST', `/api/${spec.collection}:update?filterByTk=${row.id}`, Object.fromEntries(patchEntries))
      updated += 1
    }
    console.log(`nocobase-hub: portal backfill ${spec.collection} (${updated} rows)`)
  }
  console.log(`nocobase-hub: portal alignment fields ${added.length > 0 ? added.join(', ') : 'all present (kept)'}`)
}

/**
 * D1-F optional enum alignment: the portal filter dropdowns use a slightly
 * different vocabulary than the seeded select options (e.g. maintenance
 * Preventive/Corrective/Inspection vs repair/inspection/calibration). Append
 * the portal's values to each uiSchema.enum without touching existing
 * options or seeded row values — a filter then at least lists every value
 * the portal offers.
 */
const ENUM_ALIGNMENTS: ReadonlyArray<{ collection: string; field: string; values: ReadonlyArray<{ value: string; label: string }> }> = [
  { collection: 'hub_as_maintenance', field: 'type', values: [{ value: 'Preventive', label: 'Preventive' }, { value: 'Corrective', label: 'Corrective' }, { value: 'Inspection', label: 'Inspection' }] },
  { collection: 'hub_as_maintenance', field: 'status', values: [{ value: 'Scheduled', label: 'Scheduled' }, { value: 'In progress', label: 'In progress' }, { value: 'Done', label: 'Done' }] },
  { collection: 'hub_pj_tasks', field: 'priority', values: [{ value: 'med', label: 'Med' }] },
  { collection: 'hub_hr_employees', field: 'status', values: [{ value: 'onleave', label: 'On leave' }, { value: 'terminated', label: 'Terminated' }] },
  { collection: 'hub_sales_leads', field: 'status', values: [{ value: 'unqualified', label: 'Unqualified' }] },
  { collection: 'hub_sales_leads', field: 'source', values: [{ value: 'cold_call', label: 'Cold call' }] },
  { collection: 'hub_pj_projects', field: 'status', values: [{ value: 'active', label: 'Active' }, { value: 'done', label: 'Done' }, { value: 'on_hold', label: 'On hold' }] },
  { collection: 'hub_as_assets', field: 'status', values: [{ value: 'assigned', label: 'Assigned' }, { value: 'in_stock', label: 'In stock' }] },
]

async function alignPortalEnums(token: string): Promise<void> {
  let patched = 0
  for (const target of ENUM_ALIGNMENTS) {
    const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: target.collection }, name: { $eq: target.field } }))}&pageSize=5`) as Array<{ uiSchema?: { enum?: Array<{ value: string, label?: string, color?: string }> } }> | null
    const field = (rows ?? [])[0]
    const current = field?.uiSchema?.enum ?? []
    const missing = target.values.filter(option => !current.some(existing => existing.value === option.value))
    if (missing.length === 0) continue
    await dataOf(token, 'POST', `/api/collections/${target.collection}/fields:update?filterByTk=${target.field}`, {
      uiSchema: { enum: [...current, ...missing] },
    })
    patched += 1
  }
  console.log(`nocobase-hub: portal enum alignment ${patched > 0 ? `${patched} field(s) extended` : 'all present (kept)'}`)
}

/** Pages upgraded to N17 v2 flowPages; their titles are skipped by the v1 block replay. */
const flowOwnedPages = new Set<string>()

async function main(): Promise<void> {
  const token = await signIn()
  await ensureCollections(token)
  const usersByNickname = await migrateLegacyTextFields(token)
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))
  await seed(token, fixtures)
  const pageByUrl = await ensureMenus(token)
  await ensureBlocks(token, pageByUrl)
  await ensureAssociationFieldNames(token)
  await ensurePortalFields(token, usersByNickname)
  await alignPortalEnums(token)
  console.log('nocobase-hub: done')
}

await main()
