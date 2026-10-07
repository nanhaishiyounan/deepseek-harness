// W21-P3 replay legs: history replay determinism for the dual-source fold.
//   R1 pre-P1 fence session 07dac775 (report fence) — legacy path renders. [done]
//   R2 W-round complaint session 8bbc5505 — the fence choice card carries the
//      fence-era type name "choice" (not ask_choice) and has ALWAYS degraded
//      (folded) client-side; the replay assertion pins that historical state
//      is preserved identically (folded, content expandable), not re-broken.
//   R3 P1-era present_card session a035ed7d (宏发食品 ask_choice). [done]
//   R4 mixed: continue the CLEAN fence session 07dac775 with a fresh 采购
//      message → new present_card ask_choice lands beside the legacy fence
//      report card; reload and assert both sources on one screen.
//   R5 S1#1 session reload ×3 — consistent card rendering across reopens. [done]
// Usage: node demos/acceptance-w21/p3-replay.mjs [--only r2,r4]
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const API = 'http://127.0.0.1:3080/api'
const OUT = 'demos/acceptance-w21'
const TURN_TIMEOUT_MS = 240_000
const POLL_MS = 5_000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const LOG = []
const log = (line) => { console.log(line); LOG.push(line) }
const RESULTS = []

let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `p3r-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}
const historyEvents = async (sid) => {
  const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
  return (value?.events ?? []).map((entry) => entry?.event ?? entry).filter(Boolean)
}
const countTurnEnds = (events) => events.filter((e) => e?.type === 'turn/end').length
const maxSeqOf = (events) => events.reduce((m, e) => Math.max(m, Number(e.seq ?? 0)), 0)

const login = async (page, user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const openAndSnap = async (page, sid) => {
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
  await sleep(2_500)
  return page.locator('main').ariaSnapshot().catch(() => '')
}

const main = async () => {
  const only = process.argv.slice(2).find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? null
  const want = (leg) => only === null || only.includes(leg)
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  try {
    await login(page, 'buyer', 'Buyer#2026')

    if (want('r1')) {
      const sid = 'session-07dac775-6ea9-4e5f-bf6b-09b8cb11e49f'
      const snap = await openAndSnap(page, sid)
      const ok = snap.includes('库存查询') && snap.includes('2,115') && !snap.includes('```dsh')
      await page.screenshot({ path: `${OUT}/p3-replay-r1-fence-report.png` })
      RESULTS.push({ leg: 'r1-fence-report', sessionId: sid, ok })
      log(`[replay r1-fence-report] ${ok ? 'PASS' : 'FAIL'} legacy fence report renders`)
    }

    if (want('r2')) {
      // The fence choice card in this session rode the fence-era type name
      // "choice"; it has degraded (folded) since the day it was written. The
      // replay contract: the historical folded state stays identical and the
      // content is still there (expandable), never silently dropped.
      const sid = 'session-8bbc5505-aa6f-44c2-b016-df8cc6f740b0'
      const snap = await openAndSnap(page, sid)
      const folded = snap.includes('结构化消息（格式异常，已折叠）')
      await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true })
      await sleep(300)
      const expanded = await page.locator('main').ariaSnapshot().catch(() => '')
      const contentKept = expanded.includes('这次向哪家采购面粉？') || expanded.includes('山东鲁丰')
      const ok = folded && contentKept && !snap.includes('```dsh')
      await page.screenshot({ path: `${OUT}/p3-replay-r2-fence-choice.png` })
      RESULTS.push({ leg: 'r2-fence-choice-historical-degraded', sessionId: sid, ok, folded, contentKept, note: 'fence-era type "choice" degraded since creation — fossil of the probabilistic era, not a P1/P2 regression' })
      log(`[replay r2-fence-choice] ${ok ? 'PASS' : 'FAIL'} folded=${folded} content-kept=${contentKept} (historical degraded state preserved)`)
    }

    if (want('r3')) {
      const sid = 'session-a035ed7d-6166-4f23-81d9-5956a364bd25'
      const snap = await openAndSnap(page, sid)
      const ok = snap.includes('宏发食品') && !snap.includes('```dsh')
      await page.screenshot({ path: `${OUT}/p3-replay-r3-toolcard.png` })
      RESULTS.push({ leg: 'r3-toolcard', sessionId: sid, ok })
      log(`[replay r3-toolcard] ${ok ? 'PASS' : 'FAIL'} present_card ask renders`)
    }

    if (want('r4')) {
      // Mixed: continue the clean fence session with the tool contract.
      const sid = 'session-07dac775-6ea9-4e5f-bf6b-09b8cb11e49f'
      const before = await historyEvents(sid)
      const baseEnds = countTurnEnds(before)
      const baseSeq = maxSeqOf(before)
      await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
      await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 20_000 })
      await page.getByPlaceholder('问我任何经营问题...').fill('向鲜丰采购面粉，数量100，单价10')
      await page.getByRole('button', { name: '发送' }).click()
      let done = false
      const deadline = Date.now() + TURN_TIMEOUT_MS
      while (!done && Date.now() < deadline) {
        done = countTurnEnds(await historyEvents(sid)) > baseEnds
        if (!done) await sleep(POLL_MS)
      }
      const events = await historyEvents(sid)
      const newCalls = events.filter((e) => e?.type === 'tool/call' && e.data?.name === 'present_card' && Number(e.seq) > baseSeq)
      const newResults = events.filter((e) => e?.type === 'tool/result' && Number(e.seq) > baseSeq)
        .map((e) => ({ isError: ((e.data?.message?.content ?? []).find((c) => c.type === 'tool-result') ?? {}).isError === true }))
      let cardType
      try { cardType = JSON.parse(newCalls.at(-1)?.data?.arguments ?? '{}').payload?.type } catch { cardType = undefined }
      await sleep(2_500)
      const snap = await page.locator('main').ariaSnapshot().catch(() => '')
      const fenceVisible = snap.includes('库存查询')
      const newCardVisible = snap.includes('鲜丰') && !snap.slice(snap.lastIndexOf('鲜丰') - 2000).includes('已折叠')
      const ok = done && newCalls.length >= 1 && newResults.every((r) => !r.isError) && cardType === 'ask_choice' && fenceVisible && newCardVisible && !snap.includes('```dsh')
      await page.screenshot({ path: `${OUT}/p3-replay-r4-mixed.png` })
      RESULTS.push({ leg: 'r4-mixed', sessionId: sid, ok, turnDone: done, newPresentCards: newCalls.length, cardType, allResultsOk: newResults.every((r) => !r.isError), fenceCardVisible: fenceVisible, newCardVisible })
      log(`[replay r4-mixed] ${ok ? 'PASS' : 'FAIL'} fence-card=${fenceVisible} new-${cardType}-card=${newCardVisible} newCalls=${newCalls.length} resultsOk=${newResults.every((r) => !r.isError)}`)
    }

    if (want('r5')) {
      const sid = 'session-fd6e892b-01de-43bc-a9db-a18e9979f565'
      const snaps = []
      for (let i = 1; i <= 3; i++) {
        const snap = await openAndSnap(page, sid)
        snaps.push({ okCard: snap.includes('鲜丰'), len: snap.length })
        log(`[replay r5-reopen] #${i} card-visible=${snaps[i - 1].okCard} len=${snap.length}`)
        await page.screenshot({ path: `${OUT}/p3-replay-r5-reopen-${i}.png` })
      }
      const ok = snaps.every((s) => s.okCard) && new Set(snaps.map((s) => s.len)).size === 1
      RESULTS.push({ leg: 'r5-reopen-x3', sessionId: sid, ok, reopen: snaps })
      log(`[replay r5-reopen-x3] ${ok ? 'PASS' : 'FAIL'} identical snapshots across 3 reopens`)
    }
  } finally {
    await browser.close()
    writeFileSync(`${OUT}/p3-replay-results.json`, JSON.stringify({ at: new Date().toISOString(), legs: RESULTS }, null, 2))
    writeFileSync(`${OUT}/p3-replay-console.log`, `${LOG.join('\n')}\n`)
  }
  if (RESULTS.some((r) => r.ok !== true)) process.exitCode = 1
}

await main()
