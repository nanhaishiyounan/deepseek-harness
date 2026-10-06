// W12 live probe: the template starters over the rebuilt :3080 dist — a tag
// pick fills the skeleton draft and selects the first 【…】 placeholder span
// (typing overwrites it); a placeholder-free pick keeps the end-of-text
// caret; no pick sends anything on its own.
// Usage (repo root): node demos/acceptance-w11/.shoot-w12-tag.mjs
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

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()

await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })

const created = await fetch('http://127.0.0.1:3080/api/session.create', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: 'w12-tag-shoot', method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
}).then(async response => response.json())
const sid = created?.result?.ok === true ? created.result.value.sessionId : undefined
check('会话就绪（mobile-form-assistant）', sid !== undefined, String(sid))
await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
const ta = page.getByPlaceholder('问我任何经营问题...')
await ta.waitFor({ timeout: 15_000 })
await page.getByTestId('welcome-card').waitFor({ timeout: 15_000 })
await sleep(900)

const draftState = () => page.evaluate(() => {
  const box = document.querySelector('.adm-text-area[aria-label="消息输入"] textarea')
    ?? document.querySelector('textarea[placeholder="问我任何经营问题..."]')
  if (box === null) return { error: 'box missing' }
  return { value: box.value, start: box.selectionStart, end: box.selectionEnd, focused: document.activeElement === box }
})

// 1. the single-placeholder skeleton: value + the first 【…】 span selected.
await page.getByRole('button', { name: '查一下库存' }).click()
await sleep(300)
let state = await draftState()
check('查库存 tag 填入骨架句', state.value === '查一下【物料名】还有多少库存', JSON.stringify(state))
check('首占位段【物料名】被选中（3..8）', state.start === 3 && state.end === 8, `start=${String(state.start)} end=${String(state.end)}`)
check('填入后聚焦且未发送（无用户气泡）', state.focused === true && await page.locator('div[class*="userBubble"]').count() === 0)
await page.screenshot({ path: `${OUT}/w12-tag-template-inventory-375.png` })
console.log('shot: w12-tag-template-inventory-375.png')

// 2. the multi-placeholder skeleton: the first span (【供应商】) is the pick.
await page.getByRole('button', { name: '登记一条采购单' }).click()
await sleep(300)
state = await draftState()
check('采购 tag 填入骨架句', state.value === '向【供应商】采购【物料】，数量【数量】，单价【单价】', JSON.stringify(state.value))
check('首占位段【供应商】被选中（1..6）', state.start === 1 && state.end === 6, `start=${String(state.start)} end=${String(state.end)}`)
check('仍未发送', await page.locator('div[class*="userBubble"]').count() === 0)
await page.screenshot({ path: `${OUT}/w12-tag-template-purchase-375.png` })
console.log('shot: w12-tag-template-purchase-375.png')

// 3. placeholder-free regression: the caret parks at the end (W9-B1).
await page.getByRole('button', { name: '哪些料要补货' }).click()
await sleep(300)
state = await draftState()
check('无占位句维持文尾光标', state.value === '哪些料要补货' && state.start === 6 && state.end === 6, JSON.stringify(state))

await browser.close()
