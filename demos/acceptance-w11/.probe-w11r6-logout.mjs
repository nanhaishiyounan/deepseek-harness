// One-off probe v2: settle the dialog animation, click without force (the
// R3 form), then report dialog state / auth / swept trace.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
const BASE = 'http://127.0.0.1:3080/mobile.html'
const SEED_SID = 'session-w11r6-lum-probe'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const infos = []
page.on('console', (m) => { if (m.type() === 'info') infos.push(m.text()) })
page.route('**/api/session.history', async (route) => {
  const rpcId = JSON.parse(route.request().postData()).rpcId
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value: { events: [] } } }) })
})
page.route('**/api/nocobase.*', async (route) => {
  const rpcId = JSON.parse(route.request().postData()).rpcId
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'nocobase-not-composed', message: 'probe: not composed' } } }) })
})
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate((sid) => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-theme', 'light')
  localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: 'qc_inspector', nickname: '质检·王五', token: 'tok-w11r6-probe', loggedAt: Date.now() }))
  localStorage.setItem(`dsh-mobile-draft-${sid}`, '草稿残留')
  localStorage.setItem('dsh-mobile-outbox', '{"version":2,"entries":[]}')
  localStorage.setItem(`dsh-mobile-attachments-${sid}`, '{"version":2,"savedAt":1,"rows":[]}')
}, SEED_SID)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '退出登录' }).click()
await page.waitForSelector('.adm-dialog-content', { timeout: 10_000 })
await new Promise((r) => setTimeout(r, 800))
try {
  await page.getByRole('button', { name: '退出', exact: true }).click({ timeout: 5000 })
  console.log('click (no force) dispatched')
} catch (e) {
  console.log(`role click failed: ${String(e).slice(0, 300)}`)
}
await new Promise((r) => setTimeout(r, 1200))
const state = await page.evaluate(() => ({
  dialogOpen: document.querySelector('.adm-dialog') !== null,
  auth: localStorage.getItem('dsh-mobile-auth'),
  keys: Object.keys(localStorage),
}))
console.log(JSON.stringify(state, null, 2))
console.log(`infos: ${JSON.stringify(infos)}`)
await browser.close()
