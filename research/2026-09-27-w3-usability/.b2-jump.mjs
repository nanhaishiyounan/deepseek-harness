// W3-B2 jump forensics: click the approval-jump actions in a real browser and
// assert the URL lands on the mapped page. Two directions:
//   biz row 审批进度 → 审批中心;  todo row 前往单据 → mapped business page.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
})
const token = (await signIn.json())?.data?.token

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)

// 1) biz row: 采购订单 first row → 审批进度 → 审批中心.
await page.goto(`${BASE}/admin/w3puryzkva06iuhh`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
await page.waitForTimeout(800)
const bizJump = page.locator('.ant-table-row').first().locator('button:has-text("审批进度"), a:has-text("审批进度")').first()
if ((await bizJump.count()) === 0) throw new Error('no 审批进度 button on the PO row')
await bizJump.click()
await page.waitForTimeout(2500)
console.log(`BIZ-JUMP url=${page.url()}`)
await page.screenshot({ path: 'research/2026-09-27-w3-usability/w3-b2-jump-biz-to-approval.png' })

// 2) todo row: 审批中心 first open todo → 前往单据 → mapped business page.
await page.goto(`${BASE}/admin/w1w167h6joi0ck6`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: 'research/2026-09-27-w3-usability/w3-b2-jump-todo-center.png' })
const todoRow = page.locator('.ant-table-row', { hasText: 'pur_orders' }).first()
if ((await todoRow.count()) === 0) throw new Error('no pur_orders todo row visible')
const todoJump = todoRow.locator('button:has-text("前往单据"), a:has-text("前往单据")').first()
if ((await todoJump.count()) === 0) throw new Error('no 前往单据 button on the todo row')
const todoText = await todoRow.innerText()
await todoJump.click()
await page.waitForTimeout(2500)
console.log(`TODO-JUMP url=${page.url()} todoRow=${JSON.stringify(todoText.slice(0, 100))}`)
await page.screenshot({ path: 'research/2026-09-27-w3-usability/w3-b2-jump-todo-to-doc.png' })
const landed = await page.locator('.ant-table-row').count()
console.log(`TODO-JUMP landed rows=${landed}`)

await browser.close()
