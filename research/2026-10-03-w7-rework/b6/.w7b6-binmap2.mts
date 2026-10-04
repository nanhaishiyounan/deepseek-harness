/**
 * W7-B6 bin-map recolor, channel 2 — the JSBlock's live code rides the block
 * row's stepParams.jsSettings (flowSurfaces:addBlock stored settings.code
 * there); the earlier grid-settings update cleaned props.code but the renderer
 * never reads that. This writes the token-referencing BIN_MAP_CODE into
 * stepParams.jsSettings through flowModels:update and re-reads to verify.
 */
import { BIN_MAP_CODE } from '../../../examples/kb-agent/scripts/nocobase-h5-wms.mts'
import { dataOf, listFlowModels, listRoutes, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const BANNED = ['#1677ff', '#722ed1', '#7c3aed', '#ff4d4f', '#faad14', '#c41d7f', '#13c2c2', '#52c41a', '#bfbfbf']
const token = await signInWithRetry()
const routes = await listRoutes(token, 'binmap2')
const flow = routes.find((row) => row.title === '库位平面图' && row.type === 'flowPage')
const tab = routes.find((row) => row.parentId === flow.id && row.type === 'tabs')
const models = await listFlowModels(token, 'binmap2')
const grid = models.find((row) => row.parentId === tab.schemaUid && row.subKey === 'grid')
const block = models.find((row) => row.parentId === grid.uid && row.use === 'JSBlockModel')
const oldSettings = String(block.stepParams?.jsSettings ?? '')
console.log('jsSettings head:', oldSettings.slice(0, 60))
const isJson = oldSettings.trimStart().startsWith('{')
const next = { showBlockCard: true, code: BIN_MAP_CODE }
const code = BIN_MAP_CODE
const bannedAfter = BANNED.filter((hex) => code.toLowerCase().includes(hex))
if (bannedAfter.length > 0) throw new Error(`BIN_MAP_CODE carries banned ${JSON.stringify(bannedAfter)}`)
await dataOf(token, 'POST', `/api/flowModels:update?filterByTk=${encodeURIComponent(String(block.uid))}`, {
  stepParams: { jsSettings: next },
})
const recheck = await listFlowModels(token, 'binmap2-recheck')
const reread = String(recheck.find((row) => row.uid === block.uid)?.stepParams?.jsSettings ?? '')
const still = BANNED.filter((hex) => reread.toLowerCase().includes(hex))
if (still.length > 0) throw new Error(`jsSettings still carries banned ${JSON.stringify(still)} (len=${String(reread.length)})`)
console.log('bin-map stepParams.jsSettings updated and re-read clean')
process.exit(0)
