// W7-R1 P1-8 evidence: injection-class failure/recovery scenarios on the real
// mobile shell (:3080) — the production-simulation gap the B6 verification
// left open (its legs asserted happy paths; nothing had proven the shell
// degrades loudly and recovers under fault injection).
//
//   s1 offline outbox: cut the network mid-session (context.setOffline), send
//      a message through the real composer, assert the fail-loud degradation
//      (the send parks in the durable `dsh-mobile-outbox` queue instead of
//      dying at the composer), then restore the network and dispatch the
//      `online` event, asserting the flush lands the message (queue empties,
//      the bubble renders) — the documented W6-B1/W6-R1 recovery path.
//   s2 CPU 4× throttle: Emulation.setCPUThrottlingRate(4) with a buffered
//      longtask observer over the five core navigations; assert no long task
//      ≥500ms blocks the main thread (the worst task is reported either way).
//   s3 dead route: `#/work/w_nonexistent_inject` must land on a live
//      degraded surface (the router's bad-id fold), not a blank frame —
//      assert the shell keeps rendering with zero uncaught errors.
//
// Screenshots before/after each fault state + the captured console as the
// boot log; every scenario's failure signal AND recovery path are asserted.
// Usage (repo root): node demos/acceptance-w7/w7-r1-05-inject.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w7/'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const consoleLines = []
page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text().slice(0, 160)}`))
page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${String(err).slice(0, 200)}`))

const failures = []
const ok = (label) => { console.log(`  ✓ ${label}`) }
const bad = (label) => { failures.push(label); console.log(`  ✗ ${label}`) }

await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1000)

// ── s1: offline outbox flush ─────────────────────────────────────────────
console.log('-- s1 offline：outbox 断网排队 → 恢复冲刷 --')
let sessionId = null
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.locator('[aria-label="会话列表"]').waitFor({ timeout: 10_000 })
await page.locator('button[class*="sessionRow"]').first().waitFor({ timeout: 10_000 })
await page.locator('button[class*="sessionRow"]').first().click()
await sleep(1400)
sessionId = /^#\/chat\/(.+)$/.exec(await page.evaluate(() => location.hash))?.[1] ?? null
if (sessionId === null) {
  bad('s1 前置：会话列表第一卡未开出 #/chat/<id>（无既有会话可注入）')
} else {
  ok(`进入会话 #/chat/${sessionId.slice(0, 12)}…`)
  const composer = page.locator('textarea:visible, [contenteditable="true"]:visible').last()
  await composer.fill('W7-R1 离线注入探针消息（断网期间发出，应落 outbox）')
  await page.screenshot({ path: `${OUT}w7-r1-05-s1-before-offline.png` })
  await context.setOffline(true)
  await page.locator('button[aria-label*="发送"], button:has-text("发送")').last().click().catch(async () => { await composer.press('Enter') })
  await sleep(1500)
  const parked = await page.evaluate(() => {
    const raw = localStorage.getItem('dsh-mobile-outbox') ?? ''
    try {
      const shape = JSON.parse(raw)
      return { rows: Array.isArray(shape.entries) ? shape.entries.length : Array.isArray(shape) ? shape.length : -1, raw: raw.length }
    } catch { return { rows: -1, raw: raw.length } }
  })
  if (parked.rows >= 1) ok(`断网发送 fail-loud 降级：消息排队 outbox（rows=${String(parked.rows)}，未死在 composer）`)
  else bad(`断网发送未排队（outbox rows=${String(parked.rows)} raw=${String(parked.raw)}B）——降级路径未走通`)
  await page.screenshot({ path: `${OUT}w7-r1-05-s1-during-offline.png` })

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  let flushed = false
  for (let i = 0; i < 20; i += 1) {
    await sleep(1000)
    const rows = await page.evaluate(() => {
      try {
        const shape = JSON.parse(localStorage.getItem('dsh-mobile-outbox') ?? '{}')
        return Array.isArray(shape.entries) ? shape.entries.length : Array.isArray(shape) ? shape.length : 0
      } catch { return 0 }
    })
    if (rows === 0) { flushed = true; break }
  }
  if (flushed) ok('恢复路径：online 事件冲刷 outbox，队列清空')
  else bad('恢复路径：20s 内 outbox 未清空')
  await sleep(2500)
  let delivered = await page.evaluate(() => document.body.innerText.includes('W7-R1 离线注入探针消息'))
  if (!delivered) {
    // The flushed message rides the session reload: re-enter the chat once.
    const hashNow = await page.evaluate(() => location.hash)
    await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
    await sleep(900)
    await page.goto(hashNow === '' ? `${BASE}#/chats` : `${BASE}${hashNow}`, { waitUntil: 'domcontentloaded' })
    await sleep(2000)
    delivered = await page.evaluate(() => document.body.innerText.includes('W7-R1 离线注入探针消息'))
  }
  if (delivered) ok('恢复路径：消息已送达渲染在会话中')
  else bad('恢复路径：消息气泡未上屏')
  await page.screenshot({ path: `${OUT}w7-r1-05-s1-after-recovered.png` })
}

// ── s2: CPU 4× throttle, no ≥500ms long task over the core navigations ──
console.log('-- s2 CPU 4× 节流：核心导航无 ≥500ms long task --')
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await page.evaluate(() => {
  window.__w7r1Longtasks = []
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__w7r1Longtasks.push({ start: Math.round(entry.startTime), dur: Math.round(entry.duration), hash: location.hash })
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch { window.__w7r1Longtasks = null }
})
for (const hash of ['#/', '#/chats', '#/work', '#/todos', '#/me']) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
}
await sleep(800)
const longtasks = await page.evaluate(() => window.__w7r1Longtasks)
const worst = Array.isArray(longtasks) && longtasks.length > 0 ? Math.max(...longtasks.map((t) => t.dur)) : 0
const blocking = Array.isArray(longtasks) ? longtasks.filter((t) => t.dur >= 500) : []
if (Array.isArray(longtasks)) {
  if (blocking.length === 0) {
    ok(`CPU 4× 下五面导航 0 个 ≥500ms long task（最长 ${String(worst)}ms）`)
  } else {
    const byHash = blocking.map((t) => `${t.hash}@+${String(t.start)}ms=${String(t.dur)}ms`).join(', ')
    bad(`CPU 4× 下出现 ${String(blocking.length)} 个 ≥500ms long task（${byHash}）`)
  }
  if (longtasks.length > 0) console.log(`  · long task 全录：${longtasks.map((t) => `${t.hash}=${String(t.dur)}ms`).join(', ')}`)
} else {
  bad('longtask PerformanceObserver 不可用（浏览器不支持 longtask 条目）')
}
await page.screenshot({ path: `${OUT}w7-r1-05-s2-cpu4x.png` })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

// ── s3: dead route degrades to a live surface ───────────────────────────
console.log('-- s3 死路由：#/work/<不存在 id> 降级面 --')
const errorsBefore = consoleLines.filter((l) => l.startsWith('[pageerror]')).length
await page.goto(`${BASE}#/work/w_nonexistent_inject`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
const deadState = await page.evaluate(() => ({
  hash: location.hash,
  text: document.body.innerText,
  blank: document.body.innerText.trim().length < 5,
}))
const errorsAfter = consoleLines.filter((l) => l.startsWith('[pageerror]')).length
// The work/:bad-id fold renders the detail frame's degraded face («该工作不存在或已删除»)
// — a secondary page, so the bottom tab bar is legitimately absent here.
if (!deadState.blank && deadState.text.includes('该工作不存在')) ok(`死路由降级：detail 降级面渲染（「该工作不存在或已删除」，hash=${deadState.hash}）`)
else bad(`死路由未落降级面（blank=${String(deadState.blank)} text=${deadState.text.slice(0, 60)}）`)
if (errorsAfter === errorsBefore) ok('死路由零未捕获错误')
else bad(`死路由新增 ${String(errorsAfter - errorsBefore)} 个未捕获错误`)
await page.screenshot({ path: `${OUT}w7-r1-05-s3-dead-route.png` })

await browser.close()
writeFileSync(`${OUT}w7-r1-05-inject-console.log`, `${consoleLines.join('\n')}\n`)
console.log(failures.length === 0 ? '== 注入三场景 ALL GREEN ==' : `== 注入场景 FAIL(${String(failures.length)})：${failures.join('；')} ==`)
process.exit(failures.length === 0 ? 0 : 1)
