// W23-B0 audit pass 2: real-model chat scenarios (buyer). Collects per
// scenario the full session history (tool-call chain, present_card payloads,
// assistant texts), the rendered DOM cards (report titles/actions, fold
// notices), the session title, and screenshots — the evidence pack for the
// user-named issues (empty reports, templated titles, dead card buttons).
// Usage: node demos/acceptance-w23/w23-chat.mjs [--only c1,c2,...]
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w23'
const RUNS = `${OUT}/w23-chat-runs.jsonl`
mkdirSync(OUT, { recursive: true })
const TURN_TIMEOUT_MS = 300_000
const POLL_MS = 6_000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w23-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}
const historyEvents = async (sid) => {
  const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
  return (value?.events ?? []).map((entry) => entry?.event ?? entry).filter(Boolean)
}
const analyzeTurn = (events) => {
  const facts = { turnEnds: 0, presentCards: [], assistantTexts: [], toolCalls: [], toolResults: 0, fenceLeak: false }
  const cardCallIds = new Set()
  for (const e of events) {
    if (e?.type === 'tool/call' && e.data?.name === 'present_card') cardCallIds.add(e.data.callId)
  }
  for (const e of events) {
    const t = e?.type
    if (t === 'turn/end') facts.turnEnds++
    if (t === 'tool/call') {
      let args
      try { args = JSON.parse(e.data.arguments) } catch { args = undefined }
      facts.toolCalls.push({ name: e.data.name, args, turn: e.data.turn })
      if (e.data.name === 'present_card') facts.presentCards.push({ type: args?.payload?.type, payload: args?.payload, turn: e.data.turn })
    }
    if (t === 'tool/result') facts.toolResults++
    if (t === 'assistant/message') {
      for (const c of e.data?.message?.content ?? []) {
        if (c.type === 'text' && c.text !== '') { facts.assistantTexts.push({ turn: e.data.turn, text: c.text }); if (c.text.includes('```dsh')) facts.fenceLeak = true }
      }
    }
  }
  return facts
}

const SCENARIOS = {
  c1: { preset: 'business-advisor', input: '这个月经营情况怎么样？给我出一份月报' },
  c2: { preset: 'enterprise-data-assistant', input: '查看我最近30天的采购订单' },
  c3: { preset: 'business-advisor', input: '糯米粉的库存还剩多少？库存上有什么风险吗' },
  c4: { preset: 'enterprise-data-assistant', input: '我有哪些待审批的单子？' },
  c5: { preset: undefined, input: '今天寒露，这个节气有什么讲究？' },
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : Object.keys(SCENARIOS)
const browser = await chromium.launch()
for (const key of only) {
  const sc = SCENARIOS[key]
  if (sc === undefined) continue
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
  await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  const created = await rpc('session.create', sc.preset === undefined ? {} : { agentPreset: sc.preset })
  const sid = created.sessionId
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
  await page.getByPlaceholder('问我任何经营问题...').fill(sc.input)
  await page.getByRole('button', { name: '发送' }).click()
  console.log(`[${key}] sent: ${sc.input} (sid=${sid})`)
  let facts = { turnEnds: 0 }
  const deadline = Date.now() + TURN_TIMEOUT_MS
  while (Date.now() < deadline) {
    facts = analyzeTurn(await historyEvents(sid))
    if (facts.turnEnds >= 1) break
    await sleep(POLL_MS)
  }
  await sleep(2500)
  const dom = await page.evaluate(() => {
    const vis = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cards = [...document.querySelectorAll('[data-testid="report-card"]')].map((c) => ({
      title: c.querySelector('[class*="reportTitle"]')?.textContent ?? null,
      subtitle: c.querySelector('[class*="reportSubtitle"]')?.textContent ?? null,
      metrics: [...c.querySelectorAll('[class*="metricMini"]')].map((m) => vis(m)),
      actions: [...c.querySelectorAll('button')].map((b) => ({ text: vis(b), fontSize: getComputedStyle(b).fontSize, height: Math.round(b.getBoundingClientRect().height) })),
    }))
    const folds = [...document.querySelectorAll('main *')].filter((el) => el.children.length === 0 && /已折叠|格式异常|无法呈现/.test(el.textContent ?? '')).map((el) => vis(el))
    return { hash: location.hash, cards, folds, bodyText: vis(document.querySelector('main') ?? document.body).slice(0, 1200) }
  })
  await page.screenshot({ path: `${OUT}/w23-chat-${key}.png`, fullPage: true })
  const list = await rpc('session.list', {})
  const summary = (list?.sessions ?? []).find((s) => s.sessionId === sid)
  const record = {
    key, preset: sc.preset ?? '(default)', input: sc.input, sid,
    timedOut: facts.turnEnds < 1,
    turnEnds: facts.turnEnds, toolCalls: facts.toolCalls.map((c) => c.name),
    nbQueries: facts.toolCalls.filter((c) => c.name.startsWith('nb_') || c.name.startsWith('lakehouse') || c.name.startsWith('kb_')).map((c) => ({ name: c.name, args: JSON.stringify(c.args).slice(0, 300) })),
    presentCards: facts.presentCards.map((c) => ({ type: c.type, payload: c.payload })),
    assistantTexts: facts.assistantTexts.map((a) => a.text.slice(0, 400)),
    fenceLeak: facts.fenceLeak,
    sessionTitle: summary?.projections?.values?.title ?? summary?.title ?? null,
    blank: summary?.blank, dom,
  }
  appendFileSync(RUNS, JSON.stringify(record) + '\n')
  console.log(`[${key}] done: tools=${record.toolCalls.join(',')} cards=${record.presentCards.map((c) => c.type).join('|')} title=${JSON.stringify(record.sessionTitle)} folds=${dom.folds.length}`)
  await page.close()
}
await browser.close()
console.log('DONE chat scenarios')
