#!/usr/bin/env node
/**
 * W6-B3 acceptance evidence driver: one headless CDP session signs into
 * NocoBase (admin@nocobase.com), walks the 食品合规 pages, drives the real
 * interactions (expiry drill-through, trace direction/recall switch, blend
 * anchor, recall list), captures the labels SPA and the mobile batch-detail
 * barcode card (keeper account, 390×844), and asserts what each shot must
 * contain (node/edge counts, the broken-chain notice, the drill table rows,
 * the GS1 human line). Shots land in demos/acceptance-w6/ as w6-b3-NN-*.
 */
import { spawn, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const NOCO = 'http://localhost:13000'
const ENGINE = 'http://localhost:13110'
const WEB = 'http://localhost:3080'
const PORT = 9343
const OUT = new URL('./', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6b3-shot-profile', '--window-size=1440,940', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
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

// ─── 02: 效期看板 + drill-through ───
await send('Page.navigate', { url: `${NOCO}/admin/w6b3d5c6mpmzl1` })
let board = null
for (let attempt = 0; attempt < 20 && board === null; attempt++) {
  await sleep(1500)
  board = await evaluate(`document.querySelector('[data-w6b3="expiry-board"]') ? true : null`)
}
meta.assertions.boardRendered = board === true
await shoot('w6-b3-02-expiry-board.png')
meta.assertions.drillThrough = await evaluate(`(() => {
  const cell = document.querySelector('[data-expiry-cell]')
  if (!cell) return false
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const drill = document.querySelector('#expiry-drill')
  return drill !== null && drill.style.display !== 'none' && drill.querySelectorAll('tr[data-expiry-row]').length > 0
})()`)
await shoot('w6-b3-02b-expiry-drill.png')

// ─── 03: 批次追溯 — backward from a real FG lot ───
await send('Page.navigate', { url: `${NOCO}/admin/w6b3vmzwuyqofp` })
let dag = null
for (let attempt = 0; attempt < 25 && dag === null; attempt++) {
  await sleep(1500)
  dag = await evaluate(`document.querySelector('[data-trace-anchor]') ? true : null`)
}
meta.assertions.dagRendered = dag === true
const setDag = async (lotNo, direction, recall) => evaluate(`(() => {
  const sel = document.querySelector('[data-trace-anchor]')
  const dir = document.querySelector('[data-trace-dir]')
  const recallSel = document.querySelector('[data-trace-recall]')
  if (!sel || !dir || !recallSel) return false
  const setSelect = (node, value) => { const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(node, value); node.dispatchEvent(new Event('change', { bubbles: true })) }
  setSelect(sel, ${JSON.stringify(lotNo)}); setSelect(dir, ${JSON.stringify(direction)})
  setSelect(recallSel, ${String(recall === true)} ? 'on' : 'off')
  return true
})()`)
meta.assertions.backward = await (async () => {
  if (await setDag('MFG-20260926-03', 'up', false) !== true) return false
  await sleep(400)
  return await evaluate(`(() => {
    const count = document.querySelector('#trace-count')?.textContent ?? ''
    const svg = document.querySelector('#trace-dag-svg svg')
    const m = /(\\d+)\\s*（去重 DAG/.exec(count)
    return { count, nodes: m ? Number(m[1]) : 0, hasSvg: svg !== null }
  })()`)
})()
await shoot('w6-b3-03-trace-backward.png')

// ─── 04: forward + recall scope from the blend raw lot ───
meta.assertions.forwardRecall = await (async () => {
  if (await setDag('RM-260920-M1', 'down', true) !== true) return { ok: false }
  await sleep(400)
  return await evaluate(`(() => {
    const side = document.querySelector('#trace-side')?.textContent ?? ''
    const count = document.querySelector('#trace-count')?.textContent ?? ''
    return { side: side.slice(0, 160), count, hasRecallPanel: side.includes('召回范围（正向波及）') }
  })()`)
})()
await shoot('w6-b3-04-trace-forward-recall.png')

// ─── 05: blend DAG (双向, anchor mid-graph) + broken-chain notice lot ───
meta.assertions.blendBoth = await (async () => {
  if (await setDag('RM-260920-M1', 'both', false) !== true) return { ok: false }
  await sleep(400)
  return await evaluate(`(() => ({ count: document.querySelector('#trace-count')?.textContent ?? '', side: document.querySelector('#trace-side')?.textContent.slice(0, 120) ?? '' }))()`)
})()
await shoot('w6-b3-05-trace-blend-both.png')
meta.assertions.brokenChain = await (async () => {
  if (await setDag('SOY-260301-02', 'both', false) !== true) return { notice: '' }
  await sleep(400)
  return await evaluate(`(() => ({ notice: document.querySelector('#trace-missing')?.textContent ?? '', visible: document.querySelector('#trace-missing')?.style.display !== 'none' }))()`)
})()
await shoot('w6-b3-05b-trace-broken-chain.png')

// ─── 06: 召回管理 list ───
await send('Page.navigate', { url: `${NOCO}/admin/w6b3r1wnc10bflfg` })
let recallRows = 0
for (let attempt = 0; attempt < 20 && recallRows === 0; attempt++) {
  await sleep(1500)
  recallRows = await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.textContent.includes('RC-20261002')).length`)
}
meta.assertions.recallListRows = recallRows
await shoot('w6-b3-06-recall-orders.png')

// ─── 08: labels SPA (engine origin, no NocoBase auth needed) ───
await send('Page.navigate', { url: `${ENGINE}/labels` })
let labelReady = false
for (let attempt = 0; attempt < 15 && labelReady !== true; attempt++) {
  await sleep(1000)
  labelReady = await evaluate(`(() => {
    const img = document.querySelector('#preview img')
    return img !== null && img.complete && img.naturalWidth > 50
  })()`)
}
meta.assertions.labelsSpa = labelReady === true
await shoot('w6-b3-08-labels-print.png')
meta.assertions.labelPdfSource = await evaluate(`fetch('/label/lot.svg?lot_no=MFG-20260926-03&code=gs1').then(r => r.text()).then(t => t.includes('(01)') && t.includes('(10)MFG-20260926-03') && t.includes('(11)') && t.includes('(17)'))`)

// ─── 09: mobile batch detail barcode (keeper, 390×844) ───
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `${WEB}/mobile` })
await sleep(3000)
await evaluate(`localStorage.clear()`)
// The mobile client signs in through the gateway's NocoBase auth mirror.
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
      set(inputs[0], 'keeper'); set(pass[0], 'Keeper#2026'); return true
    })()`)
  }
  if (mobileOk === true) {
    await evaluate(`[...document.querySelectorAll('button')].find(b => /登录|Sign in/i.test(b.textContent))?.click()`)
    await sleep(4500)
  }
}
const mobileSigned = await evaluate(`localStorage.getItem('dsh-mobile-auth') ?? ''`)
meta.identity.mobile = mobileSigned !== '' ? 'signed' : 'unsigned'
await send('Page.navigate', { url: `${WEB}/mobile#/docs/wms_lots` })
let lotRows = 0
for (let attempt = 0; attempt < 15 && lotRows === 0; attempt++) {
  await sleep(1500)
  lotRows = await evaluate(`[...document.querySelectorAll('button,a,[data-testid]')].filter(n => /MFG-\\d{8}-|RM-\\d{6}/.test(n.textContent ?? '')).length`)
}
meta.assertions.mobileLotRows = lotRows
await shoot('w6-b3-09a-mobile-lot-list.png')
meta.assertions.mobileBarcode = await evaluate(`(() => {
  const link = [...document.querySelectorAll('button,a')].find(n => /MFG-20260926-03/.test(n.textContent ?? ''))
  if (link === undefined) return 'anchor-missing'
  link.click()
  return 'clicked'
})()`)
let barcode = null
for (let attempt = 0; attempt < 15 && barcode === null; attempt++) {
  await sleep(1500)
  barcode = await evaluate(`(() => {
    const img = document.querySelector('img[src*="/label/lot.svg"]')
    if (img === null) return null
    return { loaded: img.complete && img.naturalWidth > 50, src: img.getAttribute('src') ?? '' }
  })()`)
}
meta.assertions.mobileBarcodeImg = barcode
await shoot('w6-b3-09b-mobile-lot-barcode.png')

writeFileSync(`${OUT}w6-b3-shot-meta.json`, JSON.stringify(meta, null, 2) + '\n')
console.log(JSON.stringify(meta, null, 2))
try { process.kill(-chromeProc.pid, 'SIGTERM') } catch { /* already gone */ }
const verdicts = [
  meta.assertions.boardRendered === true,
  meta.assertions.drillThrough === true,
  meta.assertions.dagRendered === true,
  (meta.assertions.backward?.nodes ?? 0) >= 7,
  meta.assertions.forwardRecall?.hasRecallPanel === true,
  meta.assertions.blendBoth?.count?.includes('去重 DAG') === true,
  meta.assertions.brokenChain?.visible === true,
  meta.assertions.recallListRows >= 1,
  meta.assertions.labelsSpa === true,
  meta.assertions.labelPdfSource === true,
  meta.assertions.mobileBarcodeImg?.loaded === true,
]
process.exit(verdicts.every(Boolean) ? 0 : 1)
