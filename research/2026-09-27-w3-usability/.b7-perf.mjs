// W3-B7 perf spot-check: drawer / kanban / gantt / terminal pages, load < 5s.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const BASE = 'http://127.0.0.1:3080/nocobase'
const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
})
const token = (await signIn.json())?.data?.token

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)

const targets = [
  { name: 'drawer（采购订单 行详情）', route: 'w3puryzkva06iuhh', wait: '.ant-table-row' },
  { name: 'kanban（生产订单看板）', route: 'w3b39xulomz8jj', wait: '.ant-card' },
  { name: 'gantt（排产甘特 v1）', route: '96yet9a0x45', wait: 'svg, .ant-table-row' },
  { name: 'terminal（车间终端 iframe）', route: 'w3b6guuruqly03t', wait: 'iframe' },
]
console.log(`=== W3-B7 性能抽查（${new Date().toISOString().slice(0, 19).replace('T', ' ')}，预算 <5000ms/页）===`)
let failures = 0
for (const target of targets) {
  const t0 = Date.now()
  await page.goto(`${BASE}/admin/${target.route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector(target.wait, { timeout: 60_000 }).catch(() => undefined)
  await page.waitForTimeout(600)
  const ms = Date.now() - t0
  const ok = ms < 5000
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${target.name} — ${String(ms)}ms`)
}
console.log(`=== 性能抽查：${failures === 0 ? '4/4 全部 <5s' : `${String(failures)} 页超时`} ===`)
await browser.close()
if (failures > 0) process.exitCode = 1
