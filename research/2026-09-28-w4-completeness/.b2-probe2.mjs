// W4-B2 probe 2: full-tree shape via flowSurfaces:get — form block -> grid ->
// items -> field submodels; and whether flat field-model rows carry parentIds.
import { dataOf, listFlowModels, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const token = await signInWithRetry()
const rows = await listFlowModels(token, 'b2-probe2')
const byUid = new Map(rows.map(r => [r.uid, r]))

// flat field-model rows (non-Display) and their parent resolution
const fieldModels = rows.filter(r => String(r.use ?? '').endsWith('FieldModel') && !String(r.use).startsWith('Display'))
const withParent = fieldModels.filter(r => r.parentId != null && String(r.parentId) !== '')
console.log(`flat non-Display field models=${fieldModels.length} withParent=${withParent.length}`)
const uses = new Map()
for (const f of fieldModels) uses.set(f.use, (uses.get(f.use) ?? 0) + 1)
console.log('field model uses:', JSON.stringify([...uses.entries()]))

// the pur_orders form: find its CreateFormModel via layout walk from flat grids
const grids = rows.filter(r => r.use === 'FormGridModel')
let purGrid = null
for (const g of grids) {
  const refs = (g?.props?.layout?.rows ?? []).flatMap(r => (r.cells ?? []).flatMap(c => c.items ?? []))
  const cols = refs.map(u => byUid.get(u)?.stepParams?.fieldSettings?.init?.collectionName).filter(Boolean)
  if (cols.includes('pur_orders')) { purGrid = g; break }
}
console.log('\npurGrid flat row:', purGrid?.uid, 'keys:', purGrid ? Object.keys(purGrid) : '')
// full tree from flowSurfaces:get on the grid uid
const treeResp = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(purGrid.uid)}`)
const tree = treeResp?.tree ?? {}
console.log('tree use:', tree.use, 'uid:', tree.uid, 'subKey:', tree.subKey)
console.log('tree props keys:', Object.keys(tree.props ?? {}), 'stepParams:', JSON.stringify(tree.stepParams ?? {}).slice(0, 200))
const items = tree?.subModels?.items
const list = Array.isArray(items) ? items : items === undefined ? [] : [items]
console.log('tree items:', list.length)
for (const it of list.slice(0, 11)) {
  const fp = it?.stepParams?.fieldSettings?.init?.fieldPath
  const field = it?.subModels?.field
  console.log(`  ${it.use} f=${fp} props={${Object.keys(it.props ?? {}).join(',')}} field=${field?.use ?? '-'}{${Object.keys(field?.props ?? {}).join(',')}} uid=${String(it.uid).slice(0, 10)}`)
}
console.log('parent chain: grid.parentId=', tree.parentId)
const parentResp = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(String(tree.parentId))}`)
const pTree = parentResp?.tree ?? {}
console.log('parent use:', pTree.use, 'resource:', JSON.stringify(pTree?.stepParams?.resourceSettings ?? {}).slice(0, 120))
console.log('parent subModels keys:', Object.keys(pTree?.subModels ?? {}))
