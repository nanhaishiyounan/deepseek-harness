// W8-R2 live evidence probe (375px): the two P1 fixes re-verified on the real
// :3080 build (frontend-only changes — the rebuilt lib/client + vite dist
// ride the long-lived gateway process, the B2 precedent).
//   Leg A (P1-1, keyboard tab bar): a REAL Tab-key walk from the document body
//   until the focus lands on a .adm-tab-bar-item (the old build never
//   reached it — 11 Tabs in the verifier's evidence), then Enter/Space
//   activation across all four tabs with hash assertions and the focus-ring
//   computed style. Shot w8-r2-01-tabbar-keyboard-375.png.
//   Leg B (P1-2, touch ladder): home's primary chip at 44px with the three
//   neutrals at 40px, and the alerts 认领 row action at ≥40px (fixture-fed
//   open row). Shots w8-r2-02-touch-fixed-375.png + w8-r2-02b-alerts-claim-375.png.
// Usage (repo root): node demos/acceptance-w8/.shoot-w8r2.mjs
// Needs: NocoBase :13000, gateway :3080 (long-lived user terminal).
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w8'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

const login = async (page) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', 'light')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(1200)
}

const browser = await chromium.launch()

// ── Leg A: P1-1 keyboard-operable tab bar ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)

  // The patched DOM facts: role=tab/tabIndex/aria-selected on each item and
  // tablist on the row.
  const tabFacts = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.adm-tab-bar-item'))
    return {
      roles: items.map((item) => item.getAttribute('role')),
      tabIndices: items.map((item) => item.tabIndex),
      selected: items.map((item) => item.getAttribute('aria-selected')),
      titles: items.map((item) => item.textContent?.trim()),
      tablist: document.querySelector('.adm-tab-bar-wrap')?.getAttribute('role'),
    }
  })
  check('tabbar roles', JSON.stringify(tabFacts.roles) === JSON.stringify(['tab', 'tab', 'tab', 'tab']), JSON.stringify(tabFacts.roles))
  check('tabbar tabIndex=0', tabFacts.tabIndices.every((t) => t === 0), JSON.stringify(tabFacts.tabIndices))
  check('tabbar aria-selected', JSON.stringify(tabFacts.selected) === JSON.stringify(['true', 'false', 'false', 'false']), JSON.stringify(tabFacts.selected))
  check('tabbar tablist', tabFacts.tablist === 'tablist', String(tabFacts.tablist))

  // The real Tab walk: from the body, press Tab until focus reaches a tab
  // item (cap 60; the old build's divs were never reachable).
  await page.evaluate(() => { document.body.focus() })
  let presses = 0
  let reached = false
  while (presses < 60 && !reached) {
    await page.keyboard.press('Tab')
    presses += 1
    reached = await page.evaluate(() =>
      document.activeElement?.classList.contains('adm-tab-bar-item') === true)
  }
  const firstTab = await page.evaluate(() => ({
    title: document.activeElement?.textContent?.trim(),
    ring: getComputedStyle(document.activeElement).boxShadow,
  }))
  check('Tab key order reaches the tab bar', reached, `after ${presses} presses, landed on ${JSON.stringify(firstTab.title)}`)
  check('first reached tab is 消息', firstTab.title === '消息', String(firstTab.title))
  check('focus ring visible on the tab item', firstTab.ring !== 'none' && firstTab.ring !== '', firstTab.ring)
  await page.screenshot({ path: `${OUT}/w8-r2-01-tabbar-keyboard-375.png` })

  // Enter/Space activation across the remaining tabs. A route change moves
  // focus onto the page body (W8 §9's reading-cursor rule), so each
  // activation refocuses the next tab item first — focusability itself is
  // already proven by the real Tab walk above.
  const focusTab = async (title) => {
    await page.evaluate((t) => {
      const item = Array.from(document.querySelectorAll('.adm-tab-bar-item')).find((el) => el.textContent?.trim() === t)
      item?.focus()
    }, title)
  }
  const hashAfter = async () => page.evaluate(() => location.hash)
  await focusTab('同事')
  await page.keyboard.press('Enter')
  await sleep(600)
  check('Enter activates 同事 → #/agents', await hashAfter() === '#/agents', await hashAfter())
  await focusTab('工作台')
  await page.keyboard.press(' ')
  await sleep(600)
  check('Space activates 工作台 → #/work', await hashAfter() === '#/work', await hashAfter())
  await focusTab('我的')
  await page.keyboard.press('Enter')
  await sleep(600)
  check('Enter activates 我的 → #/me', await hashAfter() === '#/me', await hashAfter())
  const selectedNow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.adm-tab-bar-item')).map((item) => item.getAttribute('aria-selected')))
  check('aria-selected follows the route', JSON.stringify(selectedNow) === JSON.stringify(['false', 'false', 'false', 'true']), JSON.stringify(selectedNow))
  await context.close()
}

// ── Leg B: P1-2 touch ladder (primary chip 44 / neutrals 40 / claim ≥40) ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)

  // Home quick chips: the primary 登记一条单据 at the 44px primary grade, the
  // three neutrals at the 40px secondary grade.
  const chipHeights = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('[class*="quickRow"] button'))
    return Object.fromEntries(buttons.map((button) => [button.textContent?.trim(), Number.parseFloat(getComputedStyle(button).height)]))
  })
  check('primary chip 登记一条单据 = 44px', chipHeights['登记一条单据'] === 44, JSON.stringify(chipHeights))
  const neutrals = ['我的预警', '我的待办', '看单据'].map((label) => chipHeights[label])
  check('neutral chips stay 40px', neutrals.every((h) => h === 40), JSON.stringify(neutrals))
  await page.screenshot({ path: `${OUT}/w8-r2-02-touch-fixed-375.png` })

  // The alerts row action: fixture-feed one open unclaimed row (unique title,
  // so it renders standalone with its 认领 button) and read the button's
  // computed height.
  const echoOk = (route, value) => {
    const rpcId = JSON.parse(route.request().postData() ?? '{}').rpcId ?? 'stub'
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ rpcId, result: { ok: true, value } }),
    })
  }
  const row = {
    id: 61,
    rule_type: 'ccp_deviation',
    severity: 'critical',
    title: 'R2 触控复验·杀菌温度偏离',
    entity_code: 'BATCH-R2-01',
    status: 'open',
    owner: null,
    notify_users: ['qc_inspector'],
    detail: {},
    created_at: new Date(Date.now() - 300_000).toISOString(),
  }
  await page.route('**/api/nocobase.list', (route) => {
    const payload = JSON.parse(route.request().postData() ?? '{}')?.payload ?? {}
    if (payload.collection === 'wfl_alerts') {
      return echoOk(route, { count: 1, page: 1, page_size: 200, rows: [row] })
    }
    return echoOk(route, { count: 0, page: 1, page_size: 1, rows: [] })
  })
  await page.goto(`${BASE}#/alerts`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('alert-row').waitFor({ timeout: 15_000 })
  await sleep(400)
  const claimHeight = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="alert-row"] button[aria-label^="认领预警"]')
    return button === null ? null : Number.parseFloat(getComputedStyle(button).height)
  })
  check('alerts 认领 button ≥40px', claimHeight !== null && claimHeight >= 40, `${claimHeight}px`)
  await page.screenshot({ path: `${OUT}/w8-r2-02b-alerts-claim-375.png` })
  await context.close()
}

await browser.close()
console.log(`\n${LOG.filter((line) => line.startsWith('PASS')).length}/${LOG.length} checks passed`)
if (LOG.some((line) => line.startsWith('FAIL'))) process.exit(1)
