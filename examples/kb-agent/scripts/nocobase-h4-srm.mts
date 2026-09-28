/**
 * H4: five-system foundation + the SRM closed loop (plans/acceptance-fixes-
 * 2026-09-15-h/40-h4-foundation-srm.md). One script, five effects:
 *
 * 1. Foundation — hub_inv_products gains the five nullable food columns
 *    (shelf_life_days / temp_zone / storage_conditions / gb2760_category /
 *    allergens; the last two pre-embed the I-round PLM anchors) and 3-5 food
 *    SKUs seed with real shelf-life/temp semantics. Existing rows are
 *    backfilled ONLY where the column is still null (the seeded-value guard),
 *    so replays never overwrite operator edits.
 * 2. Six srm_* collections per the R9 report's MVP cut (suppliers with the
 *    three-tier grading split, certificates with the warn band, checklist
 *    templates, audit records, score cards, CAPA). The D-level CAPA and the
 *    admission approval ride workflows, so lifecycle transitions are
 *    observable state-machine moves, not silent column writes.
 * 3. Two workflows (idempotent by title, created AFTER seeds so first-run
 *    seed creates never queue approval tasks): "SRM供应商准入审批" (manual
 *    资质审核 → branch → manual 现场审核评级 → branch → update 合格/已拒绝)
 *    and "SRM低评分自动整改" (score card create → condition total<60 →
 *    create CAPA in 发起).
 * 4. Eight v2 flowPages under the「供应链」menu group, all through the proven
 *    E1/F1/F4 factory channels (uid prefix h4srm): six table pages, one CAPA
 *    kanban, one score-card radar page whose radar rides the chart authoring
 *    channel's visual.mode='custom' raw ECharts option (the basic visual
 *    types have no radar — verified against flow-engine chart-config).
 * 5. Seeds upsert by business key (supplier name / cert supplier+type+no /
 *    checklist template+group+item / audit supplier+date / score supplier+
 *    period / capa supplier+title), the crm/hub module convention.
 *
 * Rollback: --rollback destroys every h4srm* flowModels tree (plus the
 * orphaned n18ai- sweep), the eight flowPage routes and the 供应链 group, the
 * two workflows, and the six srm_* collections — back to the H3 end-state.
 * The hub_inv_products columns are additive and stay.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h4-srm.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h4-srm.mts --rollback
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h4-srm.mts --only 供应商档案
 */
import { call, dataOf, drawerPageTreeFor, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

// ─── field factories (crm/hub module wire shapes; name is explicit because
// collections:create mints random f_* columns for fields without one) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const checkbox = (name: string, title: string): object => ({ name, type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title } })
const multipleSelect = (name: string, title: string, enumOptions: object[]): object => ({
  name, type: 'array', interface: 'multipleSelect', defaultValue: [],
  uiSchema: { type: 'array', 'x-component': 'Select', title, 'x-component-props': { mode: 'multiple' }, enum: enumOptions },
})
const belongsToSupplier = (name: string, title: string, foreignKey: string): object => ({
  name, type: 'belongsTo', interface: 'm2o', target: 'srm_suppliers', foreignKey,
  // fieldNames names the target label column AssociationField renders;
  // without it every m2o table cell shows N/A (the N16 wire fact).
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: 'name', value: 'id' } } },
})

const opts = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))

// ─── shared option sets (SRM research §1.3 / §3.5) ───

const LIFECYCLE = opts([
  ['potential', '潜在', 'default'], ['reviewing', '准入评审中', 'blue'], ['qualified', '合格', 'green'],
  ['preferred', '优选', 'cyan'], ['restricted', '受限', 'orange'], ['frozen', '冻结', 'red'],
  ['rejected', '已拒绝', 'red'], ['eliminated', '淘汰', 'default'],
])
const SUPPLIER_CATEGORY = opts([
  ['raw', '原料', 'blue'], ['packaging', '包材', 'cyan'], ['service', '服务', 'purple'], ['aux', '辅料', 'green'],
])
const REG_RISK = opts([['A', 'A级(低)', 'green'], ['B', 'B级(中)', 'blue'], ['C', 'C级(较高)', 'orange'], ['D', 'D级(高)', 'red']])
const AUDIT_GRADE = opts([['A', 'A级', 'green'], ['B', 'B级', 'blue'], ['C', 'C级', 'orange'], ['D', 'D级', 'red'], ['E', 'E级', 'default']])
const IQC_LEVEL = opts([['relaxed', '放宽', 'green'], ['normal', '正常', 'blue'], ['tightened', '加严', 'orange'], ['suspended', '暂停', 'red']])
const CERT_TYPE = opts([
  ['bl', '营业执照', 'default'], ['sc', '食品生产许可SC', 'blue'], ['jy', '食品经营许可', 'cyan'],
  ['iso22000', 'ISO22000', 'green'], ['haccp', 'HACCP', 'purple'], ['other', '其他', 'default'],
])
const WARN_STATUS = opts([
  ['ok', '正常', 'green'], ['w90', '90天预警', 'blue'], ['w60', '60天预警', 'cyan'],
  ['w30', '30天预警', 'orange'], ['expired', '已过期', 'red'],
])
const CAPA_STATUS = opts([
  ['initiated', '发起', 'orange'], ['replied', '供应商回复', 'blue'], ['verifying', '验证', 'purple'], ['closed', '关闭', 'green'],
])
const CAPA_SOURCE = opts([['audit', '现场审核', 'blue'], ['iqc', '质检不合格', 'red'], ['complaint', '投诉', 'orange'], ['performance', '绩效考核', 'purple']])
const RATING = opts([['A', 'A级', 'green'], ['B', 'B级', 'blue'], ['C', 'C级', 'orange'], ['D', 'D级', 'red']])
const RATING_CHANGE = opts([['up', '上升', 'green'], ['flat', '持平', 'blue'], ['down', '下降', 'red']])
const PERIODS = opts([
  ['2025Q3', '2025Q3', 'default'], ['2025Q4', '2025Q4', 'default'], ['2026Q1', '2026Q1', 'default'], ['2026Q2', '2026Q2', 'default'],
  // B8: the live quarter the scorecard materializer writes (nocobase-w8 chain).
  ['2026Q3', '2026Q3', 'default'],
])
const TEMP_ZONE = opts([['ambient', '常温', 'default'], ['chilled', '冷藏', 'blue'], ['frozen', '冷冻', 'cyan']])
const ALLERGENS = opts([
  ['milk', '乳', 'blue'], ['egg', '蛋', 'cyan'], ['peanut', '花生', 'orange'], ['tree_nut', '坚果', 'purple'],
  ['wheat', '麸质谷物', 'default'], ['soy', '大豆', 'green'], ['fish', '鱼', 'red'], ['crustacean', '甲壳纲', 'red'], ['sesame', '芝麻', 'default'],
])

// ─── collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    name: 'srm_suppliers', title: '供应商档案', titleField: 'name', fields: [
      input('name', '供应商名称'), input('code', '供应商编码'), input('uscc', '统一社会信用代码'),
      select('category', '类别', SUPPLIER_CATEGORY), select('lifecycle_status', '生命周期状态', LIFECYCLE),
      select('source', '来源', opts([['self', '主动注册', 'blue'], ['invited', '邀请注册', 'green'], ['internal', '内部代录', 'default']])),
      input('contact', '联系人'), input('phone', '联系电话'), input('region', '所在地区'),
      select('regulatory_risk', '监管风险分级', REG_RISK), select('audit_grade', '审核评级', AUDIT_GRADE),
      select('iqc_level', 'IQC严格度', IQC_LEVEL), checkbox('is_blacklisted', '黑名单'),
      textarea('blacklist_reason', '拉黑原因'), date('admitted_at', '准入日期'), textarea('note', '备注'),
    ],
  },
  {
    name: 'srm_certificates', title: '供应商证照', fields: [
      belongsToSupplier('supplier', '供应商', 'supplier_id'), select('cert_type', '证照类型', CERT_TYPE),
      input('cert_no', '证照编号'), input('issuer', '发证机关'), date('issued_at', '发证日期'),
      date('expires_at', '有效期至'), select('warn_status', '预警状态', WARN_STATUS),
    ],
  },
  {
    name: 'srm_audit_checklists', title: '审核检查表模板', fields: [
      input('template', '模板名称'), input('group', '条款分组'), input('item', '检查项'),
      number('weight', '分值权重'), checkbox('is_critical', '关键项'),
    ],
  },
  {
    name: 'srm_audit_records', title: '供应商审核记录', fields: [
      belongsToSupplier('supplier', '供应商', 'supplier_id'), input('checklist_template', '检查表模板'),
      date('audit_date', '审核日期'), input('auditor', '审核员'),
      number('score_quality', '质量评分'), number('score_system', '体系评分'), number('score_compliance', '合规评分'),
      number('total_score', '总评得分'), select('grade', '评级', RATING), textarea('nonconformities', '不符合项摘要'),
    ],
  },
  {
    name: 'srm_score_cards', title: '供应商绩效评分卡', fields: [
      belongsToSupplier('supplier', '供应商', 'supplier_id'), select('period', '考核期', PERIODS),
      number('score_quality', '质量'), number('score_delivery', '交期'), number('score_price', '价格'),
      number('score_service', '服务'), number('score_compliance', '合规'),
      number('total_score', '加权总分'), select('rating', '评级结果', RATING), select('rating_change', '评级变化', RATING_CHANGE),
    ],
  },
  {
    name: 'srm_capas', title: '供应商整改单', fields: [
      belongsToSupplier('supplier', '供应商', 'supplier_id'), select('source', '来源', CAPA_SOURCE),
      input('title', '问题标题'), textarea('description', '问题描述'), textarea('measure', '整改措施'),
      input('owner', '责任人'), select('status', '状态', CAPA_STATUS), date('due_date', '截止日期'),
      checkbox('is_overdue', '超期'),
      // physical sort column for the kanban drag (the F1 wire: interface
      // "sort" scoped by the group field).
      { name: 'sort', type: 'sort', interface: 'sort', scopeKey: 'status' },
    ],
  },
]

// ─── v2 page specs (E1 table spine / F1 kanban spine / F4 chart add-ons) ───

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }

type TablePageSpec = {
  kind: 'table'
  title: string
  icon: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  formFields: ReadonlyArray<FieldSpec>
}
type KanbanPageSpec = {
  kind: 'kanban'
  title: string
  icon: string
  collection: string
  groupField: string
  groupOptions: object[]
  cardFields: ReadonlyArray<FieldSpec>
  formFields: ReadonlyArray<FieldSpec>
}

const SUPPLIER_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'name', title: '供应商名称', kind: 'input' },
  { name: 'category', title: '类别', kind: 'select', options: SUPPLIER_CATEGORY },
  { name: 'lifecycle_status', title: '生命周期状态', kind: 'select', options: LIFECYCLE },
  { name: 'regulatory_risk', title: '监管风险', kind: 'select', options: REG_RISK },
  { name: 'audit_grade', title: '审核评级', kind: 'select', options: AUDIT_GRADE },
  { name: 'iqc_level', title: 'IQC严格度', kind: 'select', options: IQC_LEVEL },
  { name: 'is_blacklisted', title: '黑名单', kind: 'boolean' },
]
const SUPPLIER_FORM: ReadonlyArray<FieldSpec> = [
  { name: 'name', title: '供应商名称', kind: 'input', required: true },
  { name: 'code', title: '供应商编码', kind: 'input' },
  { name: 'uscc', title: '统一社会信用代码', kind: 'input' },
  { name: 'category', title: '类别', kind: 'select', options: SUPPLIER_CATEGORY },
  { name: 'lifecycle_status', title: '生命周期状态', kind: 'select', options: LIFECYCLE },
  { name: 'source', title: '来源', kind: 'select', options: opts([['self', '主动注册', 'blue'], ['invited', '邀请注册', 'green'], ['internal', '内部代录', 'default']]) },
  { name: 'contact', title: '联系人', kind: 'input' },
  { name: 'phone', title: '联系电话', kind: 'input' },
  { name: 'region', title: '所在地区', kind: 'input' },
  { name: 'regulatory_risk', title: '监管风险分级', kind: 'select', options: REG_RISK },
  { name: 'audit_grade', title: '审核评级', kind: 'select', options: AUDIT_GRADE },
  { name: 'iqc_level', title: 'IQC严格度', kind: 'select', options: IQC_LEVEL },
  { name: 'admitted_at', title: '准入日期', kind: 'date' },
  { name: 'note', title: '备注', kind: 'input' },
]

const PAGES: ReadonlyArray<TablePageSpec | KanbanPageSpec> = [
  {
    kind: 'table', title: '供应商档案', icon: 'TeamOutlined', collection: 'srm_suppliers',
    columns: SUPPLIER_COLUMNS, formFields: SUPPLIER_FORM,
  },
  {
    // Second view over srm_suppliers (the F2 客户仪表盘 precedent): the
    // admission desk highlights the pipeline fields; its Add-new popup IS
    // the admission form the approval workflow hangs off.
    kind: 'table', title: '供应商准入', icon: 'AuditOutlined', collection: 'srm_suppliers',
    columns: [
      { name: 'name', title: '供应商名称', kind: 'input' },
      { name: 'source', title: '来源', kind: 'select', options: opts([['self', '主动注册', 'blue'], ['invited', '邀请注册', 'green'], ['internal', '内部代录', 'default']]) },
      { name: 'lifecycle_status', title: '生命周期状态', kind: 'select', options: LIFECYCLE },
      { name: 'audit_grade', title: '审核评级', kind: 'select', options: AUDIT_GRADE },
      { name: 'admitted_at', title: '准入日期', kind: 'date' },
    ],
    formFields: SUPPLIER_FORM,
  },
  {
    kind: 'table', title: '证照效期预警', icon: 'WarningOutlined', collection: 'srm_certificates',
    columns: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'cert_type', title: '证照类型', kind: 'select', options: CERT_TYPE },
      { name: 'cert_no', title: '证照编号', kind: 'input' },
      { name: 'expires_at', title: '有效期至', kind: 'date' },
      { name: 'warn_status', title: '预警状态', kind: 'select', options: WARN_STATUS },
    ],
    formFields: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'cert_type', title: '证照类型', kind: 'select', options: CERT_TYPE, required: true },
      { name: 'cert_no', title: '证照编号', kind: 'input', required: true },
      { name: 'issuer', title: '发证机关', kind: 'input' },
      { name: 'issued_at', title: '发证日期', kind: 'date' },
      { name: 'expires_at', title: '有效期至', kind: 'date' },
      { name: 'warn_status', title: '预警状态', kind: 'select', options: WARN_STATUS },
    ],
  },
  {
    kind: 'table', title: '审核检查表', icon: 'FileProtectOutlined', collection: 'srm_audit_checklists',
    columns: [
      { name: 'template', title: '模板名称', kind: 'input' },
      { name: 'group', title: '条款分组', kind: 'input' },
      { name: 'item', title: '检查项', kind: 'input' },
      { name: 'weight', title: '分值权重', kind: 'number' },
      { name: 'is_critical', title: '关键项', kind: 'boolean' },
    ],
    formFields: [
      { name: 'template', title: '模板名称', kind: 'input', required: true },
      { name: 'group', title: '条款分组', kind: 'input' },
      { name: 'item', title: '检查项', kind: 'input', required: true },
      { name: 'weight', title: '分值权重', kind: 'number' },
      { name: 'is_critical', title: '关键项', kind: 'boolean' },
    ],
  },
  {
    kind: 'table', title: '审核评分录入', icon: 'SafetyCertificateOutlined', collection: 'srm_audit_records',
    columns: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'audit_date', title: '审核日期', kind: 'date' },
      { name: 'auditor', title: '审核员', kind: 'input' },
      { name: 'score_quality', title: '质量评分', kind: 'number' },
      { name: 'score_system', title: '体系评分', kind: 'number' },
      { name: 'score_compliance', title: '合规评分', kind: 'number' },
      { name: 'grade', title: '评级', kind: 'select', options: RATING },
    ],
    formFields: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'checklist_template', title: '检查表模板', kind: 'input' },
      { name: 'audit_date', title: '审核日期', kind: 'date' },
      { name: 'auditor', title: '审核员', kind: 'input' },
      { name: 'score_quality', title: '质量评分', kind: 'number' },
      { name: 'score_system', title: '体系评分', kind: 'number' },
      { name: 'score_compliance', title: '合规评分', kind: 'number' },
      { name: 'total_score', title: '总评得分', kind: 'number' },
      { name: 'grade', title: '评级', kind: 'select', options: RATING },
      { name: 'nonconformities', title: '不符合项摘要', kind: 'input' },
    ],
  },
  {
    kind: 'table', title: '绩效评分卡', icon: 'RadarChartOutlined', collection: 'srm_score_cards',
    columns: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'period', title: '考核期', kind: 'select', options: PERIODS },
      { name: 'score_quality', title: '质量', kind: 'number' },
      { name: 'score_delivery', title: '交期', kind: 'number' },
      { name: 'score_price', title: '价格', kind: 'number' },
      { name: 'score_service', title: '服务', kind: 'number' },
      { name: 'score_compliance', title: '合规', kind: 'number' },
      { name: 'total_score', title: '加权总分', kind: 'number' },
      { name: 'rating', title: '评级结果', kind: 'select', options: RATING },
    ],
    formFields: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'period', title: '考核期', kind: 'select', options: PERIODS, required: true },
      { name: 'score_quality', title: '质量', kind: 'number' },
      { name: 'score_delivery', title: '交期', kind: 'number' },
      { name: 'score_price', title: '价格', kind: 'number' },
      { name: 'score_service', title: '服务', kind: 'number' },
      { name: 'score_compliance', title: '合规', kind: 'number' },
      { name: 'total_score', title: '加权总分', kind: 'number' },
      { name: 'rating', title: '评级结果', kind: 'select', options: RATING },
      { name: 'rating_change', title: '评级变化', kind: 'select', options: RATING_CHANGE },
    ],
  },
  {
    kind: 'table', title: '供应商绩效雷达', icon: 'DashboardOutlined', collection: 'srm_score_cards',
    columns: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'period', title: '考核期', kind: 'select', options: PERIODS },
      { name: 'total_score', title: '加权总分', kind: 'number' },
      { name: 'rating', title: '评级结果', kind: 'select', options: RATING },
    ],
    formFields: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'period', title: '考核期', kind: 'select', options: PERIODS, required: true },
      { name: 'score_quality', title: '质量', kind: 'number' },
      { name: 'score_delivery', title: '交期', kind: 'number' },
      { name: 'score_price', title: '价格', kind: 'number' },
      { name: 'score_service', title: '服务', kind: 'number' },
      { name: 'score_compliance', title: '合规', kind: 'number' },
      { name: 'total_score', title: '加权总分', kind: 'number' },
      { name: 'rating', title: '评级结果', kind: 'select', options: RATING },
    ],
  },
  {
    kind: 'kanban', title: '整改跟踪', icon: 'FireOutlined', collection: 'srm_capas',
    groupField: 'status', groupOptions: CAPA_STATUS,
    cardFields: [
      { name: 'title', title: '问题标题', kind: 'input' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'source', title: '来源', kind: 'select', options: CAPA_SOURCE },
      { name: 'owner', title: '责任人', kind: 'input' },
      { name: 'due_date', title: '截止日期', kind: 'date' },
    ],
    formFields: [
      { name: 'title', title: '问题标题', kind: 'input', required: true },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'source', title: '来源', kind: 'select', options: CAPA_SOURCE },
      { name: 'description', title: '问题描述', kind: 'input' },
      { name: 'measure', title: '整改措施', kind: 'input' },
      { name: 'owner', title: '责任人', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: CAPA_STATUS },
      { name: 'due_date', title: '截止日期', kind: 'date' },
    ],
  },
]

const MENU_GROUP = { title: '供应链', icon: 'ClusterOutlined' }

const WORKFLOW_ADMISSION = 'SRM供应商准入审批'
const WORKFLOW_CAPA = 'SRM低评分自动整改'

// ─── display/edit model resolvers (the E1/F1 shared map) ───

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'number': return 'DisplayNumberFieldModel'
    case 'm2o': return 'DisplayTextFieldModel'
    case 'date': return 'DisplayDateTimeFieldModel'
    case 'boolean': return 'DisplayCheckboxFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

const editModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'SelectFieldModel'
    case 'number': return 'NumberFieldModel'
    case 'm2o': return 'RecordSelectFieldModel'
    case 'date': return 'DateOnlyFieldModel'
    case 'boolean': return 'CheckboxFieldModel'
    default: return 'InputFieldModel'
  }
}

// ─── collection/foundation plumbing ───

async function hasField(token: string, collection: string, field: string): Promise<boolean> {
  const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}&pageSize=300`) as Array<{ name?: string }> | null
  return (rows ?? []).some(row => row.name === field)
}

/** Nullable food columns on hub_inv_products — additive only, never dropped. */
const FOUNDATION_FIELDS: ReadonlyArray<{ field: object, probe: string }> = [
  { field: integer('shelf_life_days', '保质期天数'), probe: 'shelf_life_days' },
  { field: select('temp_zone', '温层', TEMP_ZONE), probe: 'temp_zone' },
  { field: textarea('storage_conditions', '储存条件'), probe: 'storage_conditions' },
  { field: input('gb2760_category', 'GB2760分类号'), probe: 'gb2760_category' },
  { field: multipleSelect('allergens', '致敏原', ALLERGENS), probe: 'allergens' },
]

// W2-B1: the GB/T 2828.1—2012 转移得分列（正常检验起算、逐批 +3/+2/清零，
// ≥30 才允许 --iqc-relax 放宽；写入方是 h5 的 inspectInspection 状态机）。
const SUPPLIER_ADDITIVE_FIELDS: ReadonlyArray<{ field: object, probe: string }> = [
  { field: integer('switch_score', '转移得分'), probe: 'switch_score' },
]

async function ensureFoundationColumns(token: string): Promise<void> {
  let added = 0
  for (const spec of FOUNDATION_FIELDS) {
    if (await hasField(token, 'hub_inv_products', spec.probe)) continue
    await dataOf(token, 'POST', '/api/collections/hub_inv_products/fields:create', spec.field)
    added += 1
  }
  console.log(`nocobase-h4: hub_inv_products food columns ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

async function ensureSupplierAdditiveColumns(token: string): Promise<void> {
  for (const spec of SUPPLIER_ADDITIVE_FIELDS) {
    if (await hasField(token, 'srm_suppliers', spec.probe)) continue
    await dataOf(token, 'POST', '/api/collections/srm_suppliers/fields:create', spec.field)
    console.log(`nocobase-h4: srm_suppliers.${spec.probe} added`)
  }
}

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing === null) {
      await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields })
      console.log(`nocobase-h4: collection ${collection.name} created`)
    } else {
      console.log(`nocobase-h4: collection ${collection.name} exists (kept)`)
    }
    if (collection.titleField !== undefined && existing?.titleField !== collection.titleField) {
      await call(token, 'POST', `/api/collections:update?filterByTk=${collection.name}`, { titleField: collection.titleField })
    }
  }
}

// ─── seeds (business-key upserts; the guard backfills only null columns) ───

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

const SEED_SUPPLIERS: ReadonlyArray<Record<string, unknown>> = [
  { name: '珠海鲜丰水产科技有限公司', code: 'SUP-001', uscc: '91440400MA51XXXX1A', category: 'raw', lifecycle_status: 'qualified', source: 'invited', contact: '陈海燕', phone: '0756-6612xxx', region: '广东珠海', regulatory_risk: 'B', audit_grade: 'A', iqc_level: 'normal', admitted_at: iso(-720), note: '南美白虾仁主供应商，冷链资质齐全' },
  { name: '山东鲁丰食品配料有限公司', code: 'SUP-002', uscc: '91370700MA3CXXXX2B', category: 'aux', lifecycle_status: 'preferred', source: 'invited', contact: '刘志强', phone: '0536-8291xxx', region: '山东潍坊', regulatory_risk: 'B', audit_grade: 'A', iqc_level: 'relaxed', admitted_at: iso(-1080), note: '月饼皮预拌粉/膨化原料' },
  { name: '江南乳业集团股份有限公司', code: 'SUP-003', uscc: '91320500MA1WXXXX3C', category: 'raw', lifecycle_status: 'restricted', source: 'self', contact: '周美娟', phone: '0512-6753xxx', region: '江苏苏州', regulatory_risk: 'C', audit_grade: 'C', iqc_level: 'tightened', admitted_at: iso(-540), note: '巴氏鲜奶，上季度交期评分偏低，限期整改中' },
  { name: '味之源调味食品股份有限公司', code: 'SUP-004', uscc: '91440100MA9UXXXX4D', category: 'raw', lifecycle_status: 'qualified', source: 'invited', contact: '黄启明', phone: '020-3876xxx', region: '广东广州', regulatory_risk: 'A', audit_grade: 'B', iqc_level: 'normal', admitted_at: iso(-900), note: '酱油/调味汁，GB2760 合规档案完整' },
  { name: '绿源包装材料有限公司', code: 'SUP-005', uscc: '91440300MA5DXXXX5E', category: 'packaging', lifecycle_status: 'qualified', source: 'internal', contact: '何伟', phone: '0755-2831xxx', region: '广东深圳', regulatory_risk: 'A', audit_grade: 'B', iqc_level: 'relaxed', admitted_at: iso(-1260), note: '玻璃罐/复合膜包材' },
  { name: '丹东禾丰果蔬专业合作社', code: 'SUP-006', uscc: '91210600MA0PXXXX6F', category: 'raw', lifecycle_status: 'frozen', source: 'self', contact: '孙立国', phone: '0415-4127xxx', region: '辽宁丹东', regulatory_risk: 'D', audit_grade: 'D', iqc_level: 'suspended', is_blacklisted: true, blacklist_reason: '农残抽检不合格且整改无效，冻结供货', admitted_at: iso(-800), note: '冻干草莓原料，已启动替代供应商' },
  { name: '内蒙古草原雪花粮油有限公司', code: 'SUP-007', uscc: '91520100MA7QXXXX7G', category: 'raw', lifecycle_status: 'potential', source: 'self', contact: '巴特尔', phone: '0471-6309xxx', region: '内蒙古呼和浩特', regulatory_risk: 'B', note: '新增食用油候选，等待准入评审' },
  { name: '顺发冷链物流股份有限公司', code: 'SUP-008', uscc: '91330100MA2BXXXX8H', category: 'service', lifecycle_status: 'qualified', source: 'invited', contact: '王敏', phone: '0571-8602xxx', region: '浙江杭州', regulatory_risk: 'A', audit_grade: 'B', iqc_level: 'normal', admitted_at: iso(-650), note: '干线冷链运输服务' },
  { name: '漳州市蜜果休闲食品有限公司', code: 'SUP-009', uscc: '91350600MA8KXXXX9J', category: 'raw', lifecycle_status: 'reviewing', source: 'self', contact: '林晓芸', phone: '0596-2635xxx', region: '福建漳州', regulatory_risk: 'C', note: '果蔬脆片混合装原料，准入评审中' },
]

/** Certificates per supplier index (0-based into SEED_SUPPLIERS); expiry bands per the 30/60/90 demo design. */
const SEED_CERTIFICATES: ReadonlyArray<{ s: number, type: string, no: string, issuer: string, issued: number, expires: number, warn: string }> = [
  { s: 0, type: 'sc', no: 'SC11444040000021', issuer: '广东省市场监督管理局', issued: -1095, expires: 700, warn: 'ok' },
  { s: 0, type: 'iso22000', no: '001FSMS4400', issuer: '方圆标志认证集团', issued: -700, expires: 380, warn: 'ok' },
  { s: 1, type: 'sc', no: 'SC11137070000013', issuer: '山东省市场监督管理局', issued: -1000, expires: 85, warn: 'w90' },
  { s: 1, type: 'bl', no: '91370700MA3CXXXX2B', issuer: '潍坊市行政审批服务局', issued: -2000, expires: 1460, warn: 'ok' },
  { s: 2, type: 'jy', no: 'JY13205000012345', issuer: '苏州市市场监督管理局', issued: -900, expires: 55, warn: 'w60' },
  { s: 2, type: 'haccp', no: 'HACCP-2024-0561', issuer: '中国质量认证中心', issued: -600, expires: 25, warn: 'w30' },
  { s: 3, type: 'sc', no: 'SC10344010000047', issuer: '广东省市场监督管理局', issued: -800, expires: 1000, warn: 'ok' },
  { s: 3, type: 'haccp', no: 'HACCP-2025-0113', issuer: '中国质量认证中心', issued: -300, expires: 790, warn: 'ok' },
  { s: 3, type: 'iso22000', no: '001FSMS4401', issuer: '方圆标志认证集团', issued: -1200, expires: -10, warn: 'expired' },
  { s: 4, type: 'bl', no: '91440300MA5DXXXX5E', issuer: '深圳市市场监督管理局', issued: -1500, expires: 1200, warn: 'ok' },
  { s: 4, type: 'other', no: 'QS-SC-2023-88', issuer: '第三方检测机构', issued: -400, expires: 25, warn: 'w30' },
  { s: 5, type: 'sc', no: 'SC10521060000032', issuer: '辽宁省市场监督管理局', issued: -1100, expires: 700, warn: 'ok' },
  { s: 6, type: 'bl', no: '91520100MA7QXXXX7G', issuer: '呼和浩特市市场监督管理局', issued: -600, expires: 85, warn: 'w90' },
  { s: 7, type: 'other', no: 'DW-CL-2025-118', issuer: '交通运输部', issued: -500, expires: 58, warn: 'w60' },
  { s: 8, type: 'bl', no: '91350600MA8KXXXX9J', issuer: '漳州市市场监督管理局', issued: -200, expires: 90, warn: 'w90' },
]

/** GMP checklist (20 items over the six GB14881 groups) + HACCP 7 + ISO22000 6. */
const CHECKLIST_TEMPLATE: ReadonlyArray<[string, string, string, number, boolean]> = [
  ['GMP现场审核表', '厂区环境', '厂区周边无污染源，周界密闭构筑完好', 5, true],
  ['GMP现场审核表', '厂区环境', '生产区与生活区分离，道路硬化无扬尘', 5, false],
  ['GMP现场审核表', '厂房及设施', '车间布局按清洁度梯度流向布置', 5, true],
  ['GMP现场审核表', '厂房及设施', '更衣/洗手/消毒设施齐备且运转正常', 5, true],
  ['GMP现场审核表', '厂房及设施', '虫控设施布点合规，记录完整', 5, true],
  ['GMP现场审核表', '厂房及设施', '通风与空气净化系统定期维护有记录', 4, false],
  ['GMP现场审核表', '生产过程', '关键控制点监控与纠偏记录完整', 5, true],
  ['GMP现场审核表', '生产过程', '投料批次记录可追溯到原料批次', 5, true],
  ['GMP现场审核表', '生产过程', '设备清洗消毒按 SSOP 执行并验证', 4, false],
  ['GMP现场审核表', '生产过程', '不合格品隔离存放并有处置记录', 5, false],
  ['GMP现场审核表', '存储过程', '原辅料库温湿度监控与记录完整', 4, false],
  ['GMP现场审核表', '存储过程', '食品添加剂专柜存放、双人双锁', 5, true],
  ['GMP现场审核表', '存储过程', '成品按批次分区存放，先进先出', 4, false],
  ['GMP现场审核表', '组织人事', '食品安全管理人员持证在岗', 5, false],
  ['GMP现场审核表', '组织人事', '从业人员健康证齐全且在有效期内', 4, false],
  ['GMP现场审核表', '品质管理', '进货查验记录含检验合格证号', 5, true],
  ['GMP现场审核表', '品质管理', '出厂检验按产品标准执行并留样', 5, false],
  ['GMP现场审核表', '品质管理', '追溯演练在 2 小时内完成双向追溯', 5, true],
  ['GMP现场审核表', '品质管理', '召回程序有年度演练记录', 4, false],
  ['GMP现场审核表', '品质管理', '投诉处理闭环且有根因分析', 4, false],
  ['HACCP体系审核表', '危害分析', '危害分析覆盖生物/化学/物理三类', 5, true],
  ['HACCP体系审核表', '关键限值', 'CCP 关键限值有科学依据并文件化', 5, true],
  ['HACCP体系审核表', '监控程序', 'CCP 监控频次与责任人明确', 4, false],
  ['HACCP体系审核表', '纠偏行动', '纠偏程序含隔离与评估要求', 4, false],
  ['HACCP体系审核表', '验证', 'CCP 验证包含仪器校准记录', 4, false],
  ['HACCP体系审核表', '记录保持', 'HACCP 记录保存不少于保质期后六个月', 5, false],
  ['HACCP体系审核表', '培训', 'HACCP 小组成员年度培训有考核', 3, false],
  ['ISO22000审核表', '体系文件', '食品安全方针与目标可测量并分解', 4, false],
  ['ISO22000审核表', '前提方案', 'PRP(s) 覆盖 ISO/TS 22002 系列要求', 5, true],
  ['ISO22000审核表', '内审管理', '年度内审覆盖全部条款且整改闭环', 4, false],
  ['ISO22000审核表', '管理评审', '管理评审输入包含追溯与召回绩效', 4, false],
  ['ISO22000审核表', '持续改进', '更新活动随危害变化触发并留痕', 4, false],
  ['ISO22000审核表', '供应链沟通', '与供方的食品安全要求有书面约定', 5, false],
]

/** Audit records: suppliers 0/1/2/3 × three cycles. */
const SEED_AUDITS: ReadonlyArray<{ s: number, template: string, date: number, auditor: string, q: number, sys: number, comp: number, grade: string, nc: string }> = [
  { s: 0, template: 'GMP现场审核表', date: -540, auditor: '质量部·吴敏', q: 92, sys: 90, comp: 94, grade: 'A', nc: '车间入口洗手消毒记录两处漏签' },
  { s: 0, template: 'GMP现场审核表', date: -180, auditor: '质量部·吴敏', q: 95, sys: 93, comp: 96, grade: 'A', nc: '无不符合项' },
  { s: 0, template: 'ISO22000审核表', date: -60, auditor: '质量部·赵磊', q: 93, sys: 94, comp: 92, grade: 'A', nc: '管理评审输入缺追溯绩效指标' },
  { s: 1, template: 'GMP现场审核表', date: -560, auditor: '质量部·赵磊', q: 90, sys: 88, comp: 91, grade: 'B', nc: '添加剂台账一处规格笔误' },
  { s: 1, template: 'GMP现场审核表', date: -190, auditor: '质量部·吴敏', q: 93, sys: 92, comp: 93, grade: 'A', nc: '无不符合项' },
  { s: 1, template: 'HACCP体系审核表', date: -70, auditor: '质量部·赵磊', q: 91, sys: 90, comp: 92, grade: 'B', nc: 'CCP2 校准记录超期 3 天' },
  { s: 2, template: 'GMP现场审核表', date: -500, auditor: '质量部·吴敏', q: 82, sys: 80, comp: 78, grade: 'C', nc: '收奶区温控记录多处缺失' },
  { s: 2, template: 'GMP现场审核表', date: -160, auditor: '质量部·赵磊', q: 76, sys: 75, comp: 74, grade: 'C', nc: '冷链车厢预冷记录不完整（主要不符合）' },
  { s: 2, template: 'HACCP体系审核表', date: -45, auditor: '质量部·吴敏', q: 74, sys: 73, comp: 75, grade: 'C', nc: '巴杀 CCP 监控频次未按文件执行' },
  { s: 3, template: 'GMP现场审核表', date: -520, auditor: '质量部·赵磊', q: 88, sys: 87, comp: 89, grade: 'B', nc: '灌装间地漏防倒灌措施待加固' },
  { s: 3, template: 'GMP现场审核表', date: -170, auditor: '质量部·吴敏', q: 90, sys: 89, comp: 91, grade: 'B', nc: '无不符合项' },
  { s: 3, template: 'ISO22000审核表', date: -50, auditor: '质量部·赵磊', q: 89, sys: 88, comp: 90, grade: 'B', nc: '供应商食品安全约定书两份未更新' },
]

/**
 * Score cards: suppliers 0/1/2/3 × four quarters. Every seed total stays ≥60
 * so the <60 CAPA workflow never fires off a seed row (the live demo creates
 * the low card that does).
 */
const SEED_SCORES: ReadonlyArray<{ s: number, period: string, q: number, d: number, p: number, sv: number, c: number, rating: string, change: string }> = [
  { s: 0, period: '2025Q3', q: 92, d: 88, p: 90, sv: 91, c: 95, rating: 'A', change: 'flat' },
  { s: 0, period: '2025Q4', q: 93, d: 90, p: 89, sv: 92, c: 96, rating: 'A', change: 'flat' },
  { s: 0, period: '2026Q1', q: 95, d: 91, p: 88, sv: 93, c: 97, rating: 'A', change: 'flat' },
  { s: 0, period: '2026Q2', q: 94, d: 92, p: 90, sv: 94, c: 96, rating: 'A', change: 'flat' },
  { s: 1, period: '2025Q3', q: 90, d: 92, p: 93, sv: 89, c: 91, rating: 'A', change: 'up' },
  { s: 1, period: '2025Q4', q: 91, d: 93, p: 92, sv: 90, c: 92, rating: 'A', change: 'flat' },
  { s: 1, period: '2026Q1', q: 92, d: 94, p: 91, sv: 91, c: 93, rating: 'A', change: 'flat' },
  { s: 1, period: '2026Q2', q: 93, d: 95, p: 90, sv: 92, c: 94, rating: 'A', change: 'flat' },
  { s: 2, period: '2025Q3', q: 84, d: 82, p: 80, sv: 83, c: 85, rating: 'B', change: 'down' },
  { s: 2, period: '2025Q4', q: 78, d: 75, p: 79, sv: 77, c: 80, rating: 'C', change: 'down' },
  { s: 2, period: '2026Q1', q: 74, d: 72, p: 76, sv: 73, c: 75, rating: 'C', change: 'flat' },
  { s: 2, period: '2026Q2', q: 71, d: 68, p: 74, sv: 70, c: 72, rating: 'C', change: 'flat' },
  { s: 3, period: '2025Q3', q: 87, d: 85, p: 84, sv: 86, c: 88, rating: 'B', change: 'flat' },
  { s: 3, period: '2025Q4', q: 88, d: 86, p: 85, sv: 87, c: 89, rating: 'B', change: 'flat' },
  { s: 3, period: '2026Q1', q: 89, d: 87, p: 84, sv: 88, c: 90, rating: 'B', change: 'flat' },
  { s: 3, period: '2026Q2', q: 90, d: 88, p: 86, sv: 89, c: 91, rating: 'B', change: 'up' },
]

const SEED_CAPAS: ReadonlyArray<{ s: number, source: string, title: string, description: string, measure: string, owner: string, status: string, due: number, overdue: boolean }> = [
  { s: 2, source: 'performance', title: '2026Q2 交期评分连续下滑整改', description: '连续两个季度交期评分低于 75，三家客户投诉到货延迟', measure: '增加干线运力并重排发车班次，每周同步到货率', owner: '采购部·许涛', status: 'initiated', due: 21, overdue: false },
  { s: 2, source: 'audit', title: '冷链车厢预冷记录不完整', description: '现场审核发现 6 月 3 处车厢预冷温度记录缺失', measure: '加装车载温度自动记录仪，补培训记录员', owner: '质量部·吴敏', status: 'replied', due: 14, overdue: false },
  { s: 3, source: 'iqc', title: '酱油批次氨基酸态氮临界值偏差', description: 'IQC 抽检两批氨基酸态氮处于标准下限临界', measure: '调整发酵周期并复检留样，提供第三方检测报告', owner: '质量部·赵磊', status: 'verifying', due: 7, overdue: false },
  { s: 0, source: 'complaint', title: '虾仁包装破损客诉处理', description: '客户投诉 5 箱外包装破损（运输环节）', measure: '改用加厚瓦楞纸箱并对承运商开出警告函', owner: '采购部·许涛', status: 'closed', due: -30, overdue: false },
  { s: 6, source: 'audit', title: 'HACCP 关键限值依据文件缺失', description: '准入现场审核发现 CCP 关键限值缺少科学依据文件', measure: '补充委托检测报告并更新危害分析工作单', owner: '质量部·吴敏', status: 'initiated', due: -3, overdue: true },
]

const SEED_FOOD_SKUS: ReadonlyArray<Record<string, unknown>> = [
  { name: '古法酿造酱油 500ml（酿造型）', sku: 'FD-SOY-500', category: '调味品', unit_price: 12.5, reorder_level: 120, status: 'active', shelf_life_days: 540, temp_zone: 'ambient', storage_conditions: '常温避光保存，开封后冷藏', gb2760_category: '12.04 酱油', allergens: ['wheat', 'soy'] },
  { name: ' NFC 鲜榨橙汁 1L', sku: 'FD-BEV-1000', category: '饮料', unit_price: 22.0, reorder_level: 80, status: 'active', shelf_life_days: 45, temp_zone: 'chilled', storage_conditions: '0-4℃ 冷藏，避光', gb2760_category: '14.02 果蔬汁类', allergens: [] },
  { name: '海苔芝士米果 80g', sku: 'FD-SNA-080', category: '休闲食品', unit_price: 9.8, reorder_level: 200, status: 'active', shelf_life_days: 270, temp_zone: 'ambient', storage_conditions: '常温干燥保存', gb2760_category: '16.06 膨化食品', allergens: ['wheat', 'milk', 'soy'] },
  { name: '速冻荠菜猪肉水饺 450g', sku: 'FD-FRZ-450', category: '速冻食品', unit_price: 18.9, reorder_level: 150, status: 'active', shelf_life_days: 360, temp_zone: 'frozen', storage_conditions: '-18℃ 以下冷冻保存', gb2760_category: '16.07 速冻面米制品', allergens: ['wheat', 'crustacean'] },
]

/** Backfill the food columns on the pre-existing SKUs only where still null. */
const EXISTING_SKU_BACKFILL: ReadonlyArray<{ sku: string, values: Record<string, unknown> }> = [
  { sku: 'SKU-FZ-0001', values: { shelf_life_days: 365, temp_zone: 'frozen', storage_conditions: '-18℃ 以下冷冻保存', gb2760_category: '16.05 冷冻水产品', allergens: ['crustacean'] } },
  { sku: 'SKU-FZ-0002', values: { shelf_life_days: 365, temp_zone: 'frozen', storage_conditions: '-18℃ 以下冷冻保存', gb2760_category: '16.05 冷冻水产品', allergens: [] } },
  { sku: 'SKU-GZ-0003', values: { shelf_life_days: 270, temp_zone: 'ambient', storage_conditions: '常温干燥保存', gb2760_category: '16.06 膨化食品', allergens: ['wheat'] } },
  { sku: 'SKU-DZ-0004', values: { shelf_life_days: 180, temp_zone: 'ambient', storage_conditions: '常温干燥保存，防潮', gb2760_category: '16.39 月饼', allergens: ['wheat', 'egg'] } },
  { sku: 'SKU-FZ-0005', values: { shelf_life_days: 540, temp_zone: 'frozen', storage_conditions: '-18℃ 以下冷冻保存', gb2760_category: '16.01 水果制品', allergens: [] } },
  { sku: 'SKU-BZ-0006', values: { shelf_life_days: 730, temp_zone: 'ambient', storage_conditions: '常温避光保存', gb2760_category: '16.02 蜂蜜', allergens: [] } },
  { sku: 'SKU-LD-0007', values: { shelf_life_days: 7, temp_zone: 'chilled', storage_conditions: '0-4℃ 冷藏，避光', gb2760_category: '14.02 果蔬汁类', allergens: ['milk'] } },
]

async function seedFoundationSkus(token: string): Promise<void> {
  let added = 0
  let backfilled = 0
  const rows = (await dataOf(token, 'GET', '/api/hub_inv_products:list?pageSize=500')) as Array<Record<string, unknown>> | null
  const bySku = new Map((rows ?? []).map(row => [String(row.sku ?? ''), row]))
  for (const sku of SEED_FOOD_SKUS) {
    if ([...bySku.values()].some(row => row.name === sku.name)) continue
    await dataOf(token, 'POST', '/api/hub_inv_products:create', sku)
    added += 1
  }
  for (const spec of EXISTING_SKU_BACKFILL) {
    const row = bySku.get(spec.sku)
    if (row === undefined) continue
    // Seeded-value guard: only columns still null on the live row get the
    // demo defaults, so an operator edit survives every replay.
    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(spec.values)) {
      if (row[key] === null || row[key] === undefined) patch[key] = value
    }
    if (Object.keys(patch).length === 0) continue
    await dataOf(token, 'POST', `/api/hub_inv_products:update?filterByTk=${row.id}`, patch)
    backfilled += 1
  }
  console.log(`nocobase-h4: food SKUs +${added} created, ${backfilled} existing rows backfilled (null-guarded)`)
}

async function supplierIds(token: string): Promise<Map<string, number>> {
  const rows = (await dataOf(token, 'GET', '/api/srm_suppliers:list?pageSize=200')) as Array<{ id: number, name?: string }> | null
  return new Map((rows ?? []).map(row => [String(row.name ?? ''), row.id]))
}

async function seedSrmRows(token: string): Promise<void> {
  const existingNames = new Set([...(await supplierIds(token)).keys()])
  let supplierAdded = 0
  for (const row of SEED_SUPPLIERS) {
    if (existingNames.has(String(row.name))) continue
    await dataOf(token, 'POST', '/api/srm_suppliers:create', row)
    supplierAdded += 1
  }
  console.log(`nocobase-h4: seed srm_suppliers +${supplierAdded} (kept: ${existingNames.size}/${SEED_SUPPLIERS.length})`)

  // Re-read after the creates: the association seeds below resolve supplier
  // business names to row ids.
  const suppliers = await supplierIds(token)
  if (suppliers.size < SEED_SUPPLIERS.length) {
    throw new Error(`srm_suppliers has ${suppliers.size} rows after seeding (${SEED_SUPPLIERS.length} expected); aborting before association seeds`)
  }

  const listKeys = async (collection: string, key: (row: Record<string, any>) => string): Promise<Set<string>> => {
    const rows = (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500`)) as Array<Record<string, any>> | null
    return new Set((rows ?? []).map(key))
  }

  const certRows = SEED_CERTIFICATES.map(cert => ({
    supplier: { id: suppliers.get(SEED_SUPPLIERS[cert.s].name) },
    cert_type: cert.type, cert_no: cert.no, issuer: cert.issuer,
    issued_at: iso(cert.issued), expires_at: iso(cert.expires), warn_status: cert.warn,
  }))
  const certExisting = await listKeys('srm_certificates', row => `${row.supplier?.id ?? row.supplier_id}:${row.cert_type}:${row.cert_no}`)
  let certAdded = 0
  for (const row of certRows) {
    if (certExisting.has(`${row.supplier.id}:${row.cert_type}:${row.cert_no}`)) continue
    await dataOf(token, 'POST', '/api/srm_certificates:create', row)
    certAdded += 1
  }
  console.log(`nocobase-h4: seed srm_certificates +${certAdded} (kept: ${certExisting.size}/${certRows.length})`)

  const checkExisting = await listKeys('srm_audit_checklists', row => `${row.template}:${row.group}:${row.item}`)
  let checkAdded = 0
  for (const [template, group, item, weight, critical] of CHECKLIST_TEMPLATE) {
    if (checkExisting.has(`${template}:${group}:${item}`)) continue
    await dataOf(token, 'POST', '/api/srm_audit_checklists:create', { template, group, item, weight, is_critical: critical })
    checkAdded += 1
  }
  console.log(`nocobase-h4: seed srm_audit_checklists +${checkAdded} (kept: ${checkExisting.size}/${CHECKLIST_TEMPLATE.length})`)

  const auditExisting = await listKeys('srm_audit_records', row => `${row.supplier?.id ?? row.supplier_id}:${row.audit_date}`)
  let auditAdded = 0
  for (const record of SEED_AUDITS) {
    const key = `${suppliers.get(SEED_SUPPLIERS[record.s].name)}:${iso(record.date)}`
    if (auditExisting.has(key)) continue
    await dataOf(token, 'POST', '/api/srm_audit_records:create', {
      supplier: { id: suppliers.get(SEED_SUPPLIERS[record.s].name) },
      checklist_template: record.template, audit_date: iso(record.date), auditor: record.auditor,
      score_quality: record.q, score_system: record.sys, score_compliance: record.comp,
      total_score: Math.round((record.q + record.sys + record.comp) / 3), grade: record.grade, nonconformities: record.nc,
    })
    auditAdded += 1
  }
  console.log(`nocobase-h4: seed srm_audit_records +${auditAdded} (kept: ${auditExisting.size}/${SEED_AUDITS.length})`)

  const scoreExisting = await listKeys('srm_score_cards', row => `${row.supplier?.id ?? row.supplier_id}:${row.period}`)
  let scoreAdded = 0
  for (const card of SEED_SCORES) {
    const supplierId = suppliers.get(SEED_SUPPLIERS[card.s].name)
    if (scoreExisting.has(`${supplierId}:${card.period}`)) continue
    // Weighted total per the R9 food rubric: 质量40/交期30/价格10/服务10/合规10.
    const total = Math.round(card.q * 0.4 + card.d * 0.3 + card.p * 0.1 + card.sv * 0.1 + card.c * 0.1)
    await dataOf(token, 'POST', '/api/srm_score_cards:create', {
      supplier: { id: supplierId }, period: card.period,
      score_quality: card.q, score_delivery: card.d, score_price: card.p, score_service: card.sv, score_compliance: card.c,
      total_score: total, rating: card.rating, rating_change: card.change,
    })
    scoreAdded += 1
  }
  console.log(`nocobase-h4: seed srm_score_cards +${scoreAdded} (kept: ${scoreExisting.size}/${SEED_SCORES.length})`)

  const capaExisting = await listKeys('srm_capas', row => `${row.supplier?.id ?? row.supplier_id}:${row.title}`)
  let capaAdded = 0
  for (const capa of SEED_CAPAS) {
    const supplierId = suppliers.get(SEED_SUPPLIERS[capa.s].name)
    if (capaExisting.has(`${supplierId}:${capa.title}`)) continue
    await dataOf(token, 'POST', '/api/srm_capas:create', {
      supplier: { id: supplierId }, source: capa.source, title: capa.title,
      description: capa.description, measure: capa.measure, owner: capa.owner,
      status: capa.status, due_date: iso(capa.due), is_overdue: capa.overdue,
    })
    capaAdded += 1
  }
  console.log(`nocobase-h4: seed srm_capas +${capaAdded} (kept: ${capaExisting.size}/${SEED_CAPAS.length})`)
}

// ─── workflows ───

async function ensureWorkflows(token: string): Promise<void> {
  for (const title of [WORKFLOW_ADMISSION, WORKFLOW_CAPA]) {
    if (await workflowExists(token, title)) {
      console.log(`nocobase-h4: workflow "${title}" exists (kept)`)
    }
  }

  // Self-heal past double-creations: keep the lowest id per title, destroy
  // the rest (duplicates both fire on the same trigger).
  for (const title of [WORKFLOW_ADMISSION, WORKFLOW_CAPA]) {
    const ids = await workflowIds(token, title)
    for (const extra of ids.slice(1).sort((a, b) => b - a)) {
      await call(token, 'POST', `/api/workflows:destroy?filterByTk=${extra}`)
      console.log(`nocobase-h4: duplicate workflow "${title}" #${extra} destroyed (self-heal)`)
    }
  }

  if (!(await workflowExists(token, WORKFLOW_ADMISSION))) {
    const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
      title: WORKFLOW_ADMISSION, enabled: true, type: 'collection',
      config: { collection: 'srm_suppliers', mode: 1 },
    }) as { id: number }
    // Create-time enable misses the db hook registration; one off/on cycle
    // mounts it (the verified 2.2.6 wire fact).
    await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
    await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
    const m1 = await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '资质审核', type: 'manual',
      config: { assignees: [1], forms: { f1: { type: 'custom', actions: [{ key: 'resolve', status: 1 }, { key: 'reject', status: 1 }] } } },
    }) as { id: number, key: string }
    const c1 = await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '资质是否通过', type: 'condition', upstreamId: m1.id,
      config: { engine: 'basic', rejectOnFalse: false, calculation: { calculator: 'equal', operands: [`{{$jobsMapByNodeKey.${m1.key}._}}`, 'resolve'] } },
    }) as { id: number }
    await dataOf(token, 'POST', `/api/flow_nodes:update?filterByTk=${m1.id}`, { downstreamId: c1.id })
    // Condition branches: branchIndex 1 = the TRUE (resolve) branch, matching
    // the orders workflow wire (request rides branch 1). 资质 resolve must
    // therefore CONTINUE to the on-site review on branch 1, and the reject
    // write-back sits on branch 0.
    const m2 = await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '现场审核评级', type: 'manual', upstreamId: c1.id, branchIndex: 1,
      config: { assignees: [1], forms: { f1: { type: 'custom', actions: [{ key: 'resolve', status: 1 }, { key: 'reject', status: 1 }] } } },
    }) as { id: number, key: string }
    await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '资质驳回·终止准入', type: 'update', upstreamId: c1.id, branchIndex: 0,
      config: { collection: 'srm_suppliers', params: { filter: { id: '{{$context.data.id}}' }, values: { lifecycle_status: 'rejected' } } },
    })
    const c2 = await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '评级是否通过', type: 'condition', upstreamId: m2.id,
      config: { engine: 'basic', rejectOnFalse: false, calculation: { calculator: 'equal', operands: [`{{$jobsMapByNodeKey.${m2.key}._}}`, 'resolve'] } },
    }) as { id: number }
    await dataOf(token, 'POST', `/api/flow_nodes:update?filterByTk=${m2.id}`, { downstreamId: c2.id })
    await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '准入激活·合格', type: 'update', upstreamId: c2.id, branchIndex: 1,
      config: { collection: 'srm_suppliers', params: { filter: { id: '{{$context.data.id}}' }, values: { lifecycle_status: 'qualified' } } },
    })
    await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '评级驳回·已拒绝', type: 'update', upstreamId: c2.id, branchIndex: 0,
      config: { collection: 'srm_suppliers', params: { filter: { id: '{{$context.data.id}}' }, values: { lifecycle_status: 'rejected' } } },
    })
    console.log(`nocobase-h4: workflow "${WORKFLOW_ADMISSION}" created (manual资质 → branch → manual评级 → branch → update 合格/已拒绝)`)
  }

  if (!(await workflowExists(token, WORKFLOW_CAPA))) {
    const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
      title: WORKFLOW_CAPA, enabled: true, type: 'collection',
      config: { collection: 'srm_score_cards', mode: 1 },
    }) as { id: number }
    await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
    await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
    const condition = await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '加权总分是否低于60', type: 'condition',
      config: { engine: 'basic', rejectOnFalse: false, calculation: { calculator: 'lt', operands: ['{{$context.data.total_score}}', 60] } },
    }) as { id: number }
    await dataOf(token, 'POST', '/api/flow_nodes:create', {
      workflow: workflow.id, title: '自动发起整改单', type: 'create', upstreamId: condition.id, branchIndex: 1,
      config: {
        collection: 'srm_capas',
        params: {
          values: {
            supplier_id: '{{$context.data.supplier_id}}',
            source: 'performance',
            title: '绩效评分D级·自动整改',
            description: '{{$context.data.period}} 考核加权总分低于60，触发自动整改流程',
            status: 'initiated',
            owner: '采购部',
          },
        },
      },
    })
    console.log(`nocobase-h4: workflow "${WORKFLOW_CAPA}" created (condition total<60 → create CAPA)`)
  }
}

async function workflowExists(token: string, title: string): Promise<boolean> {
  // dataOf already unwraps the wire `data` slot to the row array.
  const rows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: title } }))}&pageSize=1`) as Array<{ id: number }> | null
  return (rows?.length ?? 0) > 0
}

/** Ids of every workflow carrying this title (duplicate-tolerance: >1 means a past run double-created). */
async function workflowIds(token: string, title: string): Promise<number[]> {
  const rows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: title } }))}&pageSize=100`) as Array<{ id: number }> | null
  return (rows ?? []).map(row => row.id)
}

// ─── v2 page factory (E1 table spine + F1 kanban spine, uid prefix h4srm) ───

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'H4')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'H4')

function popupCreateForm(popup: any): { uid: string } | undefined {
  const tabs = popup?.subModels?.tabs
  const tabList = Array.isArray(tabs) ? tabs : tabs === undefined ? [] : [tabs]
  for (const tab of tabList) {
    const items = tab?.subModels?.grid?.subModels?.items
    const itemList = Array.isArray(items) ? items : items === undefined ? [] : [items]
    for (const item of itemList) {
      if (item?.use === 'CreateFormModel' && typeof item.uid === 'string') return { uid: item.uid }
    }
  }
  return undefined
}

function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('h4srm', 'i'))
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
        props: field.required === true ? { required: true } : {},
        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } } },
        subModels: {
          field: {
            use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
            props: field.options === undefined ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

function kanbanCard(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('h4srm', 'di'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'KanbanCardItemModel', subKey: 'item', subType: 'object', sortIndex: 1, props: {}, stepParams: {},
    subModels: {
      grid: {
        use: 'DetailsGridModel', subKey: 'grid', subType: 'object', sortIndex: 1,
        props: { layout: { version: 2, rows, rowGap: 0, colGap: 8, sizes: {}, rowOrder: rows.map(row => row.id) } },
        stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
        subModels: {
          items: fields.map((field, index) => ({
            uid: itemUids[index], use: 'DetailsItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
            stepParams: {
              fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
              detailItemSettings: { showLabel: { showLabel: true } },
            },
            subModels: {
              field: {
                use: displayModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 1,
                props: field.options === undefined ? {} : { options: field.options },
                stepParams: {
                  fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
                  popupSettings: { openView: { collectionName: collection, dataSourceKey: 'main' } },
                },
              },
            },
          })),
        },
      },
    },
  }
}

/** grid-uid → flowPage schemaUid ownership map (the lib's gridOwnerRoutes replica inline). */
async function gridOwners(token: string): Promise<Map<string, string>> {
  const routes = await listAllRoutes(token)
  const flowById = new Map(routes.map(route => [route.id, route]))
  const tabToFlow = new Map<string, string>()
  for (const route of routes) {
    if (route.type !== 'tabs' || route.schemaUid == null) continue
    const parent = flowById.get(route.parentId ?? Number.NaN)
    if (parent?.type === 'flowPage') tabToFlow.set(route.schemaUid, parent.schemaUid ?? '')
  }
  const owners = new Map<string, string>()
  for (const row of await listModels(token)) {
    if (row?.use !== 'BlockGridModel') continue
    const owner = tabToFlow.get(String(row.parentId ?? ''))
    if (owner !== undefined) owners.set(String(row.uid), owner)
  }
  return owners
}

/**
 * The kept-page spine, batch- and page-scoped: one h4srm main block inside
 * THIS page's grid, plus this page's own Add-new popup carrying a
 * CreateFormModel and its submit action.
 */
async function pageComplete(token: string, spec: TablePageSpec | KanbanPageSpec, flow: RouteRow): Promise<boolean> {
  const rows = await listModels(token)
  const owners = await gridOwners(token)
  const ownedByPage = (row: FlowModelRow): boolean => owners.get(String(row.parentId ?? '')) === flow.schemaUid
  const mainUse = spec.kind === 'kanban' ? 'KanbanBlockModel' : 'TableBlockModel'
  const mains = rows.filter(row => row?.use === mainUse
    && row?.stepParams?.resourceSettings?.init?.collectionName === spec.collection
    && String(row.uid ?? '').startsWith('h4srm'))
  const hasMain = mains.some(ownedByPage)
  const addNew = rows.find(row => row.use === 'AddNewActionModel' && mains.some(main => main.uid === row.parentId && ownedByPage(main)))
  const popup = addNew === undefined ? null
    : await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(addNew.uid)}&subKey=page`)
  const form = popupCreateForm(popup)
  const stack: any[] = [popup]
  let hasSubmit = false
  while (stack.length > 0 && !hasSubmit) {
    const node = stack.pop()
    if (node === null || typeof node !== 'object') continue
    if (form !== undefined && node.uid === `submit-${form.uid}`) hasSubmit = true
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value)
      else if (value !== null && typeof value === 'object') stack.push(value)
    }
  }
  if (hasMain && hasSubmit) return true
  console.log(`nocobase-h4: page "${spec.title}" (${flow.schemaUid}) spine incomplete (main ${hasMain}, submit ${hasSubmit})`)
  return false
}

/** The 供应链 menu group row (created when absent, idempotent by title). */
async function ensureMenuGroup(token: string): Promise<{ id: number }> {
  const existing = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (existing !== undefined) {
    console.log(`nocobase-h4: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-h4: menu group "${MENU_GROUP.title}" created`)
  return { id: row.id }
}

/**
 * Create one v2 flowPage under the group. Unlike the F-series upgrades there
 * is no v1 predecessor to destroy — these pages are new, so the rollback
 * path is a pure teardown (--rollback).
 */
async function ensureV2Page(token: string, spec: TablePageSpec | KanbanPageSpec, groupId: number, sort: number): Promise<void> {
  const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await pageComplete(token, spec, flow))) {
      throw new Error(`v2 page "${spec.title}" is truncated; run with --rollback to tear the batch down and rebuild`)
    }
    console.log(`nocobase-h4: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first (this batch only owns flowPages)`)
  }
  const routeUid = withN17Prefix('h4srm', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('h4srm', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('h4srm', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('h4srm', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('h4srm', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  const mainUid = spec.kind === 'kanban' ? withN17Prefix('h4srm', 'kb') : withN17Prefix('h4srm', 'tb')
  const mainProps = spec.kind === 'kanban'
    ? { groupField: spec.groupField, groupOptions: spec.groupOptions, styleVariant: 'color', quickCreateEnabled: false, dragEnabled: true, sortField: 'sort' }
    : {}
  await save({
    uid: mainUid, use: spec.kind === 'kanban' ? 'KanbanBlockModel' : 'TableBlockModel',
    parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1, props: mainProps,
    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
  })

  if (spec.kind === 'table') {
    let sortIndex = 1
    for (const column of spec.columns) {
      const uid = withN17Prefix('h4srm', 'c')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: mainUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: column.options }) },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: column.options }) },
      })
      sortIndex += 1
    }
  }

  await save({
    uid: withN17Prefix('h4srm', 'fa'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 1,
    use: 'FilterActionModel', props: {},
    stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
  })
  await save({
    uid: withN17Prefix('h4srm', 'an'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 2,
    use: 'AddNewActionModel', props: {},
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
                    subModels: { grid: formGrid(spec.collection, spec.formFields) },
                  }],
                },
              },
            },
          }],
        },
      },
    },
  })
  await save({
    uid: withN17Prefix('h4srm', 'rf'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 3,
    use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })

  if (spec.kind === 'kanban') {
    const openView = { mode: 'drawer', size: 'medium', pageModelClass: 'ChildPageModel', collectionName: spec.collection, dataSourceKey: 'main' }
    const cardViewUid = withN17Prefix('h4srm', 'cva')
    await save({
      uid: cardViewUid, parentId: mainUid, subKey: 'cardViewAction', subType: 'object', sortIndex: 1,
      use: 'KanbanCardViewActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
    // W3-B1: kanban card drawers need the persisted page subtree too (the
    // load-only contract — the h4 整改跟踪 card drawer was a P0 ③-class hole).
    await dataOf(token, 'POST', '/api/flowModels:save', drawerPageTreeFor(cardViewUid, {
      collection: spec.collection,
      fields: spec.cardFields.map(field => ({ fieldPath: field.name, modelUse: displayModelFor(field.kind), ...(field.options === undefined ? {} : { options: field.options }) })),
      tabTitle: '详情',
    }))
    await save({
      uid: withN17Prefix('h4srm', 'qca'), parentId: mainUid, subKey: 'quickCreateAction', subType: 'object', sortIndex: 1,
      use: 'KanbanQuickCreateActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
    await save({ uid: withN17Prefix('h4srm', 'ci'), parentId: mainUid, ...kanbanCard(spec.collection, spec.cardFields) })
  } else {
    // W3-B1: row-detail triple on every fresh table (P0 root cause ① fix).
    await ensureTableRowDetail(token, mainUid, {
      collection: spec.collection,
      fields: spec.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined ? {} : { options: column.options }) })),
      tabTitle: '详情',
      actionsColumnSortIndex: spec.columns.length + 1,
    })
  }
  console.log(`nocobase-h4: v2 page "${spec.title}" created (/admin/${routeUid})`)
}

// ─── charts (F4 authoring channel; radar rides visual.mode='custom') ───

/** Resolve the BlockGrid uid of one v2 page. */
async function pageGridUid(token: string, pageTitle: string): Promise<string> {
  const routes = await listAllRoutes(token)
  const flow = routes.find(row => row.title === pageTitle && row.type === 'flowPage')
  if (flow === undefined) throw new Error(`v2 page "${pageTitle}" not found`)
  const tab = routes.find(row => row.parentId === flow.id && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error(`v2 page "${pageTitle}" has no tabs child row`)
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`)
  if (grid?.uid == null) throw new Error(`v2 page "${pageTitle}" grid not found`)
  return String(grid.uid)
}

const chartQueryOf = (row: FlowModelRow): any => row?.stepParams?.chartSettings?.configure?.query ?? {}
/** Measure aliases of one chart row (the persisted configure.query carries them; the visual block lives elsewhere in storage). */
const chartAliases = (row: FlowModelRow): Set<string> =>
  new Set((Array.isArray(chartQueryOf(row)?.measures) ? chartQueryOf(row).measures : []).map((measure: any) => String(measure?.alias ?? '')))

/**
 * The radar's raw ECharts option (custom mode): five dimensions as radar
 * indicators, one series per考核期. Only ctx and standard JS — the runjs
 * allowlist carries no other globals.
 */
const RADAR_RAW = [
  'return {',
  '  tooltip: {},',
  '  legend: { bottom: 0 },',
  '  radar: { indicator: [',
  "    { name: '质量', max: 100 }, { name: '交期', max: 100 }, { name: '价格', max: 100 },",
  "    { name: '服务', max: 100 }, { name: '合规', max: 100 },",
  '  ] },',
  "  series: [{ type: 'radar', data: (ctx.data.objects || []).map((row) => ({",
  '    name: row.period,',
  '    value: [row.q, row.d, row.p, row.s, row.c],',
  '  })) }],',
  '}',
].join('\n')

async function ensureCharts(token: string): Promise<void> {
  const gridUid = await pageGridUid(token, '供应商绩效雷达')
  const rows = await listModels(token)
  const charts = rows.filter(row => row.use === 'ChartBlockModel' && row.parentId === gridUid)
  const targets = (query: any): { collection: boolean, periodDim: boolean } => ({
    collection: query?.resource?.collectionName === 'srm_score_cards'
      || (Array.isArray(query?.collectionPath) && query.collectionPath.join('.') === 'main.srm_score_cards'),
    periodDim: (Array.isArray(query?.dimensions) ? query.dimensions : []).some((dim: any) =>
      Array.isArray(dim?.field) ? dim.field[dim.field.length - 1] === 'period' : dim?.field === 'period'),
  })

  // Bar: 各考核期平均加权总分 (basic mode, the F4 wire). Identified by its
  // avgTotal measure alias — the visual block does not persist at
  // configure.visual, so the alias is the stable discriminator.
  const hasBar = charts.some(row => {
    const hit = targets(chartQueryOf(row))
    return hit.collection && hit.periodDim && chartAliases(row).has('avgTotal')
  })
  if (hasBar) {
    console.log('nocobase-h4: chart "各考核期平均总分" exists (kept)')
  } else {
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid },
      type: 'chart',
      settings: {
        query: {
          mode: 'builder',
          resource: { dataSourceKey: 'main', collectionName: 'srm_score_cards' },
          measures: [{ field: 'total_score', aggregation: 'avg', alias: 'avgTotal' }],
          dimensions: [{ field: 'period' }],
        },
        visual: { mode: 'basic', type: 'bar', mappings: { x: 'period', y: 'avgTotal' } },
      },
    })
    const blockUid = block?.uid ?? block?.tree?.uid
    if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for the bar chart: ${JSON.stringify(block).slice(0, 200)}`)
    console.log(`nocobase-h4: chart "各考核期平均总分" created (uid ${blockUid})`)
  }

  // Radar: 五维绩效雷达 (custom mode — the basic visual set has no radar, per
  // flow-engine chart-config CHART_BASIC_VISUAL_TYPES). Identified by the
  // five dimension aliases q/d/p/s/c.
  const isRadar = (row: FlowModelRow): boolean => {
    const hit = targets(chartQueryOf(row))
    const aliases = chartAliases(row)
    return hit.collection && hit.periodDim && ['q', 'd', 'p', 's', 'c'].every(alias => aliases.has(alias))
  }
  const radarRows = charts.filter(isRadar)
  // Self-heal past double-creations: keep the first, destroy the rest.
  for (const extra of radarRows.slice(1)) {
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(extra.uid))}`)
    console.log(`nocobase-h4: duplicate radar chart ${extra.uid} destroyed (self-heal)`)
  }
  const hasRadar = radarRows.length > 0
  if (hasRadar) {
    console.log('nocobase-h4: chart "五维绩效雷达" exists (kept)')
  } else {
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid },
      type: 'chart',
      settings: {
        query: {
          mode: 'builder',
          resource: { dataSourceKey: 'main', collectionName: 'srm_score_cards' },
          measures: [
            { field: 'score_quality', aggregation: 'avg', alias: 'q' },
            { field: 'score_delivery', aggregation: 'avg', alias: 'd' },
            { field: 'score_price', aggregation: 'avg', alias: 'p' },
            { field: 'score_service', aggregation: 'avg', alias: 's' },
            { field: 'score_compliance', aggregation: 'avg', alias: 'c' },
          ],
          dimensions: [{ field: 'period' }],
        },
        visual: { mode: 'custom', raw: RADAR_RAW },
      },
    })
    const blockUid = block?.uid ?? block?.tree?.uid
    if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for the radar chart: ${JSON.stringify(block).slice(0, 200)}`)
    console.log(`nocobase-h4: chart "五维绩效雷达" created (custom visual, uid ${blockUid})`)
  }
}

/** Every h4srm popup CreateFormModel carries its submit (deterministic submit-<formUid>). */
async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await listModels(token)
  const existingSubmits = new Set(rows.filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  const collections = new Set(PAGES.map(spec => spec.collection))
  // Only this batch owns forms on the srm_* collections, so the collection
  // set alone scopes the loop; other batches keep their own submits.
  const forms = rows.filter(row => row.use === 'CreateFormModel' && row.parentId == null
    && collections.has(String(row.stepParams?.resourceSettings?.init?.collectionName ?? '')))
  let added = 0
  for (const form of forms) {
    const submitUid = `submit-${form.uid}`
    if (existingSubmits.has(submitUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
    })
    added += 1
  }
  console.log(`nocobase-h4: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('h4srm')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
      destroyedModels += 1
    }
  }
  if (destroyedModels > 0) {
    const survivors = await listModels(token)
    const liveForms = new Set(survivors.filter(row => row.use === 'CreateFormModel').map(row => String(row.uid ?? '')))
    let swept = 0
    for (const row of survivors) {
      const uid = String(row.uid ?? '')
      if (uid.startsWith('n18ai-') && !liveForms.has(uid.slice('n18ai-'.length))) {
        await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
        swept += 1
      }
    }
    console.log(`nocobase-h4: ${destroyedModels} h4srm flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
  }
  for (const spec of PAGES) {
    const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    for (const tab of (await listAllRoutes(token)).filter(row => row.parentId === flow.id && row.type === 'tabs')) {
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
  }
  const group = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (group !== undefined) await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${group.id}`)
  for (const title of [WORKFLOW_ADMISSION, WORKFLOW_CAPA]) {
    for (const id of await workflowIds(token, title)) {
      await call(token, 'POST', `/api/workflows:destroy?filterByTk=${id}`)
    }
  }
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  console.log('nocobase-h4: rollback done — pages/group/workflows/collections removed (hub_inv_products columns retained)')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-h4: done (rollback)')
    return
  }
  const scorecardIndex = args.indexOf('--calc-scorecard')
  if (scorecardIndex >= 0) {
    // B8: the quarterly scorecard materializer lives in the h5 engine
    // (qm_inspections + receipts + PO lines + CAPAs are engine-owned reads).
    const { calcScorecard } = await import('./nocobase-h5-wms.mts')
    const now = new Date()
    const defaultPeriod = `${String(now.getFullYear())}Q${String(Math.floor(now.getMonth() / 3) + 1)}`
    await calcScorecard(token, String(args[scorecardIndex + 1] ?? defaultPeriod))
    return
  }
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const pages = only === undefined ? PAGES : PAGES.filter(spec => spec.title === only)
  if (pages.length === 0) throw new Error(`--only "${only}" matches no H4 page (${PAGES.map(spec => spec.title).join(' / ')})`)

  await ensureFoundationColumns(token)
  await ensureSupplierAdditiveColumns(token)
  await ensureCollections(token)
  // Seeds BEFORE workflows: first-run creates then never queue approval
  // tasks for seed rows; replays create nothing (business-key upserts).
  await seedFoundationSkus(token)
  await seedSrmRows(token)
  await ensureWorkflows(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of pages) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await ensureFormSubmits(token)
  await ensureCharts(token)
  console.log('nocobase-h4: done')
}

await main()
