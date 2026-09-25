/**
 * Audit 06 — report card probes, form-flow attempt (fill assistant), and the
 * home header design-value probes. Read-only against :3080.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-06-card-form.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A6] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const d = await boot(9367)
try {
  await demoLogin(d, 'light')

  // ---- report card probes on the rich demo session ---------------------------
  await d.goto(`${BASE}/mobile.html#/chat/session-v6-b3-rich`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 15000 })
  await sleep(600)
  await d.evaluate(`document.querySelector('[data-testid="report-card"]').scrollIntoView({ block: 'center' })`)
  await sleep(300)
  await d.shot('audit-41-report-card-light.png')
  note(`report card: ${JSON.stringify({
    card: await probe(d, '[data-testid="report-card"]', ['background-color', 'border-color', 'border-radius', 'box-shadow']),
    stamp: await probe(d, '[data-testid="report-card"] [class*="stamp"], [data-testid="report-card"] [class*="Stamp"]', ['border-color', 'color', 'background-color']),
    primaryBtn: await probe(d, '[data-testid="report-card"] button', []),
    allButtons: await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].map(b => ({ text: (b.textContent ?? '').trim(), bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color }))`),
  })}`)

  // ---- form flow attempt: fill assistant new session -------------------------
  await d.goto(`${BASE}/mobile.html#/agents`)
  await d.waitFor(`document.querySelector('[aria-label="AI 同事目录"]') !== null`, { timeout: 15000 })
  await sleep(600)
  const started = await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button[aria-label^="找 "]')].find(b => (b.getAttribute('aria-label') ?? '').includes('填表'))
    if (btn === undefined) return false
    btn.click(); return true
  })()`)
  note(`fill assistant opened: ${String(started)}`)
  if (started) {
    await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 15000 })
    await sleep(1000)
    await d.shot('audit-42-fill-assistant-welcome.png')
    const sent = await d.evaluate(`(() => {
      const ta = document.querySelector('textarea')
      if (ta === null) return 'missing'
      const proto = HTMLTextAreaElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, '登记一条采购入库单，供应商鲜丰冷链，金额3800元')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      const send = [...document.querySelectorAll('button[aria-label="发送"]')][0]
      if (send === undefined) return 'nosend'
      send.click(); return 'ok'
    })()`)
    note(`form message sent: ${String(sent)}`)
    await sleep(6000)
    await d.shot('audit-43-form-flow-reply.png')
    const flowInfo = await d.evaluate(`(() => ({
      hasDraftCard: document.querySelector('[class*="draft"], [class*="Draft"]') !== null,
      hasFieldAsk: [...document.querySelectorAll('[class*="ask"], [class*="Ask"]')].length,
      bodySample: document.body.innerText.slice(-500),
    }))()`)
    note(`form flow dom: ${JSON.stringify(flowInfo)}`)
  }

  // ---- home header probes (design cross-check) --------------------------------
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 15000 })
  await sleep(700)
  await d.shot('audit-44-home-top-light.png')
  note(`home: ${JSON.stringify({
    header: await probe(d, '[class*="pageHeader"], header', ['background-color', 'padding-top']),
    tabbar: await probe(d, '[class*="tabbar"], .adm-tab-bar', ['background-color']),
    tabbarActive: await probe(d, '.adm-tab-bar-item-active .adm-tab-bar-item-title', ['color']),
  })}`)
} finally {
  writeEvidence('.audit-06-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
