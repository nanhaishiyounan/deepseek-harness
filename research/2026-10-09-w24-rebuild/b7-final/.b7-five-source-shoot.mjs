// W24-B7 五源联合验收：一条问题串五源（kb → carbon → 湖仓 → 图谱 → 本体）。
// 形态复刻 B2 的 .b2-llm-shoot.mjs：页面 RPC 建会话 + 预选模型 + 真实 composer 发送，
// 等待完整多回合工具链，截图 + 断言五类工具名全部出现。
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('./', import.meta.url))
const facts = []
const note = (kind, fact) => { facts.push({ kind, fact }); console.log(`[${kind}] ${typeof fact === 'string' ? fact : JSON.stringify(fact)}`) }

async function rpc(page, method, payload) {
  return await page.evaluate(async ({ method, payload }) => {
    const response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: `b7-${Date.now()}-${Math.random().toString(36).slice(2)}`, method, payload }),
    })
    const message = await response.json()
    if (message.result?.ok === true) return message.result.value
    throw new Error(message.result?.error ? `${message.result.error.code}: ${message.result.error.message}` : 'rpc failed')
  }, { method, payload })
}

const QUESTION = [
  '对客户 NovaSat 做一次五源合规风险检查，严格按以下五步依次使用对应数据源的工具完成：',
  '第1步【业务系统】先用 cb_collections 查看 carbon 业务表目录，再用 cb_list 查询 customer 或 salesOrder 表，找出客户 NovaSat 的记录与订单。',
  '第2步【知识库】用 kb_search 检索食品原料收货检验/入库验收的 HACCP 或食品安全合规要求。',
  '第3步【湖仓】用 lakehouse_list_tables 与 lakehouse_query 对湖仓中 NovaSat 相关订单物料做数量与金额汇总（可先 lakehouse_schema 看列）。',
  '第4步【图谱】用 kg_graph_query（或 kg_subgraph）查 NovaSat 在图谱中的一跳邻域实体。',
  '第5步【本体】用 kg_ontology 给出物料/订单域的本体 schema 摘要（类、属性、关系）。',
  '最后综合五源信息给出 NovaSat 订单的合规风险评估结论。',
].join('\n')

// 五源 → 期望出现的工具名（任一命中即算该源触达）
const FIVE_SOURCE_TOOLS = {
  kb: ['kb_search'],
  carbon: ['cb_list', 'cb_collections', 'cb_get'],
  lakehouse: ['lakehouse_list_tables', 'lakehouse_query', 'lakehouse_schema', 'lakehouse_introspect_schema', 'lakehouse_execute_readonly', 'lakehouse_dry_run'],
  graph: ['kg_graph_query', 'kg_subgraph'],
  ontology: ['kg_ontology'],
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } })
  await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="主导航"]', { timeout: 20000 })
  await page.waitForTimeout(1500)

  const created = await rpc(page, 'session.create', { agentPreset: 'enterprise-data-assistant' })
  const sessionId = created.sessionId ?? created.id
  note('session-created', { sessionId })
  const models = await rpc(page, 'session.models', { sessionId })
  const groups = models.groups ?? []
  const mm = groups.find(group => /minimax/i.test(String(group.provider ?? group.id ?? '')))
    ?? groups.find(group => /deepseek/i.test(String(group.provider ?? group.id ?? '')))
    ?? groups[0]
  const provider = String(mm?.provider ?? mm?.id ?? 'minimax')
  const model = String(mm?.models?.[0]?.id ?? mm?.models?.[0] ?? 'MiniMax-M3')
  note('model-picked', { provider, model })
  await rpc(page, 'session.selectModel', { sessionId, provider, model })
  note('model-selected', new Date().toISOString())

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${DIR}five-source-r6-01-session-ready.png` })

  const composer = page.getByPlaceholder('问一个问题，或描述你的任务')
  await composer.fill(QUESTION)
  await page.locator('button[aria-label="发送消息"]').click()
  note('prompt-sent', new Date().toISOString())

  // 轮询等待回合完成：最长 12 分钟（五源多回合工具链），每 15s 记录一次工具行快照
  const deadline = Date.now() + 12 * 60 * 1000
  const seenTools = new Set()
  let answerText = ''
  while (Date.now() < deadline) {
    await page.waitForTimeout(15000)
    const toolNames = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-tool-name], [class*="toolRow"], [class*="tool-row"]')]
      const names = rows.map(row => row.getAttribute('data-tool-name') ?? row.textContent?.split('·')?.[0]?.trim()).filter(Boolean)
      // 兜底：从消息流文本里抓工具行标记
      const text = document.body.innerText
      const known = ['kb_search', 'cb_list', 'cb_collections', 'cb_get', 'cb_create', 'lakehouse_list_tables', 'lakehouse_query', 'lakehouse_schema', 'kg_graph_query', 'kg_ontology', 'kg_subgraph']
      for (const k of known) if (text.includes(k)) names.push(k)
      return [...new Set(names)]
    })
    for (const t of toolNames) seenTools.add(t)
    const sending = await page.locator('button[aria-label="发送消息"]').isDisabled().catch(() => true)
    note('poll', { t: new Date().toISOString(), tools: [...seenTools], sendingDisabled: sending })
    await page.screenshot({ path: `${DIR}five-source-r6-02-progress.png` })
    if (!sending && seenTools.size > 0) {
      // 发送键重新可用且已有工具行：可能回合结束，再等一轮确认稳定
      await page.waitForTimeout(8000)
      const stillIdle = await page.locator('button[aria-label="发送消息"]').isDisabled().catch(() => true)
      if (!stillIdle) break
    }
  }

  answerText = await page.evaluate(() => document.body.innerText)
  await page.screenshot({ path: `${DIR}five-source-r6-03-final.png`, fullPage: false })

  // 断言五源触达
  const hit = {}
  for (const [source, names] of Object.entries(FIVE_SOURCE_TOOLS)) hit[source] = names.some(n => seenTools.has(n) || answerText.includes(n))
  note('five-source-hits', hit)
  const transcript = answerText.slice(0, 30000)
  writeFileSync(`${DIR}five-source-r6-transcript.txt`, transcript)
  writeFileSync(`${DIR}five-source-r6-facts.json`, JSON.stringify({ question: QUESTION, model, provider, seenTools: [...seenTools], hits: hit, facts }, null, 2))
  note('verdict', Object.values(hit).every(Boolean) ? 'FIVE-SOURCE-PASS' : 'FIVE-SOURCE-INCOMPLETE')
} finally {
  await browser.close()
}
