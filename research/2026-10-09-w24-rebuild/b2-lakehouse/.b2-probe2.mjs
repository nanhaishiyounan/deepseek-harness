import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: '选择模型', exact: false }).first().click()
await page.waitForTimeout(1000)
const popup = await page.evaluate(() => {
  const popups = [...document.querySelectorAll('[role], .ds-popup, [data-popup]')].filter(el => el.offsetParent !== null && el.textContent && el.textContent.length < 2000)
  return popups.slice(-6).map(el => ({ role: el.getAttribute('role'), cls: el.className.slice?.(0, 60), text: el.textContent?.slice(0, 300).replace(/\n/g, '|') }))
})
console.log('POPUPS:', JSON.stringify(popup, null, 1))
await page.screenshot({ path: 'research/2026-10-09-w24-rebuild/b2-lakehouse/.b2-probe-model2.png' })
await browser.close()
