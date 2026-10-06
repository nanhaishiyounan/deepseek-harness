// W11-R6 live verification: the R5 sources' deployment closure against the
// rebuilt :3080 dist (build:lib:client → vite build; the R5 batch shipped the
// sources but never rebuilt the lib, so the live face kept serving the pre-R5
// bundle). Identity is seeded straight into localStorage — no product seam
// is stubbed; the seeded token's nocobase bounce stays isolated behind the
// not-composed refusal, exactly as in .verify-w11r3/r4.mjs.
//   R6-A  the snapshot key sweep clears all three session families on
//         logout, keeps the theme byte-identical, and leaves one
//         session-keys.swept trace (count/keys) in the console.
//   R6-B  the chat input face's batch-failure toast (the hoistToast fold)
//         rides the one lift anchor on the 375 portrait: the lift class,
//         computed bottom 150px, and >=15px clearance over the strip.
//   R6-C  a 100-key sweep re-check on real Chromium Storage (not jsdom):
//         60 session keys across the three prefixes all die (zero misses),
//         40 unrelated keys survive byte-identical. Log: w11-r6-sweep-100keys.log
// Usage (repo root): node demos/acceptance-w11/.verify-w11r6.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = []
const KLOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (log, name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  log.push(line)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-r6-${file}.png` }).then(() => console.log(`shot: w11-r6-${file}.png`))

const SEED_SID = 'session-w11r6-lum-probe'

/** Seed a well-shaped identity then land inside the shell (no signIn round-trip). */
const enterShell = async (page) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((sid) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', 'light')
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({
      username: 'qc_inspector', nickname: '质检·王五', token: 'tok-w11r6-probe', loggedAt: Date.now(),
    }))
    localStorage.setItem(`dsh-mobile-draft-${sid}`, '草稿残留')
    localStorage.setItem('dsh-mobile-outbox', '{"version":2,"entries":[]}')
    localStorage.setItem(`dsh-mobile-attachments-${sid}`, '{"version":2,"savedAt":1,"rows":[]}')
  }, SEED_SID)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

/** The not-composed nocobase refusal (+ history) the probes ride. */
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

/** Capture session-keys.swept traces (one per logout) from the console bus. */
const tapSwept = (page) => {
  const traces = []
  page.on('console', (msg) => {
    if (msg.type() !== 'info') return
    try {
      const parsed = JSON.parse(msg.text())
      if (parsed?.type === 'session-keys.swept') traces.push(parsed)
    } catch { /* non-JSON console output is not ours */ }
  })
  return traces
}

/** Walk to #/me, confirm the logout dialog, wait for the auth key to die. */
const logout = async (page) => {
  await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '退出登录' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.waitForSelector('.adm-dialog-content', { timeout: 10_000 })
  // A forced click fires the pointer events but never reaches the dialog
  // button's React handler on this build — the unforced R3 form, after the
  // entrance animation settles, does.
  await sleep(800)
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.waitForFunction(() => localStorage.getItem('dsh-mobile-auth') === null, { timeout: 15_000 })
}

const browser = await chromium.launch()

// ── Leg A (R6-A): the snapshot sweep clears the three families, keeps theme ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  stubRoutes(page)
  const traces = tapSwept(page)
  await enterShell(page)
  await logout(page)
  await sleep(300)
  const after = await page.evaluate(() => {
    const keys = Object.keys(localStorage)
    return {
      sessionLeft: keys.filter((k) => k.startsWith('dsh-mobile-draft') || k.startsWith('dsh-mobile-outbox') || k.startsWith('dsh-mobile-attachments')),
      theme: localStorage.getItem('dsh-mobile-theme'),
      auth: localStorage.getItem('dsh-mobile-auth'),
    }
  })
  const swept = traces.at(-1)
  check(LOG, 'R6-A1 三族会话键登出全清（draft/outbox/attachments 0 残留）', after.sessionLeft.length === 0, `left=${JSON.stringify(after.sessionLeft)}`)
  check(LOG, 'R6-A2 theme 存活 + auth 清除（按设计保留/清除面）', after.theme === 'light' && after.auth === null, `theme=${after.theme} auth=${after.auth}`)
  check(LOG, 'R6-A3 session-keys.swept 留痕 count=3 且 keys 含三族', swept !== undefined && swept.count === 3
    && swept.keys.includes(`dsh-mobile-draft-${SEED_SID}`)
    && swept.keys.includes('dsh-mobile-outbox')
    && swept.keys.includes(`dsh-mobile-attachments-${SEED_SID}`),
  `count=${swept?.count} keys=${JSON.stringify(swept?.keys)}`)
  await shot(page, 'sweep-live-375')
  await context.close()
}

// ── Leg B (R6-B): the hoistToast fold rides the one lift anchor (375) ──
{
  // The aggregation path needs the two failures of one multiple pick to
  // settle in a single render pass — the same in-page describe mock as the
  // R4 probe (a wire-level stub answers each response as its own network
  // event, two renders, two toasts). The /api wire is the deployment's
  // stubbed face either way; no product seam is stubbed.
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  stubRoutes(page)
  await enterShell(page)
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
  await page.setInputFiles('input[type="file"][multiple]', [
    { name: 'broken-a.png', mimeType: 'image/png', buffer: Buffer.from('probe-png-a') },
    { name: 'broken-b.png', mimeType: 'image/png', buffer: Buffer.from('probe-png-b') },
  ])
  await page.waitForSelector('.adm-toast-main', { timeout: 15_000 })
  const geo = await page.evaluate(() => {
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
  const clearance = geo.railTop - geo.toastBottom
  check(LOG, 'R6-B1 聚合 Toast 在场点名全部失败附件（hoistToast 收编的批失败路径）', (geo.text ?? '').includes('2项附件上传失败') && (geo.text ?? '').includes('broken-a.png') && (geo.text ?? '').includes('broken-b.png'), String(geo.text))
  check(LOG, 'R6-B2 mask 带 lift 类且 computed bottom=150px（hoistToast 单源锚）', geo.maskClass.includes('toastLift') && geo.computedBottom === '150px', `mask=${geo.maskClass} top=${geo.computedTop} bottom=${geo.computedBottom}`)
  check(LOG, 'R6-B3 Toast 底缘清空附件条顶缘 ≥15px', clearance >= 15, `clearance=${clearance.toFixed(1)}px toastBottom=${geo.toastBottom.toFixed(1)} railTop=${geo.railTop.toFixed(1)}`)
  await shot(page, 'toast-anchor-live-375')
  await context.close()
}

// ── Leg C (R6-C): the 100-key sweep on real Chromium Storage ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  stubRoutes(page)
  const traces = tapSwept(page)
  await enterShell(page)
  // Plant exactly 100 keys and return the planted census itself (not a
  // localStorage-derived one: the shell's own runtime keys — auth, the work
  // projection, its outbox — also live there and belong to no planted list).
  // The enterShell seed's three session keys go first so the swept trace
  // counts only the planted 60; auth's death is clearIdentity's own act,
  // asserted in Leg A.
  const planted = await page.evaluate((sid) => {
    localStorage.removeItem(`dsh-mobile-draft-${sid}`)
    localStorage.removeItem('dsh-mobile-outbox')
    localStorage.removeItem(`dsh-mobile-attachments-${sid}`)
    // 60 doomed keys across the three prefixes (20 each)…
    const doomed = []
    for (let i = 0; i < 20; i++) { const k = `dsh-mobile-draft-r6c-${i}`; localStorage.setItem(k, `草稿${i}`); doomed.push(k) }
    for (let i = 0; i < 20; i++) { const k = `dsh-mobile-attachments-r6c-${i}`; localStorage.setItem(k, `{"v":${i}}`); doomed.push(k) }
    for (let i = 0; i < 20; i++) { const k = `dsh-mobile-outbox-r6c-${i}`; localStorage.setItem(k, `outbox-${i}`); doomed.push(k) }
    // …and 40 unrelated keys the sweep must never touch.
    const keep = {}
    const plant = (k, v) => { localStorage.setItem(k, v); keep[k] = v }
    plant('dsh-mobile-theme', 'dark')
    for (let i = 0; i < 19; i++) plant(`dsh-mobile-read-r6c-${i}`, `r${i}`)
    for (let i = 0; i < 19; i++) plant(`dsh-mobile-pin-r6c-${i}`, `p${i}`)
    plant('unrelated-r6c', 'keep')
    return { doomed, keep }
  }, SEED_SID)
  const plantedDoomed = planted.doomed
  const plantedKeep = Object.keys(planted.keep)
  check(KLOG, `R6-C1 种键布局：${plantedDoomed.length} 会话键（三族前缀各 20）+ ${plantedKeep.length} 无关键（精确种入清单）`, plantedDoomed.length === 60 && plantedKeep.length === 40, `doomed=${plantedDoomed.length} keep=${plantedKeep.length}`)
  await logout(page)
  await sleep(300)
  const after = await page.evaluate(() => {
    const snapshot = {}
    for (const k of Object.keys(localStorage)) snapshot[k] = localStorage.getItem(k)
    return snapshot
  })
  const missed = plantedDoomed.filter((k) => k in after)
  check(KLOG, 'R6-C2 0 漏删：60 个会话键全部清除（真实 Chromium Storage）', missed.length === 0, `missed=${JSON.stringify(missed)}`)
  const byteIdentical = plantedKeep.filter((k) => after[k] === planted.keep[k])
  check(KLOG, `R6-C3 ${plantedKeep.length} 个无关键 byte-identical 存活`, plantedKeep.length === 40 && byteIdentical.length === 40, `identical=${byteIdentical.length}/${plantedKeep.length}`)
  const swept = traces.at(-1)
  // The outbox store persists its (empty) queue back during the walk to
  // logout, so the trace may legitimately carry one extra key — the
  // zero-miss contract is that every planted session key is in the swept
  // list, not that the list has an exact length.
  const unlisted = plantedDoomed.filter((k) => !(swept?.keys ?? []).includes(k))
  check(KLOG, `R6-C4 swept 留痕点名全部 60 个种入会话键（count=${swept?.count}，≥60 即合法——outbox store 运行期回写）`, swept !== undefined && swept.count >= 60 && unlisted.length === 0, `count=${swept?.count} unlisted=${JSON.stringify(unlisted)}`)
  check(LOG, 'R6-C 100 键 sweep 复测全清（真实 Chromium Storage，0 漏删；明细 w11-r6-sweep-100keys.log）', KLOG.every((line) => line.startsWith('PASS')), `${KLOG.filter((l) => l.startsWith('PASS')).length}/${KLOG.length}`)
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-r6-live-verify.log`, `${LOG.join('\n')}\n`)
writeFileSync(`${OUT}/w11-r6-sweep-100keys.log`, `${KLOG.join('\n')}\n`)
console.log(`\nwrote: w11-r6-live-verify.log (${LOG.filter(line => line.startsWith('PASS')).length}/${LOG.length})`)
console.log(`wrote: w11-r6-sweep-100keys.log (${KLOG.filter(line => line.startsWith('PASS')).length}/${KLOG.length})`)
