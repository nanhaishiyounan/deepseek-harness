import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
await page.getByRole('button', { name: '选择模型', exact: false }).first().click()
await page.waitForTimeout(1200)
// dump the last 25 elements of body plus any popup-like container
const dump = await page.evaluate(() => {
  const all = [...document.body.querySelectorAll('*')]
  const tail = all.slice(-40).map(el => ({ tag: el.tagName, role: el.getAttribute('role'), text: (el.textContent ?? '').slice(0, 60).replace(/\n/g, '|') }))
  return tail
})
console.log(JSON.stringify(dump, null, 0))
await page.screenshot({ path: 'research/2026-10-09-w24-rebuild/b2-lakehouse/.b2-probe-model3.png' })
await browser.close()
