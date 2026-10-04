// W7-B4 v1 甘特样式细探：关键类名的 inline style + computed 样式现值。
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:13000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(4000)

for (const [name, uid] of [['排产甘特', '96yet9a0x45'], ['任务甘特', 'zs3oqvlgqq0']]) {
  await page.goto(`${BASE}/admin/${uid}`)
  await page.waitForTimeout(3500)
  const report = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        inline: el.getAttribute('style'),
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute('class'),
        bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
        height: cs.height, fontSize: cs.fontSize, fontWeight: cs.fontWeight, position: cs.position,
      }
    }
    const counts = {}
    for (const c of ['bar', 'barLabelOutside', 'barLabel', 'barHandle', 'gridRowLine', 'gridTick', 'today', 'arrows', 'rowLines', 'rows', 'gridBody', 'ganttHeader', 'ganttBody']) {
      counts[c] = document.querySelectorAll(`.${c}`).length
    }
    const firstBar = document.querySelector('.bar')
    const barSample = firstBar ? {
      inline: firstBar.getAttribute('style'),
      childHtml: firstBar.outerHTML.slice(0, 400),
      bg: getComputedStyle(firstBar).backgroundColor,
    } : null
    const todayEl = document.querySelector('.today')
    return {
      counts,
      ganttHeader: pick('.ganttHeader'), gridBody: pick('.gridBody'), gridRowLine: pick('.gridRowLine'),
      gridTick: pick('.gridTick'), today: todayEl ? { ...pick('.today'), html: todayEl.outerHTML.slice(0, 300) } : null,
      rows: pick('.rows'), bar: barSample, barLabelOutside: pick('.barLabelOutside'),
      arrows: pick('.arrows'), ganttBody: pick('.ganttBody'),
    }
  })
  console.log(`════ ${name} ════`)
  console.log(JSON.stringify(report, null, 1))
}
await browser.close()
