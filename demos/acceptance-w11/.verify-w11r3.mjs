// W11-R3 live verification: the R2 go-live sweep items against the rebuilt
// :3080 dist. The batch under test is pure front-end behavior (toast
// geometry, dialog copy, the logout key sweep), so the page identity is
// seeded straight into localStorage (the real nocobase.signIn upstream is
// not composed in this deployment) — no product seam is stubbed.
//   R3-1  the failed-batch toast aggregates AND lifts clear of the
//         attachment strip: antd-mobile anchors the bottom toast's center
//         at 80% of the viewport — the same band the strip's rail occupies —
//         so the toast main must clear the strip's top edge by >= 15px
//         (the lift rides the toast's mask class overriding the inline top).
//   R3-2  the logout confirm dialog discloses the sweep's local face
//         (本地草稿与待发消息将被清除) before the destructive tap.
//   R3-3  the logout leaves one session-keys.swept trace in the outbox
//         store's observation format (console.info JSON with type/count/keys).
// Usage (repo root): node demos/acceptance-w11/.verify-w11r3.mjs
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
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-r3-${file}.png` }).then(() => console.log(`shot: w11-r3-${file}.png`))

const SEED_SID = 'session-w11r3-lum-probe'

/** Seed a well-shaped identity then land inside the shell (no signIn round-trip). */
const enterShell = async (page) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((sid) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', 'light')
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({
      username: 'qc_inspector', nickname: '质检·王五', token: 'tok-w11r3-probe', loggedAt: Date.now(),
    }))
    localStorage.setItem(`dsh-mobile-draft-${sid}`, '草稿残留')
    localStorage.setItem('dsh-mobile-outbox', '{"version":2,"entries":[]}')
    localStorage.setItem(`dsh-mobile-attachments-${sid}`, '{"version":2,"savedAt":1,"rows":[]}')
  }, SEED_SID)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const browser = await chromium.launch()

// ── Leg 1 (R3-1): the failed-batch toast lifts clear of the strip ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.route('**/api/session.history', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value: { events: [] } } }) })
  })

  // The seeded token is not a real NocoBase session: the gateway would answer
  // nocobase-unauthorized, which the rpc layer reads as session expiry and
  // bounces back to the login gate. Answer with the not-composed refusal
  // instead — a plain business failure the views carry with their fallbacks.
  await page.route('**/api/nocobase.*', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'nocobase-not-composed', message: 'probe: nocobase domain not composed' } } }) })
  })
  await enterShell(page)
  // The aggregation path needs the two failures to settle in one render
  // pass. A wire-level stub answers each response as its own network event
  // (two renders, two toasts — the W11-R4 tightened and-assertion caught
  // the second toast reading as the batch), so the probe answers
  // data.describeImage inside the page: both picks of one change event
  // resolve in the same microtask pass. The /api wire is the deployment's
  // stubbed face either way; no product seam is stubbed.
  await page.evaluate(() => {
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
  await page.goto(`${BASE}#/chat/${SEED_SID}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  // One multiple-image pick carries both failures in a single change event —
  // the aggregation path the composer's batch toast exists for.
  await page.setInputFiles('input[type="file"][multiple]', [
    { name: 'broken-a.png', mimeType: 'image/png', buffer: Buffer.from('probe-png-a') },
    { name: 'broken-b.png', mimeType: 'image/png', buffer: Buffer.from('probe-png-b') },
  ])
  await page.waitForSelector('.adm-toast-main', { timeout: 15_000 })
  const geo = await page.evaluate(() => {
    const toast = document.querySelector('.adm-toast-main')
    const mask = toast?.closest('.adm-toast-mask')
    const rail = document.querySelector('[class*="attachRow"]')
    const toastRect = toast.getBoundingClientRect()
    const railRect = rail.getBoundingClientRect()
    return {
      text: toast.textContent,
      toastBottom: toastRect.bottom, toastHeight: toastRect.height,
      railTop: railRect.top, railBottom: railRect.bottom,
      maskClass: mask?.className ?? '',
      computedTop: getComputedStyle(toast).top, computedBottom: getComputedStyle(toast).bottom,
    }
  })
  const clearance = geo.railTop - geo.toastBottom
  // Both failed picks must appear in the one toast (W11-R4 tightened from
  // a one-of-two OR): the aggregation path is proven, not one member of it.
  check('R3-1a 失败 Toast 在场且点名全部失败附件（聚合）', (geo.text ?? '').includes('附件上传失败') && (geo.text ?? '').includes('broken-a.png') && (geo.text ?? '').includes('broken-b.png'), String(geo.text))
  check('R3-1b Toast 底缘清空附件条顶缘 ≥15px（lift 生效）', clearance >= 15, `clearance=${clearance.toFixed(1)}px toastBottom=${geo.toastBottom.toFixed(1)} railTop=${geo.railTop.toFixed(1)} h=${geo.toastHeight.toFixed(1)}`)
  check('R3-1c mask 带 lift 类且 bottom 重锚（computed）', geo.maskClass.includes('toastLift') && geo.computedBottom === '150px', `mask=${geo.maskClass} top=${geo.computedTop} bottom=${geo.computedBottom}`)
  await shot(page, 'toast-lift-clearance-375')
  await context.close()
}

// ── Leg 2 (R3-2 + R3-3): logout disclosure + the session-keys.swept trace ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.route('**/api/nocobase.*', async (route) => {
    const rpcId = JSON.parse(route.request().postData()).rpcId
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: false, error: { code: 'nocobase-not-composed', message: 'probe: nocobase domain not composed' } } }) })
  })
  const infos = []
  page.on('console', (msg) => { if (msg.type() === 'info') infos.push(msg.text()) })
  await enterShell(page)
  await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '退出登录' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.waitForSelector('.adm-dialog-content', { timeout: 10_000 })
  const disclosure = await page.evaluate(() => document.querySelector('.adm-dialog-content')?.textContent ?? '')
  check('R3-2 登出确认弹窗披露本地清除面（三族，W11-R4 文案）', disclosure.includes('本地草稿、待发消息与附件将被清除'), disclosure)
  await shot(page, 'logout-disclosure-375')
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.getByPlaceholder('业务账号（如 buyer）').waitFor({ timeout: 15_000 })
  const sweptTrace = infos.find(text => text.includes('session-keys.swept'))
  let countOk = false
  let detail = String(sweptTrace)
  if (sweptTrace !== undefined) {
    try {
      const parsed = JSON.parse(sweptTrace)
      countOk = parsed.count === 3 && Array.isArray(parsed.keys) && parsed.keys.length === 3
      detail = `count=${parsed.count} keys=${parsed.keys.join(',')}`
    } catch { countOk = false }
  }
  check('R3-3 登出留痕 session-keys.swept（type/count/keys 单行 JSON）', sweptTrace !== undefined && countOk, detail)
  const survivors = await page.evaluate(() => ({
    auth: localStorage.getItem('dsh-mobile-auth'),
    theme: localStorage.getItem('dsh-mobile-theme'),
  }))
  check('R3-4 登出后 auth 清除且 theme 保留', survivors.auth === null && survivors.theme === 'light', JSON.stringify(survivors))
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-r3-live-verify.log`, `${LOG.join('\n')}\n`)
console.log(`\nwrote: w11-r3-live-verify.log (${LOG.filter(line => line.startsWith('PASS')).length}/${LOG.length})`)
