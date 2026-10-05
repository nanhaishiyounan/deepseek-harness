// W11-R1 live re-verification: the four acceptance probes against the rebuilt
// :3080 dist —
//   T1  the offline double-send closure: offline send parks one quoted entry
//       in the outbox with the chip strip CLEARED (the pre-fix face kept the
//       ready chip and re-quoted it on the follow-up send); after recovery the
//       history carries exactly ONE 📎 message and the follow-up text goes out
//       plain (wire-asserted), plus the F5 reload survival of the strip.
//   F2a the failed chip's error line is geometrically INSIDE the chip
//       (errRect.top ≤ chipRect.bottom — the pre-fix face hung it outside the
//       overflow-clipped rail) + screenshot.
//   F4  the send stamp arms for a ready-attachment-only draft + screenshot.
//   F10 the uid() fallback: with crypto.randomUUID stubbed away (the plain
//       -HTTP LAN face), login and the attachment lane both still work.
// Usage (repo root): node demos/acceptance-w11/.verify-w11r1.mjs
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
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-r1-${file}.png` }).then(() => console.log(`shot: w11-r1-${file}.png`))

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

const pickDoc = async (page, label) => {
  await page.setInputFiles('input[type="file"][accept=".pdf,.md,.txt"]', {
    name: `${label}.txt`, mimeType: 'text/plain',
    buffer: Buffer.from(`W11-R1 活体探针附件（${label}）：冷库温控记录 2026-10-05，库 A-3 段，实测 -18.4℃。`, 'utf8'),
  })
  await page.waitForSelector(`[aria-label="附件 ${label}.txt"][data-status="ready"]`, { timeout: 30_000 })
}

const readHistoryTexts = async (sid, rpcId) => {
  const body = await fetch('http://127.0.0.1:3080/api/session.history', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.history', payload: { sessionId: sid, maxMessages: 200 } }),
  }).then(async response => response.json())
  const events = body?.result?.ok === true ? body.result.value.events : []
  return events
    .map(entry => entry?.event)
    .filter(event => event?.type === 'user/message')
    .map(event => String(event?.data?.content?.[0]?.text ?? ''))
    .filter(text => text !== '')
}

const browser = await chromium.launch()

// ── Leg 1 (T1): the offline double-send closure + F5 reload survival ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const prompts = []
  page.on('request', (req) => {
    if (!req.url().includes('/api/session.prompt')) return
    const post = req.postData()
    if (post === undefined) return
    try { prompts.push(JSON.parse(post)) } catch { /* non-JSON never happens on this seam */ }
  })
  await login(page)
  const sid = await createSession(`w11r1t1-${Date.now()}`)
  check('T1-0 会话就绪', sid !== undefined, String(sid))
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await pickDoc(page, 'r1-offline-note')
  const box = page.getByPlaceholder('问我任何经营问题...')
  await box.fill('照这张温控记录登记一条入库')
  // F5 survival first: reload with a ready strip → the chip rehydrates.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  const revived = await page.locator('[aria-label="附件 r1-offline-note.txt"]').count()
  check('F5 刷新回填：ready 附件在 reload 后复活', revived === 1, `count=${revived}`)
  await page.locator('[aria-label="移除 r1-offline-note.txt"]').click()
  await sleep(200)
  await pickDoc(page, 'r1-offline-note')
  await box.fill('照这张温控记录登记一条入库')
  // Offline: the send parks one quoted entry and must take the chips with it.
  await context.setOffline(true)
  await page.getByRole('button', { name: '发送' }).click()
  await page.waitForSelector('div[role="status"][aria-label="待发队列"]', { timeout: 10_000 })
  const lingering = await page.locator('[aria-label="待发送附件"]').count()
  const draftAfterPark = await page.evaluate(() =>
    document.querySelector('.adm-text-area[aria-label="消息输入"] textarea:not(.adm-text-area-element-hidden)').value)
  await shot(page, 't1-offline-parked-no-lingering-375')
  check('T1-1 离线入队后附件 chip 不残留（修复核心）', lingering === 0, `attachRow=${lingering}`)
  check('T1-2 离线入队后 draft 清空', draftAfterPark === '', JSON.stringify(draftAfterPark))
  // Recovery: the parked entry flushes, the follow-up text goes out plain.
  await context.setOffline(false)
  await page.waitForSelector('div[role="status"][aria-label="待发队列"]', { state: 'detached', timeout: 30_000 })
  await sleep(500)
  const followUp = '这是恢复后的纯文字补发'
  await box.fill(followUp)
  await page.getByRole('button', { name: '发送' }).click()
  await sleep(1200)
  const wireText = (call) => String(call?.payload?.content?.[0]?.text ?? '')
  const quoted = prompts.filter(call => wireText(call).includes('📎'))
  const plain = prompts.filter(call => wireText(call) === followUp)
  // Offline retries re-issue the parked send; the idempotency key must be
  // identical across every attempt (the server-side dedup folds them into
  // the one history entry T1-5 asserts).
  const quotedKeys = new Set(quoted.map(call => call?.payload?.clientMsgId))
  check('T1-3 带附件的 wire 尝试共享同一 clientMsgId（幂等折叠）', quotedKeys.size === 1 && quoted.length >= 1, `attempts=${quoted.length} keys=${[...quotedKeys].join(',')}`)
  check('T1-4 恢复后补发纯文字 wire 无附件', plain.length >= 1 && !wireText(plain[0]).includes('📎'), `plain=${plain.length}`)
  // A queued follow-up lands only after the running turn finishes (the
  // attachment message opened one); poll across the real turn duration.
  let texts = []
  for (let attempt = 0; attempt < 25 && !texts.includes(followUp); attempt++) {
    await sleep(2000)
    texts = await readHistoryTexts(sid, `w11r1h-${attempt}-${Date.now()}`)
  }
  const historyQuoted = texts.filter(text => text.includes('📎'))
  check('T1-5 history 只一条带 quote', historyQuoted.length === 1, `quoted=${historyQuoted.length} total=${texts.length}`)
  check('T1-6 history 含纯文字补发且无 quote', texts.includes(followUp), JSON.stringify(texts.map(text => text.slice(0, 40))))
  await shot(page, 't1-recovered-history-single-quote-375')
  await context.close()
}

// ── Leg 2 (F2a): the failed chip's error line sits inside the chip ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.route('**/api/data.extractText', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'data-extract-failed', message: '注入失败：探针路由' } } }) })
  })
  await login(page)
  const sid = await createSession(`w11r1f2-${Date.now()}`)
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await page.setInputFiles('input[type="file"][accept=".pdf,.md,.txt"]', {
    name: 'broken-scan.txt', mimeType: 'text/plain', buffer: Buffer.from('扫描件无文字层', 'utf8'),
  })
  await page.waitForSelector('[aria-label="附件 broken-scan.txt"][data-status="failed"]', { timeout: 15_000 })
  await sleep(400)
  const geo = await page.evaluate(() => {
    const chip = document.querySelector('[aria-label="附件 broken-scan.txt"]')
    const err = document.querySelector('[class*="attachError"]')
    const chipRect = chip.getBoundingClientRect()
    const errRect = err.getBoundingClientRect()
    const rail = chip.closest('[class*="attachRow"]')
    const railRect = rail.getBoundingClientRect()
    return {
      errTop: errRect.top, chipBottom: chipRect.bottom, chipTop: chipRect.top, errHeight: errRect.height,
      inRail: errRect.top >= railRect.top && errRect.bottom <= railRect.bottom,
      text: err.textContent, fs: getComputedStyle(err).fontSize,
    }
  })
  check('F2a-1 错误行在 chip 内（errRect.top ≤ chipRect.bottom）', geo.errTop <= geo.chipBottom, `errTop=${geo.errTop} chipBottom=${geo.chipBottom}`)
  check('F2a-2 错误行在滚动轨道内不被剪裁', geo.inRail, JSON.stringify(geo))
  check('F2a-3 错误文字可见（有内容有高度）', geo.text.includes('未能提取文本') && geo.errHeight > 0, `${geo.text} h=${geo.errHeight}`)
  check('F2a-4 字号走 caption token', geo.fs === '12px', geo.fs)
  await shot(page, 'f2-attach-error-visible-in-chip-375')
  await context.close()
}

// ── Leg 3 (F4): the send stamp arms for a ready-attachment-only draft ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)
  const sid = await createSession(`w11r1f4-${Date.now()}`)
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  const box = page.getByPlaceholder('问我任何经营问题...')
  const bareDisabled = await page.evaluate(() => document.querySelector('button[aria-label="发送"]').disabled)
  await pickDoc(page, 'r1-attach-only')
  const armedState = await page.evaluate(() => {
    const send = document.querySelector('button[aria-label="发送"]')
    const draft = document.querySelector('.adm-text-area[aria-label="消息输入"] textarea:not(.adm-text-area-element-hidden)').value
    return { disabled: send.disabled, draft }
  })
  await shot(page, 'f4-send-armed-attach-only-375')
  check('F4-1 空 draft 无附件：发送钮禁用', bareDisabled === true, `disabled=${bareDisabled}`)
  check('F4-2 空 draft +1 ready 附件：发送钮激活', armedState.disabled === false, `disabled=${armedState.disabled} draft=${JSON.stringify(armedState.draft)}`)
  await context.close()
}

// ── Leg 4 (F10): the uid() fallback keeps login + attachment alive ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
  })
  await login(page)
  const navSeen = await page.locator('nav[aria-label="底部导航"]').count()
  check('F10-1 randomUUID 缺失下登录成功（rpcId 走 uid 兜底）', navSeen === 1, `nav=${navSeen}`)
  const sid = await createSession(`w11r1f10-${Date.now()}`)
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  const apiState = await page.evaluate(() => ({ typeofRandomUUID: typeof crypto.randomUUID, secure: window.isSecureContext }))
  await pickDoc(page, 'r1-uid-fallback')
  const chipState = await page.evaluate(() => {
    const chip = document.querySelector('[aria-label="附件 r1-uid-fallback.txt"]')
    return chip?.getAttribute('data-status') ?? 'missing'
  })
  check('F10-2 附件链路在 randomUUID undefined 下上传 ready', chipState === 'ready', `status=${chipState} api=${JSON.stringify(apiState)}`)
  await shot(page, 'f10-uid-fallback-attach-ready-375')
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-r1-live-verify.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
