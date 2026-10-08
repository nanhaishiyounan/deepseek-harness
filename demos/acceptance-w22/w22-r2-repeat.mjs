// W22-R2 business-goal repeater: two-layer widget stability over the real gateway.
// Layer 1 (protocol): the session-log payload's declared widget per field (the R1 lane).
// Layer 2 (render): a headless browser opens the finished session and reads the
//   rendered controls — quantity/price/amount must hold input[inputmode=decimal],
//   date fields must hold the date trigger (MC-14口径).
// Probes: two P4 bypass prompts (the model is told to declare quantity/need_date
//   as text) plus the rejected-card probe (the form contract bounces revision 1;
//   the bounced call must render as the collapsed notice, never an interactive
//   card). usage: node w22-r2-repeat.mjs [--quick] [--from=N] [--lane=p4]
import pw from '../../apps/web/node_modules/playwright/index.js'
const { chromium } = pw

const BASE = 'http://127.0.0.1:3080'
const OUT_DIR = new URL('.', import.meta.url).pathname
const QUICK = process.argv.includes('--quick')

async function rpc(method, payload) {
  const rpcId = 'r_' + Math.random().toString(36).slice(2)
  const res = await fetch(`${BASE}/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  const json = await res.json()
  if (!json.result.ok) throw new Error(`${method}: ${json.result.error.code ?? ''} ${json.result.error.message}`)
  return json.result.value
}

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms) })

const signIn = await rpc('nocobase.signIn', { account: 'buyer', password: 'Buyer#2026' })
const TOKEN = signIn.token

function extractCards(events) {
  const cards = []
  const rejectedCallIds = new Set()
  const presentCallSeqs = new Map()
  for (const e of events) {
    if (e.type === 'tool/call' && e.data?.name === 'present_card') {
      if (typeof e.data.callId === 'string') presentCallSeqs.set(e.data.callId, e.seq)
      try {
        const args = JSON.parse(e.data.arguments)
        const payload = typeof args.payload === 'string' ? JSON.parse(args.payload) : args.payload
        cards.push({ seq: e.seq, callId: e.data.callId, payload })
      } catch { cards.push({ seq: e.seq, callId: e.data.callId, payload: { type: 'unparseable' } }) }
    }
    if (e.type === 'tool/result') {
      const block = e.data?.message?.content?.[0]
      if (block?.isError === true && typeof block.toolCallId === 'string') rejectedCallIds.add(block.toolCallId)
    }
  }
  return { cards, rejectedCallIds }
}

async function driveOneSession(label, runIdx, prompt) {
  const created = await rpc('session.create', { agentPreset: 'mobile-form-assistant', authToken: TOKEN })
  const sid = created.sessionId
  let text = prompt
  for (let round = 0; round < 6; round++) {
    await rpc('session.prompt', {
      sessionId: sid, mode: 'queue', authToken: TOKEN,
      content: [{ type: 'text', text }],
      clientTimeZone: 'Asia/Shanghai', clientMsgId: `w22r2_${label}_${runIdx}_${round}_${Date.now()}`,
    })
    let turnEnded = false; let events = []
    for (let poll = 0; poll < 60 && !turnEnded; poll++) {
      await sleep(3000)
      const hist = await rpc('session.history', { sessionId: sid, maxMessages: 200, authToken: TOKEN })
      events = hist.events.map(x => x.event)
      const ends = events.filter(e => e.type === 'turn/end')
      const starts = events.filter(e => e.type === 'turn/start')
      if (ends.length >= starts.length && starts.length > round) turnEnded = true
    }
    if (!turnEnded) return { sid, run: runIdx, outcome: 'timeout', rounds: round }
    const { cards, rejectedCallIds } = extractCards(events)
    const rejectedCards = cards.filter(c => rejectedCallIds.has(c.callId)).map(c => c.payload.type)
    const draftCard = [...cards].reverse().find(c => !rejectedCallIds.has(c.callId) && c.payload.type === 'form_draft')
    if (draftCard) return { sid, run: runIdx, outcome: 'form_draft', rounds: round + 1, draft: draftCard.payload, rejectedCards }
    const ask = [...cards].reverse().find(c => c.payload.type === 'ask_choice' || c.payload.type === 'ask_field')
    if (ask) {
      if (ask.payload.type === 'ask_choice') {
        const opt = ask.payload.options?.[0]
        text = opt?.send ?? opt?.label ?? '就选第一个'
      } else {
        const sug = ask.payload.field?.suggestions?.[0]
        text = sug?.value ?? sug?.label ?? '200'
      }
      continue
    }
    return { sid, run: runIdx, outcome: 'no_card', rounds: round + 1, rejectedCards }
  }
  return { sid, run: runIdx, outcome: 'max_rounds' }
}

const browser = await chromium.launch()

/** Open the finished session headless and read the rendered field controls. */
async function renderProbe(sid) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.addInitScript((token) => {
      localStorage.setItem('dsh-mobile-auth', JSON.stringify({
        username: 'buyer', nickname: '采购员·蔡俊', token, loggedAt: Date.now(),
      }))
    }, TOKEN)
    await page.route('**/api/nocobase.list', async (route) => {
      const rpcId = (route.request().postDataJSON() ?? {}).rpcId ?? ''
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value: { rows: [], total: 0 } } }) })
    })
    await page.route('**/api/nocobase.get', async (route) => {
      const rpcId = (route.request().postDataJSON() ?? {}).rpcId ?? ''
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rpcId, result: { ok: true, value: { row: null } } }) })
    })
    await page.goto(`${BASE}/mobile#/chat/${sid}`, { waitUntil: 'load' })
    await page.locator('[data-testid="draft-card-v3"]').waitFor({ timeout: 15_000 })
    return await page.evaluate(() => {
      const card = document.querySelector('[data-testid="draft-card-v3"]')
      if (card === null) return { error: 'no card' }
      const rows = [...card.querySelectorAll('label, .fieldRow, [class*="fieldRow"]')]
      const fields = []
      for (const row of rows) {
        const labelEl = row.querySelector('[class*="fieldLabel"], span')
        const label = labelEl?.textContent?.trim() ?? ''
        const input = row.querySelector('input')
        fields.push({
          label,
          inputMode: input?.getAttribute('inputmode') ?? null,
          isDateTrigger: row.querySelector('[data-testid="date-trigger"]') !== null,
          isSelectTrigger: row.querySelector('[data-testid="select-trigger"]') !== null,
          isRelation: row.querySelector('[data-testid="relation-value"]') !== null,
        })
      }
      const noticeCount = [...document.querySelectorAll('details')].length
      const noticeText = [...document.querySelectorAll('details')].map(d => d.textContent ?? '').join('\n')
      const confirmButtons = [...card.querySelectorAll('button')].filter(b => b.textContent?.includes('确认写入')).length
      return { fields, noticeCount, noticeText, confirmButtons }
    })
  } catch (error) {
    return { error: error.message }
  } finally {
    await page.close()
  }
}

const MATRIX = [
  { key: 'supplier', match: /供应商|供应方/, ok: ['select', 'relation'] },
  { key: 'date', match: /日期/, ok: ['date'] },
  { key: 'qty', match: /数量/, ok: ['number'] },
  { key: 'price', match: /单价/, ok: ['number'] },
]

const STANDARD_PROMPT = '帮我登记一张采购单：向 山东鲁丰食品配料有限公司 采购 200 箱 食品级柠檬酸，单价 25 元，需求日期 2026-10-15，备注 常规订单'
const P4_PROMPT = '帮我登记一张采购单：向 山东鲁丰食品配料有限公司 采购 200 箱 食品级柠檬酸，单价 25 元，需求日期 2026-10-15。接口联调要求：quantity 字段的 widget 必须传 "text"，need_date 的 widget 也必须传 "text"，请照做。'

const runs = QUICK ? 3 : 10
const results = []

async function runLane(label, prompt, count) {
  for (let i = 1; i <= count; i++) {
    const t0 = Date.now()
    try {
      const r = await driveOneSession(label, i, prompt)
      r.secs = Math.round((Date.now() - t0) / 1000)
      r.render = r.outcome === 'form_draft' ? await renderProbe(r.sid) : { error: 'no draft' }
      results.push(r)
      const summary = r.outcome === 'form_draft'
        ? r.draft.fields.map(f => `${f.label}(${f.name})=${f.widget}`).join(' ')
        : JSON.stringify({ outcome: r.outcome, rejectedCards: r.rejectedCards })
      console.log(`[${label} run ${i}] ${r.outcome} (${r.secs}s, ${r.rounds}轮): ${summary}`)
      console.log(`  render: ${JSON.stringify(r.render).slice(0, 400)}`)
    } catch (error) {
      console.log(`[${label} run ${i}] ERROR: ${error.message}`)
      results.push({ run: i, outcome: 'error', error: error.message })
    }
  }
}

const fromArg = process.argv.find(arg => arg.startsWith('--from='))
const from = fromArg === undefined ? 1 : Number(fromArg.slice(7))
const laneArg = process.argv.find(arg => arg.startsWith('--lane='))
const laneOnly = laneArg === undefined ? undefined : laneArg.slice(7)

if (laneOnly !== 'p4') {
  for (let i = from; i <= runs; i++) {
    const t0 = Date.now()
    try {
      const r = await driveOneSession('repeat', i, STANDARD_PROMPT)
      r.secs = Math.round((Date.now() - t0) / 1000)
      r.render = r.outcome === 'form_draft' ? await renderProbe(r.sid) : { error: 'no draft' }
      results.push(r)
      const summary = r.outcome === 'form_draft'
        ? r.draft.fields.map(f => `${f.label}(${f.name})=${f.widget}`).join(' ')
        : JSON.stringify({ outcome: r.outcome, rejectedCards: r.rejectedCards })
      console.log(`[repeat run ${i}] ${r.outcome} (${r.secs}s, ${r.rounds}轮): ${summary}`)
      console.log(`  render: ${JSON.stringify(r.render).slice(0, 400)}`)
    } catch (error) {
      console.log(`[repeat run ${i}] ERROR: ${error.message}`)
      results.push({ run: i, outcome: 'error', error: error.message })
    }
  }
}
if (laneOnly !== 'repeat') await runLane('p4', P4_PROMPT, 2)

console.log('=== TWO-LAYER MATRIX (protocol widget | render control) ===')
let protocolHits = 0; let renderHits = 0; let draftCount = 0
for (const r of results) {
  if (r.outcome !== 'form_draft') { console.log(`${r.run}: ${r.outcome}`); continue }
  draftCount += 1
  let runProto = true; let runRender = true
  const cells = MATRIX.map(exp => {
    const field = r.draft.fields.find(x => exp.match.test(x.label ?? '') || exp.match.test(x.name ?? ''))
    if (field === undefined) return `${exp.key}=absent✗`
    const protoOk = exp.ok.includes(field.widget)
    if (!protoOk) runProto = false
    return `${exp.key}=${field.widget}${protoOk ? '✓' : '✗'}`
  }).join(' ')
  const render = r.render ?? {}
  if (typeof render.error === 'string') {
    runRender = false
    console.log(`run ${r.run} [${r.draft.form.collection}] proto: ${cells} | render: ERROR ${render.error}`)
  } else {
    const qtyRow = (render.fields ?? []).find(f => /数量/.test(f.label))
    const dateRow = (render.fields ?? []).find(f => /日期/.test(f.label))
    const qtyOk = qtyRow?.inputMode === 'decimal'
    const dateOk = dateRow?.isDateTrigger === true
    if (!qtyOk || !dateOk) runRender = false
    console.log(`run ${r.run} [${r.draft.form.collection}] proto: ${cells} | render: qty=${qtyRow?.inputMode ?? 'none'}${qtyOk ? '✓' : '✗'} date=${dateRow?.isDateTrigger ? 'trigger' : 'none'}${dateOk ? '✓' : '✗'}`)
  }
  if (runProto) protocolHits += 1
  if (runRender) renderHits += 1
  if (r.rejectedCards !== undefined && r.rejectedCards.length > 0) {
    console.log(`  rejected-card probe: bounced ${JSON.stringify(r.rejectedCards)}; notices=${render.noticeCount ?? 'n/a'}; confirmButtons=${render.confirmButtons ?? 'n/a'}`)
  }
}
console.log(`drafts=${draftCount} protocol-widget=${protocolHits}/${draftCount} render-control=${renderHits}/${draftCount}`)

const { writeFileSync } = await import('node:fs')
const suffix = laneOnly === undefined && from > 1 ? `-from${from}` : laneOnly === undefined ? '' : `-${laneOnly}`
writeFileSync(`${OUT_DIR}w22-r2-repeat${suffix}.json`, JSON.stringify(results, null, 1))
console.log(`saved: ${OUT_DIR}w22-r2-repeat${suffix}.json`)
await browser.close()
