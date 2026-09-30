/**
 * W5-R2 probe v2 (research artifact): open each candidate page's 添加 form
 * once and dump its field inventory (label + widget kind) so b8-actions.mjs
 * can be written against the real form shapes.
 * Usage: node research/2026-09-29-w5-rework/.r2-probe-forms.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9338
const BASE = 'http://localhost:13000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const PAGES = [
  { name: '主生产计划', path: '/admin/w7mrpyru4s708nwn' },
  { name: '报工记录', path: '/admin/w6mfglmxq9mhbkur' },
  { name: '质检单', path: '/admin/w8qmjvyv8p5j7j' },
  { name: '收货单', path: '/admin/h5wmsrh8ls7pkv5i' },
  { name: '付款申请', path: '/admin/w3pur3an4pwnr1eo' },
]

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/r2-probe-forms', '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'], detached: true })
chromeProc.unref()
let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try {
    target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  } catch { /* chrome not up yet */ }
}
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
await new Promise(resolve => (ws.onopen = resolve))
await send('Page.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}

try {
  await send('Page.navigate', { url: `${BASE}/signin` })
  await evaluate(`(async () => {
    let inputs = [], pass = []
    for (let i = 0; i < 20 && (inputs.length < 1 || pass.length < 1); i++) {
      await new Promise(r => setTimeout(r, 900))
      inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      pass = [...document.querySelectorAll('input[type=password]')]
    }
    if (inputs.length < 1 || pass.length < 1) return 'form-never'
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return 'filled'
  })()`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(3500)

  for (const page of PAGES) {
    await send('Page.navigate', { url: `${BASE}${page.path}` })
    const out = await evaluate(`(async () => {
      let btn = null
      for (let i = 0; i < 20 && btn === null; i++) {
        await new Promise(r => setTimeout(r, 900))
        btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '添加')
      }
      if (!btn) return { error: 'no-add', title: document.title, head: document.body.innerText.slice(0, 120) }
      btn.click()
      await new Promise(r => setTimeout(r, 2500))
      const form = document.querySelector('.ant-drawer-content') || document.querySelector('.ant-modal-content') || document.body
      const fields = [...form.querySelectorAll('.ant-form-item')].map(fi => {
        const label = fi.querySelector('.ant-form-item-label')?.textContent?.trim() ?? '(subtable)'
        const hasSelect = fi.querySelector('.ant-select-selector') !== null
        const hasDate = fi.querySelector('.ant-picker') !== null
        const hasTextarea = fi.querySelector('textarea') !== null
        const hasNumber = [...fi.querySelectorAll('input')].some(i => i.type === 'number' || i.inputMode === 'decimal')
        const kind = hasSelect ? 'select' : hasDate ? 'date' : hasTextarea ? 'textarea' : hasNumber ? 'number' : fi.querySelector('input') ? 'text' : 'other'
        return label + ':' + kind
      }).slice(0, 24)
      const actions = [...form.querySelectorAll('button')].map(b => b.textContent.replace(/\\s/g, '')).filter(t => t === '提交' || t === '保存' || t === '确定')
      // close the drawer so the next page starts clean
      const close = document.querySelector('.ant-drawer-close') || document.querySelector('.ant-modal-close')
      close?.click()
      await new Promise(r => setTimeout(r, 900))
      return { fields, actions }
    })()`)
    console.log(`\n══ ${page.name} ══`)
    console.log(JSON.stringify(out))
  }
} finally {
  try { process.kill(-chromeProc.pid, 'SIGTERM') } catch (error) {
    if (String(error?.code) !== 'ESRCH') chromeProc.kill('SIGKILL')
  }
}
