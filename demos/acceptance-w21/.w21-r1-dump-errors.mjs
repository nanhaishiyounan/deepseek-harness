// Dump the errored present_card tool-result texts for the failing W21-R1 runs,
// scoped to this matrix's turns (the r4 continuation session carries P3-era
// historical errors that must not be re-counted).
import { readFileSync } from 'node:fs'

const API = 'http://127.0.0.1:3080/api'
let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `dump-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then((r) => r.json())
  return res?.result?.ok === true ? res.result.value : undefined
}

const sessions = {
  's3#1': 'session-34f64ebc-e988-408f-9eb3-825936bde3f2',
  's3#3': 'session-74bf1139-6d18-48c4-977d-a5885ff8972d',
  'r4': 'session-07dac775-6ea9-4e5f-bf6b-09b8cb11e49f',
}

for (const [tag, sid] of Object.entries(sessions)) {
  const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
  const events = (value?.events ?? []).map((e) => e?.event ?? e).filter(Boolean)
  const cardCallIds = new Set(events.filter((e) => e?.type === 'tool/call' && e.data?.name === 'present_card').map((e) => e.data.callId))
  console.log(`\n===== ${tag} ${sid} =====`)
  for (const e of events) {
    if (e?.type === 'tool/result' && e.data?.message?.source?.kind === 'tool' && cardCallIds.has(e.data.message.source.callId)) {
      const block = (e.data.message.content ?? []).find((c) => c.type === 'tool-result')
      if (block?.isError === true) {
        console.log(`[err seq=${e.seq} turn=${e.data.turn} callId=${e.data.message.source.callId}]`)
        console.log(String(block.content?.[0]?.text ?? '').slice(0, 600))
      }
    }
    if (e?.type === 'tool/call' && e.data?.name === 'present_card') {
      const args = e.data.arguments
      let shape
      try {
        const p = JSON.parse(args).payload
        shape = typeof p === 'string' ? `string:${JSON.parse(p).type}` : `${p?.type}`
      } catch { shape = 'unparseable' }
      console.log(`[call seq=${e.seq} turn=${e.data.turn} step=${e.data.step} shape=${shape}]`)
    }
  }
}
