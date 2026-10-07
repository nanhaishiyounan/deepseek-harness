// W21-R1 re-verification matrix (live gateway :3080, real MiniMax model flow),
// run after the lenient-leaves repair (numeric-leaf coercion + stringified
// payload parsing + Chinese field-pathed errors). Legs:
//   num ×3  fresh sessions with digit-baiting inputs (numeric ids/amounts and
//           report requests) — assert one-shot card, zero degraded, and no
//           INVALID_ARGS retry loop in the session log.
//   s3  ×5  fresh sessions, the P3 S3 scenario verbatim (糯米粉 inventory
//           report) — target 5/5 against P3's 4/5.
//   s1  ×3  fresh sessions, the P3 S1 scenario verbatim (采购消歧) — coercion
//           must not hurt the clean-string path. Target 3/3.
//   r4  ×2  continuation turns inside session-07dac775 (the old-fence context
//           that induced payload double-serialization) — assert cards land,
//           zero degraded, no placeholder card; record whether any payload
//           arrived as a string (the lenient path absorbing it).
// Usage: node demos/acceptance-w21/w21-r1-matrix.mjs [--only=num,s3,s1,r4]
// Resume: finished runs append to w21-r1-matrix-runs.jsonl and are skipped.
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w21'
const RUNS = `${OUT}/w21-r1-matrix-runs.jsonl`
const R4_SESSION = 'session-07dac775-6ea9-4e5f-bf6b-09b8cb11e49f'
const TURN_TIMEOUT_MS = 240_000
const POLL_MS = 5_000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const LOG = []
const log = (line) => { console.log(line); LOG.push(line) }

let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w21r1-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}

const historyEvents = async (sid) => {
  const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
  return (value?.events ?? []).map((entry) => entry?.event ?? entry).filter(Boolean)
}

/**
 * Fold the events of this window into assertion-facing facts. `minSeq` scopes
 * the fold to this run's turns: a continuation session (r4) carries P3-era
 * errors, degraded folds, and fences whose re-counting would falsify the leg.
 */
const analyzeTurn = (events, minSeq = 0) => {
  const facts = {
    turnEnds: [], presentCards: [], presentResults: [], assistantTexts: [],
    fenceLeak: false, emptyFinish: true,
  }
  const cardCallIds = new Set()
  for (const e of events) {
    if (e?.type === 'tool/call' && e.data?.name === 'present_card') cardCallIds.add(e.data.callId)
  }
  for (const e of events) {
    if ((e?.seq ?? 0) < minSeq) continue
    const t = e?.type
    if (t === 'turn/end') { facts.emptyFinish = false; facts.turnEnds.push({ seq: e.seq, reason: e.data?.reason?.kind }) }
    if (t === 'tool/call' && e.data?.name === 'present_card') {
      let payload
      let payloadWasString = false
      try {
        const parsed = JSON.parse(e.data.arguments).payload
        if (typeof parsed === 'string') { payloadWasString = true; payload = JSON.parse(parsed) } else { payload = parsed }
      } catch { payload = undefined }
      facts.presentCards.push({ seq: e.seq, turn: e.data.turn, step: e.data.step, callId: e.data.callId, type: payload?.type, payloadWasString, payload })
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
  // The INVALID_ARGS loop signature the repair removes: >=2 errored card
  // results in one window (each carries the code path INVALID_ARGS text).
  facts.invalidArgsLoop = facts.errorResults.length >= 2
  const firstOk = facts.okPresentResults[0]
  facts.tailAfterCard = firstOk === undefined
    ? false
    : facts.assistantTexts.some((m) => m.seq > firstOk.seq)
  return facts
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

const waitTurnEnd = async (sid, baselineTurnEnds, minSeq) => {
  const deadline = Date.now() + TURN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const events = await historyEvents(sid)
    const facts = analyzeTurn(events, minSeq)
    if (facts.turnEnds.length > baselineTurnEnds) return { events, facts }
    await sleep(POLL_MS)
  }
  const events = await historyEvents(sid)
  return { events, facts: analyzeTurn(events, minSeq), timedOut: true }
}

const cardCounts = async (page) => {
  const tids = ['ask-choice', 'field-ask', 'draft-card-v3', 'receipt-card-v3', 'report-card', 'approval-card', 'approval-card-result', 'plan-card', 'plan-card-result']
  const counts = {}
  for (const tid of tids) counts[tid] = await page.locator(`[data-testid="${tid}"]`).count()
  return counts
}

const snapOf = async (page) => page.locator('main').ariaSnapshot().catch(() => '')

// The shared W21-R1 assertion pack: one-shot card, zero degraded, no
// INVALID_ARGS loop, no fence leak, no model self-answer.
const r1LogChecks = (f) => [
  ['至少一次 present_card 调用', f.presentCards.length >= 1, `types=${f.presentCards.map((c) => c.type).join(',')}`],
  ['卡片调用结果全部成功（零 error）', f.okPresentResults.length >= 1 && f.errorResults.length === 0, `ok=${f.okPresentResults.length} err=${f.errorResults.length}`],
  ['无 INVALID_ARGS 重试循环', !f.invalidArgsLoop, `errResults=${f.errorResults.length}`],
  ['回合正常收尾', !f.emptyFinish, ''],
]

const degradedCount = async (page) => {
  const snap = await snapOf(page)
  return (snap.match(/已折叠/g) ?? []).length
}

const r1DomChecks = async (page, f, degradedBaseline = 0) => {
  const counts = await cardCounts(page)
  const snap = await snapOf(page)
  const cards = Object.values(counts).reduce((a, b) => a + b, 0)
  return [
    ['结构化卡 DOM 渲染', cards >= 1, JSON.stringify(counts)],
    ['零 degraded 折叠', degradedBaseline === 0
      ? !snap.includes('已折叠') && !snap.includes('格式异常')
      // A continuation session carries P3-era degraded fossils (refused calls of
      // the pre-repair days); this run must merely add none.
      : (await degradedCount(page)) === degradedBaseline, `baseline=${degradedBaseline}`],
    ['卡后无模型代答（concludeTurn）', !f.tailAfterCard, ''],
    ['无 fence 泄漏', !f.fenceLeak, ''],
  ]
}

const SCENARIOS = {
  num: {
    label: '数字叶子值诱导（编号/数量/金额）', user: ['buyer', 'Buyer#2026'], fresh: true,
    inputs: [
      '查一下糯米粉的库存，按库位列出现有数量和金额，给我报表',
      '查供应商编号13鲜丰的联系人和准入状态，整理成报表',
      '统计糯米粉两个库位的现有数量，汇总数字给我',
    ],
    logChecks: r1LogChecks,
    domChecks: r1DomChecks,
  },
  s3: {
    label: 'S3 库存报告（P3 原样）', user: ['buyer', 'Buyer#2026'], fresh: true,
    inputs: ['查一下糯米粉还有多少库存', '查一下糯米粉还有多少库存', '查一下糯米粉还有多少库存', '查一下糯米粉还有多少库存', '查一下糯米粉还有多少库存'],
    extraLogChecks: (f) => [
      ['present_card report 调用', f.presentCards.some((c) => c.type === 'report'), `types=${f.presentCards.map((c) => c.type).join(',')}`],
    ],
    logChecks: r1LogChecks,
    domChecks: r1DomChecks,
  },
  s1: {
    label: 'S1 采购消歧（P3 原样回归）', user: ['buyer', 'Buyer#2026'], fresh: true,
    inputs: ['向鲜丰采购面粉，数量100，单价10', '向鲜丰采购面粉，数量100，单价10', '向鲜丰采购面粉，数量100，单价10'],
    extraLogChecks: (f) => [
      ['present_card ask_choice 调用', f.presentCards.some((c) => c.type === 'ask_choice'), `types=${f.presentCards.map((c) => c.type).join(',')}`],
    ],
    logChecks: r1LogChecks,
    domChecks: r1DomChecks,
  },
  r4: {
    label: 'R4 旧 fence 会话续聊（双重序列化场景）', user: ['buyer', 'Buyer#2026'], fresh: false,
    sessionId: R4_SESSION,
    inputs: ['再查一下糯米粉还有多少库存', '把供应商鲜丰的信息整理给我'],
    logChecks: r1LogChecks,
    domChecks: r1DomChecks,
  },
}

const doneRuns = () => {
  if (!existsSync(RUNS)) return []
  return readFileSync(RUNS, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l) } catch { return undefined } }).filter(Boolean)
}

const record = (entry) => appendFileSync(RUNS, `${JSON.stringify(entry)}\n`)

// One live run: fresh or continued session → send → poll turn end → dual assertions.
const runOne = async (context, scenarioKey, index, attempt = 1) => {
  const spec = SCENARIOS[scenarioKey]
  const input = spec.inputs[index - 1]
  const page = await context.newPage()
  const shotFile = `w21-r1-${scenarioKey}-${index}${attempt > 1 ? `-retry${attempt}` : ''}.png`
  const entry = { scenario: scenarioKey, index, attempt, label: spec.label, input, user: spec.user[0], startedAt: new Date().toISOString() }
  try {
    let sid = spec.sessionId
    if (spec.fresh) {
      const created = await rpc('session.create', { agentPreset: 'mobile-form-assistant' })
      sid = typeof created === 'string' ? created : created?.sessionId
      if (sid === undefined) throw new Error('session.create failed')
    }
    entry.sessionId = sid
    await openChat(page, sid)
    const beforeEvents = await historyEvents(sid)
    const baseSeq = beforeEvents.reduce((max, e) => Math.max(max, e?.seq ?? 0), 0)
    const degradedBaseline = await degradedCount(page)
    await send(page, input)
    const t0 = Date.now()
    // The poll folds with this run's scope (minSeq), so its baseline is zero
    // turn ends: the first turn/end beyond baseSeq completes the run.
    let { events, facts, timedOut } = await waitTurnEnd(sid, 0, baseSeq + 1)
    if (timedOut === true || facts.emptyFinish === true) {
      entry.emptyFinishFirst = true
      log(`  [${scenarioKey}#${index}] 空收尾观测（attempt ${attempt}）——重试并如实记录`)
      await page.close()
      if (attempt >= 2) {
        record({ ...entry, ok: false, reason: 'empty-finish ×2', durationMs: Date.now() - t0 })
        return { ...entry, ok: false }
      }
      return runOne(context, scenarioKey, index, attempt + 1)
    }
    entry.durationMs = Date.now() - t0
    const logChecks = [...spec.logChecks(facts), ...(spec.extraLogChecks !== undefined ? spec.extraLogChecks(facts) : [])]
    const logPass = logChecks.map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.locator('[data-testid="ask-choice"], [data-testid="field-ask"], [data-testid="draft-card-v3"], [data-testid="receipt-card-v3"], [data-testid="report-card"], [data-testid="plan-card"], [data-testid="approval-card"]').first().waitFor({ timeout: 15_000 }).catch(() => null)
    await sleep(1_000)
    const domPass = (await spec.domChecks(page, facts, degradedBaseline)).map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.screenshot({ path: `${OUT}/${shotFile}` })
    const ok = [...logPass, ...domPass].every((c) => c.ok)
    entry.cardTypes = facts.presentCards.map((c) => c.type)
    entry.cardSteps = facts.presentCards.map((c) => `${c.turn}:${c.step}`)
    entry.payloadWasString = facts.presentCards.some((c) => c.payloadWasString)
    entry.invalidArgsLoop = facts.invalidArgsLoop
    entry.errorResultCount = facts.errorResults.length
    entry.turnEndReason = facts.turnEnds.at(-1)?.reason
    entry.fenceLeak = facts.fenceLeak
    entry.checks = { logPass, domPass }
    entry.shot = shotFile
    entry.ok = ok
    record(entry)
    log(`  [${scenarioKey}#${index}] ${ok ? 'PASS' : 'FAIL'} sid=${sid} cards=${entry.cardTypes.join(',')} payloadString=${entry.payloadWasString} errs=${entry.errorResultCount} ${entry.durationMs}ms`)
    for (const c of [...logPass, ...domPass]) if (!c.ok) log(`    ✗ ${c.name} ${c.detail}`)
    await page.close()
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
  const counts = { num: 3, s3: 5, s1: 3, r4: 2 }

  // Preflight: gateway liveness + persona projection consistency.
  const pre = {}
  pre.gatewayMobile = await fetch('http://127.0.0.1:3080/mobile').then((r) => r.status).catch(() => 'error')
  const personaSrc = readFileSync('examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml')
  const personaProj = readFileSync('examples/kb-agent/.dsh/.agent-presets/mobile-form-assistant/agent.cordis.yml')
  pre.personaProjectionInSync = personaSrc.equals(personaProj)
  log(`preflight: /mobile=${pre.gatewayMobile} persona-projection-sync=${pre.personaProjectionInSync}`)
  writeFileSync(`${OUT}/w21-r1-preflight.json`, JSON.stringify({ at: new Date().toISOString(), pre }, null, 2))
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
      const finished = doneRuns().filter((r) => r.scenario === key && r.ok === true)
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
    writeFileSync(`${OUT}/w21-r1-matrix-console.log`, `${LOG.join('\n')}\n`)
  }

  const runs = doneRuns()
  const summary = {}
  for (const key of Object.keys(counts)) {
    const mine = runs.filter((r) => r.scenario === key)
    const pass = mine.filter((r) => r.ok === true).length
    const fail = mine.filter((r) => r.ok === false).length
    summary[key] = { label: SCENARIOS[key].label, required: counts[key], pass, fail, payloadStringObserved: mine.some((r) => r.payloadWasString === true), invalidArgsLoop: mine.some((r) => r.invalidArgsLoop === true) }
  }
  writeFileSync(`${OUT}/w21-r1-matrix-summary.json`, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2))
  log('\n== w21-r1 matrix summary ==')
  for (const [key, s] of Object.entries(summary)) log(`${key} ${s.label}: pass=${s.pass}/${s.required} fail=${s.fail} payloadString=${s.payloadStringObserved} invalidArgsLoop=${s.invalidArgsLoop}`)
  // The exit code mirrors the matrix outcome: a judged leg with a recorded
  // failure or an unmet pass count fails the run. --only judges its
  // selection; the legs it excludes are not in the ledger.
  const judged = Object.keys(summary).filter((key) => only === null || only.includes(key))
  const failed = judged.some((key) => summary[key].fail > 0 || summary[key].pass < summary[key].required)
  process.exitCode = failed ? 1 : 0
  log(`matrix verdict: ${failed ? 'FAIL' : 'PASS'}`)
}

await main()
