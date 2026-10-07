// W21-P3 GIF recording: S1 supplier disambiguation → present_card ask_choice,
// against the live :3080 gateway (real MiniMax model round, current worktree).
// Frames land in .playwright-mcp/gif-frames-w21-p3/ (gitignored); the encoder
// then produces demos/acceptance-w21/p3-s1-disambiguation.gif.
import { mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const FRAMES = '.playwright-mcp/gif-frames-w21-p3'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(FRAMES, { recursive: true })

const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `gif-${Date.now()}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()

// 00 — login gate.
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '登录' }).waitFor({ timeout: 15_000 })
await page.screenshot({ path: `${FRAMES}/00-login.png` })

// Log in.
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })

// 01 — fresh chat session.
const created = await rpc('session.create', { agentPreset: 'mobile-form-assistant' })
const sid = typeof created === 'string' ? created : created?.sessionId
await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
await sleep(1_200)
await page.screenshot({ path: `${FRAMES}/01-chat-empty.png` })

// 02 — the typed complaint-shaped procurement line.
const box = page.getByPlaceholder('问我任何经营问题...')
await box.fill('向鲜丰采购面粉，数量100，单价10')
await sleep(600)
await page.screenshot({ path: `${FRAMES}/02-typed.png` })

// 03 — transient running state + 04 — the settled ask_choice card. Both the
// poll and the two captures ride this one script call so the running frame is
// not lost between tool invocations.
await page.getByRole('button', { name: '发送' }).click()
let runningShot = false
for (let i = 0; i < 120; i++) {
  const running = await page.locator('text=正在调用').count()
  if (running > 0 && !runningShot) {
    await page.screenshot({ path: `${FRAMES}/03-running.png` })
    runningShot = true
  }
  const card = await page.locator('[data-testid="ask-choice"]').count()
  if (card >= 1) break
  await sleep(1_000)
}
await sleep(1_500)
await page.screenshot({ path: `${FRAMES}/04-card.png` })
console.log(JSON.stringify({ ok: true, sid, runningShot, frames: 4 }))
await browser.close()
