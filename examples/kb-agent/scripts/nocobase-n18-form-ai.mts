/**
 * N18 form-level AI fill (idempotent): mount the official AI-employee button
 * into every N17 Add-new popup form so users can type an intent and have the
 * employee fill the form fields through the frontend formFiller tool.
 *
 * The official v12 demo wires this as an AIEmployeeButtonModel node under
 * CreateFormModel's "actions" sub-key (dumped from the demo's Customers
 * Add-new popup: aiEmployee=dex, context.workContext pointing at the form
 * model uid, style 40px). The N17 popup wire stopped at the form grid, so the
 * button never rendered and the only in-form AI entry was the page-level
 * floating ball, whose conversation carries no form context — that mismatch
 * is the "AI 助手当前不可用，未填写任何内容" symptom from the user report.
 *
 * Idempotent by deterministic uid `n18ai-<formUid>`; forms are matched the
 * same way as N17's ensureFormSubmits — top-level CreateFormModel rows only
 * (`parentId == null`; the list endpoint returns the parentId key only when
 * set, so `== null` selects top-level rows) plus
 * resourceSettings.init.collectionName.
 *
 * Orphan self-heal (N25): a button whose CreateFormModel no longer exists
 * (the form was deleted out from under it) is destroyed instead of mounted —
 * a dangling actions child cannot render and would silently pad any count of
 * AIEmployeeButtonModel rows. Orphans are `n18ai-` buttons whose form uid is
 * absent from every CreateFormModel row; removal is idempotent (a second run
 * finds none left).
 */
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'

/** The employee wired into the official demo's popup AI button. */
const FORM_AI_EMPLOYEE = 'dex'

async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  }
  return payload
}

async function dataOf(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const payload = await call(token, method, path, body)
  return payload?.data ?? null
}

async function signIn(): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

async function ensureFormAIButtons(token: string): Promise<void> {
  const employees = await dataOf(token, 'GET', '/api/aiEmployees:list?pageSize=100') as Array<{ username?: string, enabled?: boolean }> | null
  const employee = (employees ?? []).find(row => row.username === FORM_AI_EMPLOYEE && row.enabled)
  if (!employee) {
    throw new Error(`AI employee ${FORM_AI_EMPLOYEE} is missing or disabled; run the all chain so the built-in seed and nocobase-n17-alignment.mts land first`)
  }

  // Fail-closed catalog read: a truncated list would make the orphan sweep
  // below delete the buttons of perfectly live forms (F3 once pushed the
  // catalog past 1000 rows and five real buttons were swept before this
  // guard existed).
  // B8 pushed the model tree past 3000 rows; W3-B4 pushed it past 6000 — the
  // lib listFlowModels and the verify gate both list at 12000 now.
  const pageSize = 12000
  const catalog = await call(token, 'GET', `/api/flowModels:list?pageSize=${pageSize}`)
  const rows = (catalog?.data ?? null) as Array<Record<string, any>> | null
  const total = catalog?.meta?.total
  if (rows === null || (typeof total === 'number' ? total > rows.length : rows.length === pageSize)) {
    throw new Error(`flowModels:list is truncated (got ${rows?.length ?? 0} rows${typeof total === 'number' ? ` of ${total}` : ''}, pageSize=${pageSize}); raise the page size before running n18`)
  }
  const existingButtons = new Set((rows ?? []).filter(row => row.use === 'AIEmployeeButtonModel').map(row => row.uid))
  const forms = (rows ?? []).filter(row => row.use === 'CreateFormModel' && row.parentId == null && row.stepParams?.resourceSettings?.init?.collectionName)
  const formUidSet = new Set((rows ?? []).filter(row => row.use === 'CreateFormModel').map(row => row.uid))
  let removedOrphans = 0
  for (const uid of existingButtons) {
    if (uid?.startsWith('n18ai-') && !formUidSet.has(uid.slice('n18ai-'.length))) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      removedOrphans += 1
      console.log(`nocobase-n18: orphaned form AI button ${uid} removed (its CreateFormModel no longer exists)`)
    }
  }
  let added = 0
  for (const form of forms) {
    const buttonUid = `n18ai-${form.uid}`
    if (existingButtons.has(buttonUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: buttonUid,
      parentId: form.uid,
      subKey: 'actions',
      subType: 'array',
      sortIndex: 2,
      use: 'AIEmployeeButtonModel',
      props: {
        aiEmployee: { username: FORM_AI_EMPLOYEE },
        context: { workContext: [{ type: 'flow-model', uid: form.uid }] },
        style: { mask: false, size: 40 },
        auto: false,
      },
    })
    added += 1
  }
  const orphanNote = removedOrphans > 0 ? `, ${removedOrphans} orphaned removed` : ''
  console.log(`nocobase-n18: form AI buttons ${added > 0 ? `${added} mounted on ${FORM_AI_EMPLOYEE}` : `already in place on ${FORM_AI_EMPLOYEE} (kept)`} across ${forms.length} popup forms${orphanNote} (${here})`)
}

async function main(): Promise<void> {
  const token = await signIn()
  await ensureFormAIButtons(token)
  console.log('nocobase-n18: done')
}

await main()
