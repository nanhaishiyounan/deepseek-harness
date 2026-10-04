// W7-M1/M2 acceptance shots: real login (nocobase.signIn) → per-route 375×667
// captures + computed-style probes over the live 3080 gateway. Evidence lands
// in demos/acceptance-w7/ as w7-m1-*/w7-m2-*; the probe log doubles as the
// DOM-assertion leg (brand density, Tab 12/600, elevation, no-x-overflow).
// Precedent: research/2026-10-03-w7-audit/.m-shot.mjs (login channel + probe
// pick helper). Usage (repo root): node demos/acceptance-w7/.shoot-w7m.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w7'
const ACCOUNT = process.env.M_ACCOUNT ?? 'qc_inspector'
const PASSWORD = process.env.M_PASSWORD ?? 'Qc#2026'

const log = (line) => console.log(line)
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 })

// -- w7-m2 login gate (logged out, the v7 muted-fill inputs) -------------------
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear() })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 30_000 })
await sleep(500)
await page.screenshot({ path: `${OUT}/w7-m2-15-login.png` })
log('shot w7-m2-15-login')

// -- real sign-in --------------------------------------------------------------
await page.getByPlaceholder('业务账号（如 buyer）').fill(ACCOUNT)
await page.getByPlaceholder('业务账号密码').fill(PASSWORD)
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(900)
log(`signed in: ${String(await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-auth') ?? '{}').username))}`)

const shoot = async (name, hash, marker, wait = 900) => {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  if (marker !== undefined) {
    await page.waitForSelector(marker, { timeout: 15_000 }).catch(() => { log(`  [warn] ${name}: marker miss ${marker}`) })
  }
  await sleep(wait)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  log(`shot ${name}`)
}

// -- M1: the four tab surfaces (light) -----------------------------------------
await shoot('w7-m1-01-home-light', '#/', '[aria-label="工作概览"]')
await shoot('w7-m1-02-agents-light', '#/agents', '[aria-label="AI 同事目录"]')
await shoot('w7-m1-03-work-light', '#/work', '[aria-label="工作列表"]')
await shoot('w7-m1-04-me-light', '#/me', 'text=深色模式')

// -- M1 dark-track spot check: home dark ---------------------------------------
await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=深色模式', { timeout: 15_000 })
await page.getByRole('switch', { name: '深色模式' }).click()
await sleep(400)
await shoot('w7-m1-05-home-dark', '#/', '[aria-label="工作概览"]')
await shoot('w7-m2-16-chats-dark', '#/chats', '[aria-label="会话列表"]')
await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=深色模式', { timeout: 15_000 })
await page.getByRole('switch', { name: '深色模式' }).click()
await sleep(300)

// -- M2: the full-screen layers ------------------------------------------------
await shoot('w7-m2-06-chats-light', '#/chats', '[aria-label="会话列表"]')
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="会话列表"] button', { timeout: 15_000 })
await page.locator('[aria-label="会话列表"] button').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
await sleep(1600)
await page.screenshot({ path: `${OUT}/w7-m2-07-chat-light.png` })
log('shot w7-m2-07-chat-light')
await shoot('w7-m2-09-todos-light', '#/todos', '[aria-label="按单据类型"]')
await shoot('w7-m2-10-docs-catalog', '#/docs', '[aria-label="单据目录"]')
await shoot('w7-m2-11-docs-list', '#/docs/qm_inspections', '[data-testid="docs-row"]', 600)
await shoot('w7-m2-12-alerts-light', '#/alerts', '[aria-label="按规则类型"]')
await shoot('w7-m2-13-tasks-light', '#/tasks', '[aria-label="任务列表"]')
await shoot('w7-m2-14-files-light', '#/files', '[aria-label="最近文件"]')
// work detail: from the work tab's first card (falls back to the empty face)
await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
await sleep(600)
const workCard = page.locator('[data-testid="work-card"]').first()
if (await workCard.count() > 0) {
  await workCard.locator('button').first().click()
  await page.waitForURL(/#\/work\//, { timeout: 15_000 })
  await sleep(900)
  await page.screenshot({ path: `${OUT}/w7-m2-08-work-detail.png` })
  log('shot w7-m2-08-work-detail')
} else {
  await page.screenshot({ path: `${OUT}/w7-m2-08-work-detail.png` })
  log('shot w7-m2-08-work-detail (empty tab)')
}

// -- M2 empty states (≥4 faces, the unified EmptyState component) --------------
// 1) chats filter/search empty (deterministic: a keyword nothing matches)
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="会话列表"]', { timeout: 15_000 })
await page.getByPlaceholder('搜索会话/同事').fill('不存在的会话关键词')
await sleep(500)
await page.screenshot({ path: `${OUT}/w7-m2-20-empty-chats-filter.png` })
log('shot w7-m2-20-empty-chats-filter')
// 2) tasks empty (any track: the unified face renders when the split is empty)
await page.goto(`${BASE}#/tasks`, { waitUntil: 'domcontentloaded' })
await sleep(700)
await page.screenshot({ path: `${OUT}/w7-m2-21-empty-tasks.png` })
log('shot w7-m2-21-empty-tasks')
// 3) files empty sections
await page.goto(`${BASE}#/files`, { waitUntil: 'domcontentloaded' })
await sleep(700)
await page.screenshot({ path: `${OUT}/w7-m2-22-empty-files.png` })
log('shot w7-m2-22-empty-files')
// 4) todos empty (server-dependent; still a valid face either way)
await page.goto(`${BASE}#/todos`, { waitUntil: 'domcontentloaded' })
await sleep(900)
await page.screenshot({ path: `${OUT}/w7-m2-23-empty-todos.png` })
log('shot w7-m2-23-empty-todos')

// -- M2 skeleton faces (≥3 loading faces, deterministic route-delay stubs) -----
const skeletonPass = async (name, hash, pattern, marker, settle = 500) => {
  // The polling reads re-hit the same route; only the first continue owns it.
  await page.route(pattern, async (route) => { await sleep(1400); await route.continue().catch(() => {}) })
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(marker, { timeout: 15_000 }).catch(() => { log(`  [warn] ${name}: marker miss ${marker}`) })
  await sleep(settle)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  await page.unroute(pattern)
  log(`shot ${name}`)
}
await skeletonPass('w7-m2-30-skel-chats', '#/chats', /session\.list/, '[aria-label="正在加载会话"]')
// Open the first session for real, then re-enter that chat hash under the
// history-delay stub (the hash must be the chat route, not the list).
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="会话列表"] button', { timeout: 15_000 })
await page.locator('[aria-label="会话列表"] button').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
const chatHref = await page.evaluate(() => location.hash)
await skeletonPass('w7-m2-31-skel-chat-thread', chatHref, /session\.history/, '[aria-label="正在加载会话"]', 300)
await skeletonPass('w7-m2-32-skel-todos', '#/todos', /todos|approval/i, '[aria-label="正在加载待办"]')

// -- DOM assertion probes (the hard-number leg) --------------------------------
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作概览"]', { timeout: 15_000 })
await sleep(800)
const probe = await page.evaluate(() => {
  const pick = (selector, props) => {
    const el = document.querySelector(selector)
    if (el === null) return null
    const cs = getComputedStyle(el)
    return Object.fromEntries(props.map((p) => [p, cs[p]]))
  }
  // Brand-instance density on home: every element whose resolved color or
  // background rides the brand axis (#1e4e8c / #2a5fa6 / primary-soft tint).
  const BRAND = new Set(['rgb(30, 78, 140)', 'rgb(42, 95, 166)', 'rgb(232, 240, 249)', 'rgba(30, 78, 140, 0.1)'])
  let brandHits = 0
  const brandFaces = []
  for (const el of document.querySelectorAll('.dshm-root *')) {
    const cs = getComputedStyle(el)
    const faces = [cs.color, cs.backgroundColor, cs.borderTopColor]
    if (faces.some((f) => BRAND.has(f))) {
      brandHits += 1
      if (brandFaces.length < 10) brandFaces.push(`${el.tagName}.${String(el.className).split(' ')[0]}:${faces[0]}/${faces[1]}`)
    }
  }
  const root = document.querySelector('.dshm-root')
  const card = document.querySelector('[class*="statsCard"]')
  const lum = (rgb) => {
    const m = /(\d+), (\d+), (\d+)/.exec(rgb)
    if (m === null) return null
    return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3
  }
  return {
    tabTitle: pick('.adm-tab-bar-item-title', ['font-size', 'font-weight']),
    heroCard: pick('[class*="heroCard"]', ['background-color', 'box-shadow']),
    heroDate: pick('[class*="heroDate"]', ['background-color', 'color', 'font-size']),
    statValue: pick('[class*="statValue"]', ['font-size', 'font-family', 'font-weight']),
    card: card === null ? null : { radius: getComputedStyle(card).borderRadius, shadow: getComputedStyle(card).boxShadow },
    brandHits,
    brandFaces,
    elevationGapPct: root !== null && card !== null
      ? Math.round((lum(getComputedStyle(card).backgroundColor) - lum(getComputedStyle(root).backgroundColor)) * 10) / 10
      : null,
    xOverflow: document.scrollingElement.scrollWidth - document.documentElement.clientWidth,
  }
})
log(`probe: ${JSON.stringify(probe, null, 2)}`)

await browser.close()
log('done')
