// Debug: why the W-round fence choice card is missing from the replay snapshot.
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
await page.goto('http://127.0.0.1:3080/mobile.html#/chat/session-8bbc5505-aa6f-44c2-b016-df8cc6f740b0', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
await new Promise((r) => setTimeout(r, 3000))
let snap = await page.locator('main').ariaSnapshot()
console.log('initial LEN', snap.length, 'has-哪家采购:', snap.includes('这次向哪家采购面粉？'), 'has-山东鲁丰:', snap.includes('山东鲁丰'), 'has-dsh:', snap.includes('```dsh'), 'ask-choice:', await page.locator('[data-testid="ask-choice"]').count())
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel(0, -700)
  await new Promise((r) => setTimeout(r, 250))
}
await new Promise((r) => setTimeout(r, 1500))
snap = await page.locator('main').ariaSnapshot()
console.log('after-scroll LEN', snap.length, 'has-哪家采购:', snap.includes('这次向哪家采购面粉？'), 'has-山东鲁丰:', snap.includes('山东鲁丰'), 'ask-choice:', await page.locator('[data-testid="ask-choice"]').count())
console.log('--- full snapshot ---')
console.log(snap)
await browser.close()
