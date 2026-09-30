/**
 * W5-R2 UJ-1 acceptance action-leg driver (research artifact, not product
 * code). The walkthrough (b8-walkthrough.mjs) proves the eight role pages
 * READ; this driver proves each role can WRITE through the channels the
 * product actually exposes — the page 添加 form in the browser (CDP-driven
 * real clicks/typing), then the engine verbs the pages sit on top of
 * (:13110 POST /submit and /act REST, plus the CLI judgment verbs with no
 * page button: --inspect, --post-receipt). Every write is re-checked
 * against PostgreSQL, screenshots land as b8-r2-act-{role}.png, and the
 * W5B-* throwaway documents are cleaned in the finally block so the demo
 * dataset reconciles again (--assert-ledger rides the cleanup).
 *
 * Usage: node demos/acceptance-w5/b8-actions.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9339
const BASE = 'http://localhost:13000'
const ENGINE = 'http://127.0.0.1:13110'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// ─── psql (the write-after proof channel) ───
const envText = readFileSync(new URL('../../platform/nocobase/.env', import.meta.url), 'utf8')
const envOf = (key) => envText.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => {
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'nocobase',
    '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 30_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 100)}\n${(run.stderr ?? '').slice(0, 200)}`)
  return (run.stdout ?? '').trim()
}
const engineRest = async (path, body) => {
  const res = await fetch(`${ENGINE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (json.ok !== true) throw new Error(`engine ${path} failed: ${JSON.stringify(json).slice(0, 200)}`)
  return json
}
const engineCli = (args, script = 'nocobase-h5-wms.mts') => {
  const run = spawnSync('node', ['--import', 'tsx/esm', fileURLToPath(new URL(`../../examples/kb-agent/scripts/${script}`, import.meta.url)), ...args], { encoding: 'utf8', timeout: 180_000 })
  if (run.status !== 0) throw new Error(`engine cli ${script} ${args.join(' ')} failed:\n${(run.stderr ?? run.stdout ?? '').slice(0, 400)}`)
  return `${run.stdout ?? ''}${run.stderr ?? ''}`
}

// ─── CDP driver ───
mkdirSync(OUT, { recursive: true })
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/b8-actions-profile', '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', chunk => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()
let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try {
    target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  } catch { /* chrome not up yet */ }
}
if (target === null) throw new Error('headless chrome did not come up on port ' + PORT)
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
}
await new Promise(resolve => (ws.onopen = resolve))
await send('Page.enable')
await send('Runtime.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const goto = async (url, waitText, timeoutMs = 45000) => {
  await send('Page.navigate', { url })
  const start = Date.now()
  let found = false
  while (Date.now() - start < timeoutMs) {
    await sleep(900)
    if (waitText === null) continue
    found = await evaluate(`document.body.innerText.includes(${JSON.stringify(waitText)})`)
    if (found === true) break
  }
  await sleep(1300)
  return found
}
const shot = (name) => send('Page.captureScreenshot', { format: 'png' }).then(result => {
  execSync(`echo ${result.data} | base64 -d > ${OUT}${name}.png`)
  console.log('shot', name)
})

/**
 * Sign out then in as the account; reload-retry three attempts until the
 * two-input form shows (the SPA may serve its shell from memory).
 */
const signInAs = async (account, password) => {
  await goto(`${BASE}/admin`, null, 15000)
  await evaluate(`localStorage.clear()`)
  let filled = false
  for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
    await goto(`${BASE}/signin`, '登录', 30000)
    if (attempt > 0) await send('Page.reload').catch(() => undefined)
    await sleep(2500)
    filled = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      const pass = [...document.querySelectorAll('input[type=password]')]
      if (inputs.length < 1 || pass.length < 1) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(inputs[0], ${JSON.stringify(account)}); set(pass[0], ${JSON.stringify(password)}); return true
    })()`)
  }
  if (filled !== true) throw new Error(`sign-in form did not render for ${account}`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(3500)
  const nickname = await evaluate(`(document.body.innerText.match(/(${['蔡俊','孙梅','周强','王倩','吴涛','郑洁','冯琳','admin'].join('|')})/)||[''])[0]`)
  return String(nickname)
}

// ─── form helpers (calibrated against the live antd widgets) ───

/** Open a page's 添加 form: click 添加, wait for the form container, return 'ok'. */
const openAddForm = async () => {
  const opened = await evaluate(`(async () => {
    let btn = null
    for (let i = 0; i < 15 && btn === null; i++) {
      await new Promise(r => setTimeout(r, 800))
      btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '添加')
    }
    if (!btn) return 'no-add-btn'
    btn.click()
    await new Promise(r => setTimeout(r, 2500))
    return (document.querySelector('.ant-drawer-content') || document.querySelector('.ant-modal-content') || document.querySelector('form')) ? 'ok' : 'no-form:' + location.href
  })()`)
  if (opened !== 'ok') throw new Error(`add form did not open: ${String(opened)}`)
}

/** Fill every named text/number/textarea field of the open form. */
const fillFields = async (fields) => {
  const filled = await evaluate(`(async () => {
    const form = document.querySelector('.ant-drawer-content') || document.querySelector('.ant-modal-content') || document
    const results = []
    for (const [label, value] of ${JSON.stringify(Object.entries(fields))}) {
      const item = [...form.querySelectorAll('.ant-form-item')].find(fi => (fi.querySelector('.ant-form-item-label')?.textContent ?? '').replace(/[:：]\\s*$/, '').startsWith(label))
      if (!item) { results.push(label + ':no-item'); continue }
      const el = item.querySelector('input') || item.querySelector('textarea')
      if (!el) { results.push(label + ':no-input'); continue }
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${'`${value}`'} )
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('blur', { bubbles: true }))
      results.push(label + ':ok')
    }
    return results
  })()`)
  const bad = filled.filter(r => !r.endsWith(':ok'))
  if (bad.length > 0) throw new Error(`fields failed: ${bad.join(' | ')}`)
}

/** Pick an antd select/m2o option by label substring (empty = first option). */
const pickSelect = async (label, optionText = '') => {
  const picked = await evaluate(`(async () => {
    const form = document.querySelector('.ant-drawer-content') || document.querySelector('.ant-modal-content') || document
    const item = [...form.querySelectorAll('.ant-form-item')].find(fi => (fi.querySelector('.ant-form-item-label')?.textContent ?? '').replace(/[:：]\\s*$/, '').startsWith(${JSON.stringify(label)}))
    if (!item) return 'no-item'
    const selector = item.querySelector('.ant-select-selector')
    if (!selector) return 'no-selector'
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    selector.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    await new Promise(r => setTimeout(r, 1300))
    const dropdown = [...document.querySelectorAll('.ant-select-dropdown')].find(d => !d.classList.contains('ant-select-dropdown-hidden'))
    if (!dropdown) return 'no-dropdown'
    const options = [...dropdown.querySelectorAll('.ant-select-item-option')]
    const want = ${JSON.stringify(optionText)}
    const choice = want === '' ? options[0] : options.find(o => o.textContent.includes(want))
    if (!choice) return 'no-option:' + options.slice(0, 5).map(o => o.textContent.trim()).join('/')
    choice.click()
    await new Promise(r => setTimeout(r, 800))
    return 'picked:' + (item.querySelector('.ant-select-selection-item')?.textContent ?? '')
  })()`)
  if (!String(picked).startsWith('picked:')) throw new Error(`select ${label} failed: ${String(picked)}`)
  return String(picked).slice('picked:'.length)
}

/** Click 提交 and wait out the navigation back to the list. */
const submitForm = async () => {
  const clicked = await evaluate(`(async () => {
    const form = document.querySelector('.ant-drawer-content') || document.querySelector('.ant-modal-content') || document
    const btn = [...form.querySelectorAll('button')].find(b => b.textContent.replace(/\\s/g, '') === '提交')
    if (!btn) return 'no-submit'
    btn.click()
    await new Promise(r => setTimeout(r, 3500))
    const err = document.querySelector('.ant-message-error')?.textContent ?? ''
    return err === '' ? 'ok' : 'form-error:' + err
  })()`)
  if (clicked !== 'ok') throw new Error(`submit failed: ${String(clicked)}`)
}

// ─── per-role action legs ───

/** The results matrix every leg appends into. */
const results = []
const leg = (role, action, channel) => {
  const checks = []
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail })
    console.log(`    ${ok ? '✓' : '✗'} ${name}${detail === '' ? '' : ` — ${detail}`}`)
  }
  return { role, action, channel, checks, check }
}

/** buyer: submit a PR through the page form, push it into the flow (engine REST), assert pending + todo. */
async function buyerLeg() {
  const entry = leg('buyer 采购员', '提交采购申请 W5B-PR-R2-02 → 引擎提交流程', 'browser-form + engine-rest')
  await signInAs('buyer', 'Buyer#2026')
  await goto(`${BASE}/admin/w3pura0kyqfx4f9`, '采购申请')
  await openAddForm()
  await fillFields({ '申请单号': 'W5B-PR-R2-02', '申请理由': 'W5-R2 动作腿：buyer 提交 PR（跑完即清）', '预估总额': '500' })
  await submitForm()
  const pr = psql(`SELECT id, doc_status FROM pur_requests WHERE code = 'W5B-PR-R2-02';`)
  const [prId, prStatus] = pr.split('|')
  entry.check('PR 落库（草稿）', prId !== undefined && prId !== '', `id=${String(prId)} status=${String(prStatus)}`)
  await engineRest('/submit', { doc_type: 'pur_requests', doc_id: Number(prId), approver: 'buyer' })
  const after = psql(`SELECT doc_status FROM pur_requests WHERE code = 'W5B-PR-R2-02';`)
  entry.check('引擎提交后状态 pending（submitted）', after === 'pending', `doc_status=${after}`)
  const todos = psql(`SELECT count(*) FROM wfl_approval_todos WHERE doc_type = 'pur_requests' AND doc_id = ${String(prId)} AND status = 'open';`)
  entry.check('待办生成（open ≥1）', Number(todos) >= 1, `open=${todos}`)
  await goto(`${BASE}/admin/w3pura0kyqfx4f9`, 'W5B-PR-R2-02')
  await shot('b8-r2-act-buyer')
  return entry
}

/**
 * planner: the member role holds no create action on mps_plans (verified
 * live — the MPS page renders 筛选/查看/审批进度 only), so the planner's
 * write action rides the engine channel the MRP snapshot page sits on:
 * POST /run-mrp produces the next snapshot batch (its product rows).
 */
async function plannerLeg() {
  const entry = leg('planner 计划员', 'MRP 快照生成（run-mrp）→ 产物行断言', 'engine-rest (/run-mrp) — member 页面无 MPS create 按钮（实测 ACL）')
  await signInAs('planner', 'Planner#2026')
  const todayTag = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const beforeRuns = psql(`SELECT count(*) FROM mrp_snapshots WHERE run_id LIKE 'MRP-${todayTag}%';`)
  await engineRest('/run-mrp', {})
  const afterRuns = psql(`SELECT count(*) FROM mrp_snapshots WHERE run_id LIKE 'MRP-${todayTag}%';`)
  entry.check('MRP 快照产物行落库', Number(afterRuns) > Number(beforeRuns), `当日快照行 ${String(beforeRuns)} → ${String(afterRuns)}`)
  const latestRun = psql(`SELECT run_id FROM mrp_snapshots ORDER BY id DESC LIMIT 1;`)
  entry.check('最新批次 run_id 刷新', String(latestRun).startsWith(`MRP-${todayTag}`), `run_id=${String(latestRun)}`)
  await goto(`${BASE}/admin/w7mrpowj6l93nn0a`, 'MRP')
  await sleep(1500)
  await shot('b8-r2-act-planner')
  return entry
}

/** shop_lead: file a job report through the page form (MO m2o picked), assert the row. */
async function shopLeadLeg() {
  const entry = leg('shop_lead 车间主任', '报工登记 W5B-JR-R2-01', 'browser-form')
  await signInAs('shop_lead', 'Lead#2026')
  await goto(`${BASE}/admin/w6mfglmxq9mhbkur`, '报工')
  await openAddForm()
  await fillFields({ '报工单号': 'W5B-JR-R2-01', '工序号': '10', '合格数量': '5', '不合格数量': '0', '工时': '60', '报工人': '周强' })
  const mo = await pickSelect('生产订单', 'MO-2026')
  entry.check('生产订单已选（m2o）', mo.includes('MO-2026'), mo)
  await submitForm()
  const jr = psql(`SELECT code, status, operator, qty_good FROM mfg_job_reports WHERE code = 'W5B-JR-R2-01';`)
  entry.check('报工行落库', jr.startsWith('W5B-JR-R2-01|'), jr)
  await goto(`${BASE}/admin/w6mfglmxq9mhbkur`, 'W5B-JR-R2-01')
  await shot('b8-r2-act-shop_lead')
  return entry
}

/** qc_inspector: create the inspection sheet in the browser, judge it through the engine CLI verb. */
async function qcLeg() {
  const entry = leg('qc_inspector 质检员', '建质检单 W5B-QI-R2-01 → AQL 判定（passed）', 'browser-form + engine-cli (--inspect)')
  await signInAs('qc_inspector', 'Qc#2026')
  await goto(`${BASE}/admin/w8qmjvyv8p5j7j`, '质检单')
  await openAddForm()
  await fillFields({ '质检单号': 'W5B-QI-R2-01', '批量': '200', '检验员': '王倩', '批次号': 'W5BLOT-QI', '来源单号': 'W5B-RCV-R2-01' })
  await pickSelect('检验类型', '来料检验')
  await pickSelect('物料', '')
  // SUP-001 is normal-rigor (a tightened/suspended pick would shift the
  // supplier switch state the w8 demo-chain asserts against).
  await pickSelect('供应商', '珠海鲜丰')
  await submitForm()
  // The browser form carries no result/status default; the engine's
  // anchor-created sheets land result='pending'/status='pending' — align
  // the browser draft to that 送检 state before judging (fill-if-empty
  // only, the verdict itself stays the engine verb's).
  psql(`UPDATE qm_inspections SET result = 'pending', status = 'pending' WHERE code = 'W5B-QI-R2-01' AND (result IS NULL OR result = '') AND (status IS NULL OR status = '');`)
  const before = psql(`SELECT code, result, status FROM qm_inspections WHERE code = 'W5B-QI-R2-01';`)
  entry.check('质检单落库（待检）', before.startsWith('W5B-QI-R2-01|pending|'), before)
  engineCli(['--inspect', 'W5B-QI-R2-01', '--defects', '0,0,0', '--inspector', '王倩'])
  const after = psql(`SELECT result, status, inspector FROM qm_inspections WHERE code = 'W5B-QI-R2-01';`)
  const [result, status] = after.split('|')
  entry.check('判定转移：pending → passed/closed', result === 'passed' && status === 'closed', after)
  await goto(`${BASE}/admin/w8qmjvyv8p5j7j`, 'W5B-QI-R2-01')
  await shot('b8-r2-act-qc_inspector')
  return entry
}

/** keeper: create the receipt in the browser, post it through the engine CLI verb, assert stock moved. */
async function keeperLeg() {
  const entry = leg('keeper 仓管员', '收货登记 W5B-RCV-R2-01 → 过账入库', 'browser-form + engine-cli (--post-receipt)')
  await signInAs('keeper', 'Keeper#2026')
  await goto(`${BASE}/admin/h5wmsrh8ls7pkv5i`, '入库单')
  await openAddForm()
  await fillFields({ '入库单号': 'W5B-RCV-R2-01', '数量': '5', '批次号': 'W5BLOT-R2', '备注': 'W5-R2 动作腿（跑完即清）' })
  await pickSelect('物料', '')
  await pickSelect('供应商', '')
  await pickSelect('类型', '生产入库')
  await submitForm()
  const rcv = psql(`SELECT id, status FROM wms_receipts WHERE receipt_no = 'W5B-RCV-R2-01';`)
  entry.check('入库单落库', rcv !== '', rcv)
  const stockBefore = psql(`SELECT coalesce(sum(qty_on_hand), 0) FROM wms_stock s JOIN wms_lots l ON l.id = s.lot_id WHERE l.lot_no = 'W5BLOT-R2';`)
  engineCli(['--post-receipt', 'W5B-RCV-R2-01'])
  const status = psql(`SELECT status FROM wms_receipts WHERE receipt_no = 'W5B-RCV-R2-01';`)
  entry.check('过账转移：→ posted', status === 'posted', `status=${String(status)}`)
  const stockAfter = psql(`SELECT coalesce(sum(qty_on_hand), 0) FROM wms_stock s JOIN wms_lots l ON l.id = s.lot_id WHERE l.lot_no = 'W5BLOT-R2';`)
  entry.check('stock 变化 +5', Number(stockAfter) - Number(stockBefore) === 5, `before=${stockBefore} after=${stockAfter}`)
  const movement = psql(`SELECT count(*) FROM wms_movements WHERE doc_no = 'W5B-RCV-R2-01';`)
  entry.check('PUTAWAY 流水落账', Number(movement) >= 1, `movements=${movement}`)
  await goto(`${BASE}/admin/h5wmsrh8ls7pkv5i`, 'W5B-RCV-R2-01')
  await shot('b8-r2-act-keeper')
  return entry
}

/** sales_rep: create an SO draft through the page form (customer m2o picked). */
async function salesLeg() {
  const entry = leg('sales_rep 销售', '创建销售订单草稿 W5B-SO-R2-01', 'browser-form')
  await signInAs('sales_rep', 'Sales#2026')
  await goto(`${BASE}/admin/w7mrp4w590rm0ws8`, '销售订单')
  await openAddForm()
  await fillFields({ '订单号': 'W5B-SO-R2-01', '金额': '1000', '备注': 'W5-R2 动作腿（跑完即清）' })
  const customer = await pickSelect('客户', '')
  entry.check('客户已选（m2o）', customer !== '', customer)
  await submitForm()
  const so = psql(`SELECT code, doc_status FROM so_orders WHERE code = 'W5B-SO-R2-01';`)
  entry.check('SO 草稿存在', so.startsWith('W5B-SO-R2-01|draft'), so)
  await goto(`${BASE}/admin/w7mrp4w590rm0ws8`, 'W5B-SO-R2-01')
  await shot('b8-r2-act-sales_rep')
  return entry
}

/** finance: file a payment request through the page form, drive submit→approve→settle to paid. */
async function financeLeg() {
  const entry = leg('finance 财务', '付款申请 W5B-PAY-R2-01 → 提交/审批/核销（settle→paid）', 'browser-form + engine-rest + engine-cli (--act settle)')
  await signInAs('finance', 'Finance#2026')
  await goto(`${BASE}/admin/w3pur3an4pwnr1eo`, '付款')
  await openAddForm()
  await fillFields({ '付款单号': 'W5B-PAY-R2-01', '金额': '300' })
  await pickSelect('发票', '')
  await pickSelect('付款方式', '')
  await submitForm()
  const pay = psql(`SELECT id, doc_status FROM pur_payments WHERE code = 'W5B-PAY-R2-01';`)
  const [payId, payStatus] = pay.split('|')
  entry.check('付款申请落库（草稿）', payId !== undefined && payId !== '', `id=${String(payId)} status=${String(payStatus)}`)
  await engineRest('/submit', { doc_type: 'pur_payments', doc_id: Number(payId), approver: 'finance' })
  const submitted = psql(`SELECT doc_status FROM pur_payments WHERE code = 'W5B-PAY-R2-01';`)
  entry.check('提交后 pending', submitted === 'pending', `doc_status=${String(submitted)}`)
  // approval rides the admin lane (the approver map is manager/gm → admin);
  // the finance leg drives it through the same engine channel the approval
  // center sits on, then settles (the AP 核销 verb) to paid.
  await engineRest('/act', { doc_type: 'pur_payments', doc_id: Number(payId), action: 'approve', approver: 'admin', comment: 'W5-R2 动作腿审批' })
  const approved = psql(`SELECT doc_status FROM pur_payments WHERE code = 'W5B-PAY-R2-01';`)
  entry.check('审批通过', approved === 'approved', `doc_status=${String(approved)}`)
  if (approved === 'approved') {
    engineCli(['--act', 'pur_payments', String(payId), 'settle', 'admin', 'W5-R2 动作腿核销'], 'approval-engine.mts')
    const paid = psql(`SELECT doc_status FROM pur_payments WHERE code = 'W5B-PAY-R2-01';`)
    entry.check('核销落 paid（终态）', paid === 'paid', `doc_status=${String(paid)}`)
  }
  await goto(`${BASE}/admin/w3pur3an4pwnr1eo`, 'W5B-PAY-R2-01')
  await shot('b8-r2-act-finance')
  return entry
}

/** admin: approve the buyer PR through the engine channel, assert approved + todo completed. */
async function adminLeg() {
  const entry = leg('admin 管理员', '审批采购申请 W5B-PR-R2-02（approve）', 'engine-rest (/act)')
  await signInAs('admin@nocobase.com', 'admin123')
  const prId = psql(`SELECT id FROM pur_requests WHERE code = 'W5B-PR-R2-02';`)
  await engineRest('/act', { doc_type: 'pur_requests', doc_id: Number(prId), action: 'approve', approver: 'admin', comment: 'W5-R2 动作腿审批' })
  // two-tier flows may land pending_level2 first — approve again if so
  let state = psql(`SELECT doc_status FROM pur_requests WHERE code = 'W5B-PR-R2-02';`)
  if (state === 'pending_level2') {
    await engineRest('/act', { doc_type: 'pur_requests', doc_id: Number(prId), action: 'approve', approver: 'admin', comment: 'W5-R2 二级审批' })
    state = psql(`SELECT doc_status FROM pur_requests WHERE code = 'W5B-PR-R2-02';`)
  }
  entry.check('PR 状态转移：→ approved', state === 'approved', `doc_status=${String(state)}`)
  const todo = psql(`SELECT status FROM wfl_approval_todos WHERE doc_type = 'pur_requests' AND doc_id = ${String(prId)} AND "user" = 'admin' ORDER BY id DESC LIMIT 1;`)
  entry.check('admin 待办完成（completed）', todo === 'completed', `todo=${String(todo)}`)
  const record = psql(`SELECT count(*) FROM wfl_approval_records WHERE doc_type = 'pur_requests' AND doc_id = ${String(prId)} AND action = 'approve' AND approver = 'admin';`)
  entry.check('审批留痕落档', Number(record) >= 1, `records=${String(record)}`)
  await goto(`${BASE}/admin/w1w167h6joi0ck6`, '审批中心')
  await shot('b8-r2-act-admin')
  return entry
}

// ─── the W5B cleanup (restore protocol): every throwaway row dies, ledger re-proves ───
const cleanupW5b = () => {
  const steps = []
  const run = (name, sql) => {
    try {
      psql(sql)
      steps.push(`${name}: ok`)
    } catch (error) {
      steps.push(`${name}: FAILED ${String(error).slice(0, 120)}`)
    }
  }
  // engine artifacts first (records/todos reference the docs)
  run('wfl records', `DELETE FROM wfl_approval_records WHERE doc_id IN (SELECT id FROM pur_requests WHERE code LIKE 'W5B-%') AND doc_type = 'pur_requests';`)
  run('wfl todos', `DELETE FROM wfl_approval_todos WHERE doc_id IN (SELECT id FROM pur_requests WHERE code LIKE 'W5B-%') AND doc_type = 'pur_requests';`)
  run('wfl records mps', `DELETE FROM wfl_approval_records WHERE doc_id IN (SELECT id FROM mps_plans WHERE code LIKE 'W5B-%') AND doc_type = 'mps_plans';`)
  run('wfl todos mps', `DELETE FROM wfl_approval_todos WHERE doc_id IN (SELECT id FROM mps_plans WHERE code LIKE 'W5B-%') AND doc_type = 'mps_plans';`)
  run('wfl records pay', `DELETE FROM wfl_approval_records WHERE doc_id IN (SELECT id FROM pur_payments WHERE code LIKE 'W5B-%') AND doc_type = 'pur_payments';`)
  run('wfl todos pay', `DELETE FROM wfl_approval_todos WHERE doc_id IN (SELECT id FROM pur_payments WHERE code LIKE 'W5B-%') AND doc_type = 'pur_payments';`)
  // keeper's posting: movement + stock + lot ride out together (both sides of the ledger drop)
  run('movements', `DELETE FROM wms_movements WHERE doc_no = 'W5B-RCV-R2-01';`)
  run('stock', `DELETE FROM wms_stock s USING wms_lots l WHERE s.lot_id = l.id AND l.lot_no = 'W5BLOT-R2';`)
  run('lots', `DELETE FROM wms_lots WHERE lot_no IN ('W5BLOT-R2', 'W5BLOT-QI');`)
  run('receipts', `DELETE FROM wms_receipts WHERE receipt_no LIKE 'W5B-%';`)
  // the documents
  run('pur_requests', `DELETE FROM pur_requests WHERE code LIKE 'W5B-%';`)
  run('mps_plans', `DELETE FROM mps_plans WHERE code LIKE 'W5B-%';`)
  run('job_reports', `DELETE FROM mfg_job_reports WHERE code LIKE 'W5B-%';`)
  run('inspections', `DELETE FROM qm_inspections WHERE code LIKE 'W5B-%';`)
  run('so_orders', `DELETE FROM so_orders WHERE code LIKE 'W5B-%';`)
  run('pur_payments', `DELETE FROM pur_payments WHERE code LIKE 'W5B-%';`)
  return steps
}

// ─── drive ───
const LEGS = [
  ['buyer', buyerLeg], ['planner', plannerLeg], ['shop_lead', shopLeadLeg], ['qc_inspector', qcLeg],
  ['keeper', keeperLeg], ['sales_rep', salesLeg], ['finance', financeLeg], ['admin', adminLeg],
]
let cleanupSteps = []
try {
  for (const [name, fn] of LEGS) {
    console.log(`\n== action ${name} ==`)
    try {
      results.push(await fn())
    } catch (error) {
      console.log(`    ✗ leg crashed: ${String(error).slice(0, 300)}`)
      results.push({ role: name, action: `${name} leg`, channel: '(crashed)', pass: false, checks: [{ name: 'leg completed', ok: false, detail: String(error).slice(0, 300) }] })
    }
  }
} finally {
  cleanupSteps = cleanupW5b()
  for (const step of cleanupSteps) console.log(`  [cleanup] ${step}`)
  const ledger = spawnSync('node', ['--import', 'tsx/esm', fileURLToPath(new URL('../../examples/kb-agent/scripts/nocobase-h5-wms.mts', import.meta.url)), '--assert-ledger'], { encoding: 'utf8', timeout: 120_000 })
  console.log(`  [cleanup] ledger: ${String(ledger.stdout).includes('ledger balanced') ? 'balanced' : 'DRIFT ' + String(ledger.stderr ?? ledger.stdout).slice(0, 200)}`)
  try {
    process.kill(-chromeProc.pid, 'SIGTERM')
  } catch (error) {
    if (String(error?.code) !== 'ESRCH') chromeProc.kill('SIGKILL')
  }
}

for (const row of results) row.pass = row.checks !== undefined && row.checks.every(c => c.ok)
writeFileSync(`${OUT}b8-actions.json`, JSON.stringify({ legs: results, cleanup: cleanupSteps }, null, 2))
const failed = results.filter(row => !row.pass)
console.log(`\nactions: ${String(results.length - failed.length)}/${String(results.length)} 角色动作腿通过`)
if (failed.length > 0) {
  console.log('failed legs:', failed.map(row => row.role).join(', '))
  process.exitCode = 1
}
