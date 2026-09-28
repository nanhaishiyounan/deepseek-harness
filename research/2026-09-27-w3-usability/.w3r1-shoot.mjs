// W3-R1 终端取证截图：strict 档三终端（?token=）+ 401 对照。
// Run: node --import tsx/esm research/2026-09-27-w3-usability/.w3r1-shoot.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const OUT = 'research/2026-09-27-w3-usability'
const B = 'http://127.0.0.1:13110'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 480, height: 900 } })

// strict 档三终端：?token= 全链路（页面 + api header + CSS token）
for (const [name, url] of [
  ['w3-r1-strict-report.png', `${B}/terminals/report.html?token=test123`],
  ['w3-r1-strict-inspect.png', `${B}/terminals/inspect.html?token=test123`],
  ['w3-r1-strict-receive.png', `${B}/terminals/receive.html?token=test123`],
]) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}` })
  const stored = await page.evaluate(() => localStorage.getItem('w3-terminal-token'))
  console.log(`${name}: token stored=${String(stored)}, queue=${(await page.locator('#queue').innerText()).slice(0, 40).replace(/\n/g, ' ')}`)
}

// 无 token 打开：页面本身 401（服务端响应体进不了页面——文本态取证）
const resp = await page.goto(`${B}/terminals/receive.html`, { waitUntil: 'load' }).catch(() => null)
console.log(`no-token page load: status=${String(resp ? resp.status() : 'ERR')}`)

await browser.close()
console.log('W3-R1 strict screenshots done')
