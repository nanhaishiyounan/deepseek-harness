/**
 * W4-R2 forensics: open the 质检单 edit form and prove the textarea fields
 * (判定说明 etc.) render as inputs, not the red "Model class
 * 'TextAreaFieldModel' not found" error the W round introduced (8 live rows
 * retired by w4-r2-fix.mts). Admin session: the model-registry failure is
 * role-independent; qc_inspector sees the same form.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r2-form-browser.mts
 */
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../../platform/nocobase/package.json', import.meta.url))
const { chromium } = require('playwright')

const OUT = 'research/2026-09-28-w4-completeness/w4-r2-qc-form-edit.png'
const PAGE_URL = 'http://127.0.0.1:13000/admin/w8qmjvyv8p5j7j'
const failures: string[] = []
const consoleErrors: string[] = []

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300))
})
page.on('pageerror', error => consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`))

await page.goto('http://127.0.0.1:13000/signin', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder(/email|账号|用户名/i).or(page.locator('input[name="email"], input#email, input[type="text"]').first()).first().fill('admin@nocobase.com')
await page.locator('input[type="password"]').first().fill('admin123')
await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("登录")').first().click()
await page.waitForURL(url => !String(url).includes('signin'), { timeout: 30_000 })

await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table-tbody tr.ant-table-row', { timeout: 30_000 })

// Open the first row's edit form (操作 column). The W3-B1 row drawer and
// the plain edit action both land on the same FormGridModel tree.
const editTrigger = page.locator('.ant-table-tbody tr.ant-table-row').first().locator('a, button').filter({ hasText: '编辑' }).first()
if (await editTrigger.count() === 0) {
  failures.push('edit trigger not found in the first row 操作 column')
} else {
  await editTrigger.click()
  await page.waitForTimeout(6_000)
}

// The acceptance: the form surface carries no unregistered-model error text
// and the 判定说明 field renders (label visible) with an input behind it.
const bodyText = await page.evaluate(() => document.body.innerText)
if (bodyText.includes('TextAreaFieldModel') || /Model class .* not found/i.test(bodyText)) {
  failures.push(`form still renders an unregistered-model error (${bodyText.match(/.{0,40}(TextAreaFieldModel|Model class[^\n]{0,60})/)?.[0] ?? 'text match'})`)
} else {
  console.log('w4-r2 form: no TextAreaFieldModel / Model class not-found text on the edit surface ✓')
}
const noteLabel = await page.getByText('判定说明', { exact: true }).count()
if (noteLabel === 0) {
  failures.push('判定说明 label not found on the edit form')
} else {
  console.log(`w4-r2 form: 判定说明 label rendered (${String(noteLabel)} hit) ✓`)
}
const noteInput = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('label')]
  const hit = labels.find(label => (label.textContent ?? '').includes('判定说明'))
  if (hit === undefined) return false
  // The label and the control sit in separate children of the form item —
  // scope the search to the enclosing .ant-form-item, not the label's own div.
  const container = hit.closest('.ant-form-item') ?? hit.parentElement
  return container?.querySelector('input, textarea') !== null && container?.querySelector('.ant-form-item-explain-error') === null
})
if (!noteInput) {
  failures.push('判定说明 renders without a working input control (or with a form error)')
} else {
  console.log('w4-r2 form: 判定说明 carries a working input control, no field error ✓')
}
const redErrors = await page.evaluate(() => [...document.querySelectorAll('.ant-form-item-explain-error, .ant-result-error, [style*="color: red"], [style*="color:red"]')].map(el => (el.textContent ?? '').trim()).filter(text => text.length > 0))
if (redErrors.length > 0) {
  failures.push(`form surface carries red error text: ${redErrors.slice(0, 5).join(' | ')}`)
} else {
  console.log('w4-r2 form: zero red error nodes on the edit surface ✓')
}

await page.screenshot({ path: OUT, fullPage: false })
console.log(`console errors (${String(consoleErrors.length)}):`)
for (const line of [...new Set(consoleErrors)].slice(0, 10)) console.log(`  ${line}`)

await browser.close()
if (failures.length > 0) {
  console.error(`w4-r2 form forensics FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exitCode = 1
} else {
  console.log(`w4-r2 form forensics: OK — shot at ${OUT}`)
}
