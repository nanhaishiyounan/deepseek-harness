/**
 * W4-B4 structure governance: page retire/keep verdicts executed against the
 * live desktopRoutes tree (D6/D7). Retires the dead page 采购联系人（历史）
 * (hub_po_suppliers) and the hub-era aggregate 工作台 (hub_pj_tasks +
 * hub_tk_tickets) via the N14-safe order — CSV data archive first, tabs row
 * destroyed before the flowPage row (desktopRoutes:destroy cascades the
 * flowModels tree), full destroy ledger on disk. Renames 排产看板→排程明细 and
 * the N-3' term-spacing titles, and moves the v1 应用中心 page into the
 * 基础数据 group. Collections and their rows are never touched (invariant 3:
 * read-only archive).
 *
 * The verdict 台账 (v1 ×3, dead page, 13 duplicate groups, renames ×4, move ×1)
 * is the source of truth in this file and lands on disk as
 * w4-b4-verdicts.json on every --all run.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b4.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b4.mts --all
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b4.mts --assert   # B4 gate (setup verify)
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b4.mts --rollback # replay guidance + route restore
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { call, listFlowModels, listRoutes, signInWithRetry, type FlowModelRow, type RouteRow } from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-28-w4-completeness/', import.meta.url).pathname

// ─── the verdict 台账 (batch doc §2; every structural action derives from it) ───

const V1_VERDICTS = [
  {
    page: '任务甘特', schemaUid: 'zs3oqvlgqq0', verdict: '保留',
    reason: 'v2 无甘特块等价物（W3 D5：Gantt 仅 v1 通道）；hub_pj_tasks 数据被任务列表/看板/日历与甘特四视图共用',
    migration: '无结构改动；B5 归组项目管理组内排序',
  },
  {
    page: '排产甘特', schemaUid: '96yet9a0x45', verdict: '保留',
    reason: '甘特=时间轴视图（mfg_order_operations），与表格形态的排程明细职能互补非重复',
    migration: '无结构改动；同组「排产看板」改名「排程明细」完成分工消歧',
  },
  {
    page: '应用中心', schemaUid: 'c9c6wzppejk', verdict: '保留 + 归组',
    reason: 'app-hub 聚合页在线可用；顶级散页治理（N4）；与分类维护同入基础数据组（基础配置语义）',
    migration: 'desktopRoutes:update parentId → 基础数据组（B4 执行）',
  },
] as const

const RETIRE_SPECS = [
  {
    title: '采购联系人（历史）', schemaUid: 'n17f3gnpjv8rfd85', expectedTabs: 1,
    collections: [{ name: 'hub_po_suppliers', csv: 'w4-b4-retired-po-suppliers.csv' }],
    verdict: '退役', reason: '功能死页：名称自带「历史」、与采购管理组平行、无筛选无编辑零动线价值；真实供应商主数据在 srm_suppliers 域（w2 已归一）',
  },
  {
    title: '工作台', schemaUid: 'n17f34fr9khfzdhq', expectedTabs: 1,
    collections: [
      { name: 'hub_pj_tasks', csv: 'w4-b4-retired-workbench-tasks.csv' },
      { name: 'hub_tk_tickets', csv: 'w4-b4-retired-workbench-tickets.csv' },
    ],
    verdict: '退役', reason: 'hub 时代聚合页（tasks+tickets 双表堆叠）：与「AI 工作台」（AI 入口）、「工单」（业务列表）三重叠且无独有职能；hub_pj_tasks×2 / hub_tk_tickets×3 两组重复页随本项消解',
  },
] as const

const RENAMES = [
  { from: '排产看板', to: '排程明细', schemaUid: 'w5mfgp352sily7f', reason: '与 v1 排产甘特分工消歧：甘特=时间轴、明细=表格清单' },
  { from: 'AQL抽样方案', to: 'AQL 抽样方案', schemaUid: 'w8qm15rxe53v8hh', reason: 'N-3\' 术语空格规范（对齐 MO 执行视图基准格式）' },
  { from: 'MO执行视图', to: 'MO 执行视图', schemaUid: 'w6mfgmct2tf2braf', reason: 'N-3\' 术语空格规范（基线已达标则幂等跳过）' },
  { from: 'MRP快照', to: 'MRP 快照', schemaUid: 'w7mrpowj6l93nn0a', reason: 'N-3\' 术语空格规范（基线已达标则幂等跳过）' },
] as const

const MOVE_SPEC = {
  title: '应用中心', schemaUid: 'c9c6wzppejk', groupTitle: '基础数据',
  reason: '顶级散页归组（N4）；app-hub 聚合页与分类维护同组（基础配置语义）',
} as const

/** The 13 duplicate-collection groups (盘点 §1) with their B4 verdicts. */
const DUPLICATE_GROUPS = [
  { group: 'kpi_snapshots×4（经营/供应链/库存/生产看板）', verdict: '保留', reason: '设计使然：四页各按 kpi_code 子集出图（w9 工厂）；B3 已补图表标题定位差异' },
  { group: 'crm_payments×3（回款/销售仪表盘/应收应付对账）', verdict: '保留', reason: '列表明细/图表聚合/余额勾稽三种职能；B3 说明块已标注口径' },
  { group: 'srm_score_cards×3（评分卡/绩效雷达/季度物化）', verdict: '保留', reason: '表格录入/图表分析/物化快照三职能' },
  { group: 'hub_tk_tickets×3（AI 工作台/工单/工作台）', verdict: '退役「工作台」', reason: '三重叠零独有职能；AI 工作台保留（AI 入口）、工单保留（业务列表）' },
  { group: 'hub_pj_tasks×2（任务列表/工作台）', verdict: '随 hub_tk_tickets 项消解', reason: '工作台退役后任务列表唯一化' },
  { group: 'crm_customers×2（客户/客户仪表盘）', verdict: '保留', reason: '明细 vs 图表聚合；B3 说明块消歧' },
  { group: 'srm_suppliers×2（供应商档案/准入）', verdict: '保留', reason: '档案=主数据、准入=流程页（不同集合语义，盘点归组口径）' },
  { group: 'wms_lots×2 / pur_quotes×2 / pur_invoices×2 / mfg_orders×2 / mfg_order_operations×2 / so_orders×2', verdict: '保留', reason: '均为「主列表 + W3 看板/子表视图」形态分工（W3 结论：多视图并存是分层形态体系）' },
] as const

/** 维保/资产域页名核对（batch doc §2.4：无改动项则记录）。 */
const NAMING_CHECKS = [
  { domain: '维保/资产域', pages: ['资产台账', '维保记录', '供应商（资产组）'], result: '核对无改动项：名称为中文名词短语、无术语空格/英文混排问题；资产组三重供应商归组属 B5 菜单 IA（D8），非命名缺陷' },
] as const

// ─── psql (read-only: COPY ... TO STDOUT for the archive CSVs + counts) ───

type Psql = ReturnType<typeof psqlRunner>

function psqlRunner(): (sql: string) => string {
  const env = readFileSync(new URL('../../../platform/nocobase/.env', import.meta.url).pathname, 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const base = ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_NAME') ?? 'nocobase', '-t', '-A']
  const psqlEnv = { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }
  return (sql: string): string => {
    const run = spawnSync('psql', [...base, '-c', sql], { encoding: 'utf8', env: psqlEnv, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
    if (run.status !== 0) throw new Error(`psql failed: ${sql}\n${(run.stderr ?? '').slice(0, 300)}`)
    return (run.stdout ?? '')
  }
}

function psqlCount(psql: Psql, table: string): number {
  return Number(psql(`SELECT COUNT(*) FROM ${table};`).trim())
}

// ─── snapshots ───

const collectionOf = (row: FlowModelRow): string | null => row?.stepParams?.resourceSettings?.init?.collectionName ?? null

async function flatSubtreeOf(models: ReadonlyArray<FlowModelRow>, rootUids: ReadonlyArray<string>): Promise<FlowModelRow[]> {
  const byParent = new Map<string, FlowModelRow[]>()
  for (const m of models) {
    const key = String(m.parentId ?? '')
    const list = byParent.get(key) ?? []
    list.push(m)
    byParent.set(key, list)
  }
  const out: FlowModelRow[] = []
  const seen = new Set<string>()
  const queue = [...rootUids]
  while (queue.length > 0) {
    const cur = queue.shift() ?? ''
    for (const child of byParent.get(cur) ?? []) {
      const uid = String(child.uid)
      if (seen.has(uid)) continue
      seen.add(uid)
      out.push(child)
      queue.push(uid)
    }
  }
  return out
}

/** flowPage → set of table-block collections (the 盘点 duplicate-group 口径). */
async function pageTableCollections(routes: ReadonlyArray<RouteRow>, models: ReadonlyArray<FlowModelRow>): Promise<Map<string, Set<string>>> {
  const gridToPage = new Map<string, string>()
  const flowById = new Map(routes.map(r => [r.id, r]))
  for (const route of routes) {
    if (route.type !== 'tabs' || route.schemaUid == null) continue
    const flow = flowById.get(route.parentId ?? Number.NaN)
    if (flow?.type === 'flowPage') gridToPage.set(route.schemaUid, flow.schemaUid ?? '')
  }
  const rowById = new Map(models.map(m => [String(m.uid), m]))
  const ownerGridOf = (row: FlowModelRow): string | null => {
    let cur: FlowModelRow | undefined = row
    for (let hop = 0; hop < 12 && cur !== undefined; hop += 1) {
      const parentUid = String(cur.parentId ?? '')
      if (gridToPage.has(parentUid)) return parentUid
      cur = rowById.get(parentUid)
    }
    return null
  }
  const pages = new Map<string, Set<string>>()
  for (const row of models) {
    if (row.use !== 'TableBlockModel') continue
    const grid = ownerGridOf(row)
    const page = grid === null ? null : gridToPage.get(grid) ?? null
    if (page === null || page === '') continue
    const set = pages.get(page) ?? new Set<string>()
    const collection = collectionOf(row)
    if (collection !== null) set.add(collection)
    pages.set(page, set)
  }
  return pages
}

// ─── the retire protocol (N14-safe order) ───

type RetireLedgerEntry = {
  title: string
  schemaUid: string
  destroyedAt: string
  flowPageRow: Record<string, unknown>
  tabsRows: Array<Record<string, unknown>>
  flowModelsSubtreeCount: number
  csvArchives: Array<{ collection: string, file: string, dataRows: number, psqlCount: number }>
  note: string
}

async function retirePage(
  token: string,
  spec: (typeof RETIRE_SPECS)[number],
  routes: RouteRow[],
  models: FlowModelRow[],
  psql: Psql,
  dryRun: boolean,
): Promise<RetireLedgerEntry | null> {
  const flow = routes.find(r => r.type === 'flowPage' && r.schemaUid === spec.schemaUid)
  if (flow === undefined) {
    console.log(`retire "${spec.title}": flowPage row not found (already retired) — skip`)
    return null
  }
  const tabs = routes.filter(r => r.type === 'tabs' && r.parentId === flow.id)
  if (tabs.length !== spec.expectedTabs) throw new Error(`"${spec.title}" tabs 对账失败：期望 ${String(spec.expectedTabs)} 实得 ${String(tabs.length)}（N14：destroy 前必须对账）`)
  const subtree = await flatSubtreeOf(models, [spec.schemaUid, ...tabs.map(t => t.schemaUid ?? ''), ...tabs.map(t => t.tabSchemaName ?? '')])
  if (subtree.length === 0) throw new Error(`"${spec.title}" flowModels 子树为空，拒绝在未留档情况下删除`)
  // inbound-reference guard: no OTHER page's flowModels row may reference this uid
  const foreignRef = models.filter(m => !subtree.some(s => s.uid === m.uid) && String(m.uid) !== spec.schemaUid
    && JSON.stringify(m).includes(spec.schemaUid))
  if (foreignRef.length > 0) throw new Error(`"${spec.title}" 存在外部 flowModels 引用（${foreignRef.map(r => String(r.uid)).join(', ')}）——先清理入口再退役`)

  const csvArchives: RetireLedgerEntry['csvArchives'] = []
  for (const c of spec.collections) {
    const count = psqlCount(psql, c.name)
    if (!dryRun) {
      const csv = psql(`COPY (SELECT * FROM ${c.name} ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true);`)
      writeFileSync(`${RESEARCH_DIR}${c.csv}`, csv.endsWith('\n') ? csv : `${csv}\n`)
      const dataRows = Math.max(0, csv.trimEnd().split('\n').length - 1)
      if (dataRows !== count) throw new Error(`${c.name} CSV 行数对拍失败：csv=${String(dataRows)} psql=${String(count)}`)
      csvArchives.push({ collection: c.name, file: c.csv, dataRows, psqlCount: count })
      console.log(`retire "${spec.title}": archived ${c.name} → ${c.csv} (${String(dataRows)} rows, psql 对拍 ✓)`)
    } else {
      csvArchives.push({ collection: c.name, file: c.csv, dataRows: -1, psqlCount: count })
    }
  }
  if (dryRun) {
    console.log(`retire "${spec.title}" (dry-run): tabs=${String(tabs.length)} subtree=${String(subtree.length)} rows; would DELETE tabs id=${tabs.map(t => t.id).join(',')} then flowPage id=${String(flow.id)}`)
    return null
  }
  // subtree archive (rollback source) — one file covering both retired pages is written by the caller
  // destroy order: tabs first, then the flowPage row (desktopRoutes:destroy cascades the flowModels tree)
  for (const tab of tabs) {
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${String(tab.id)}`)
    console.log(`retire "${spec.title}": tabs row ${String(tab.id)} destroyed`)
  }
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${String(flow.id)}`)
  console.log(`retire "${spec.title}": flowPage row ${String(flow.id)} destroyed (cascade removed ${String(subtree.length)} flowModels rows)`)
  return {
    title: spec.title,
    schemaUid: spec.schemaUid,
    destroyedAt: new Date().toISOString(),
    flowPageRow: { ...flow },
    tabsRows: tabs.map(t => ({ ...t })),
    flowModelsSubtreeCount: subtree.length,
    csvArchives,
    note: '回滚 = 重放 nocobase-f3-hub-v2.mts（在旧标题下重建页与块）→ nocobase-w2-supplier.mts（retitle 采购联系人）；集合数据未动（只读留档）',
  }
}

// ─── renames + move (idempotent title/parentId updates) ───

async function applyRenames(token: string, routes: ReadonlyArray<RouteRow>, models: ReadonlyArray<FlowModelRow>, dryRun: boolean): Promise<string[]> {
  const lines: string[] = []
  for (const spec of RENAMES) {
    const row = routes.find(r => r.type === 'flowPage' && r.schemaUid === spec.schemaUid)
    if (row === undefined) { lines.push(`rename ${spec.from}→${spec.to}: row not found (uid ${spec.schemaUid}) — FAIL`); continue }
    // the sidebar renders the RootPageModel title, not the desktopRoutes row:
    // both must flip together or the menu keeps the old name (双通道漂移)
    const root = models.find(m => m.use === 'RootPageModel' && String(m.parentId) === spec.schemaUid)
    const rootTitle = root?.props != null && typeof root.props === 'object' && 'title' in root.props ? String((root.props as Record<string, unknown>).title) : null
    if (row.title === spec.to && rootTitle === spec.to) { lines.push(`rename ${spec.from}→${spec.to}: already "${spec.to}" (route + RootPageModel) — skip`); continue }
    if (!dryRun) {
      if (row.title !== spec.to) await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${String(row.id)}`, { title: spec.to })
      if (root !== undefined && rootTitle !== spec.to) {
        const props = { ...(root.props ?? {}), title: spec.to }
        const general = { ...((root.stepParams as Record<string, any> | undefined)?.pageSettings?.general ?? {}), title: spec.to }
        const stepParams = { ...((root.stepParams as Record<string, any> | undefined) ?? {}), pageSettings: { ...((root.stepParams as Record<string, any> | undefined)?.pageSettings ?? {}), general } }
        await call(token, 'POST', '/api/flowModels:save', { uid: root.uid, ...(root.parentId === undefined ? {} : { parentId: root.parentId }), ...(root.subKey === undefined ? {} : { subKey: root.subKey }), props, stepParams })
      }
    }
    lines.push(`rename ${row.title}→${spec.to}: ${dryRun ? 'would update' : 'updated'} route id ${String(row.id)}${root === undefined ? ' (RootPageModel missing!)' : ' + RootPageModel title'}`)
  }
  return lines
}

async function applyMove(token: string, routes: ReadonlyArray<RouteRow>, dryRun: boolean): Promise<string> {
  const page = routes.find(r => r.schemaUid === MOVE_SPEC.schemaUid)
  const group = routes.find(r => r.type === 'group' && r.title === MOVE_SPEC.groupTitle)
  if (page === undefined || group === undefined) return `move ${MOVE_SPEC.title}→${MOVE_SPEC.groupTitle}: page or group row not found — FAIL`
  if (page.parentId === group.id) return `move ${MOVE_SPEC.title}→${MOVE_SPEC.groupTitle}: already in group — skip`
  const siblings = routes.filter(r => r.parentId === group.id)
  const nextSort = Math.max(0, ...siblings.map(s => s.sort ?? 0)) + 1
  if (!dryRun) await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${String(page.id)}`, { parentId: group.id, sort: nextSort })
  return `move ${MOVE_SPEC.title}: parentId ${String(page.parentId)}→${String(group.id)} (sort ${String(nextSort)}) ${dryRun ? 'would update' : 'updated'}`
}

// ─── the B4 gate (setup verify) ───

async function assertB4(token: string): Promise<void> {
  const report: string[] = []
  const failures: string[] = []
  const routes = await listRoutes(token, 'W4-B4 assert')
  const models = await listFlowModels(token, 'W4-B4 assert')
  // v1 `page` rows carry tabs children too (任务甘特/应用中心/排产甘特), so the
  // legitimate tabs parents are flowPage ∪ page rows
  const flowIds = new Set(routes.filter(r => r.type === 'flowPage' || r.type === 'page').map(r => r.id))
  const groupIds = new Set(routes.filter(r => r.type === 'group').map(r => r.id))

  // A1 retired pages gone + type totals (206 = 16g+92f+95t+3p before → 202
  // = 16g+90f+93t+3p after B4 → 198 = 12g+90f+93t+3p after the B5 group
  // consolidation retired 采购/销售流程/协同办公/工单中心)
  const totals = new Map<string, number>()
  for (const r of routes) totals.set(r.type, (totals.get(r.type) ?? 0) + 1)
  for (const spec of RETIRE_SPECS) {
    const gone = !routes.some(r => r.schemaUid === spec.schemaUid || r.title === spec.title && r.type === 'flowPage')
    if (!gone) failures.push(`退役页仍在线：${spec.title} (${spec.schemaUid})`)
  }
  const expectTotals: Record<string, number> = { group: 12, flowPage: 90, tabs: 93, page: 3 }
  for (const [type, want] of Object.entries(expectTotals)) {
    const got = totals.get(type) ?? 0
    if (got !== want) failures.push(`desktopRoutes type=${type} 计数 ${String(got)} ≠ ${String(want)}`)
  }
  if (routes.length !== 198) failures.push(`desktopRoutes 总行数 ${String(routes.length)} ≠ 198（B4 后 202 − B5 删 4 组）`)
  report.push(`routes=${String(routes.length)} types=${JSON.stringify(Object.fromEntries(totals))}`)

  // A2 the 采购 group is destroyed by the B5 consolidation (it stayed empty
  // through B4; B5 owns the migrate-first destroy). Defense in depth: if it
  // somehow reappears, it must be childless.
  const caiGou = routes.find(r => r.type === 'group' && r.title === '采购')
  if (caiGou !== undefined) {
    failures.push('「采购」空组应已由 B5 删除')
    if (routes.some(r => r.parentId === caiGou.id)) failures.push('「采购」组仍有子页')
  }

  // A3 rename titles live on BOTH channels: the desktopRoutes row and the
  // RootPageModel the sidebar renders from
  for (const spec of RENAMES) {
    const rows = routes.filter(r => r.title === spec.to)
    if (rows.length !== 1) failures.push(`改名后应恰有 1 行「${spec.to}」，实得 ${String(rows.length)}`)
    const root = models.find(m => m.use === 'RootPageModel' && String(m.parentId) === spec.schemaUid)
    const rootTitle = root != null && typeof root.props === 'object' && root.props !== null && 'title' in root.props ? String((root.props as Record<string, unknown>).title) : null
    if (rootTitle !== spec.to) failures.push(`RootPageModel 标题「${rootTitle ?? '(缺失)'}」≠「${spec.to}」（侧栏菜单将显示旧名）`)
  }
  if (routes.some(r => r.title === '排产看板')) failures.push('旧名「排产看板」仍存在')

  // A4 应用中心 under 基础数据
  const appHub = routes.find(r => r.schemaUid === MOVE_SPEC.schemaUid)
  const baseGroup = routes.find(r => r.type === 'group' && r.title === MOVE_SPEC.groupTitle)
  if (appHub === undefined || baseGroup === undefined || appHub.parentId !== baseGroup.id) failures.push('应用中心未归入基础数据组')
  else if (routes.filter(r => r.parentId === baseGroup.id).length !== 2) failures.push('基础数据组子页数 ≠ 2（分类维护+应用中心）')

  // A5 CSV archives reconcile with psql counts
  const psql = psqlRunner()
  for (const spec of RETIRE_SPECS) {
    for (const c of spec.collections) {
      let csvText = ''
      try { csvText = readFileSync(`${RESEARCH_DIR}${c.csv}`, 'utf8') } catch { failures.push(`留档 CSV 缺失：${c.csv}`); continue }
      const dataRows = Math.max(0, csvText.trimEnd().split('\n').length - 1)
      const count = psqlCount(psql, c.name)
      if (dataRows !== count) failures.push(`${c.name} CSV 行数 ${String(dataRows)} ≠ psql ${String(count)}`)
    }
  }
  report.push('csv 对拍 3 集合 ok')

  // A6 v1 pages stay online; the retired tabs' surface is gone (call() throws on
  // non-200, so a 404 is the pass signal for the retired surfaces)
  for (const v1 of V1_VERDICTS) {
    try {
      const probe = await call(token, 'GET', `/api/uiSchemas:getProperties?resourceIndex=${v1.schemaUid}`)
      if (probe?.data == null) failures.push(`v1 页 ${v1.page} getProperties 返回空数据`)
    } catch (error) {
      failures.push(`v1 页 ${v1.page} getProperties 请求失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const spec of RETIRE_SPECS) {
    let stillResolves = false
    try {
      const surface = await call(token, 'GET', `/api/flowSurfaces:get?uid=${spec.schemaUid}`)
      stillResolves = surface?.data != null && surface?.data?.uid === spec.schemaUid
    } catch { /* HTTP non-200 is the retired-page pass signal */ }
    if (stillResolves) failures.push(`退役页 ${spec.title} 的 flowSurface 仍可解析（树未清）`)
  }
  report.push('v1 3 页在线 + 退役 surface 已清')

  // A7 zero orphans: every tabs row parents to a live flowPage; every flowPage parents to a live group or top
  for (const r of routes) {
    if (r.type === 'tabs' && !flowIds.has(r.parentId ?? Number.NaN)) failures.push(`孤儿 tabs 行 ${String(r.id)}（parentId=${String(r.parentId)}）`)
    if (r.type === 'flowPage' && r.parentId != null && !groupIds.has(r.parentId)) failures.push(`孤儿 flowPage 行 ${r.title}（parentId=${String(r.parentId)}）`)
  }
  report.push('orphan tabs/flowPage = 0')

  // A8 duplicate-group dissipation counts (table-block 口径, 盘点 §1 同口径)
  const pageCollections = await pageTableCollections(routes, models)
  const pagesOf = (collection: string): number => [...pageCollections.entries()].filter(([, set]) => set.has(collection)).length
  const expectCounts: Array<[string, number]> = [['hub_tk_tickets', 2], ['hub_pj_tasks', 1], ['hub_po_suppliers', 0]]
  for (const [collection, want] of expectCounts) {
    const got = pagesOf(collection)
    if (got !== want) failures.push(`重复组计数 ${collection} 页数 ${String(got)} ≠ ${String(want)}`)
  }
  report.push('重复组计数 hub_tk=2 hub_pj=1 hub_po_suppliers=0')

  console.log(`w4-b4 assert: ${report.join(' · ')}`)
  if (failures.length > 0) {
    console.error(`w4-b4 assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w4-b4 assert: OK — 2 页退役（tabs 先删 N14 协议）+ 4 项改名 + 应用中心归组 + CSV 对拍 + 孤儿零 + 重复组消解')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const all = args.includes('--all')
  const doAssert = args.includes('--assert')
  const doRollback = args.includes('--rollback')
  if (args.length === 0 || (!dryRun && !all && !doAssert && !doRollback)) {
    console.error('usage: w4-heal-b4.mts --dry-run|--all|--assert|--rollback')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (doAssert) {
    await assertB4(token)
    return
  }
  if (doRollback) {
    const ledgerPath = `${RESEARCH_DIR}w4-b4-destroy-ledger.json`
    let ledger: { entries?: RetireLedgerEntry[] } = {}
    try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) } catch { /* no ledger, nothing to replay */ }
    console.log('w4-b4 rollback 通道（数据零丢失，集合未动）：')
    console.log('  1. 重放 nocobase-f3-hub-v2.mts —— 在旧标题下重建「工作台」「采购供应商」页与全部块树')
    console.log('  2. 重放 nocobase-w2-supplier.mts —— 将「采购供应商」retitle 为「采购联系人（历史）」')
    console.log('  3. 结构对账参考 destroy ledger:', ledgerPath, `（entries=${String(ledger.entries?.length ?? 0)}）`)
    console.log('  注意：B4 后 verify 的 missingV2Hub 断言与 B4 assert 会随重放翻转——回滚需同步回退 setup-nocobase.mts 的 B4 断言段')
    return
  }

  const psql = psqlRunner()
  const routes = await listRoutes(token, 'W4-B4')
  const models = await listFlowModels(token, 'W4-B4')
  const log: string[] = [`# w4-b4 structure governance ${dryRun ? 'dry-run' : 'run'} @ ${new Date().toISOString()}`]

  // 0. before snapshot + subtree archive
  writeFileSync(`${RESEARCH_DIR}w4-b4-routes-before.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), total: routes.length, data: routes }, null, 1)}\n`)
  if (!dryRun) {
    const subtrees: Record<string, FlowModelRow[]> = {}
    for (const spec of RETIRE_SPECS) {
      const flow = routes.find(r => r.type === 'flowPage' && r.schemaUid === spec.schemaUid)
      if (flow === undefined) continue
      const tabs = routes.filter(r => r.type === 'tabs' && r.parentId === flow.id)
      subtrees[spec.schemaUid] = await flatSubtreeOf(models, [spec.schemaUid, ...tabs.map(t => t.schemaUid ?? ''), ...tabs.map(t => t.tabSchemaName ?? '')])
    }
    writeFileSync(`${RESEARCH_DIR}w4-b4-retired-flowmodels.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), subtrees }, null, 1)}\n`)
    log.push(`snapshot: routes-before ${String(routes.length)} rows; retired flowModels subtrees archived`)
  } else {
    log.push(`snapshot: routes-before ${String(routes.length)} rows (subtree archive skipped in dry-run)`)
  }

  // 1. retire the two pages (CSV → reconcile → tabs → page row → ledger)
  const entries: RetireLedgerEntry[] = []
  for (const spec of RETIRE_SPECS) {
    const entry = await retirePage(token, spec, routes, models, psql, dryRun)
    if (entry !== null) entries.push(entry)
  }

  // 2. renames + 3. move (refresh routes between phases)
  let routesNow = dryRun ? routes : await listRoutes(token, 'W4-B4 post-retire')
  const modelsForRename = dryRun ? models : await listFlowModels(token, 'W4-B4 rename')
  log.push(...await applyRenames(token, routesNow, modelsForRename, dryRun))
  routesNow = dryRun ? routes : await listRoutes(token, 'W4-B4 post-rename')
  log.push(await applyMove(token, routesNow, dryRun))

  if (!dryRun) {
    // 4. after snapshot + diff digest + ledger
    const after = await listRoutes(token, 'W4-B4 after')
    writeFileSync(`${RESEARCH_DIR}w4-b4-routes-after.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), total: after.length, data: after }, null, 1)}\n`)
    const beforeIds = new Set(routes.map(r => r.id))
    const removed = routes.filter(r => !after.some(a => a.id === r.id)).map(r => `${r.type}:${r.title}`)
    const added = after.filter(a => !beforeIds.has(a.id)).map(r => `${r.type}:${r.title}`)
    const retitled = after.filter(a => routes.some(b => b.id === a.id && b.title !== a.title)).map(a => `${routes.find(b => b.id === a.id)?.title}→${a.title}`)
    const moved = after.filter(a => routes.some(b => b.id === a.id && b.parentId !== a.parentId)).map(a => `${a.title}→parent ${String(a.parentId)}`)
    log.push(`after: total ${String(routes.length)}→${String(after.length)} | removed [${removed.join(', ')}] | added [${added.join(', ')}] | retitled [${retitled.join(', ')}] | moved [${moved.join(', ')}]`)
    if (entries.length > 0) writeFileSync(`${RESEARCH_DIR}w4-b4-destroy-ledger.json`, `${JSON.stringify({ entries }, null, 1)}\n`)

    // 5. verdict 台账 (batch §3 deliverable)
    writeFileSync(`${RESEARCH_DIR}w4-b4-verdicts.json`, `${JSON.stringify({
      batch: 'W4-B4', writtenAt: new Date().toISOString(),
      v1Pages: V1_VERDICTS,
      retired: RETIRE_SPECS,
      renames: RENAMES.map(r => ({ ...r, applied: after.some(a => a.title === r.to) })),
      move: { ...MOVE_SPEC, applied: after.some(a => a.schemaUid === MOVE_SPEC.schemaUid && a.parentId === (after.find(g => g.type === 'group' && g.title === MOVE_SPEC.groupTitle)?.id ?? -1)) },
      duplicateGroups: DUPLICATE_GROUPS,
      namingChecks: NAMING_CHECKS,
      ledger: { file: 'w4-b4-destroy-ledger.json', entries: entries.length },
    }, null, 1)}\n`)
    log.push('verdicts: w4-b4-verdicts.json written')
  }

  const out = log.join('\n')
  console.log(out)
  if (!dryRun) writeFileSync(`${RESEARCH_DIR}w4-b4-governance-run.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
