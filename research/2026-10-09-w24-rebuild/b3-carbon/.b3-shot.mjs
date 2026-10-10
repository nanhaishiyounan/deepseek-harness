/**
 * W24-B3 shot (browser-level): the MCP pages live in isolated browser
 * contexts that /json does not list, so walk Target.getTargets from the
 * browser-level websocket instead, attach to the page whose URL matches,
 * and capture beyond the viewport.
 */
import { writeFileSync } from 'node:fs'

const port = process.argv[2] ?? '9339'
const urlPart = process.argv[3] ?? '127.0.0.1:3080'
const out = process.argv[4] ?? 'research/2026-10-09-w24-rebuild/b3-carbon/shot.png'

const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
let nextId = 0
const send = (method, params = {}, sessionId) => new Promise(resolve => {
  const id = ++nextId
  const onMessage = event => {
    const message = JSON.parse(event.data)
    if (message.id === id) { ws.removeEventListener('message', onMessage); resolve(message) }
  }
  ws.addEventListener('message', onMessage)
  ws.send(JSON.stringify({ id, method, params, ...sessionId === undefined ? {} : { sessionId } }))
})

const targets = (await send('Target.getTargets')).result.targetInfos
const page = targets.find(t => t.type === 'page' && t.url.includes(urlPart))
if (page === undefined) {
  console.error(`no page matches ${urlPart}; visible: ${targets.filter(t => t.type === 'page').map(t => t.url.slice(0, 40)).join(' | ')}`)
  process.exit(1)
}
const attached = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).result
const sid = attached.sessionId

const metrics = (await send('Page.getLayoutMetrics', {}, sid)).result
const height = Math.min(Math.ceil(metrics.cssContentSize.height), 8000)
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height, deviceScaleFactor: 1, mobile: false }, sid)
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sid)
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(`saved ${out} (content ${Math.ceil(metrics.cssContentSize.width)}x${height})`)
ws.close()
