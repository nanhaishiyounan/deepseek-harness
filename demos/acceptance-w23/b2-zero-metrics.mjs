// W23-B2 追查2 + P1-5/P2-4/P2-6 live observation: three real-model report
// cards — zero-value metric compliance, card-face terminology, send-action
// phrasing, language purity.
// Usage: node demos/acceptance-w23/b2-zero-metrics.mjs
import { appendFileSync, writeFileSync } from 'node:fs'

const API = 'http://127.0.0.1:3080/api'
let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w23b2z-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then(r => r.json())
  if (res?.result?.ok === true) return res.result.value
  throw new Error(`${method}: ${JSON.stringify(res?.result?.error ?? res).slice(0, 200)}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 0-value prone scenarios: the audited c4 (my pending approvals), a c1-style
// month overview, and the export follow-up (send-action phrasing).
const CASES = [
  { key: 'z1', preset: 'enterprise-data-assistant', input: '我有哪些待审批的单子？' },
  { key: 'z2', preset: 'business-advisor', input: '这个月经营情况怎么样？给我出一份月报' },
  { key: 'z3', preset: 'enterprise-data-assistant', input: '把最近30天的采购订单导出成清单给我' },
]
const results = []
for (const c of CASES) {
  const created = await rpc('session.create', { agentPreset: c.preset })
  const sid = created.sessionId
  await rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: c.input }], clientTimeZone: 'Asia/Shanghai' })
  const t0 = Date.now()
  let cards = []
  let texts = []
  let degraded = 0
  for (let t = 0; t <= 240; t += 6) {
    await sleep(6000)
    const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
    const events = (value?.events ?? []).map(e => e?.event ?? e).filter(Boolean)
    cards = []
    texts = []
    degraded = 0
    for (const e of events) {
      if (e.type === 'tool/call' && e.data?.name === 'present_card') {
        try {
          const payload = JSON.parse(e.data.arguments)?.payload
          if (payload?.type === 'report') cards.push(payload)
        } catch { degraded += 1 }
      }
      if (e.type === 'assistant/message') {
        for (const block of e.data?.message?.content ?? []) {
          if (block.type === 'text' && block.text !== '') texts.push(block.text)
        }
      }
    }
    const running = events.some(e => e.type === 'turn/start') && !events.some(e => e.type === 'turn/end')
    if (!running && t > 24) break
  }
  const joined = texts.join('\n')
  const cardFaces = cards.map(card => ({
    title: card.title, subtitle: card.subtitle ?? null,
    metrics: (card.metrics ?? []).map(m => ({ label: m.label, value: m.value })),
    actions: (card.actions ?? []).map(a => ({ kind: a.kind, label: a.label, text: a.text ?? null })),
  }))
  const entry = {
    key: c.key, preset: c.preset, input: c.input,
    at: new Date().toISOString(), sid,
    seconds: Math.round((Date.now() - t0) / 1000),
    cards: cardFaces,
    zeroMetricCount: cardFaces.reduce((sum, card) => sum + card.metrics.filter(m => String(m.value).trim() === '0' || /^0(\.0*)?$/.test(String(m.value))).length, 0),
    terminologyLeaks: cardFaces.reduce((sum, card) => {
      const face = [card.title, card.subtitle, ...card.metrics.map(m => m.label), ...(card.actions ?? []).map(a => a.label)].filter(Boolean).join(' ')
      const leaks = face.match(/[a-z]+_[a-z_]+|RFC\s?4180|UTF-8|pur_orders|srm_suppliers|kpi_snapshots|approved_at/g) ?? []
      return sum + leaks.length
    }, 0),
    sendTexts: cardFaces.flatMap(card => card.actions.filter(a => a.kind === 'send').map(a => a.text)),
    englishWords: (joined.match(/[a-zA-Z]{3,}/g) ?? []).filter(w => !/GB|SC|OTIF|PTO|CSV|AI|MRP|BOM|KPI|CCP|LOT|CERT|NST|DW|PO|PR|MO|QM|WMS|EAM|APS|SCM|PLM|MES|ERP|CRM/.test(w)),
    degraded,
    narrativeSample: joined.slice(0, 160),
  }
  results.push(entry)
  console.log(`[${c.key}] cards=${entry.cards.length} zeroMetrics=${entry.zeroMetricCount} termLeaks=${entry.terminologyLeaks} sendTexts=${JSON.stringify(entry.sendTexts)} englishWords=${JSON.stringify(entry.englishWords.slice(0, 6))}`)
}
writeFileSync('demos/acceptance-w23/b2-zero-metrics.json', JSON.stringify(results, null, 2))
appendFileSync('demos/acceptance-w23/b2-zero-metrics.jsonl', results.map(r => JSON.stringify({ key: r.key, zeroMetricCount: r.zeroMetricCount, terminologyLeaks: r.terminologyLeaks, sendTexts: r.sendTexts })).join('\n') + '\n')
console.log('done')
