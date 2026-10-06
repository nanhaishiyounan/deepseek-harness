// W11-R4 live verification: the R3-terminal PASS_WITH_DEBT advisory items
// against the rebuilt :3080 dist. All items are pure front-end behavior; the
// page identity is seeded straight into localStorage (no product seam
// stubbed) and the seeded token's nocobase bounce is isolated with the
// not-composed refusal, exactly as in .verify-w11r3.mjs.
//   R4-1  the toast lift adapts to landscape: the 150px portrait anchor
//         left only +11/-10px on an 844×390 viewport, so the landscape
//         media query rides 175px — clearance >=15px must hold there too.
//   R4-2  the transient send-failure toast (ErrorToast) rides the same
//         lift anchor as the batch-failure toast (mask lift class,
//         computed bottom 150px, clearance >=15px over the strip).
//   R4-3  the logout dialog discloses all three swept families (drafts,
//         parked outbox messages, attachments) and the me-tab data row
//         carries the same three-family copy — one page, one statement.
// Usage (repo root): node demos/acceptance-w11/.verify-w11r4.mjs
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
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-r4-${file}.png` }).then(() => console.log(`shot: w11-r4-${file}.png`))

const SEED_SID = 'session-w11r4-lum-probe'

/** Seed a well-shaped identity then land inside the shell (no signIn round-trip). */
const enterShell = async (page) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((sid) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', 'light')
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({
      username: 'qc_inspector', nickname: '质检·王五', token: 'tok-w11r4-probe', loggedAt: Date.now(),
    }))
    localStorage.setItem(`dsh-mobile-draft-${sid}`, '草稿残留')
    localStorage.setItem('dsh-mobile-outbox', '{"version":2,"entries":[]}')
    localStorage.setItem(`dsh-mobile-attachments-${sid}`, '{"version":2,"savedAt":1,"rows":[]}')
  }, SEED_SID)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

/** The toast/strip geometry the clearance assertions read. */
const toastGeometry = (page) => page.evaluate(() => {
  const toast = document.querySelector('.adm-toast-main')
  const mask = toast?.closest('.adm-toast-mask')
  const rail = document.querySelector('[class*="attachRow"]')
  if (toast === null || rail === null) return null
  const toastRect = toast.getBoundingClientRect()
  const railRect = rail.getBoundingClientRect()
  return {
    text: toast.textContent,
    toastBottom: toastRect.bottom, railTop: railRect.top,
    maskClass: mask?.className ?? '',
    computedTop: getComputedStyle(toast).top, computedBottom: getComputedStyle(toast).bottom,
  }
})

/** The shared probe routes: the not-composed nocobase refusal (+ history). */
const stubRoutes = (page) => {
  page.route('**/api/session.history', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value: { events: [] } } }) })
  })
  page.route('**/api/nocobase.*', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'nocobase-not-composed', message: 'probe: nocobase domain not composed' } } }) })
  })
}

/** The failing describe lane, answered inside the page (R4-1): the
 *  aggregation path needs the two failures of one multiple pick to settle
 *  in a single render pass — a wire-level stub answers each response as
 *  its own network event (two renders, two toasts). The /api wire is the
 *  deployment's stubbed face either way; no product seam is stubbed. */
const installDescribeMock = (page) => page.evaluate(() => {
  const orig = window.fetch
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('data.describeImage')) {
      const rpcId = (JSON.parse(String(init?.body ?? '{}'))).rpcId
      return new Response(JSON.stringify({ rpcId, result: { ok: false, error: { code: 'data-describe-failed', message: '图片识别失败（探针）' } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return orig(input, init)
  }
})

const browser = await chromium.launch()

// ── Leg 1 (R4-1): the lift keeps the clearance in landscape (844×390) ──
{
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  stubRoutes(page)
  await enterShell(page)
  await installDescribeMock(page)
  await page.goto(`${BASE}#/chat/${SEED_SID}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await page.setInputFiles('input[type="file"][multiple]', [
    { name: 'broken-a.png', mimeType: 'image/png', buffer: Buffer.from('probe-png-a') },
    { name: 'broken-b.png', mimeType: 'image/png', buffer: Buffer.from('probe-png-b') },
  ])
  await page.waitForSelector('.adm-toast-main', { timeout: 15_000 })
  const geo = await toastGeometry(page)
  const clearance = geo.railTop - geo.toastBottom
  check('R4-1a 横屏 Toast 在场且点名全部失败附件（聚合）', (geo.text ?? '').includes('2项附件上传失败') && (geo.text ?? '').includes('broken-a.png') && (geo.text ?? '').includes('broken-b.png'), String(geo.text))
  check('R4-1b 横屏 Toast 底缘清空附件条顶缘 ≥15px', clearance >= 15, `clearance=${clearance.toFixed(1)}px toastBottom=${geo.toastBottom.toFixed(1)} railTop=${geo.railTop.toFixed(1)}`)
  check('R4-1c 横屏 mask 带 lift 类且 bottom=175px（媒体查询锚）', geo.maskClass.includes('toastLift') && geo.computedBottom === '175px', `mask=${geo.maskClass} top=${geo.computedTop} bottom=${geo.computedBottom}`)
  await shot(page, '01-landscape-toast-clearance-844')
  await context.close()
}

// ── Leg 2 (R4-2): the transient send-failure toast rides the same lift ──
{
  // A send's terminal states all run finalizeSend → lane.clear (W11-R1), so
  // the strip is gone by the time the refused-send toast shows; the anchor —
  // the lift class and the computed bottom — is the shared face under test.
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  stubRoutes(page)
  await page.route('**/api/session.prompt', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'probe-send-refused', message: '会话暂不可用（探针拒绝）' } } }) })
  })
  await enterShell(page)
  await page.goto(`${BASE}#/chat/${SEED_SID}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('问我任何经营问题...').fill('探针发送')
  await page.getByRole('button', { name: '发送' }).click()
  await page.waitForFunction(() => (document.querySelector('.adm-toast-main')?.textContent ?? '').includes('会话暂不可用'), { timeout: 15_000 })
  const geo = await page.evaluate(() => {
    const toast = document.querySelector('.adm-toast-main')
    const mask = toast?.closest('.adm-toast-mask')
    const rect = toast.getBoundingClientRect()
    return {
      text: toast.textContent,
      toastBottom: rect.bottom, viewportH: window.innerHeight,
      maskClass: mask?.className ?? '',
      computedTop: getComputedStyle(toast).top, computedBottom: getComputedStyle(toast).bottom,
    }
  })
  const offFloor = geo.viewportH - geo.toastBottom
  check('R4-2a 发送失败 Toast 文案在场（refused 路径）', (geo.text ?? '').includes('会话暂不可用（探针拒绝）'), String(geo.text))
  check('R4-2b 发送失败 Toast 与批失败同锚（lift 类 + computed bottom=150px）', geo.maskClass.includes('toastLift') && geo.computedBottom === '150px', `mask=${geo.maskClass} top=${geo.computedTop} bottom=${geo.computedBottom}`)
  check('R4-2c 底缘离视口底 150px（rect 实测）', Math.abs(offFloor - 150) <= 1, `offFloor=${offFloor.toFixed(1)}px viewportH=${geo.viewportH}`)
  await shot(page, '02-sendfail-toast-anchored-375')
  await context.close()
}

// ── Leg 3 (R4-3): the disclosure names all three families; the data row agrees ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  stubRoutes(page)
  await enterShell(page)
  await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '退出登录' }).waitFor({ timeout: 15_000 })
  const dataRow = await page.evaluate(() => document.body.textContent ?? '')
  check('R4-3a 数据行与披露同口径（三族 + 登出即清）', dataRow.includes('草稿、待发消息与附件为登出即清的暂存'), 'me 页数据行')
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.waitForSelector('.adm-dialog-content', { timeout: 10_000 })
  const disclosure = await page.evaluate(() => document.querySelector('.adm-dialog-content')?.textContent ?? '')
  check('R4-3b 登出弹窗披露点名三族（草稿/待发/附件）', disclosure.includes('本地草稿、待发消息与附件将被清除'), disclosure)
  await shot(page, '03-logout-disclosure-three-families-375')
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-r4-live-verify.log`, `${LOG.join('\n')}\n`)
console.log(`\nwrote: w11-r4-live-verify.log (${LOG.filter(line => line.startsWith('PASS')).length}/${LOG.length})`)
