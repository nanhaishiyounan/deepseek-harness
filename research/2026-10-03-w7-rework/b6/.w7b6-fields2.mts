import { listFlowModels, listRoutes, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'
const token = await signInWithRetry()
const routes = await listRoutes(token, 'probe')
const flow = routes.find((row) => row.title === '库位平面图' && row.type === 'flowPage')
const tab = routes.find((row) => row.parentId === flow.id && row.type === 'tabs')
const models = await listFlowModels(token, 'probe')
const grid = models.find((row) => row.parentId === tab.schemaUid && row.subKey === 'grid')
const block = models.find((row) => row.parentId === grid.uid && row.use === 'JSBlockModel')
const sp = block.stepParams as Record<string, unknown>
console.log('stepParams keys:', Object.keys(sp).join(', '))
for (const [k, v] of Object.entries(sp)) {
  const text = typeof v === 'string' ? v : JSON.stringify(v)
  console.log(`  ${k}: len=${String(text ?? '').length} old=${/52c41a|1677ff|ff4d4f/.test(text ?? '')}`)
}
console.log('uid:', block.uid)
process.exit(0)
