// Push the follow-up message into the running registration session (the
// model asked to switch material because the demo catalog names differ).
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
      content: [{ type: 'text', text: '换物料：用水磨糯米粉 25kg，供应商用味之源调味食品股份有限公司，数量 80 袋，单价 98' }],
      loginUser: { username: 'buyer', nickname: '采购员·蔡俊' },
    },
  }),
}).then(x => x.json())
console.log('prompted', target.sessionId, JSON.stringify(sent.result?.ok))
