/**
 * W4-B5 menu IA consolidation: 16 groups → 12 (batch doc 05-b5-nav-ia §2/D8).
 * Merges the dual-purchase/dual-sales groups, folds the planning trio into
 * 生产与计划, splits 协同办公 across 组织与系统/项目与协同, and retires the four
 * emptied groups (采购/销售流程/协同办公/工单中心). Every group destroy runs
 * the migrate-first protocol (invariant 6): pages movePage'd out, children
 * counted to zero, only then the group row destroyed — the group row carries
 * no flowModels tree, but the reconciliation discipline is kept uniform.
 *
 * Renames ride the B4 dual-channel rule: desktopRoutes.title AND the
 * RootPageModel props.title (+ stepParams.pageSettings.general.title) must
 * flip together or the sidebar keeps the old name. Group rows (schemaUid
 * null) have no RootPageModel — single channel there.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b5.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b5.mts --all
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b5.mts --assert   # B5 gate (setup verify)
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b5.mts --rollback # reverse-move guidance + 1-group drill
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { call, listFlowModels, listRoutes, signInWithRetry, type FlowModelRow, type RouteRow } from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-28-w4-completeness/', import.meta.url).pathname

// ─── the target IA (batch doc §2; the single source of truth for B5) ───
// sort 1–12 by business chain (§3.2 step 7), in-group order 单据→报表→配置.
// 排产甘特 (v1, absent from the doc table) sits right after 排程明细 — the
// gantt/明细 pairing D6 established. The three sale-calendar/dashboard pages
// the doc table omits trail the six listed ones.

type TargetGroup = { title: string, icon: string, sort: number, renameFrom?: string, pages: string[] }

const TARGET_GROUPS: TargetGroup[] = [
  { title: '采购管理', icon: 'ShoppingOutlined', sort: 1, pages: ['采购申请', '询价管理', '供应商报价', '比价表', '采购订单', '发票匹配', '付款申请', '采购看板'] },
  { title: '销售管理', icon: 'ShopOutlined', sort: 2, pages: ['销售订单', '报价单', '订单', '回款', '发票', '销售看板', '交期日历', '计划日历', '销售仪表盘'] },
  { title: '生产与计划', icon: 'ExperimentOutlined', sort: 3, renameFrom: '生产制造', pages: ['生产订单', 'MO 执行视图', '排程明细', '排产甘特', '生产订单看板', '领料单', '退料单', '报工记录', '完工单', 'BOM 管理', 'BOM 工序', '工作中心', '主生产计划', 'MRP 快照', '计划工作台', '车间终端'] },
  { title: '质量管理', icon: 'SafetyCertificateOutlined', sort: 4, pages: ['质检单', '检验读数', 'AQL 抽样方案', '处置看板', '质检看板', '季度绩效物化', '质检工作台'] },
  { title: '仓储管理', icon: 'DatabaseOutlined', sort: 5, pages: ['入库单', '出库单', '库存查询', '盘点管理', '移库管理', '预留管理', '补货预警', '库存流水', '月度收发存', '批次主数据', '仓库库区', '库位平面图', '盘点计划', '收货终端'] },
  { title: '供应链', icon: 'ClusterOutlined', sort: 6, pages: ['供应商档案', '供应商准入', '审核检查表', '审核评分录入', '绩效评分卡', '供应商绩效雷达', '证照效期预警', '整改跟踪'] },
  { title: '经营分析', icon: 'LineChartOutlined', sort: 7, pages: ['经营看板', '供应链看板', '生产看板', '库存看板', '应收应付对账'] },
  { title: '项目与协同', icon: 'ProjectOutlined', sort: 8, renameFrom: '项目管理', pages: ['任务列表', '任务看板', '任务甘特', '任务日历', '项目', '里程碑', '工单', '知识文章', '审批中心', '审批流配置'] },
  { title: '组织与系统', icon: 'UsergroupAddOutlined', sort: 9, renameFrom: '人事管理', pages: ['员工', '部门', '请假审批', '组织架构', '权限矩阵'] },
  { title: '基础数据', icon: 'BookOutlined', sort: 10, pages: ['分类维护', '应用中心'] },
  { title: 'CRM 客户', icon: 'UserOutlined', sort: 11, pages: ['销售线索', '客户', '联系人', '产品与服务', '客户仪表盘'] },
  { title: '资产管理', icon: 'HddOutlined', sort: 12, pages: ['资产台账', '维保服务商', '维保记录'] },
]

/** Groups emptied by the migrations and then destroyed (先迁后删, invariant 6). */
const RETIRED_GROUPS = ['采购', '销售流程', '协同办公', '工单中心'] as const

/** Top-level single page: AI 工作台 keeps its solo top slot as entry 0. */
const TOP_PAGE = { title: 'AI 工作台', schemaUid: 'n13ai2efgqippp44', icon: 'RobotOutlined', sort: 0 } as const

/** Page moves keyed by page title → target group title (doc §3.2 steps 2–4). */
const PAGE_MOVES: ReadonlyArray<{ page: string, from: string, into: string }> = [
  { page: '主生产计划', from: '销售管理', into: '生产与计划' },
  { page: 'MRP 快照', from: '销售管理', into: '生产与计划' },
  { page: '计划工作台', from: '销售管理', into: '生产与计划' },
  { page: '权限矩阵', from: '协同办公', into: '组织与系统' },
  { page: '审批中心', from: '协同办公', into: '项目与协同' },
  { page: '审批流配置', from: '协同办公', into: '项目与协同' },
  { page: '工单', from: '工单中心', into: '项目与协同' },
  { page: '知识文章', from: '工单中心', into: '项目与协同' },
  { page: '订单', from: '销售流程', into: '销售管理' },
  { page: '报价单', from: '销售流程', into: '销售管理' },
  { page: '回款', from: '销售流程', into: '销售管理' },
  { page: '发票', from: '销售流程', into: '销售管理' },
  { page: '销售仪表盘', from: '销售流程', into: '销售管理' },
]

/** Dual-channel page rename: N3 三重供应商消歧 (doc §3.3). */
const PAGE_RENAMES = [
  { from: '供应商', to: '维保服务商', schemaUid: 'n17f3t3gtwv502s', reason: '三重供应商消歧：资产组维保服务商（hub_as_vendors）≠ 供应链「供应商档案」（srm_suppliers）；「采购联系人（历史）」B4 已退役' },
] as const

/** Page-level icon fixes (N5: the leading-space icon breaks rendering). */
const PAGE_ICON_FIXES = [
  { title: '付款申请', icon: 'DollarOutlined', reason: "前导空格 ' DollarOutlined' → 'DollarOutlined'（N5 渲染失败风险）" },
] as const

/** Group icon rewrites beyond the renames (N6 dedup; ClusterOutlined already taken by 供应链). */
const GROUP_ICON_FIXES: ReadonlyArray<{ title: string, icon: string, reason: string }> = [
  { title: 'CRM 客户', icon: 'UserOutlined', reason: 'TeamOutlined → UserOutlined（N6：与人身组撞 icon）' },
  { title: '资产管理', icon: 'HddOutlined', reason: 'DatabaseOutlined → HddOutlined（N6：与仓储管理撞 icon）' },
  { title: '组织与系统', icon: 'UsergroupAddOutlined', reason: '文档 §3.3 给 ClusterOutlined 与供应链撞车——验收「12 组 icon 无重复」优先，改 UsergroupAddOutlined' },
]

/** 八角色 → 组 → 常用页（2 击可达映射表，B6 旅程验收的输入）。 */
const ROLE_MAP = [
  { role: '采购员', group: '采购管理', page: '采购订单', account: 'admin' },
  { role: '计划员', group: '生产与计划', page: '主生产计划', account: 'admin' },
  { role: '车间主任', group: '生产与计划', page: '生产订单', account: 'admin' },
  { role: '质检员', group: '质量管理', page: '质检单', account: 'qc_inspector' },
  { role: '仓管员', group: '仓储管理', page: '库存查询', account: 'admin' },
  { role: '销售', group: '销售管理', page: '销售订单', account: 'admin' },
  { role: '财务', group: '经营分析', page: '应收应付对账', account: 'admin' },
  { role: '管理员', group: '组织与系统', page: '权限矩阵', account: 'admin' },
] as const

// ─── helpers ───

const pageTitles = (): string[] => TARGET_GROUPS.flatMap(g => g.pages)

/** All live page rows (flowPage ∪ page — tabs excluded). */
const livePages = (routes: ReadonlyArray<RouteRow>): RouteRow[] => routes.filter(r => (r.type === 'flowPage' || r.type === 'page') && r.parentId != null)

/** Reconcile the TARGET_IA page universe against the live one (children 对账零丢失).
 * Runs both pre-migration (live still carries the pre-rename titles) and
 * post-migration (identity): live titles are canonicalized into the target
 * name space through PAGE_RENAMES before the diff. */
function reconcilePageUniverse(routes: ReadonlyArray<RouteRow>): string[] {
  const problems: string[] = []
  const expected = [...pageTitles(), TOP_PAGE.title]
  const dupExpected = expected.filter((t, i) => expected.indexOf(t) !== i)
  if (dupExpected.length > 0) problems.push(`TARGET_IA 页名重复：${dupExpected.join(', ')}`)
  const canon = (title: string): string => PAGE_RENAMES.find(r => r.from === title)?.to ?? title
  const live = routes.filter(r => r.type === 'flowPage' || r.type === 'page').map(r => canon(r.title ?? ''))
  const missing = expected.filter(t => !live.includes(t))
  if (missing.length > 0) problems.push(`目标 IA 页在 live 树缺失：${missing.join(', ')}`)
  const extra = live.filter(t => !expected.includes(t))
  if (extra.length > 0) problems.push(`live 树存在目标 IA 外的页：${extra.join(', ')}`)
  const dupLive = live.filter((t, i) => live.indexOf(t) !== i)
  if (dupLive.length > 0) problems.push(`live 页名重复：${dupLive.join(', ')}`)
  return problems
}

/** Resolve the current group row for a target group (by new title, else renameFrom). */
function groupRow(routes: ReadonlyArray<RouteRow>, target: TargetGroup): RouteRow | undefined {
  return routes.find(r => r.type === 'group' && (r.title === target.title || (target.renameFrom !== undefined && r.title === target.renameFrom)))
}

async function updateRoute(token: string, id: number, patch: Record<string, unknown>): Promise<void> {
  await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${String(id)}`, patch)
}

/** Dual-channel rename (B4 pattern): desktopRoutes row + RootPageModel the sidebar renders. */
async function renamePageDualChannel(token: string, routes: ReadonlyArray<RouteRow>, models: ReadonlyArray<FlowModelRow>, spec: (typeof PAGE_RENAMES)[number], dryRun: boolean, log: string[]): Promise<void> {
  const row = routes.find(r => r.schemaUid === spec.schemaUid && (r.type === 'flowPage' || r.type === 'page'))
  if (row === undefined) { log.push(`rename ${spec.from}→${spec.to}: row not found (uid ${spec.schemaUid}) — FAIL`); return }
  const root = models.find(m => m.use === 'RootPageModel' && String(m.parentId) === spec.schemaUid)
  const rootTitle = root?.props != null && typeof root.props === 'object' && 'title' in root.props ? String((root.props as Record<string, unknown>).title) : null
  if (row.title === spec.to && rootTitle === spec.to) { log.push(`rename ${spec.from}→${spec.to}: already applied (route + RootPageModel) — skip`); return }
  if (!dryRun) {
    if (row.title !== spec.to) await updateRoute(token, row.id, { title: spec.to })
    if (root !== undefined && rootTitle !== spec.to) {
      const props = { ...(root.props ?? {}), title: spec.to }
      const stepParamsRaw = (root.stepParams as Record<string, any> | undefined) ?? {}
      const general = { ...(stepParamsRaw.pageSettings?.general ?? {}), title: spec.to }
      const stepParams = { ...stepParamsRaw, pageSettings: { ...(stepParamsRaw.pageSettings ?? {}), general } }
      await call(token, 'POST', '/api/flowModels:save', { uid: root.uid, ...(root.parentId === undefined ? {} : { parentId: root.parentId }), ...(root.subKey === undefined ? {} : { subKey: root.subKey }), props, stepParams })
    }
  }
  log.push(`rename ${spec.from}→${spec.to}: ${dryRun ? 'would update' : 'updated'} route id ${String(row.id)}${root === undefined ? ' (RootPageModel missing!)' : ' + RootPageModel title'}`)
}

// ─── the migrate-first execution (doc §3.2) ───

async function runAll(token: string, dryRun: boolean): Promise<void> {
  const routes = await listRoutes(token, 'W4-B5')
  const models = await listFlowModels(token, 'W4-B5')
  const log: string[] = [`# w4-b5 menu IA consolidation ${dryRun ? 'dry-run' : 'run'} @ ${new Date().toISOString()}`]

  // 0. before snapshot + B4 dependency gate (doc §3.2 step 1 — abort on violation)
  writeFileSync(`${RESEARCH_DIR}w4-b5-routes-before.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), total: routes.length, data: routes }, null, 1)}\n`)
  const b4Gate: string[] = []
  const caiGou = routes.find(r => r.type === 'group' && r.title === '采购')
  if (caiGou !== undefined && routes.some(r => r.parentId === caiGou.id)) b4Gate.push('「采购」组非空（B4 依赖：其页应已退役）')
  if (routes.some(r => r.schemaUid === 'n17f34fr9khfzdhq')) b4Gate.push('「工作台」仍在线（B4 未完成）')
  if (routes.some(r => r.schemaUid === 'n17f3gnpjv8rfd85')) b4Gate.push('「采购联系人（历史）」仍在线（B4 未完成）')
  const appHub = routes.find(r => r.schemaUid === 'c9c6wzppejk')
  const baseGroupRow = routes.find(r => r.type === 'group' && r.title === '基础数据')
  if (appHub === undefined || baseGroupRow === undefined || appHub.parentId !== baseGroupRow.id) b4Gate.push('应用中心未在基础数据组（B4 未完成）')
  if (b4Gate.length > 0) throw new Error(`B4 依赖确认失败，中止：\n  - ${b4Gate.join('\n  - ')}`)
  const preUniverse = reconcilePageUniverse(routes)
  if (preUniverse.length > 0) throw new Error(`目标 IA 与 live 树对账失败，中止：\n  - ${preUniverse.join('\n  - ')}`)
  log.push(`gate: B4 依赖确认 ✓（采购组空/2 退役页不在/应用中心归组）；页面宇宙对账 ✓（${String(livePages(routes).length + 1)} 页含顶级）`)

  // 1. group renames first (moves reference the new titles)
  for (const target of TARGET_GROUPS) {
    if (target.renameFrom === undefined) continue
    const row = routes.find(r => r.type === 'group' && r.title === target.renameFrom)
    if (row === undefined) {
      const already = routes.find(r => r.type === 'group' && r.title === target.title)
      if (already === undefined) throw new Error(`组「${target.renameFrom}」与「${target.title}」均不存在`)
      log.push(`group rename ${target.renameFrom}→${target.title}: already applied — skip`)
      continue
    }
    if (!dryRun) await updateRoute(token, row.id, { title: target.title, icon: target.icon })
    log.push(`group rename ${target.renameFrom}→${target.title} (+icon ${target.icon}): ${dryRun ? 'would update' : `updated id ${String(row.id)}`}`)
  }
  let routesNow = dryRun ? routes : await listRoutes(token, 'W4-B5 post-group-rename')

  // 2. page moves (migrate before any destroy — invariant 6)
  for (const move of PAGE_MOVES) {
    const page = routesNow.find(r => r.title === move.page && (r.type === 'flowPage' || r.type === 'page'))
    const groupTarget = TARGET_GROUPS.find(g => g.title === move.into)
    const group = groupTarget === undefined ? undefined : groupRow(routesNow, groupTarget)
    if (page === undefined || group === undefined) { log.push(`move ${move.page}→${move.into}: page or group not found — FAIL`); continue }
    if (page.parentId === group.id) { log.push(`move ${move.page}→${move.into}: already in group — skip`); continue }
    if (!dryRun) await updateRoute(token, page.id, { parentId: group.id })
    log.push(`move ${move.page}: parentId ${String(page.parentId)}→${String(group.id)}（${move.from}→${move.into}）${dryRun ? ' would update' : ' updated'}`)
  }
  routesNow = dryRun ? routes : await listRoutes(token, 'W4-B5 post-move')

  // 3. children reconciliation then destroy the four emptied groups
  for (const title of RETIRED_GROUPS) {
    const group = routesNow.find(r => r.type === 'group' && r.title === title)
    if (group === undefined) { log.push(`destroy group「${title}」: already gone — skip`); continue }
    const children = routesNow.filter(r => r.parentId === group.id)
    if (children.length > 0 && !dryRun) throw new Error(`组「${title}」destroy 前对账失败：仍有 ${String(children.length)} 个子页（${children.map(c => c.title).join(', ')}）——先迁后删协议拒绝执行`)
    if (children.length > 0) { log.push(`destroy group「${title}」(dry-run): children=${String(children.length)} 待上方 move 全部落位后销毁`); continue }
    if (!dryRun) await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${String(group.id)}`)
    log.push(`destroy group「${title}」(id ${String(group.id)}): children=0 对账 ✓ — ${dryRun ? 'would destroy' : 'destroyed'}`)
  }
  routesNow = dryRun ? routes : await listRoutes(token, 'W4-B5 post-destroy')

  // 4. page rename (dual channel) + page icon fixes
  await renamePageDualChannel(token, routesNow, models, PAGE_RENAMES[0], dryRun, log)
  for (const fix of PAGE_ICON_FIXES) {
    const row = routesNow.find(r => r.title === fix.title && (r.type === 'flowPage' || r.type === 'page'))
    if (row === undefined) { log.push(`icon fix ${fix.title}: row not found — FAIL`); continue }
    if (row.icon === fix.icon) { log.push(`icon fix ${fix.title}: already ${fix.icon} — skip`); continue }
    if (!dryRun) await updateRoute(token, row.id, { icon: fix.icon })
    log.push(`icon fix ${fix.title}: ${JSON.stringify(String(row.icon ?? ''))}→${fix.icon} ${dryRun ? 'would update' : 'updated'}`)
  }
  routesNow = dryRun ? routes : await listRoutes(token, 'W4-B5 post-rename')

  // 5. group sort/icon sweep + top page slot + in-group page ordering
  for (const target of TARGET_GROUPS) {
    const row = groupRow(routesNow, target)
    if (row === undefined) { log.push(`group ${target.title}: row not found — FAIL`); continue }
    const wantedIcon = GROUP_ICON_FIXES.find(f => f.title === target.title)?.icon ?? target.icon
    if (row.title !== target.title || row.sort !== target.sort || row.icon !== wantedIcon) {
      if (!dryRun) await updateRoute(token, row.id, { title: target.title, sort: target.sort, icon: wantedIcon })
      log.push(`group ${target.title}: sort→${String(target.sort)} icon→${wantedIcon} ${dryRun ? 'would update' : 'updated'}`)
    }
    const currentName = (title: string): string => PAGE_RENAMES.find(r => r.to === title)?.from ?? title
    for (let i = 0; i < target.pages.length; i += 1) {
      const pageTitle = target.pages[i] as string
      // dry-run sees the pre-rename title; a live run has already flipped it
      const page = routesNow.find(r => (r.title === pageTitle || r.title === currentName(pageTitle)) && (r.type === 'flowPage' || r.type === 'page'))
      if (page === undefined) { log.push(`  order ${target.title}/${pageTitle}: not found — FAIL`); continue }
      const wantedParent = groupRow(routesNow, target)?.id
      if (page.sort !== i + 1 || page.parentId !== wantedParent) {
        if (!dryRun) await updateRoute(token, page.id, { sort: i + 1, ...(page.parentId === wantedParent ? {} : { parentId: wantedParent }) })
        log.push(`  order ${target.title}[${String(i + 1)}] ${pageTitle}: sort ${String(page.sort)}→${String(i + 1)}${page.parentId === wantedParent ? '' : ` parent→${target.title}`} ${dryRun ? 'would update' : 'updated'}`)
      }
    }
  }
  const top = routesNow.find(r => r.schemaUid === TOP_PAGE.schemaUid)
  if (top === undefined) throw new Error(`顶级页「${TOP_PAGE.title}」row not found`)
  if (top.sort !== TOP_PAGE.sort || top.icon !== TOP_PAGE.icon) {
    if (!dryRun) await updateRoute(token, top.id, { sort: TOP_PAGE.sort, icon: TOP_PAGE.icon })
    log.push(`top page ${TOP_PAGE.title}: sort→${String(TOP_PAGE.sort)} icon→${TOP_PAGE.icon} ${dryRun ? 'would update' : 'updated'}`)
  }

  if (!dryRun) {
    // 6. after snapshot + diff digest + terminal tree + role map
    const after = await listRoutes(token, 'W4-B5 after')
    writeFileSync(`${RESEARCH_DIR}w4-b5-routes-after.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), total: after.length, data: after }, null, 1)}\n`)
    const removed = routes.filter(r => !after.some(a => a.id === r.id)).map(r => `${r.type}:${r.title}`)
    const retitled = after.filter(a => routes.some(b => b.id === a.id && b.title !== a.title)).map(a => `${routes.find(b => b.id === a.id)?.title}→${a.title}`)
    const movedCount = after.filter(a => routes.some(b => b.id === a.id && b.parentId !== a.parentId)).length
    const iconed = after.filter(a => routes.some(b => b.id === a.id && b.icon !== a.icon)).length
    log.push(`after: total ${String(routes.length)}→${String(after.length)} | removed [${removed.join(', ')}] | retitled [${retitled.join(', ')}] | parentId moved ${String(movedCount)} rows | icon changed ${String(iconed)} rows`)

    writeFileSync(`${RESEARCH_DIR}w4-b5-menu-tree.txt`, renderMenuTree(after))
    writeRoleMap(after)
    log.push('evidence: w4-b5-routes-after.json · w4-b5-menu-tree.txt · w4-b5-role-map.md written')
  }

  const out = log.join('\n')
  console.log(out)
  if (!dryRun) writeFileSync(`${RESEARCH_DIR}w4-b5-run.txt`, `${out}\n`)
}

function renderMenuTree(routes: ReadonlyArray<RouteRow>): string {
  const lines = [`# w4-b5 terminal menu tree @ ${new Date().toISOString()}`, `total routes = ${String(routes.length)}`, '']
  const groups = routes.filter(r => r.type === 'group').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  const top = routes.filter(r => r.parentId === null && r.type !== 'group').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  for (const t of top) lines.push(`[top] ${t.title} (sort ${String(t.sort)} icon ${String(t.icon)})`)
  for (const g of groups) {
    lines.push(`[${String(g.sort)}] ${g.title} (icon ${String(g.icon)})`)
    for (const p of routes.filter(r => r.parentId === g.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
      lines.push(`   ${String(p.sort)}. ${p.title} [${p.type}]`)
    }
  }
  return `${lines.join('\n')}\n`
}

function writeRoleMap(routes: ReadonlyArray<RouteRow>): void {
  const groupOf = (title: string): RouteRow | undefined => routes.find(r => r.type === 'group' && r.title === title)
  const pageOf = (title: string): RouteRow | undefined => routes.find(r => r.title === title && (r.type === 'flowPage' || r.type === 'page'))
  const lines = [
    '# W4-B5 八角色 2 击可达映射表（角色→组→页）',
    '',
    '> 击数口径：登录后首屏点开一级组（第 1 击）→ 点击组内目标页（第 2 击）——常用页 ≤2 击可达。',
    '> 角色差异不建八棵菜单树（N-2\'）：member 权限裁剪（W3 83 集合授权）+ 域内默认过滤吸收；本表为导航结构论证，B6 旅程验收按表逐角色实走。',
    '',
    '| # | 角色 | 一级组（击1） | 组 sort | 常用页（击2） | 页 uid | 取证账号 |',
    '|---|---|---|---|---|---|---|',
  ]
  ROLE_MAP.forEach((r, i) => {
    const g = groupOf(r.group)
    const p = pageOf(r.page)
    lines.push(`| ${String(i + 1)} | ${r.role} | ${r.group} | ${g === undefined ? '?' : String(g.sort)} | ${r.page} | ${p?.schemaUid ?? '?'} | ${r.account} |`)
  })
  lines.push('', '## 12 组 → 角色覆盖（每组主角色）', '')
  lines.push('| 组 | 主角色 | 组内页数 |', '|---|---|---|')
  for (const g of TARGET_GROUPS) {
    const roles = [...new Set(ROLE_MAP.filter(r => r.group === g.title).map(r => r.role))].join('，') || '全员/辅助域'
    lines.push(`| ${g.title} | ${roles} | ${String(g.pages.length)} |`)
  }
  lines.push('', '## member 裁剪口径（W3 ACL 延续零回归）', '')
  lines.push('- 页级 rolesDesktopRoutes 绑定不随组迁移变化（绑定键 = desktopRouteId 页行 id）；qc_inspector 仅见授权域（质量管理等），管理组（组织与系统/基础数据）不可见。')
  lines.push('- 取证：w4-b5-member-acl.png（qc_inspector 登录侧栏）+ w4-b5-journey-r4-qc.png。')
  writeFileSync(`${RESEARCH_DIR}w4-b5-role-map.md`, `${lines.join('\n')}\n`)
}

// ─── the B5 gate (setup verify) ───

async function assertB5(token: string): Promise<void> {
  const report: string[] = []
  const failures: string[] = []
  const routes = await listRoutes(token, 'W4-B5 assert')
  const models = await listFlowModels(token, 'W4-B5 assert')
  const groups = routes.filter(r => r.type === 'group')
  const pageRows = routes.filter(r => r.type === 'flowPage' || r.type === 'page')

  // A1 twelve groups, none retired/empty/duplicate, sort 1..12 unique
  if (groups.length !== 12) failures.push(`组数 ${String(groups.length)} ≠ 12`)
  for (const title of RETIRED_GROUPS) {
    if (groups.some(g => g.title === title)) failures.push(`已退役组「${title}」仍在树中`)
  }
  for (const g of groups) {
    if (!routes.some(r => r.parentId === g.id)) failures.push(`空组「${g.title}」`)
  }
  const groupTitles = groups.map(g => g.title ?? '')
  const dupTitles = groupTitles.filter((t, i) => groupTitles.indexOf(t) !== i)
  if (dupTitles.length > 0) failures.push(`重复组名：${dupTitles.join(', ')}`)
  const sorts = groups.map(g => g.sort ?? -1)
  if (sorts.filter((s, i) => sorts.indexOf(s) !== i).length > 0) failures.push(`组 sort 重复：${JSON.stringify(sorts)}`)
  for (let i = 1; i <= 12; i += 1) {
    if (!sorts.includes(i)) failures.push(`组 sort ${String(i)} 缺失`)
  }
  report.push(`组=12 sort1-12 唯一`)

  // A2 top-level single page AI 工作台 (entry 0)
  const topPages = routes.filter(r => r.parentId === null && r.type !== 'group')
  if (topPages.length !== 1 || topPages[0]?.title !== TOP_PAGE.title) failures.push(`顶级页应唯一为「AI 工作台」，实得 ${topPages.map(t => t.title).join(', ')}`)
  else if (topPages[0]?.icon !== TOP_PAGE.icon) failures.push(`AI 工作台 icon ${String(topPages[0]?.icon)} ≠ ${TOP_PAGE.icon}`)
  report.push('顶级唯一 AI 工作台')

  // A3 page universe: zero lost, zero extra, exact group membership (doc §4 探针 1/2)
  for (const problem of reconcilePageUniverse(routes)) failures.push(`页面宇宙对账：${problem}`)
  const byTitle = new Map(pageRows.map(r => [r.title ?? '', r]))
  for (const target of TARGET_GROUPS) {
    const g = groups.find(x => x.title === target.title)
    if (g === undefined) { failures.push(`目标组「${target.title}」缺失`); continue }
    const kids = routes.filter(r => r.parentId === g.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    const kidTitles = kids.map(k => k.title ?? '')
    if (kidTitles.join('|') !== target.pages.join('|')) failures.push(`组「${target.title}」组内清单/顺序 ≠ 目标 IA：实得 [${kidTitles.join(' > ')}]`)
  }
  const spot: ReadonlyArray<[string, string]> = [
    ['主生产计划', '生产与计划'], ['MRP 快照', '生产与计划'], ['计划工作台', '生产与计划'],
    ['权限矩阵', '组织与系统'], ['应用中心', '基础数据'], ['维保服务商', '资产管理'],
    ['工单', '项目与协同'], ['审批中心', '项目与协同'],
    ['订单', '销售管理'], ['报价单', '销售管理'],
  ]
  for (const [pageTitle, groupTitle] of spot) {
    const page = byTitle.get(pageTitle)
    const g = groups.find(x => x.title === groupTitle)
    if (page === undefined || g === undefined || page.parentId !== g.id) failures.push(`「${pageTitle}」未归「${groupTitle}」组`)
  }
  report.push('93 页归属对账零丢失')

  // A4 icons: 12 unique non-empty group icons, no leading spaces, every page iconed
  const icons = groups.map(g => String(g.icon ?? ''))
  for (const g of groups) {
    if (g.icon == null || g.icon === '') failures.push(`组「${g.title}」icon 缺失`)
    if (typeof g.icon === 'string' && g.icon !== g.icon.trim()) failures.push(`组「${g.title}」icon 含前后空格（${JSON.stringify(String(g.icon))}）`)
  }
  const dupIcons = icons.filter((v, i) => v !== '' && icons.indexOf(v) !== i)
  if (dupIcons.length > 0) failures.push(`组 icon 重复：${[...new Set(dupIcons)].join(', ')}`)
  const iconlessPages = pageRows.filter(p => p.icon == null || String(p.icon).trim() === '')
  if (iconlessPages.length > 0) failures.push(`页 icon 缺失：${iconlessPages.map(p => p.title).join(', ')}`)
  const spaceIconPages = pageRows.filter(p => typeof p.icon === 'string' && String(p.icon) !== String(p.icon).trim())
  if (spaceIconPages.length > 0) failures.push(`页 icon 前后空格：${spaceIconPages.map(p => `${p.title}:${JSON.stringify(String(p.icon))}`).join(', ')}`)
  const pay = byTitle.get('付款申请')
  if (pay?.icon !== 'DollarOutlined') failures.push(`付款申请 icon ${JSON.stringify(String(pay?.icon ?? ''))} ≠ 'DollarOutlined'`)
  report.push('icon 12 组唯一全配 + 页全配无空格')

  // A5 route totals: 202 − 4 groups = 198
  const totals = new Map<string, number>()
  for (const r of routes) totals.set(r.type, (totals.get(r.type) ?? 0) + 1)
  const expectTotals: Record<string, number> = { group: 12, flowPage: 90, tabs: 93, page: 3 }
  for (const [type, want] of Object.entries(expectTotals)) {
    const got = totals.get(type) ?? 0
    if (got !== want) failures.push(`desktopRoutes type=${type} 计数 ${String(got)} ≠ ${String(want)}`)
  }
  if (routes.length !== 198) failures.push(`desktopRoutes 总行数 ${String(routes.length)} ≠ 198（202 − 4 组）`)
  report.push(`routes=198 types=${JSON.stringify(Object.fromEntries(totals))}`)

  // A6 dual-channel rename: the sidebar RootPageModel carries the new title
  for (const spec of PAGE_RENAMES) {
    const root = models.find(m => m.use === 'RootPageModel' && String(m.parentId) === spec.schemaUid)
    const rootTitle = root?.props != null && typeof root.props === 'object' && 'title' in root.props ? String((root.props as Record<string, unknown>).title) : null
    if (rootTitle !== spec.to) failures.push(`RootPageModel 标题「${rootTitle ?? '(缺失)'}」≠「${spec.to}」（侧栏菜单将显示旧名）`)
    if (routes.some(r => r.title === spec.from && (r.type === 'flowPage' || r.type === 'page'))) failures.push(`旧页名「${spec.from}」仍存在`)
  }
  report.push('双通道改名维保服务商 ✓')

  // A7 every page still resolves (迁移不破路由 — all 93 pages, tabs excluded)
  let badPages = 0
  for (const p of pageRows) {
    if (p.schemaUid == null) { failures.push(`页「${p.title}」无 schemaUid`); badPages += 1; continue }
    try {
      const probe = await call(token, 'GET', `/api/uiSchemas:getProperties?resourceIndex=${p.schemaUid}`)
      if (probe?.data == null) { failures.push(`页「${p.title}」getProperties 空数据`); badPages += 1 }
    } catch (error) {
      failures.push(`页「${p.title}」(${p.schemaUid}) 探测失败：${error instanceof Error ? error.message : String(error)}`)
      badPages += 1
    }
  }
  if (badPages === 0) report.push(`${String(pageRows.length)} 页 surface 探测全 200`)

  // A8 member ACL zero-regression spot check (page-level bindings survive the moves)
  const qcPage = byTitle.get('质检单')
  const matrixPage = byTitle.get('权限矩阵')
  if (qcPage !== undefined) {
    const bindings = await call(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: qcPage.id } }))}`) as { data?: Array<{ roleName?: string }> }
    const roles = (bindings?.data ?? []).map(r => String(r.roleName ?? ''))
    if (!roles.includes('member')) failures.push(`质检单菜单绑定缺 member（W3 ACL 回归）：${roles.join(',')}`)
  }
  if (matrixPage !== undefined) {
    const bindings = await call(token, 'GET', `/api/rolesDesktopRoutes:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ desktopRouteId: { $eq: matrixPage.id } }))}`) as { data?: Array<{ roleName?: string }> }
    const roles = (bindings?.data ?? []).map(r => String(r.roleName ?? ''))
    if (roles.includes('member')) failures.push(`权限矩阵菜单仍绑 member（admin-only 回归）`)
  }
  report.push('member ACL 绑定零回归')

  console.log(`w4-b5 assert: ${report.join(' · ')}`)
  if (failures.length > 0) {
    console.error(`w4-b5 assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w4-b5 assert: OK — 12 组 IA 达成（先迁后删 4 组 + 双通道改名 + icon/sort 全配 + 93 页可达 + member ACL 零回归）')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const all = args.includes('--all')
  const doAssert = args.includes('--assert')
  const doRollback = args.includes('--rollback')
  if (args.length === 0 || (!dryRun && !all && !doAssert && !doRollback)) {
    console.error('usage: w4-heal-b5.mts --dry-run|--all|--assert|--rollback')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (doAssert) {
    await assertB5(token)
    return
  }
  if (doRollback) {
    const before = JSON.parse(readFileSync(`${RESEARCH_DIR}w4-b5-routes-before.json`, 'utf8')) as { data?: RouteRow[] }
    const rows = before.data ?? []
    const reverseOf = (title: string): string | undefined => rows.find(r => r.title === title)?.parentId != null
      ? String(rows.find(r => r.title === title)?.parentId) : undefined
    console.log('w4-b5 rollback 通道（desktopRoutes:update 反向回写，全部原值在 w4-b5-routes-before.json）：')
    console.log('  1. 反向 movePage：13 页 parentId 回写原组（订单/报价单/回款/发票/销售仪表盘→销售流程；权限矩阵/审批中心/审批流配置→协同办公；工单/知识文章→工单中心；主生产计划/MRP 快照/计划工作台→销售管理）')
    console.log('  2. 重建 4 组：采购(sort15,ShoppingCartOutlined)/销售流程(sort6,DollarOutlined)/协同办公(sort16,TeamOutlined)/工单中心(sort9,CustomerServiceOutlined)，再回写子页')
    console.log('  3. 组名回写：生产与计划→生产制造 / 组织与系统→人事管理 / 项目与协同→项目管理；维保服务商→供应商（双通道：desktopRoutes + RootPageModel props.title + pageSettings.general.title）')
    console.log(`  4. sort/icon 原值对照：w4-b5-routes-before.json（${String(rows.length)} 行）`)
    console.log('  注意：回滚需同步回退 setup-nocobase.mts 的 B5 断言段与 w4-heal-b4.mts 的 B5 后基线（group 12→16、routes 198→202）。')
    console.log(`  示例（主生产计划 原父组 id）：${reverseOf('主生产计划') ?? '(before 快照缺失，先跑一次 --all 再回滚)'}`)
    return
  }
  await runAll(token, dryRun)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
