/**
 * W7-B4 探针 4：生产订单看板/质检看板 KanbanBlockModel（gridOwnerRoutes 修正）、
 * AI 工作台/经营总览块构成。
 */
import { gridOwnerRoutes, listFlowModels, listRoutes, signInWithRetry, type FlowModelRow } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const PAGES: Record<string, string> = {
  w3b39xulomz8jj: '生产订单看板', w3b3uw3d0mrz1b: '质检看板', n13ai2efgqippp44: 'AI 工作台', w6b9cdzrc2lst1dm: '经营总览',
}
const token = await signInWithRetry()
const models = await listFlowModels(token, 'w7b4-probe4')
const routes = await listRoutes(token, 'w7b4-probe4')
const gridOwners = gridOwnerRoutes(models, routes)
const byUid = new Map(models.map(row => [String(row.uid), row]))

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

for (const row of models) {
  if (row?.use !== 'KanbanBlockModel') continue
  const page = pageOfUid(String(row.uid))
  if (page === undefined) continue
  console.log(`${PAGES[page]} collection=${JSON.stringify(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName)}`)
  console.log(`  props=${JSON.stringify(row.props)}`)
}

console.log('\n═══ AI 工作台/经营总览 顶层块 ═══')
for (const [pageUid, title] of [['n13ai2efgqippp44', 'AI 工作台'], ['w6b9cdzrc2lst1dm', '经营总览']] as Array<[string, string]>) {
  const uses = new Map<string, number>()
  for (const row of models) {
    if (pageOfUid(String(row.uid)) !== pageUid) continue
    const key = String(row.use ?? row.subKey ?? '?')
    uses.set(key, (uses.get(key) ?? 0) + 1)
  }
  console.log(`${title}: ${JSON.stringify([...uses.entries()])}`)
  for (const row of models) {
    if (pageOfUid(String(row.uid)) !== pageUid) continue
    if (row?.use === 'KanbanBlockModel' || row?.use === 'CalendarBlockModel' || row?.use === 'JSBlockModel') {
      console.log(`  ${row.use} props=${JSON.stringify(row.props ?? {}).slice(0, 200)}`)
    }
  }
}
