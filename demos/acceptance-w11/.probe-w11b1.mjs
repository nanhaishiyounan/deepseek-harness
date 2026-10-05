// W11-B1 T1 live probe: measure the composer input slot's vertical geometry on
// the real :3080 gateway before touching CSS. Captures, per state (empty /
// single line / 2 / 4 / 5 lines / overlong single line / focused), the DOM
// chain wrapper→textarea, the effective dials (padding/min-height/line-height/
// border), and the text optical center vs the capsule box center (the ≤2px
// acceptance metric), both tracks (light/dark @375).
// Usage (repo root): node demos/acceptance-w11/.probe-w11b1.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const LOG = []
const say = (line) => { console.log(line); LOG.push(line) }

const login = async (page, theme, account = 'qc_inspector', password = 'Qc#2026') => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const createSession = async (rpcId) => {
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

// In-page measurement of one composer state: the DOM chain, dials, and the
// optical deltas. `expectLines` is only for the label.
const measureState = (page, label) => page.evaluate((tag) => {
  // aria-label rides the wrapper (antd-mobile moves it there); the visible
  // element is the .adm-text-area-element minus the autoSize shadow textarea.
  const wrap = document.querySelector('.adm-text-area[aria-label="消息输入"]')
  const slot = wrap?.querySelector('textarea.adm-text-area-element:not(.adm-text-area-element-hidden)')
  if (!wrap || !slot) return { tag, error: 'textarea not found' }
  const row = wrap.parentElement
  const send = row.querySelector('button[aria-label="发送"]')
  const plus = row.querySelector('button[aria-label^="快捷面板"], button[aria-label*="快捷面板"]')
  const r = (el) => { const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(2), height: +b.height.toFixed(2), bottom: +b.bottom.toFixed(2), width: +b.width.toFixed(2) } }
  const cs = getComputedStyle(slot)
  const wc = getComputedStyle(wrap)
  const firstLineTop = slot.getBoundingClientRect().top + slot.clientTop + parseFloat(cs.paddingTop)
  const lineHeight = parseFloat(cs.lineHeight)
  const textCenter = firstLineTop + lineHeight / 2
  const wrapCenter = wrap.getBoundingClientRect().top + wrap.getBoundingClientRect().height / 2
  return {
    tag,
    chain: [wrap.tagName + '.' + wrap.className, slot.tagName + '.' + slot.className],
    wrap: { rect: r(wrap), display: wc.display, alignItems: wc.alignItems, height: wc.height, padding: wc.padding, border: wc.border, radius: wc.borderRadius, boxShadow: wc.boxShadow, overflow: wc.overflow },
    slot: {
      rect: r(slot), paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight,
      minHeight: cs.minHeight, maxHeight: cs.maxHeight, lineHeight: cs.lineHeight, fontSize: cs.fontSize, height: cs.height,
      boxSizing: cs.boxSizing, scrollHeight: slot.scrollHeight, clientHeight: slot.clientHeight, overflowY: cs.overflowY,
      borderTop: cs.borderTopWidth, focusState: document.activeElement === slot ? 'focused' : 'blurred',
    },
    peers: { send: send ? r(send) : null, plus: plus ? r(plus) : null },
    deltas: {
      textCenterVsWrapCenterPx: +(textCenter - wrapCenter).toFixed(2),
      topGapPx: +(firstLineTop - wrap.getBoundingClientRect().top).toFixed(2),
      bottomGapPx: +(wrap.getBoundingClientRect().bottom - (firstLineTop + lineHeight)).toFixed(2),
      wrapVsSendHeightPx: send ? +(wrap.getBoundingClientRect().height - send.getBoundingClientRect().height).toFixed(2) : null,
    },
  }
}, label)

const browser = await chromium.launch()
const report = {}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, theme)
  const sessionId = await createSession(`w11b1-probe-${theme}`)
  if (sessionId === undefined) { say(`FAIL [${theme}] session.create`); await context.close(); continue }
  await page.goto(`${BASE}#/chat/${sessionId}`, { waitUntil: 'domcontentloaded' })
  const ta = page.getByPlaceholder('问我任何经营问题...')
  await ta.waitFor({ timeout: 15_000 })
  await sleep(800)

  const states = {}
  states.empty = await measureState(page, 'empty')
  await ta.fill('单')
  await sleep(150)
  states.single = await measureState(page, 'single-char')
  await ta.fill('帮我登记一条采购单，供应商宏发食品')
  await sleep(150)
  states.singleWide = await measureState(page, 'single-wide')
  await ta.fill('帮\n我\n登\n记')
  await sleep(150)
  states.four = await measureState(page, 'four-lines')
  await ta.fill('帮\n我\n登\n记\n一\n条')
  await sleep(150)
  states.six = await measureState(page, 'six-lines-over-maxRows')
  await ta.fill('x'.repeat(220))
  await sleep(150)
  states.overlong = await measureState(page, 'overlong-single-line')
  // Focus face: focus the real textarea, then read wrap computed border/shadow.
  await ta.focus()
  await sleep(250)
  const focusRead = await page.evaluate(() => {
    const wrap = document.querySelector('.adm-text-area[aria-label="消息输入"]')
    const slot = wrap?.querySelector('textarea.adm-text-area-element:not(.adm-text-area-element-hidden)')
    if (!wrap || !slot) return { error: 'not found' }
    const wc = getComputedStyle(wrap)
    return { wrapBorderColor: wc.borderColor, wrapBoxShadow: wc.boxShadow, wrapOutline: wc.outline, active: document.activeElement === slot, activeClass: document.activeElement.className }
  })
  states.focus = { ...await measureState(page, 'focused-single'), focusRead }
  await ta.fill('')
  report[theme] = states
  say(`OK [${theme}] measured ${Object.keys(states).length} states`)
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-b1-padding-probe.json`, JSON.stringify(report, null, 2) + '\n')
writeFileSync(`${OUT}/w11-b1-padding-probe.log`, `${LOG.join('\n')}\n`)
console.log(JSON.stringify(report, null, 2))
