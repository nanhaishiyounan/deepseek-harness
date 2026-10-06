// W11-R2 live re-verification: the LAN HTTP delivery blocker against the
// rebuilt :3080 dist, under a genuinely insecure context —
//   R2-0  the environment face: http://w11lan.test:3080 (mapped to 127.0.0.1
//         via Chromium --host-resolver-rules; the CLI refuses non-loopback
//         binds by design) is NOT a secure context and crypto.randomUUID is
//         undefined there — the exact plain-HTTP LAN shape, no stubs.
//   R2-1  the head fix: under that face, tapping send reaches a terminal
//         state — the wire carries session.prompt with an m_-prefixed
//         clientMsgId (uid() fallback), the draft clears, sending resets
//         (a second message sends), and the durable history carries the
//         message. The pre-fix face threw at crypto.randomUUID inside
//         newClientMsgId and deadlocked the composer.
//   R2-2  persistence under the same face: a document pick lands ready and
//         survives a reload (savePersisted works without secure-context
//         APIs).
//   R2-3  the logout sweep: seeded draft/outbox/attachment keys all drop on
//         退出登录 while the theme key survives.
// Usage (repo root): node demos/acceptance-w11/.verify-w11r2.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://w11lan.test:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w11'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-r2-${file}.png` }).then(() => console.log(`shot: w11-r2-${file}.png`))

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
  const created = await fetch(`${API}/session.create`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

const readHistoryTexts = async (sid, rpcId) => {
  const body = await fetch(`${API}/session.history`, {
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

// The insecure-context face rides Chromium's host resolver: the page origin
// is a plain-HTTP non-localhost authority, exactly the LAN deployment shape
// (the CLI refuses --host 0.0.0.0 by design, and the /api trust fence has
// w11lan.test:3080 whitelisted via --trusted-host).
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP w11lan.test 127.0.0.1'] })
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const prompts = []
page.on('request', (req) => {
  if (!req.url().includes('/api/session.prompt')) return
  const post = req.postData()
  if (post === undefined) return
  try { prompts.push(JSON.parse(post)) } catch { /* non-JSON never happens on this seam */ }
})

// ── R2-0: the environment face is genuinely insecure ──
{
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  const face = await page.evaluate(() => ({
    secure: window.isSecureContext,
    uuid: typeof crypto.randomUUID,
  }))
  check('R2-0 LAN HTTP 面：isSecureContext=false 且 randomUUID undefined（真非 secure，无 stub）', face.secure === false && face.uuid === 'undefined', JSON.stringify(face))
}

// ── R2-1: the head fix — send reaches a terminal state under that face ──
{
  await login(page)
  const sid = await createSession(`w11r2send-${Date.now()}`)
  check('R2-1a 会话就绪', sid !== undefined, String(sid))
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  const box = page.getByPlaceholder('问我任何经营问题...')
  await box.waitFor({ timeout: 15_000 })
  const first = 'LAN HTTP 下这条要能正常发出（W11-R2 活体）'
  await box.fill(first)
  await page.getByRole('button', { name: '发送' }).click()
  // The wire attempt carries an m_-prefixed clientMsgId built by the uid()
  // fallback (8 hex chars of nonce — no dashes to strip in the fallback arm).
  let wired = undefined
  for (let attempt = 0; attempt < 20 && wired === undefined; attempt++) {
    await sleep(500)
    wired = prompts.find(call => String(call?.payload?.content?.[0]?.text ?? '') === first)
  }
  const key = wired?.payload?.clientMsgId
  check('R2-1b 非 secure 下 wire 发出且 clientMsgId 为 m_ 前缀（uid 兜底）', wired !== undefined && typeof key === 'string' && key.startsWith('m_'), `key=${String(key)}`)
  let draftAfter = 'unset'
  for (let attempt = 0; attempt < 20 && draftAfter !== ''; attempt++) {
    await sleep(500)
    draftAfter = await box.inputValue()
  }
  check('R2-1c 发送成功终态：draft 清空', draftAfter === '', JSON.stringify(draftAfter))
  await shot(page, '01-lan-http-send-terminal-375')
  // sending reset: the composer re-arms once the opened turn settles (while
  // it runs the stamp shows 停止生成 — the pre-fix face stayed disabled even
  // after the turn ended).
  const second = '第二条也照常发出'
  await box.fill(second)
  let armed = false
  for (let attempt = 0; attempt < 60 && !armed; attempt++) {
    await sleep(1000)
    const sendBtn = page.getByRole('button', { name: '发送' })
    armed = await sendBtn.count() === 1 && await sendBtn.isEnabled()
  }
  check('R2-1d 发送终态后 sending 复位（turn 结束后第二条可发）', armed, `armed=${String(armed)}`)
  await page.getByRole('button', { name: '发送' }).click()
  let wired2 = undefined
  for (let attempt = 0; attempt < 20 && wired2 === undefined; attempt++) {
    await sleep(500)
    wired2 = prompts.find(call => String(call?.payload?.content?.[0]?.text ?? '') === second)
  }
  check('R2-1e 第二条 wire 发出且 clientMsgId 不同', wired2 !== undefined && wired2?.payload?.clientMsgId !== key, `keys=${String(key)} vs ${String(wired2?.payload?.clientMsgId)}`)
  // The durable log carries the first message (queue mode landed it).
  let texts = []
  for (let attempt = 0; attempt < 20 && !texts.includes(first); attempt++) {
    await sleep(2000)
    texts = await readHistoryTexts(sid, `w11r2hist-${attempt}-${Date.now()}`)
  }
  check('R2-1f history 落账第一条消息', texts.includes(first), `total=${texts.length}`)
}

// ── R2-2: persistence works without secure-context APIs ──
{
  const sid = await createSession(`w11r2keep-${Date.now()}`)
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await page.setInputFiles('input[type="file"][accept=".pdf,.md,.txt"]', {
    name: 'r2-lan-note.txt', mimeType: 'text/plain',
    buffer: Buffer.from('W11-R2 LAN HTTP 活体：非 secure 下附件持久化探针。冷库 -18.6℃。', 'utf8'),
  })
  await page.waitForSelector('[aria-label="附件 r2-lan-note.txt"][data-status="ready"]', { timeout: 30_000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  const revived = await page.locator('[aria-label="附件 r2-lan-note.txt"]').count()
  check('R2-2 非 secure 下 ready 附件 reload 回填（savePersisted 正常）', revived === 1, `count=${revived}`)
  await shot(page, '02-attach-rehydrate-insecure-375')
  await page.locator('[aria-label="移除 r2-lan-note.txt"]').click()
  await sleep(300)
}

// ── R2-3: the logout sweep drops the session keys, keeps the rest ──
{
  await page.evaluate(() => {
    localStorage.setItem('dsh-mobile-draft-sweep-1', '{}')
    localStorage.setItem('dsh-mobile-outbox', '{"version":2,"entries":[]}')
    localStorage.setItem('dsh-mobile-attachments-sweep-2', '{"version":2,"savedAt":1,"rows":[]}')
    localStorage.setItem('dsh-mobile-theme', 'dark')
  })
  // A same-document hash jump (page.goto with a bare hash change does not
  // fire the router's hashchange in this Chromium).
  await page.evaluate(() => { location.hash = '#/me' })
  await page.getByRole('button', { name: /退出登录/ }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: /退出登录/ }).click()
  // Let the confirm popup's enter animation settle, then press through: the
  // antd-mobile mask's portal host intercepts Playwright's hit-test while the
  // destructive button itself is plainly clickable by a user.
  await sleep(600)
  await page.getByRole('button', { name: '退出', exact: true }).click({ force: true })
  await sleep(500)
  await page.getByPlaceholder('业务账号（如 buyer）').waitFor({ timeout: 15_000 })
  await shot(page, '03-logout-swept-375')
  const after = await page.evaluate(() => ({
    draft: localStorage.getItem('dsh-mobile-draft-sweep-1'),
    outbox: localStorage.getItem('dsh-mobile-outbox'),
    attachments: localStorage.getItem('dsh-mobile-attachments-sweep-2'),
    theme: localStorage.getItem('dsh-mobile-theme'),
  }))
  check('R2-3 登出 sweep：三类会话键全清、theme 保留',
    after.draft === null && after.outbox === null && after.attachments === null && after.theme === 'dark',
    JSON.stringify(after))
}

await browser.close()
writeFileSync(`${OUT}/w11-r2-live-verify.log`, `${LOG.join('\n')}\n`)
console.log(`\nlog: ${OUT}/w11-r2-live-verify.log`)
