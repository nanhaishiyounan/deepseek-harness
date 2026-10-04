#!/usr/bin/env node
/**
 * W6-R4 acceptance evidence: CDP headless drive over the live services.
 *
 * 1. ① TC-08: a lead=(null,7,14) RFQ renders 交期 N/A on the null row, the
 *    valid subset rescores (7-day supplier lead score = 100), and the formula
 *    text N/A's the missing axis (assert output lives in
 *    w6-r4-01-demo-actions.log leg 9).
 * 2. ② a nonexistent RFQ (?rfq=RFQ-W6R4-NOPE) surfaces the engine 404 as an
 *    in-page toast note — both sides visible (engine side: leg 10 + curl log).
 * 3. ③ the PO swimlane card carries the 定标快照 details block rendering the
 *    full compare_note (weights/formula/定标人/定标时间).
 * 4. ⑥ the award modal names supplier/amount/lead/total (no bare 报价行 #N)
 *    and a same-frame double click lands the 已定标 race note, not a raw 400.
 * 5. ⑩ the RFQ back-link chip is a real <a> into the matrix page with ?rfq=.
 *
 * Output: demos/acceptance-w6/w6-r4-06..11-*.png + w6-r4-shot-meta.json.
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const NC = 'http://localhost:13000'
const ENGINE = 'http://localhost:13110'
const PORT = 9349
const OUT = new URL('../../demos/acceptance-w6/', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MATRIX_PAGE = '/admin/w3purb7o0r3yqi45'
const PO_PAGE = '/admin/w3puryzkva06iuhh'
const LEAD_RFQ = 'RFQ-W6R4-LEAD'
const AWARD_RFQ = 'RFQ-B9F-0001'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const meta = { generatedAt: new Date().toISOString(), steps: {} }
mkdirSync(OUT, { recursive: true })

const env = readFileSync(new URL('../../platform/nocobase/.env', import.meta.url), 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', timeout: 20_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } })
  if (run.status !== 0) throw new Error(`psql failed (${String(run.status)}): ${sql.slice(0, 100)}\nstderr: ${String(run.stderr ?? '').slice(0, 400)}`)
  return run.stdout.trim()
}

// Scene ①: the lead=(null,7,14) rehearsal RFQ (cleaned by the demo leg, rebuilt here).
const healthz = await (await fetch(`${ENGINE}/healthz`)).json()
if (healthz.ok !== true) throw new Error('engine /healthz not ok')
psql(`INSERT INTO pur_rfqs (code, deadline, doc_status, pr_id) SELECT '${LEAD_RFQ}', CURRENT_DATE + 7, 'approved', NULL WHERE NOT EXISTS (SELECT 1 FROM pur_rfqs WHERE code = '${LEAD_RFQ}');`)
psql(`DELETE FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${LEAD_RFQ}');`)
psql(`DELETE FROM srm_suppliers WHERE code IN ('W6R4-LEAD-A', 'W6R4-LEAD-B');`)
psql(`INSERT INTO srm_suppliers (name, code, lifecycle_status) VALUES ('W6R4交期演练甲', 'W6R4-LEAD-A', 'qualified'), ('W6R4交期演练乙', 'W6R4-LEAD-B', 'qualified');`)
const leadA = psql(`SELECT id FROM srm_suppliers WHERE code = 'W6R4-LEAD-A';`)
const leadB = psql(`SELECT id FROM srm_suppliers WHERE code = 'W6R4-LEAD-B';`)
const wzId = psql(`SELECT id FROM srm_suppliers WHERE name LIKE '%味之源%' LIMIT 1;`)
const productId = psql(`SELECT product_id FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}') AND product_id IS NOT NULL ORDER BY id LIMIT 1;`)
const leadRfqId = psql(`SELECT id FROM pur_rfqs WHERE code = '${LEAD_RFQ}';`)
psql(`INSERT INTO pur_quotes (qty, unit_price, lead_time_days, valid_until, is_won, status, rfq_id, supplier_id, product_id) VALUES (100, 1.00, NULL, CURRENT_DATE + 30, FALSE, 'submitted', ${leadRfqId}, ${leadA}, ${productId}), (100, 0.80, 7, CURRENT_DATE + 30, FALSE, 'submitted', ${leadRfqId}, ${leadB}, ${productId}), (100, 0.90, 14, CURRENT_DATE + 30, FALSE, 'submitted', ${leadRfqId}, ${wzId}, ${productId});`)

// Scene ⑥: reset the award RFQ back to awardable (the w6-b7-shoot pattern).
psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}'));`)
psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}'));`)
psql(`DELETE FROM pur_order_lines WHERE order_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}'));`)
psql(`DELETE FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}');`)
psql(`UPDATE pur_quotes SET status = 'submitted', is_won = FALSE WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}') AND status IN ('submitted','lost','backup') AND product_id IS NOT NULL;`)
psql(`UPDATE pur_rfqs SET doc_status = 'approved', awarded_at = NULL WHERE code = '${AWARD_RFQ}';`)
psql(`UPDATE pur_quotes SET status = 'draft' WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}') AND product_id IS NULL AND status = 'submitted';`)
const winnerQuoteId = psql(`SELECT q.id FROM pur_quotes q JOIN srm_suppliers s ON s.id = q.supplier_id WHERE q.rfq_id = (SELECT id FROM pur_rfqs WHERE code = '${AWARD_RFQ}') AND q.status = 'submitted' AND s.name LIKE '%鲜丰%' LIMIT 1;`)

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r4-shot-profile', '--window-size=1440,900', '--disable-gpu', 'about:blank',
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
// The SPA's flowModels fetches can ride the HTTP disk cache — a freshly
// upgraded JSBlock would keep executing its previous code for a cache TTL.
await send('Network.enable').catch(() => {})
await send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {})
const consoleErrors = []
await send('Runtime.enable')
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(String(message.params?.type))) {
    consoleErrors.push(`${String(message.params?.type)}: ${JSON.stringify(message.params?.args?.map(a => a.value ?? a.description ?? '')).slice(0, 300)}`)
  }
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
}
meta.steps.consoleErrors = consoleErrors
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false })
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const shot = async (name) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${name}`)
  console.log(`w6-r4-shoot: ${name}`)
}

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

async function waitMatrix(rfqCode, minRows = 3) {
  let probe = null
  for (let attempt = 0; attempt < 45 && (probe?.rows ?? 0) < minRows; attempt++) {
    await sleep(2000)
    if (await evaluate(`!!window.__w6b7Matrix`)) {
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
async function shotMatrix(name) {
  let stable = 0
  for (let probe = 0; probe < 24 && stable < 3; probe++) {
    await sleep(1200)
    const state = await evaluate(`(() => { const el = document.querySelector('[data-w6b7="matrix"]'); return { rows: el?.querySelectorAll('tbody tr').length ?? 0, h: el?.offsetHeight ?? 0 } })()`) ?? { rows: 0, h: 0 }
    stable = (state.rows ?? 0) >= 1 && (state.h ?? 0) > 240 ? stable + 1 : 0
  }
  await shot(name)
}

// ── ① TC-08: the lead-N/A matrix (admin).
const admin = await pcSignIn('admin@nocobase.com', 'admin123')
meta.steps.adminIdentity = admin
await send('Page.navigate', { url: `${NC}${MATRIX_PAGE}?rfq=${LEAD_RFQ}` })
const leadProbe = await waitMatrix(LEAD_RFQ)
meta.steps.tc08 = { hook: leadProbe?.hook === true, rfq: leadProbe?.rfq, rows: leadProbe?.rows }
if ((leadProbe?.rows ?? 0) < 3) throw new Error(`tc08 matrix rows insufficient: ${JSON.stringify(leadProbe)}`)
let leadDom = await evaluate(`(() => {
  try {
    const root = document.querySelector('[data-w6b7="matrix"]')
    if (root === null) return { missing: 'root' }
    const cells = [...root.querySelectorAll('tbody tr')].map(tr => tr.cells[3]?.textContent.trim())
    const leadScores = [...root.querySelectorAll('tbody tr')].map(tr => tr.cells[8]?.textContent.trim())
    const formula = [...root.querySelectorAll('tbody tr')].map(tr => tr.querySelector('details div')?.textContent ?? '')
    return { cells, leadScores, naFormula: formula.find(f => f.includes('交期分=N/A')) ?? '' }
  } catch (error) { return { missing: String(error && error.message ? error.message : error) } }
})()`)
if (leadDom === undefined || leadDom.missing !== undefined) {
  await sleep(3000)
  leadDom = await evaluate(`(() => {
    const root = document.querySelector('[data-w6b7="matrix"]')
    if (root === null) return { missing: 'root' }
    const cells = [...root.querySelectorAll('tbody tr')].map(tr => tr.cells[3]?.textContent.trim())
    const leadScores = [...root.querySelectorAll('tbody tr')].map(tr => tr.cells[8]?.textContent.trim())
    const formula = [...root.querySelectorAll('tbody tr')].map(tr => tr.querySelector('details div')?.textContent ?? '')
    return { cells, leadScores, naFormula: formula.find(f => f.includes('交期分=N/A')) ?? '' }
  })()`)
}
meta.steps.tc08Dom = { cells: leadDom.cells, leadScores: leadDom.leadScores, formulaNa: leadDom.naFormula.slice(0, 120) }
if (!leadDom.cells.some(c => c.includes('交期 N/A'))) throw new Error('lead N/A cell missing')
if (!leadDom.leadScores.includes('N/A')) throw new Error('lead score N/A missing')
if (!leadDom.naFormula.includes('交期分=N/A')) throw new Error('formula N/A text missing')
await evaluate(`(() => { const root = document.querySelector('[data-w6b7="matrix"]'); root.querySelectorAll('details').forEach(d => d.setAttribute('open', '')) })()`)
await shotMatrix('w6-r4-06-tc08-lead-na.png')

// ── ② the 404 toast (admin keeps the session).
await send('Page.navigate', { url: `${NC}${MATRIX_PAGE}?rfq=RFQ-W6R4-NOPE` })
let note404 = ''
for (let attempt = 0; attempt < 20 && !note404.includes('RFQ 不存在'); attempt++) {
  await sleep(1500)
  note404 = await evaluate(`window.__w6b7Matrix?.state?.note ?? document.querySelector('[data-w6b7-note]')?.textContent ?? ''`) ?? ''
}
meta.steps.toast404 = note404
if (!note404.includes('RFQ 不存在或已关闭')) throw new Error(`404 toast missing: ${note404}`)
await shot('w6-r4-07-404-toast.png')

// ── ⑥ the award modal with real supplier facts + the double-click race note (buyer).
const buyer = await pcSignIn('buyer@w5b8.demo', 'Buyer#2026')
meta.steps.buyerIdentity = buyer
await send('Page.navigate', { url: `${NC}${MATRIX_PAGE}?rfq=${AWARD_RFQ}` })
await waitMatrix(AWARD_RFQ)
const modalText = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b7="matrix"]')
  const choose = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Choose'))
  if (choose === undefined) return ''
  choose.click()
  const card = document.querySelector('[data-act="modal-card"]')
  return card ? card.textContent : ''
})()`)
meta.steps.modal = modalText.replace(/\s+/g, ' ').slice(0, 220)
if (!modalText.includes('¥') || modalText.includes('报价行 #')) throw new Error('modal lacks supplier facts or still shows bare 报价行 #N')
await shot('w6-r4-09-modal-info.png')
// Same-frame double click: first lands 200, the racing second gets 409 → the race note.
const raceClicked = await evaluate(`(() => { const btn = document.querySelector('[data-act="award"]'); if (btn === null) return false; btn.click(); btn.click(); return true })()`)
meta.steps.raceClicked = raceClicked
if (raceClicked !== true) throw new Error('award button vanished before double click')
let raceNote = ''
for (let attempt = 0; attempt < 20 && !raceNote.includes('已定标'); attempt++) {
  await sleep(1000)
  raceNote = await evaluate(`window.__w6b7Matrix?.state?.note ?? ''`) ?? ''
}
meta.steps.raceNote = raceNote
if (!raceNote.includes('已定标')) throw new Error(`race note missing: ${raceNote}`)
await shot('w6-r4-10-double-click-race.png')
const awardSt = psql(`SELECT doc_status FROM pur_rfqs WHERE code = '${AWARD_RFQ}';`)
meta.steps.awardState = awardSt
if (awardSt !== 'awarded') throw new Error(`award did not land: ${awardSt}`)

// ── ③ the PO swimlane 定标快照 block + ⑩ the clickable RFQ back-link.
await send('Page.navigate', { url: `${NC}${PO_PAGE}` })
// The lazy block mount can outrun a fixed 60s window — probe by rendered
// content size (the lanes container grows past kilobytes once real cards land).
let poLanes = 0
for (let attempt = 0; attempt < 75 && poLanes < 6000; attempt++) {
  await sleep(2000)
  poLanes = await evaluate(`(() => {
    const el = document.querySelector('[data-w6b7="po-board"]')
    if (el === null) return 0
    const last = el.children[el.children.length - 1]
    return last ? last.innerHTML.length : 0
  })()`) ?? 0
}
const laneCount = await evaluate(`(() => { const el = document.querySelector('[data-w6b7="po-board"]'); const last = el ? el.children[el.children.length - 1] : null; return last ? last.children.length : 0 })()`) ?? 0
const poDiag = await evaluate(`(() => {
  const el = document.querySelector('[data-w6b7="po-board"]')
  return { has: el !== null, hook: !!window.__w6b7PoBoard, children: el ? el.children.length : 0, html: el ? el.innerHTML.slice(0, 120) : '' }
})()`)
meta.steps.poBoardLanes = { lanesBytes: poLanes, laneDivs: laneCount }
if (poLanes < 6000) throw new Error(`po-board lanes did not render: ${JSON.stringify({ poDiag, consoleErrors: consoleErrors.slice(-8) })}`)
// The SPA may keep executing the previous JSBlock code for minutes after the
// flowModels row is upgraded (a slow second mount, not a server cache — the
// surface GET already returns the new code, and a reload resets the wait).
// Sit still and poll; scrolling keeps the lazy renderer interested.
let poProbe = { hasSnapshot: false }
for (let attempt = 0; attempt < 120 && poProbe.hasSnapshot !== true; attempt++) {
  await sleep(2000)
  if (attempt % 10 === 9) {
    await evaluate(`(() => { const el = document.querySelector('[data-w6b7=\"po-board\"]'); if (el) { let anc = el; while (anc !== null && anc.scrollHeight <= anc.clientHeight + 50) anc = anc.parentElement; if (anc !== null) anc.scrollTop = anc.scrollHeight } else window.scrollTo(0, document.body.scrollHeight) })()`).catch(() => {})
  }
  poProbe = await evaluate(`(() => {
    const board = document.querySelector('[data-w6b7="po-board"]')
    if (board === null) return { hasSnapshot: false }
    // Old POs carry compare_note text without the R4 定标时间 stamp — the
    // R4 award receipt is distinguished by that exact marker.
    const snapshot = [...board.querySelectorAll('details')].find(d => d.textContent.includes('定标快照') && d.textContent.includes('定标时间'))
    if (snapshot === undefined) return { hasSnapshot: false }
    snapshot.setAttribute('open', '')
    const link = board.querySelector('a[href*="rfq="]')
    return { hasSnapshot: true, snapshotText: snapshot.textContent.replace(/\\s+/g, ' ').slice(0, 220), hasTime: snapshot.textContent.includes('定标时间'), linkHref: link ? link.getAttribute('href') : null, linkText: link ? link.textContent.trim() : null }
  })()`).catch(() => ({ hasSnapshot: false })) ?? { hasSnapshot: false }
}
meta.steps.poSnapshot = poProbe
if (poProbe.hasSnapshot !== true || poProbe.hasTime !== true) throw new Error('PO 定标快照 block missing or lacks 定标时间')
if (typeof poProbe.linkHref !== 'string' || !poProbe.linkHref.includes('rfq=')) throw new Error('RFQ back-link chip is not a link with ?rfq=')
await evaluate(`(() => {
  const board = document.querySelector('[data-w6b7="po-board"]')
  const link = board.querySelector('a[href*="rfq="]')
  let el = link; while (el !== null && el.scrollHeight <= el.clientHeight + 50) el = el.parentElement; if (el !== null) el.scrollTop = 0
  link.scrollIntoView({ block: 'center' })
})()`)
await sleep(800)
await shot('w6-r4-08-po-snapshot.png')

// ── ⑩ follow the back-link: the matrix page loads with that RFQ preselected.
await evaluate(`document.querySelector('[data-w6b7="po-board"] a[href*="rfq="]').click()`)
await sleep(6000)
const landed = await evaluate(`({ url: location.pathname + location.search, rfq: window.__w6b7Matrix?.state?.rfq ?? '', rows: document.querySelector('[data-w6b7="matrix"]')?.querySelectorAll('tbody tr').length ?? 0 })`)
meta.steps.backLinkLanding = landed
await shot('w6-r4-11-backlink-landing.png')
if (!String(landed.url).includes('rfq=')) throw new Error(`back-link navigation did not carry ?rfq: ${JSON.stringify(landed)}`)

// Teardown the TC-08 rehearsal rows (the award leg's RFQ stays awarded — its
// terminal state is the demo leg's contract).
psql(`DELETE FROM pur_quotes WHERE rfq_id = ${leadRfqId}; DELETE FROM pur_rfqs WHERE id = ${leadRfqId}; DELETE FROM srm_suppliers WHERE code IN ('W6R4-LEAD-A', 'W6R4-LEAD-B');`)
meta.steps.cleanupLeadRfq = psql(`SELECT count(*) FROM pur_rfqs WHERE code = '${LEAD_RFQ}';`)

writeFileSync(`${OUT}w6-r4-shot-meta.json`, JSON.stringify(meta, null, 2))
console.log('w6-r4-shoot: complete')
chromeProc.kill('SIGTERM')
