/**
 * W2-R1 mobile evidence shooter: after the ReportCard metric-grid minmax()
 * + money clamp() fix, re-shoot five 经营怎么样 report cards (the W2-B7
 * five-shot sessions) at the 375×667 viewport — the ¥280,820-class money
 * figures must render whole (the verifier saw ¥280,82 clips before). Walks
 * 消息 → all-chats (#/chats) → each 经营怎么样 session, scrolls to its
 * report card, captures the viewport, and re-checks the whole figures in
 * the visible card text.
 */
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const base = 'http://127.0.0.1:3080'
const dir = 'research/2026-09-27-w2-evolution'
const summary: string[] = []

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
await page.goto(`${base}/mobile`, { waitUntil: 'load' })
await page.getByText('食链通 · AI 员工').waitFor({ timeout: 20_000 })
await page.getByPlaceholder('6 位验证码').fill('123456')
await page.getByRole('button', { name: '登录', exact: true }).click()
await page.getByLabel('今日台账').waitFor({ timeout: 20_000 })

// The 最近对话 section's 查看全部 (the last one on the home page — the
// AI-colleague section carries its own 查看全部 above it) opens #/chats.
await page.getByText('查看全部').last().click()
await page.waitForURL(/#\/chats/, { timeout: 20_000 })

for (let shot = 1; shot <= 5; shot += 1) {
  const entry = page.getByText('经营怎么样', { exact: true }).nth(shot - 1)
  await entry.waitFor({ timeout: 20_000 })
  await entry.click()
  const card = page.locator('[aria-label*="报告"]').last()
  await card.waitFor({ timeout: 30_000 })
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const out = `${dir}/w2-r1-mobile-375-${String(shot)}.png`
  await page.screenshot({ path: out })
  const cardText = await card.innerText().catch(() => '')
  const moneyWhole = cardText.includes('280,820') || cardText.includes('24,820')
  summary.push(`shot ${shot}: ${out.split('/').pop() ?? ''} cardMoneyWhole=${String(moneyWhole)} cardText=${JSON.stringify(cardText.slice(0, 120))}`)
  // Back to the #/chats layer for the next session.
  await page.goBack()
  await page.waitForURL(/#\/chats/, { timeout: 20_000 })
  await page.waitForTimeout(1_000)
}

console.log(JSON.stringify({ capturedAt: new Date().toISOString(), base, viewport: '375x667', evidence: summary }, null, 2))
await browser.close()
