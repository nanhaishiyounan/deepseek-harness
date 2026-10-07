// W21-R8 re-verification matrix (live gateway :3080, real MiniMax model flow),
// run after the actions leniency contract (wrapper-key flattening, missing
// kind inference, lone-object lift — server resolve + client protocol mirror
// + tool description skeleton + persona few-shot). Legs:
//   s ×5  the user's failing scenario verbatim-ish: 「供应链数据里有什么
//         值得关注的」 under the enterprise-data-assistant colleague (the
//         preset the breaking session actually ran), wording pinned to
//         demand action buttons. Target: 5/5 accepted report cards, actions
//         retained on every accepted card (no delete-actions bypass),
//         first-pass rate and self-correction rounds recorded per run.
//   a ×2  actions-specific under mobile-form-assistant (the persona-teaching
//         surface): a1 demands view+send buttons, a2 demands a create-task
//         button with a report-sourced title.
// Every run classifies the RAW actions shape the model emitted (flat-kind /
// wrapper-key / missing-kind / lone-object) so a coerced acceptance is
// visible as money evidence, and screenshots the rendered card.
// Usage: node demos/acceptance-w21/w21-r8-matrix.mjs [--only=s,a]
// Resume: finished runs append to w21-r8-matrix-runs.jsonl and are skipped.
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w21'
const RUNS = `${OUT}/w21-r8-matrix-runs.jsonl`
const TURN_TIMEOUT_MS = 300_000
const POLL_MS = 5_000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const LOG = []
const log = (line) => { console.log(line); LOG.push(line) }

let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w21r8-${Date.now()}-${rpcSeq++}`, method, payload }),
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
  facts.matchedZero = facts.errorResults.some((r) => r.text.includes('matched'))
  const firstOk = facts.okPresentResults[0]
  facts.tailAfterCard = firstOk === undefined ? false : facts.assistantTexts.some((m) => m.seq > firstOk.seq)
  return facts
}

/** Classify the raw actions spelling of one report payload (pre-coercion). */
const rawActionsShape = (payload) => {
  if (payload?.type !== 'report' || payload.actions === undefined) return 'none'
  const actions = payload.actions
  if (!Array.isArray(actions)) return 'lone-object'
  const shapes = actions.map((action) => {
    if (typeof action !== 'object' || action === null || Array.isArray(action)) return 'non-object'
    const keys = Object.keys(action)
    if (!keys.includes('kind')) {
      if (keys.length === 1 && ['view', 'create-task', 'send', 'link'].includes(keys[0])) return 'wrapper-key'
      return 'missing-kind'
    }
    return 'flat-kind'
  })
  return [...new Set(shapes)].join('+')
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

const snapOf = async (page) => page.locator('main').ariaSnapshot().catch(() => '')

const SCENARIOS = {
  s: {
    label: '同场景复现（enterprise-data-assistant 同事，供应链富报告 + 按钮必带）',
    preset: 'enterprise-data-assistant', user: ['buyer', 'Buyer#2026'],
    input: '供应链数据里有什么值得关注的？给我一张速览报告卡，卡上带上可点的操作按钮',
    requireKinds: null,
  },
  a: {
    label: 'actions 专项（mobile-form-assistant，view+send 与 create-task 按钮活体）',
    preset: 'mobile-form-assistant', user: ['buyer', 'Buyer#2026'],
    inputs: [
      '查一下糯米粉的库存给我一张报告卡，卡上放两个按钮：一个「查看库存明细」跳到工作页，一个「看补货建议」点了就把这句话发给你',
      '查供应商编号13鲜丰的准入状态出一张报告卡，卡上加一个「创建跟进任务」按钮：任务标题用报告里的条目，再附一句处理建议',
    ],
    requireKinds: [['view', 'send'], ['create-task']],
  },
}

const doneRuns = () => {
  if (!existsSync(RUNS)) return []
  return readFileSync(RUNS, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l) } catch { return undefined } }).filter(Boolean)
}

const record = (entry) => appendFileSync(RUNS, `${JSON.stringify(entry)}\n`)

const runOne = async (context, scenarioKey, index) => {
  const spec = SCENARIOS[scenarioKey]
  const input = scenarioKey === 's' ? spec.input : spec.inputs[index - 1]
  const requiredKinds = scenarioKey === 'a' ? spec.requireKinds[index - 1] : null
  const page = await context.newPage()
  const shotFile = `w21-r8-${scenarioKey}-${index}.png`
  const entry = { scenario: scenarioKey, index, label: spec.label, preset: spec.preset, input, user: spec.user[0], startedAt: new Date().toISOString() }
  try {
    const created = await rpc('session.create', { agentPreset: spec.preset })
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
    const acceptedReport = acceptedCards.find((c) => c.payload?.type === 'report')
    const acceptedActions = acceptedReport?.payload?.actions
    const acceptedKinds = Array.isArray(acceptedActions) ? acceptedActions.map((a) => a?.kind).filter(Boolean) : []
    const actionsRetained = Array.isArray(acceptedActions) && acceptedActions.length >= 1
    const actionsErrors = facts.errorResults.filter((r) => r.text.includes('actions'))
    const deleteBypass = actionsErrors.length >= 1 && !actionsRetained
    const firstPass = facts.errorResults.length === 0
    const logChecks = [
      ['尝试了 report 卡（present_card）', facts.presentCards.some((c) => c.type === 'report'), `types=${facts.presentCards.map((c) => c.type).join(',')}`],
      ['最终出卡（≥1 ok result）', facts.okPresentResults.length >= 1, `ok=${facts.okPresentResults.length} err=${facts.errorResults.length}`],
      ['actions 保留（不靠删除绕过）', actionsRetained, `rawShape=${rawActionsShape(acceptedReport?.payload)} kinds=${acceptedKinds.join(',')}`],
      ['无删除 actions 绕过路径', !deleteBypass, `actionsErrors=${actionsErrors.length}`],
      ['无 matched-0 无路径诊断', !facts.matchedZero, ''],
      ['回合正常收尾', !facts.emptyFinish, ''],
      ...(requiredKinds !== null ? [['要求的动作种类齐备（' + requiredKinds.join('+') + '）', requiredKinds.every((k) => acceptedKinds.includes(k)), `kinds=${acceptedKinds.join(',')}`]] : []),
    ]
    const logPass = logChecks.map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.locator('[data-testid="report-card"]').first().waitFor({ timeout: 15_000 }).catch(() => null)
    await sleep(1_000)
    const buttonCount = await page.locator('[data-testid="report-card"] button').count()
    const snap = await snapOf(page)
    const domPass = ([
      ['report 卡 DOM 渲染', await page.locator('[data-testid="report-card"]').count() >= 1, ''],
      ['按钮 DOM 渲染 ≥1', buttonCount >= 1, `buttons=${buttonCount}`],
      ['零 degraded 折叠', !snap.includes('已折叠') && !snap.includes('格式异常'), ''],
      ['无 fence 泄漏', !facts.fenceLeak, ''],
      ['卡后无模型代答（concludeTurn）', !facts.tailAfterCard, ''],
    ]).map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.screenshot({ path: `${OUT}/${shotFile}` })
    const ok = [...logPass, ...domPass].every((c) => c.ok)
    entry.cardTypes = facts.presentCards.map((c) => c.type)
    entry.errorResultCount = facts.errorResults.length
    entry.errorTexts = facts.errorResults.map((r) => r.text.slice(0, 220))
    entry.firstPass = firstPass
    entry.selfCorrectRounds = facts.errorResults.length
    entry.rawActionsShape = rawActionsShape(acceptedReport?.payload)
    entry.acceptedActionsKinds = acceptedKinds
    entry.actionsRetained = actionsRetained
    entry.coercedAcceptance = facts.errorResults.length === 0 && actionsRetained
      && rawActionsShape(acceptedReport?.payload) !== 'flat-kind'
    entry.domButtonCount = buttonCount
    entry.turnEndReason = facts.turnEnds.at(-1)?.reason
    entry.fenceLeak = facts.fenceLeak
    entry.checks = { logPass, domPass }
    entry.shot = shotFile
    entry.ok = ok
    record(entry)
    log(`  [${scenarioKey}#${index}] ${ok ? 'PASS' : 'FAIL'} sid=${sid} firstPass=${firstPass} errs=${entry.errorResultCount} rawShape=${entry.rawActionsShape} kinds=${acceptedKinds.join(',')} buttons=${buttonCount} ${entry.durationMs}ms`)
    for (const c of [...logPass, ...domPass]) if (!c.ok) log(`    ✗ ${c.name}${c.detail === '' ? '' : ` ${c.detail}`}`)
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
  const counts = { s: 5, a: 2 }

  const pre = {}
  pre.gatewayMobile = await fetch('http://127.0.0.1:3080/mobile').then((r) => r.status).catch(() => 'error')
  const personaSrc = readFileSync('examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml')
  const personaProj = readFileSync('examples/kb-agent/.dsh/.agent-presets/mobile-form-assistant/agent.cordis.yml')
  pre.personaProjectionInSync = personaSrc.equals(personaProj)
  log(`preflight: /mobile=${pre.gatewayMobile} persona-projection-sync=${pre.personaProjectionInSync}`)
  writeFileSync(`${OUT}/w21-r8-preflight.json`, JSON.stringify({ at: new Date().toISOString(), pre }, null, 2))
  if (pre.gatewayMobile !== 200 || !pre.personaProjectionInSync) {
    log('preflight FAILED — aborting matrix')
    process.exitCode = 1
    return
  }

  const browser = await chromium.launch()
  try {
    for (const key of Object.keys(counts)) {
      if (only !== null && !only.includes(key)) continue
      const spec = SCENARIOS[key]
      const finished = doneRuns().filter((r) => r.scenario === key && (
        r.ok === true || (r.ok === false && process.env.R8_RERUN_FAILED !== '1')))
      const doneIdx = new Set(finished.map((r) => r.index))
      for (let i = 1; i <= counts[key]; i++) {
        if (doneIdx.has(i)) { log(`  [${key}#${i}] 已完成，跳过（resume）`); continue }
        const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
        const loginPage = await context.newPage()
        await login(loginPage, spec.user[0], spec.user[1])
        log(`login: ${spec.user[0]} (leg ${key}#${i})`)
        await loginPage.close()
        await runOne(context, key, i)
        await context.close()
      }
    }
  } finally {
    await browser.close()
    writeFileSync(`${OUT}/w21-r8-matrix-console.log`, `${LOG.join('\n')}\n`)
  }

  const runs = doneRuns()
  const summary = {}
  for (const key of Object.keys(counts)) {
    const mine = runs.filter((r) => r.scenario === key)
    const pass = mine.filter((r) => r.ok === true).length
    const fail = mine.filter((r) => r.ok === false).length
    summary[key] = {
      label: SCENARIOS[key].label, required: counts[key], pass, fail,
      attemptsRecorded: mine.length,
      firstPass: mine.map((r) => r.firstPass === true),
      selfCorrectRounds: mine.map((r) => r.selfCorrectRounds ?? null),
      actionsRetained: mine.map((r) => r.actionsRetained === true),
      rawActionsShapes: mine.map((r) => r.rawActionsShape ?? null),
      acceptedKinds: mine.map((r) => r.acceptedActionsKinds ?? null),
      domButtons: mine.map((r) => r.domButtonCount ?? null),
      matchedZero: mine.some((r) => (r.errorTexts ?? []).some((t) => t.includes('matched'))),
    }
  }
  writeFileSync(`${OUT}/w21-r8-matrix-summary.json`, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2))
  log('\n== w21-r8 matrix summary ==')
  for (const [key, s] of Object.entries(summary)) {
    log(`${key} ${s.label}: pass=${s.pass}/${s.required} fail=${s.fail} firstPass=${s.firstPass.filter(Boolean).length}/${s.attemptsRecorded} actionsRetained=${s.actionsRetained.filter(Boolean).length}/${s.attemptsRecorded} shapes=[${s.rawActionsShapes.join(',')}] matchedZero=${s.matchedZero}`)
  }
  const judged = Object.keys(summary).filter((key) => only === null || only.includes(key))
  const failed = judged.some((key) => summary[key].fail > 0 || summary[key].pass < summary[key].required)
  process.exitCode = failed ? 1 : 0
  log(`matrix verdict: ${failed ? 'FAIL' : 'PASS'}`)
}

await main()
