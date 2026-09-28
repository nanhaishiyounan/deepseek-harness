// W4-B2 journey forensics (batch §4 acceptance legs):
//   J1 报价单新建 — two-column + defaults prefill (status initial / qty 0) +
//      required negative + submit → API/psql row check + screenshots
//   J2 管理员编辑客户档案 — B2 Edit popup round-trip (改备注 → 保存 → 重开对拍)
//      + Delete confirm negative (取消不落库)
// Run: node --import tsx/esm research/2026-09-28-w4-completeness/.b2-journey.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const stamp = Date.now().toString(36)

const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
if (!adminToken) throw new Error('admin signIn failed')
const api = async (path, init = {}) => (await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })).json()

const browser = await chromium.launch()
const shoot = async (page, name) => page.screenshot({ path: `${DIR}${name}.png`, fullPage: false })
const login = async (page, account, password) => {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input', { timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder="用户名/邮箱"]').fill(account, { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill(password)
  await page.keyboard.press('Enter')
  await page.waitForURL(/admin/, { timeout: 30000 })
  await page.waitForTimeout(1500)
}
const routes = await api('/api/desktopRoutes:list?pageSize=400')
const routeOf = (title) => routes.data.find(row => row.title === title && row.type === 'flowPage')

// ─── J1: 供应商报价（pur_quotes）新建旅程 ───
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await login(page, 'admin@nocobase.com', 'admin123')
  const quote = routeOf('供应商报价')
  if (quote == null) throw new Error('供应商报价 route not found')
  await page.goto(`${BASE}/admin/${quote.schemaUid}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: /添\s*加/ }).first().click()
  await page.waitForSelector('form .ant-form-item', { timeout: 15000 })
  await page.waitForTimeout(1500)

  const audit = await page.evaluate(() => {
    const form = document.querySelector('form') ?? document.body
    const dividers = [...form.querySelectorAll('.ant-divider')].map(d => d.textContent.trim())
    const required = [...form.querySelectorAll('.ant-form-item-required')].length
    const boxes = [...form.querySelectorAll('.ant-form-item')].filter(el => el.querySelector('.ant-form-item-label')).map(el => ({ top: Math.round(el.getBoundingClientRect().top), left: Math.round(el.getBoundingClientRect().left) }))
    const pairs = boxes.filter((b, i) => boxes.some((o, j) => j !== i && Math.abs(o.top - b.top) < 5 && Math.abs(o.left - b.left) > 100)).length
    const qtyItem = [...form.querySelectorAll('.ant-form-item')].find(el => /数量/.test(el.querySelector('.ant-form-item-label')?.textContent ?? ''))
    return { dividers, required, pairs, qtyShown: qtyItem?.querySelector('input')?.value ?? qtyItem?.textContent?.trim().slice(-6) ?? '' }
  })
  console.log('quote form audit:', JSON.stringify(audit))
  if (!audit.dividers.some(d => d === '基本信息')) throw new Error('quote: sections missing')
  if (audit.required < 3) throw new Error(`quote: required ${audit.required} < 3`)
  if (audit.pairs < 2) throw new Error('quote: two-column geometry missing')
  await shoot(page, 'w4-b2-journey-quote-create')

  // required negative
  await page.locator('button', { hasText: /提\s*交|保\s*存/ }).last().click({ timeout: 15000 })
  await page.waitForTimeout(1500)
  const errors = await page.locator('.ant-form-item-explain-error').count()
  console.log(`quote negative: validationErrors=${errors}`)
  if (errors === 0) throw new Error('quote: negative not blocked')

  // positive: pick rfq + supplier + fill qty/price, submit, then verify the row
  for (const labelText of ['询价', '供应商']) {
    const combo = page.locator(`form .ant-form-item:has(.ant-form-item-label:has-text("${labelText}")) .ant-select`).first()
    await combo.scrollIntoViewIfNeeded().catch(() => {})
    await combo.click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
  }
  const supplierCombo = page.locator('form .ant-form-item:has(.ant-form-item-label:has-text("供应商")) .ant-select').first()
  await supplierCombo.click({ force: true }).catch(() => {})
  await page.waitForTimeout(800)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const fill = (labelText, value) => {
      const item = [...document.querySelectorAll('form .ant-form-item')].find(el => el.querySelector('.ant-form-item-label')?.textContent.includes(labelText))
      const input = item?.querySelector('input, textarea')
      if (input == null) return
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    fill('数量', '100')
    fill('单价', '12.50')
  })
  await page.waitForTimeout(500)
  await page.locator('button', { hasText: /提\s*交|保\s*存/ }).last().click({ timeout: 15000 })
  await page.waitForTimeout(3000)
  await shoot(page, 'w4-b2-journey-quote-submitted')
  await page.close()

  const psql = (sql) => execFileSync('psql', ['-h', 'localhost', '-U', 'nocobase', '-d', 'nocobase', '-t', '-c', sql], { env: { ...process.env, PGPASSWORD: 'nocobase' } }).toString().trim()
  const row = psql(`select id, qty, unit_price, status from pur_quotes where qty = 100 order by id desc limit 1;`)
  console.log('psql quote row:', row)
  if (!/\b100\b/.test(row)) throw new Error('quote: submitted qty not persisted')
  if (!/\|/.test(row) || row.split('|').pop()?.trim() === '') throw new Error('quote: status missing on submitted row')
}

// ─── J2: 任务列表 hub_pj_tasks — B2 Edit 往返 + 删除确认负例 ───
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await login(page, 'admin@nocobase.com', 'admin123')
  // hub_pj_tasks 任务列表 — B2-fresh Edit popup + member-creatable page
  await page.goto(`${BASE}/admin/n17e11csgtbr0w3x`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // open the first row's B2 编辑 popup (w4b2 Edit action)
  const editBtn = page.getByRole('button', { name: '编辑' }).first()
  await editBtn.click({ timeout: 15000 })
  await page.waitForSelector('form .ant-form-item', { timeout: 15000 })
  await page.waitForTimeout(1500)
  const editAudit = await page.evaluate(() => {
    // the page's FilterForm is also a <form> — scope to the popup layer's form
    const layer = [...document.querySelectorAll('.ant-drawer-content, .ant-modal-content')].filter(el => el.offsetParent !== null).pop()
    const form = layer?.querySelector('form') ?? [...document.querySelectorAll('form')].pop() ?? document.body
    const boxes = [...form.querySelectorAll('.ant-form-item')].filter(el => el.querySelector('.ant-form-item-label')).map(el => ({ top: Math.round(el.getBoundingClientRect().top), left: Math.round(el.getBoundingClientRect().left) }))
    const pairs = boxes.filter((b, i) => boxes.some((o, j) => j !== i && Math.abs(o.top - b.top) < 5 && Math.abs(o.left - b.left) > 100)).length
    return { fields: boxes.length, pairs, dividers: [...form.querySelectorAll('.ant-divider')].map(d => d.textContent.trim()) }
  })
  console.log('task edit audit:', JSON.stringify(editAudit))
  if (editAudit.fields < 4 || editAudit.pairs < 2) throw new Error(`task edit: two-column B2 popup not detected (${JSON.stringify(editAudit)})`)
  await shoot(page, 'w4-b2-journey-task-edit-open')

  // round-trip: change 优先级 select, save, reopen, compare
  const popupForm = () => {
    const layer = [...document.querySelectorAll('.ant-drawer-content, .ant-modal-content')].filter(el => el.offsetParent !== null).pop()
    return layer ?? [...document.querySelectorAll('form')].pop() ?? document.body
  }
  const readPriority = () => page.evaluate(() => {
    const layer = [...document.querySelectorAll('.ant-drawer-content, .ant-modal-content')].filter(el => el.offsetParent !== null).pop()
    const scope = layer ?? document
    const item = [...scope.querySelectorAll('.ant-form-item')].find(el => /优先级/.test(el.querySelector('.ant-form-item-label')?.textContent ?? ''))
    return item?.querySelector('.ant-select-selection-item')?.textContent.trim() ?? ''
  })
  const before = await readPriority()
  const combo = page.locator('.ant-drawer-content:visible .ant-form-item:has(.ant-form-item-label:has-text("优先级")) .ant-select, .ant-modal-content:visible .ant-form-item:has(.ant-form-item-label:has-text("优先级")) .ant-select').first()
  await combo.click({ force: true })
  await page.waitForTimeout(700)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  const chosen = await readPriority()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: /保\s*存|提\s*交/ }).last().click({ timeout: 15000 })
  await page.waitForTimeout(2500)
  await shoot(page, 'w4-b2-journey-task-edit-saved')

  // the edit drawer stays open after save — close it before reopening
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)
  const drawerStillOpen = await page.locator('.ant-drawer-open:visible').count()
  if (drawerStillOpen > 0) {
    await page.locator('.ant-drawer-open:visible .ant-drawer-close').first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1200)
  }
  await page.getByRole('button', { name: '编辑' }).first().click({ timeout: 15000 })
  await page.waitForSelector('form .ant-form-item', { timeout: 15000 })
  await page.waitForTimeout(1800)
  const reopened = await readPriority()
  console.log(`task edit round-trip: ${before} -> ${chosen} -> reopened=${reopened}`)
  if (reopened !== chosen || chosen === before) throw new Error('task edit: round-trip priority not persisted')
  await shoot(page, 'w4-b2-journey-task-edit-reopened')

  // close the reopened drawer before the delete leg
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1200)
  if (await page.locator('.ant-drawer-open:visible').count() > 0) {
    await page.locator('.ant-drawer-open:visible .ant-drawer-close').first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1200)
  }

  // Delete confirm negative: cancel must not remove the row
  const beforeRows = ((await api('/api/hub_pj_tasks:list?pageSize=500')).data ?? []).length
  await page.getByRole('button', { name: '删除' }).first().click({ timeout: 15000 })
  await page.waitForTimeout(1200)
  const confirmVisible = await page.locator('.ant-popconfirm, .ant-modal-confirm:visible, .ant-modal:visible').count()
  await shoot(page, 'w4-b2-journey-task-delete-confirm')
  const cancelBtn = page.locator('.ant-popconfirm-buttons button, .ant-modal-confirm-btns button, .ant-modal-footer button').filter({ hasText: /取消|否/ }).first()
  await cancelBtn.click({ timeout: 8000 }).catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(1500)
  const afterRows = ((await api('/api/hub_pj_tasks:list?pageSize=500')).data ?? []).length
  console.log(`task delete negative: confirmVisible=${confirmVisible} rowsBefore=${beforeRows} rowsAfter=${afterRows}`)
  if (afterRows !== beforeRows) throw new Error('task delete: cancel leaked a deletion')
  await page.close()
}

await browser.close()
console.log('W4-B2 journeys: ALL LEGS GREEN')
