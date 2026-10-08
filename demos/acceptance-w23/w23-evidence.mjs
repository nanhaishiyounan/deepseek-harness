// W23-B0 audit pass 4: evidence screenshots for the user-named issues —
// TaskFormModal large buttons (opened via a real create-task card action),
// the dead-route page after clicking 查看全部采购订单, and the report-card
// button row on the monthly-report session.
import { mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23'
mkdirSync(OUT, { recursive: true })
const C2 = 'session-821a6a23-c175-44c0-9788-c504fea9eeb2'
const C3 = 'session-b1989d49-d8b3-4c71-8cc3-acdb3bcfce55'
const C1 = 'session-d63eda18-17eb-4dd1-9c01-32c37eca2b70'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })

// 1) monthly-report session: report card + 20px button row
await page.goto(`${BASE}#/chat/${C1}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/w23-evidence-c1-report.png`, fullPage: true })

// 2) dead route after view action
await page.goto(`${BASE}#/chat/${C2}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: '查看全部采购订单' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/w23-evidence-view-deadroute.png` })

// 3) TaskFormModal via real create-task action (c3 card)
await page.goto(`${BASE}#/chat/${C3}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const createBtn = page.getByRole('button', { name: /让采购助理补全|跟进|创建/ }).first()
if (await createBtn.count() > 0) {
  await createBtn.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/w23-evidence-taskformmodal.png` })
  const probe = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /取消|创建任务/.test(b.textContent ?? '')).map((b) => { const cs = getComputedStyle(b); return { text: (b.textContent ?? '').trim(), fontSize: cs.fontSize, height: Math.round(b.getBoundingClientRect().height) } }))
  console.log('taskform buttons:', JSON.stringify(probe))
} else {
  console.log('no create-task button found on c3')
}
await browser.close()
console.log('DONE evidence shots')
