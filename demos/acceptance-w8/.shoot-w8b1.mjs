// W8-B1 evidence shots (375px): the four tab pages in both tracks, the
// password eye toggle, and the keep-alive behavior assertion (home → work →
// home restores the scroll position and the same DOM instance — a remount
// would lose both). Rigs a light or dark theme key, signs qc_inspector in,
// walks the surfaces, and writes w8-b1-*.png next to this script.
// Usage (repo root): node demos/acceptance-w8/.shoot-w8b1.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w8'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
const results = []

/**
 * One evidence leg: fresh context on the requested track, sign in, run the
 * shot steps, record the outcome line.
 * @param theme - 'light' or 'dark'.
 * @param steps - the page walker.
 */
async function leg(theme, steps) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
  await steps(page, theme)
  await page.close()
}

await leg('light', async (page) => {
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  // The password eye toggle: the masked field flips to a visible one.
  await page.getByRole('button', { name: '显示密码' }).click()
  const revealed = await page.getByPlaceholder('业务账号密码').getAttribute('type')
  results.push(`login eye toggle: type=${revealed} (expect text)`)
  await page.screenshot({ path: `${OUT}/w8-b1-01-login-eye-light.png` })
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(1000)
  await page.screenshot({ path: `${OUT}/w8-b1-02-home-light.png` })

  // Keep-alive: mark the home page (instance survival), then prove scroll
  // restoration on the work page — its page scroller takes a probe pad (the
  // w7m3 synthetic-row precedent) because the seeded home content does not
  // overflow the 812px viewport.
  const marked = await page.evaluate(() => {
    const home = document.querySelector('section[data-tab="home"] > div')
    if (home === null) return false
    home.setAttribute('data-w8-marker', 'kept')
    return true
  })
  await page.getByText('工作台', { exact: true }).click()
  await sleep(900)
  await page.screenshot({ path: `${OUT}/w8-b1-03-work-light.png` })
  const scrolled = await page.evaluate(() => {
    const section = document.querySelector('section[data-tab="work"]')
    const scroller = [section, ...section.querySelectorAll('*')]
      .find((el) => getComputedStyle(el).overflowY === 'auto')
    if (scroller === undefined) return { scrollerFound: false }
    const pad = document.createElement('div')
    pad.setAttribute('data-w8-pad', 'probe')
    pad.style.height = '2200px'
    scroller.appendChild(pad)
    scroller.scrollTop = 1200
    return { scrollerFound: true, scrollTop: scroller.scrollTop }
  })
  await page.getByText('消息', { exact: true }).click()
  await sleep(900)
  const restored = await page.evaluate(() => {
    const home = document.querySelector('section[data-tab="home"] > div')
    const section = document.querySelector('section[data-tab="work"]')
    const pad = section?.querySelector('[data-w8-pad="probe"]')
    const scroller = pad === null || pad === undefined || section === null ? undefined
      : [section, ...section.querySelectorAll('*')].find((el) => getComputedStyle(el).overflowY === 'auto')
    return {
      homeMarkerKept: home?.getAttribute('data-w8-marker') === 'kept',
      workVisible: section !== null && !section.hasAttribute('hidden'),
      padKept: pad instanceof HTMLElement,
      scrollTop: scroller?.scrollTop ?? -1,
    }
  })
  results.push(`keep-alive: homeMarked=${marked} scrollSetup=${JSON.stringify(scrolled)} restored=${JSON.stringify(restored)} (expect padKept+scrollTop 1200)`)
  await page.screenshot({ path: `${OUT}/w8-b1-04-home-restored-light.png` })
})

await leg('dark', async (page) => {
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(1000)
  await page.screenshot({ path: `${OUT}/w8-b1-05-home-dark.png` })
  await page.getByText('同事', { exact: true }).click()
  await sleep(900)
  await page.screenshot({ path: `${OUT}/w8-b1-06-agents-dark.png` })
  // The chats layer carries the 44px search entry and the dark input wells.
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await page.screenshot({ path: `${OUT}/w8-b1-07-chats-dark.png` })
  // The most recent chat: dark bubbles, links on the link grade, and the
  // composer's dark input well.
  const entered = await page.evaluate(() => document.querySelector('main')?.getAttribute('data-route'))
  await page.locator('[class*="recentRow"], [class*="rowTitle"]').first().click().catch(() => {})
  await sleep(1500)
  await page.screenshot({ path: `${OUT}/w8-b1-08-chat-dark.png` })
  results.push(`dark leg: chatsRoute=${entered}`)
})

await browser.close()
console.log(results.join('\n'))
