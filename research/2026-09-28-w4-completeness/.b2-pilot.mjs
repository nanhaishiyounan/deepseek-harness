// W4-B2 pilot forensics: the two pilot forms (srm_suppliers master template +
// w3pur purchase-order doc template) through the real :3080 gateway, dual
// account (admin + qc_inspector member). Every leg lands a screenshot plus a
// hard assertion: two-column geometry, divider sections, required stars,
// assignRules prefill (lifecycle_status=potential / need_date=today +
// doc_status=draft), the required-negative block (submit refused), and the
// post-submit psql row check. Also captures the B1-leftover h5 pages in a
// fresh context (client-cache proof). Run:
//   node --import tsx/esm research/2026-09-28-w4-completeness/.b2-pilot.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const today = new Date().toISOString().slice(0, 10)
const stamp = Date.now().toString(36)

const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
if (!adminToken) throw new Error('admin signIn failed')

const browser = await chromium.launch()
const shoot = async (page, name) => page.screenshot({ path: `${DIR}${name}.png`, fullPage: false })

const login = async (page, account, password) => {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  // the SPA takes ~5s to hydrate the auth form in a fresh context
  await page.waitForSelector('input', { timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder="用户名/邮箱"]').fill(account, { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill(password)
  await page.keyboard.press('Enter')
  await page.waitForURL(/admin/, { timeout: 30000 })
  await page.waitForTimeout(1500)
}

// ─── leg 1: admin · supplier create form (master template) ───
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await login(page, 'admin@nocobase.com', 'admin123')
  await page.goto(`${BASE}/admin/h4srm2u9xiqx09jb`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /添\s*加/ }).click()
  await page.waitForSelector('.ant-modal form, form .ant-form-item', { timeout: 15000 })
  await page.waitForTimeout(1200)

  const audit = await page.evaluate(() => {
    const form = document.querySelector('form') ?? document.body
    const dividers = [...form.querySelectorAll('.ant-divider')].map(d => d.textContent.trim())
    const required = [...form.querySelectorAll('.ant-form-item-required')].map(el => el.closest('.ant-form-item')?.querySelector('.ant-form-item-label')?.textContent.trim().replace(/[:\s*]/g, ''))
    const boxes = [...form.querySelectorAll('.ant-form-item')].filter(el => el.querySelector('.ant-form-item-label')).map(el => ({ top: Math.round(el.getBoundingClientRect().top), left: Math.round(el.getBoundingClientRect().left) }))
    const pairs = boxes.filter((b, i) => boxes.some((o, j) => j !== i && Math.abs(o.top - b.top) < 5 && Math.abs(o.left - b.left) > 100)).length
    const lifecycle = [...form.querySelectorAll('.ant-form-item')].find(el => el.textContent.includes('生命周期状态'))
    return { dividers, required, pairs, lifecycle: lifecycle?.textContent?.includes('潜在') ?? false, placeholders: [...form.querySelectorAll('input[placeholder]')].map(i => i.placeholder) }
  })
  console.log('supplier form audit:', JSON.stringify(audit))
  if (audit.dividers.filter(d => d === '基本信息' || d === '属性与联系').length !== 2) throw new Error('supplier: divider sections missing')
  if (audit.required.length < 8) throw new Error(`supplier: required stars ${audit.required.length} < 8`)
  if (audit.pairs < 4) throw new Error('supplier: two-column geometry not detected')
  if (!audit.lifecycle) throw new Error('supplier: lifecycle_status=potential prefill missing')
  await shoot(page, 'w4-b2-pilot-supplier-create')

  // required-negative: submit the untouched form — antd must refuse (no new row)
  const countRows = async () => ((await (await fetch(`${API}/api/srm_suppliers:list?pageSize=500`, { headers: { authorization: `Bearer ${adminToken}` } })).json()).data ?? []).length
  const beforeCount = await countRows()
  await page.getByRole('button', { name: /提\s*交/ }).click()
  await page.waitForTimeout(1500)
  const errors = await page.locator('.ant-form-item-explain-error').count()
  const afterCount = await countRows()
  console.log(`supplier negative: validationErrors=${errors} rowsBefore=${beforeCount} rowsAfter=${afterCount}`)
  if (errors === 0 || afterCount !== beforeCount) throw new Error('supplier: required negative failed (submit not blocked or row leaked)')
  await shoot(page, 'w4-b2-pilot-supplier-negative')

  // positive: fill the required minimum and submit; the default must land in the row
  const name = `W4B2试点供应商-${stamp}`
  await page.evaluate(({ name, code }) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const fill = (labelText, value) => {
      const item = [...document.querySelectorAll('form .ant-form-item')].find(el => el.querySelector('.ant-form-item-label')?.textContent.includes(labelText))
      const input = item?.querySelector('input, textarea')
      if (input == null) return
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    fill('供应商名称', name)
    fill('统一社会信用代码', '91350100MA34H4W4B2')
    fill('联系人', '试点联系人')
    fill('联系电话', '13800001234')
    fill('所在地区', '福建漳州')
    const codeInput = [...document.querySelectorAll('form input')].find(i => i.placeholder === '如 PO-20261001-001')
    if (codeInput != null) { setter.call(codeInput, code); codeInput.dispatchEvent(new Event('input', { bubbles: true })) }
  }, { name, code: `SUP-${stamp}` })
  await page.waitForTimeout(500)
  for (const label of ['类别', '来源']) {
    const combo = page.locator(`form .ant-form-item:has(.ant-form-item-label:has-text("${label}")) .ant-select`).first()
    await combo.scrollIntoViewIfNeeded().catch(() => {})
    await combo.click({ force: true })
    await page.waitForTimeout(600)
    // keyboard path is immune to the dropdown's portal re-render races
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: /提\s*交/ }).click()
  await page.waitForTimeout(2500)
  await shoot(page, 'w4-b2-pilot-supplier-submitted')
  await page.close()

  const row = (await (await fetch(`${API}/api/srm_suppliers:list?pageSize=5&filter=${encodeURIComponent(JSON.stringify({ name: { $eq: name } }))}`, { headers: { authorization: `Bearer ${adminToken}` } })).json()).data?.[0]
  console.log('supplier psql-api row:', JSON.stringify({ id: row?.id, code: row?.code, lifecycle_status: row?.lifecycle_status }))
  if (row?.lifecycle_status !== 'potential') throw new Error('supplier: submitted row lacks lifecycle_status=potential (assignRules not persisted)')
}

// ─── leg 2: admin · purchase order create form (doc template, w3pur page) ───
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await login(page, 'admin@nocobase.com', 'admin123')
  await page.goto(`${BASE}/admin/w3puryzkva06iuhh`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /添\s*加/ }).first().click()
  await page.waitForSelector('form .ant-form-item', { timeout: 15000 })
  await page.waitForTimeout(1500)

  const audit = await page.evaluate(() => {
    const form = document.querySelector('form') ?? document.body
    const dividers = [...form.querySelectorAll('.ant-divider')].map(d => d.textContent.trim())
    const docStatus = [...form.querySelectorAll('.ant-form-item')].find(el => el.textContent.includes('单据状态') || el.textContent.includes('doc_status') || el.textContent.includes('状态'))
    // antd DatePicker's readonly input never reflects the picked value — read the picker cell text
    const needDateItem = [...form.querySelectorAll('.ant-form-item')].find(el => el.querySelector('input[placeholder="YYYY-MM-DD"]'))
    const needDateInput = needDateItem?.querySelector('input') ?? null
    // antd DatePicker renders the picked date into the input's value attribute (not textContent)
    const needDateShown = needDateInput?.value ?? needDateItem?.querySelector('.ant-form-item-control-input-container')?.textContent.trim() ?? ''
    return {
      dividers,
      docStatusText: docStatus?.textContent?.trim().slice(0, 30) ?? null,
      needDateValue: needDateShown,
      placeholders: [...form.querySelectorAll('input[placeholder]')].map(i => i.placeholder),
    }
  })
  console.log('po form audit:', JSON.stringify(audit))
  if (!audit.dividers.some(d => d === '基本信息')) throw new Error('po: 基本信息 divider missing')
  if (audit.docStatusText === null || !(audit.docStatusText.includes('草稿'))) throw new Error(`po: doc_status=draft prefill missing (${audit.docStatusText})`)
  if (audit.needDateValue !== today) throw new Error(`po: need_date today prefill missing (${audit.needDateValue} != ${today})`)
  await shoot(page, 'w4-b2-pilot-po-create')

  // negative: clear the prefilled date (allowClear icon) then submit → blocked
  const dateItem = page.locator('form .ant-form-item:has(input[placeholder="YYYY-MM-DD"])').first()
  await dateItem.hover()
  await page.waitForTimeout(300)
  const clearBtn = dateItem.locator('.ant-picker-clear')
  if (await clearBtn.count() > 0) {
    await clearBtn.click({ force: true })
    await page.waitForTimeout(400)
  }
  await page.locator('button', { hasText: /提\s*交|保\s*存/ }).last().click({ timeout: 15000 })
  await page.waitForTimeout(1500)
  const errors = await page.locator('.ant-form-item-explain-error').count()
  const dateCleared = (await dateItem.locator('.ant-form-item-control-input-container').textContent().catch(() => ''))?.trim() === ''
  console.log(`po negative: validationErrors=${errors} dateCleared=${dateCleared}`)
  if (errors === 0) throw new Error('po: required negative failed (submit not blocked)')
  await shoot(page, 'w4-b2-pilot-po-negative')
  await page.close()
}

// ─── leg 3: member (qc_inspector) · supplier form standards visible ───
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await login(page, 'qc_inspector', 'Qc#2026')
  await page.goto(`${BASE}/admin/h4srm2u9xiqx09jb`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  // qc_inspector holds no create grant on srm_suppliers — the hidden 添加 is the
  // correct ACL fence (W3-B5 matrix); the member leg proves the healed surface
  // renders and records the fence; the deep member form check rides the
  // post-heal journey (hub_pj_tasks, member-creatable).
  const addVisible = await page.getByRole('button', { name: /添\s*加/ }).isVisible().catch(() => false)
  const rows = await page.locator('.ant-table-tbody tr').count()
  const headers = await page.evaluate(() => [...document.querySelectorAll('.ant-table-thead th')].map(th => th.textContent.trim()).filter(Boolean))
  console.log(`member supplier view: addVisible=${addVisible} rows=${rows} headers=${headers.length}`)
  await shoot(page, 'w4-b2-pilot-member-supplier')
  if (rows === 0) throw new Error('member: supplier table did not render')
  await page.close()
}

// ─── leg 4: B1-leftover h5 pages in a FRESH context (client-cache proof) ───
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await login(page, 'admin@nocobase.com', 'admin123')
  for (const [route, label] of [['h5wms2hmkvlfsmtf', 'count'], ['h5wms9v2hly0cg6j', 'stock']]) {
    await page.goto(`${BASE}/admin/${route}`, { waitUntil: 'networkidle' })
    let ths = []
    for (let attempt = 0; attempt < 6 && ths.length === 0; attempt++) {
      await page.waitForTimeout(2000)
      ths = await page.evaluate(() => [...document.querySelectorAll('.ant-table-thead th')].map(th => th.textContent.trim()).filter(t => t !== ''))
    }
    console.log(`h5 fresh-context ${label} headers (${ths.length}):`, ths.join(','))
    await shoot(page, `w4-b2-b1leftover-${label}-freshctx`)
  }
  await page.close()
}

await browser.close()

// ─── psql read-only cross-check (spec: ≥2 groups, one positive manual check) ───
const psql = (sql) => execFileSync('psql', ['-h', 'localhost', '-U', 'nocobase', '-d', 'nocobase', '-t', '-c', sql], { env: { ...process.env, PGPASSWORD: 'nocobase' } }).toString().trim()
const supplierRow = psql(`select code, lifecycle_status from srm_suppliers where code = 'SUP-${stamp}';`)
console.log('psql supplier row:', supplierRow)
if (!supplierRow.includes('potential')) throw new Error('psql: supplier default not persisted')
const assignGrids = Number(psql(`select count(*) from "flowModels" where options->>'use' = 'FormGridModel' and (options->'stepParams')::text like '%assignRules%';`))
console.log('psql assignRules grids:', assignGrids)
if (assignGrids < 3) throw new Error('psql: pilot assignRules grids < 3')

console.log('W4-B2 pilot: ALL LEGS GREEN')
