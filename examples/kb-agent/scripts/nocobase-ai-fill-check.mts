/**
 * H6 form-fill acceptance: open one v2 page's Add-new popup, click the dex
 * avatar ball, send a Chinese description, and dump the form values the AI
 * employee filled (plus a screenshot). Reusable across any page path.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-ai-fill-check.mts <path> <waitText> <outPng> <prompt>
 */
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../../platform/nocobase/package.json', import.meta.url))
const { chromium } = require('playwright')

const [, , pathArg, waitText, outPng, promptArg] = process.argv
if (pathArg === undefined || waitText === undefined || outPng === undefined || promptArg === undefined) {
  throw new Error('usage: ai-fill-check <path> <waitText> <outPng> <prompt>')
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:13000/signin', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder(/email|账号|用户名/i).or(page.locator('input[name="email"], input#email, input[type="text"]').first()).first().fill('admin@nocobase.com')
await page.locator('input[type="password"]').first().fill('admin123')
await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("登录")').first().click()
await page.waitForURL(url => !String(url).includes('signin'), { timeout: 30_000 })
await page.goto(`http://127.0.0.1:13000${pathArg}`, { waitUntil: 'domcontentloaded' })
await page.getByText(waitText).first().waitFor({ timeout: 45_000 })

await page.getByRole('button', { name: 'plus 添加' }).first().click()
await page.locator('[role="dialog"] .ant-avatar').first().waitFor({ timeout: 15_000 })
await page.waitForTimeout(1500)
await page.locator('[role="dialog"] .ant-avatar').first().click()
const chatBox = page.locator('[role="dialog"] textarea').last()
await chatBox.waitFor({ timeout: 15_000 })
await chatBox.fill(promptArg)
await chatBox.press('Enter')
// The dex fill streams through the formFiller tool; 40s covers a slow turn.
await page.waitForTimeout(40_000)
const formValues = await page.evaluate(() => {
  const form = document.querySelector('[role="dialog"] form')
  if (form === null) return {}
  const values: Record<string, string> = {}
  for (const input of form.querySelectorAll('input')) {
    const label = input.closest('.ant-form-item')?.querySelector('label')?.textContent ?? input.id ?? '?'
    if (input.value) values[label.slice(0, 20)] = input.value.slice(0, 50)
  }
  for (const combo of form.querySelectorAll('.ant-select-selection-item')) {
    const label = combo.closest('.ant-form-item')?.querySelector('label')?.textContent ?? '?'
    values[label.slice(0, 20)] = combo.textContent ?? ''
  }
  return values
})
await page.screenshot({ path: outPng })
console.log(`filled ${Object.keys(formValues).length} fields → ${JSON.stringify(formValues)}`)
console.log(`screenshot → ${outPng}`)
await browser.close()
