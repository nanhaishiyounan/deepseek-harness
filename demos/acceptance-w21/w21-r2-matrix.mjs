// W21-R2 re-verification matrix (live gateway :3080, real MiniMax model flow),
// run after the non-intercepting payload declaration (framework never rejects
// a payload shape; every violation returns from the resolve walk with a
// Chinese field path and the legal candidates) plus the widget-required and
// null-as-absent mirror alignment. Legs:
//   num  ×3  strengthened digit-baiting inputs. The verifier lesson requires
//            the raw payload to actually carry >=2 numeric leaves; a run whose
//            first accepted card has fewer is recorded as a failed attempt and
//            retried in a fresh session with harder wording (records are kept,
//            never deleted). Target: 3/3 first-shot cards, zero error results,
//            zero pathless matched-0 diagnostics.
//   enum ×1  bait the model into inventing an enum value (asking for an
//            out-of-range table column kind). If an INVALID_ARGS fires, its
//            text must name the field path and the legal candidates and must
//            not contain 'matched'; the model must self-correct within one
//            retry. A first-shot legal card is recorded as not-triggered.
// Usage: node demos/acceptance-w21/w21-r2-matrix.mjs [--only=num,enum]
// Resume: finished runs append to w21-r2-matrix-runs.jsonl and are skipped.
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w21'
const RUNS = `${OUT}/w21-r2-matrix-runs.jsonl`
const TURN_TIMEOUT_MS = 240_000
const POLL_MS = 5_000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const LOG = []
const log = (line) => { console.log(line); LOG.push(line) }

let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w21r2-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}

const historyEvents = async (sid) => {
  const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
  return (value?.events ?? []).map((entry) => entry?.event ?? entry).filter(Boolean)
}

const analyzeTurn = (events) => {
  const facts = { turnEnds: [], presentCards: [], presentResults: [], assistantTexts: [], fenceLeak: false, emptyFinish: true }
  const cardCallIds = new Set()
  for (const e of events) {
    if (e?.type === 'tool/call' && e.data?.name === 'present_card') cardCallIds.add(e.data.callId)
  }
  for (const e of events) {
    const t = e?.type
    if (t === 'turn/end') { facts.emptyFinish = false; facts.turnEnds.push({ seq: e.seq, reason: e.data?.reason?.kind }) }
    if (t === 'tool/call' && e.data?.name === 'present_card') {
      let payload
      let payloadWasString = false
      try {
        const parsed = JSON.parse(e.data.arguments).payload
        if (typeof parsed === 'string') { payloadWasString = true; payload = JSON.parse(parsed) } else { payload = parsed }
      } catch { payload = undefined }
      facts.presentCards.push({ seq: e.seq, turn: e.data.turn, step: e.data.step, callId: e.data.callId, type: payload?.type, payloadWasString, payload, rawArgsValid: payload !== undefined })
    }
    if (t === 'tool/result' && e.data?.message?.source?.kind === 'tool' && cardCallIds.has(e.data.message.source.callId)) {
      const block = (e.data.message.content ?? []).find((c) => c.type === 'tool-result')
      if (block) facts.presentResults.push({ seq: e.seq, turn: e.data.turn, callId: e.data.message.source.callId, isError: block.isError === true, text: String(block.content?.[0]?.text ?? '') })
    }
    if (t === 'assistant/message') {
      for (const c of e.data?.message?.content ?? []) {
        if (c.type === 'text' && c.text !== '') facts.assistantTexts.push({ seq: e.seq, turn: e.data.turn, text: c.text })
        if (c.type === 'text' && c.text.includes('```dsh')) facts.fenceLeak = true
      }
    }
  }
  facts.okPresentResults = facts.presentResults.filter((r) => !r.isError)
  facts.errorResults = facts.presentResults.filter((r) => r.isError)
  facts.invalidArgsLoop = facts.errorResults.length >= 2
  facts.matchedZero = facts.errorResults.some((r) => r.text.includes('matched'))
  const firstOk = facts.okPresentResults[0]
  facts.tailAfterCard = firstOk === undefined ? false : facts.assistantTexts.some((m) => m.seq > firstOk.seq)
  return facts
}

/** Count the number leaves of one parsed payload (the digit-bait precondition). */
const countNumericLeaves = (value) => {
  if (typeof value === 'number') return 1
  if (value === null || typeof value !== 'object') return 0
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countNumericLeaves(entry), 0)
  return Object.values(value).reduce((sum, entry) => sum + countNumericLeaves(entry), 0)
}

const login = async (page, user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const openChat = async (page, sid) => {
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
}

const send = async (page, text) => {
  await page.getByPlaceholder('问我任何经营问题...').fill(text)
  await page.getByRole('button', { name: '发送' }).click()
}

const waitTurnEnd = async (sid, baselineTurnEnds) => {
  const deadline = Date.now() + TURN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const events = await historyEvents(sid)
    const facts = analyzeTurn(events)
    if (facts.turnEnds.length > baselineTurnEnds) return { events, facts }
    await sleep(POLL_MS)
  }
  const events = await historyEvents(sid)
  return { events, facts: analyzeTurn(events), timedOut: true }
}

const cardCounts = async (page) => {
  const tids = ['ask-choice', 'field-ask', 'draft-card-v3', 'receipt-card-v3', 'report-card', 'approval-card', 'approval-card-result', 'plan-card', 'plan-card-result']
  const counts = {}
  for (const tid of tids) counts[tid] = await page.locator(`[data-testid="${tid}"]`).count()
  return counts
}

const snapOf = async (page) => page.locator('main').ariaSnapshot().catch(() => '')

const degradedCount = async (page) => {
  const snap = await snapOf(page)
  return (snap.match(/已折叠/g) ?? []).length
}

const r2LogChecks = (f) => [
  ['至少一次 present_card 调用', f.presentCards.length >= 1, `types=${f.presentCards.map((c) => c.type).join(',')}`],
  ['卡片调用结果全部成功（零 error）', f.okPresentResults.length >= 1 && f.errorResults.length === 0, `ok=${f.okPresentResults.length} err=${f.errorResults.length}`],
  ['无 matched-0 无路径诊断', !f.matchedZero, `matchedTexts=${f.errorResults.filter((r) => r.text.includes('matched')).length}`],
  ['回合正常收尾', !f.emptyFinish, ''],
]

const r2DomChecks = async (page, f) => {
  const counts = await cardCounts(page)
  const snap = await snapOf(page)
  const cards = Object.values(counts).reduce((a, b) => a + b, 0)
  return [
    ['结构化卡 DOM 渲染', cards >= 1, JSON.stringify(counts)],
    ['零 degraded 折叠', !snap.includes('已折叠') && !snap.includes('格式异常'), `degraded=${await degradedCount(page)}`],
    ['卡后无模型代答（concludeTurn）', !f.tailAfterCard, ''],
    ['无 fence 泄漏', !f.fenceLeak, ''],
  ]
}

// num legs: strengthened digit-baiting. Attempt 1 wording asks for numeric
// literals explicitly; a retry (fresh session) escalates to「不要加引号」.
const NUM_INPUTS = [
  ['查一下糯米粉的库存报表：表格列出库位、现有数量、金额，数量和金额直接用数字填进表格单元格（不要加引号）',
    '查糯米粉库存，按库位列表：现有数量和金额两列全部用数字字面量填写（禁止写成带引号的字符串），编号列写 13'],
  ['查供应商编号13鲜丰的联系人和准入状态做报表：编号列填数字13，联系电话尾号等数字信息用数字字面量（不加引号）',
    '查供应商编号13鲜丰：报表 metrics 的 value 里编号、电话尾号全部写裸数字（禁止加引号），比如 13、8899'],
  ['统计糯米粉两个库位的现有数量和金额汇总成报表：所有数量与金额用数字字面量填（如 500、15800.11），不要写成字符串',
    '统计糯米粉两个库位的现有数量和金额：metrics 与表格里全部数字都用裸数字字面量（500、15800.11 这样），严禁加引号'],
]

const ENUM_INPUT = '查一下糯米粉还有多少库存，给我一张报表；表格里数量列的 kind 用 id 标注、金额列的 kind 用 date 标注'
// Attempt-2 wording: name the illegal literal as a direct instruction, the
// strongest bait that still leaves the model free to comply.
const ENUM_INPUT_ESCALATED = '查一下糯米粉还有多少库存，出一张 report 卡：payload.table.columns 数量列的 kind 字段直接填 id、库位列的 kind 直接填 status，就这么填别改成别的值'
// Leg-3 wording: describe a presentation the schema cannot express and let the
// model invent the kind literal itself (the seq289 spontaneous-invention
// shape, as opposed to user-instructed illegals).
const ENUM_INPUT_SPONTANEOUS = '查一下糯米粉还有多少库存，给我一张报表；金额列做成百分比进度条的样子，数量列用编号徽章样式展示'

const SCENARIOS = {
  num: {
    label: '数字叶子强化诱导（验证器 lesson：payload 须真含 ≥2 数字叶子）', user: ['buyer', 'Buyer#2026'], fresh: true,
    attempts: NUM_INPUTS,
    extraLogChecks: (f, numLeaves) => [
      ['报告卡', f.presentCards.some((c) => c.type === 'report'), `types=${f.presentCards.map((c) => c.type).join(',')}`],
      ['原始 payload 数字叶子 ≥2（诱导真实命中）', numLeaves >= 2, `numericLeaves=${numLeaves}`],
    ],
    logChecks: r2LogChecks,
    domChecks: r2DomChecks,
  },
  enum: {
    label: '枚举越位活体（诱导臆造 kind）', user: ['buyer', 'Buyer#2026'], fresh: true,
    attempts: [[ENUM_INPUT, ENUM_INPUT], [ENUM_INPUT_ESCALATED, ENUM_INPUT_ESCALATED], [ENUM_INPUT_SPONTANEOUS, ENUM_INPUT_SPONTANEOUS]],
    extraLogChecks: (f, numLeaves, triggered) => [
      ['越位错误含字段路径与候选值（若触发）', !triggered || f.errorResults.every((r) => r.text.includes('应为') && r.text.includes('之一（收到') && !r.text.includes('matched')), triggered ? `errText=${f.errorResults[0]?.text.slice(0, 120)}` : '未触发（首发合法）'],
      ['一轮自纠出卡（若触发）', !triggered || (f.okPresentResults.length >= 1 && f.errorResults.length <= 1), `ok=${f.okPresentResults.length} err=${f.errorResults.length} triggered=${triggered}`],
    ],
    logChecks: (f) => [
      ['至少一次 present_card 成功出卡', f.okPresentResults.length >= 1, `types=${f.presentCards.map((c) => c.type).join(',')}`],
      ['无 matched-0 无路径诊断', !f.matchedZero, ''],
      ['回合正常收尾', !f.emptyFinish, ''],
    ],
    domChecks: r2DomChecks,
  },
}

const doneRuns = () => {
  if (!existsSync(RUNS)) return []
  return readFileSync(RUNS, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l) } catch { return undefined } }).filter(Boolean)
}

const record = (entry) => appendFileSync(RUNS, `${JSON.stringify(entry)}\n`)

const runOne = async (context, scenarioKey, index, attempt = 1) => {
  const spec = SCENARIOS[scenarioKey]
  const input = spec.attempts[index - 1][Math.min(attempt, spec.attempts[index - 1].length) - 1]
  const page = await context.newPage()
  const shotFile = `w21-r2-${scenarioKey}-${index}${attempt > 1 ? `-attempt${attempt}` : ''}.png`
  const entry = { scenario: scenarioKey, index, attempt, label: spec.label, input, user: spec.user[0], startedAt: new Date().toISOString() }
  try {
    const created = await rpc('session.create', { agentPreset: 'mobile-form-assistant' })
    const sid = typeof created === 'string' ? created : created?.sessionId
    if (sid === undefined) throw new Error('session.create failed')
    entry.sessionId = sid
    await openChat(page, sid)
    const baselineFacts = analyzeTurn(await historyEvents(sid))
    const t0 = Date.now()
    await send(page, input)
    const { facts, timedOut } = await waitTurnEnd(sid, baselineFacts.turnEnds.length)
    if (timedOut) {
      entry.durationMs = Date.now() - t0
      entry.ok = false
      entry.reason = 'turn timeout'
      record(entry)
      log(`  [${scenarioKey}#${index}] TIMEOUT sid=${sid}`)
      await page.close()
      return entry
    }
    entry.durationMs = Date.now() - t0
    const acceptedCards = facts.presentCards.filter((c) => facts.okPresentResults.some((r) => r.callId === c.callId))
    const numLeaves = Math.max(0, ...acceptedCards.map((c) => countNumericLeaves(c.payload)), 0)
    const triggered = facts.errorResults.length > 0
    const logChecks = [...spec.logChecks(facts), ...(spec.extraLogChecks !== undefined ? spec.extraLogChecks(facts, numLeaves, triggered) : [])]
    const logPass = logChecks.map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.locator('[data-testid="ask-choice"], [data-testid="field-ask"], [data-testid="draft-card-v3"], [data-testid="receipt-card-v3"], [data-testid="report-card"], [data-testid="plan-card"], [data-testid="approval-card"]').first().waitFor({ timeout: 15_000 }).catch(() => null)
    await sleep(1_000)
    const domPass = (await spec.domChecks(page, facts)).map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.screenshot({ path: `${OUT}/${shotFile}` })
    const ok = [...logPass, ...domPass].every((c) => c.ok)
    entry.cardTypes = facts.presentCards.map((c) => c.type)
    entry.cardSteps = facts.presentCards.map((c) => `${c.turn}:${c.step}`)
    entry.payloadWasString = facts.presentCards.some((c) => c.payloadWasString)
    entry.invalidArgsLoop = facts.invalidArgsLoop
    entry.errorResultCount = facts.errorResults.length
    entry.errorTexts = facts.errorResults.map((r) => r.text.slice(0, 200))
    entry.numericLeaves = numLeaves
    entry.enumTriggered = scenarioKey === 'enum' ? triggered : undefined
    entry.turnEndReason = facts.turnEnds.at(-1)?.reason
    entry.fenceLeak = facts.fenceLeak
    entry.checks = { logPass, domPass }
    entry.shot = shotFile
    entry.ok = ok
    record(entry)
    log(`  [${scenarioKey}#${index}] ${ok ? 'PASS' : 'FAIL'} sid=${sid} cards=${entry.cardTypes.join(',')} leaves=${numLeaves} errs=${entry.errorResultCount} ${entry.durationMs}ms`)
    for (const c of [...logPass, ...domPass]) if (!c.ok) log(`    ✗ ${c.name} ${c.detail}`)
    await page.close()
    // The verifier lesson: a num run whose accepted card carries fewer than
    // two numeric leaves did not exercise the coercion path — record it and
    // retry in a fresh session with the escalated wording (cap 3 attempts).
    if (scenarioKey === 'num' && ok && numLeaves < 2 && attempt < 3) {
      log(`  [${scenarioKey}#${index}] 数字叶子 ${numLeaves}<2 —— 记录后换更强措辞重开新会话`)
      const retry = await runOne(context, scenarioKey, index, attempt + 1)
      return { ...retry, supersededAttempt: { ...entry } }
    }
    return entry
  } catch (error) {
    entry.ok = false
    entry.reason = String(error?.message ?? error)
    record(entry)
    log(`  [${scenarioKey}#${index}] ERROR ${entry.reason}`)
    await page.close().catch(() => {})
    return entry
  }
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const args = process.argv.slice(2)
  const onlyArg = args.find((a) => a.startsWith('--only='))
  const only = onlyArg !== undefined ? onlyArg.slice(7).split(',') : null
  const counts = { num: 3, enum: 3 }

  const pre = {}
  pre.gatewayMobile = await fetch('http://127.0.0.1:3080/mobile').then((r) => r.status).catch(() => 'error')
  const personaSrc = readFileSync('examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml')
  const personaProj = readFileSync('examples/kb-agent/.dsh/.agent-presets/mobile-form-assistant/agent.cordis.yml')
  pre.personaProjectionInSync = personaSrc.equals(personaProj)
  log(`preflight: /mobile=${pre.gatewayMobile} persona-projection-sync=${pre.personaProjectionInSync}`)
  writeFileSync(`${OUT}/w21-r2-preflight.json`, JSON.stringify({ at: new Date().toISOString(), pre }, null, 2))
  if (pre.gatewayMobile !== 200 || !pre.personaProjectionInSync) {
    log('preflight FAILED — aborting matrix')
    process.exitCode = 1
    return
  }

  const browser = await chromium.launch()
  try {
    let currentUser = null
    let context = null
    for (const key of Object.keys(counts)) {
      if (only !== null && !only.includes(key)) continue
      const spec = SCENARIOS[key]
      // Resume: an index is done when one qualifying pass exists (num requires
      // >=2 numeric leaves). Recorded failures are skipped too — every attempt
      // stays in the ledger; set R2_RERUN_FAILED=1 to rerun them.
      const finished = doneRuns().filter((r) => r.scenario === key && (
        (r.ok === true && (key !== 'num' || (r.numericLeaves ?? 0) >= 2))
        || (r.ok === false && process.env.R2_RERUN_FAILED !== '1')))
      const doneIdx = new Set(finished.map((r) => r.index))
      for (let i = 1; i <= counts[key]; i++) {
        if (doneIdx.has(i)) { log(`  [${key}#${i}] 已完成，跳过（resume）`); continue }
        if (currentUser !== spec.user[0]) {
          if (context !== null) await context.close()
          context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
          const page = await context.newPage()
          await login(page, spec.user[0], spec.user[1])
          log(`login: ${spec.user[0]}`)
          currentUser = spec.user[0]
        }
        await runOne(context, key, i)
      }
    }
  } finally {
    await browser.close()
    writeFileSync(`${OUT}/w21-r2-matrix-console.log`, `${LOG.join('\n')}\n`)
  }

  const runs = doneRuns()
  const summary = {}
  for (const key of Object.keys(counts)) {
    const mine = runs.filter((r) => r.scenario === key)
    const qualifying = key === 'num' ? mine.filter((r) => r.ok === true && r.numericLeaves >= 2) : mine.filter((r) => r.ok === true)
    const pass = qualifying.length
    const fail = mine.filter((r) => r.ok === false).length
    summary[key] = {
      label: SCENARIOS[key].label, required: counts[key], pass, fail,
      attemptsRecorded: mine.length,
      numericLeaves: mine.filter((r) => r.numericLeaves !== undefined).map((r) => r.numericLeaves),
      payloadStringObserved: mine.some((r) => r.payloadWasString === true),
      invalidArgsLoop: mine.some((r) => r.invalidArgsLoop === true),
      matchedZero: mine.some((r) => (r.errorTexts ?? []).some((t) => t.includes('matched'))),
      enumTriggered: mine.some((r) => r.enumTriggered === true),
    }
  }
  writeFileSync(`${OUT}/w21-r2-matrix-summary.json`, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2))
  log('\n== w21-r2 matrix summary ==')
  for (const [key, s] of Object.entries(summary)) log(`${key} ${s.label}: pass=${s.pass}/${s.required} fail=${s.fail} leaves=[${s.numericLeaves.join(',')}] payloadString=${s.payloadStringObserved} matchedZero=${s.matchedZero} enumTriggered=${s.enumTriggered}`)
  // The exit code mirrors the matrix outcome (W21-R3): a judged leg with a
  // recorded failure or an unmet pass count fails the run — previously only
  // the preflight set a non-zero code, so a fully failing matrix still exited 0.
  // --only judges its selection; the legs it excludes are not in the ledger.
  const judged = Object.keys(summary).filter((key) => only === null || only.includes(key))
  const failed = judged.some((key) => summary[key].fail > 0 || summary[key].pass < summary[key].required)
  process.exitCode = failed ? 1 : 0
  log(`matrix verdict: ${failed ? 'FAIL' : 'PASS'}`)
}

await main()
