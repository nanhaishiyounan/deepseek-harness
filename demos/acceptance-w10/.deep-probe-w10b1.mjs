// W10-B1 deep probe: identify the buttons carrying the UA-default
// `outset` border on home, and the work-dark segment background origin —
// both surfaced by the DOM probe as likely root causes behind the user's
// "native element styles leak through" complaint.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
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
const out = {}

{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/home`, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  out.homeOutsetButtons = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      return r.width !== 0 && r.height !== 0
    }
    return [...document.querySelectorAll('button')]
      .filter(visible)
      .filter((b) => getComputedStyle(b).border.includes('outset'))
      .slice(0, 40)
      .map((b) => {
        const r = b.getBoundingClientRect()
        return {
          cls: String(b.className).slice(0, 80),
          aria: b.getAttribute('aria-label') ?? '',
          text: (b.textContent || '').trim().slice(0, 20),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          inNav: b.closest('nav') !== null,
          parentCls: String(b.parentElement?.className ?? '').slice(0, 60),
        }
      })
  })
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await sleep(2400)
  out.workDarkSegment = await page.evaluate(() => {
    const hits = []
    for (const el of document.querySelectorAll('body *')) {
      const t = (el.textContent || '').trim()
      if (/^(进行中|待确认|已完成)\s*\d+$/.test(t) && el.children.length === 0) {
        let node = el
        for (let i = 0; i < 4 && node; i++) {
          const s = getComputedStyle(node)
          hits.push({
            hop: i, tag: node.tagName.toLowerCase(), cls: String(node.className).slice(0, 70),
            bg: s.backgroundColor, color: s.color, radius: s.borderRadius,
          })
          node = node.parentElement
        }
        break
      }
    }
    return hits
  })
  await context.close()
}

await browser.close()
writeFileSync('demos/acceptance-w10/.w10-b1-deep-probe.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1).slice(0, 3000))
