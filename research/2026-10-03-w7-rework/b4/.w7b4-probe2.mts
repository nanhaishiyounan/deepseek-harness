/**
 * W7-B4 补充探针 v2（用 gridOwnerRoutes 修正页归属）：w9kpi 经营五看板
 * grid 顶层块顺序、ChartBlock 内容（statcard？图表？）、整改跟踪看板集合。
 */
import { gridOwnerRoutes, listFlowModels, listRoutes, signInWithRetry, type FlowModelRow } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const PAGES: Record<string, string> = {
  w9kpi7zv98whvfpv: '经营看板', w9kpijpea6p6exnm: '供应链看板', w9kpirvxmfx12l2i: '生产看板',
  w9kpiatwzi4gjbff: '库存看板', w9kpisldougonly: '应收应付对账', h4srm25tmro1wjuw: '整改跟踪',
}
const token = await signInWithRetry()
const models = await listFlowModels(token, 'w7b4-probe2b')
const routes = await listRoutes(token, 'w7b4-probe2b')
const gridOwners = gridOwnerRoutes(models, routes)
const byUid = new Map(models.map(row => [String(row.uid), row]))
const childrenOf = (uid: string): FlowModelRow[] =>
  models.filter(row => String(row.parentId ?? '') === uid)
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))

const pageOfUid = (uid: string): string | undefined => {
  let cur: string | undefined = uid
  const seen = new Set<string>()
  while (cur !== undefined && cur !== '' && !seen.has(cur)) {
    seen.add(cur)
    if (PAGES[cur] !== undefined) return cur
    const owner = gridOwners.get(cur)
    if (owner !== undefined) return PAGES[owner] !== undefined ? owner : undefined
    cur = String(byUid.get(cur)?.parentId ?? '') || undefined
  }
  return undefined
}

console.log('═══ w9kpi 页顶层块顺序（sort 升序 = 渲染序）═══')
for (const [pageUid, title] of Object.entries(PAGES)) {
  const grids = models.filter(row => row?.use === 'BlockGridModel' && pageOfUid(String(row.uid)) === pageUid)
  console.log(`── ${title} grids=${grids.length}`)
  for (const grid of grids) {
    for (const child of childrenOf(String(grid.uid))) {
      if (child.use === 'TableColumnModel') continue
      const props = (child.props ?? {}) as Record<string, any>
      const raw = String(((child.stepParams ?? {}) as Record<string, any>)?.chartSettings?.configure?.chart?.option?.raw ?? '')
      let extra = ''
      if (child.use === 'ChartBlockModel') {
        const query = ((child.stepParams ?? {}) as Record<string, any>)?.chartSettings?.configure?.query ?? {}
        extra = ` title=${JSON.stringify(props.title ?? '')} mode=${String(raw.includes('statcard') ? 'statcard' : (raw.length > 0 ? `raw(${raw.length})` : 'chart-option'))} measures=${JSON.stringify((query.measures ?? []).map((m: any) => `${m.field}:${m.aggregation}`))} filter=${JSON.stringify(query.filter ?? null)}`
      } else if (child.use === 'TableBlockModel') {
        extra = ` title=${JSON.stringify(props.title ?? '')}`
      }
      console.log(`  · sort=${String(child.sort)} ${String(child.use)}${extra}`)
    }
  }
}
console.log('\n═══ 库存看板 chart 块 raw 全文 ═══')
for (const row of models) {
  if (row?.use !== 'ChartBlockModel' || pageOfUid(String(row.uid)) !== 'w9kpiatwzi4gjbff') continue
  const raw = String(((row.stepParams ?? {}) as Record<string, any>)?.chartSettings?.configure?.chart?.option?.raw ?? '')
  console.log(`── title=${JSON.stringify((row.props ?? {}).title)} rawLen=${raw.length}`)
  if (raw.length > 0 && !raw.includes('statcard')) console.log(raw.slice(0, 600))
}
console.log('\n═══ 整改跟踪 KanbanBlockModel ═══')
for (const row of models) {
  if (row?.use !== 'KanbanBlockModel' || pageOfUid(String(row.uid)) !== 'h4srm25tmro1wjuw') continue
  console.log(`collection=${JSON.stringify(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName)}`)
  console.log(`props=${JSON.stringify(row.props)}`)
}
