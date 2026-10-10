// W24-B1 单侧边栏（会话+功能同栏，豆包样式）真实实跑取证：
// 双宽度双主题首页 + 逐 nav 项点击路由核对 + 折叠 rail。产物落本目录。
//   node research/2026-10-09-w24-rebuild/b1-sidebar/.b1-shoot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:3080'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const assertions = []

function note(kind, fact) {
  assertions.push({ kind, fact })
  console.log(`[${kind}] ${typeof fact === 'string' ? fact : JSON.stringify(fact)}`)
}

const NAV_ITEMS = [
  { id: 'chat', aria: '对话', file: '06-nav-chat', view: 'chat' },
  { id: 'kb', aria: '知识库文档数', file: '07-nav-kb', view: 'kb' },
  { id: 'scenarios', aria: '场景', file: '08-nav-scenarios', view: 'scenarios' },
  { id: 'market', aria: '数据资产数', file: '09-nav-market', view: 'market' },
  { id: 'connectors', aria: '数据源数量', file: '10-nav-connectors', view: 'connectors' },
  { id: 'kg', aria: '图谱实体数量', file: '11-nav-kg', view: 'kg' },
  { id: 'business', aria: '业务对象数量', file: '12-nav-business', view: 'business' },
  { id: 'mobile-preview', aria: '移动端预览', file: '13-nav-mobile-preview', view: 'mobile-preview' },
]

async function settle(page) {
  // SSE 长连接常驻，networkidle 永不达成；固定等待覆盖插件加载与视图挂载。
  await page.waitForTimeout(1100)
}

const browser = await chromium.launch()
try {
  // ── 桌面 1600×1000 明色首页 ─────────────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="主导航"]', { timeout: 15000 })
  const nav = page.locator('nav[aria-label="主导航"]')
  note('nav-block-present', await nav.count() === 1)
  note('nav-items', await nav.locator('button').allInnerTexts())

  // 单侧边栏三栏几何（sidebar 280 居左，nav 菜单在 sidebar 内部）
  const tracks = await page.evaluate(() =>
    document.querySelector('[style*="grid-template-columns"]').style.gridTemplateColumns)
  note('frame-tracks', tracks)
  note('nav-inside-sidebar', await page.evaluate(() => {
    const sidebar = document.querySelector('[data-sidebar-collapsed], [style*="grid-template-columns"]')
    const menu = document.querySelector('nav[aria-label="主导航"]')
    return sidebar !== null && menu !== null && sidebar.contains(menu)
  }))

  await page.screenshot({ path: `${DIR}01-home-desktop-light.png` })

  // ── 暗色首页（body[data-ds-dark-theme] 即主题呈现器写入的真实暗色通道）──
  await page.evaluate(() => { document.body.setAttribute('data-ds-dark-theme', '') })
  await page.waitForTimeout(200)
  note('dark-attribute-applied', await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')))
  await page.screenshot({ path: `${DIR}02-home-desktop-dark.png` })
  await page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme') })

  // ── 折叠 rail：sidebar 自身的收起按钮（整列收 56px，nav 行变图标）──────
  await page.getByRole('button', { name: '收起侧栏', exact: false }).click().catch(async () => {
    await page.getByRole('button', { name: /收起|Collapse/ }).first().click()
  })
  await page.waitForTimeout(400)
  note('rail-tracks', await page.evaluate(() =>
    document.querySelector('[data-sidebar-collapsed]').style.gridTemplateColumns))
  await page.screenshot({ path: `${DIR}05-sidebar-rail-light.png` })
  await page.getByRole('button', { name: /打开侧边栏|Open sidebar/ }).first().click()
  await page.waitForTimeout(400)

  // ── 逐项点击 + 截图 + active 断言 ─────────────────────────────────────
  for (const item of NAV_ITEMS) {
    await page.getByRole('button', { name: item.aria, exact: false }).first().click()
    await settle(page)
    if (item.id === 'chat') {
      // 会话打开后 header 的 tab 环必须只剩 会话/轨迹 两枚。
      const ring = await page.locator('[role="tablist"] [role="tab"]').allInnerTexts()
      note('tab-ring-after-chat-open', ring)
    }
    const current = await page.evaluate(aria => {
      const nav = document.querySelector('nav[aria-label="主导航"]')
      const hit = [...nav.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').startsWith(aria))
      return hit ? hit.getAttribute('aria-current') : 'button-not-found'
    }, item.aria)
    note(`nav-active-${item.id}`, current)
    await page.screenshot({ path: `${DIR}${item.file}.png` })
  }
  await page.close()

  // ── 390×844 移动宽度（sidebar 自动收 rail）双主题 ──────────────────────
  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await narrow.goto(BASE, { waitUntil: 'domcontentloaded' })
  await narrow.waitForSelector('nav[aria-label="主导航"]', { timeout: 15000 })
  await settle(narrow)
  note('narrow-sidebar-collapsed-attr', await narrow.evaluate(() => !!document.querySelector('[data-sidebar-collapsed]')))
  note('narrow-tracks', await narrow.evaluate(() =>
    document.querySelector('[style*="grid-template-columns"]').style.gridTemplateColumns))
  await narrow.screenshot({ path: `${DIR}03-home-390-light.png` })
  await narrow.evaluate(() => { document.body.setAttribute('data-ds-dark-theme', '') })
  await narrow.waitForTimeout(200)
  await narrow.screenshot({ path: `${DIR}04-home-390-dark.png` })
  await narrow.close()
} finally {
  writeFileSync(`${DIR}b1-assertions.json`, JSON.stringify(assertions, null, 2))
  await browser.close()
}
console.log('B1 single-sidebar evidence captured.')
