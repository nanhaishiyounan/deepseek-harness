/**
 * W5-B8 probe (research artifact): print the identity of every enum-interface
 * table column still rendered by DisplayTextFieldModel (the w5b6-heal
 * "bareText" census) so the drift can be attributed before healing.
 * Usage: node --import tsx/esm examples/kb-agent/scripts/.w5-b8-bare-probe.mts
 */
import { dataOf, listFlowModels, signInWithRetry } from './nocobase-flow-page-lib.mts'

type FieldMeta = { name: string, interface: string | null }

async function loadFields(token: string): Promise<Map<string, FieldMeta[]>> {
  for (const path of ['/api/collectionFields:list?pageSize=2000&sort=collectionName', '/api/fields:list?pageSize=2000&sort=collectionName']) {
    const rows = await dataOf(token, 'GET', path).catch(() => null) as Array<Record<string, any>> | null
    if (!Array.isArray(rows) || rows.length === 0) continue
    const map = new Map<string, FieldMeta[]>()
    for (const row of rows) {
      const collection = typeof row.collectionName === 'string' ? row.collectionName : ''
      if (collection === '' || typeof row.name !== 'string') continue
      if (!map.has(collection)) map.set(collection, [])
      map.get(collection)!.push({ name: row.name, interface: row.interface ?? null })
    }
    if (map.size > 0) return map
  }
  throw new Error('no collection-scoped field channel returned rows')
}

const token = await signInWithRetry()
const fields = await loadFields(token)
const models = await listFlowModels(token, 'w5b8-bare-probe')
for (const columnRow of models) {
  if (columnRow?.use !== 'TableColumnModel') continue
  const fieldRow = models.find(row => String(row.parentId ?? '') === String(columnRow.uid) && row.subKey === 'field')
  if (fieldRow === undefined) continue
  const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
  const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
    ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
  const interfaceName = fields.get(collection)?.find(field => field.name === fieldPath)?.interface ?? ''
  if (String(fieldRow.use ?? '') === 'DisplayTextFieldModel' && interfaceName === 'select') {
    console.log(`bare: ${collection}.${fieldPath} columnUid=${String(columnRow.uid)} parent=${String(columnRow.parentId ?? '')}`)
  }
}
console.log('probe done')
