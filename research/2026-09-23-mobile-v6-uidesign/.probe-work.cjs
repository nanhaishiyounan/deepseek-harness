// Probe: the work page's capsule tab DOM (research artifact).
const { spawn } = require('node:child_process')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9340', '--user-data-dir=/tmp/dsh-v6-probe2', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  await sleep(1500)
  const tabs = await (await fetch('http://127.0.0.1:9340/json/list')).json()
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
  })
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
  const eval_ = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result.value }
  await send('Page.enable')
  await send('Page.navigate', { url: 'http://127.0.0.1:3080/mobile#/work' })
  await sleep(1800)
  console.log('capsule:', await eval_("[...document.querySelectorAll('[class*=capsule]')].slice(0,6).map(e => e.className.toString().slice(0,44) + ' :: ' + (e.textContent || '').trim().slice(0,12)).join(' || ')"))
  console.log('tab-ish:', await eval_("[...document.querySelectorAll('[class*=tab]')].slice(0,8).map(e => e.className.toString().slice(0,44) + ' :: ' + (e.textContent || '').trim().slice(0,10)).join(' || ')"))
  chrome.kill(); process.exit(0)
})()
