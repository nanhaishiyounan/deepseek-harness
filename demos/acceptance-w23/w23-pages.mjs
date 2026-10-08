// W23-B0 audit pass 1: full-page walkthrough (buyer, 375px, light+dark).
// Visits every routed page, screenshots it in both themes, and collects a
// DOM probe (headings, button computed font sizes, card counts, empty-state
// text, horizontal overflow) into w23-pages-probe.json.
// Usage: node demos/acceptance-w23/w23-pages.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23'
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
  const buttons = [...document.querySelectorAll('button, .adm-button')].map((b) => {
    const cs = getComputedStyle(b)
    const r = b.getBoundingClientRect()
    return {
      text: visText(b),
      fontSize: cs.fontSize,
      height: Math.round(r.height),
      width: Math.round(r.width),
      fontWeight: cs.fontWeight,
      sizeAttr: b.className?.match?.(/adm-button-(\w+)/)?.[1] ?? null,
    }
  })
  const headings = [...document.querySelectorAll('h1,h2,h3,[class*="title"]')].slice(0, 12).map((h) => ({ tag: h.tagName, cls: String(h.className).slice(0, 40), text: visText(h) }))
  const cards = {}
  for (const el of document.querySelectorAll('[data-testid]')) cards[el.dataset.testid] = (cards[el.dataset.testid] ?? 0) + 1
  const body = document.scrollingElement ?? document.body
  const emptyish = [...document.querySelectorAll('main *')].filter((el) => el.children.length === 0 && /暂无|还没有|空|加载|失败|重试/.test(el.textContent ?? '')).slice(0, 8).map((el) => visText(el))
  return {
    url: location.hash,
    headings,
    buttons,
    cards,
    emptyish,
    overflowX: body.scrollWidth > body.clientWidth + 1,
    scrollH: body.scrollHeight,
    docH: document.documentElement.clientHeight,
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const login = async (user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}
await login('buyer', 'Buyer#2026')
console.log('logged in as buyer')

const probes = { light: {}, dark: {} }
for (const [name, hash] of ROUTES) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/w23-pg-${name}-light.png`, fullPage: true })
  probes.light[name] = await page.evaluate(PROBE)
  await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'dark'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}/w23-pg-${name}-dark.png`, fullPage: true })
  probes.dark[name] = await page.evaluate(PROBE)
  await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'light'))
  const b = probes.light[name].buttons
  console.log(`${name}: ${b.length} buttons, headings=${probes.light[name].headings.length}, overflowX=${probes.light[name].overflowX}`)
}

// me-page logout button + TaskFormModal live probe (user-named issue #1):
await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const logoutProbe = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, .adm-button')].filter((b) => /退出登录/.test(b.textContent ?? ''))
  return els.map((b) => { const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { text: (b.textContent ?? '').trim(), fontSize: cs.fontSize, height: Math.round(r.height), cls: String(b.className) } })
})
await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const modalButton = page.getByRole('button', { name: /新建|创建/ }).first()
let modalProbe = null
if (await modalButton.count() > 0) {
  await modalButton.click().catch(() => {})
  await page.waitForTimeout(1200)
  modalProbe = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, .adm-button')].filter((b) => /取消|创建任务|立即执行/.test(b.textContent ?? ''))
    return els.map((b) => { const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { text: (b.textContent ?? '').trim(), fontSize: cs.fontSize, height: Math.round(r.height), cls: String(b.className) } })
  })
  await page.screenshot({ path: `${OUT}/w23-taskformmodal-open.png`, fullPage: true })
}
writeFileSync(`${OUT}/w23-pages-probe.json`, JSON.stringify({ probes, logoutProbe, modalProbe }, null, 2))
console.log('logoutProbe', JSON.stringify(logoutProbe))
console.log('modalProbe', JSON.stringify(modalProbe))
await browser.close()
console.log('DONE pages probe')
