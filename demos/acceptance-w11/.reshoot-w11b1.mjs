// W11-B1 T4 re-shot: the three fix faces (chats dark filterTabs rim, work
// status-tabs fade, work-detail title ellipsis) on the rebuilt dist, plus the
// DOM asserts for each fix.
// Usage (repo root): node demos/acceptance-w11/.reshoot-w11b1.mjs
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
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-b1-fix-${file}.png` }).then(() => console.log(`shot: w11-b1-fix-${file}.png`))

const login = async (page, theme, account = 'qc_inspector', password = 'Qc#2026') => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const browser = await chromium.launch()

// F1: chats filterTabs idle rim (dark primary, light spot).
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  const rim = await page.evaluate(() => {
    const idle = document.querySelector('.adm-capsule-tabs-tab:not(.adm-capsule-tabs-tab-active)')
    if (!idle) return { error: 'no idle tab' }
    const c = getComputedStyle(idle)
    return { border: c.border }
  })
  check('F1 chats 暗轨 idle 分段焙线在位', (rim.border ?? '').includes('rgb(69, 55, 40)'), JSON.stringify(rim))
  await shot(page, 'chats-375-dark')
  await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1500)
  await shot(page, 'chats-375-light')
  await context.close()
}

// F2/F3: work status-tabs tail + work-detail title ellipsis (buyer account).
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light', 'buyer', 'Buyer#2026')
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await sleep(2600)
  const tail = await page.evaluate(() => {
    const list = document.querySelector('.adm-capsule-tabs-tab-list')
    const tabs = [...list.querySelectorAll('.adm-capsule-tabs-tab')]
    const last = tabs.at(-1)
    if (!last || !list) return { error: 'no tabs' }
    const lb = list.getBoundingClientRect()
    const tb = last.getBoundingClientRect()
    const maskImage = getComputedStyle(list).maskImage ?? getComputedStyle(list).webkitMaskImage ?? ''
    return {
      paddingRight: getComputedStyle(list).paddingRight,
      lastRightInList: +(lb.right - tb.right).toFixed(1),
      lastOpacityFull: lb.right - tb.right >= 18,
    }
  })
  check('F2 work 末胶囊脱离渐隐区（≥18px 尾距）', tail.lastRightInList >= 18, JSON.stringify(tail))
  await shot(page, 'work-375-light')
  const row = page.locator('[aria-label="工作列表"] button[aria-label^="打开"]').first()
  if (await row.count() > 0) {
    await row.click()
    await sleep(2400)
  }
  const title = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    if (!h1) return { error: 'no h1' }
    const c = getComputedStyle(h1)
    return { overflow: c.overflow, textOverflow: c.textOverflow, whiteSpace: c.whiteSpace, scrollW: h1.scrollWidth, clientW: h1.clientWidth }
  })
  check('F3 work-detail 标题省略三件套在位', title.overflow === 'hidden' && title.textOverflow === 'ellipsis' && title.whiteSpace === 'nowrap', JSON.stringify(title))
  await shot(page, 'work-detail-375-light')
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-b1-fix-reshoot.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
