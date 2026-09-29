/**
 * W4-R3 forensics (supersedes the R2 single-line acceptance in this same
 * script): open the 质检单 edit form and prove the textarea fields (判定说明
 * etc.) render as multiline <textarea> controls — the registered
 * TextareaFieldModel replayed live by w4-r3-fix.mts after R2's
 * InputFieldModel single-line stopgap. A relapse to either the capital-A
 * TextAreaFieldModel (unregistered red error) or back to the single-line
 * <input> fails the run. Admin session: the model-registry behavior is
 * role-independent; qc_inspector sees the same form.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r2-form-browser.mts
 */
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../../platform/nocobase/package.json', import.meta.url))
const { chromium } = require('playwright')

const OUT = 'research/2026-09-28-w4-completeness/w4-r3-qc-form-edit.png'
const PAGE_URL = 'http://127.0.0.1:13000/admin/w8qmjvyv8p5j7j'
const failures: string[] = []
const consoleErrors: string[] = []

const browser = await chromium.launch({ channel: 'chrome' })
try {
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

  // Acceptance 1: the form surface carries no unregistered-model error text.
  const bodyText = await page.evaluate(() => document.body.innerText)
  if (bodyText.includes('TextAreaFieldModel') || /Model class .* not found/i.test(bodyText)) {
    failures.push(`form renders an unregistered-model error (${bodyText.match(/.{0,40}(TextAreaFieldModel|Model class[^\n]{0,60})/)?.[0] ?? 'text match'})`)
  } else {
    console.log('w4-r3 form: no TextAreaFieldModel / Model class not-found text on the edit surface ✓')
  }
  const noteLabel = await page.getByText('判定说明', { exact: true }).count()
  if (noteLabel === 0) {
    failures.push('判定说明 label not found on the edit form')
  } else {
    console.log(`w4-r3 form: 判定说明 label rendered (${String(noteLabel)} hit) ✓`)
  }

  // Acceptance 2: the control behind 判定说明 is a real <textarea>, not the
  // R2 stopgap's single-line <input>. The tagName is asserted explicitly so
  // an InputFieldModel relapse cannot pass as "a working control".
  const controlShape = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')]
    const hit = labels.find(label => (label.textContent ?? '').includes('判定说明'))
    if (hit === undefined) return { found: false, tagName: null, hasFieldError: false }
    // The label and the control sit in separate children of the form item —
    // scope the search to the enclosing .ant-form-item, not the label's own div.
    const container = hit.closest('.ant-form-item') ?? hit.parentElement
    const control = container?.querySelector('input, textarea') ?? null
    return {
      found: control !== null,
      tagName: control === null ? null : control.tagName,
      hasFieldError: container?.querySelector('.ant-form-item-explain-error') !== null,
    }
  })
  if (!controlShape.found || controlShape.tagName !== 'TEXTAREA') {
    failures.push(`判定说明 does not render a multiline <textarea> control (got ${controlShape.found ? String(controlShape.tagName) : 'no control in the form item'})`)
  } else {
    console.log('w4-r3 form: 判定说明 renders a <textarea> control (multiline model, not the single-line stopgap) ✓')
  }
  if (controlShape.hasFieldError) {
    failures.push('判定说明 form item carries a field error node')
  }

  // Acceptance 3: the control accepts multiline content a single-line input
  // cannot hold — type two lines through the real keyboard path and read
  // the value back.
  const noteTextarea = page.locator('.ant-form-item').filter({ hasText: '判定说明' }).locator('textarea').first()
  if (await noteTextarea.count() === 0) {
    failures.push('判定说明 textarea not reachable for the typing check')
  } else {
    await noteTextarea.fill('R3 取证第一行\nR3 取证第二行')
    const typed = await noteTextarea.inputValue()
    if (!typed.includes('\n')) {
      failures.push('判定说明 textarea did not hold multiline content')
    } else {
      console.log('w4-r3 form: 判定说明 accepts multiline input (newline round-trips) ✓')
    }
  }

  const redErrors = await page.evaluate(() => [...document.querySelectorAll('.ant-form-item-explain-error, .ant-result-error, [style*="color: red"], [style*="color:red"]')].map(el => (el.textContent ?? '').trim()).filter(text => text.length > 0))
  if (redErrors.length > 0) {
    failures.push(`form surface carries red error text: ${redErrors.slice(0, 5).join(' | ')}`)
  } else {
    console.log('w4-r3 form: zero red error nodes on the edit surface ✓')
  }

  await page.screenshot({ path: OUT, fullPage: false })
  console.log(`console errors (${String(consoleErrors.length)}):`)
  for (const line of [...new Set(consoleErrors)].slice(0, 10)) console.log(`  ${line}`)
} finally {
  await browser.close()
}
if (failures.length > 0) {
  console.error(`w4-r3 form forensics FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exitCode = 1
} else {
  console.log(`w4-r3 form forensics: OK — multiline textarea + no red error, shot at ${OUT}`)
}
