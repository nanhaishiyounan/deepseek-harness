#!/usr/bin/env node
/**
 * W6-B7 acceptance evidence: CDP headless drive over the live services.
 *
 * 1. Engine live triple: /healthz + GET /sourcing/rfqs + the 比价表 matrix
 *    rendering RFQ-B9F-0001 (three suppliers, one prevent row inert, one
 *    injected XSS supplier name rendered as text).
 * 2. The scoring transparency: the formula details expanded per row.
 * 3. The weight panel: change → save → rank bars re-rendered.
 * 4. Negative: finance (outside 采购部) choosing → engine 403 in the note.
 * 5. The award itself: choose 珠海鲜丰 → modal → confirm → awarded banner +
 *    ledger row + psql reconciliation (rfq awarded, PO compare_note).
 * 6. The PO swimlane (采购订单), the invoice bar (发票匹配), and the payment
 *    doughnut (付款申请) pages.
 *
 * Output: demos/acceptance-w6/w6-b7-*.png + w6-b7-shot-meta.json.
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const NC = 'http://localhost:13000'
const ENGINE = 'http://localhost:13110'
const PORT = 9347
const OUT = new URL('../../demos/acceptance-w6/', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MATRIX_PAGE = '/admin/w3purb7o0r3yqi45'
const PO_PAGE = '/admin/w3puryzkva06iuhh'
const INVOICE_PAGE = '/admin/w3pur45681oxtcsi'
const PAY_PAGE = '/admin/w3pur3an4pwnr1eo'
const RFQ = 'RFQ-B9F-0001'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const meta = { generatedAt: new Date().toISOString(), steps: {} }
mkdirSync(OUT, { recursive: true })

const env = readFileSync(new URL('../../platform/nocobase/.env', import.meta.url), 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', timeout: 20_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 100)}`)
  return run.stdout.trim()
}

// The live triple, before any browser opens (the sourcing GETs are fenced by
// the session bearer, so the admin token comes first).
const healthz = await (await fetch(`${ENGINE}/healthz`)).json()
const signinResp = await fetch(`${NC}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) }).catch(() => null)
const signinJson = signinResp === null ? {} : await signinResp.json().catch(() => ({}))
const adminToken = String(signinJson?.data?.token ?? '')
const rfqsResp = adminToken === '' ? null : await fetch(`${ENGINE}/sourcing/rfqs`, { headers: { authorization: `Bearer ${adminToken}` } }).catch(() => null)
const rfqsList = rfqsResp === null ? { ok: false } : await rfqsResp.json().catch(() => ({ ok: false }))
meta.steps.liveTriple = { healthzOk: healthz.ok === true, sourcingOk: rfqsList.ok === true, ncOk: true }
if (healthz.ok !== true) throw new Error('engine /healthz not ok')
if (rfqsList.ok !== true) throw new Error('engine GET /sourcing/rfqs not ok')

// Scene reset: RFQ-B9F-0001 back to the awardable state (a previous run may
// have awarded it), then the XSS rehearsal quote rides along.
psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}'));`)
psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}'));`)
psql(`DELETE FROM pur_order_lines WHERE order_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}'));`)
psql(`DELETE FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}');`)
psql(`UPDATE pur_quotes SET status = 'submitted', is_won = FALSE WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}') AND status IN ('submitted','lost','backup') AND product_id IS NOT NULL;`)
psql(`UPDATE pur_rfqs SET doc_status = 'approved' WHERE code = '${RFQ}';`)
psql(`DELETE FROM pur_quotes WHERE supplier_id = (SELECT id FROM srm_suppliers WHERE code = 'XSS-W6B7');`)
psql(`DELETE FROM srm_suppliers WHERE code = 'XSS-W6B7';`)
psql(`UPDATE pur_quotes SET status = 'draft' WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}') AND product_id IS NULL AND status = 'submitted';`)
psql(`UPDATE pur_quotes SET status = 'draft' WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND product_id IS NULL AND status = 'submitted';`)

// Scene prep: the XSS supplier quote rides RFQ-B9F-0001 (still approved + 3
// submitted); it renders as text and is torn down before the award.
psql(`INSERT INTO srm_suppliers (name, code, lifecycle_status) VALUES ('<img src=x onerror=window.__w6b7Xss=1>', 'XSS-W6B7', 'qualified');`)
const xssId = psql(`SELECT id FROM srm_suppliers WHERE code = 'XSS-W6B7';`)
const productId = psql(`SELECT product_id FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}') AND product_id IS NOT NULL ORDER BY id LIMIT 1;`)
psql(`INSERT INTO pur_quotes (qty, unit_price, lead_time_days, valid_until, is_won, status, rfq_id, supplier_id, product_id) SELECT 100, 0.5, 3, CURRENT_DATE + 30, FALSE, 'submitted', (SELECT id FROM pur_rfqs WHERE code = '${RFQ}'), ${xssId}, ${productId};`)
const winnerQuoteId = psql(`SELECT q.id FROM pur_quotes q JOIN srm_suppliers s ON s.id = q.supplier_id WHERE q.rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}') AND q.status = 'submitted' AND s.name LIKE '%鲜丰%';`)

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-b7-shot-profile', '--window-size=1440,900', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', () => {})
chromeProc.unref()

let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try { target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json() } catch { /* chrome not up yet */ }
}
if (target === null) throw new Error('headless chrome did not come up')
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
// A tall viewport keeps the lazy-mounted blocks inside the viewport; the
// beyond-viewport capture path unmounts them mid-raster.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false })
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const shot = async (name) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${name}`)
  console.log(`w6-b7-shoot: ${name}`)
}

/** Sign one NocoBase account in on the PC shell (the w6-b2 form-fill pattern). */
async function pcSignIn(email, password) {
  await evaluate(`localStorage.clear()`)
  let filled = false
  for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
    await send('Page.navigate', { url: `${NC}/signin` })
    for (let probe = 0; probe < 12 && filled !== true; probe++) {
      await sleep(2000)
      filled = await evaluate(`(() => {
        const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
        const pass = [...document.querySelectorAll('input[type=password]')]
        if (inputs.length < 1 || pass.length < 1) return false
        const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
        set(inputs[0], ${JSON.stringify(email)}); set(pass[0], ${JSON.stringify(password)}); return true
      })()`)
    }
  }
  if (filled !== true) throw new Error('sign-in form did not render')
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(5000)
  return await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)
}

/** Wait for the matrix block to render one group table with rows. */
async function waitMatrix(rfqCode) {
  let probe = null
  for (let attempt = 0; attempt < 45 && (probe?.rows ?? 0) < 3; attempt++) {
    await sleep(2000)
    if (windowHookReady()) {
      await evaluate(`window.__w6b7Matrix.setRfq(${JSON.stringify(rfqCode)})`)
      await evaluate(`window.__w6b7Matrix.refresh()`)
      await sleep(1500)
    }
    probe = await evaluate(`(() => {
      const root = document.querySelector('[data-w6b7="matrix"]')
      return { rows: root ? root.querySelectorAll('tbody tr').length : 0, hook: !!window.__w6b7Matrix, rfq: window.__w6b7Matrix?.state?.rfq ?? '' }
    })()`)
  }
  return probe
}
const windowHookReady = () => true

/** Screenshot after the matrix block stays rendered for three consecutive samples (the lazy re-mount races single probes). */
async function shotMatrix(name) {
  let stable = 0
  for (let probe = 0; probe < 24 && stable < 3; probe++) {
    await sleep(1200)
    const state = await evaluate(`(() => { const el = document.querySelector('[data-w6b7="matrix"]'); return { rows: el?.querySelectorAll('tbody tr').length ?? 0, h: el?.offsetHeight ?? 0 } })()`) ?? { rows: 0, h: 0 }
    stable = (state.rows ?? 0) >= 1 && (state.h ?? 0) > 240 ? stable + 1 : 0
  }
  await shot(name)
}

// A. admin: the matrix page.
const admin = await pcSignIn('admin@nocobase.com', 'admin123')
meta.steps.adminIdentity = admin
await send('Page.navigate', { url: `${NC}${MATRIX_PAGE}` })
const probeMatrix = await waitMatrix(RFQ)
meta.steps.matrix = { hook: probeMatrix?.hook === true, rfq: probeMatrix?.rfq, rows: probeMatrix?.rows }
if ((probeMatrix?.rows ?? 0) < 3) throw new Error('matrix rows did not render')
await shotMatrix('w6-b7-00-matrix-top.png')
await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  root.querySelectorAll('details').forEach(d => d.setAttribute('open', ''))
  let el = root
  while (el !== null && el.scrollHeight <= el.clientHeight + 50) el = el.parentElement
  if (el !== null) el.scrollTop = 0
 })()`)
await shotMatrix('w6-b7-01-matrix-formula.png')

await waitMatrix(RFQ)
const inert = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  const disabled = root.querySelectorAll('button[disabled]').length
  const xssExecuted = window.__w6b7Xss === 1
  const xssText = root.innerHTML.includes('<img src=x') || root.textContent.includes('<img src=x')
  const ranks = [...root.querySelectorAll('tbody tr')].map(tr => tr.cells[0]?.textContent.trim() + ' ' + tr.cells[1]?.textContent.trim().slice(0, 14))
  return { disabled, xssExecuted, xssText, ranks }
})()`)
meta.steps.matrixInert = inert
console.log('matrixInert:', JSON.stringify(inert).slice(0, 500))
if (inert.disabled < 1) throw new Error('prevent row button is not disabled')
if (inert.xssExecuted) throw new Error('XSS payload executed')
if (!inert.xssText) throw new Error('XSS supplier name not rendered as text')
await shotMatrix('w6-b7-02-xss-inert.png')

// B. the weight panel: 50/30/20 → 10/2/88 → back.
const rankBefore = inert.ranks.join(' | ')
await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  const set = (sel, v) => { const el = root.querySelector(sel); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
  set('[data-w6b7-wp]', 10); set('[data-w6b7-wl]', 2); set('[data-w6b7-wq]', 88)
})()`)
await evaluate(`document.querySelector('[data-w6b7="matrix"] [data-act="save-weights"]').click()`)
await sleep(3500)
const rankAfter = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  return [...root.querySelectorAll('tbody tr')].map(tr => tr.cells[0]?.textContent.trim() + ' ' + tr.cells[1]?.textContent.trim().slice(0, 14) + ' ' + tr.cells[9]?.textContent.trim()).join(' | ')
})()`)
meta.steps.weightFlip = { before: rankBefore, after: rankAfter, note: await evaluate(`document.querySelector('[data-w6b7-note]')?.textContent ?? ''`) }
await shotMatrix('w6-b7-03-weights-flip.png')
await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  const set = (sel, v) => { const el = root.querySelector(sel); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
  set('[data-w6b7-wp]', 50); set('[data-w6b7-wl]', 30); set('[data-w6b7-wq]', 20)
})()`)
await evaluate(`document.querySelector('[data-w6b7="matrix"] [data-act="save-weights"]').click()`)
await sleep(2500)

// C. teardown the XSS rehearsal rows before the award.
psql(`DELETE FROM pur_quotes WHERE supplier_id = ${xssId};`)
psql(`DELETE FROM srm_suppliers WHERE id = ${xssId};`)
await evaluate(`window.__w6b7Matrix.refresh()`)
await sleep(2500)

// D. negative: finance (outside 采购部) choosing → 403 in the note.
const finance = await pcSignIn('finance@w5b8.demo', 'Finance#2026')
meta.steps.financeIdentity = finance
await send('Page.navigate', { url: `${NC}${MATRIX_PAGE}` })
await waitMatrix(RFQ)
const negOk = await evaluate(`(async () => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  const btn = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Choose'))
  if (btn === undefined) return { clicked: false }
  btn.click()
  await new Promise(r => setTimeout(r, 400))
  const confirm = document.querySelector('[data-act="award"]')
  if (confirm === undefined) return { clicked: true, modal: false }
  confirm.click()
  for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 800)); const note = document.querySelector('[data-w6b7-note]')?.textContent ?? ''; if (note.includes('✗') || note.includes('403')) return { clicked: true, modal: true, note } }
  return { clicked: true, modal: true, note: document.querySelector('[data-w6b7-note]')?.textContent ?? '(timeout)' }
})()`)
meta.steps.negative = negOk
if (negOk?.modal !== true || !String(negOk?.note ?? '').includes('采购部')) throw new Error('finance fence refusal not surfaced in the UI')
await shotMatrix('w6-b7-04-neg-fence-403.png')

// E. the award: buyer (采购部) chooses 珠海鲜丰.
const buyer = await pcSignIn('buyer@w5b8.demo', 'Buyer#2026')
meta.steps.buyerIdentity = buyer
await send('Page.navigate', { url: `${NC}${MATRIX_PAGE}` })
await waitMatrix(RFQ)
await evaluate(`(() => { const el = document.querySelector('[data-w6b7="matrix"]'); if (el) el.scrollIntoView({ block: 'start' }) })()`)
await sleep(2500)
await waitMatrix(RFQ)
const modalOpen = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  const buttons = [...root.querySelectorAll('button')]
  const choose = buttons.find(b => b.textContent.includes('Choose'))
  if (choose === undefined) return false
  choose.click()
  return document.querySelector('[data-act="award"]') !== undefined
})()`)
if (modalOpen !== true) throw new Error('award modal did not open')
await shot('w6-b7-05-award-modal.png')
await sleep(400)
const clickLanded = await evaluate(`(() => { const btn = document.querySelector('[data-act="award"]'); if (btn === null) return false; btn.click(); return true })()`)
meta.steps.awardClick = clickLanded
if (clickLanded !== true) throw new Error('award button vanished before click')
let awardedNote = ''
for (let attempt = 0; attempt < 18; attempt++) {
  await sleep(1000)
  awardedNote = await evaluate(`window.__w6b7Matrix?.state?.note ?? document.querySelector('[data-w6b7-note]')?.textContent ?? ''`) ?? ''
  if (awardedNote.includes('已定标') || awardedNote.includes('✗')) break
}
meta.steps.award = { note: awardedNote }
if (!awardedNote.includes('已定标')) throw new Error(`award did not land: ${awardedNote}`)
await evaluate(`window.__w6b7Matrix.refresh()`)
await sleep(2500)
const banner = await evaluate(`document.querySelector('[data-w6b7="matrix"]')?.innerHTML.includes('已定标 →') ?? false`)
meta.steps.awardedBanner = banner
await shotMatrix('w6-b7-06-awarded-ledger.png')

// F. psql reconciliation of the browser-driven award.
const rfqStatus = psql(`SELECT doc_status FROM pur_rfqs WHERE code = '${RFQ}';`)
const poRow = psql(`SELECT o.code || '|' || o.rfq_id IS NOT NULL || '|' || left(o.compare_note, 90) FROM pur_orders o WHERE o.rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${RFQ}') ORDER BY o.id DESC LIMIT 1;`)
meta.steps.recon = { rfqStatus, po: poRow }
if (rfqStatus !== 'awarded') throw new Error(`rfq not awarded: ${rfqStatus}`)

// G. the other three pages.
await send('Page.navigate', { url: `${NC}${PO_PAGE}` })
let poLanes = 0
for (let attempt = 0; attempt < 30 && poLanes < 5; attempt++) {
  await sleep(2000)
  poLanes = await evaluate(`document.querySelectorAll('[data-w6b7="po-board"] > div:last-child > div').length`) ?? 0
}
meta.steps.poBoardLanes = poLanes
if (poLanes < 5) throw new Error('po-board lanes did not render')
const backLink = await evaluate(`document.querySelector('[data-w6b7="po-board"]')?.innerHTML.includes('来自 ') ?? false`)
meta.steps.poBackLink = backLink
await shot('w6-b7-07-po-swimlane.png')

await send('Page.navigate', { url: `${NC}${INVOICE_PAGE}` })
let chartCanvas = 0
for (let attempt = 0; attempt < 30 && chartCanvas < 1; attempt++) {
  await sleep(2000)
  await evaluate(`(() => { let el = document.querySelector('.ant-table'); while (el !== null && el.scrollHeight <= el.clientHeight + 50) el = el.parentElement; if (el !== null) el.scrollTop = el.scrollHeight; else window.scrollTo(0, document.body.scrollHeight) })()`)
  chartCanvas = await evaluate(`[...document.querySelectorAll('canvas')].filter(c => c.width > 400).length`) ?? 0
}
meta.steps.invoiceCharts = chartCanvas
await shot('w6-b7-08-invoice-bar.png')

await send('Page.navigate', { url: `${NC}${PAY_PAGE}` })
let payCanvas = 0
for (let attempt = 0; attempt < 30 && payCanvas < 1; attempt++) {
  await sleep(2000)
  await evaluate(`(() => { let el = document.querySelector('.ant-table'); while (el !== null && el.scrollHeight <= el.clientHeight + 50) el = el.parentElement; if (el !== null) el.scrollTop = el.scrollHeight; else window.scrollTo(0, document.body.scrollHeight) })()`)
  payCanvas = await evaluate(`[...document.querySelectorAll('canvas')].filter(c => c.width > 400).length`) ?? 0
}
meta.steps.payCharts = payCanvas
await shot('w6-b7-09-pay-doughnut.png')

writeFileSync(`${OUT}w6-b7-shot-meta.json`, JSON.stringify(meta, null, 2))
console.log('w6-b7-shoot: complete')
chromeProc.kill('SIGTERM')
