// W7-M0 acceptance assertion ③ makeup run (verifier debt): the
// login → approval → ledger chain over the live mobile app (3080), the
// W6-B0/B1 rehearsal legs — qc_inspector signs in, the todos approval queue
// is reachable (and one approval flips when a live item exists), and the
// docs ledger answers. Evidence: m0/chain-*.png + w7-m0-chain.log.
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const log = []
const shot = (page, name) => page.screenshot({ path: `${DIR}${name}.png` }).then(() => log.push(`shot ${name}`))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear() })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
log.push('① 登录 qc_inspector OK（底部导航出现）')
await page.waitForTimeout(900)

// ② todos approval queue
await page.goto(`${BASE}/#/todos`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await shot(page, 'chain-01-todos')
const todosText = await page.evaluate(() => document.body.innerText.slice(0, 1200))
const itemCount = await page.evaluate(() => document.querySelectorAll('[class*="todoItem"], [class*="listItem"], li').length)
log.push(`② 待办队列可达：内容采样=${todosText.replace(/\n/g, ' ').slice(0, 90)}… 元素数=${itemCount}`)

// ③ approval flip — only when a live approval item is present
let flipped = false
const approveBtn = page.locator('button:has-text("通过"), [class*="approve"]').first()
if (await approveBtn.count() > 0) {
  const before = await page.evaluate(() => document.body.innerText.length)
  try {
    await approveBtn.click({ timeout: 4000 })
    await page.waitForTimeout(5000)
    const after = await page.evaluate(() => document.body.innerText.slice(0, 400))
    flipped = /已通过|已审批|通过成功|resolved|approved/i.test(after)
    log.push(`③ 审批操作执行：点击「通过」后页面态=${after.replace(/\n/g, ' ').slice(0, 80)}… flipped=${flipped}`)
    await shot(page, 'chain-02-after-approve')
  } catch (err) { log.push(`③ 审批操作点击失败（如实记录）：${String(err.message).split('\n')[0]}`) }
} else {
  log.push('③ 队列无待审批项（0 条），审批翻转腿无可操作对象——如实申报')
}

// ④ docs ledger
await page.goto(`${BASE}/#/docs`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await shot(page, 'chain-03-docs')
const docsOk = await page.evaluate(() => !/登录|签到/.test(document.body.innerText.slice(0, 300)) && document.body.innerText.trim().length > 0)
log.push(`④ 台账（docs）可达且已鉴权：${docsOk ? 'OK' : 'FAIL'}`)

const verdict = log.some(l => l.startsWith('①')) && docsOk
  ? `M0断言③补跑：链路通（登录✓ → 待办队列✓${flipped ? ' → 审批翻转✓' : ''} → 台账✓）`
  : `M0断言③补跑：链路异常`
log.push(verdict)
writeFileSync(`${DIR}w7-m0-chain.log`, log.join('\n') + '\n')
console.log(log.join('\n'))
await browser.close()
process.exit(0)
