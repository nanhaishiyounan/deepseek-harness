// W11-B1 regression probe: the two constraint faces re-run live against the
// rebuilt dist — (1) the W9-B1 fillDraft semantics (fill replaces the draft,
// focuses, parks the caret, never sends; the flash mounts; the send button
// arms) and (2) the W8 route reachability sweep (every hash route mounts its
// anchor element, no blank page).
// Usage (repo root): node demos/acceptance-w11/.regression-w11b1.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

const login = async (page) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
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

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()
let prompts = 0
page.on('request', (req) => { if (req.url().includes('/api/session.prompt')) prompts += 1 })
await login(page)

// ── Leg A: the W9-B1 fillDraft semantics on the rebuilt composer ──
const sid = await createSession('w11b1-regress')
check('A0 会话就绪', sid !== undefined, String(sid))
await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
await sleep(600)
const starter = page.locator('[data-testid="welcome-card"] button', { hasText: '登记一条采购单' }).first()
await starter.click()
await sleep(300)
const stateA = await page.evaluate(() => {
  const slot = document.querySelector('.adm-text-area[aria-label="消息输入"] textarea:not(.adm-text-area-element-hidden)')
  const row = document.querySelector('.adm-text-area[aria-label="消息输入"]').parentElement
  const send = document.querySelector('button[aria-label="发送"]')
  return {
    value: slot.value, focused: document.activeElement === slot,
    start: slot.selectionStart, end: slot.selectionEnd,
    fillFlag: row.getAttribute('data-fill'),
    sendDisabled: send.hasAttribute('disabled'),
    welcome: document.querySelector('[data-testid="welcome-card"]') !== null,
  }
})
check('A1 starter 点击 → 草稿填入（未发送）', stateA.value.includes('采购'), JSON.stringify(stateA))
check('A2 输入框自动聚焦', stateA.focused)
check('A3 光标在末尾', stateA.start === stateA.end && stateA.end === stateA.value.length, `start=${stateA.start} end=${stateA.end}`)
check('A4 未自动发送（prompts=0）', prompts === 0, `prompts=${prompts}`)
check('A5 data-fill 闪烁挂载', stateA.fillFlag !== null)
check('A6 发送钮随填入激活', !stateA.sendDisabled)
check('A7 欢迎屏仍在（填入≠消息）', stateA.welcome)
// User edit + manual send still works through the same pure-text contract.
await page.getByPlaceholder('问我任何经营问题...').fill('帮我登记一条采购单，供应商宏发食品')
await page.getByRole('button', { name: '发送' }).click()
await sleep(1200)
check('A8 手动发送发出（prompts=1）', prompts === 1, `prompts=${prompts}`)
const cleared = await page.evaluate(() => document.querySelector('.adm-text-area[aria-label="消息输入"] textarea:not(.adm-text-area-element-hidden)').value)
check('A9 发送后草稿清空', cleared === '', JSON.stringify(cleared))

// ── Leg B: the W8 route reachability sweep ──
// The reachability anchors target each page's own headline/content element:
// a bare `h1` wait would pin home's ever-present (display:none) heroTitle and
// time out on every secondary page.
const routes = [
  ['#/home', 'nav[aria-label="底部导航"]'],
  ['#/chats', 'button[aria-label="新建会话"]'],
  ['#/work', 'h1[class*="pageTitle"], h1[class*="workTitle"]'],
  ['#/tasks', 'h1[class*="pageTitle"]'],
  ['#/files', 'h1[class*="pageTitle"]'],
  ['#/agents', 'h1[class*="headerTitle"]'],
  ['#/me', 'text:本月登记'],
  ['#/todos', 'h1[class*="pageTitle"]'],
  ['#/alerts', 'h1[class*="pageTitle"]'],
  ['#/docs', 'h1[class*="pageTitle"]'],
  [`#/chat/${sid}`, '.adm-text-area[aria-label="消息输入"]'],
]
for (const [hash, anchor] of routes) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  let ok = true
  if (anchor.startsWith('text:')) {
    try { await page.getByText(anchor.slice(5), { exact: false }).first().waitFor({ timeout: 8_000 }) } catch { ok = false }
  } else {
    try { await page.waitForSelector(anchor, { timeout: 8_000 }) } catch { ok = false }
  }
  check(`B ${hash} 可达`, ok, anchor)
}

await context.close()
await browser.close()
writeFileSync(`${OUT}/w11-b1-regression.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
