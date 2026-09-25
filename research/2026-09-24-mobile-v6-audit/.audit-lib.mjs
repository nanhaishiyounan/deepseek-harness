/**
 * Shared read-only audit driver for the ui-mobile v6 exhaustive UI audit
 * (research artifact, not product code). Boots a throwaway headless Chrome,
 * drives the already-running `dsh web` server on :3080 over CDP, and offers
 * shot/probe/wait helpers. Never touches the server process.
 *
 * Usage: import { boot } from './.audit-lib.mjs'
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
export const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * Boot Chrome + CDP session and return the driver.
 * @param {number} port debugging port (unique per concurrent script)
 * @param {{ width?: number, height?: number }} [metrics]
 * @returns {Promise<Awaited<ReturnType<typeof wire>>>} driver with send/evaluate/shot/goto helpers
 */
export async function boot(port, metrics = { width: 390, height: 844 }) {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${String(port)}`,
    `--user-data-dir=/tmp/dsh-v6-audit-${String(port)}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${String(metrics.width)},${String(metrics.height)}`,
    'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(130) })

  let tabs
  for (let attempt = 0; ; attempt++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json()
      break
    } catch (cause) {
      if (attempt > 40) throw cause
      await sleep(400)
    }
  }
  const page = tabs.find((tab) => tab.type === 'page')
  const driver = await wire(page.webSocketDebuggerUrl)
  await driver.send('Page.enable')
  await driver.send('Runtime.enable')
  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: metrics.width, height: metrics.height, deviceScaleFactor: 2, mobile: true,
  })
  return { ...driver, cleanup, chrome }
}

async function wire(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let seq = 0
  const pending = new Map()
  const listeners = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined) {
      const entry = pending.get(msg.id)
      if (entry === undefined) return
      pending.delete(msg.id)
      if (msg.error !== undefined) entry.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
      else entry.resolve(msg.result)
      return
    }
    for (const handler of listeners.get(msg.method) ?? []) handler(msg.params)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) {
      throw new Error(`eval failed: ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`)
    }
    return result.result.value
  }
  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'))
    console.log(`saved ${name}`)
  }
  const goto = async (url) => {
    await send('Page.navigate', { url })
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 15000)
      const on = (params) => { clearTimeout(timer); resolve(params) }
      const list = listeners.get('Page.loadEventFired') ?? []
      list.push(on)
      listeners.set('Page.loadEventFired', list)
    })
    await sleep(700)
  }
  const waitFor = async (expression, { timeout = 20000, interval = 400 } = {}) => {
    const deadline = Date.now() + timeout
    for (;;) {
      const value = await evaluate(expression)
      if (value === true) return true
      if (Date.now() > deadline) return false
      await sleep(interval)
    }
  }
  const TYPE = (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el === null) return 'missing'
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })()`)
  const CLICK_TEXT = (text, scope = 'button') => evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(scope)})]
    const el = els.find(b => (b.textContent ?? '').includes(${JSON.stringify(text)}))
    if (el === undefined) return false
    el.click()
    return true
  })()`)
  return { send, evaluate, shot, goto, waitFor, TYPE, CLICK_TEXT }
}

/** Login through the demo gate under the given theme; assumes a fresh profile. */
export async function demoLogin(d, theme) {
  await d.goto(`${BASE}/mobile.html`)
  await d.evaluate('localStorage.clear()')
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', ${JSON.stringify(theme)})`)
  await d.evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 15000 })
  await d.TYPE('input[inputmode="numeric"]', '123456')
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('登录'))?.click()`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 15000 })
  await sleep(500)
}

/**
 * Computed-style probe for one element, CSS Modules / antd class both supported.
 * @returns {Promise<Record<string, string>|null>} null when the selector misses
 */
export function probe(d, selector, props) {
  return d.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el === null) return null
    const rs = getComputedStyle(el)
    const out = {}
    for (const p of ${JSON.stringify(props)}) out[p] = rs.getPropertyValue(p)
    out.__rect = el.getBoundingClientRect().toJSON()
    return out
  })()`)
}

/** Persist the evidence log next to the screenshots. */
export function writeEvidence(name, evidence) {
  writeFileSync(`${OUT}${name}`, `${JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, evidence }, null, 2)}\n`)
  console.log(`saved ${name}`)
}
