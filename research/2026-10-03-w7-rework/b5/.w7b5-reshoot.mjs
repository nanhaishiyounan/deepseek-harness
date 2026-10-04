// W7-B5 supplement: re-shoot 07-召回管理 (JSBlock cache settled after --seed-pages)
// and 25-商机管道 with a real crm login flow probe (engine page, sales_rep).
// Usage (repo root): node research/2026-10-03-w7-rework/b5/.w7b5-reshoot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const ENGINE = 'http://127.0.0.1:13110'
const OUT = fileURLToPath(new URL('../../../demos/acceptance-w7/', import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// 07 召回管理 (admin).
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)
await page.goto(`${BASE}/admin/w6b3r1wnc10bflfg`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await page.screenshot({ path: OUT + 'w7-b5-07-召回管理.png' })
const p07 = await page.evaluate(() => {
  const BANNED = ['#1677ff', '#722ed1', '#7c3aed', '#ff4d4f', '#faad14', '#c41d7f', '#13c2c2']
  const banned = {}
  for (const b of BANNED) banned[b] = 0
  for (const el of document.querySelectorAll('[style]')) {
    const s = (el.getAttribute('style') || '').toLowerCase()
    for (const b of BANNED) if (s.includes(b)) banned[b] += 1
  }
  return banned
})
console.log('07 recall probe:', JSON.stringify(p07))

// 25 商机管道 signed-in (engine crm page, sales_rep) — target the form inputs by id.
await page.goto(`${ENGINE}/crm`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.locator('#login-account').fill('sales_rep')
await page.locator('#login-password').fill('Sales#2026')
await page.locator('#login-btn').click()
await page.waitForTimeout(4500)
await page.screenshot({ path: OUT + 'w7-b5-25-商机管道-crm签到态.png' })
const p25 = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const loginEl = document.querySelector('#login-view')
  return {
    w7Primary: cs.getPropertyValue('--w7-primary').trim(),
    loginViewHidden: loginEl === null || getComputedStyle(loginEl).display === 'none',
    activeTabs: [...document.querySelectorAll('.tabs button.active')].map(b => b.textContent?.trim()),
    bannedInline: [...document.querySelectorAll('[style]')].filter(e => { const s = (e.getAttribute('style') || '').toLowerCase(); return s.includes('#1677ff') || s.includes('#7c3aed') || s.includes('#722ed1') }).length,
  }
})
console.log('25 crm probe:', JSON.stringify(p25))
await browser.close()
