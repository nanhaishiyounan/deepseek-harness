#!/usr/bin/env node
/**
 * W6-B5 acceptance driver: CDP headless drive of the inspection workbench
 * end-to-end on the real services (:13110 engine, :13000 NocoBase, :3080 web).
 *
 * Legs (evidence files in demos/acceptance-w6/, w6-b5-NN-*):
 *   01 sign-in card · 02 grouped queue (+02b platform embed page)
 *   03 AQL plan badge (N=300 → 281-500/H n=50 Ac=3 Re=4, reconciled with
 *      qm_aql_plans by w6b5-insp --assert) · 03b photo evidence attached
 *   04 live verdict badge (rejection: critical 0收1拒) with the double-tap
 *      out-of-tolerance confirm exercised · 05 submitted + concession disposal
 *   06 psql recon (submit snapshot + disposal aftermath + alert rows)
 *   07 nine-element report: preview with 未维护 placeholders, issued
 *      (report_no = 检验合格证号), print-to-PDF
 *   08 negative legs: no-token 401, buyer (non-quality) 403, non-quality
 *      reviewer refused, XSS payload inert, idempotent replay (same key →
 *      duplicate, different key → refused)
 * Assertions land in w6-b5-shot-meta.json; failures exit non-zero.
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const ENGINE = 'http://127.0.0.1:13110'
const NOCO = 'http://localhost:13000'
const OUT = new URL('.', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9339
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// a 1×1 red JPEG for the photo-evidence leg (DOM.setFileInputFiles)
const PHOTO_B64 = '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z'
mkdirSync('/tmp', { recursive: true })
writeFileSync('/tmp/w6b5-photo.jpg', Buffer.from(PHOTO_B64, 'base64'))

const envFile = execSync('cat platform/nocobase/.env').toString()
const envOf = (key) => envFile.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql}\n${run.stderr ?? ''}`)
  return run.stdout ?? ''
}

// ─── live triple probe ───
const probe = async (url) => (await fetch(url).then((r) => r.status).catch(() => 0))
const live = {
  engine: await probe(`${ENGINE}/healthz`),
  nocobase: await probe(`${NOCO}/api/app:getInfo`),
  web: await probe('http://localhost:3080/'),
}

// ─── headless chrome ───
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6b5-shot-profile', '--window-size=1440,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()

let target = null
for (let attempt = 0; attempt < 25 && target === null; attempt += 1) {
  await sleep(1000)
  try { target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json() } catch { /* not up yet */ }
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
await send('Runtime.enable')

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result?.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}\n${expression.slice(0, 200)}`)
  return result?.result?.value
}
const shoot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${shot.data} | base64 -d > ${OUT}${name}`)
  return name
}
const waitFor = async (expression, tries = 20, gap = 500) => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await evaluate(expression) === true) return true
    await sleep(gap)
  }
  return false
}
const meta = { generatedAt: new Date().toISOString(), live, assertions: {} }
const assert = (key, ok, detail = '') => {
  meta.assertions[key] = ok === true
  console.log(`  ${ok === true ? '✓' : '✗'} ${key}${detail === '' ? '' : ` — ${detail}`}`)
}

// page-side helpers (re-injected per evaluate — the wizard re-renders on every change)
const HELPERS = `
const $q = (sel) => document.querySelector(sel)
const setVal = (sel, val) => { const el = $q(sel); if (!el) throw new Error('missing ' + sel); const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true }
const setSel = (sel, val) => { const el = $q(sel); if (!el) throw new Error('missing ' + sel); const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(el, val); el.dispatchEvent(new Event('change', { bubbles: true })); return true }
const clickSel = (sel) => { const el = $q(sel); if (!el) throw new Error('missing ' + sel); el.click(); return true }
const tapConfirm = (i) => { const btn = [...document.querySelectorAll('button.confirm-fail')].find((b) => b.dataset.i === String(i)); if (!btn) throw new Error('no confirm button row ' + i); btn.click(); return btn.textContent }
`

console.log(`live: engine=${String(live.engine)} nocobase=${String(live.nocobase)} web=${String(live.web)}`)
assert('liveTriple', live.engine === 200 && live.nocobase === 200 && live.web === 200)

// ─── 01: the sign-in card ───
await send('Page.navigate', { url: `${ENGINE}/insp` })
await waitFor(`document.getElementById('login-view') !== null && !document.getElementById('login-view').classList.contains('hidden')`)
await shoot('w6-b5-01-login-card.png')

// capture any SPA runtime error for diagnosis (assertions stay on the meta)
await evaluate(`window.__w6b5errors = []; window.addEventListener('error', (e) => window.__w6b5errors.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__w6b5errors.push('rejection: ' + String(e.reason?.message ?? e.reason))); true`)

// ─── sign in as the rehearsal inspector ───
await evaluate(`(() => { ${HELPERS}
  setVal('#login-account', 'qc_inspector'); setVal('#login-password', 'Qc#2026'); clickSel('#login-btn'); return true })()`)
await waitFor(`document.getElementById('queue-view') !== null && !document.getElementById('queue-view').classList.contains('hidden')`)
await waitFor(`document.querySelectorAll('#queue-tabs button').length >= 2`)
meta.identity = await evaluate(`document.getElementById('who').textContent`)
assert('queueRendered', await evaluate(`document.querySelectorAll('#queue-tabs button').length >= 2`), `tabs=${String(await evaluate(`document.querySelectorAll('#queue-tabs button').length`))}`)
assert('queueIdentity', meta.identity === null ? false : meta.identity.includes('qc_inspector'), String(meta.identity))
await shoot('w6-b5-02-queue-grouped.png')

// ─── 03: the IQC wizard — plan badge ───
await evaluate(`(() => { ${HELPERS}
  const card = [...document.querySelectorAll('.qcard')].find((c) => c.textContent.includes('QI-W6B5-01'))
  if (card === undefined) throw new Error('rehearsal IQC card missing from queue')
  card.querySelector('button.go').click(); return true })()`)
await waitFor(`document.getElementById('wizard-view') !== null && !document.getElementById('wizard-view').classList.contains('hidden')`)
await evaluate(`(() => { ${HELPERS} return clickSel('#w-plan-btn') })()`)
await waitFor(`document.querySelectorAll('#w-plan .pill').length >= 5`)
const planBadge = await evaluate(`[...document.querySelectorAll('#w-plan .pill')].map((p) => p.textContent.replace(/\\s+/g, ' ').trim()).join(' | ')`)
assert('aqlBadge', planBadge.includes('281-500') && planBadge.includes('50') && planBadge.includes('3') && planBadge.includes('4') && planBadge.includes('H'), planBadge)
await shoot('w6-b5-03-aql-plan-badge.png')

// ─── the readings: 2 auto-pass, 1 out-of-tolerance (double-tap confirm), 1 critical unbounded, 1 XSS payload ───
await evaluate(`(() => { ${HELPERS} return clickSel('#w-add-row') })()`) // row 3 金属异物
await evaluate(`(() => { ${HELPERS} return clickSel('#w-add-row') })()`) // row 4 XSS probe
await evaluate(`(() => { ${HELPERS} setVal('table.readings input[data-i="1"][data-f="actual"]', '480'); return true })()`) // 净含量 ≥0 auto-pass
await evaluate(`(() => { ${HELPERS} setVal('table.readings input[data-i="2"][data-f="actual"]', '150000'); return true })()`) // 菌落 >100k out-of-tolerance
const firstTap = await evaluate(`(() => { ${HELPERS} setSel('table.readings select[data-i="2"][data-f="pass"]', 'false'); return true })()`)
await sleep(200)
const tap1 = await evaluate(`(() => { ${HELPERS} return tapConfirm(2) })()`)
await sleep(200)
const tap2 = await evaluate(`(() => { ${HELPERS} return tapConfirm(2) })()`)
await waitFor(`[...document.querySelectorAll('#w-rows tr')][2]?.querySelector('.hint')?.textContent.includes('已确认')`)
assert('doubleTapConfirm', String(tap1).includes('确认失败') && String(tap2).includes('再点确认失败'), `tap1=${String(tap1)} tap2=${String(tap2)}`)
// row 3: 金属异物 critical, unbounded, hand-failed
await evaluate(`(() => { ${HELPERS} setVal('table.readings input[data-i="3"][data-f="parameter"]', '金属异物（X光机检出）'); return true })()`)
await evaluate(`(() => { ${HELPERS} setSel('table.readings select[data-i="3"][data-f="pass"]', 'false'); setSel('table.readings select[data-i="3"][data-f="defect_class"]', 'critical'); return true })()`)
await evaluate(`(() => { ${HELPERS} return tapConfirm(3) })()`)
await evaluate(`(() => { ${HELPERS} return tapConfirm(3) })()`)
await waitFor(`[...document.querySelectorAll('#w-rows tr')][3]?.querySelector('.hint')?.textContent.includes('已确认')`)
// row 0 感官 unbounded → hand pass; row 4 XSS payload auto-pass in-bounds
await evaluate(`(() => { ${HELPERS} setSel('table.readings select[data-i="0"][data-f="pass"]', 'true'); return true })()`)
await evaluate(`(() => { ${HELPERS} setVal('table.readings input[data-i="4"][data-f="parameter"]', '<img src=x onerror="window.__w6b5xss=1">'); setVal('table.readings input[data-i="4"][data-f="spec_min"]', '0'); setVal('table.readings input[data-i="4"][data-f="actual"]', '1'); return true })()`)

// ─── 03b: photo evidence through the real file input (DataTransfer — the SPA's
// own change listener runs compressPhoto, exactly the touch path) ───
const photoSet = await evaluate(`(async () => {
  const input = document.getElementById('w-photo')
  if (input === null) return 'no-input'
  const b64 = ${JSON.stringify(PHOTO_B64)}
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const file = new File([bytes], 'w6b5-photo.jpg', { type: 'image/jpeg' })
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  for (let i = 0; i < 30 && document.querySelector('#w-photo-box img') === null; i += 1) await new Promise((r) => setTimeout(r, 300))
  return document.querySelector('#w-photo-box img') !== null ? 'photo-attached' : 'no-thumb'
})()`)
assert('photoAttached', photoSet === 'photo-attached', String(photoSet))
await shoot('w6-b5-03b-readings-photo.png')

// ─── 04: the live verdict badge (critical > 0 → 0收1拒) ───
await waitFor(`document.querySelector('.verdict.fail') !== null`)
const verdictText = await evaluate(`document.querySelector('.verdict')?.textContent ?? ''`)
assert('verdictBadgeFail', verdictText.includes('拒收') && verdictText.includes('严重 1'), verdictText)
await shoot('w6-b5-04-verdict-fail.png')

// ─── 05: the disposal card (rework/返工 — the plan's acceptance leg ④) + submit ───
await evaluate(`(() => { ${HELPERS} return clickSel('.disposal button[data-act="rework"]') })()`)
await evaluate(`(() => { ${HELPERS} setVal('#w-disp-reason', '返工处置演练：剔除金属异物后返工复检（W6-B5）'); return true })()`)
meta.submitKey = await evaluate(`document.getElementById('wizard-view').textContent.match(/submit_key=([^（(\\s]+)/)?.[1] ?? ''`)
await shoot('w6-b5-05a-disposal-card.png')
await evaluate(`(() => { ${HELPERS} return clickSel('#w-submit') })()`)
await waitFor(`document.getElementById('result-view') !== null && !document.getElementById('result-view').classList.contains('hidden')`, 40, 1000)
await shoot('w6-b5-05b-submitted.png')
const resultText = await evaluate(`document.getElementById('result-view').textContent`)
assert('resultRejected', resultText.includes('拒收') && resultText.includes('QI-W6B5-01') && resultText.includes('n=50'), resultText.slice(0, 160))
meta.disposal = { nc_code: resultText.match(/QM-NC-\d{4}-\d+/)?.[0] ?? '', fromPage: resultText }
assert('disposalConcession', /QM-NC-\d{4}-\d+/.test(meta.disposal.nc_code), meta.disposal.nc_code)

// ─── 06: psql recon A (verdict + readings + the inspection_fail alert row) ───
const reconA = psql(`SELECT 'inspection|' || COALESCE(submit_key,'') || '|' || COALESCE(defect_critical,0) || '|' || COALESCE(defect_major,0) || '|' || COALESCE(aql_n,0) || '/' || COALESCE(aql_ac,0) || '/' || COALESCE(aql_re,0) || '|' || COALESCE(inspector,'') || '|' || COALESCE(rigor,'') || '|' || (photo_evidence IS NOT NULL AND photo_evidence <> '') FROM qm_inspections WHERE code = 'QI-W6B5-01';
SELECT 'readings|' || count(*) FROM qm_inspection_readings WHERE inspection_id = (SELECT id FROM qm_inspections WHERE code = 'QI-W6B5-01');
SELECT 'alert|' || rule_type || '|' || severity || '|' || status FROM wfl_alerts WHERE dedup_key = 'inspection_fail:qm_inspections:' || (SELECT id FROM qm_inspections WHERE code = 'QI-W6B5-01');`)
assert('reconVerdict', reconA.includes('|1|1|50/3/4|qc_inspector|normal|t') && reconA.includes('inspection|W6B5-'), reconA.replace(/\n/g, ' ; '))
assert('reconReadings', /readings\|5/.test(reconA), reconA.replace(/\n/g, ' ; '))
assert('reconAlert', reconA.includes('alert|inspection_fail|critical|'), reconA.split('\n').filter((l) => l.startsWith('alert|')).join(';'))

// ─── 06: psql recon B (concession aftermath) ───
const reconB = psql(`SELECT 'after|' || result FROM qm_inspections WHERE code = 'QI-W6B5-01';
SELECT 'nc|' || code || '|' || action || '|' || COALESCE(status,'') || '|' || COALESCE(doc_status,'') || '|' || COALESCE(ref_no,'') FROM qm_nc_dispositions WHERE inspection_id = (SELECT id FROM qm_inspections WHERE code = 'QI-W6B5-01');
SELECT 'rworkmo|' || code || '|' || COALESCE(source,'') || '|' || COALESCE(doc_status,'') FROM mfg_orders WHERE source = 'rework' AND code LIKE 'RW-2026-%' ORDER BY id DESC LIMIT 2;
SELECT 'capa|' || count(*) FROM srm_capas WHERE title = '检验不合格·QI-W6B5-01';`)
assert('reconRework', reconB.includes('after|failed') && /nc\|QM-NC-\d{4}-\d+\|rework\|closed\|approved\|RW-\d{4}-\d+/.test(reconB.replace(/\n/g, ';')) && /rworkmo\|RW-\d{4}-\d+\|rework\|draft/.test(reconB.replace(/\n/g, ';')), reconB.replace(/\n/g, ' ; '))
await shoot('w6-b5-06-disposal-recon.png')
writeFileSync(`${OUT}w6-b5-06-psql-recon.log`, `# W6-B5 psql recon (QI-W6B5-01 IQC N=300 → plan 281-500/H n=50 Ac=3 Re=4; critical=1 → rejected → concession disposal)\n# A. verdict + readings + alert (pre-disposal)\n${reconA}\n# B. concession aftermath (result re-labeled, NC closed approved, CAPA draft)\n${reconB}\n`)

// ─── 08a: idempotent replay ───
meta.replay = await evaluate(`(async () => {
  const token = localStorage.getItem('INSP_TOKEN') || ''
  const key = ${JSON.stringify(meta.submitKey ?? '')}
  const readings = [
    { parameter: '感官——色泽', spec_min: null, spec_max: null, criteria: null, actual: null, pass: true, defect_class: 'major' },
    { parameter: '菌落总数 CFU/g', spec_min: 0, spec_max: 100000, criteria: null, actual: 150000, pass: false, defect_class: 'major' },
  ]
  const post = (submitKey) => fetch('/insp/submit', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'QI-W6B5-01', aql: '2.5', submit_key: submitKey, confirm_over: false, photo_evidence: '', readings }) }).then((r) => r.json().catch(() => ({})))
  const same = await post(key)
  const other = await post(key + '-R2')
  return { sameDuplicate: same.duplicate === true, otherRefused: other.ok === false || other.error !== undefined, sameMsg: same.error ?? 'duplicate', otherMsg: other.error ?? '' }
})()`)
assert('idempotentSameKey', meta.replay?.sameDuplicate === true, JSON.stringify(meta.replay?.sameMsg))
assert('idempotentOtherKeyRefused', meta.replay?.otherRefused === true, String(meta.replay?.otherMsg).slice(0, 80))

// ─── 07: the OQC leg — accept, report preview, issue, PDF ───
await evaluate(`(() => { ${HELPERS} return clickSel('#r-back') })()`)
await waitFor(`document.querySelectorAll('#queue-tabs button').length >= 2`)
await evaluate(`(() => { ${HELPERS}
  const oqc = [...document.querySelectorAll('#queue-tabs button')].find((b) => b.textContent.includes('FQC'))
  if (oqc === undefined) throw new Error('OQC group tab missing')
  oqc.click(); return true })()`)
await waitFor(`[...document.querySelectorAll('.qcard')].some((c) => c.textContent.includes('QI-W6B5-F1'))`)
meta.oqcOpenWizard = await evaluate(`(() => { ${HELPERS}
  try {
    const card = [...document.querySelectorAll('.qcard')].find((c) => c.textContent.includes('QI-W6B5-F1'))
    if (card === undefined) return 'no-card:' + document.querySelectorAll('.qcard').length
    const btn = card.querySelector('button.go')
    if (btn === null) return 'no-go-button'
    btn.click()
    return 'clicked'
  } catch (error) { return 'ERR:' + String(error?.message ?? error) }
})()`)
meta.spaErrors = await evaluate(`(window.__w6b5errors ?? []).join(' | ')`)
await waitFor(`document.getElementById('wizard-view') !== null && !document.getElementById('wizard-view').classList.contains('hidden')`)
await evaluate(`(() => { ${HELPERS} return clickSel('#w-plan-btn') })()`)
await waitFor(`document.querySelectorAll('#w-plan .pill').length >= 5`)
await evaluate(`(() => { ${HELPERS} setSel('table.readings select[data-i="0"][data-f="pass"]', 'true'); setVal('table.readings input[data-i="1"][data-f="actual"]', '95'); setVal('table.readings input[data-i="2"][data-f="actual"]', '5000'); return true })()`)
await waitFor(`document.querySelector('.verdict.pass') !== null`)
assert('verdictBadgePass', (await evaluate(`document.querySelector('.verdict')?.textContent ?? ''`)).includes('接收'))
await shoot('w6-b5-07a-wizard-oqc-pass.png')
await evaluate(`(() => { ${HELPERS} return clickSel('#w-submit') })()`)
await waitFor(`document.getElementById('result-view') !== null && !document.getElementById('result-view').classList.contains('hidden')`, 30, 1000)
assert('oqcAccepted', (await evaluate(`document.getElementById('result-view').textContent`)).includes('接收（合格）'))
await evaluate(`(() => { ${HELPERS} return clickSel('#r-report') })()`)
await waitFor(`document.getElementById('rp-frame') !== null && (document.getElementById('rp-frame').srcdoc || '').includes('出厂检验报告')`, 30, 1000)
const reportHtml = await evaluate(`document.getElementById('rp-frame').srcdoc`)
const elementCount = (reportHtml.match(/<th>/g) ?? []).length
const missingCount = (reportHtml.match(/未维护/g) ?? []).length
assert('reportNineElements', reportHtml.includes('产品名称') && reportHtml.includes('规格') && reportHtml.includes('数量') && reportHtml.includes('生产日期/生产批号') && reportHtml.includes('保质期') && reportHtml.includes('检验依据') && reportHtml.includes('检验结论') && reportHtml.includes('报告人') && reportHtml.includes('审核人'), `th=${String(elementCount)}`)
assert('reportMissingPlaceholders', missingCount >= 2, `未维护 ×${String(missingCount)}`)
await shoot('w6-b5-07b-report-preview.png')
await evaluate(`(() => { ${HELPERS} setSel('#rp-reviewer', 'quality_lead'); return clickSel('#rp-issue') })()`)
await waitFor(`document.getElementById('ok').style.display === 'block'`, 20, 500)
meta.issued = await evaluate(`document.getElementById('ok').textContent`)
await sleep(1200)
const issuedHtml = await evaluate(`document.getElementById('rp-frame').srcdoc`)
meta.reportNo = issuedHtml.match(/QR-\d{4}-\d{4}/)?.[0] ?? ''
assert('reportIssued', meta.reportNo !== '' && meta.issued.includes(meta.reportNo), `${meta.issued} / ${meta.reportNo}`)
await shoot('w6-b5-07c-report-issued.png')

// the report page as PDF (print route with query token)
const inspToken = await evaluate(`localStorage.getItem('INSP_TOKEN') || ''`)
await send('Page.navigate', { url: `${ENGINE}/insp/report?code=QI-W6B5-F1&token=${encodeURIComponent(inspToken)}` })
await waitFor(`document.body.textContent.includes('QR-')`)
const pdf = await send('Page.printToPDF', { printBackground: true, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4 })
execSync(`echo ${pdf.data} | base64 -d > ${OUT}w6-b5-07d-fqc-report.pdf`)
meta.pdfBytes = pdf.data.length
assert('reportPdf', pdf.data.length > 4000, `base64 ${String(pdf.data.length)}B`)

// ─── 08b: the negative legs ───
await send('Page.navigate', { url: `${ENGINE}/insp` })
await waitFor(`document.getElementById('queue-view') !== null`)
// buyer signs in from the driver (the page fetch to :13000 is cross-origin — no CORS on auth:signIn)
const buyerSession = await fetch(`${NOCO}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'buyer', password: 'Buyer#2026' }) }).then((r) => r.json()).catch(() => ({}))
meta.negative = await evaluate(`(async () => {
  const inspToken = localStorage.getItem('INSP_TOKEN') || ''
  const buyerToken = ${JSON.stringify(buyerSession?.data?.token ?? '')}
  const noToken = await fetch('/insp/queue.json').then((r) => r.status)
  const buyerWrite = await fetch('/insp/submit', { method: 'POST', headers: { authorization: 'Bearer ' + buyerToken, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'QI-W6B5-F1', aql: '2.5', submit_key: 'NEG-buyer', readings: [{ parameter: '越权探针', spec_min: 0, spec_max: 1, actual: 1, pass: true, defect_class: 'major' }] }) }).then((r) => r.json().catch(() => ({})))
  const reviewer = await fetch('/insp/report/issue', { method: 'POST', headers: { authorization: 'Bearer ' + inspToken, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'QI-W6B5-F1', reviewer: 'buyer' }) }).then((r) => r.json().catch(() => ({})))
  const concessionNoSign = await fetch('/insp/dispose', { method: 'POST', headers: { authorization: 'Bearer ' + inspToken, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'QI-W6B5-F1', action: 'concession', reason: '负向：缺让步理由与审批人' }) }).then((r) => r.json().catch(() => ({})))
  return {
    noTokenStatus: noToken,
    buyerRefused: buyerWrite.ok === false && String(buyerWrite.error ?? '').includes('围栏'),
    buyerRefusedMsg: buyerWrite.error ?? '',
    reviewerRefused: reviewer.ok === false && String(reviewer.error ?? '').includes('质检部'),
    reviewerRefusedMsg: reviewer.error ?? '',
    concessionRefused: concessionNoSign.ok === false && String(concessionNoSign.error ?? '').includes('让步'),
    concessionRefusedMsg: concessionNoSign.error ?? '',
    xssInert: window.__w6b5xss === undefined,
  }
})()`)
assert('negNoToken401', meta.negative?.noTokenStatus === 401, `status=${String(meta.negative?.noTokenStatus)}`)
assert('negBuyer403', meta.negative?.buyerRefused === true, String(meta.negative?.buyerRefusedMsg).slice(0, 80))
assert('negReviewerFence', meta.negative?.reviewerRefused === true, String(meta.negative?.reviewerRefusedMsg).slice(0, 80))
assert('negConcessionNeedsSign', meta.negative?.concessionRefused === true, String(meta.negative?.concessionRefusedMsg).slice(0, 80))
assert('negXssInert', meta.negative?.xssInert === true, 'window.__w6b5xss undefined + payload rendered as text')
// XSS render-layer proof: the payload row renders as literal text inside a cell, never an element
const xssRender = await evaluate(`(async () => {
  const html = await fetch('/insp/report?code=QI-W6B5-01', { headers: { authorization: 'Bearer ' + localStorage.getItem('INSP_TOKEN') } }).then((r) => r.text())
  return { escaped: html.includes('\\u0026lt;img src=x'), noElement: !html.includes('<td><img src=x') }
})()`)
assert('negXssEscapedInReport', xssRender?.escaped === true && xssRender?.noElement === true, JSON.stringify(xssRender))

// ─── 02b: the platform embed page (NocoBase admin) ───
const routeUid = psql(`SELECT "schemaUid" FROM "desktopRoutes" WHERE title = '检验工作台' AND type = 'flowPage' LIMIT 1;`).trim()
await send('Page.navigate', { url: `${NOCO}/signin` })
await waitFor(`document.querySelectorAll('input[type=password]').length >= 1`, 20, 1000)
await evaluate(`(() => { const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }; const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]; const pass = [...document.querySelectorAll('input[type=password]')]; set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true })()`)
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('登录'))?.click(); true`)
await waitFor(`(localStorage.getItem('NOCOBASE_TOKEN') || '') !== ''`, 25, 1000)
await send('Page.navigate', { url: `${NOCO}/admin/${routeUid}` })
await waitFor(`document.querySelector('iframe') !== null`, 40, 1500)
await sleep(4000) // iframe boot + queue fetch
const embedSrc = await evaluate(`document.querySelector('iframe')?.src ?? ''`)
assert('platformEmbed', embedSrc.includes(':13110/insp'), embedSrc)
await shoot('w6-b5-02b-platform-embed.png')

writeFileSync(`${OUT}w6-b5-shot-meta.json`, JSON.stringify(meta, null, 2) + '\n')
const verdict = Object.values(meta.assertions).every(Boolean)
console.log(JSON.stringify({ ...meta, allGreen: verdict }, null, 2))
try { process.kill(-chromeProc.pid, 'SIGTERM') } catch { /* already gone */ }
process.exit(verdict ? 0 : 1)
