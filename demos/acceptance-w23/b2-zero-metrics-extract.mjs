// W23-B2 追查2 final extractor: the three observed runs (z1/z4 with the
// buyer token, z2 the month report) read straight from the durable logs.
// Usage: node demos/acceptance-w23/b2-zero-metrics-extract.mjs
import { execSync } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'

const SESSDIR = 'examples/kb-agent/.dsh/sessions/--Users-mac-Documents-github-deepseek-harness--'
const RUNS = [
  { key: 'z1', sid: 'session-22453a0e-df4d-433f-8262-ff346e735532', input: '我有哪些待审批的单子？' },
  { key: 'z2', sid: 'session-453ee9d6-3da6-4417-9a9b-9234b0f7eb21', input: '这个月经营情况怎么样？给我出一份月报' },
  { key: 'z4', sid: 'session-f2df1566-d1c5-4eb4-a030-4d4739201b57', input: '查看我的待办' },
]
const out = []
for (const run of RUNS) {
  let sid = run.sid
  if (!existsSync(`${SESSDIR}/${sid}/session.jsonl.zstd`)) {
    // The z2 sid was logged with its real uuid; resolve it by the prompt text.
    const dirs = execSync(`grep -l '这个月经营情况怎么样？给我出一份月报' ${SESSDIR}/*/session.jsonl.zstd 2>/dev/null || true`).toString().trim().split('\n').filter(Boolean)
    const found = dirs.map(d => d.split('/').at(-2)).find(d => d.startsWith('session-53ee9d6')) ?? dirs[0]
    if (found === undefined) { console.log(`== ${run.key} log not found`); continue }
    sid = found
  }
  const text = execSync(`zstd -dc ${JSON.stringify(`${SESSDIR}/${sid}/session.jsonl.zstd`)}`, { maxBuffer: 1 << 26 }).toString()
  const events = text.trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const cards = []
  let narration = ''
  for (const ev of events) {
    if (ev.type === 'tool/call' && ev.data?.name === 'present_card') {
      try {
        let payload = JSON.parse(ev.data.arguments)?.payload
        if (typeof payload === 'string') payload = JSON.parse(payload)
        if (payload?.type === 'report') cards.push(payload)
      } catch { /* a parse failure is a degraded card, not a report face */ }
    }
    if (ev.type === 'assistant/message') {
      for (const block of ev.data?.message?.content ?? []) {
        if (block.type === 'text' && block.text) narration += `${block.text}\n`
      }
    }
  }
  const zeroMetrics = cards.flatMap(card => (card.metrics ?? []).filter(m => /^0(\.0*)?$/.test(String(m.value).trim())))
  const face = cards.map(card => [card.title, card.subtitle, ...(card.metrics ?? []).map(m => m.label), ...(card.actions ?? []).map(a => a.label)].filter(Boolean).join(' ')).join(' ; ')
  const leaks = face.match(/[a-z]+(?:_[a-z]+)+|RFC\s?4180|UTF-8|pur_orders|srm_suppliers|kpi_snapshots|approved_at/g) ?? []
  const sends = cards.flatMap(card => (card.actions ?? []).filter(a => a.kind === 'send').map(a => ({ label: a.label, text: a.text })))
  const englishWords = [...new Set((narration.match(/[a-zA-Z]{3,}/g) ?? [])
    .filter(w => !/GB|SC|OTIF|CSV|MRP|BOM|KPI|CCP|LOT|CERT|NST|DW|PO|PR|MO|QM|WMS|EAM|APS|SCM|PLM|MES|ERP|CRM|T\+/.test(w)))]
  out.push({
    key: run.key, sid, input: run.input,
    cards: cards.map(card => ({
      title: card.title, subtitle: card.subtitle ?? null,
      metrics: (card.metrics ?? []).map(m => `${m.label}=${m.value}`),
      actions: (card.actions ?? []).map(a => `${a.kind}:${a.label}${a.text !== undefined ? ` / ${a.text.slice(0, 60)}` : ''}`),
    })),
    zeroMetrics: zeroMetrics.map(m => m.label),
    terminologyLeaks: leaks,
    sendTexts: sends,
    englishWords: englishWords.slice(0, 10),
    narrativeTail: narration.slice(-220),
  })
  console.log(`== ${run.key} cards=${String(cards.length)} zeroMetrics=${JSON.stringify(zeroMetrics.map(m => m.label))} leaks=${JSON.stringify(leaks)} sends=${JSON.stringify(sends.map(s => (s.text ?? '').slice(0, 40)))} english=${JSON.stringify(englishWords.slice(0, 6))}`)
}
writeFileSync('demos/acceptance-w23/b2-zero-metrics.json', JSON.stringify(out, null, 2))
console.log('done')
