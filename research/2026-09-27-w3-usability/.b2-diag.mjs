// Diagnose the JSRecordAction click: capture console + page errors + requests.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/nocobase'
const API = 'http://127.0.0.1:13000'
const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
})
const token = (await signIn.json())?.data?.token

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', msg => console.log(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`))
page.on('pageerror', err => console.log(`[pageerror] ${String(err).slice(0, 300)}`))
page.on('request', req => {
  const url = req.url()
  if (url.includes('runjs') || url.includes('jsAction') || url.includes('flowSurfaces')) console.log(`[request] ${req.method()} ${url.slice(0, 200)}`)
})
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
await page.goto(`${BASE}/admin/w3puryzkva06iuhh`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
await page.waitForTimeout(1000)
const jump = page.locator('.ant-table-row').first().locator('button:has-text("审批进度"), a:has-text("审批进度")').first()
await jump.click()
await page.waitForTimeout(4000)
console.log(`FINAL url=${page.url()}`)
await browser.close()
