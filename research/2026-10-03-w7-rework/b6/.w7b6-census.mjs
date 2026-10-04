// W7-B6 census, rebuilt live — shared by the probe/shot/index trio. The B5
// code-drift rebuild rotated route uids after the audit snapshot was frozen,
// so walking snapshot uids lands on 404 stubs (three dead after-shots at the
// R0 point in time). The census now rebuilds from a live desktopRoutes:list
// dump every run; the snapshot's page ORDER survives only as this canonical
// title list, because the evidence filenames (NNN-title.png) and the B5_KINDS
// contract are numbered by it. Titles are display names, not route identity —
// uids are always the live ones; any title added to or removed from the route
// table fails loud instead of silently renumbering the evidence.
/** Canonical census order: 111 flowPage titles (audit menu-tree walk). */
export const CANON_TITLES = [
  '经营总览', 'AI 工作台', '销售线索', '客户', '联系人', '产品与服务', '客户仪表盘',
  '入库单', '出库单', '库存查询', '盘点管理', '移库管理', '预留管理', '补货预警', '库存流水',
  '月度收发存', '批次主数据', '仓库库区', '库位平面图', '盘点计划', '收货终端', '供应商档案',
  '供应商准入', '审核检查表', '审核评分录入', '绩效评分卡', '供应商绩效雷达', '证照效期预警',
  '整改跟踪', '分类维护', '生产订单', 'MO 执行视图', '排程明细', '生产订单看板', '领料单',
  '退料单', '报工记录', '工程变更单', '完工单', '配方版本与变更', 'BOM 管理', 'BOM 工序',
  '工作中心', '主生产计划', 'MRP 快照', '计划工作台', '车间终端', 'APS瓶颈与负荷',
  'APS what-if沙箱', '员工', '部门', '请假审批', '组织架构', '权限矩阵', '经营看板',
  '供应链看板', '生产看板', '库存看板', '应收应付对账', '财务工作台', '质检单', '检验读数',
  'AQL 抽样方案', '处置看板', '质检看板', '季度绩效物化', 'CCP监控配置', '质检工作台',
  'CCP监控记录', '检验工作台', '出厂检验报告', '资产台账', '设备台账', '维保服务商', '维保计划',
  '维保记录', '维保工单', '计量校准', '维保日历', '采购申请', '询价管理', '供应商报价', '比价表',
  '采购订单', '发票匹配', '付款申请', '采购看板', '销售订单', '商机管道', '报价单', '订单',
  '回款', '发票', '销售看板', '交期日历', '计划日历', '销售仪表盘', '任务列表', '任务看板',
  '任务日历', '项目', '里程碑', '工单', '知识文章', '审批中心', '审批流配置', '预警列表',
  '预警规则', '效期看板', '批次追溯', '召回管理',
]

/** The three v1 legacy pages (routes of type `page`), resolved live by title. */
export const V1_TITLES = ['应用中心', '排产甘特', '任务甘特']

/**
 * Rebuild the census from a live desktopRoutes dump.
 * @param {ReadonlyArray<{title?: unknown, type?: unknown, schemaUid?: unknown}>} routes raw desktopRoutes rows.
 * @returns {{pages: Array<{index: number, title: string, schemaUid: string, v1: boolean}>, flowPageCount: number}}
 * @throws {Error} on a missing/extra/duplicated canonical title or a title-less route row — census drift must stop the run, not renumber evidence.
 */
export function buildCensusFromRoutes(routes) {
  // Only flowPage/page rows carry page identity; tabs/group rows are
  // structural and may legitimately be untitled — they never enter the census.
  const pageRows = routes.filter((row) => row.type === 'flowPage' || row.type === 'page')
  const bad = pageRows.filter((row) => typeof row.title !== 'string' || row.title === '' || typeof row.schemaUid !== 'string' || row.schemaUid === '')
  if (bad.length > 0) throw new Error(`page rows without title/schemaUid: ${JSON.stringify(bad.slice(0, 3)).slice(0, 200)}`)
  const byTitle = new Map()
  for (const row of pageRows) {
    if (byTitle.has(row.title)) throw new Error(`duplicate route title ${row.title} (type ${String(row.type)}) — cannot resolve the census unambiguously`)
    byTitle.set(row.title, row)
  }
  const missing = CANON_TITLES.filter((title) => !byTitle.has(title) || byTitle.get(title).type !== 'flowPage')
  if (missing.length > 0) throw new Error(`canonical flowPage titles missing from live routes: ${JSON.stringify(missing)}`)
  const v1Missing = V1_TITLES.filter((title) => !byTitle.has(title) || byTitle.get(title).type !== 'page')
  if (v1Missing.length > 0) throw new Error(`canonical v1 page titles missing from live routes: ${JSON.stringify(v1Missing)}`)
  const flowLive = pageRows.filter((row) => row.type === 'flowPage')
  const extra = [...new Set(flowLive.map((row) => row.title))].filter((title) => !CANON_TITLES.includes(title))
  if (extra.length > 0) throw new Error(`live flowPage titles outside the census (add them to CANON_TITLES deliberately, evidence numbering shifts): ${JSON.stringify(extra)}`)
  const pages = [
    ...CANON_TITLES.map((title, i) => ({ index: i + 1, title, schemaUid: byTitle.get(title).schemaUid, v1: false })),
    ...V1_TITLES.map((title, i) => ({ index: CANON_TITLES.length + i + 1, title, schemaUid: byTitle.get(title).schemaUid, v1: true })),
  ]
  return { pages, flowPageCount: flowLive.length }
}

/** In-page liveness probe: the dead-route stub renders 「404 … Back Home」inside
 * the live app shell (sidebar and all), so a main-content selector alone cannot
 * tell a dead route from a light v1 page — and the v1 pages mount `main` late
 * enough that requiring it misfires. The stub copy decides dead; a non-empty
 * body decides rendered. hasMain is recorded as an observation only.
 * @returns {{live: boolean, is404Stub: boolean, hasMain: boolean}} */
export const LIVENESS_PROBE = `(() => {
  const text = document.body.innerText
  const is404Stub = text.includes('404') && text.includes('Back Home')
  const hasContent = text.trim().length > 10
  return { live: !is404Stub && hasContent, is404Stub, hasMain: document.querySelector('main') !== null }
})()`
