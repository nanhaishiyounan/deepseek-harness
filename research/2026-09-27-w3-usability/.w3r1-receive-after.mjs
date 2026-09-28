// W3-R1 段3取证：收齐后 PO-B5-C 出队 + 终态队列（段1/段2 已过账，见引擎日志与 psql）。
// Run: node --import tsx/esm research/2026-09-27-w3-usability/.w3r1-receive-after.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const OUT = 'research/2026-09-27-w3-usability'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 480, height: 900 } })
await page.goto('http://127.0.0.1:13110/terminals/receive.html?operator=b4guard', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const still = await page.locator('.card', { hasText: 'PO-B5-C' }).count()
const queue = await page.locator('#queue').innerText()
console.log('PO-B5-C card after full receipt:', still === 0 ? 'gone（收齐出队）' : 'STILL PRESENT')
console.log('queue now:', queue.replace(/\n/g, ' | ').slice(0, 200))
if (still !== 0) throw new Error('段3 失败：收齐后卡片未消失')
await page.screenshot({ path: `${OUT}/w3-r1-receive-queue-after-received.png` })
await browser.close()
console.log('W3-R1 段3 OK')
