// W3-B4 the fail-loud negative probes: each case plants one broken config
// row, asserts the consistency probe refuses (with the right message class),
// then removes the row and asserts the library carries no residue and the
// probe returns green. The probe itself never writes (psql 只读实查原则).
import { signInWithRetry, dataOf, call } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'
import { assertWflConsistency } from '../../examples/kb-agent/scripts/nocobase-w3-approval-visual.mts'

const token = await signInWithRetry()
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
const rowsOf = async (collection, filter) => {
  const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
  return (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`)) ?? []
}
const greenFirst = await assertWflConsistency(token)
if (greenFirst.length !== 0) throw new Error(`负例前置失败：基线探针已是红（${greenFirst.join('；')}）`)

const failures = []
const scenario = async (label, plant, wantedFragment, cleanup) => {
  const planted = await plant()
  const red = await assertWflConsistency(token)
  const hit = red.some(message => message.includes(wantedFragment))
  console.log(`${hit ? '✓' : '✗'} ${label} — 探针红 ${red.length} 处${hit ? `（含「${wantedFragment}」）` : `，但缺关键字「${wantedFragment}」：${red.join('；').slice(0, 160)}`}`)
  if (!hit) failures.push(label)
  await cleanup(planted)
  const residue = (await rowsOf('wfl_flow_transitions', { condition_expr: '__W3B4_NEGATIVE__' })).length
    + (await rowsOf('wfl_flow_configs', { title: '__W3B4_NEGATIVE__' })).length
  const greenAfter = await assertWflConsistency(token)
  const clean = residue === 0 && greenAfter.length === 0
  console.log(`${clean ? '✓' : '✗'} ${label} — 清理后库内无残留且探针复绿（residue=${String(residue)}，probe=${String(greenAfter.length)}）`)
  if (!clean) failures.push(`${label} 清理`)
}

console.log(`=== W3-B4 一致性负例×3 + 阈值漂移负例（fail-loud + 库内无残留）${stamp} ===`)

// ① orphan transition: a transition whose next_state names no state of the flow
await scenario(
  '负例① 孤儿转移（next_state 引用不存在的状态）',
  async () => {
    const pur = (await rowsOf('wfl_flow_configs', { doc_type: 'pur_orders' }))[0]
    return dataOf(token, 'POST', '/api/wfl_flow_transitions:create', {
      flow_id: pur.id, state: 'pending', action: 'approve', next_state: 'ghost_state',
      allowed_role: 'manager', condition_expr: '__W3B4_NEGATIVE__', allow_self_approval: true,
    })
  },
  '孤儿转移',
  async (row) => { await call(token, 'POST', `/api/wfl_flow_transitions:destroy?filterByTk=${row.id}`) },
)

// ② empty config_note on an active flow (the API twin of the form-required
//    refusal the browser journey proved: the whole submit was rejected)
await scenario(
  '负例② 激活流 config_note 为空（API 面对拍表单必填层）',
  async () => {
    const pur = (await rowsOf('wfl_flow_configs', { doc_type: 'pur_orders' }))[0]
    // The broken write itself (the form layer refuses this; the API twin
    // plants it so the probe's audit assertion has a live negative to catch).
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${pur.id}`, { config_note: '' })
    return pur
  },
  '审计缺失',
  async (row) => {
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${row.id}`, { config_note: `${row.config_note}\n${stamp} w3b4 negative-probe restore: config_note 复原（负例②清理）(operator=admin)` })
  },
)

// ③ double activation: a second active row for pur_orders breaks exclusivity
await scenario(
  '负例③ 同 doc_type 双激活行（激活互斥）',
  async () => {
    const pur = (await rowsOf('wfl_flow_configs', { doc_type: 'pur_orders' }))[0]
    return dataOf(token, 'POST', '/api/wfl_flow_configs:create', {
      doc_type: 'pur_orders', title: '__W3B4_NEGATIVE__', state_field: 'doc_status', is_active: true,
      approver_map: JSON.stringify({ manager: 'admin' }), extras: JSON.stringify({}),
      config_note: `${stamp} w3b4 negative-probe: 双激活负例（应被探针拒绝）(operator=admin)`,
    })
  },
  '激活互斥',
  async (row) => { await call(token, 'POST', `/api/wfl_flow_configs:destroy?filterByTk=${row.id}`) },
)

// ④ threshold drift: extras moved without the transition literal (the W2-B5
//    alignment guard; the "断链条件" negative from the task brief)
await scenario(
  '负例④ 阈值漂移（extras 改了、转移条件字面量没改）',
  async () => {
    const pur = (await rowsOf('wfl_flow_configs', { doc_type: 'pur_orders' }))[0]
    const extras = JSON.parse(pur.extras)
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${pur.id}`, {
      extras: JSON.stringify({ ...extras, amount_threshold: 180000 }),
      config_note: `${pur.config_note}\n${stamp} w3b4 negative-probe: extras.amount_threshold 200000→180000 漂移负例（条件未同步，应被拒）(operator=admin)`,
    })
    return pur
  },
  '阈值漂移',
  async (row) => {
    const extras = JSON.parse(row.extras)
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${row.id}`, {
      extras: JSON.stringify(extras),
      config_note: `${row.config_note}\n${stamp} w3b4 negative-probe restore: 阈值复原 180000→200000（负例④清理）(operator=admin)`,
    })
  },
)

if (failures.length > 0) {
  console.error(`\nW3-B4 负例 FAILED: ${failures.join('；')}`)
  process.exitCode = 1
} else {
  console.log('\nW3-B4 负例全部 fail-loud 且清理后无残留：孤儿转移 / 空审计（API面）/ 双激活 / 阈值漂移')
}
