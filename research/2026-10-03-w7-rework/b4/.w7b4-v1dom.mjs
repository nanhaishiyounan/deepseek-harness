// W7-B4 v1 页 DOM 结构探针：排产甘特/任务甘特/应用中心——抽取甘特/卡片类名与内联色，
// 为 globalStyle 定向包覆设计选择器。只读，不改任何数据。
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:13000'
const PAGES = [
  ['paichan-gantt', '96yet9a0x45'],
  ['renwu-gantt', 'zs3oqvlgqq0'],
  ['app-center', 'c9c6wzppejk'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(4000)

for (const [name, uid] of PAGES) {
  await page.goto(`${BASE}/admin/${uid}`)
  await page.waitForTimeout(3500)
  const report = await page.evaluate(() => {
    const out = { title: document.title, url: location.pathname, sections: [] }
    // main content area
    const main = document.querySelector('.ant-layout-content') ?? document.body
    const walk = (el, depth, lines) => {
      if (depth > 5 || lines.length > 90) return
      const cls = String(el.getAttribute('class') ?? '').trim().replace(/\s+/g, '.')
      const style = el.getAttribute('style') ?? ''
      const tag = el.tagName.toLowerCase()
      const interesting = cls.length > 0 || style.length > 0
      if (interesting) {
        const bg = getComputedStyle(el).backgroundColor
        lines.push(`${'  '.repeat(depth)}<${tag} class="${cls.slice(0, 120)}"${style ? ` style="${style.slice(0, 90)}"` : ''}${bg !== 'rgba(0, 0, 0, 0)' ? ` bg=${bg}` : ''}>`)
      }
      for (const child of el.children) walk(child, depth + (interesting ? 1 : 0), lines)
    }
    const lines = []
    walk(main, 0, lines)
    out.sections = lines
    // collect distinct class tokens containing likely keywords
    const tokens = new Set()
    for (const el of main.querySelectorAll('[class]')) {
      for (const c of String(el.getAttribute('class')).split(/\s+/)) {
        if (/gantt|bar|today|task|lane|grid|header|cell|column|row|card|app|timeline|scale|ruler|marker|week|day/i.test(c)) tokens.add(c)
      }
    }
    out.tokens = [...tokens].slice(0, 80)
    // element counts
    out.counts = {
      div: main.querySelectorAll('div').length,
      table: main.querySelectorAll('table').length,
      svg: main.querySelectorAll('svg').length,
      canvas: main.querySelectorAll('canvas').length,
    }
    return out
  })
  console.log(`════ ${name} (${uid}) ════`)
  console.log(JSON.stringify(report.counts), 'tokens:', report.tokens.join(' '))
  console.log(report.sections.slice(0, 70).join('\n'))
  console.log()
}
await browser.close()
