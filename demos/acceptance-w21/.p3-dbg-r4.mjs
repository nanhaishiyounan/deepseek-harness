// R4 re-verify (no new message): the continued 07dac775 now holds a legacy
// fence report card AND a (tool-source) present_card ask card — assert both
// sources render on one screen.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto('http://127.0.0.1:3080/mobile.html#/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await page.goto('http://127.0.0.1:3080/mobile.html#/chat/session-07dac775-6ea9-4e5f-bf6b-09b8cb11e49f', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
await new Promise((r) => setTimeout(r, 3000))
const snap = await page.locator('main').ariaSnapshot()
const fenceCard = snap.includes('库存查询')
const toolCard = snap.includes('test') && (await page.locator('[data-testid="ask-choice"]').count()) >= 1
const askCount = await page.locator('[data-testid="ask-choice"]').count()
console.log('fence-card(库存查询):', fenceCard, '| tool ask-card(test):', toolCard, '| ask-choice count:', askCount, '| dsh-leak:', snap.includes('```dsh'))
await page.screenshot({ path: 'demos/acceptance-w21/p3-replay-r4-mixed.png' })
console.log(snap.slice(-1400))
await browser.close()
process.exit(fenceCard && toolCard ? 0 : 1)
