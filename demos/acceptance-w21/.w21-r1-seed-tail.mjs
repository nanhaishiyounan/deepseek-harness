import { readFileSync, writeFileSync } from 'node:fs'

// Usage: node .w21-r1-seed-tail.mjs <kind>
//   kind=approval  → turn5 approval_pending (numeric leaves), turn6 plan_suggest (stringified payload)
//   kind=report    → turn5 report (numeric cells) only, for the crash bisection
//   kind=plain     → turn5 without any tool call, for the crash bisection
const kind = process.argv[2] ?? 'approval'
const p = 'apps/web/tests/snapshots/mobile-assistant-toolcard/session.jsonl'
const base = readFileSync('/tmp/s35.jsonl', 'utf8').split('\n').filter(l => l.trim())
const receipt = '卡片已呈现，本回合到此结束；用户的点选或确认将作为下一条用户消息到达，禁止替用户作答。'

const frame = (turn, open) => JSON.stringify(open
  ? { type: 'turn/start', data: { turn, trigger: { kind: 'message', source: { kind: 'user', rpcId: '{{rpcId}}' } } } }
  : { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
const step = turn => JSON.stringify({ type: 'step/start', data: { turn, step: 1 } })
const stepEnd = turn => JSON.stringify({ type: 'step/end', data: { turn, step: 1 } })
const user = (turn, id, text) => JSON.stringify({
  type: 'user/message',
  data: { id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user', rpcId: '{{rpcId}}' } },
  surfaceOp: 'append',
})
// The legacy seed writes every model/tool event with the fixed `turn:1,step:1`
// grouping (only turn/start, step events, and turn/end carry the real turn) —
// replay groups model events by these fields, so the appended turns imitate
// the existing bytes rather than the semantic turn numbers.
const asst = (turn, id, text) => JSON.stringify({
  type: 'assistant/message',
  data: {
    turn: 1, step: 1,
    message: { id, role: 'assistant', source: { kind: 'model', provider: 'minimax', model: 'MiniMax-M3' }, content: [{ type: 'text', text }] },
    provenance: { provider: 'minimax', model: 'MiniMax-M3' },
  },
  surfaceOp: 'append',
})
const call = (turn, callId, payloadArg) => JSON.stringify({
  type: 'tool/call',
  data: { turn: 1, step: 1, callId, name: 'present_card', arguments: JSON.stringify(payloadArg) },
})
const result = (turn, callId) => JSON.stringify({
  type: 'tool/result',
  data: {
    turn: 1, step: 1,
    message: {
      id: `e2e-result-${callId}`, role: 'user', source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, isError: false, content: [{ type: 'text', text: receipt }] }],
    },
  },
  surfaceOp: 'append',
})

const approval = {
  v: 3, type: 'approval_pending', id: 7,
  doc: { collection: 'pur_orders', label: '采购单', docId: 1042, title: '鲜丰冷链箱采购' },
  applicant: '采购员·蔡俊',
  summary: [
    { label: '数量', value: 100, kind: 'count' },
    { label: '金额', value: 6400, kind: 'money' },
  ],
}
const numericReport = {
  v: 3, type: 'report', id: 42, title: '糯米粉库存',
  metrics: [
    { label: '现有数量', value: 15800.11, kind: 'count' },
    { label: '库位数', value: 2, kind: 'count', tone: 'positive' },
  ],
  table: {
    columns: [
      { label: '库位', kind: 'text' },
      { label: '现有', kind: 'count' },
    ],
    rows: [['bin7', 15800.11], ['bin87', 2]],
  },
}
const planStr = JSON.stringify({ v: 3, type: 'plan_suggest', id: 13, suggestionId: 207, planType: 'MO', product: '糯米粉', qty: 500, suggestDate: '2026-10-12' })

const turn5 = payload5 => [
  frame(5, true), user(5, 'e2e-user-5', '有什么待我审批的'), step(5), asst(5, 'e2e-asst-5', '有一张待审：'),
  ...(payload5 === undefined ? [] : [call(5, 'call-pc-5', { payload: payload5 }), result(5, 'call-pc-5')]),
  stepEnd(5), frame(5, false),
]
const turn6 = [
  frame(6, true), user(6, 'e2e-user-6', '有什么计划建议'), step(6), asst(6, 'e2e-asst-6', '系统给了两条建议：'),
  call(6, 'call-pc-6', { payload: planStr }), result(6, 'call-pc-6'), stepEnd(6), frame(6, false),
]

const tail = kind === 'report'
  ? turn5(numericReport)
  : kind === 'plain' ? turn5(undefined) : [...turn5(approval), ...turn6]
writeFileSync(p, `${base.concat(tail).join('\n')}\n`)
console.log(`${kind}: ${base.length + tail.length} lines`)
