/**
 * W7-B4 现场探针（一次性诊断，不改数据）：
 * 1) B1 22 页 enum 列的 (collection, field) → 字段 uiSchema.enum 现状（W4 旧映射 vs v3）；
 * 2) 看板/日历块 props 结构（块级 forge 化的改写入点）；
 * 3) B4 域表格页枚举列的取值域（补 STATUS_PALETTE 用）。
 */
import { dataOf, gridOwnerRoutes, listFlowModels, listRoutes, signInWithRetry, type FlowModelRow } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const B1_PAGES: Record<string, string> = {
  n17rwc527ujwt: '销售线索', n17sys042q2lz: '客户', n17c3lkyg9zjd6: '联系人', n17f2wwpqs60dtk: '产品与服务', n17f2jumvap76nm8: '客户仪表盘',
  w7mrp4w590rm0ws8: '销售订单', n17v6xfvzxoj0f: '报价单', n17vu68623sj9i: '订单', n17f2c15ji684n8g: '回款', n17f2utwb01mi3ha: '发票',
  n17f2y9wfrggxyo: '销售仪表盘', w3b3utj5a15khmq: '销售看板', w3b3x8ymuxey8q: '交期日历', w3b3ass8lwvxiy: '计划日历',
  w3pura0kyqfx4f9: '采购申请', w3purlvif0v23bun: '询价管理', w3pur9w1c3yg3rjd: '供应商报价', w3purb7o0r3yqi45: '比价表',
  w3puryzkva06iuhh: '采购订单', w3pur45681oxtcsi: '发票匹配', w3pur3an4pwnr1eo: '付款申请', w3b3x35bfqctwkn: '采购看板',
}
const B4_PAGES: Record<string, string> = {
  w9kpi7zv98whvfpv: '经营看板', w9kpijpea6p6exnm: '供应链看板', w9kpirvxmfx12l2i: '生产看板', w9kpiatwzi4gjbff: '库存看板', w9kpisldougonly: '应收应付对账',
  n17e1ilgn22ts32: '任务列表', n17e1kqp4orpph5: '项目', n17e1m63re4tgre8: '里程碑', n17etqhllqqa28: '工单', n17f38lga4ln4s65: '知识文章',
  w1w167h6joi0ck6: '审批中心', w3b4u2r9nnjqvi: '审批流配置',
  w3b3utj5a15khmq: '销售看板', w3b3x35bfqctwkn: '采购看板', w3b39xulomz8jj: '生产订单看板', w3b3uw3d0mrz1b: '质检看板', w8qm472nluqt32x: '处置看板', h4srm25tmro1wjuw: '整改跟踪', n17f12u108kzzyk1: '任务看板',
  w3b3x8ymuxey8q: '交期日历', w3b3ass8lwvxiy: '计划日历', n17f1ns70eshqwy: '任务日历',
}

const token = await signInWithRetry()
const models = await listFlowModels(token, 'w7b4-probe')
const routes = await listRoutes(token, 'w7b4-probe')
const gridOwners = gridOwnerRoutes(models, routes)
const byUid = new Map(models.map(row => [String(row.uid), row]))
const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)

function pageOf(uid: string, pages: Record<string, string>): string | undefined {
  let cur: string | undefined = uid
  const seen = new Set<string>()
  while (cur !== undefined && cur !== '' && !seen.has(cur)) {
    seen.add(cur)
    if (pages[cur] !== undefined) return cur
    const owner = gridOwners.get(cur)
    if (owner !== undefined) return pages[owner] !== undefined ? owner : undefined
    const row = byUid.get(cur)
    cur = row === undefined ? undefined : String(row.parentId ?? '')
  }
  return undefined
}

// ── 1) fields load ──
const fieldRows = await dataOf(token, 'GET', '/api/fields:list?pageSize=2000&sort=collectionName').catch(() => null) as Array<Record<string, any>> | null
if (!Array.isArray(fieldRows)) throw new Error('fields:list empty')
const fieldMeta = new Map<string, Array<Record<string, any>>>()
for (const row of fieldRows) {
  const col = String(row.collectionName ?? '')
  if (col === '') continue
  if (!fieldMeta.has(col)) fieldMeta.set(col, [])
  fieldMeta.get(col)!.push(row)
}

const collectEnumPairs = (pages: Record<string, string>) => {
  const pairs = new Map<string, { page: string, collection: string, fieldPath: string, propsOptions: unknown }>()
  for (const row of models) {
    if (row?.use !== 'TableColumnModel') continue
    const page = pageOf(String(row.uid), pages)
    if (page === undefined) continue
    const fieldRow = childrenOf(String(row.uid)).find(r => r.subKey === 'field')
    if (fieldRow === undefined || String(fieldRow.use ?? '') !== 'DisplayEnumFieldModel') continue
    const fieldPath = String(row?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName ?? row?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    if (collection === '' || fieldPath === '') continue
    pairs.set(`${collection}.${fieldPath}`, { page: pages[page]!, collection, fieldPath, propsOptions: (fieldRow.props ?? {}).options ?? null })
  }
  return pairs
}

console.log('═══ 1) B1 22 页 fieldEnum 现状（字段 uiSchema.enum vs 列 props.options）═══')
const b1Pairs = collectEnumPairs(B1_PAGES)
let b1Mismatch = 0
for (const [key, info] of b1Pairs) {
  const meta = fieldMeta.get(info.collection)?.find(f => f.name === info.fieldPath)
  const uiEnum = (meta?.uiSchema ?? {}).enum
  const propsEnum = info.propsOptions
  const compact = (list: unknown): string => {
    if (!Array.isArray(list)) return '∅'
    return list.map((e: any) => `${e.value}:${e.label}:${e.color}`).join(' | ')
  }
  const propStr = compact(propsEnum)
  const uiStr = compact(uiEnum)
  const diverged = propStr !== uiStr
  if (diverged) b1Mismatch++
  console.log(`${diverged ? '≠' : '='} ${key} [${info.page}]`)
  if (diverged) {
    console.log(`   props: ${propStr}`)
    console.log(`   uiSch: ${uiStr}`)
  }
}
console.log(`B1 enum pairs=${b1Pairs.size} diverged(uiSchema≠props 或无 uiSchema)=${b1Mismatch}`)

console.log('\n═══ 2) 看板/日历块 props 结构 ═══')
const shapeTargets: Array<[string, string, RegExp]> = [
  ['w3b3utj5a15khmq', '销售看板', /Kanban/],
  ['n17f12u108kzzyk1', '任务看板', /Kanban/],
  ['w8qm472nluqt32x', '处置看板', /Kanban|Chart/],
  ['w3b3x8ymuxey8q', '交期日历', /Calendar/],
  ['n17f1ns70eshqwy', '任务日历', /Calendar/],
  ['w3b3ass8lwvxiy', '计划日历', /Calendar/],
]
for (const [pageUid, title, useRe] of shapeTargets) {
  for (const row of models) {
    if (row?.use == null || !useRe.test(String(row.use))) continue
    if (pageOf(String(row.uid), { [pageUid]: title }) === undefined) continue
    console.log(`── ${title} ${row.use} ${String(row.uid)}`)
    console.log(`   stepParams=${JSON.stringify(row.stepParams ?? {}).slice(0, 700)}`)
    console.log(`   props=${JSON.stringify(row.props ?? {}).slice(0, 700)}`)
    for (const child of childrenOf(String(row.uid))) {
      console.log(`   · child ${child.use ?? child.subKey} props=${JSON.stringify(child.props ?? {}).slice(0, 300)} stepParams=${JSON.stringify(child.stepParams ?? {}).slice(0, 300)}`)
    }
  }
}

console.log('\n═══ 3) B4 域枚举值域（字段 uiSchema.enum 全量）═══')
const b4Collections = new Set<string>()
for (const info of collectEnumPairs(B4_PAGES).values()) b4Collections.add(info.collection)
for (const col of [...b4Collections].sort()) {
  for (const f of fieldMeta.get(col) ?? []) {
    const uiEnum = (f.uiSchema ?? {}).enum
    if (!Array.isArray(uiEnum) || uiEnum.length === 0) continue
    console.log(`${col}.${f.name} = ${uiEnum.map((e: any) => `${e.value}:${e.label}:${e.color}`).join(' | ')}`)
  }
}

console.log('\n═══ 4) B4 表格页列 props.options 现状（列头筛选源）═══')
for (const [key, info] of collectEnumPairs(B4_PAGES)) {
  const opts = info.propsOptions
  if (Array.isArray(opts)) console.log(`${key} [${info.page}] props=${opts.map((e: any) => `${e.value}:${e.label}:${e.color}`).join(' | ')}`)
}
