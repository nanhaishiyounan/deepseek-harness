// W9-B3 design-direction mocks: render the six static 375px HTML mocks with a real
// headless browser and compose the 3-way comparison sheet (home row + chat row).
// Usage (repo root): node demos/acceptance-w9/.shoot-w9b3-mocks.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MOCK = resolve(HERE, 'mock')
const OUT = HERE

const CASES = ['d1', 'd2', 'd3']
const NAMES = {
  d1: 'D1 暖食工坊 · 酱园琥珀',
  d2: 'D2 晨检锐蓝 · 晨光仪表',
  d3: 'D3 墨纸编辑部 · 食谱书页',
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })

const shots = []
for (const c of CASES) {
  for (const view of ['home', 'chat']) {
    const file = resolve(MOCK, `${c}-${view}.html`)
    await page.goto(`file://${file}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250) // font settle
    const out = `${OUT}/w9-b3-${view === 'home' ? '02' : '03'}-${c}-${view}-mock-375.png`
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 375, height: 812 } })
    shots.push({ c, view, out, file })
    console.log(`shot ${c}-${view} -> ${out}`)
  }
}

// Comparison sheet: 3 columns (D1/D2/D3) x 2 rows (home/chat), labels above each column.
const cell = (abs, label, sub) => `
  <div class="cell">
    <div class="lab">${label}<span>${sub}</span></div>
    <img src="file://${abs}" width="375" height="812">
  </div>`
const rel = (view) => CASES.map((c) =>
  resolve(OUT, `w9-b3-${view === 'home' ? '02' : '03'}-${c}-${view}-mock-375.png`))
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #22262e; font-family: -apple-system, 'PingFang SC', sans-serif; padding: 28px; }
  .row { display: flex; gap: 28px; }
  .row + .row { margin-top: 28px; }
  .cell .lab { color: #fff; font-size: 15px; font-weight: 700; margin: 0 0 10px 2px; }
  .cell .lab span { color: #9aa4b2; font-weight: 500; font-size: 12px; margin-left: 10px; }
  img { display: block; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
</style></head><body>
  <div class="row">${rel('home').map((p, i) => cell(p, NAMES[CASES[i]], 'home · 375')).join('')}</div>
  <div class="row">${rel('chat').map((p, i) => cell(p, NAMES[CASES[i]], 'chat · 375')).join('')}</div>
</body></html>`
const sheetPath = resolve(OUT, 'w9-b3-01-sheet.html')
writeFileSync(sheetPath, sheet)

const page2 = await browser.newPage({ viewport: { width: 1309, height: 900 }, deviceScaleFactor: 2 })
await page2.goto(`file://${sheetPath}`, { waitUntil: 'networkidle' })
await page2.waitForFunction(() =>
  [...document.images].every((img) => img.complete && img.naturalWidth > 0), { timeout: 15_000 })
await page2.waitForTimeout(200)
await page2.screenshot({ path: resolve(OUT, 'w9-b3-01-design-directions.png'), fullPage: true })
console.log('shot comparison sheet -> w9-b3-01-design-directions.png')

await browser.close()
console.log('DONE')
