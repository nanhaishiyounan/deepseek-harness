/**
 * W7-B6 bin-map JSBlock recolor — the 库位平面图 JSBlock (deployed by
 * nocobase-h5-wms.mts, whose ensureBinMap skips existing blocks) still carried
 * the pre-W7 hardcoded palette (#1677ff occupied / #52c41a idle / #ff4d4f
 * frozen) inside its runtime code; the B2 heal only touched schema props, not
 * JSBlock code. The live code rides the block row's opaque stepParams.jsSettings
 * object — writing that shape by hand breaks the renderer, so the idempotent
 * channel is destroy + flowSurfaces:addBlock (BLOCK_UPDATE_CHANNEL below)
 * with the token-referencing BIN_MAP_CODE (the server shapes jsSettings
 * itself, same as first deploy).
 * Run order: this script (idempotent — destroys only a JSBlock under the
 * 库位平面图 grid, then re-adds); verify in-page render with the B6 probe.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w7b6-binmap.mts
 */
import { BIN_MAP_CODE } from './nocobase-h5-wms.mts'
import { dataOf, listFlowModels, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'

/** The update channel for already-deployed JSBlock code: destroy the block,
 * then re-add through flowSurfaces:addBlock. The stored code lives in the
 * server-shaped stepParams.jsSettings object, which no direct-update API
 * accepts intact — documentation quotes this constant's value as the channel. */
export const BLOCK_UPDATE_CHANNEL = 'destroy+addBlock'

const BANNED = ['#1677ff', '#722ed1', '#7c3aed', '#ff4d4f', '#faad14', '#c41d7f', '#13c2c2', '#52c41a', '#bfbfbf']
const bannedIn = BANNED.filter((hex) => BIN_MAP_CODE.toLowerCase().includes(hex))
if (bannedIn.length > 0) throw new Error(`BIN_MAP_CODE carries banned ${JSON.stringify(bannedIn)}`)

const token = await signInWithRetry()
const routes = await listRoutes(token, 'w7b6-binmap')
const flow = routes.find((row) => row.title === '库位平面图' && row.type === 'flowPage')
if (flow === undefined) throw new Error('库位平面图 flowPage not found')
const tab = routes.find((row) => row.parentId === flow.id && row.type === 'tabs')
if (tab?.schemaUid == null) throw new Error('库位平面图 has no tabs child')

const models = await listFlowModels(token, 'w7b6-binmap')
const grid = models.find((row) => row.parentId === tab.schemaUid && row.subKey === 'grid')
if (grid?.uid == null) throw new Error('grid not found')
const block = models.find((row) => row.parentId === grid.uid && row.use === 'JSBlockModel')
if (block !== undefined) {
  await dataOf(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(block.uid))}`)
  console.log(`destroyed prior bin-map block ${String(block.uid)}`)
}
const created = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
  target: { uid: grid.uid },
  type: 'jsBlock',
  settings: { showBlockCard: true, code: BIN_MAP_CODE },
})
const newUid = created?.uid ?? created?.tree?.uid
if (typeof newUid !== 'string') throw new Error(`addBlock returned no uid: ${JSON.stringify(created).slice(0, 200)}`)
console.log(`bin-map block rebuilt (uid ${newUid}) via ${BLOCK_UPDATE_CHANNEL} with the token-referencing palette`)
