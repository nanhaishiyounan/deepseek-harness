import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const token = (await (await fetch(API + '/api/auth:signIn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })).json())?.data?.token
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
await page.goto('http://127.0.0.1:3080/nocobase/admin/w5mfgntyu7wy20a', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('.ant-table-row', { timeout: 60000 })
await page.waitForTimeout(800)
const t1 = Date.now()
await page.locator('.ant-table-row').first().locator('button:has-text("查看")').first().click()
await page.waitForSelector('.ant-drawer-content', { timeout: 15000 })
await page.waitForFunction(() => (document.querySelector('.ant-drawer-content')?.innerText ?? '').length > 50, { timeout: 15000 })
const fields = await page.locator('.ant-drawer-content .ant-descriptions-item, .ant-drawer-content [class*="details-item"]').count()
console.log(`DRAWER-ONLY: ${Date.now() - t1}ms until non-empty drawer (${fields} field nodes) on the 13-field MO page`)
await browser.close()
