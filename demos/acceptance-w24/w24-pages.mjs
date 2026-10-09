// W24 audit2 walkthrough: every routed page at 375px, light + dark (buyer).
// Feeds demos/acceptance-w24/audit2.md with screenshots + a DOM probe.
// Usage: node demos/acceptance-w24/w24-pages.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'
mkdirSync(OUT, { recursive: true })

const ROUTES = [
  ['home', '#/'],
  ['chats', '#/chats'],
  ['agents', '#/agents'],
  ['work', '#/work'],
  ['me', '#/me'],
  ['tasks', '#/tasks'],
  ['files', '#/files'],
  ['docs', '#/docs'],
  ['alerts', '#/alerts'],
  ['todos', '#/todos'],
  ['kg', '#/kg'],
]

const PROBE = () => {
  const visText = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const headings = [...document.querySelectorAll('h1,h2,h3,[class*="title"]')].slice(0, 12).map((h) => ({ tag: h.tagName, text: visText(h) }))
  const cards = {}
  for (const el of document.querySelectorAll('[data-testid]')) cards[el.dataset.testid] = (cards[el.dataset.testid] ?? 0) + 1
  const body = document.scrollingElement ?? document.body
  const emptyish = [...document.querySelectorAll('main *')].filter((el) => el.children.length === 0 && /暂无|还没有|空|加载|失败|重试/.test(el.textContent ?? '')).slice(0, 8).map((el) => visText(el))
  // list-row alignment probe: rows in list-ish containers with >1 line of text
  const rowProbe = [...document.querySelectorAll('main button, main article, main li')]
    .filter((el) => el.getBoundingClientRect().height > 40 && (el.textContent ?? '').trim().length > 8)
    .slice(0, 10)
    .map((el) => {
      const r = el.getBoundingClientRect()
      return { text: visText(el).slice(0, 30), h: Math.round(r.h), y: Math.round(r.y) }
    })
  return {
    url: location.hash,
    headings,
    cards,
    emptyish,
    overflowX: body.scrollWidth > body.clientWidth + 1,
    rowProbe,
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const login = async () => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
  await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}
await login()
console.log('logged in as buyer')

const probes = { light: {}, dark: {} }
for (const [name, hash] of ROUTES) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/w24-pg-${name}-light.png`, fullPage: true })
  probes.light[name] = await page.evaluate(PROBE)
  await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'dark'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}/w24-pg-${name}-dark.png`, fullPage: true })
  probes.dark[name] = await page.evaluate(PROBE)
  await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'light'))
  console.log(`${name}: headings=${probes.light[name].headings.length} overflowX=${probes.light[name].overflowX}`)
}
writeFileSync(`${OUT}/w24-pages-probe.json`, JSON.stringify({ probes }, null, 2))
await browser.close()
console.log('DONE pages walkthrough')
