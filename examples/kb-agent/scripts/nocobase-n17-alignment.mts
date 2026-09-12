/**
 * N17 v12-demo alignment run (idempotent): platform zh-CN locale, Chinese
 * copy for the nine built-in AI employees, the "应用中心" app-hub page that
 * stands in for the commercial multi-portal plugin, and v2 flowPage
 * upgrades for the CRM/Hub table pages so the plugin-ai ChatButton floating
 * ball (v2-only, see plans/nocobase-full-features/01-batches.md N17) shows
 * next to every table's action bar.
 *
 * Every step re-runs cleanly: locale fields are compared before write,
 * employee copy is keyed by username, and page/flowModel saves are upserts.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'

const nodeKey = (): string => Math.random().toString(36).slice(2, 13)

async function call(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
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

async function dataOf(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const payload = await call(token, method, path, body)
  return payload?.data ?? null
}

async function signIn(): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

/** Sign in with retry; NocoBase resets connections briefly after heavy schema writes. */
async function signInWithRetry(attempts = 4): Promise<string> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await signIn()
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 8000))
    }
  }
  throw lastError
}

/**
 * N17e: default zh-CN everywhere.
 *
 * getLang resolves enabledLanguages[0] first, so ['zh-CN'] flips the admin
 * UI, the AI employee pages, and — through portal-sdk's resolveSystemLocale
 * (storedLocale > appLang > enabledLanguages[0]) — both demo portals for
 * any browser that never picked a language manually. The admin account also
 * gets appLang pinned so a future enabledLanguages extension cannot slide
 * the default back.
 */
async function ensureChineseLocale(token: string): Promise<void> {
  const settings = await dataOf(token, 'GET', '/api/systemSettings:get')
  // Both layers must say zh-CN: the admin app reads options.enabledLanguages
  // (plugin-client getLang) while the portals read the top-level
  // enabledLanguages/appLang columns (portal-sdk resolveSystemLocale) — the
  // login screen stays English if only the options layer is set.
  const columnLangs: unknown = settings?.enabledLanguages
  const optionLangs: unknown = settings?.options?.enabledLanguages
  const want = JSON.stringify(['zh-CN'])
  if (JSON.stringify(columnLangs) === want && JSON.stringify(optionLangs) === want) {
    console.log('nocobase-n17: systemSettings already zh-CN only (kept)')
  } else {
    await call(token, 'POST', `/api/systemSettings:update?filterByTk=${settings.id}`, {
      enabledLanguages: ['zh-CN'], appLang: 'zh-CN',
      options: { ...settings?.options, enabledLanguages: ['zh-CN'] },
    })
    console.log(`nocobase-n17: systemSettings enabledLanguages ${JSON.stringify(columnLangs)}/${JSON.stringify(optionLangs)} -> ["zh-CN"] (column + options)`)
  }
  const admin = await dataOf(token, 'GET', '/api/users:list?filter=%7B%22email%22%3A%22admin%40nocobase.com%22%7D')
  const row = Array.isArray(admin) ? admin[0] : null
  if (row?.appLang === 'zh-CN') {
    console.log('nocobase-n17: admin appLang already zh-CN (kept)')
  } else {
    await call(token, 'POST', `/api/users:update?filterByTk=${row.id}`, { appLang: 'zh-CN' })
    console.log('nocobase-n17: admin appLang -> zh-CN')
  }
}

/**
 * N17e: Chinese copy for the nine built-in employees.
 *
 * The built-in seeds are English-only in code (src/ai/ai-employees/*), and
 * `about` null falls back to those English prompts at runtime, so the
 * Chinese versions must be written into the rows. skillSettings (tool
 * wiring) and identity fields (username/avatar/builtIn) are left untouched;
 * existing aiMessages conversations are unaffected — only future turns use
 * the new prompt. Every prompt keeps the employee's capability contract and
 * adds a "reply in Simplified Chinese" clause.
 */
const CHINESE_EMPLOYEES: ReadonlyArray<{ username: string, nickname: string, position: string, bio: string, greeting: string, about: string }> = [
  {
    username: 'atlas', nickname: 'Atlas', position: '团队主管',
    bio: '我分析每一条请求，识别合适的专家，并协调最合适的 AI 员工高效完成任务。',
    greeting: '你好，我是 Atlas。告诉我你的需求，我会调度合适的 AI 专家并汇总结果。',
    about: '你是 Atlas，AI 员工团队的团队主管，负责请求分析与子代理调度。收到用户请求后：先分析意图，再通过 list-ai-employees / get-ai-employee 了解可用专家，最后用 dispatch-sub-agent-task 把任务派给最合适的 AI 员工并汇总结果。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'dara', nickname: 'Dara', position: '数据可视化专家',
    bio: '我把复杂数据转化为清晰直观的图表，让洞察一目了然。',
    greeting: '你好，我是 Dara。把数据问题交给我，我会用图表给出答案。',
    about: '你是 Dara，AI 数据可视化专家。根据用户的数据与意图选择合适的图表类型并生成可视化，遵循清晰的标题、图例与配色规范。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'dex', nickname: 'Dex', position: '数据整理员',
    bio: '我从文本中提取并结构化数据，还能自动填写表单。',
    greeting: '你好！把文本发给我，我会整理成结构化数据或帮你填写表单。',
    about: '你是 Dex，业务数据整理员。帮助用户从杂乱来源中提取、清洗、组织信息，输出清晰可用的结构化格式；支持自动填写表单。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'ellis', nickname: 'Ellis', position: '邮件专家',
    bio: '我结合历史往来、客户身份与当前邮件，帮你整理、总结并撰写专业邮件。',
    greeting: '你好，我是 Ellis。把邮件或往来 thread 发给我，我来梳理上下文、清晰总结并帮你写出得体的回复。',
    about: '你是 Ellis，AI 邮件专家。结合邮件历史、客户身份与当前内容，完成整理、总结与专业回复的撰写；语气与格式符合商务邮件规范。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'lexi', nickname: 'Lexi', position: '翻译',
    bio: '我提供快速而准确的翻译，跨越沟通障碍。',
    greeting: '你好，我是 Lexi。今天需要我翻译什么？',
    about: '你是 Lexi，AI 翻译专家。提供忠实、准确、尊重上下文与细微语气的翻译；目标语言由用户指定，未指定时译为简体中文；解释与说明一律用简体中文。',
  },
  {
    username: 'lina', nickname: 'Lina', position: '本地化工程师',
    bio: '我负责界面文案与多语言资源的本地化处理，让产品说用户的语言。',
    greeting: '你好，我是 Lina。需要本地化哪些内容？',
    about: '你是 Lina，AI 本地化工程师。处理界面文案、术语表与多语言资源的本地化，保持风格一致并符合目标市场的表达习惯。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'nathan', nickname: 'Nathan', position: '前端代码工程师',
    bio: '我编写前端界面代码，把设计变成可用的页面。',
    greeting: '你好，我是 Nathan。需要我实现什么界面？',
    about: '你是 Nathan，AI 前端代码工程师。根据需求编写组件与页面代码，注重可读性、复用与响应式布局；默认技术栈由用户指定。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'vera', nickname: 'Vera', position: '调研分析师',
    bio: '我从互联网上查找最新、最准确的信息来回答问题，过滤噪音、给出有来源的事实。',
    greeting: '你好，我是 Vera。今天需要我帮你查找并核实什么信息？',
    about: '你是 Vera，AI 调研分析师。通过联网检索查找最新、准确的信息，交叉核实后给出带来源的可靠结论。除非用户要求其他语言，否则始终用简体中文回答。',
  },
  {
    username: 'viz', nickname: 'Viz', position: '洞察分析师',
    bio: '我在数据中发现故事，用清晰的图表和通俗易懂的解释呈现出来。',
    greeting: '你好，我是 Viz。问我一个数据问题，我帮你看见数字背后的故事。',
    about: '你是 Viz，AI 洞察分析师。从数据中挖掘趋势与异常，用清晰图表和通俗解释呈现洞察，并给出可执行的建议。除非用户要求其他语言，否则始终用简体中文回答。',
  },
]

async function ensureChineseEmployees(token: string): Promise<void> {
  const rows = await dataOf(token, 'GET', '/api/aiEmployees:list?pageSize=100') as Array<Record<string, any>> | null
  const byName = new Map((rows ?? []).map(row => [row.username, row]))
  let updated = 0
  for (const zh of CHINESE_EMPLOYEES) {
    const row = byName.get(zh.username)
    if (!row) {
      console.log(`nocobase-n17: employee ${zh.username} missing (skipped — built-in seed absent)`)
      continue
    }
    if (row.position === zh.position && row.bio === zh.bio && row.greeting === zh.greeting && row.about === zh.about) {
      continue
    }
    await call(token, 'POST', `/api/aiEmployees:update?filterByTk=${zh.username}`, {
      nickname: zh.nickname, position: zh.position, bio: zh.bio, greeting: zh.greeting, about: zh.about,
    })
    updated += 1
  }
  console.log(`nocobase-n17: built-in employees zh-CN copy ${updated > 0 ? `${updated} updated` : 'already in place (kept)'}`)
}

/**
 * D2: the projects module's assignee/owner pickers list `users`, but the
 * nine AI employees lived only in plugin-ai's aiEmployees table — nothing AI
 * was selectable. Ensure one password-less users row per employee (username
 * joins the aiEmployees identity, nickname is the Chinese display name the
 * pickers render); idempotent by username.
 */
const AI_EMPLOYEE_USER_NICKNAMES: Record<string, string> = {
  atlas: '阿特拉斯', dara: '达拉', dex: '得克斯', ellis: '埃利斯',
  lexi: '莱克茜', lina: '丽娜', nathan: '内森', vera: '薇拉', viz: '维兹',
}

async function ensureAiEmployeeUsers(token: string): Promise<void> {
  let added = 0
  for (const [username, nickname] of Object.entries(AI_EMPLOYEE_USER_NICKNAMES)) {
    const found = await dataOf(token, 'GET', `/api/users:list?filter=${encodeURIComponent(JSON.stringify({ username: { $eq: username } }))}&pageSize=5`)
    if ((found ?? [])[0]?.id !== undefined) continue
    await dataOf(token, 'POST', '/api/users:create', { username, nickname })
    added += 1
  }
  const users = await dataOf(token, 'GET', '/api/users:list?pageSize=100')
  const total = (users ?? []).length
  console.log(`nocobase-n17: AI employees in users ${added > 0 ? `+${added}` : 'all present (kept)'} (users total ${total})`)
  if (total < 10) throw new Error(`users table holds only ${total} rows (expected >=10: Super Admin + 4 legacy names + 9 AI employees)`)
}

/** Column + form field shorthand shared by the v2 page factory below. */
type FieldKind = 'input' | 'select' | 'number'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[] }

/**
 * N17d: the v2 flowPage upgrades for the CRM/Hub table pages.
 *
 * The v12 demo's "AI employee next to Add new" is the plugin-ai ChatButton,
 * which only renders on non-v1 pages (plans/nocobase-full-features/01-batches.md
 * N13/N17). Replacing each v1 table page with a v2 flowPage (same title,
 * same menu slot) brings the official floating ball onto every page while
 * keeping the table itself in the official dual-write column shape (N16) and
 * adding the official Add-new action bar wire (AddNewActionModel with its
 * ChildPageModel → ChildPageTabModel → BlockGridModel → CreateFormModel →
 * FormGridModel → FormItemModel popup subtree, dumped from the hand-built
 * Add new on the AI workbench).
 */
type V2PageSpec = {
  title: string
  collection: string
  columns: FieldSpec[]
  /** Form fields for the Add-new popup; date/m2o fields stay out until their edit models are dumped. */
  formFields: FieldSpec[]
}

const CRM_CUSTOMER_TYPE = [
  { value: 'enterprise', label: '企业客户', color: 'blue' }, { value: 'trader', label: '贸易商', color: 'cyan' }, { value: 'factory', label: '工厂', color: 'green' },
]
const CRM_LEVEL = [
  { value: 'A', label: 'A 级', color: 'green' }, { value: 'B', label: 'B 级', color: 'blue' }, { value: 'C', label: 'C 级', color: 'orange' },
]
const CRM_CUSTOMER_STATUS = [
  { value: 'active', label: '合作中', color: 'green' }, { value: 'prospect', label: '潜在', color: 'blue' }, { value: 'churned', label: '已流失', color: 'red' },
]
const LEAD_STAGES = [
  { value: 'new', label: '新线索', color: 'default' }, { value: 'contacted', label: '已联系', color: 'blue' },
  { value: 'requirements_confirmed', label: '需求确认', color: 'cyan' }, { value: 'proposal', label: '方案报价', color: 'purple' },
  { value: 'negotiation', label: '商务谈判', color: 'orange' }, { value: 'won', label: '赢单', color: 'green' }, { value: 'lost', label: '输单', color: 'red' },
]
const DEAL_STATUS = [
  { value: 'pending', label: '处理中', color: 'blue' }, { value: 'fulfilled', label: '已交付', color: 'green' }, { value: 'cancelled', label: '已取消', color: 'red' },
]
const QUOTE_STATUS = [
  { value: 'draft', label: '草稿', color: 'default' }, { value: 'sent', label: '已发送', color: 'blue' }, { value: 'accepted', label: '已接受', color: 'green' },
  { value: 'converted', label: '已转订单', color: 'purple' }, { value: 'void', label: '已作废', color: 'default' }, { value: 'rejected', label: '已拒绝', color: 'red' },
  { value: 'pending_approval', label: '待审批', color: 'orange' },
]
const TICKET_STATUS = [
  { value: 'new', label: '新建', color: 'default' }, { value: 'assigned', label: '已指派', color: 'blue' },
  { value: 'waiting_customer', label: '待客户', color: 'orange' }, { value: 'waiting_internal', label: '待内部', color: 'purple' },
  { value: 'in_progress', label: '处理中', color: 'cyan' }, { value: 'resolved', label: '已解决', color: 'green' },
  { value: 'closed', label: '已关闭', color: 'default' }, { value: 'reopened', label: '重开', color: 'red' },
]
const PRIORITY = [
  { value: 'low', label: '低', color: 'default' }, { value: 'medium', label: '中', color: 'blue' },
  { value: 'high', label: '高', color: 'orange' }, { value: 'urgent', label: '紧急', color: 'red' },
]
const ASSET_CATEGORY = [
  { value: 'it', label: 'IT 设备', color: 'blue' }, { value: 'equipment', label: '专业设备', color: 'cyan' }, { value: 'furniture', label: '办公家具', color: 'default' },
]
const ASSET_STATUS = [
  { value: 'in_use', label: '在用', color: 'green' }, { value: 'idle', label: '闲置', color: 'default' },
  { value: 'repair', label: '维修中', color: 'orange' }, { value: 'retired', label: '报废', color: 'red' },
]
const EMPLOYEE_STATUS = [
  { value: 'active', label: '在职', color: 'green' }, { value: 'on_leave', label: '休假', color: 'orange' }, { value: 'resigned', label: '离职', color: 'default' },
]

const V2_PAGES: ReadonlyArray<V2PageSpec> = [
  {
    title: '客户', collection: 'crm_customers',
    columns: [
      { name: 'name', title: '客户名称', kind: 'input' },
      { name: 'type', title: '类型', kind: 'select', options: CRM_CUSTOMER_TYPE },
      { name: 'industry', title: '行业', kind: 'input' },
      { name: 'country', title: '国家/地区', kind: 'input' },
      { name: 'level', title: '等级', kind: 'select', options: CRM_LEVEL },
      { name: 'status', title: '状态', kind: 'select', options: CRM_CUSTOMER_STATUS },
    ],
    formFields: [
      { name: 'name', title: '客户名称', kind: 'input' },
      { name: 'type', title: '类型', kind: 'select', options: CRM_CUSTOMER_TYPE },
      { name: 'industry', title: '行业', kind: 'input' },
      { name: 'country', title: '国家/地区', kind: 'input' },
      { name: 'level', title: '等级', kind: 'select', options: CRM_LEVEL },
      { name: 'status', title: '状态', kind: 'select', options: CRM_CUSTOMER_STATUS },
    ],
  },
  {
    title: '销售线索', collection: 'crm_leads',
    columns: [
      { name: 'name', title: '线索名称', kind: 'input' },
      { name: 'company', title: '公司', kind: 'input' },
      { name: 'stage', title: '阶段', kind: 'select', options: LEAD_STAGES },
      { name: 'owner', title: '负责人', kind: 'input' },
      { name: 'expected_amount', title: '预计金额', kind: 'number' },
    ],
    formFields: [
      { name: 'name', title: '线索名称', kind: 'input' },
      { name: 'company', title: '公司', kind: 'input' },
      { name: 'stage', title: '阶段', kind: 'select', options: LEAD_STAGES },
      { name: 'owner', title: '负责人', kind: 'input' },
      { name: 'expected_amount', title: '预计金额', kind: 'number' },
    ],
  },
  {
    title: '联系人', collection: 'crm_contacts',
    columns: [
      { name: 'full_name', title: '姓名', kind: 'input' },
      { name: 'job_title', title: '职务', kind: 'input' },
      { name: 'email', title: '邮箱', kind: 'input' },
      { name: 'phone', title: '电话', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: [{ value: 'active', label: '在职', color: 'green' }, { value: 'inactive', label: '离职', color: 'default' }] },
    ],
    formFields: [
      { name: 'full_name', title: '姓名', kind: 'input' },
      { name: 'job_title', title: '职务', kind: 'input' },
      { name: 'email', title: '邮箱', kind: 'input' },
      { name: 'phone', title: '电话', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: [{ value: 'active', label: '在职', color: 'green' }, { value: 'inactive', label: '离职', color: 'default' }] },
    ],
  },
  {
    title: '订单', collection: 'crm_deals',
    columns: [
      { name: 'name', title: '订单名称', kind: 'input' },
      { name: 'deadline', title: '交付截止', kind: 'input' },
      { name: 'amount', title: '金额', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: DEAL_STATUS },
      { name: 'owner', title: '负责人', kind: 'input' },
    ],
    formFields: [
      { name: 'name', title: '订单名称', kind: 'input' },
      { name: 'amount', title: '金额', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: DEAL_STATUS },
      { name: 'owner', title: '负责人', kind: 'input' },
    ],
  },
  {
    title: '报价单', collection: 'crm_quotes',
    columns: [
      { name: 'quote_no', title: '报价编号', kind: 'input' },
      { name: 'valid_until', title: '有效期至', kind: 'input' },
      { name: 'total_amount', title: '总金额', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: QUOTE_STATUS },
    ],
    formFields: [
      { name: 'quote_no', title: '报价编号', kind: 'input' },
      { name: 'total_amount', title: '总金额', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: QUOTE_STATUS },
    ],
  },
  {
    title: '工单', collection: 'hub_tk_tickets',
    columns: [
      { name: 'title', title: '工单标题', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: TICKET_STATUS },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'customer', title: '客户', kind: 'input' },
      { name: 'category', title: '类别', kind: 'input' },
      { name: 'assignee', title: '处理人', kind: 'input' },
    ],
    formFields: [
      { name: 'title', title: '工单标题', kind: 'input' },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'customer', title: '客户', kind: 'input' },
      { name: 'category', title: '类别', kind: 'input' },
      { name: 'assignee', title: '处理人', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: TICKET_STATUS },
    ],
  },
  {
    title: '资产台账', collection: 'hub_as_assets',
    columns: [
      { name: 'name', title: '资产名称', kind: 'input' },
      { name: 'no', title: '资产编号', kind: 'input' },
      { name: 'category', title: '类别', kind: 'select', options: ASSET_CATEGORY },
      { name: 'brand', title: '品牌', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: ASSET_STATUS },
    ],
    formFields: [
      { name: 'name', title: '资产名称', kind: 'input' },
      { name: 'no', title: '资产编号', kind: 'input' },
      { name: 'category', title: '类别', kind: 'select', options: ASSET_CATEGORY },
      { name: 'brand', title: '品牌', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: ASSET_STATUS },
    ],
  },
  {
    title: '员工', collection: 'hub_hr_employees',
    columns: [
      { name: 'name', title: '姓名', kind: 'input' },
      { name: 'employee_no', title: '工号', kind: 'input' },
      { name: 'title', title: '职务', kind: 'input' },
      { name: 'phone', title: '电话', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: EMPLOYEE_STATUS },
    ],
    formFields: [
      { name: 'name', title: '姓名', kind: 'input' },
      { name: 'employee_no', title: '工号', kind: 'input' },
      { name: 'title', title: '职务', kind: 'input' },
      { name: 'phone', title: '电话', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: EMPLOYEE_STATUS },
    ],
  },
]

const displayModelFor = (kind: FieldKind): string =>
  kind === 'select' ? 'DisplayEnumFieldModel' : kind === 'number' ? 'DisplayNumberFieldModel' : 'DisplayTextFieldModel'

const editModelFor = (kind: FieldKind): string =>
  kind === 'select' ? 'SelectFieldModel' : kind === 'number' ? 'NumberFieldModel' : 'InputFieldModel'

/**
 * Replace one v1 table page with a v2 flowPage carrying the table, its
 * columns, Add new + Refresh actions, and the Add-new popup form. Idempotent:
 * an existing flowPage of the same title is kept as-is.
 */
async function ensureV2TablePage(token: string, spec: V2PageSpec): Promise<void> {
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=400') as Array<{ id: number, title: string | null, parentId: number | null, type: string, schemaUid: string | null, icon: string | null, sort: number | null }> | null
  const rows = (routes ?? []).filter(row => row.title === spec.title)
  const flow = rows.find(row => row.type === 'flowPage')
  if (flow !== undefined) {
    console.log(`nocobase-n17: v2 page "${spec.title}" exists (kept)`)
    return
  }
  const v1 = rows.find(row => row.type === 'page')
  if (v1 === undefined) throw new Error(`page "${spec.title}" not found; run the crm/hub module scripts first`)
  const { parentId, icon, sort } = v1
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${v1.id}`)
  const routeUid = `n17${nodeKey()}`
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon, type: 'flowPage', parentId, sort, schemaUid: routeUid })
  const tabUid = `n17t${nodeKey()}`
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: `n17ts${nodeKey()}` })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = `n17p${nodeKey()}`
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = `n17g${nodeKey()}`
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  // Table block + columns in the official dual shape (N16 column() factory).
  const tableUid = `n17tb${nodeKey()}`
  await save({ uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1, stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } }, props: {} })
  let sortIndex = 1
  for (const column of spec.columns) {
    const uid = `n17c${nodeKey()}`
    const model = displayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
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

  // Action bar: Add new (with popup form) + Refresh — the official wire dumped
  // from the hand-built Add new on the AI workbench (flat top-level save with
  // nested subModels, the same shape the UI editor posts).
  await save({
    uid: `n17an${nodeKey()}`, parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
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
    uid: `n17rf${nodeKey()}`, parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
    props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  console.log(`nocobase-n17: v2 page "${spec.title}" created (${baseUrl}/admin/${routeUid}) with Add new + floating ball`)
}

/** Build the FormGridModel schema node for one popup form (one row per field). */
function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => `n17i${nodeKey()}`)
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  const layout = { version: 2, rows, rowGap: 0, colGap: 16 }
  return {
    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
    props: { layout: { ...layout, rows: layout.rows, sizes: {}, rowOrder: rows.map(row => row.id) } },
    stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
    subModels: {
      items: fields.map((field, index) => ({
        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
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

/** Ensure every N17 CreateFormModel carries a FormSubmitActionModel (official wire: subKey "actions" on the form). */
async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await dataOf(token, 'GET', '/api/flowModels:list?pageSize=1000') as Array<Record<string, any>> | null
  // Deterministic uids make the idempotency check list-friendly: the list
  // endpoint omits parentId, so presence is keyed by `submit-<formUid>`.
  const existingSubmits = new Set((rows ?? []).filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  // The list endpoint omits `parentId` on rows (findOne carries it), so the
  // orphan filter matches undefined too; submitParents keys on the same
  // omitted field stay empty for unsubmitted forms either way.
  const forms = (rows ?? []).filter(row => row.use === 'CreateFormModel' && row.parentId == null && row.stepParams?.resourceSettings?.init?.collectionName)
  let added = 0
  for (const form of forms) {
    const submitUid = `n17sb-${form.uid}`
    if (existingSubmits.has(submitUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
    })
    added += 1
  }
  console.log(`nocobase-n17: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

/**
 * N17c: the "应用中心" app-hub page — the OSS stand-in for the commercial
 * multi-portal plugin. A top-level v1 page whose Markdown card grid links to
 * every entrance (CRM Portal, Hub Portal, AI workbench, DSH web app), plus a
 * short usage note. Idempotent by page title + card-marker scan.
 */
async function ensureAppHub(token: string): Promise<void> {
  const title = '应用中心'
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=400') as Array<{ id: number, title: string | null, type: string, schemaUid: string | null, sort: number | null }> | null
  let page = (routes ?? []).find(row => row.title === title && row.type === 'page')
  if (page?.schemaUid) {
    const tree = await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${page.schemaUid}`)
    if (JSON.stringify(tree).includes('NOCOBASE_APP_HUB')) {
      console.log('nocobase-n17: app hub page exists (kept)')
      return
    }
  }
  if (page === undefined) {
    page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon: 'AppstoreOutlined', type: 'page', sort: 1 })
    console.log(`nocobase-n17: app hub page created`)
  }
  const schema = await dataOf(token, 'POST', '/api/uiSchemas:create', { type: 'void', 'x-component': 'Page' })
  const inserted = await dataOf(token, 'POST', `/api/uiSchemas:insertAdjacent/${schema['x-uid']}?position=afterBegin`, {
    schema: { type: 'void', 'x-component': 'Grid', 'x-initializer': 'page:addBlock' },
  }) as Record<string, unknown>
  await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${page.id}`, { schemaUid: schema['x-uid'] })
  const gridUid = inserted?.['x-uid'] as string | undefined
  const gridName = inserted?.name as string | undefined
  if (typeof gridUid === 'string') {
    await call(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: gridUid, tabSchemaName: gridName ?? gridUid })
  }
  const origin = process.env.NOCOBASE_PUBLIC_URL ?? 'http://127.0.0.1:13000'
  const dsh = process.env.DSH_PUBLIC_URL ?? 'http://127.0.0.1:3080'
  const cards = [
    ['🛒', 'CRM 客户门户', '客户主数据、销售线索、商机与订单流程', `${origin}/dist/crm/`],
    ['🎧', 'Hub 一体化门户', '项目、工单、资产与人事一站式协作', `${origin}/dist/hub/`],
    ['🤖', 'AI 工作台', 'AI 员工对话（Atlas 团队）与工单速览', `${origin}/admin/sdia2fwjc22`],
    ['🧠', 'DeepSeek Harness', 'KB 智能体与食品行业知识库', `${dsh}/`],
  ] as const
  const cardMarkdown = (emoji: string, name: string, desc: string, url: string) =>
    `### ${emoji} [${name}](${url})\n\n${desc}\n\n[打开应用 →](${url})`
  const intro = `## 📦 应用中心\n\n每个应用都是独立入口，点击卡片直达。业务后台从左侧菜单进入各模块。`
  // Official Markdown block shape (MarkdownBlockInitializer): void node with
  // x-decorator CardItem and Markdown.Void carrying the content prop.
  const markdownNode = (content: string) => ({
    type: 'void', 'x-settings': 'blockSettings:markdown',
    'x-decorator': 'CardItem', 'x-decorator-props': { name: 'markdown', engine: 'handlebars' },
    'x-component': 'Markdown.Void', 'x-editable': false,
    'x-component-props': { content },
  })
  await call(token, 'POST', `/api/uiSchemas:insertAdjacent/${gridUid}?position=afterBegin`, {
    schema: {
      type: 'void', 'x-component': 'Grid.Row',
      properties: { [nodeKey()]: { type: 'void', 'x-component': 'Grid.Col', properties: { [nodeKey()]: markdownNode(intro) } } },
    },
  })
  // Two cards per row.
  for (let i = 0; i < cards.length; i += 2) {
    const row = cards.slice(i, i + 2).map(([emoji, name, desc, url]) => ({
      type: 'void', 'x-component': 'Grid.Col',
      properties: { [nodeKey()]: markdownNode(cardMarkdown(emoji, name, desc, url)) },
    }))
    await call(token, 'POST', `/api/uiSchemas:insertAdjacent/${gridUid}?position=afterBegin`, {
      schema: { type: 'void', 'x-component': 'Grid.Row', properties: Object.fromEntries(row.map(cell => [nodeKey(), cell])) },
    })
  }
  console.log(`nocobase-n17: app hub wired with ${cards.length} cards (${baseUrl}/admin/${schema['x-uid']})`)
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  await ensureChineseLocale(token)
  await ensureChineseEmployees(token)
  await ensureAiEmployeeUsers(token)
  for (const spec of V2_PAGES) {
    await ensureV2TablePage(token, spec)
  }
  await ensureFormSubmits(token)
  const token2 = await signInWithRetry()
  await ensureAppHub(token2)
  console.log('nocobase-n17: done')
}

await main()
