// W23-B2 追查1 live verification: after the maxOutputTokens fix, new sessions'
// titles land through the LLM provider (not the first-prompt fallback).
// Usage: node demos/acceptance-w23/b2-title.mjs
import { appendFileSync } from 'node:fs'

const API = 'http://127.0.0.1:3080/api'
let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w23b2t-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then(r => r.json())
  if (res?.result?.ok === true) return res.result.value
  throw new Error(`${method}: ${JSON.stringify(res?.result?.error ?? res).slice(0, 200)}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CASES = [
  { preset: 'enterprise-data-assistant', input: '帮我查一下最近30天的采购订单' },
  { preset: 'business-advisor', input: '糯米粉的库存还剩多少？库存上有什么风险吗' },
]
for (const c of CASES) {
  const created = await rpc('session.create', { agentPreset: c.preset })
  const sid = created.sessionId
  await rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: c.input }], clientTimeZone: 'Asia/Shanghai' })
  const t0 = Date.now()
  let landed = null
  for (let t = 0; t <= 90; t += 5) {
    await sleep(5000)
    const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
    const events = (value?.events ?? []).map(e => e?.event ?? e).filter(Boolean)
    const providerTitle = events.filter(e => e.type === 'session/title' && e.data?.source?.kind === 'provider').at(-1)
    if (providerTitle !== undefined) { landed = providerTitle; break }
    const running = events.some(e => e.type === 'turn/start') && !events.some(e => e.type === 'turn/end')
    if (!running && t > 45) break
  }
  const verdict = landed === null ? 'FALLBACK' : 'LLM'
  console.log(`[${c.preset}] ${landed === null ? 'still fallback' : `provider title "${landed.data.title}"`} at t=${Math.round((Date.now() - t0) / 1000)}s → ${verdict}`)
  appendFileSync('demos/acceptance-w23/b2-title-results.jsonl', JSON.stringify({
    at: new Date().toISOString(), sid, preset: c.preset, input: c.input,
    verdict, title: landed?.data?.title ?? null,
  }) + '\n')
}
