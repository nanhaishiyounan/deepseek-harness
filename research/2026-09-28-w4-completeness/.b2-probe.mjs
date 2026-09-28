// W4-B2 structure probe: how FormGridModel rows, their FormItemModel children,
// and layout references sit in the flat flowModels list (embedded vs flat).
import { listFlowModels, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const token = await signInWithRetry()
const rows = await listFlowModels(token, 'b2-probe')
const byUid = new Map(rows.map(r => [r.uid, r]))
const grids = rows.filter(r => r.use === 'FormGridModel')
const items = rows.filter(r => r.use === 'FormItemModel')

const itemsByParent = new Map()
for (const it of items) {
  const p = String(it.parentId ?? '')
  if (!itemsByParent.has(p)) itemsByParent.set(p, [])
  itemsByParent.get(p).push(it)
}

let gridsWithFlatChildren = 0
let totalReferenced = 0
let totalResolved = 0
const unresolved = []
for (const g of grids) {
  const layoutRows = g?.props?.layout?.rows ?? []
  const kids = itemsByParent.get(g.uid) ?? []
  if (kids.length > 0) gridsWithFlatChildren++
  for (const row of layoutRows) {
    for (const cell of row.cells ?? []) {
      for (const uid of cell.items ?? []) {
        totalReferenced++
        if (byUid.has(uid)) totalResolved++
        else unresolved.push(`${g.uid.slice(0, 6)} -> ${String(uid).slice(0, 10)} (${byUid.get(uid)?.use ?? 'MISSING'})`)
      }
    }
  }
}
console.log(`flat FormGridModel=${grids.length} flat FormItemModel=${items.length}`)
console.log(`grids with flat item children=${gridsWithFlatChildren}`)
console.log(`layout references: ${totalResolved}/${totalReferenced} resolve to flat rows`)
console.log(`items whose parent is NOT a flat grid row: ${[...itemsByParent.keys()].filter(p => !byUid.has(p)).length} parents, ${[...itemsByParent.entries()].filter(([p]) => !byUid.has(p)).reduce((s, [, l]) => s + l.length, 0)} items`)

// non-grid parents of FormItemModel rows
const parentUses = new Map()
for (const [p, list] of itemsByParent) {
  const use = byUid.get(p)?.use ?? '(not-flat)'
  parentUses.set(use, (parentUses.get(use) ?? 0) + list.length)
}
console.log('FormItemModel parent uses:', JSON.stringify([...parentUses.entries()]))

// one full example: the pur_orders grid (from the flat list) + children
const purGrid = grids.find(g => {
  const kids = itemsByParent.get(g.uid) ?? []
  return kids.some(k => k.stepParams?.fieldSettings?.init?.collectionName === 'pur_orders')
})
if (purGrid) {
  const kids = (itemsByParent.get(purGrid.uid) ?? []).sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
  const formRow = byUid.get(purGrid.parentId)
  console.log(`\npur_orders grid ${purGrid.uid} children=${kids.length} formParent=${formRow?.use ?? '(embedded)'}`)
  console.log('grid props keys:', Object.keys(purGrid.props ?? {}), 'stepParams keys:', Object.keys(purGrid.stepParams ?? {}))
  console.log('layout rows:', JSON.stringify((purGrid.props?.layout?.rows ?? []).map(r => ({ sizes: r.sizes, items: (r.cells ?? []).flatMap(c => c.items ?? []).map(u => String(u).slice(0, 8)) }))))
  for (const k of kids) {
    const fieldRow = (rows.find(r => r.parentId === k.uid) ?? {})
    console.log(`  item f=${k.stepParams?.fieldSettings?.init?.fieldPath} props={${Object.keys(k.props ?? {}).join(',')}} fieldSub=${fieldRow.use ?? 'none'} fieldProps={${Object.keys(fieldRow.props ?? {}).join(',')}}`)
  }
}
