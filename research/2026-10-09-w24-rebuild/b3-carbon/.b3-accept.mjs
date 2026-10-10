/**
 * W24-B3 acceptance shooter: a fresh headless Chromium drives the live web
 * workbench through the three acceptance journeys and lands the PNG + network
 * evidence — (1) the LLM read journey (cb_collections → cb_list over the real
 * DeepSeek stream), (2) the LLM create journey (draft preview → go-ahead →
 * cb_create receipt), (3) the business page over the carbon domain with the
 * nocobase-read-path cut proven from the network log.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../..//node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const dir = 'research/2026-10-09-w24-rebuild/b3-carbon'
mkdirSync(dir, { recursive: true })
const lines = []
const log = (text) => { lines.push(text); console.log(text) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const rpc = []
page.on('response', async (response) => {
  const url = response.url()
  if (url.includes('/api/carbon.')) rpc.push(`${response.status()} ${url.replace(/^.*\/api\//, '')}`)
  if (url.includes('/api/nocobase.')) rpc.push(`NOCOBASE-LEAK ${response.status()} ${url.replace(/^.*\/api\//, '')}`)
})
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const ask = async (text) => {
  const box = page.locator('textarea').first()
  await box.fill(text)
  await box.press('Enter')
}

// ── Journey 1: read (customers count) ──────────────────────────────────────
await ask('碳系统（carbon ERP）里现在有多少个客户？请用 cb_list 查 customer 表后回答，列出前三个客户名。')
await page.waitForSelector('text=cb_list', { timeout: 90_000 })
await page.waitForSelector('text=NovaSat', { timeout: 60_000 }).catch(() => {})
await page.waitForTimeout(4_000)
await page.screenshot({ path: `${dir}/03-llm-cb-list-customers.png`, fullPage: true })
const answer1 = await page.locator('body').innerText()
log(`[j1] cb_list tool row visible: ${answer1.includes('cb_list')}`)
log(`[j1] customers answer names present: ${['NovaSat', 'Apex'].every(name => answer1.includes(name))}`)
log(`[j1] rpc carbon calls: ${rpc.filter(r => !r.startsWith('NOCOBASE')).join(', ')}`)

// ── Journey 2: create (item) with the confirmation contract ────────────────
rpc.length = 0
await ask('帮我在碳系统里新建一个物料：readableId 为 W24B3-AI-001，名称「AI 验收测试物料」，类型 Material，批次追踪。请先给我确认预览，我回复「确认」后再执行 cb_create。')
await page.waitForSelector('text=W24B3-AI-001', { timeout: 90_000 })
await page.waitForTimeout(2_000)
await page.screenshot({ path: `${dir}/04-llm-cb-create-preview.png`, fullPage: false })
log('[j2] draft preview rendered with the new item fields')
await ask('确认，请执行 cb_create')
await page.waitForSelector('text=cb_create', { timeout: 120_000 }).catch(() => {})
await page.waitForSelector('text=item_', { timeout: 60_000 }).catch(() => {})
await page.waitForTimeout(5_000)
await page.screenshot({ path: `${dir}/05-llm-cb-create-receipt.png`, fullPage: true })
const answer2 = await page.locator('body').innerText()
log(`[j2] cb_create receipt visible: ${answer2.includes('item_')}`)
log(`[j2] rpc carbon calls: ${rpc.filter(r => !r.startsWith('NOCOBASE')).join(', ')}`)

// ── Journey 3: the business page on carbon, nocobase path cut ─────────────
rpc.length = 0
await page.getByRole('button', { name: '业务管理' }).first().click()
await page.waitForTimeout(4_000)
await page.screenshot({ path: `${dir}/06-ui-business-carbon.png`, fullPage: true })
const answer3 = await page.locator('body').innerText()
log(`[j3] business page catalog tables visible: ${answer3.includes('销售订单')}`)
log(`[j3] carbon rpc during business page: ${rpc.filter(r => !r.startsWith('NOCOBASE')).join(', ') || '(cached seat)'}`)
log(`[j3] nocobase requests observed: ${rpc.filter(r => r.startsWith('NOCOBASE')).length}`)

writeFileSync(`${dir}/03-acceptance-run.txt`, `${lines.join('\n')}\n`)
await browser.close()
console.log('done')
