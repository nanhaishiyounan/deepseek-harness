/**
 * W7-B4 探针 3：生产订单看板/质检看板的 KanbanBlockModel 集合与分组、
 * v1 三页（排产甘特/任务甘特/应用中心）的路由与 uiSchemas 结构。
 */
import { dataOf, listFlowModels, listRoutes, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const token = await signInWithRetry()
const models = await listFlowModels(token, 'w7b4-probe3')
const routes = await listRoutes(token, 'w7b4-probe3')

console.log('═══ 生产订单看板/质检看板 KanbanBlockModel ═══')
const byUid = new Map(models.map(row => [String(row.uid), row]))
for (const row of models) {
  if (row?.use !== 'KanbanBlockModel') continue
  let cur: string | undefined = String(row.uid)
  const ancestors: string[] = []
  for (let i = 0; i < 12 && cur !== undefined && cur !== ''; i++) {
    ancestors.push(cur)
    cur = String(byUid.get(cur)?.parentId ?? '') || undefined
  }
  if (!ancestors.includes('w3b39xulomz8jj') && !ancestors.includes('w3b3uw3d0mrz1b')) continue
  console.log(`${ancestors.includes('w3b39xulomz8jj') ? '生产订单看板' : '质检看板'} collection=${JSON.stringify(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName)}`)
  console.log(`  props=${JSON.stringify(row.props)}`)
}

console.log('\n═══ v1 三页路由行 ═══')
for (const r of routes) {
  if (['96yet9a0x4', 'zs3oqvlgqq', 'c9c6wzppej'].includes(String(r.schemaUid ?? ''))) {
    console.log(JSON.stringify({ id: r.id, title: r.title, type: r.type, schemaUid: r.schemaUid, parentId: r.parentId, tabSchemaName: r.tabSchemaName }))
  }
}

console.log('\n═══ v1 排产甘特 uiSchemas properties（前 3000 字）═══')
const props96 = await dataOf(token, 'GET', '/api/uiSchemas:getProperties?filterByTk=96yet9a0x4').catch(e => `ERR ${String(e).slice(0, 200)}`)
console.log(typeof props96 === 'string' ? props96 : JSON.stringify(props96).slice(0, 3000))

console.log('\n═══ v1 任务甘特 uiSchemas properties（前 2500 字）═══')
const propsZs = await dataOf(token, 'GET', '/api/uiSchemas:getProperties?filterByTk=zs3oqvlgqq').catch(e => `ERR ${String(e).slice(0, 200)}`)
console.log(typeof propsZs === 'string' ? propsZs : JSON.stringify(propsZs).slice(0, 2500))

console.log('\n═══ v1 应用中心 uiSchemas properties（前 1500 字）═══')
const propsC9 = await dataOf(token, 'GET', '/api/uiSchemas:getProperties?filterByTk=c9c6wzppej').catch(e => `ERR ${String(e).slice(0, 200)}`)
console.log(typeof propsC9 === 'string' ? propsC9 : JSON.stringify(propsC9).slice(0, 1500))
