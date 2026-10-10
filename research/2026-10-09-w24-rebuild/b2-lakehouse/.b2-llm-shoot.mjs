// W24-B2 LLM 实跑取证：页面 RPC 创建会话并预选 deepseek 模型（绕开空会话的
// “选择模型” popupSelect 缺陷），再经真实 composer 发送，等待工具链回合完成。
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('./', import.meta.url))
const facts = []
const note = (kind, fact) => { facts.push({ kind, fact }); console.log(`[${kind}] ${typeof fact === 'string' ? fact : JSON.stringify(fact)}`) }

/** One unary RPC from inside the page (same-origin fetch). */
async function rpc(page, method, payload) {
  return await page.evaluate(async ({ method, payload }) => {
    const response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: `b2-${Date.now()}-${Math.random().toString(36).slice(2)}`, method, payload }),
    })
    const message = await response.json()
    if (message.result?.ok === true) return message.result.value
    throw new Error(message.result?.error ? `${message.result.error.code}: ${message.result.error.message}` : 'rpc failed')
  }, { method, payload })
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="主导航"]', { timeout: 15000 })
  await page.waitForTimeout(1500)

  // ── 1. Create the session on the enterprise preset, then select a model ──
  const created = await rpc(page, 'session.create', { agentPreset: 'enterprise-data-assistant' })
  note('session-created', { sessionId: created.sessionId ?? created.id ?? Object.keys(created) })
  const sessionId = created.sessionId ?? created.id
  const models = await rpc(page, 'session.models', { sessionId })
  note('model-catalog-raw', JSON.stringify(models).slice(0, 600))
  const groups = models.groups ?? []
  const deepseek = groups.find(group => /deepseek/i.test(String(group.provider ?? group.id ?? ''))) ?? groups[0]
  const modelEntry = deepseek?.models?.[0]
  const provider = String(deepseek?.provider ?? deepseek?.id ?? 'deepseek-official')
  const model = String(modelEntry?.id ?? modelEntry?.model ?? modelEntry ?? 'deepseek-chat')
  note('model-picked', { provider, model })
  await rpc(page, 'session.selectModel', { sessionId, provider, model })
  note('model-selected', new Date().toISOString())

  // ── 2. Reload, open the fresh session, send the lakehouse question ──────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${DIR}09-chat-model-selected.png` })

  const composer = page.getByPlaceholder('问一个问题，或描述你的任务')
  await composer.fill('帮我查一下湖仓：legacy_nocobase 里销售订单行表 so_order_lines 一共有多少行，数量字段 qty 的总和是多少？请用 lakehouse 工具查询。')
  const send = page.locator('button[aria-label="发送消息"]')
  note('send-enabled-before-click', await send.isEnabled())
  await send.click()
  note('prompt-sent', new Date().toISOString())

  let turnText = ''
  let sawTool = false
  for (let i = 0; i < 50; i += 1) {
    await page.waitForTimeout(3000)
    turnText = await page.evaluate(() => document.body.innerText)
    if (turnText.includes('lakehouse_list_tables') || turnText.includes('lakehouse_query') || turnText.includes('lakehouse_schema')) sawTool = true
    const sendAgain = await page.locator('button[aria-label="发送消息"]').isEnabled().catch(() => false)
    if (sawTool && sendAgain) {
      await page.waitForTimeout(3000)
      turnText = await page.evaluate(() => document.body.innerText)
      break
    }
  }
  note('llm-tool-chain-visible', sawTool)
  note('llm-answer-mentions-rows-12', turnText.includes('12'))
  note('llm-answer-mentions-total-34670', turnText.includes('34670'))
  await page.screenshot({ path: `${DIR}10-llm-session-toolchain.png`, fullPage: true })
  writeFileSync(`${DIR}11-llm-session-transcript.txt`, turnText)
  note('transcript-written', `${DIR}11-llm-session-transcript.txt`)
  const toolLines = turnText.split('\n').filter(line => /lakehouse|so_order_lines|34670/i.test(line)).slice(0, 24)
  note('tool-lines', toolLines)
} finally {
  await browser.close()
  writeFileSync(`${DIR}b2-llm-shoot-facts.json`, `${JSON.stringify(facts, null, 2)}\n`)
  console.log('facts written')
}
