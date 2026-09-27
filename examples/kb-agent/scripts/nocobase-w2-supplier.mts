/**
 * W2/B2: the supplier single-source unification's NocoBase side
 * (plans/2026-09-25-mfg-closure/03-b2-supplier-lifecycle.md). One script,
 * seven effects, all idempotent:
 *
 * 1. wfl_gate_configs gains the upstream_state_field column (a gate may read
 *    a lifecycle column instead of doc_status).
 * 2. The supplier-admission flow seed via approval-engine.mts's
 *    seedAdmissionFlow: srm_suppliers rides state_field=lifecycle_status
 *    (potential → reviewing → qualified | rejected) with admitted_at as the
 *    effective-date extras column.
 * 3. The supplier gate: hub_po_purchase_orders.supplier_id must reference an
 *    srm_suppliers row with lifecycle_status ∈ {qualified, preferred} — the
 *    AVL rule the engine's nb_create precondition enforces.
 * 4. The h4 admission workflow (create-triggered manual chain) is retired —
 *    disabled so newly created potential rows no longer enter the NocoBase
 *    manual queue while the wfl engine owns the lifecycle.
 * 5. Legacy unification: hub_po_suppliers rows still 待审核 (the mobile
 *    form-assistant's registrations, id=7~11) migrate into srm_suppliers as
 *    potential/internal rows with fresh SUP-YYYY-NNNN codes (name-deduped;
 *    the source row stays as 采购联系人 history).
 * 6. The wfl_* select enums grow the four admission states so the 审批中心
 *    tables render their Chinese labels (the hub ENUM_ALIGNMENTS pattern).
 * 7. The B0 采购供应商 v2 page retitles to 采购联系人（历史） — the read view
 *    of the demoted table.
 *
 * Rollback: --rollback drops the admission flow config tree and the supplier
 * gate row, re-enables the h4 workflow, deletes the migrated srm rows (by the
 * on-disk id ledger), and restores the page title. Enum extensions stay
 * (harmless superset).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w2-supplier.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w2-supplier.mts --rollback
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { seedAdmissionFlow } from './approval-engine.mts'

const here = dirname(fileURLToPath(import.meta.url))
const ledgerPath = join(here, '.w2-migrated-suppliers.json')

const H4_ADMISSION_TITLE = 'SRM供应商准入审批'
const LEGACY_PAGE_TITLE = '采购供应商'
const RETIRED_PAGE_TITLE = '采购联系人（历史）'

/** The four admission states the wfl_* select enums grow (label pairs mirror h4's LIFECYCLE). */
const ADMISSION_ENUM_OPTIONS: ReadonlyArray<{ value: string, label: string, color: string }> = [
  { value: 'potential', label: '潜在', color: 'default' },
  { value: 'reviewing', label: '准入评审中', color: 'blue' },
  { value: 'qualified', label: '合格', color: 'green' },
  { value: 'rejected', label: '已拒绝', color: 'red' },
]

/** The wfl select fields whose uiSchema.enum must list the admission states. */
const ENUM_TARGETS: ReadonlyArray<{ collection: string, fields: readonly string[] }> = [
  { collection: 'wfl_flow_states', fields: ['state'] },
  { collection: 'wfl_flow_transitions', fields: ['state', 'next_state'] },
  { collection: 'wfl_approval_records', fields: ['from_state', 'to_state'] },
  { collection: 'wfl_approval_todos', fields: ['state'] },
]

// ─── the REST IO adapter seedAdmissionFlow runs over (the full NocoIO surface) ───

const tokenIO = (token: string) => ({
  list: async (collection: string, filter?: Record<string, unknown>) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`)
    return rows ?? []
  },
  get: async (collection: string, id: number) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection: string, values: Record<string, unknown>) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection: string, id: number, values: Record<string, unknown>) => {
    await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  },
  updateWhere: async (collection: string, filter: Record<string, unknown>, values: Record<string, unknown>) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async (collection: string, id: number) => {
    await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  },
})

// ─── steps ───

/** Add wfl_gate_configs.upstream_state_field when missing (fresh w1 installs create it via the w1 schema; older ones get it here). */
async function ensureGateStateFieldColumn(token: string): Promise<void> {
  const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wfl_gate_configs' }, name: { $eq: 'upstream_state_field' } }))}&pageSize=5`) as Array<unknown> | null
  if ((fields ?? []).length > 0) {
    console.log('nocobase-w2: wfl_gate_configs.upstream_state_field exists (kept)')
    return
  }
  await dataOf(token, 'POST', '/api/fields:create', {
    collectionName: 'wfl_gate_configs', name: 'upstream_state_field', type: 'string', interface: 'input',
    uiSchema: { type: 'string', 'x-component': 'Input', title: '上游状态字段' },
  })
  console.log('nocobase-w2: wfl_gate_configs.upstream_state_field added')
}

/** Seed the supplier gate row (idempotent by the exact downstream+upstream pair). */
async function ensureSupplierGate(token: string): Promise<void> {
  const gates = await dataOf(token, 'GET', `/api/wfl_gate_configs:list?filter=${encodeURIComponent(JSON.stringify({ downstream_collection: { $eq: 'hub_po_purchase_orders' } }))}&pageSize=10`) as Array<Record<string, any>> | null
  const exists = (gates ?? []).some(gate => gate.upstream_collection === 'srm_suppliers' && gate.upstream_field === 'supplier_id')
  if (exists) {
    console.log('nocobase-w2: hub_po_purchase_orders→srm_suppliers gate exists (kept)')
    return
  }
  await dataOf(token, 'POST', '/api/wfl_gate_configs:create', {
    downstream_collection: 'hub_po_purchase_orders', upstream_collection: 'srm_suppliers',
    upstream_field: 'supplier_id', upstream_ref_field: null, upstream_label: '供应商',
    upstream_state_field: 'lifecycle_status', required_status: 'qualified,preferred',
  })
  console.log('nocobase-w2: supplier gate created (supplier_id → srm_suppliers lifecycle_status ∈ qualified,preferred)')
}

/**
 * Disable the h4 create-triggered admission workflow (the wfl engine owns
 * the lifecycle now). 2.2.6 exposes no `:toggle` action on workflows (the
 * route 404s silently through call), so the disable rides `:update` with
 * enabled=false — the field the update whitelist names.
 */
async function retireH4AdmissionWorkflow(token: string): Promise<void> {
  const workflows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: H4_ADMISSION_TITLE } }))}&pageSize=5`) as Array<{ id: number, enabled?: boolean }> | null
  const workflow = (workflows ?? [])[0]
  if (workflow === undefined) {
    console.log(`nocobase-w2: h4 workflow "${H4_ADMISSION_TITLE}" not found (nothing to retire)`)
    return
  }
  if (workflow.enabled === false) {
    console.log(`nocobase-w2: h4 workflow "${H4_ADMISSION_TITLE}" already disabled (kept)`)
    return
  }
  await dataOf(token, 'POST', `/api/workflows:update?filterByTk=${workflow.id}`, { enabled: false })
  console.log(`nocobase-w2: h4 workflow "${H4_ADMISSION_TITLE}" disabled (admission moved to the wfl engine)`)
}

/** The next SUP-YYYY-NNNN code over the srm rows' existing codes (the mobile generator's same shape). */
function nextSupplierCode(rows: ReadonlyArray<Record<string, any>>, year: number): string {
  const pattern = new RegExp(`^SUP-${String(year)}-(\\d{4})$`)
  let max = 0
  for (const row of rows) {
    const value = row.code
    if (typeof value !== 'string') continue
    const suffix = Number(pattern.exec(value)?.[1])
    if (Number.isInteger(suffix) && suffix > max) max = suffix
  }
  return `SUP-${String(year)}-${String(max + 1).padStart(4, '0')}`
}

/**
 * Unify the legacy mobile registrations: every hub_po_suppliers row still
 * 待审核 lands in srm_suppliers as a potential/internal row (name-deduped;
 * the hub row stays as 采购联系人 history). Migrated ids go to the on-disk
 * ledger the rollback reads.
 */
async function migrateLegacySuppliers(token: string): Promise<void> {
  const legacyRows = await dataOf(token, 'GET', '/api/hub_po_suppliers:list?pageSize=200') as Array<Record<string, any>> | null
  const pending = (legacyRows ?? []).filter(row => row.status === '待审核')
  if (pending.length === 0) {
    console.log('nocobase-w2: no 待审核 legacy suppliers to unify (kept)')
    return
  }
  const srmRows = await dataOf(token, 'GET', '/api/srm_suppliers:list?pageSize=500') as Array<Record<string, any>> | null
  const srmList = [...(srmRows ?? [])]
  const knownNames = new Set(srmList.map(row => String(row.name)))
  const ledger: number[] = readLedger()
  const year = new Date().getFullYear()
  let added = 0
  let kept = 0
  for (const row of pending) {
    const name = String(row.name ?? '')
    if (name === '' || knownNames.has(name)) {
      kept += 1
      continue
    }
    const code = nextSupplierCode(srmList, year)
    const note = row.email === null || row.email === undefined || row.email === ''
      ? `自采购联系人（hub_po_suppliers 第 ${String(row.id)} 行）归一`
      : `自采购联系人（hub_po_suppliers 第 ${String(row.id)} 行）归一；邮箱 ${String(row.email)}`
    const created = await dataOf(token, 'POST', '/api/srm_suppliers:create', {
      name, code, lifecycle_status: 'potential', source: 'internal',
      contact: row.contact_name ?? null, note,
    }) as { id: number } | null
    if (created !== null && created.id !== undefined) {
      ledger.push(Number(created.id))
      srmList.push({ id: created.id, name, code })
      knownNames.add(name)
      added += 1
    }
  }
  if (added > 0) writeLedger(ledger)
  console.log(`nocobase-w2: legacy suppliers unified +${added} (potential/internal; deduped ${kept}; hub rows kept as 采购联系人 history)`)
}

function readLedger(): number[] {
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8')) as number[]
  } catch {
    return []
  }
}

function writeLedger(ids: readonly number[]): void {
  writeFileSync(ledgerPath, `${JSON.stringify(ids)}\n`)
}

/** Grow the wfl_* select enums with the admission states (the hub ENUM_ALIGNMENTS pattern). */
async function extendStateEnums(token: string): Promise<void> {
  let patched = 0
  for (const target of ENUM_TARGETS) {
    for (const field of target.fields) {
      const rows = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: target.collection }, name: { $eq: field } }))}&pageSize=5`) as Array<{ uiSchema?: { enum?: Array<{ value: string }> } }> | null
      const current = (rows ?? [])[0]?.uiSchema?.enum ?? []
      const missing = ADMISSION_ENUM_OPTIONS.filter(option => !current.some(existing => existing.value === option.value))
      if (missing.length === 0) continue
      await dataOf(token, 'POST', `/api/collections/${target.collection}/fields:update?filterByTk=${field}`, {
        uiSchema: { enum: [...current, ...missing] },
      })
      patched += 1
    }
  }
  console.log(`nocobase-w2: wfl state enums ${patched > 0 ? `${patched} field(s) extended with admission states` : 'carry the admission states (kept)'}`)
}

/** Retitle the B0 采购供应商 v2 page to its demoted 采购联系人（历史） role (f3 keeps building it under the old title; this rename owns the retitle). */
async function retitleLegacyPage(token: string): Promise<void> {
  const routes = await listRoutes(token, 'W2')
  const retired = routes.find(row => row.title === RETIRED_PAGE_TITLE && row.type === 'flowPage')
  if (retired !== undefined) {
    console.log(`nocobase-w2: v2 page "${RETIRED_PAGE_TITLE}" exists (kept)`)
    return
  }
  const legacy = routes.find(row => row.title === LEGACY_PAGE_TITLE && row.type === 'flowPage')
  if (legacy === undefined) {
    console.log(`nocobase-w2: v2 page "${LEGACY_PAGE_TITLE}" not found (run nocobase-f3-hub-v2.mts first)`)
    return
  }
  await dataOf(token, 'POST', `/api/desktopRoutes:update?filterByTk=${legacy.id}`, { title: RETIRED_PAGE_TITLE })
  console.log(`nocobase-w2: v2 page "${LEGACY_PAGE_TITLE}" retitled to "${RETIRED_PAGE_TITLE}"`)
}

async function rollback(token: string): Promise<void> {
  // The admission flow config tree (states + transitions hang off flow_id).
  const configs = await dataOf(token, 'GET', `/api/wfl_flow_configs:list?filter=${encodeURIComponent(JSON.stringify({ doc_type: { $eq: 'srm_suppliers' } }))}&pageSize=5`) as Array<{ id: number }> | null
  for (const config of configs ?? []) {
    const states = await dataOf(token, 'GET', `/api/wfl_flow_states:list?filter=${encodeURIComponent(JSON.stringify({ flow_id: config.id }))}&pageSize=50`) as Array<{ id: number }> | null
    for (const state of states ?? []) await call(token, 'POST', `/api/wfl_flow_states:destroy?filterByTk=${state.id}`)
    const transitions = await dataOf(token, 'GET', `/api/wfl_flow_transitions:list?filter=${encodeURIComponent(JSON.stringify({ flow_id: config.id }))}&pageSize=50`) as Array<{ id: number }> | null
    for (const transition of transitions ?? []) await call(token, 'POST', `/api/wfl_flow_transitions:destroy?filterByTk=${transition.id}`)
    await call(token, 'POST', `/api/wfl_flow_configs:destroy?filterByTk=${config.id}`)
  }
  // The supplier gate row.
  const gates = await dataOf(token, 'GET', `/api/wfl_gate_configs:list?filter=${encodeURIComponent(JSON.stringify({ downstream_collection: { $eq: 'hub_po_purchase_orders' } }))}&pageSize=10`) as Array<Record<string, any>> | null
  for (const gate of (gates ?? []).filter(row => row.upstream_collection === 'srm_suppliers')) {
    await call(token, 'POST', `/api/wfl_gate_configs:destroy?filterByTk=${String(gate.id)}`)
  }
  // The h4 workflow back on (the same update path the retire step uses).
  const workflows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: H4_ADMISSION_TITLE } }))}&pageSize=5`) as Array<{ id: number, enabled?: boolean }> | null
  const workflow = (workflows ?? [])[0]
  if (workflow !== undefined && workflow.enabled === false) {
    await dataOf(token, 'POST', `/api/workflows:update?filterByTk=${workflow.id}`, { enabled: true })
  }
  // The migrated srm rows.
  const ledger = readLedger()
  for (const id of ledger) {
    await call(token, 'POST', `/api/srm_suppliers:destroy?filterByTk=${id}`)
  }
  if (ledger.length > 0) writeLedger([])
  // The page title back.
  const routes = await listRoutes(token, 'W2')
  const retired = routes.find(row => row.title === RETIRED_PAGE_TITLE && row.type === 'flowPage')
  if (retired !== undefined) {
    await dataOf(token, 'POST', `/api/desktopRoutes:update?filterByTk=${retired.id}`, { title: LEGACY_PAGE_TITLE })
  }
  console.log('nocobase-w2: rollback done (admission flow + gate removed, h4 workflow re-enabled, migrated rows deleted, page title restored; enum extensions stay)')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w2: done (rollback)')
    return
  }
  await ensureGateStateFieldColumn(token)
  await seedAdmissionFlow(tokenIO(token))
  await ensureSupplierGate(token)
  await retireH4AdmissionWorkflow(token)
  await migrateLegacySuppliers(token)
  await extendStateEnums(token)
  await retitleLegacyPage(token)
  console.log('nocobase-w2: done')
}

await main()
