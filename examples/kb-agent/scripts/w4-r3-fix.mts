/**
 * W4-R3 fix: replay the textarea form fields onto the registered model. R2
 * (w4-r2-fix.mts) retired the W round's unregistered TextAreaFieldModel
 * rows to InputFieldModel — a usable but single-line stopgap. The registry
 * class for interface 'textarea' is the differently-spelled
 * TextareaFieldModel (client-v2 flow/models/fields/TextareaFieldModel.tsx);
 * every source that emits a textarea edit model lands in the same batch
 * (w8-quality / w6-mfg-exec / w3-approval-visual editModelFor, plus the
 * editModelForFieldType / editModelFor mappings in w3-heal-row-details and
 * w4-heal-b2 that build the row Edit popups), so a rebuild or heal re-run
 * cannot reintroduce the stopgap.
 *
 * Two live surfaces bind those fields and both are replayed:
 * 1. the create-side FormItemModel rows under the w8qm/w6mfg form grids
 *    (the exact eight rows R2 retired) — the flat rows carry the item, the
 *    field node is nested under it;
 * 2. the edit-side FormItemModel rows (w3b2/w4b2 Edit popups, plus any
 *    other batch's form) binding the same (collectionName, fieldPath)
 *    text-field pairs — the surface the table 编辑 button actually opens.
 * Other collections' Edit popups stay on InputFieldModel until their next
 * heal re-run; the w3-approval-visual config forms likewise. Both are
 * recorded in the R1 note's R3 section.
 *
 * Field nodes are switched use-only (parentId/subKey passed through, props
 * and stepParams untouched — the same wire R2 proved sticks), located via
 * findOne?parentId=<item>&subKey=field. Idempotent: fields already on
 * TextareaFieldModel are skipped.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r3-fix.mts
 */
import { dataOf, listFlowModels, signInWithRetry } from './nocobase-flow-page-lib.mts'

const EXPECTED_CREATE_ROWS = 8
const TEXTAREA_PATHS = new Set(['note', 'criteria', 'reason', 'deviation_note', 'remark'])

interface FieldNode {
  uid?: unknown
  parentId?: unknown
  subKey?: unknown
  use?: unknown
}

const token = await signInWithRetry()
const models = await listFlowModels(token, 'W4R3')

const stale = models.filter(row => row?.use === 'TextAreaFieldModel')
if (stale.length > 0) {
  console.error(`w4-r3: ${String(stale.length)} capital-A TextAreaFieldModel rows remain — run w4-r2-fix.mts first (${stale.map(row => String(row.uid)).join(', ')})`)
  process.exit(1)
}

interface ItemRow {
  uid?: unknown
  use?: unknown
  subKey?: unknown
  parentId?: unknown
  stepParams?: { fieldSettings?: { init?: { collectionName?: unknown, fieldPath?: unknown } } }
}

const initOf = (row: ItemRow): { collectionName: string, fieldPath: string } => ({
  collectionName: String(row?.stepParams?.fieldSettings?.init?.collectionName ?? ''),
  fieldPath: String(row?.stepParams?.fieldSettings?.init?.fieldPath ?? ''),
})

const createItems = models.filter(row => {
  if (row?.use !== 'FormItemModel' || row?.subKey !== 'items') return false
  const uid = String(row.uid ?? '')
  return (uid.startsWith('w8qm') || uid.startsWith('w6mfg')) && TEXTAREA_PATHS.has(initOf(row).fieldPath)
})

if (createItems.length !== EXPECTED_CREATE_ROWS) {
  console.error(`w4-r3: expected ${String(EXPECTED_CREATE_ROWS)} w8qm/w6mfg textarea FormItemModel rows, found ${String(createItems.length)}:\n${createItems.map(row => `  ${String(row.uid)} ${initOf(row).collectionName}.${initOf(row).fieldPath}`).join('\n')}`)
  process.exit(1)
}

const pairs = new Set(createItems.map(row => {
  const { collectionName, fieldPath } = initOf(row)
  return `${collectionName}.${fieldPath}`
}))
const createUids = new Set(createItems.map(row => String(row.uid)))
const editItems = models.filter(row => {
  if (row?.use !== 'FormItemModel' || row?.subKey !== 'items') return false
  if (createUids.has(String(row.uid))) return false
  const { collectionName, fieldPath } = initOf(row)
  return pairs.has(`${collectionName}.${fieldPath}`)
})

console.log(`w4-r3: ${String(pairs.size)} text-field pairs from ${String(createItems.length)} create-side rows; ${String(editItems.length)} edit-side rows bind them`)

const fieldOf = async (itemUid: string): Promise<FieldNode | null> => {
  const node = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(itemUid)}&subKey=field`)
  return (node ?? null) as FieldNode | null
}

let replayed = 0
let kept = 0
const replay = async (itemUid: string, label: string): Promise<void> => {
  const field = await fieldOf(itemUid)
  if (field === null || field.uid === undefined) {
    console.error(`w4-r3: ${label} (${itemUid}) carries no field submodel`)
    process.exitCode = 1
    return
  }
  if (field.use === 'TextareaFieldModel') {
    console.log(`keep ${String(field.uid)} on TextareaFieldModel (${label})`)
    kept += 1
    return
  }
  if (field.use !== 'InputFieldModel') {
    console.error(`w4-r3: ${String(field.uid)} under ${itemUid} (${label}) is neither InputFieldModel nor TextareaFieldModel (use=${String(field.use)})`)
    process.exitCode = 1
    return
  }
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: field.uid,
    ...(field.parentId === undefined ? {} : { parentId: field.parentId }),
    ...(field.subKey === undefined ? {} : { subKey: field.subKey }),
    use: 'TextareaFieldModel',
  })
  console.log(`replayed ${String(field.uid)} InputFieldModel -> TextareaFieldModel (${label})`)
  replayed += 1
}

for (const row of createItems) {
  const { collectionName, fieldPath } = initOf(row)
  await replay(String(row.uid), `create ${collectionName}.${fieldPath}`)
}
for (const row of editItems) {
  const { collectionName, fieldPath } = initOf(row)
  await replay(String(row.uid), `edit ${collectionName}.${fieldPath}`)
}

// Fail-loud recheck on fresh reads.
let offModel = 0
for (const row of [...createItems, ...editItems]) {
  const field = await fieldOf(String(row.uid))
  if (field?.use !== 'TextareaFieldModel') {
    const { collectionName, fieldPath } = initOf(row)
    console.error(`w4-r3: ${String(row.uid)} (${collectionName}.${fieldPath}) still off-model after replay (use=${String(field?.use)})`)
    offModel += 1
  }
}
if (offModel > 0) process.exitCode = 1
else if (process.exitCode === undefined || process.exitCode === 0) {
  console.log(`w4-r3: ${String(createItems.length + editItems.length)} textarea form fields on TextareaFieldModel (${String(replayed)} replayed, ${String(kept)} kept this run) — the multiline control is the registered class`)
}
