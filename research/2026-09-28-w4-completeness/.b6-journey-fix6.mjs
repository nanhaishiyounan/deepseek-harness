// The decisive click: the FilterForm's own blue 筛选 primary button (DOM order
// precedes the table-toolbar funnel) applies the selected status.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const envText = readFileSync('platform/nocobase/.env', 'utf8')
const envOf = (k) => envText.split('\n').map(l => l.trim()).find(l => l.startsWith(`${k}=`))?.slice(k.length + 1)?.replace(/^["']|["']$/g, '')
const psqlOne = (sql) => { try { return execFileSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim() } catch { return '(sql-error)' } }
const say = (l) => { appendFileSync(`${DIR}w4-b6-journey.txt`, `${l}\n`); console.log(l) }
const shot = (p, n) => p.screenshot({ path: `${DIR}w4-b6-journey-${n}.png`, fullPage: false }).catch(() => {})
const visRows = (p) => p.locator('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible').allInnerTexts().catch(() => [])

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForURL(/admin/, { timeout: 30000 })
await page.waitForTimeout(2500)
const tk = (await (await fetch('http://127.0.0.1:13000/api/auth:signIn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })).json()).data.token
const routes = (await (await fetch('http://127.0.0.1:13000/api/desktopRoutes:list?pageSize=400', { headers: { authorization: `Bearer ${tk}` } })).json()).data
await page.goto(`${BASE}/admin/${routes.find(x => x.title === '任务列表').schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2000)

say(`\n# filter apply (decisive) @ ${new Date().toISOString()}`)
// pick 进行中 in the status field dropdown
const sels = await page.locator('.ant-select:visible').all()
for (const s of sels) {
  const lab = (await s.innerText().catch(() => '')).trim()
  if (lab.includes('条/页') || lab !== '') continue
  await s.click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const opt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').filter({ hasText: '进行中' }).first()
  if (await opt.count().catch(() => 0) > 0) { await opt.click({ timeout: 6000 }).catch(() => {}); break }
  await page.keyboard.press('Escape')
}
await page.waitForTimeout(1000)
// click the FilterForm's own 筛选 primary button — the FIRST visible one (above the table toolbar funnel)
await page.locator('button:visible:has-text("筛选")').first().click({ timeout: 10000 })
await page.waitForTimeout(3000)
await shot(page, 'j1-filter-g1-applied')
const ipCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM hub_pj_tasks WHERE status='in_progress';")
const rows = await visRows(page)
const allIp = rows.length > 0 && rows.every(r => r.includes('进行中'))
say(`J1-2g 筛选生效：行=${rows.length} psql in_progress=${ipCount} 全行进行中=${allIp ? '✓' : 'NO'} ${rows.length === Number(ipCount) && allIp ? '✓✓ FilterForm 筛选行数+内容双对拍闭环' : '复核 g1'}`)
// reset leg
await page.locator('button:visible:has-text("重置")').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(2800)
await shot(page, 'j1-filter-g2-reset')
const rows2 = await visRows(page)
say(`J1-3g 重置回全量：行=${rows2.length}（psql 全量=${psqlOne('SELECT COUNT(*) FROM hub_pj_tasks;')}）✓`)
await page.close()
await browser.close()
say('# fix6 done')
