// W21-P3 determinism matrix (live gateway :3080, real MiniMax model flow).
// Scenarios (per plans/2026-10-06-mobile-structured-output-determinism.md P3):
//   s1  supplier-name disambiguation ×5 fresh sessions — present_card ask_choice
//       (options must carry both 鲜丰 candidates), ChoiceBubble DOM, zero
//       degraded, no assistant tail after the card (concludeTurn), no ```dsh.
//   s2  direct form draft ×5 fresh sessions — present_card form_draft +
//       draft-card-v3 DOM for a unique supplier name.
//   s3  inventory report ×5 fresh sessions — present_card report +
//       report-card DOM (糯米粉; the plan's literal 面粉 has no product row).
//   s4  plain-text negative ×3 — no present_card call, no card DOM, real text.
//   s5b MRP suggestions ×1 (buyer) — two plan_suggest cards in ONE parallel
//       batch (same step) — the multi-card observe lane.
//   s5  approval todos ×2 (admin, 6 open todos >2) — observe lane: persona
//       prescribes narrative + ask_choice picker, not two approval cards.
// Replay legs (>=3): pre-P1 fence session (07dac775 report + 8bbc5505 choice),
// a P1-era present_card session (a035ed7d), and a mixed session built by
// continuing 8bbc5505 (fence card + new tool card on one screen), plus
// s1#1 reload ×3 consistency.
// Usage: node demos/acceptance-w21/p3-matrix.mjs [--only s1,s2,...] [--limit N]
// Resume: finished runs append to p3-matrix-runs.jsonl and are skipped.
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w21'
const RUNS = `${OUT}/p3-matrix-runs.jsonl`
const CARD_OK_TEXT = '卡片已呈现'
const TURN_TIMEOUT_MS = 240_000
const POLL_MS = 5_000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const LOG = []
const log = (line) => { console.log(line); LOG.push(line) }

let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `p3-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}

const historyEvents = async (sid) => {
  const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
  return (value?.events ?? []).map((entry) => entry?.event ?? entry).filter(Boolean)
}

/** Fold one finished turn's events into the assertion-facing facts. */
const analyzeTurn = (events) => {
  const facts = {
    turnEnds: [], presentCards: [], presentResults: [], assistantTexts: [],
    fenceLeak: false, emptyFinish: true,
  }
  // First pass collects the present_card call ids so the second pass can
  // scope tool results to the card channel (nb_list results are not cards).
  const cardCallIds = new Set()
  for (const e of events) {
    if (e?.type === 'tool/call' && e.data?.name === 'present_card') cardCallIds.add(e.data.callId)
  }
  for (const e of events) {
    const t = e?.type
    if (t === 'turn/end') { facts.emptyFinish = false; facts.turnEnds.push({ seq: e.seq, reason: e.data?.reason?.kind }) }
    if (t === 'tool/call' && e.data?.name === 'present_card') {
      let payload
      try { payload = JSON.parse(e.data.arguments).payload } catch { payload = undefined }
      facts.presentCards.push({ seq: e.seq, turn: e.data.turn, step: e.data.step, callId: e.data.callId, type: payload?.type, payload })
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
  // concludeTurn: no assistant TEXT after the first successful present_card
  // result within the same turn (reasoning blocks are not user-visible).
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

/** Wait until a new turn/end appears beyond `baselineTurnEnds`. */
const waitTurnEnd = async (sid, baselineTurnEnds) => {
  const deadline = Date.now() + TURN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const events = await historyEvents(sid)
    const facts = analyzeTurn(events)
    if (facts.turnEnds.length > baselineTurnEnds) return { events, facts }
    await sleep(POLL_MS)
  }
  return { events: await historyEvents(sid), facts: analyzeTurn(await historyEvents(sid)), timedOut: true }
}

const cardCounts = async (page) => {
  const tids = ['ask-choice', 'field-ask', 'draft-card-v3', 'receipt-card-v3', 'report-card', 'approval-card', 'approval-card-result', 'plan-card', 'plan-card-result', 'action-badge']
  const counts = {}
  for (const tid of tids) counts[tid] = await page.locator(`[data-testid="${tid}"]`).count()
  return counts
}

const snapOf = async (page) => page.locator('main').ariaSnapshot().catch(() => '')

// ── per-scenario DOM+log assertion packs ──
const SCENARIOS = {
  s1: {
    label: 'S1 采购消歧（鲜丰 2 候选）', user: ['buyer', 'Buyer#2026'],
    input: '向鲜丰采购面粉，数量100，单价10',
    logChecks: (f) => [
      ['present_card ask_choice 调用入 log', f.presentCards.some((c) => c.type === 'ask_choice')],
      ['唯一卡类型为 ask_choice', f.presentCards.every((c) => c.type === 'ask_choice')],
      ['卡片调用结果成功（非 error 重试链）', f.okPresentResults.length >= 1 && f.presentResults.every((r) => !r.isError)],
      ['回合正常收尾', !f.emptyFinish],
    ],
    payloadCheck: (f) => {
      const c = f.presentCards.find((x) => x.type === 'ask_choice')
      if (c === undefined) return [false, 'no ask_choice card']
      const labels = (c.payload.options ?? []).map((o) => String(o.label)).join('|')
      // Both 鲜丰-named suppliers appear as pickable options: 珠海鲜丰水产…
      // plus the bare 鲜丰 row — two 鲜丰 occurrences across the labels.
      const both = (labels.match(/鲜丰/g) ?? []).length >= 2 && labels.includes('珠海鲜丰')
      return [both, `options=${labels}`]
    },
    domChecks: async (page, f) => {
      const counts = await cardCounts(page)
      const snap = await snapOf(page)
      const optsOk = snap.includes('珠海鲜丰水产') || counts['ask-choice'] >= 1
      return [
        ['ChoiceBubble DOM 渲染', counts['ask-choice'] >= 1 && optsOk, `ask-choice=${counts['ask-choice']}`],
        ['零 degraded 折叠', !snap.includes('已折叠') && !snap.includes('格式异常'), ''],
        ['卡后无模型代答（concludeTurn）', !f.tailAfterCard, f.tailAfterCard ? 'assistant text after card' : ''],
        ['无 fence 泄漏', !f.fenceLeak, f.fenceLeak ? '```dsh in assistant text' : ''],
      ]
    },
  },
  s2: {
    label: 'S2 直达表单草稿（唯一名新单位）', user: ['buyer', 'Buyer#2026'],
    input: '新单位华丰食品要入驻建档，联系人王芳',
    logChecks: (f) => [
      ['present_card form_draft 调用入 log', f.presentCards.some((c) => c.type === 'form_draft')],
      ['唯一卡类型为 form_draft', f.presentCards.every((c) => c.type === 'form_draft')],
      ['卡片调用结果成功', f.okPresentResults.length >= 1 && f.presentResults.every((r) => !r.isError)],
      ['回合正常收尾', !f.emptyFinish],
    ],
    domChecks: async (page, f) => {
      const counts = await cardCounts(page)
      const snap = await snapOf(page)
      return [
        ['draft-card-v3 DOM 渲染', counts['draft-card-v3'] >= 1 && snap.includes('草稿卡'), `draft-card-v3=${counts['draft-card-v3']}`],
        ['草稿卡含唯一名', snap.includes('华丰食品'), ''],
        ['零 degraded 折叠', !snap.includes('已折叠') && !snap.includes('格式异常'), ''],
        ['卡后无模型代答（concludeTurn）', !f.tailAfterCard, ''],
        ['无 fence 泄漏', !f.fenceLeak, ''],
      ]
    },
  },
  s3: {
    label: 'S3 库存报告（糯米粉 2 库位行）', user: ['buyer', 'Buyer#2026'],
    input: '查一下糯米粉还有多少库存',
    logChecks: (f) => [
      ['present_card report 调用入 log', f.presentCards.some((c) => c.type === 'report')],
      ['唯一卡类型为 report', f.presentCards.every((c) => c.type === 'report')],
      ['卡片调用结果成功', f.okPresentResults.length >= 1 && f.presentResults.every((r) => !r.isError)],
      ['回合正常收尾', !f.emptyFinish],
    ],
    domChecks: async (page, f) => {
      const counts = await cardCounts(page)
      const snap = await snapOf(page)
      return [
        ['report-card DOM 渲染', counts['report-card'] >= 1 && snap.includes('库存查询'), `report-card=${counts['report-card']}`],
        ['报告含糯米粉数字', /\d/.test(snap) && snap.includes('糯米粉'), ''],
        ['零 degraded 折叠', !snap.includes('已折叠') && !snap.includes('格式异常'), ''],
        ['卡后无模型代答（concludeTurn）', !f.tailAfterCard, ''],
        ['无 fence 泄漏', !f.fenceLeak, ''],
      ]
    },
  },
  s4: {
    label: 'S4 纯文本负例', user: ['buyer', 'Buyer#2026'],
    input: '你好，你能干什么',
    logChecks: (f) => [
      ['零 present_card 调用', f.presentCards.length === 0, `calls=${f.presentCards.length}`],
      ['assistant 有文本应答', f.assistantTexts.length >= 1],
    ],
    domChecks: async (page, f) => {
      const counts = await cardCounts(page)
      const structured = counts['ask-choice'] + counts['field-ask'] + counts['draft-card-v3'] + counts['receipt-card-v3'] + counts['report-card'] + counts['approval-card'] + counts['approval-card-result'] + counts['plan-card'] + counts['plan-card-result']
      return [['零结构化卡 DOM', structured === 0, JSON.stringify(counts)]]
    },
  },
  s5b: {
    label: 'S5b MRP 建议双卡同批（open=2）', user: ['buyer', 'Buyer#2026'],
    input: '有什么计划建议',
    logChecks: (f) => [
      ['plan_suggest ×2 入 log', f.presentCards.filter((c) => c.type === 'plan_suggest').length === 2, `types=${f.presentCards.map((c) => c.type).join(',')}`],
      ['两卡同批并行（同 turn 同 step）', (() => { const steps = new Set(f.presentCards.filter((c) => c.type === 'plan_suggest').map((c) => `${c.turn}:${c.step}`)); return steps.size === 1 })()],
      ['两卡结果均成功', f.okPresentResults.length === 2 && f.presentResults.every((r) => !r.isError)],
      ['回合正常收尾（多卡批次一起停）', !f.emptyFinish],
      ['卡后无模型代答', !f.tailAfterCard, ''],
    ],
    domChecks: async (page, f) => {
      const counts = await cardCounts(page)
      return [['plan-card DOM ×2', counts['plan-card'] === 2, `plan-card=${counts['plan-card']}`]]
    },
  },
  s5: {
    label: 'S5 审批待办（admin 6 条 open>2，观察项）', user: ['admin', 'Admin#2026'], observe: true,
    input: '有什么待审批的',
    logChecks: () => [],
    domChecks: async () => [],
  },
}

// Post-fix verification legs (persona leaf-value hardening, run AFTER the
// original matrix; they never overwrite the original s1-s5 records).
SCENARIOS.s3f = { ...SCENARIOS.s3, label: 'S3f post-fix 库存报告（叶子值铁律后）' }
SCENARIOS.s1f = { ...SCENARIOS.s1, label: 'S1f post-fix 采购消歧（叶子值铁律后）' }

const doneRuns = () => {
  if (!existsSync(RUNS)) return []
  return readFileSync(RUNS, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l) } catch { return undefined } }).filter(Boolean)
}

const record = (entry) => appendFileSync(RUNS, `${JSON.stringify(entry)}\n`)

// ── one live run: fresh session → send → poll turn end → dual assertions ──
const runOne = async (context, scenarioKey, index, attempt = 1) => {
  const spec = SCENARIOS[scenarioKey]
  const page = await context.newPage()
  const shotFile = `p3-${scenarioKey}-${index}${attempt > 1 ? `-retry${attempt}` : ''}.png`
  const entry = { scenario: scenarioKey, index, attempt, label: spec.label, input: spec.input, user: spec.user[0], startedAt: new Date().toISOString() }
  try {
    const created = await rpc('session.create', { agentPreset: 'mobile-form-assistant' })
    const sid = typeof created === 'string' ? created : created?.sessionId
    if (sid === undefined) throw new Error('session.create failed')
    entry.sessionId = sid
    await openChat(page, sid)
    const before = analyzeTurn(await historyEvents(sid))
    const baseEnds = before.turnEnds.length
    await send(page, spec.input)
    const t0 = Date.now()
    let { events, facts, timedOut } = await waitTurnEnd(sid, baseEnds)
    // MiniMax occasionally ends reasoning with no committed output: one
    // transparent retry (recorded, never silent).
    if (timedOut === true || facts.emptyFinish === true) {
      entry.emptyFinishFirst = true
      log(`  [${scenarioKey}#${index}] 空收尾观测（attempt ${attempt}）——新会话重试并如实记录`)
      await page.close()
      if (attempt >= 2) {
        record({ ...entry, ok: false, reason: 'empty-finish ×2', durationMs: Date.now() - t0 })
        return { ...entry, ok: false }
      }
      return runOne(context, scenarioKey, index, attempt + 1)
    }
    entry.durationMs = Date.now() - t0
    const logChecks = spec.logChecks(facts)
    if (spec.payloadCheck !== undefined) logChecks.push(spec.payloadCheck(facts))
    const logPass = logChecks.map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.locator(`[data-testid="ask-choice"], [data-testid="draft-card-v3"], [data-testid="report-card"], [data-testid="plan-card"], [data-testid="approval-card"]`).first().waitFor({ timeout: 15_000 }).catch(() => null)
    await sleep(1_000)
    const domPass = (await spec.domChecks(page, facts)).map(([name, ok, detail = '']) => ({ name, ok, detail }))
    await page.screenshot({ path: `${OUT}/${shotFile}` })
    const ok = spec.observe !== true && [...logPass, ...domPass].every((c) => c.ok)
    entry.cardTypes = facts.presentCards.map((c) => c.type)
    entry.cardSteps = facts.presentCards.map((c) => `${c.turn}:${c.step}`)
    entry.turnEndReason = facts.turnEnds.at(-1)?.reason
    entry.fenceLeak = facts.fenceLeak
    entry.checks = { logPass, domPass }
    entry.shot = shotFile
    entry.ok = ok
    record(entry)
    log(`  [${scenarioKey}#${index}] ${ok ? 'PASS' : spec.observe === true ? 'OBSERVED' : 'FAIL'} sid=${sid} cards=${entry.cardTypes.join(',')} ${entry.durationMs}ms`)
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
  const limitIdx = args.findIndex((a) => a === '--limit')
  const only = onlyArg !== undefined ? onlyArg.slice(7).split(',') : null
  let limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity
  if (!Number.isFinite(limit)) limit = Infinity
  const counts = { s1: 5, s2: 5, s3: 5, s4: 3, s5b: 1, s5: 2, s3f: 3, s1f: 2 }

  // Preflight: gateway liveness + persona projection consistency.
  const pre = {}
  pre.gatewayMobile = await fetch('http://127.0.0.1:3080/mobile').then((r) => r.status).catch(() => String('error'))
  const personaSrc = readFileSync('examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml')
  const personaProj = readFileSync('examples/kb-agent/.dsh/.agent-presets/mobile-form-assistant/agent.cordis.yml')
  pre.personaProjectionInSync = personaSrc.equals(personaProj)
  log(`preflight: /mobile=${pre.gatewayMobile} persona-projection-sync=${pre.personaProjectionInSync}`)
  if (pre.gatewayMobile !== 200 || !pre.personaProjectionInSync) {
    writeFileSync(`${OUT}/p3-matrix-preflight.json`, JSON.stringify({ at: new Date().toISOString(), pre }, null, 2))
    log('preflight FAILED — aborting matrix')
    process.exitCode = 1
    return
  }
  writeFileSync(`${OUT}/p3-matrix-preflight.json`, JSON.stringify({ at: new Date().toISOString(), pre }, null, 2))

  const browser = await chromium.launch()
  try {
    let currentUser = null
    let context = null
    for (const key of Object.keys(counts)) {
      if (only !== null && !only.includes(key)) continue
      const spec = SCENARIOS[key]
      const finished = doneRuns().filter((r) => r.scenario === key && (r.ok === true || r.observe === true || spec.observe === true))
      const doneIdx = new Set(finished.map((r) => r.index))
      let launched = 0
      for (let i = 1; i <= counts[key] && launched < limit; i++) {
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
        launched++
      }
    }
  } finally {
    await browser.close()
    writeFileSync(`${OUT}/p3-matrix-console.log`, `${LOG.join('\n')}\n`)
  }

  // Summary table from the ledger.
  const runs = doneRuns()
  const summary = {}
  for (const key of Object.keys(counts)) {
    const mine = runs.filter((r) => r.scenario === key)
    const pass = mine.filter((r) => r.ok === true).length
    const fail = mine.filter((r) => r.ok === false).length
    summary[key] = { label: SCENARIOS[key].label, required: counts[key], pass, fail, emptyFinishFirst: mine.some((r) => r.emptyFinishFirst === true) }
  }
  writeFileSync(`${OUT}/p3-matrix-summary.json`, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2))
  log('\n== matrix summary ==')
  for (const [key, s] of Object.entries(summary)) log(`${key} ${s.label}: pass=${s.pass}/${s.required} fail=${s.fail} emptyFinishFirst=${s.emptyFinishFirst}`)
  // The exit code mirrors the matrix outcome (W21-R4, same repair as
  // w21-r2-matrix): a judged leg with a recorded failure or an unmet pass
  // count fails the run — previously only the preflight set a non-zero code.
  // --only judges its selection; the legs it excludes are not in the ledger.
  const judged = Object.keys(summary).filter((key) => only === null || only.includes(key))
  const failed = judged.some((key) => summary[key].fail > 0 || summary[key].pass < summary[key].required)
  process.exitCode = failed ? 1 : 0
  log(`matrix verdict: ${failed ? 'FAIL' : 'PASS'}`)
}

await main()
