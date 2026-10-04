// W8-B3 live evidence probe (375px): runs against the NEW-code gateway on
// :13800 (the long-lived :3080 process predates this batch's apiproxy
// changes). Four legs, all real-server:
//   1. afterSeq incremental polling — the chat page's session.history calls:
//      first read full, later reads carry the cursor and answer with a
//      payload a fraction of the full baseline (network log asserted).
//   2. work projection roaming — the login seed's real createWorkItem writes
//      ride up to wfl_mobile_work; a cleared localStorage (fresh device)
//      rehydrates them after sign-in; a second account never sees them.
//   3. session expiry — a poisoned token on an identity-gated read clears
//      the identity, toasts, keeps the local work data, and re-login
//      backfills.
//   4. four 375px shots (w8-b3-*.png).
// Usage (repo root): node demos/acceptance-w8/.shoot-w8b3.mjs
// Needs: NocoBase :13000, engine :13110, gateway :13800 (W8-B3 instance).
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:13800/mobile.html'
const OUT = 'demos/acceptance-w8'
const LOG = []
/** The NocoBase root API token cache (the projected-rows assertions read the table directly). */
let cachedRootToken
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

const login = async (page, account, password) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear() })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const browser = await chromium.launch()

// ── Leg 1: incremental history polling on a live chat ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const historyCalls = []
  page.on('response', async (response) => {
    if (!response.url().includes('/api/session.history')) return
    const request = response.request()
    let payload = {}
    try { payload = JSON.parse(request.postData() ?? '{}').payload ?? {} } catch { /* non-JSON */ }
    let body = ''
    try { body = (await response.text()) ?? '' } catch { /* body gone */ }
    historyCalls.push({ afterSeq: payload.afterSeq, hasCursor: payload.afterSeq !== undefined, bytes: body.length })
  })
  await login(page, 'buyer', 'Buyer#2026')
  await sleep(1500)
  // Create a fresh session over the wire (the copied DSH_HOME carries no
  // history rows for chats list clicks), open it, let it poll idle, then
  // send a message so the running window (800ms) exercises the cursor path.
  const created = await fetch('http://127.0.0.1:13800/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'w8b3-create', method: 'session.create', payload: {} }),
  }).then(async response => response.json())
  const sessionId = created?.result?.ok === true ? created.result.value.sessionId : undefined
  check('探针会话创建（session.create）', sessionId !== undefined, `id=${String(sessionId)}`)
  if (sessionId === undefined) throw new Error('session.create failed')
  await page.goto(`${BASE}#/chat/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  const composer = page.locator('textarea').first()
  await composer.waitFor({ timeout: 10_000 })
  await composer.fill('W8-B3 增量轮询探针：请用一句话确认收到。')
  await composer.press('Enter')
  await sleep(7000)
  const full = historyCalls.filter(call => !call.hasCursor)
  const cursor = historyCalls.filter(call => call.hasCursor)
  check('轮询首拉是全量读（无游标）', full.length >= 1, `full=${String(full.length)}`)
  check('后续轮询携带 afterSeq 游标', cursor.length >= 2, `cursor=${String(cursor.length)}`)
  const fullBytes = Math.max(...full.map(call => call.bytes), 1)
  const cursorBytes = Math.max(...cursor.map(call => call.bytes), 1)
  check('增量响应体积显著小于全量基线', cursorBytes < fullBytes * 0.6, `full≈${String(fullBytes)}B cursor≤${String(cursorBytes)}B ratio=${String(Math.round(cursorBytes / fullBytes * 100))}%`)
  await page.screenshot({ path: `${OUT}/w8-b3-01-chat-incremental-375.png` })
  await context.close()
}

// ── Leg 2: work projection roaming + account isolation ──
{
  // Device A: buyer signs in on a wiped browser; the demo seed's
  // createWorkItem calls ride the write-through to the server.
  const deviceA = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const pageA = await deviceA.newPage()
  await login(pageA, 'buyer', 'Buyer#2026')
  await sleep(3000)
  const seededCount = await pageA.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-work') ?? '{"items":[]}').items.length)
  check('设备A登录后本地工作项就绪（seed 真实写入）', seededCount >= 3, `items=${String(seededCount)}`)
  const projected = await fetch('http://127.0.0.1:13000/api/wfl_mobile_work:list?pageSize=100&filter=' + encodeURIComponent(JSON.stringify({ user: { $eq: 'buyer' } })), {
    headers: { authorization: `Bearer ${await rootToken()}` },
  }).then(async response => response.json()).then(payload => payload.data.length).catch(() => -1)
  check('写穿已上服务端（wfl_mobile_work 有 buyer 行）', projected >= 3, `rows=${String(projected)}`)

  // Device B: the same account on a cleared browser (localStorage wiped =
  // new device); the login backfill must rehydrate the items.
  await pageA.evaluate(() => { localStorage.removeItem('dsh-mobile-work'); localStorage.removeItem('dsh-mobile-outbox'); localStorage.removeItem('dsh-mobile-work-outbox') })
  await pageA.reload({ waitUntil: 'domcontentloaded' })
  await pageA.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(3000)
  const afterWipe = await pageA.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-work') ?? '{"items":[]}').items.length)
  check('清空本地后登录回灌，工作项从服务端存活', afterWipe >= 3, `items=${String(afterWipe)}`)
  await pageA.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await sleep(900)
  await pageA.screenshot({ path: `${OUT}/w8-b3-02-work-roamed-375.png` })

  // Account isolation: keeper's own device never sees buyer's rows.
  const deviceB = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const pageB = await deviceB.newPage()
  await login(pageB, 'keeper', 'Keeper#2026')
  await sleep(3000)
  const keeperItems = await pageB.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-work') ?? '{"items":[]}').items.map(item => item.id))
  const buyerRows = await fetch('http://127.0.0.1:13000/api/wfl_mobile_work:list?pageSize=100&filter=' + encodeURIComponent(JSON.stringify({ user: { $eq: 'buyer' } })), {
    headers: { authorization: `Bearer ${await rootToken()}` },
  }).then(async response => response.json()).then(payload => payload.data.map(row => row.client_id)).catch(() => [])
  const leak = buyerRows.filter(id => keeperItems.includes(id))
  check('跨账号隔离（keeper 看不到 buyer 的工作项）', leak.length === 0, `leak=${String(leak.length)} keeperItems=${String(keeperItems.length)} buyerRows=${String(buyerRows.length)}`)
  await pageB.screenshot({ path: `${OUT}/w8-b3-03-keeper-isolated-375.png` })
  await deviceA.close()
  await deviceB.close()
}

// ── Leg 3: graceful session expiry ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'buyer', 'Buyer#2026')
  await sleep(2500)
  const workBefore = await page.evaluate(() => localStorage.getItem('dsh-mobile-work'))
  // Poison the gateway token, then make an identity-gated read (todos).
  await page.evaluate(() => {
    const identity = JSON.parse(localStorage.getItem('dsh-mobile-auth') ?? '{}')
    identity.token = 'w8b3-poisoned-token'
    localStorage.setItem('dsh-mobile-auth', JSON.stringify(identity))
  })
  await page.goto(`${BASE}#/todos`, { waitUntil: 'domcontentloaded' })
  // The expiry path clears the identity and lands on the login gate.
  await page.waitForSelector('input[placeholder="业务账号（如 buyer）"]', { timeout: 20_000 }).catch(() => undefined)
  const backToLogin = await page.evaluate(() => document.querySelector('input[placeholder="业务账号（如 buyer）"]') !== null)
  check('过期后回到登录门', backToLogin)
  const workAfter = await page.evaluate(() => localStorage.getItem('dsh-mobile-work'))
  check('本地工作数据在过期后保留', workAfter !== null && workAfter === workBefore)
  await page.screenshot({ path: `${OUT}/w8-b3-04-expiry-relogin-375.png` })
  // Re-login: the backfill rehydrates the items again.
  await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
  await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
  await page.getByRole('button', { name: '登录' }).click()
  // The todos route stays a layer page (no tab bar); the signed-in marker is
  // the login gate leaving the DOM.
  await page.waitForSelector('input[placeholder="业务账号（如 buyer）"]', { state: 'detached', timeout: 30_000 })
  await sleep(3000)
  const rehydrated = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-work') ?? '{"items":[]}').items.length)
  check('重登后回灌恢复工作项', rehydrated >= 3, `items=${String(rehydrated)}`)
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w8-b3-probe.log`, `${LOG.join('\n')}\n`)
console.log(`\nw8-b3 probe: ${LOG.filter(line => line.startsWith('PASS')).length}/${String(LOG.length)} legs passed → ${OUT}/w8-b3-probe.log`)

/** The root API token (the rehearsal scripts' shared reader). */
async function rootToken() {
  if (cachedRootToken === undefined) {
    const payload = await fetch('http://127.0.0.1:13000/api/auth:signIn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com', password: process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123' }),
    }).then(async response => response.json())
    cachedRootToken = payload?.data?.token ?? ''
  }
  return cachedRootToken
}
