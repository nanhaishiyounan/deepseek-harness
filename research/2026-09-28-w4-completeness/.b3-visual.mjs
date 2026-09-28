// W4-B3 pilot visual audit: 采购订单 stat cards + hint + ordering vs table,
// plus one titled w9 chart. Run: node --import tsx/esm research/2026-09-28-w4-completeness/.b3-visual.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
if (!adminToken) throw new Error('admin signIn failed')
const api = async (path) => (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${adminToken}` } })).json()
const routes = await api('/api/desktopRoutes:list?pageSize=400')
const routeOf = (title) => routes.data.find(row => row.title === title && row.type === 'flowPage')

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

// ── leg 1: 采购订单 pilot page ──
{
  const route = routeOf('采购订单')
  if (route == null) throw new Error('采购订单 route not found')
  await page.goto(`${BASE}/admin/${route.schemaUid}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const audit = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.ant-card, [class*="block-grid"] > *')]
    const markdown = [...document.querySelectorAll('.markdown, [class*="markdown"]')].map(el => el.textContent.trim().slice(0, 80)).filter(t => t.length > 0)
    const canvases = [...document.querySelectorAll('canvas')]
    const chartTexts = [...document.querySelectorAll('canvas')].map(c => {
      const card = c.closest('.ant-card') ?? c.parentElement?.parentElement
      return { cardTitle: card?.querySelector('.ant-card-head-title, [class*="title"]')?.textContent?.trim() ?? '', top: Math.round(c.getBoundingClientRect().top) }
    })
    const table = document.querySelector('.ant-table')
    const markdownTop = document.querySelector('.markdown, [class*="markdown"]')?.getBoundingClientRect().top
    return {
      canvasCount: canvases.length,
      chartTexts: chartTexts.slice(0, 6),
      markdownSnippets: markdown.slice(0, 3),
      markdownTop: markdownTop == null ? null : Math.round(markdownTop),
      tableTop: table == null ? null : Math.round(table.getBoundingClientRect().top),
      firstCanvasTop: canvases.length === 0 ? null : Math.round(canvases[0].getBoundingClientRect().top),
      blockCount: blocks.length,
    }
  })
  console.log('采购订单 audit:', JSON.stringify(audit))
  await page.screenshot({ path: `${DIR}w4-b3-pilot-po-page.png`, fullPage: false })
  await page.screenshot({ path: `${DIR}w4-b3-pilot-po-full.png`, fullPage: true })
  if (audit.canvasCount < 4) throw new Error(`stat cards not rendered (canvas=${String(audit.canvasCount)}); check chart custom raw`)
}
// ── leg 2: w9 经营看板 titled chart ──
{
  const route = routeOf('经营看板')
  if (route != null) {
    await page.goto(`${BASE}/admin/${route.schemaUid}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('.ant-card-head-title')].map(el => el.textContent.trim()).filter(t => t !== ''))
    console.log('经营看板 card titles:', JSON.stringify(titles))
    await page.screenshot({ path: `${DIR}w4-b3-titled-charts-w9.png`, fullPage: false })
    if (!titles.some(t => t.includes('毛利率趋势'))) throw new Error('w9 chart title not rendered')
  }
}
await browser.close()
console.log('b3 visual: OK')
