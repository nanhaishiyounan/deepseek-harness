// W4-B6 micro patch: (a) J8 employee edit save with the exact「保 存」label,
// (b) J1 filter step-by-step forensics — screenshot+DOM dump after each
// builder action so the failing value-pick step is visible. Appends to
// w4-b6-journey.txt.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const envText = readFileSync('platform/nocobase/.env', 'utf8')
const envOf = (k) => envText.split('\n').map(l => l.trim()).find(l => l.startsWith(`${k}=`))?.slice(k.length + 1)?.replace(/^["']|["']$/g, '')
const psqlOne = (sql) => { try { return execFileSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim() } catch { return '(sql-error)' } }
const signIn = async (account, password) => (await (await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })).json())?.data?.token
const adminToken = await signIn('admin@nocobase.com', 'admin123')
const routes = (await (await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${adminToken}` } })).json()).data ?? []
const pageOf = (t) => routes.find(r => r.title === t)
const say = (l) => { appendFileSync(`${DIR}w4-b6-journey.txt`, `${l}\n`); console.log(l) }
const shot = (p, n) => p.screenshot({ path: `${DIR}w4-b6-journey-${n}.png`, fullPage: false }).catch(() => {})

const browser = await chromium.launch()
say(`\n# journey micro patch @ ${new Date().toISOString()}`)
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForURL(/admin/, { timeout: 30000 })
await page.waitForTimeout(2500)

// ── (a) J8 exact 保 存 ──
{
  const emp = pageOf('员工')
  await page.goto(`${BASE}/admin/${emp.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const empId = psqlOne('SELECT id FROM hub_hr_employees ORDER BY id LIMIT 1;')
  const before = psqlOne(`SELECT COALESCE(phone,'') FROM hub_hr_employees WHERE id=${empId};`)
  await page.locator('.ant-table:visible .ant-table-row:visible').first().locator('a:has-text("编辑"), button:has-text("编辑")').first().click({ timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(2200)
  const d = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
  await d.locator('input[placeholder*="手机"], input[placeholder*="11"]').first().fill('13900000001', { timeout: 8000 }).catch(() => {})
  await d.locator('button').filter({ hasText: '保' }).last().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2800)
  const mid = psqlOne(`SELECT COALESCE(phone,'') FROM hub_hr_employees WHERE id=${empId};`)
  say(`J8-3c Edit 保存（精确「保 存」按钮）：phone ${before}→${mid} ${mid === '13900000001' ? '✓ 落库' : 'FAIL'}`)
  await shot(page, 'j8-3c-saved')
  if (mid === '13900000001') {
    await page.locator('.ant-table:visible .ant-table-row:visible').first().locator('a:has-text("编辑"), button:has-text("编辑")').first().click({ timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(2200)
    const d2 = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
    await d2.locator('input[placeholder*="手机"], input[placeholder*="11"]').first().fill(before || '13800000000', { timeout: 8000 }).catch(() => {})
    await d2.locator('button').filter({ hasText: '保' }).last().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(2800)
    const back = psqlOne(`SELECT COALESCE(phone,'') FROM hub_hr_employees WHERE id=${empId};`)
    say(`J8-3c 复原：phone →${back} ${back === (before || '13800000000') ? '✓ Edit 往返闭环' : 'FAIL'}`)
  }
}

// ── (b) J1 filter step-by-step ──
{
  const po = pageOf('采购订单')
  await page.goto(`${BASE}/admin/${po.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.locator('button:visible:has-text("筛选")').first().click({ timeout: 20000 })
  await page.waitForTimeout(1800)
  await shot(page, 'j1-filter-s1-open')
  const dump = async (tag) => {
    const txt = await page.locator('body').innerText()
    const selInfo = await page.locator('.ant-select:visible').evaluateAll(els => els.map(e => e.textContent?.trim()).filter(Boolean)).catch(() => [])
    say(`[dump ${tag}] selects=${JSON.stringify(selInfo)} 区域行=${txt.split('\n').filter(l => /条件|状态|日期|供应商|所有/.test(l)).slice(0, 6).join(' | ')}`)
  }
  await dump('s1 面板展开')
  // click +添加条件
  await page.locator('button:visible:has-text("添加条件"), a:visible:has-text("添加条件"), span:visible:has-text("添加条件")').first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'j1-filter-s2-added')
  await dump('s2 添加条件后')
  // the new condition row's field picker: click the first non-pagination select and dump its dropdown
  const sels = await page.locator('.ant-select:visible').all()
  for (let i = 0; i < sels.length; i++) {
    const label = (await sels[i].innerText().catch(() => '')).trim()
    if (label.includes('条/页')) continue
    await sels[i].click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const opts = await page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').allInnerTexts().catch(() => [])
    say(`[dump s3 select#${i} label="${label}"] options=${JSON.stringify(opts.slice(0, 14))}`)
    await shot(page, `j1-filter-s3-sel${i}`)
    const want = opts.find(o => o.includes('审批状态') || o.includes('草稿'))
    if (want !== undefined) {
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').filter({ hasText: want }).first().click({ timeout: 6000 }).catch(() => {})
      await page.waitForTimeout(1200)
      await shot(page, 'j1-filter-s4-picked')
      await dump('s4 选中后')
      // then look for a value control and pick 草稿
      const sels2 = await page.locator('.ant-select:visible').all()
      for (let j = 0; j < sels2.length; j++) {
        const lab2 = (await sels2[j].innerText().catch(() => '')).trim()
        if (lab2.includes('条/页') || lab2 === want) continue
        await sels2[j].click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(1200)
        const opts2 = await page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').allInnerTexts().catch(() => [])
        say(`[dump s5 value-select#${j} label="${lab2}"] options=${JSON.stringify(opts2.slice(0, 14))}`)
        if (opts2.some(o => o.includes('草稿'))) {
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').filter({ hasText: '草稿' }).first().click({ timeout: 6000 }).catch(() => {})
          await page.waitForTimeout(1000)
          await shot(page, 'j1-filter-s6-value-picked')
          break
        }
      }
      break
    }
  }
  await dump('s7 提交前')
  await page.locator('button:visible').filter({ hasText: '提交' }).last().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, 'j1-filter-s8-submitted')
  const rows = await page.locator('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible').allInnerTexts().catch(() => [])
  const draftCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM pur_orders WHERE doc_status='draft';")
  say(`J1-2c 筛选对拍：行=${rows.length} psql 草稿=${draftCount} 首行=${rows[0]?.replace(/\s+/g, ' ').slice(0, 50)} ${rows.length === Math.min(20, Number(draftCount)) ? '✓' : '复核 s8 截图'}`)
}
await page.close()
await browser.close()
say('# micro patch done')
