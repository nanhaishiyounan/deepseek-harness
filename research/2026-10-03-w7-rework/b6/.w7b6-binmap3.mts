/**
 * W7-B6 bin-map recolor, channel 3 — rebuild. The two stepParams probes wrote
 * malformed jsSettings (the field is an opaque server-shaped object, not a
 * plain code string), breaking the block's render. Clean path: destroy the
 * damaged block row and re-create it through flowSurfaces:addBlock with the
 * token-referencing BIN_MAP_CODE — the same channel nocobase-h5-wms.mts used,
 * so the server shapes jsSettings itself — then verify in-page render.
 */
import { BIN_MAP_CODE } from '../../../examples/kb-agent/scripts/nocobase-h5-wms.mts'
import { dataOf, listFlowModels, listRoutes, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const BANNED = ['#1677ff', '#722ed1', '#7c3aed', '#ff4d4f', '#faad14', '#c41d7f', '#13c2c2', '#52c41a', '#bfbfbf']
const bannedIn = BANNED.filter((hex) => BIN_MAP_CODE.toLowerCase().includes(hex))
if (bannedIn.length > 0) throw new Error(`BIN_MAP_CODE carries banned ${JSON.stringify(bannedIn)}`)

const token = await signInWithRetry()
const routes = await listRoutes(token, 'binmap3')
const flow = routes.find((row) => row.title === '库位平面图' && row.type === 'flowPage')
if (flow === undefined) throw new Error('库位平面图 not found')
const tab = routes.find((row) => row.parentId === flow.id && row.type === 'tabs')
if (tab?.schemaUid == null) throw new Error('tabs child not found')
const models = await listFlowModels(token, 'binmap3')
const grid = models.find((row) => row.parentId === tab.schemaUid && row.subKey === 'grid')
if (grid?.uid == null) throw new Error('grid not found')
const block = models.find((row) => row.parentId === grid.uid && row.use === 'JSBlockModel')
if (block !== undefined) {
  await dataOf(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(block.uid))}`)
  console.log(`destroyed damaged block ${String(block.uid)}`)
}
const created = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
  target: { uid: grid.uid },
  type: 'jsBlock',
  settings: { showBlockCard: true, code: BIN_MAP_CODE },
})
console.log('recreated bin-map block:', String(created?.uid ?? created?.tree?.uid ?? '?'))
process.exit(0)
