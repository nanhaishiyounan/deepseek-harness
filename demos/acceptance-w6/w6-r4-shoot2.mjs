#!/usr/bin/env node
/**
 * W6-R4 evidence tail: the main shoot run died mid-probe (the PO page kept
 * executing the previous JSBlock code for minutes before its second mount;
 * the page has since settled on the new code). Attach to the live headless
 * Chrome and finish the remaining two shots: ③ the PO 定标快照 details and
 * ⑩ the RFQ back-link landing. Writes w6-r4-shot-meta2.json.
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const NC = 'http://localhost:13000'
const PORT = 9349
const MATRIX_PAGE = '/admin/w3purb7o0r3yqi45'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const meta = { generatedAt: new Date().toISOString(), steps: {} }

const target = await (await fetch(`http://localhost:${PORT}/json/list`).catch(() => null)).json().catch(() => null)
const page = target.find(t => t.type === 'page')
if (page === undefined) throw new Error('no live page on the debug port')
const ws = new WebSocket(page.webSocketDebuggerUrl)
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).catch(error => { throw error }))?.result?.value
const shot = async (name) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > demos/acceptance-w6/${name}`)
  console.log(`w6-r4-shoot2: ${name}`)
}

// ③ the PO snapshot details.
await send('Page.navigate', { url: `${NC}/admin/w3puryzkva06iuhh` })
let probe = null
for (let attempt = 0; attempt < 90 && probe?.hasSnapshot !== true; attempt++) {
  await sleep(2000)
  probe = await evaluate(`(() => {
    const board = document.querySelector('[data-w6b7="po-board"]')
    if (board === null) return { hasSnapshot: false }
    // Old POs carry compare_note text without the R4 定标时间 stamp — the
    // R4 award receipt is distinguished by that exact marker.
    const snapshot = [...board.querySelectorAll('details')].find(d => d.textContent.includes('定标快照') && d.textContent.includes('定标时间'))
    if (snapshot === undefined) return { hasSnapshot: false }
    snapshot.setAttribute('open', '')
    const link = board.querySelector('a[href*="rfq="]')
    return { hasSnapshot: true, snapshotText: snapshot.textContent.replace(/\\s+/g, ' ').slice(0, 240), hasTime: snapshot.textContent.includes('定标时间'), hasFormula: snapshot.textContent.includes('价格分='), linkHref: link ? link.getAttribute('href') : null, linkText: link ? link.textContent.trim() : null }
  })()`).catch(() => ({ hasSnapshot: false }))
}
meta.steps.poSnapshot = probe
if (probe?.hasSnapshot !== true || probe?.hasTime !== true) throw new Error(`snapshot probe failed: ${JSON.stringify(probe)}`)
if (typeof probe.linkHref !== 'string' || !probe.linkHref.includes('rfq=')) throw new Error(`back-link not a ?rfq= link: ${String(probe.linkHref)}`)
await evaluate(`(() => {
  const board = document.querySelector('[data-w6b7="po-board"]')
  const snapshot = [...board.querySelectorAll('details')].find(d => d.textContent.includes('定标快照'))
  snapshot.setAttribute('open', '')
  snapshot.scrollIntoView({ block: 'center' })
})()`).catch(() => {})
await sleep(900)
await shot('w6-r4-08-po-snapshot.png')

// ⑩ follow the back-link: prefer the awarded RFQ's chip (its matrix renders);
// wait for the block to mount so the shot shows the preselected matrix.
await evaluate(`(() => {
  const links = [...document.querySelectorAll('[data-w6b7="po-board"] a[href*="rfq="]')]
  const target = links.find(a => (a.getAttribute('href') || '').includes('RFQ-B9F-0001')) ?? links[0]
  if (target !== undefined) target.click()
})()`).catch(() => {})
let landed = null
for (let attempt = 0; attempt < 60 && (landed?.rows ?? 0) < 2; attempt++) {
  await sleep(2000)
  landed = await evaluate(`(() => {
    const el = document.querySelector('[data-w6b7="matrix"]')
    return { url: location.pathname + location.search, rfq: window.__w6b7Matrix?.state?.rfq ?? '', rows: el ? el.querySelectorAll('tbody tr').length : 0, banner: el ? el.textContent.includes('已定标') : false }
  })()`).catch(() => null)
}
meta.steps.backLinkLanding = landed
if (!String(landed?.url ?? '').includes('rfq=')) throw new Error(`back-link landing lost ?rfq: ${JSON.stringify(landed)}`)
await sleep(1500)
await shot('w6-r4-11-backlink-landing.png')

writeFileSync('demos/acceptance-w6/w6-r4-shot-meta2.json', JSON.stringify(meta, null, 2))
console.log('w6-r4-shoot2: complete')
process.exit(0)
