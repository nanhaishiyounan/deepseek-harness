// W4-B3 empty-state leg rerun: 请假审批 FilterForm 选「已驳回」+ 点提交 → 真实空列表截图。
// Run: node --import tsx/esm research/2026-09-28-w4-completeness/.b3-empty.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { appendFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })
const token = (await r.json())?.data?.token
const routes = await (await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${token}` } })).json()
const route = routes.data.find(row => row.title === '请假审批' && row.type === 'flowPage')
if (route == null) throw new Error('请假审批 route not found')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForURL(/admin/, { timeout: 30000 })
await page.waitForTimeout(1500)
await page.goto(`${BASE}/admin/${route.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table', { timeout: 30000 })
await page.waitForTimeout(5000)

// 1) 状态下拉选「已驳回」
await page.locator('.ant-select').nth(1).click({ timeout: 10000 })
await page.waitForTimeout(1200)
await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '已驳回' }).first().click()
await page.waitForTimeout(1000)
// 2) 找 FilterForm 的提交按钮（页面底部，滚到底部再找）
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(800)
const allButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean))
console.log('buttons on page:', JSON.stringify(allButtons.slice(-10)))
const submit = page.getByRole('button', { name: /提\s*交/ }).first()
if (await submit.count() > 0) {
  await submit.click()
  console.log('submit clicked')
} else {
  console.log('no 提交 button; trying Enter on the select')
  await page.keyboard.press('Enter')
}
await page.waitForTimeout(4000)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(800)
const audit = await page.evaluate(() => ({
  rows: document.querySelectorAll('.ant-table-tbody tr:not(.ant-table-placeholder)').length,
  noData: document.body.innerText.includes('暂无数据') || document.querySelector('.ant-table-tbody .ant-table-placeholder') !== null,
  hintTop: (() => { const el = document.querySelector('[class*=markdown]'); return el == null ? null : Math.round(el.getBoundingClientRect().top) })(),
}))
console.log('after submit:', JSON.stringify(audit))
await page.screenshot({ path: `${DIR}w4-b3-journey-leave-empty.png`, fullPage: false })
appendFileSync(`${DIR}w4-b3-journey.txt`, `  空态补拍: 已驳回+提交后 rows=${String(audit.rows)} noData=${String(audit.noData)}（w4-b3-journey-leave-empty.png 更新）\n`)
await browser.close()
console.log('empty-state leg done')
