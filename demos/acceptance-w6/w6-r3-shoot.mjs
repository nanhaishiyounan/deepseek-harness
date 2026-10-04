#!/usr/bin/env node
/**
 * W6-R3 acceptance evidence driver: one headless CDP session walks the fixed
 * surfaces and asserts what each shot must contain —
 *   01 labels SPA barcode actually draws (naturalWidth > 0, path elements),
 *   02 expiry board survives a markup-carrying batch number (XSS negative),
 *   03 the trace DAG's SVG holds no NaN coordinates and its node elements
 *      equal the footer count in both directions, with the broken-chain
 *      notice direction-scoped,
 *   04 the recall identity gate (no-credential 401, forged-actor 403,
 *      session-derived create/act 200) straight from a NocoBase page (which
 *      also proves the engine CORS headers),
 *   05 the 召回管理 console (initiate form + transition buttons) live,
 *   06 the mobile alerts page showing the recall notice (alert-center
 *      channel visible on mobile),
 *   07 LABEL_ENGINE_BASE injected override steering the mobile barcode card.
 * Shots land in demos/acceptance-w6/ as w6-r3-NN-*.
 */
import { spawn, spawnSync, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const NOCO = 'http://localhost:13000'
const ENGINE = 'http://127.0.0.1:13110'
const WEB = 'http://localhost:3080'
const PORT = 9347
const OUT = new URL('./', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// psql leg (the XSS-negative lot mint/sweep and the drill cleanup rides it)
const envFile = execSync('cat /Users/mac/Documents/github/deepseek-harness/platform/nocobase/.env').toString()
const envOf = (key) => envFile.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout.trim()
}

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-proxy-server', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6r3-shot-profile', '--window-size=1440,940', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'], detached: true })
chromeProc.unref()

let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try {
    target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  } catch { /* chrome not up yet */ }
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
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result?.exceptionDetails !== undefined) {
    const detail = result.exceptionDetails
    throw new Error(`page eval failed: ${String(detail.exception?.description ?? detail.text ?? '').slice(0, 300)}`)
  }
  return result?.result?.value
}
const shoot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${shot.data} | base64 -d > ${OUT}${name}`)
  console.log(`shot: ${name}`)
}

const meta = { generatedAt: new Date().toISOString(), assertions: {}, identity: {} }

// ─── sign in as admin ───
await send('Page.navigate', { url: `${NOCO}/admin` })
await sleep(3000)
await evaluate(`localStorage.clear()`)
let filled = false
for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
  await send('Page.navigate', { url: `${NOCO}/signin` })
  for (let probe = 0; probe < 12 && filled !== true; probe++) {
    await sleep(1500)
    filled = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      const pass = [...document.querySelectorAll('input[type=password]')]
      if (inputs.length < 1 || pass.length < 1) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true
    })()`)
  }
}
if (filled !== true) throw new Error('sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(5000)
meta.identity.admin = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)

// ─── 01: labels SPA barcode draws (lesson 19 regression proof) ───
await send('Page.navigate', { url: `${ENGINE}/labels` })
let labelReady = false
let labelProbe = null
for (let attempt = 0; attempt < 15 && labelReady !== true; attempt++) {
  await sleep(1000)
  labelProbe = await evaluate(`(() => {
    const img = document.querySelector('#preview img')
    return img === null ? { present: false } : { present: true, complete: img.complete, naturalWidth: img.naturalWidth, src: img.getAttribute('src') ?? '' }
  })()`)
  labelReady = labelProbe?.present === true && labelProbe?.complete === true && labelProbe?.naturalWidth > 50
}
meta.assertions.labelsSpaDraws = labelReady === true
meta.assertions.labelsSpaProbe = labelProbe
meta.assertions.labelPathCount = await evaluate(`fetch('/label/lot.svg?lot_no=MFG-20260926-03&code=gs1').then(r => r.text()).then(t => (t.match(/<path d=/g) || []).length)`)
await shoot('w6-r3-01-labels-barcode-draws.png')

// ─── 02: expiry board XSS negative (markup-carrying batch number) ───
const LT = String.fromCharCode(60), GT = String.fromCharCode(62), AMP = String.fromCharCode(38), SQ = String.fromCharCode(39), DQ = String.fromCharCode(34)
const XSS_LOT = `${LT}b${GT}${AMP}x${SQ}${DQ}scan`
const lotLit = XSS_LOT.replaceAll(SQ, SQ + SQ)
{
  const productId = psql('SELECT id FROM hub_inv_products LIMIT 1;')
  psql(`INSERT INTO wms_lots (lot_no, production_date, expiry_date, status, product_id) VALUES ('${lotLit}', CURRENT_DATE - 30, CURRENT_DATE + 60, 'quarantined', ${productId});`)
}
try {
  await send('Page.navigate', { url: `${NOCO}/admin/w6b3k0jfsyskif` })
  let board = null
  for (let attempt = 0; attempt < 20 && board === null; attempt++) {
    await sleep(1500)
    board = await evaluate(`document.querySelector('[data-w6b3="expiry-board"]') ? true : null`)
  }
  meta.assertions.boardRendered = board === true
  meta.assertions.boardXss = await evaluate(`(() => {
    const root = document.querySelector('[data-w6b3="expiry-board"]')
    if (root === null) return { present: false }
    const html = root.innerHTML
    return {
      present: true,
      scriptNodes: root.querySelectorAll('script').length,
      rawOpen: html.includes('${LT}b${GT}'),
      rawAmp: new RegExp('${AMP}(?!amp;|lt;|gt;|#39;|quot;)').test(html),
      escapedVisible: html.includes('${AMP}lt;b${AMP}gt;'),
    }
  })()`)
  await shoot('w6-r3-02-expiry-xss-negative.png')
} finally {
  psql(`DELETE FROM wms_lots WHERE lot_no = '${lotLit}';`)
}

// ─── 03: trace DAG — both directions, no NaN, element-count parity ───
const setDag = async (lot, dir, recall) => evaluate(`(() => {
  const sel = document.querySelector('[data-trace-anchor]')
  const dirSel = document.querySelector('[data-trace-dir]')
  const recallSel = document.querySelector('[data-trace-recall]')
  if (sel === null) return 'no-anchor-select'
  const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })) }
  setV(sel, '${lot}')
  if (dirSel !== null) setV(dirSel, '${dir}')
  if (recallSel !== null) setV(recallSel, '${recall ? 'on' : 'off'}')
  return true
})()`)
const dagProbe = async () => evaluate(`(() => {
  const svg = document.querySelector('#trace-dag-svg')
  const foot = document.querySelector('#trace-count')?.textContent ?? ''
  const nodeMatch = /节点 (\\d+)/.exec(foot)
  const html = svg?.innerHTML ?? ''
  return {
    hasSvg: svg !== null,
    nodeG: document.querySelectorAll('#trace-dag-svg g').length,
    footerNodes: nodeMatch ? Number(nodeMatch[1]) : -1,
    nanInSvg: html.includes('NaN'),
    rects: document.querySelectorAll('#trace-dag-svg rect').length,
    notice: document.querySelector('#trace-missing')?.textContent ?? '',
    noticeVisible: document.querySelector('#trace-missing')?.style.display !== 'none',
  }
})()`)
await send('Page.navigate', { url: `${NOCO}/admin/w6b3by6ukynxfou` })
let dag = null
for (let attempt = 0; attempt < 20 && dag === null; attempt++) {
  await sleep(1500)
  dag = await evaluate(`document.querySelector('[data-w6b3="trace-dag"]') ? true : null`)
}
meta.assertions.dagRendered = dag === true
// 双向（默认锚点）
meta.assertions.dagBoth = await (async () => { await sleep(600); return await dagProbe() })()
await shoot('w6-r3-03a-trace-both.png')
// 反向（成品→供应商）：SVG 元素数=节点数、无 NaN
if (await setDag('MFG-20260926-03', 'up', false) !== true) throw new Error('setDag up failed')
await sleep(600)
meta.assertions.dagUp = await dagProbe()
await shoot('w6-r3-03b-trace-up.png')
// 正向（原料→客户）+ 召回范围
if (await setDag('RM-260920-M1', 'down', true) !== true) throw new Error('setDag down failed')
await sleep(600)
meta.assertions.dagDown = await dagProbe()
meta.assertions.recallButton = await evaluate(`(() => {
  const btn = document.querySelector('[data-recall-create]')
  return btn === null ? null : { label: btn.textContent.slice(0, 30), lot: btn.getAttribute('data-lot') }
})()`)
await shoot('w6-r3-03c-trace-down-recall.png')
// 断链提示方向裁剪：SOY-260301-02 正向只报下游缺失、反向只报上游
if (await setDag('SOY-260301-02', 'down', false) !== true) throw new Error('setDag soy down failed')
await sleep(600)
meta.assertions.brokenDown = await dagProbe()
await shoot('w6-r3-03d-trace-broken-down.png')
if (await setDag('SOY-260301-02', 'up', false) !== true) throw new Error('setDag soy up failed')
await sleep(600)
meta.assertions.brokenUp = await dagProbe()
await shoot('w6-r3-03e-trace-broken-up.png')

// ─── 04: recall identity gate from the page (CORS + credential derivation) ───
await send('Page.navigate', { url: `${NOCO}/admin/w6b3r1wnc10bflfg` })
let consoleReady = false
for (let attempt = 0; attempt < 20 && consoleReady !== true; attempt++) {
  await sleep(1500)
  consoleReady = await evaluate(`document.querySelector('[data-w6b3="recall-console"]') !== null`)
}
meta.assertions.recallConsoleRendered = consoleReady === true
await shoot('w6-r3-04a-recall-console.png')
try {
  meta.assertions.identityGate = await evaluate(`(async () => {
  const token = localStorage.getItem('NOCOBASE_TOKEN') || ''
  const post = (body, auth) => fetch('${ENGINE}/recall/create', {
    method: 'POST',
    headers: { ...(auth ? { authorization: 'Bearer ' + auth } : {}), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const noCred = await post({ lot_no: 'RM-260920-M1', owner: 'qc_inspector', actor: 'qc_inspector' })
  const adminSession = await post({ lot_no: 'RM-260920-M1', reason: '验收演练：页面操作台发起（W6-R3 证据）', owner: 'qc_inspector' }, token)
  const code = adminSession.ok ? (await adminSession.json()).code : ''
  const buyer = await fetch('${NOCO}/api/auth:signIn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'buyer', password: 'Buyer#2026' }) }).then(r => r.json())
  const forged = await post({ lot_no: 'RM-260920-M1', owner: 'qc_inspector', actor: 'qc_inspector' }, buyer?.data?.token ?? 'invalid')
  return {
    noCredentialStatus: noCred.status,
    sessionCreateStatus: adminSession.status,
    sessionCreateCode: code,
    forgedActorStatus: forged.status,
    forgedActorBody: forged.ok ? '' : ((await forged.json()).error ?? '').slice(0, 60),
  }
})()`)
} catch (error) {
  meta.assertions.identityGate = { error: String(error).slice(0, 200) }
}

// ─── 05: console transition row — act the drill order through the buttons ───
const drillCode = meta.assertions.identityGate?.sessionCreateCode ?? ''
if (drillCode !== '') {
  meta.assertions.consoleFlow = await evaluate(`(async () => {
    const setV = (sel, v) => { const el = document.querySelector(sel); if (el === null) return false; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true }
    if (setV('[data-rc-code]', '${drillCode}') !== true) return { codeFilled: false }
    const out = document.querySelector('[data-rc-out]')
    const clickAct = async (action) => {
      const btn = document.querySelector('[data-rc-act="' + action + '"]')
      if (btn === null) return { btn: false }
      btn.click()
      for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 400)); if (out && out.textContent.includes('OK')) break }
      return { btn: true, text: out ? out.textContent.slice(0, 80) : '' }
    }
    const notify = await clickAct('notify')
    const execute = await clickAct('execute')
    setV('[data-rc-note]', 'W6-R3 页面操作台演练关闭（记录说明）')
    const close = await clickAct('close')
    return { codeFilled: true, notify, execute, close }
  })()`)
  await sleep(1000)
  await shoot('w6-r3-05-recall-console-flow.png')
}

// ─── 06: mobile alerts page — the recall notice visible (qc_inspector) ───
// The drill order's owner notification went to qc_inspector; keep it unread
// for the mobile shot, clean up after.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `${WEB}/mobile` })
await sleep(3000)
await evaluate(`localStorage.clear()`)
let mobileOk = false
for (let attempt = 0; attempt < 4 && mobileOk !== true; attempt++) {
  await send('Page.navigate', { url: `${WEB}/mobile` })
  for (let probe = 0; probe < 10 && mobileOk !== true; probe++) {
    await sleep(1500)
    mobileOk = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input')]
      const pass = [...document.querySelectorAll('input[type=password]')]
      if (inputs.length < 1 || pass.length < 1) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(inputs[0], 'qc_inspector'); set(pass[0], 'Qc#2026'); return true
    })()`)
  }
  if (mobileOk === true) {
    await evaluate(`[...document.querySelectorAll('button')].find(b => /登录|Sign in/i.test(b.textContent))?.click()`)
    await sleep(4500)
  }
}
meta.identity.mobile = (await evaluate(`localStorage.getItem('dsh-mobile-auth') ?? ''`)) !== '' ? 'signed' : 'unsigned'
await send('Page.navigate', { url: `${WEB}/mobile#/alerts` })
let recallNotice = null
for (let attempt = 0; attempt < 20 && recallNotice === null; attempt++) {
  await sleep(1500)
  recallNotice = await evaluate(`(() => {
    const card = document.querySelector('[data-testid="recall-notice"]')
    if (card === null) return null
    return { title: card.textContent.slice(0, 60) }
  })()`)
}
meta.assertions.mobileRecallNotice = recallNotice
await shoot('w6-r3-06-mobile-recall-notice.png')

// ─── 07: LABEL_ENGINE_BASE injectable (mobile docs barcode card) ───
await send('Page.navigate', { url: `${WEB}/mobile#/docs/wms_lots` })
let lotRows = 0
for (let attempt = 0; attempt < 15 && lotRows === 0; attempt++) {
  await sleep(1500)
  lotRows = await evaluate(`[...document.querySelectorAll('button,a,[data-testid]')].filter(n => /MFG-\\d{8}-|RM-\\d{6}/.test(n.textContent ?? '')).length`)
}
meta.assertions.mobileLotRows = lotRows
await evaluate(`(() => {
  const link = [...document.querySelectorAll('button,a')].find(n => /MFG-20260926-03/.test(n.textContent ?? ''))
  if (link === undefined) return 'anchor-missing'
  link.click()
  return 'clicked'
})()`)
let barcodeDefault = null
for (let attempt = 0; attempt < 15 && barcodeDefault === null; attempt++) {
  await sleep(1500)
  barcodeDefault = await evaluate(`(() => {
    const img = document.querySelector('img[src*="/label/lot.svg"]')
    if (img === null) return null
    return { loaded: img.complete && img.naturalWidth > 50, src: img.getAttribute('src') ?? '' }
  })()`)
}
meta.assertions.mobileBarcodeDefault = barcodeDefault
await shoot('w6-r3-07a-mobile-barcode-default.png')
// Inject the override and re-enter via a same-document hash navigation (a
// fresh Page.navigate would reset window and drop the injection): the src
// must follow the injected base.
await evaluate(`(() => { window.__LABEL_ENGINE_BASE__ = 'http://localhost:13110'; location.hash = '#/docs/wms_lots'; return true; })()`)
await sleep(2500)
await evaluate(`(() => {
  const link = [...document.querySelectorAll('button,a')].find(n => /MFG-20260926-03/.test(n.textContent ?? ''))
  if (link === undefined) return 'anchor-missing'
  link.click()
  return 'clicked'
})()`)
let barcodeInjected = null
for (let attempt = 0; attempt < 15 && barcodeInjected === null; attempt++) {
  await sleep(1500)
  barcodeInjected = await evaluate(`(() => {
    const img = document.querySelector('img[src*="/label/lot.svg"]')
    if (img === null) return null
    return { loaded: img.complete && img.naturalWidth > 50, src: img.getAttribute('src') ?? '' }
  })()`)
}
meta.assertions.mobileBarcodeInjected = barcodeInjected
await shoot('w6-r3-07b-mobile-barcode-injected.png')

// ─── cleanup: the drill order, its audit cascade and its notice ───
meta.cleanup = { recallAuditTrail: psql(`SELECT string_agg(action, ',' ORDER BY event_id) FROM recall_audit WHERE code = '${drillCode}';`) }
const sweep = psql(`WITH drill AS (SELECT id, code FROM recall_orders WHERE reason LIKE '验收演练%'),
gone AS (DELETE FROM recall_orders WHERE id IN (SELECT id FROM drill) RETURNING 1),
notes AS (DELETE FROM "notificationInAppMessages" n WHERE n."channelName" = 'alert-center'
  AND EXISTS (SELECT 1 FROM drill d WHERE n.title LIKE '【召回任务】' || d.code || '：%') RETURNING 1)
SELECT (SELECT count(*) FROM gone) || '|' || (SELECT count(*) FROM notes);`)
const leftover = psql(`SELECT count(*) FROM recall_orders WHERE reason LIKE '验收演练%';`)
meta.cleanup.sweep = sweep
meta.cleanup.leftoverDrillOrders = leftover
const auditsLeft = psql(`SELECT count(*) FROM recall_audit WHERE code = '${drillCode}';`)
meta.cleanup.auditCascadeLeft = auditsLeft

writeFileSync(`${OUT}w6-r3-shot-meta.json`, JSON.stringify(meta, null, 2) + '\n')
console.log(JSON.stringify(meta, null, 2))
try { process.kill(-chromeProc.pid, 'SIGTERM') } catch { /* already gone */ }

const A = meta.assertions
const verdicts = [
  A.labelsSpaDraws === true,
  (A.labelPathCount ?? 0) > 10,
  A.boardRendered === true,
  A.boardXss?.present === true && A.boardXss?.scriptNodes === 0 && A.boardXss?.rawOpen === false && A.boardXss?.rawAmp === false && A.boardXss?.escapedVisible === true,
  A.dagRendered === true,
  A.dagBoth?.nanInSvg === false && A.dagBoth?.nodeG === A.dagBoth?.footerNodes,
  A.dagUp?.nanInSvg === false && A.dagUp?.nodeG === A.dagUp?.footerNodes,
  A.dagDown?.nanInSvg === false && A.dagDown?.nodeG === A.dagDown?.footerNodes,
  A.recallButton !== null && A.recallButton !== undefined,
  // The verdict reads only the missing-lane list (the「…环节」slice before the
  // fixed tail); the tail itself legitimately mentions 收货 as remediation.
  A.brokenDown?.noticeVisible === true
    && !(A.brokenDown?.notice.split('环节')[0] ?? '').includes('供应商')
    && !(A.brokenDown?.notice.split('环节')[0] ?? '').includes('收货'),
  A.brokenUp?.noticeVisible === false || (A.brokenUp?.noticeVisible === true && !A.brokenUp?.notice.includes('订单') && !A.brokenUp?.notice.includes('客户')),
  A.identityGate?.noCredentialStatus === 401,
  A.identityGate?.forgedActorStatus === 403,
  A.identityGate?.sessionCreateStatus === 200,
  A.recallConsoleRendered === true,
  A.consoleFlow?.notify?.btn === true && A.consoleFlow?.close?.btn === true && (A.consoleFlow?.close?.text ?? '').includes('OK'),
  A.mobileRecallNotice !== null && A.mobileRecallNotice !== undefined,
  A.mobileBarcodeDefault?.loaded === true && (A.mobileBarcodeDefault?.src ?? '').startsWith('http://127.0.0.1:13110'),
  A.mobileBarcodeInjected?.loaded === true && (A.mobileBarcodeInjected?.src ?? '').startsWith('http://localhost:13110'),
  meta.cleanup.leftoverDrillOrders === '0',
  meta.cleanup.auditCascadeLeft === '0',
]
console.log(`verdicts: ${String(verdicts.filter(Boolean).length)}/${String(verdicts.length)}`)
process.exit(verdicts.every(Boolean) ? 0 : 1)
