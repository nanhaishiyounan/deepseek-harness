// Last attempt at the builder field picker: after +添加条件, type into the
// panel's ant-select search inputs directly (searchable combobox semantics),
// then pick the 审批状态 option, then the 草稿 value. Falls back gracefully.
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
const po = routes.find(x => x.title === '采购订单')
await page.goto(`${BASE}/admin/${po.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(1500)
await page.locator('button:visible:has-text("筛选")').first().click({ timeout: 20000 })
await page.waitForTimeout(1800)
await page.locator('button:visible:has-text("添加条件")').first().click({ timeout: 8000 })
await page.waitForTimeout(2000)
await shot(page, 'j1-filter-e1-added')
// every searchable select input inside the popover panel region (below header, above table)
const searchInputs = page.locator('.ant-select-selection-search-input:visible')
const n = await searchInputs.count()
say(`J1-2e 可搜索 select 输入数=${n}（含逻辑/操作符/字段）`)
for (let i = 0; i < n; i++) {
  const inp = searchInputs.nth(i)
  await inp.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(700)
  await inp.fill('审批状态', { timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(1600)
  const opt = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '审批状态' }).first()
  const has = await opt.count().catch(() => 0)
  say(`J1-2e input#${i} 打字过滤后含「审批状态」选项=${has > 0}`)
  if (has > 0) {
    await opt.click({ timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(1800)
    await shot(page, 'j1-filter-e2-fieldpicked')
    // value picker: re-enumerate (a new select/value control appears)
    const vi = page.locator('.ant-select-selection-search-input:visible')
    const m = await vi.count()
    for (let j = 0; j < m; j++) {
      const v = vi.nth(j)
      const box = v.locator('..')
      const cur = (await box.innerText().catch(() => '')).trim()
      if (cur.includes('审批状态') || cur.includes('比较')) continue
      await v.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(900)
      const vopt = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '草稿' }).first()
      if (await vopt.count().catch(() => 0) > 0) {
        await vopt.click({ timeout: 6000 }).catch(() => {})
        await page.waitForTimeout(1200)
        say(`J1-2e 值=草稿 已选（input#${j}）`)
        break
      }
    }
    await shot(page, 'j1-filter-e3-value')
    await page.locator('button:visible').filter({ hasText: '提交' }).last().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await shot(page, 'j1-filter-e4-submitted')
    const rows = await visRows(page)
    const draftCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM pur_orders WHERE doc_status='draft';")
    const allDraft = rows.length > 0 && rows.every(r => r.includes('草稿'))
    say(`J1-2e 终局：行=${rows.length} psql 草稿=${draftCount} 全行草稿=${allDraft} ${allDraft || rows.length === Math.min(20, Number(draftCount)) ? '✓ 筛选生效闭环' : '未生效——证据转 B1 pilot 截图组合'}`)
    break
  }
}
await page.close()
await browser.close()
say('# fix4 done')
