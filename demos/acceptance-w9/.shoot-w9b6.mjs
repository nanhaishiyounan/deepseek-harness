// W9-B6 evidence shoot: the 12-route matrix over the real gateway on :3080 —
// every route light@375, the dark spot-checks (home/work/me/login) and one
// 390 leg, plus the v3 form face (a real register request driving the draft
// card) and the re-skinned login page on both tracks.
// Usage (repo root): W9B6_CHAT=<sessionId> node demos/acceptance-w9/.shoot-w9b6.mjs
// (W9B6_CHAT optional — a fresh session with one register turn is created
//  when unset.)
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w9'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

const login = async (page, theme, account = 'qc_inspector', password = 'Qc#2026') => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    if (key !== undefined) localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

/** Create a fresh fill-assistant session over the wire; returns its id. */
const createSession = async (rpcId) => {
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

const browser = await chromium.launch()

// ── The light@375 dozen ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')

  const shoot = async (hash, file, settle = 1500) => {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await page.screenshot({ path: `${OUT}/${file}` })
    console.log(`shot: ${file}`)
  }

  await shoot('#/home', 'w9-b6-01-home-375-light.png', 1800)
  await shoot('#/chats', 'w9-b6-02-chats-375-light.png', 2000)
  const chatSession = process.env['W9B6_CHAT'] ?? await createSession('w9b6-shot')
  check('chat 会话就绪', chatSession !== undefined, String(chatSession))
  await shoot(`#/chat/${chatSession}`, 'w9-b6-03-chat-375-light.png', 2000)
  await shoot('#/work', 'w9-b6-04-work-375-light.png', 2200)
  await context.close()
}
{
  // Work detail over the buyer account (the inspector's ledger reads empty;
  // buyer carries the routed wfl_mobile_work rows).
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light', 'buyer', 'Buyer#2026')
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await sleep(2600)
  const row = page.locator('[aria-label="工作列表"] button[aria-label^="打开"]').first()
  if (await row.count() > 0) {
    await row.click()
    await sleep(2400)
  }
  check('work 详情路由进入', /#\/work\/.+/.test(page.url()), page.url())
  await page.screenshot({ path: `${OUT}/w9-b6-05-workdetail-375-light.png` })
  await context.close()
}
{
  // The remaining light dozen continues on the inspector account.
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  const shoot = async (hash, file, settle = 1500) => {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await page.screenshot({ path: `${OUT}/${file}` })
    console.log(`shot: ${file}`)
  }
  await shoot('#/tasks', 'w9-b6-06-tasks-375-light.png', 2000)
  await shoot('#/files', 'w9-b6-07-files-375-light.png', 2000)
  await shoot('#/agents', 'w9-b6-08-agents-375-light.png', 2000)
  await shoot('#/me', 'w9-b6-09-me-375-light.png', 1800)
  await shoot('#/todos', 'w9-b6-10-todos-375-light.png', 2200)
  await shoot('#/alerts', 'w9-b6-11-alerts-375-light.png', 2200)
  await shoot('#/docs', 'w9-b6-12-docs-375-light.png', 2200)

  // The form face: a real register turn driving the v3 draft card (best
  // effort — the ask card also proves the form tier).
  const formSession = process.env['W9B6_FORM_CHAT'] ?? await createSession('w9b6-form')
  await page.goto(`${BASE}#/chat/${formSession}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('问我任何经营问题...').fill('帮我登记一条采购单：供应商宏发食品，高筋面粉 500kg，单价 3.2')
  await page.getByRole('button', { name: '发送' }).click()
  const card = page.locator('[data-testid="draft-card-v3"], [data-testid="field-ask"], [data-testid="ask-choice"], [data-testid="receipt-card-v3"]').first()
  let formShown = true
  try { await card.waitFor({ timeout: 90_000 }) } catch { formShown = false }
  // The model may answer the register request with plain prose (no fenced
  // form) — the structured-form rendering is covered by the v3 spec; the
  // live shot then records whatever tier the real turn produced.
  check('表单面出现（v3 草稿/追问/回执卡）', formShown, formShown ? '' : '模型未走结构化表单路径（渲染由 v3-components spec 覆盖）')
  await sleep(1200)
  await page.screenshot({ path: `${OUT}/w9-b6-13-form-375-light.png` })
  await context.close()
}

// ── Dark spot-checks @375: the three Tab faces + login ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  for (const [hash, file, settle] of [
    ['#/home', 'w9-b6-01-home-375-dark.png', 1800],
    ['#/work', 'w9-b6-04-work-375-dark.png', 2400],
    ['#/me', 'w9-b6-09-me-375-dark.png', 1800],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await page.screenshot({ path: `${OUT}/${file}` })
    console.log(`shot: ${file}`)
  }
  await context.close()
}
{
  // Login both tracks (the logged-out face).
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((key) => {
      localStorage.clear()
      localStorage.setItem('dsh-mobile-theme', key)
    }, theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
    await sleep(900)
    await page.screenshot({ path: `${OUT}/w9-b6-14-login-375-${theme}.png` })
    console.log(`shot: w9-b6-14-login-375-${theme}.png`)
    await context.close()
  }
}

// ── One 390 leg (light) ──
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  for (const [hash, file, settle] of [
    ['#/todos', 'w9-b6-10-todos-390-light.png', 2200],
    ['#/agents', 'w9-b6-08-agents-390-light.png', 2000],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await page.screenshot({ path: `${OUT}/${file}` })
    console.log(`shot: ${file}`)
  }
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w9-b6-matrix.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}`)
