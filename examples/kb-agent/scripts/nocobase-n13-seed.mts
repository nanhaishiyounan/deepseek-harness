/**
 * N13 data widening: top up the core business tables so every module a user
 * can reach carries a realistic dataset (15-60 rows each) with rows tied to
 * the existing food-industry entities (ticket titles/customers and asset
 * names carry the same company vocabulary as the CRM seed).
 *
 * Idempotent by business unique key: existing rows are kept, only the gap up
 * to the per-table target is filled. Time span covers the last 90 days by
 * construction (dates are generated backwards from today).
 */
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'

async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`)
  return payload
}

async function dataOf(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const payload = await call(token, method, path, body)
  return payload?.data ?? null
}

async function signIn(): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error('sign-in returned no token')
  return token
}

const day = (offset: number): string => {
  const date = new Date(Date.now() - offset * 86_400_000)
  return date.toISOString().slice(0, 10)
}

/**
 * Per-table top-up generators. Each factory receives the referenced id maps
 * and an index, and returns a row carrying the table's unique key. Rows whose
 * unique key already exists are skipped, so replays only fill the gap.
 */
const COMPANIES = ['漯河宏发食品有限公司', '青岛远洋渔业集团有限公司', '佛山鲜之源食品贸易有限公司', '烟台北方果蔬合作社', '漳州蜜饯世家实业', '潍坊金穗面粉集团', '宁波海浦水产有限公司', '成都川味源调味品厂', '哈尔滨北纬冷冻食品', '广州茶里王饮品公司', '泉州豪客来休闲食品', '日照海青茶叶有限公司', '石家庄冀中乳品公司', '中山粤香腊味食品厂', '岳阳洞庭湖水产联社', '昆明菌菇山珍贸易']
const OWNERS = ['陈立群', '王雅雯', '刘志远', '赵敏', '孙浩', '周婷', '吴启明', '郑晓芳']
const LEAD_SOURCES = ['展会获客', '官网询盘', '老客户转介', '海关数据', '行业协会名录', '跨境电商平台']
const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']

type Factory = (ctx: { i: number }) => Record<string, unknown> | null

const TABLES: ReadonlyArray<{ collection: string; uniqueKey: string; target: number; factory: Factory }> = [
  {
    collection: 'crm_leads', uniqueKey: 'name', target: 30,
    factory: ({ i }) => ({
      name: `${COMPANIES[i % COMPANIES.length]}出口认证咨询-${day(88 - (i * 3) % 80)}`,
      company: COMPANIES[(i + 3) % COMPANIES.length],
      source: LEAD_SOURCES[i % LEAD_SOURCES.length],
      stage: LEAD_STAGES[i % LEAD_STAGES.length],
      owner: OWNERS[i % OWNERS.length],
      expected_amount: 30_000 + ((i * 7_300) % 220_000),
      expected_close_date: day(70 - (i * 2) % 60),
    }),
  },
  {
    collection: 'crm_customers', uniqueKey: 'name', target: 20,
    factory: ({ i }) => ({
      name: COMPANIES[(i + 4) % COMPANIES.length] + (i >= COMPANIES.length ? '分公司' : ''),
      type: ['factory', 'trader', 'retailer', 'catering'][i % 4],
      industry: ['休闲食品加工', '水产品出口贸易', '调味品制造', '乳制品生产', '茶叶出口', '冷冻食品'][i % 6],
      country: ['中国', '中国', '中国', '新加坡', '马来西亚'][i % 5],
      level: ['A', 'B', 'C'][i % 3],
      status: i % 7 === 0 ? 'inactive' : 'active',
    }),
  },
  {
    collection: 'hub_tk_tickets', uniqueKey: 'title', target: 40,
    // hub_tk_tickets.customer is a plain input string column (hub-modules
    // schema), not an association: pass the company name itself. An earlier
    // revision posted `{ id }` here, which Sequelize stringified into
    // "[object Object]" rows; repairTicketsCustomer below rewrites those.
    factory: ({ i }) => {
      const company = COMPANIES[i % COMPANIES.length]
      return {
        title: `${company}-${['标签合规', '冷链断链', '认证年审', '客户投诉', '物流延误', '配方申报'][i % 6]}工单-${1000 + i}`,
        customer: company,
        priority: ['low', 'medium', 'high', 'urgent'][i % 4],
        category: ['合规咨询', '质量异常', '物流异常', '客户服务'][i % 4],
        assignee: OWNERS[i % OWNERS.length],
        status: ['open', 'processing', 'resolved', 'closed'][i % 4],
        planned_resolve_at: day(30 - (i % 25)),
        is_overdue: i % 5 === 0,
      }
    },
  },
  {
    collection: 'hub_as_assets', uniqueKey: 'name', target: 24,
    factory: ({ i }) => ({
      name: `${['冷柜', '检测仪', '叉车', '封口机', '金属探测门', '温湿度记录仪'][i % 6]}-${String.fromCharCode(65 + (i % 26))}${200 + i}`,
      no: `AS-${2026}-${String(100 + i)}`,
      category: ['设备', '仪器', '车辆'][i % 3],
      brand: ['海尔', '安捷伦', '合力', '中德', '赛默飞'][i % 5],
      status: ['in_use', 'idle', 'repair', 'retired'][i % 4],
      purchase_date: day(720 - i * 12),
      warranty_until: day(-(i * 30)),
    }),
  },
]

/**
 * Rewrite hub_tk_tickets rows whose customer cell holds the stringified
 * "[object Object]" marker: the title prefix is `<company>-<kind>工单-<no>`
 * and no COMPANIES entry contains a dash, so the prefix names the company.
 */
async function repairTicketsCustomer(token: string): Promise<void> {
  const rows = await dataOf(token, 'GET', '/api/hub_tk_tickets:list?pageSize=500&filter=' + encodeURIComponent(JSON.stringify({ customer: { $eq: '[object Object]' } }))) as Array<{ id: number, title: string }> | null
  let repaired = 0
  for (const row of rows ?? []) {
    const company = COMPANIES.find(name => row.title.startsWith(`${name}-`))
    if (company === undefined) continue
    await dataOf(token, 'POST', `/api/hub_tk_tickets:update?filterByTk=${row.id}`, { customer: company })
    repaired += 1
  }
  console.log(`nocobase-n13-seed: ticket customer repair ${repaired > 0 ? `${repaired} row(s) fixed` : 'no broken rows (kept)'}`)
}

async function main(): Promise<void> {
  const token = await signIn()
  await repairTicketsCustomer(token)
  const ctx = { i: 0 }
  for (const table of TABLES) {
    const existing = new Set(((await dataOf(token, 'GET', `/api/${table.collection}:list?pageSize=500`)) ?? []).map((row: any) => String(row[table.uniqueKey])))
    let added = 0
    for (let i = 0; existing.size < table.target && i < table.target * 3; i++) {
      const row = table.factory({ ...ctx, i })
      if (row === null) continue
      const key = String(row[table.uniqueKey])
      if (existing.has(key)) continue
      try {
        await dataOf(token, 'POST', `/api/${table.collection}:create`, row)
        existing.add(key)
        added += 1
      } catch (error) {
        // Unique conflicts from a racing writer are fine; everything else stops the run loudly.
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('403') && !message.includes('unique')) throw error
      }
    }
    console.log(`nocobase-n13-seed: ${table.collection} +${added} (now ${existing.size}/${table.target})`)
  }
}

await main()
