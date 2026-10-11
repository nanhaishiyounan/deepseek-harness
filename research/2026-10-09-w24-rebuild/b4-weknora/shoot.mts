/**
 * Screenshot helper for the B4 evidence set: one Playwright chromium pass
 * over the live dsh web + the WeKnora admin UI.
 * Usage: node --import tsx/esm research/2026-10-09-w24-rebuild/b4-weknora/shoot.mts
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
mkdirSync(HERE, { recursive: true })

const targets: Array<{ name: string, url: string, wait: string }> = [
  { name: 'llm-halal-session', url: 'http://127.0.0.1:3080/', wait: 'text=Halal 认证流程' },
  { name: 'ui-kb-workbench', url: 'http://127.0.0.1:3080/', wait: 'text=食品产业知识库问答' },
  { name: 'weknora-admin-login', url: 'http://localhost:18080/', wait: 'load' },
]

const browser = await chromium.launch()
for (const target of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  try {
    await page.waitForSelector(target.wait === 'load' ? 'body' : target.wait, { timeout: 15_000 })
  } catch {
    // Best effort: shoot whatever rendered.
  }
  await page.waitForTimeout(2_500)
  await page.screenshot({ path: `${HERE}/${target.name}.png`, fullPage: false })
  console.log(`shot ${target.name}`)
  await page.close()
}
await browser.close()
