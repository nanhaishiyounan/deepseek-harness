import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav[aria-label="主导航"]', { timeout: 15000 })
await page.waitForTimeout(1500)

// All textareas with placeholders
const areas = await page.evaluate(() => [...document.querySelectorAll('textarea')].map(t => ({ placeholder: t.placeholder, visible: t.offsetParent !== null })))
console.log('TEXTAREAS:', JSON.stringify(areas))

// All buttons with aria-labels
const buttons = await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].map(b => ({ label: b.getAttribute('aria-label'), text: b.innerText.slice(0, 20), disabled: b.disabled })))
console.log('ARIA BUTTONS:', JSON.stringify(buttons, null, 1))

// Model selector interaction
await page.getByRole('button', { name: '选择模型', exact: false }).first().click().catch(e => console.log('model button click failed:', String(e).slice(0, 100)))
await page.waitForTimeout(900)
const afterClick = await page.evaluate(() => ({
  text: document.body.innerText.slice(0, 400),
  options: [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="listbox"] *')].slice(0, 20).map(el => el.textContent?.slice(0, 40)),
}))
console.log('AFTER MODEL CLICK body:', afterClick.text.replace(/\n/g, '|').slice(0, 300))
console.log('OPTION-LIKE NODES:', JSON.stringify(afterClick.options))
await page.screenshot({ path: 'research/2026-10-09-w24-rebuild/b2-lakehouse/.b2-probe-model.png' })
await browser.close()
