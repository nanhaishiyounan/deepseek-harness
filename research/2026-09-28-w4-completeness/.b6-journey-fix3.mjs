// W4-B6 final filter leg: drive the builder the way it is built — click the
// 选择字段 input, pick 审批状态, pick the value 草稿, submit; plus the J6 quote
// create (fill 报价编号 + 总金额, submit). Appends to w4-b6-journey.txt.
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

// ── J1 filter: the real builder chain ──
const po = pageOf('采购订单')
await page.goto(`${BASE}/admin/${po.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(1500)
await page.locator('button:visible:has-text("筛选")').first().click({ timeout: 20000 })
await page.waitForTimeout(1800)
const fieldInput = page.locator('input[placeholder*="选择字段"]').first()
const fieldCount = await fieldInput.count()
say(`J1-2d 字段选择器定位：${fieldCount > 0 ? '✓（placeholder=选择字段）' : 'NO'}`)
await fieldInput.click({ timeout: 8000 })
await page.waitForTimeout(1500)
const fieldOpts = await page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"], [class*="popup"]:visible li').allInnerTexts().catch(() => [])
say(`J1-2d 字段下拉 options=${JSON.stringify(fieldOpts.slice(0, 16))}`)
await shot(page, 'j1-filter-d1-fieldopts')
const approvalOpt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"], [class*="popup"]:visible li').filter({ hasText: '审批状态' }).first()
if (await approvalOpt.count() > 0) {
  await approvalOpt.click({ timeout: 6000 })
  await page.waitForTimeout(1500)
  await shot(page, 'j1-filter-d2-fieldpicked')
  // value control appears — try select then input
  const valSel = page.locator('.ant-select:visible').filter({ hasText: '' }).last()
  let picked = false
  const allSels = await page.locator('.ant-select:visible').all()
  for (const s of allSels) {
    const lab = (await s.innerText().catch(() => '')).trim()
    if (lab.includes('条/页') || lab === '所有' || lab === '比较') continue
    await s.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const draftOpt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').filter({ hasText: '草稿' }).first()
    if (await draftOpt.count() > 0) { await draftOpt.click({ timeout: 6000 }).catch(() => {}); picked = true; break }
    await page.keyboard.press('Escape')
  }
  if (!picked) {
    // enum value may be a text input
    const valInput = page.locator('input[placeholder*="输入值"], input[placeholder*="值"]').first()
    if (await valInput.count() > 0) { await valInput.fill('draft', { timeout: 5000 }); picked = true }
  }
  await shot(page, 'j1-filter-d3-value')
  say(`J1-2d 值选择（草稿）：${picked ? '✓' : 'NO（d3 截图复核）'}`)
  await page.locator('button:visible').filter({ hasText: '提交' }).last().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, 'j1-filter-d4-submitted')
  const rows = await visRows(page)
  const draftCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM pur_orders WHERE doc_status='draft';")
  const allDraft = rows.length > 0 && rows.every(r => r.includes('草稿'))
  say(`J1-2d 筛选对拍终局：行=${rows.length} psql 草稿=${draftCount} 全行草稿=${allDraft ? '✓' : 'NO'} ${rows.length === Math.min(20, Number(draftCount)) || allDraft ? '✓ 筛选生效' : '复核 d4 截图'}`)
  // reset back to full list
  await page.locator('button:visible:has-text("筛选")').first().click({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await page.locator('button:visible').filter({ hasText: '重置' }).last().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const rowsReset = await visRows(page)
  say(`J1-3d 重置回全量：行=${rowsReset.length}`)
  await shot(page, 'j1-filter-d5-reset')
}

// ── J6 quote create ──
const quote = pageOf('报价单')
await page.goto(`${BASE}/admin/${quote.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2000)
await page.locator('button:visible:has-text("添加")').first().click({ timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2500)
const q = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
const qNo = `QT-J6-${Date.now().toString().slice(-6)}`
const qInputs = await q.locator('input:visible').evaluateAll(els => els.map(e => ({ ph: e.placeholder, val: e.value }))).catch(() => [])
say(`J6-2d 报价单 drawer inputs=${JSON.stringify(qInputs)}`)
const noIn = q.locator('input').first()
await noIn.fill(qNo, { timeout: 8000 }).catch(() => {})
const amtIn = q.locator('input[placeholder*="金额"], input[placeholder*="小数"]').first()
await amtIn.fill('1000', { timeout: 6000 }).catch(() => {})
// customer association if present
const qSels = await q.locator('.ant-select:visible').all()
for (const s of qSels) {
  const lab = (await s.innerText().catch(() => '')).trim()
  if (lab.includes('条/页') || lab === '' || /草稿/.test(lab)) continue
  await s.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const fo = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').first()
  await fo.click({ timeout: 5000 }).catch(() => { page.keyboard.press('Escape') })
  break
}
await shot(page, 'j6-2d-filled')
await q.locator('button').filter({ hasText: '提' }).last().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(2800)
const qRow = psqlOne(`SELECT quote_no || '|' || status FROM crm_quotes WHERE quote_no='${qNo}';`)
say(`J6-4d 报价单提交：psql=${qRow || '未落库（j6-2d 截图复核必填态）'} ${qRow ? '✓ 落库' : ''}`)
await shot(page, 'j6-4d-result')
await page.close()
await browser.close()
say('# fix3 done')
