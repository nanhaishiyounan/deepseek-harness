import { dataOf, listFlowModels, listRoutes, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'
const token = await signInWithRetry()
const routes = await listRoutes(token, 'probe')
const flow = routes.find((row) => row.title === '库位平面图' && row.type === 'flowPage')
const tab = routes.find((row) => row.parentId === flow.id && row.type === 'tabs')
const models = await listFlowModels(token, 'probe')
const grid = models.find((row) => row.parentId === tab.schemaUid && row.subKey === 'grid')
const block = models.find((row) => row.parentId === grid.uid && row.use === 'JSBlockModel')
for (const [key, value] of Object.entries(block)) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const hasOld = /52c41a|1677ff|ff4d4f/.test(text ?? '')
  const hasNew = /--w7-positive-bg/.test(text ?? '')
  console.log(`${key}: len=${String(text ?? '').length}${hasOld ? ' OLD-PALETTE' : ''}${hasNew ? ' NEW-PALETTE' : ''}`)
}
const surface = await dataOf(token, 'GET', `/api/flowSurfaces:get?filterByTk=${grid.uid}`)
const sText = JSON.stringify(surface)
console.log(`surface: len=${String(sText.length)} old=${/52c41a|1677ff|ff4d4f/.test(sText)} new=${/--w7-positive-bg/.test(sText)}`)
process.exit(0)
