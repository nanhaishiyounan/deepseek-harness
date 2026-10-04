// Retry the registration confirm in the same session (the draft is already
// confirmed once and refused by the numbering bug — now fixed, re-confirm).
const list = await fetch('http://127.0.0.1:3080/api/session.list', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'session.list', payload: {} }),
}).then(x => x.json())
const target = (list.result?.value?.items ?? [])
  .filter(s => s.agentPreset === 'mobile-form-assistant')
  .sort((a, b) => b.updatedAt - a.updatedAt)[0]
if (!target) throw new Error('no session')
const sent = await fetch('http://127.0.0.1:3080/api/session.prompt', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    type: 'client-request', rpcId: 'r2', method: 'session.prompt',
    payload: {
      sessionId: target.sessionId, mode: 'queue',
      content: [{ type: 'text', text: '需求日期 2026-10-08。信息全齐了，直接确认写入这张采购单（编号留空由服务端分配），落库后把回执给我' }],
      loginUser: { username: 'buyer', nickname: '采购员·蔡俊' },
    },
  }),
}).then(x => x.json())
console.log('re-prompted', target.sessionId, JSON.stringify(sent.result?.ok))
