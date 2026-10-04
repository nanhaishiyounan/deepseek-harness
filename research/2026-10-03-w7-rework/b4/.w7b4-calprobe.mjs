// 一次性：dump 任务日历事件元素真实样式（找事件 pill 的 DOM/样式特征）。
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:13000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(4000)
await page.goto(`${BASE}/admin/n17f1ns70eshqwy`)
await page.waitForTimeout(3500)
const dump = await page.evaluate(() => {
  const main = document.querySelector('.ant-layout-content') ?? document.body
  // find text-bearing strips whose background is non-white
  const hits = []
  for (const el of main.querySelectorAll('div,span,a')) {
    const cs = getComputedStyle(el)
    const bg = cs.backgroundColor
    const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(bg)
    if (m === null) continue
    const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
    if (a < 0.3) continue
    if (r > 246 && g > 246 && b > 246) continue // white-ish
    if (r === g && g === b) continue // gray scale
    const rect = el.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 6 || rect.height > 60) continue
    hits.push({
      tag: el.tagName.toLowerCase(), cls: String(el.getAttribute('class') ?? '').slice(0, 60),
      bg, w: Math.round(rect.width), h: Math.round(rect.height),
      text: (el.textContent ?? '').trim().slice(0, 18),
    })
  }
  return hits.slice(0, 25)
})
console.log(JSON.stringify(dump, null, 1))
await browser.close()
