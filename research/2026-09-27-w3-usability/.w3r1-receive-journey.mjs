// W3-R1 行级跳过 + 续收收齐的 UI 取证（lenient 档；首收 300 已过账，本段续收 700）。
// Run: node --import tsx/esm research/2026-09-27-w3-usability/.w3r1-receive-journey.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const OUT = 'research/2026-09-27-w3-usability'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 480, height: 900 } })
await page.goto('http://127.0.0.1:13110/terminals/receive.html?operator=b4guard', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// PO-B5-C 卡片：进入收货（当前应为 partial 300/1000）
const card = page.locator('.card', { hasText: 'PO-B5-C' })
console.log('card before:', (await card.innerText()).replace(/\n/g, ' | '))
await card.locator('button', { hasText: '进入收货' }).click()
await page.waitForSelector('.receive-panel .reading')
const row = page.locator('.receive-panel .reading').first()
console.log('row before:', (await row.innerText()).replace(/\n/g, ' | '))

// 负例：勾选「跳过本行」→ 整行置灰禁用 → 验证收货被 UI 行级出口拦下（不发请求）
await row.locator('[data-kind="skip"]').check()
await page.waitForTimeout(300)
const grey = await row.evaluate(el => ({
  cls: el.className,
  lotDisabled: el.querySelector('[data-kind="lot"]').disabled,
  qtyDisabled: el.querySelector('[data-kind="qty"]').disabled,
}))
console.log('skipped row:', JSON.stringify(grey))
await page.screenshot({ path: `${OUT}/w3-r1-receive-skip-greyed.png` })
await page.locator('.receive-panel [data-act="verify"]').click()
await page.waitForTimeout(500)
const refused = await page.locator('#note').innerText()
console.log('empty-submit note:', refused.replace(/\n/g, ' '))
if (!refused.includes('没有可提交的收货行')) throw new Error('负例失败：空提交未被拦截')
await page.screenshot({ path: `${OUT}/w3-r1-receive-skip-empty-submit.png` })

// 段2：取消跳过 → 续收余量 700 → 收齐
await row.locator('[data-kind="skip"]').uncheck()
await page.waitForTimeout(300)
await row.locator('[data-kind="lot"]').fill('R1W3R1-02')
await row.locator('[data-kind="qty"]').fill('700')
await page.locator('.receive-panel [data-act="verify"]').click()
await page.waitForTimeout(2500)
const done = await page.locator('#note').innerText()
console.log('final note:', done.replace(/\n/g, ' '))
if (!done.includes('收货完成')) throw new Error('段2 失败：续收未成功')
await page.screenshot({ path: `${OUT}/w3-r1-receive-final-700.png` })

// 段3：收齐后卡片从待收队列消失
await page.waitForTimeout(1200)
await page.locator('#refresh').click()
await page.waitForTimeout(900)
const still = await page.locator('.card', { hasText: 'PO-B5-C' }).count()
console.log('PO-B5-C card after full receipt:', still === 0 ? 'gone（收齐出队）' : 'STILL PRESENT')
if (still !== 0) throw new Error('段3 失败：收齐后卡片未消失')
await page.screenshot({ path: `${OUT}/w3-r1-receive-queue-after-received.png` })

await browser.close()
console.log('W3-R1 receive journey OK')
