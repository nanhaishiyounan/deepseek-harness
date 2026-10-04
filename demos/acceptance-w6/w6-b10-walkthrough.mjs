/**
 * W6-B10 eight-role acceptance walkthrough driver (research artifact, not
 * product code). Extends the W5 b8-walkthrough shape with the W6 surfaces:
 * the W6 pages (bid matrix / alerts / expiry board / trace / recall / CRM
 * pipeline / EAM / cockpit), the engine workbenches (terminals cards flow,
 * inspection wizard, labels), the mobile legs (B0/B1 real sign-in + docs +
 * alerts + todos — B1's server-side ledger), and a per-role read-only psql
 * reconciliation block that lands in w6-b10-psql-recon.log.
 *
 * Every role: real account sign-in, 3~5 core steps, DOM assertions (no 403,
 * content renders, rows present, member/admin matrix isolation), one or more
 * screenshots (w6-b10-r<N>-*.png), psql probes. Results land in
 * w6-b10-walkthrough.json (the gate the closure script reads) and every
 * executed action in w6-b10-actions.json for rerun auditing.
 *
 * Usage: node demos/acceptance-w6/w6-b10-walkthrough.mjs
 * Needs: NocoBase :13000, approval-engine :13110, dsh web :3080, PG :5432.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9346
const NC = 'http://localhost:13000'
const WEB = 'http://localhost:3080'
const ENGINE = 'http://localhost:13110'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MATRIX_PAGE = '/admin/w3b5m8kwiakieq' // 权限矩阵（member 直开被拦对照页）
const COCKPIT_PAGE = '/admin/w6b9cdzrc2lst1dm' // 经营总览（R5 裁决：planner 不见钱面——观察项）

/** psql helper — read-only probes against the NocoBase database. */
const psql = (sql) => execSync(
  `PGPASSWORD=dsh_nocobase psql -h 127.0.0.1 -p 5432 -U nocobase -d nocobase -qAt -c ${JSON.stringify(sql)}`,
  { encoding: 'utf8', timeout: 20_000 },
).trim()

/**
 * The eight role journeys. Step kinds:
 *  - pc:    a NocoBase admin page (path under NC) with a wait text
 *  - engine:an engine-origin page (full URL) with a wait text / probe
 *  - insp:  the inspection wizard sign-in leg (account/password of the role)
 *  - mobile:the :3080 mobile app leg (hash route, phone viewport)
 *  - observe: a probe recorded without a pass/fail verdict (R5 arbitration
 *           visibility evidence — design intent vs rendered reality)
 * Optional keys: rows (table has data rows), probe (JS boolean expr),
 * card (CSS selector count > 0), shot (screenshot suffix).
 */
const ROLES = [
  {
    n: 1, role: '采购员', account: 'buyer', password: 'Buyer#2026', member: true,
    steps: [
      { name: '比价矩阵页（B7）', kind: 'pc', path: '/admin/w3purb7o0r3yqi45', wait: '比价', probe: `document.body.innerText.includes('定标') || document.body.innerText.includes('报价')` },
      { name: '采购订单列表', kind: 'pc', path: '/admin/w3puryzkva06iuhh', wait: 'PO-2026', rows: true, shot: 'po-list' },
      { name: 'mobile 单据浏览（B1 G6）', kind: 'mobile', hash: '#/docs/pur_orders', wait: 'PO-', shot: 'mobile-docs' },
    ],
    psql: [
      { desc: '发号唯一：六守卫集合零撞号', sql: `SELECT count(*) FROM (SELECT collection||':'||code AS k, count(*) c FROM (SELECT 'pur_orders' collection, code FROM pur_orders UNION ALL SELECT 'pur_requests', code FROM pur_requests UNION ALL SELECT 'so_orders', code FROM so_orders UNION ALL SELECT 'mfg_orders', code FROM mfg_orders UNION ALL SELECT 'wms_receipts', receipt_no FROM wms_receipts UNION ALL SELECT 'srm_suppliers', code FROM srm_suppliers) s WHERE code <> '' GROUP BY 1 HAVING count(*) > 1) d`, want: '0' },
      { desc: 'PO 在库 ≥1（演练台账有源）', sql: `SELECT count(*) FROM pur_orders`, ok: (v) => Number(v) >= 1 },
      { desc: '比价定标行（is_won）≥1', sql: `SELECT count(*) FROM pur_quotes WHERE is_won = true`, ok: (v) => Number(v) >= 1 },
    ],
  },
  {
    n: 2, role: '计划员', account: 'planner', password: 'Planner#2026', member: true,
    steps: [
      { name: '计划工作台', kind: 'pc', path: '/admin/w7mrphtm8t9tzlk8', wait: '计划', rows: true },
      { name: '维保日历（B8）', kind: 'pc', path: '/admin/w6b8eci1cpbqsgtj', wait: '维保', shot: 'maint-calendar' },
      { name: '经营总览直开（R5 裁决观察项）', kind: 'observe', path: COCKPIT_PAGE, wait: '营收', note: '设计意图=钱面页对 planner 不可见；记录实际渲染与否' },
      { name: 'mobile 待办页（B1 G2）', kind: 'mobile', hash: '#/todos', wait: '待办', shot: 'mobile-todos' },
    ],
    psql: [
      { desc: '生产订单 ≥1', sql: `SELECT count(*) FROM mfg_orders`, ok: (v) => Number(v) >= 1 },
      { desc: '工序行（APS 面）≥1', sql: `SELECT count(*) FROM mfg_order_operations`, ok: (v) => Number(v) >= 1 },
      { desc: '维保工单 ≥1', sql: `SELECT count(*) FROM eam_maint_orders`, ok: (v) => Number(v) >= 1 },
    ],
  },
  {
    n: 3, role: '车间主任', account: 'shop_lead', password: 'Lead#2026', member: true,
    steps: [
      { name: '车间卡片流终端（B4 M1）', kind: 'engine', url: `${ENGINE}/terminals/cards.html`, wait: '操作工签到', probe: `document.body.innerText.includes('车间卡片流终端') || document.body.innerText.includes('MO-')`, shot: 'cards-terminal' },
      { name: 'CCP 监控配置（B4）', kind: 'pc', path: '/admin/w6b4c4t709ypn92m', wait: 'CCP' },
      { name: '配方版本与变更（B4 ECO）', kind: 'pc', path: '/admin/w6b4bnn0n7n2p2i', wait: '配方', shot: 'bom-versions' },
    ],
    psql: [
      { desc: '报工记录 ≥1', sql: `SELECT count(*) FROM mfg_job_reports`, ok: (v) => Number(v) >= 1 },
      { desc: 'CCP 结构化记录 ≥1（mfg_ccp_records）', sql: `SELECT count(*) FROM mfg_ccp_records`, ok: (v) => Number(v) >= 1 },
      { desc: 'BOM 版本 ≥2（版本化在位）', sql: `SELECT count(DISTINCT version) FROM mfg_boms`, ok: (v) => Number(v) >= 2 },
    ],
  },
  {
    n: 4, role: '质检员', account: 'qc_inspector', password: 'Qc#2026', member: true,
    steps: [
      { name: '检验工作台页（B5 队列）', kind: 'pc', path: '/admin/w6b5icrrgz5z9gu', wait: '检验' },
      { name: '检验向导（B5 引擎面）', kind: 'insp', shot: 'insp-queue' },
      { name: '出厂检验报告页（B5）', kind: 'pc', path: '/admin/w6b5ruwgh0d52fif', wait: '报告', rows: true, shot: 'factory-reports' },
      { name: '召回管理（B3）', kind: 'pc', path: '/admin/w6b3r1wnc10bflfg', wait: '召回' },
    ],
    psql: [
      { desc: '出厂报告九要素档案 ≥1', sql: `SELECT count(*) FROM qm_factory_reports`, ok: (v) => Number(v) >= 1 },
      { desc: '拒收→预警行 ≥1', sql: `SELECT count(*) FROM wfl_alerts WHERE rule_type = 'inspection_fail'`, ok: (v) => Number(v) >= 1 },
      { desc: '召回任务单 ≥1', sql: `SELECT count(*) FROM recall_orders`, ok: (v) => Number(v) >= 1 },
    ],
  },
  {
    n: 5, role: '仓管员', account: 'keeper', password: 'Keeper#2026', member: true,
    steps: [
      { name: '效期看板（B3 双轨阈值）', kind: 'pc', path: '/admin/w6b3k0jfsyskif', wait: '效期', probe: `document.querySelector('[data-w6b3="expiry-board"]') !== null`, shot: 'expiry-board' },
      { name: '预警列表（B2 认领主场）', kind: 'pc', path: '/admin/w6b2dwgwk6zc3i', wait: '预警', rows: true, shot: 'alert-list' },
      { name: '条码打印中心（B3 labels）', kind: 'engine', url: `${ENGINE}/labels`, wait: '标签', probe: `document.body.innerText.includes('GS1') || document.body.innerText.includes('批')` },
      { name: 'mobile 预警页（B2/B1）', kind: 'mobile', hash: '#/alerts', wait: '预警', probe: `document.querySelector('[data-testid="alert-row"]') !== null || document.body.innerText.includes('效期')`, shot: 'mobile-alerts' },
    ],
    psql: [
      { desc: '效期预警：引擎行数 = 手写双轨 SQL', sql: `WITH rule AS (SELECT params FROM alert_rules WHERE rule_type = 'expiry') SELECT (SELECT count(*) FROM wfl_alerts WHERE rule_type='expiry' AND last_seen_at = CURRENT_DATE) - (SELECT count(*) FROM wms_lots l, rule r WHERE l.expiry_date IS NOT NULL AND (l.expiry_date <= CURRENT_DATE + LEAST((r.params->>'warn_days')::int, CASE WHEN (r.params->>'regulatory')::boolean IS NOT FALSE THEN CASE WHEN l.production_date IS NULL OR l.expiry_date - l.production_date >= 365 THEN 45 WHEN l.expiry_date - l.production_date >= 180 THEN 20 WHEN l.expiry_date - l.production_date >= 90 THEN 15 WHEN l.expiry_date - l.production_date >= 30 THEN 10 ELSE 3 END ELSE 999999 END) OR (l.alert_date IS NOT NULL AND l.alert_date <= CURRENT_DATE AND l.expiry_date >= CURRENT_DATE)))`, want: '0' },
      { desc: '预警幂等：总行数 = 去重键数', sql: `SELECT count(*) - count(DISTINCT dedup_key) FROM wfl_alerts`, want: '0' },
      { desc: 'in-app 通知 ≥1（alert-center 渠道）', sql: `SELECT count(*) FROM "notificationInAppMessages" WHERE "channelName" = 'alert-center'`, ok: (v) => Number(v) >= 1 },
    ],
  },
  {
    n: 6, role: '销售', account: 'sales_rep', password: 'Sales#2026', member: true,
    steps: [
      { name: '商机管道 Kanban（B6）', kind: 'pc', path: '/admin/w6b6c6iqjj61zo9', wait: '商机', probe: `document.body.innerText.includes('管道') || document.querySelector('.ant-card, [class*="kanban"]') !== null`, shot: 'crm-pipeline' },
      { name: '客户 360（B6）', kind: 'pc', path: '/admin/n17sys042q2lz', wait: '客户', rows: true },
      { name: 'mobile 单据浏览（B1）', kind: 'mobile', hash: '#/docs/so_orders', wait: 'SO-', shot: 'mobile-so-docs' },
    ],
    psql: [
      { desc: '商机 ≥1', sql: `SELECT count(*) FROM crm_deals`, ok: (v) => Number(v) >= 1 },
      { desc: '概率状态一致：won=100/lost=0 违例数', sql: `SELECT count(*) FROM crm_deals WHERE (stage IN ('won','赢单','成交') AND COALESCE(probability,0) <> 100) OR (stage IN ('lost','输单','丢单') AND COALESCE(probability,0) <> 0)`, want: '0' },
      { desc: '加权管道总额（信息项，与 B6 对账口径同源）', sql: `SELECT round(sum(amount * coalesce(probability,0) / 100.0)::numeric, 2) FROM crm_deals`, info: true },
    ],
  },
  {
    n: 7, role: '财务', account: 'finance', password: 'Finance#2026', member: true,
    steps: [
      { name: '经营总览驾驶舱（B9）', kind: 'pc', path: COCKPIT_PAGE, wait: '营收', probe: `document.body.innerText.includes('应收') || document.body.innerText.includes('订单')`, shot: 'cockpit' },
      { name: '财务工作台（B9 催收）', kind: 'pc', path: '/admin/w6b9fgcovvinqe85', wait: '催收', shot: 'fin-workbench' },
      { name: '发票匹配（B9 三单）', kind: 'pc', path: '/admin/w3pur45681oxtcsi', wait: '发票' },
      { name: 'mobile 预警页（R5 催收通知）', kind: 'mobile', hash: '#/alerts', wait: '预警', probe: `document.querySelector('[data-testid="alert-row"]') !== null || document.body.innerText.includes('催收') || document.body.innerText.includes('账期')`, shot: 'mobile-dunning' },
    ],
    psql: [
      { desc: '账龄五桶合计 = 逾期 AR 总额（B9 cut 口径：仅 need_date<今天）', sql: `WITH b AS (SELECT o.need_date, round((o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status='received'),0))::numeric, 2) AS bal FROM so_orders o WHERE o.doc_status='approved' AND o.need_date IS NOT NULL AND o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status='received'),0) > 0.005 AND o.need_date < CURRENT_DATE) SELECT (SELECT COALESCE(SUM(bal),0) FROM b) - (SELECT COALESCE(SUM(bucket),0) FROM (SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date <= 30),0) bucket FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 30 AND CURRENT_DATE - need_date <= 60),0) FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 60 AND CURRENT_DATE - need_date <= 90),0) FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 90 AND CURRENT_DATE - need_date <= 120),0) FROM b UNION ALL SELECT COALESCE(SUM(bal) FILTER (WHERE CURRENT_DATE - need_date > 120),0) FROM b) x)`, ok: (v) => Number(v) === 0 },
      { desc: '催收记录 ≥1（append-only 台账在）', sql: `SELECT count(*) FROM fin_dunning_records`, ok: (v) => Number(v) >= 1 },
      { desc: '三单差异 ≥1（匹配面有数据）', sql: `SELECT count(*) FROM fin_match_issues`, ok: (v) => Number(v) >= 1 },
    ],
  },
  {
    n: 8, role: '管理员', account: 'admin@nocobase.com', password: 'admin123', member: false,
    steps: [
      { name: '预警规则配置（B2/B5 六路）', kind: 'pc', path: '/admin/w6b2rdacw363qjf7', wait: '规则', rows: true, shot: 'alert-rules' },
      { name: '审批流配置（设计器 iframe）', kind: 'pc', path: '/admin/w3b4u2r9nnjqvi', wait: '审批流配置', designerIframe: true },
      { name: '权限矩阵页', kind: 'pc', path: MATRIX_PAGE, wait: '角色', matrix: true },
    ],
    psql: [
      { desc: '预警规则八路全启用（B2四路+B4 CCP+B5检验+B8校准/维保）', sql: `SELECT count(*) FROM alert_rules WHERE enabled = true`, want: '8' },
      { desc: '审批流配置在库（设计器事实源）', sql: `SELECT count(*) FROM wfl_flow_configs`, ok: (v) => Number(v) >= 1 },
    ],
  },
]

// ─── chrome + CDP plumbing (the W5 b8 shape) ───
mkdirSync(OUT, { recursive: true })
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=/tmp/w6b10-walk-profile`, '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', chunk => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()
let target = null
for (let attempt = 0; attempt < 25 && target === null; attempt++) {
  await sleep(1000)
  try {
    const created = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
    target = created
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
const actions = []
const note = (role, action, detail = '') => {
  actions.push({ at: new Date().toISOString(), role, action, detail })
}
const phoneViewport = async (on) => {
  await send('Emulation.setDeviceMetricsOverride', on
    ? { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }
    : { width: 0, height: 0, deviceScaleFactor: 0, mobile: false })
}
const goto = async (url, waitText = null, timeoutMs = 45000) => {
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
const shot = async (name) => {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${result.data} | base64 -d > ${OUT}${name}.png`)
  console.log('shot', name)
}
const bodyText = () => evaluate('document.body.innerText')
const bodyBytes = () => evaluate('document.body.innerHTML.length')

// ─── sign-in helpers ───
const pcSignIn = async (account, password) => {
  await goto(`${NC}/admin`, null, 15000)
  await evaluate(`localStorage.clear()`)
  let filled = false
  for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
    await goto(`${NC}/signin`, '登录', 30000)
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
  const identity = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => ({ nickname: String(j.data?.nickname ?? ''), username: String(j.data?.username ?? ''), email: String(j.data?.email ?? '') })).catch(() => ({ nickname: '', username: '', email: '' }))`)
  const ok = String(identity?.username) === account || String(identity?.email) === account
  return { nickname: String(identity?.nickname ?? ''), username: String(identity?.username ?? ''), ok }
}

const mobileSignIn = async (account, password, hash) => {
  await phoneViewport(true)
  await send('Page.navigate', { url: `${WEB}/mobile.html#/login` })
  await sleep(2500)
  // a previous role's session would both hide the form and answer the
  // identity probe with the wrong username — drop it, then reload the route.
  await evaluate(`localStorage.clear()`)
  await send('Page.navigate', { url: `${WEB}/mobile.html` })
  await sleep(1200)
  await send('Page.navigate', { url: `${WEB}/mobile.html#/login` })
  await sleep(2000)
  let filled = false
  for (let probe = 0; probe < 15 && filled !== true; probe++) {
    await sleep(2000)
    filled = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input')]
      const account2 = inputs.find(i => (i.placeholder ?? '').includes('业务账号') && i.type !== 'password')
      const pass = inputs.find(i => i.type === 'password')
      if (account2 === undefined || pass === undefined) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(account2, ${JSON.stringify(account)}); set(pass, ${JSON.stringify(password)}); return true
    })()`)
  }
  if (filled !== true) { await phoneViewport(false); return { ok: false, username: '' } }
  // the submit button is the one labelled 登录 exactly ('登' alone matches
  // the register link first — the first run's every mobile leg died on it)
  await evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('登录')) ?? document.querySelector('button[type=submit]'); if (btn) btn.click(); return btn !== null })()`)
  await sleep(6000)
  let username = await evaluate(`(() => { try { const raw = localStorage.getItem('dsh-mobile-auth'); return raw === null ? '' : String(JSON.parse(raw).username ?? '') } catch { return '' } })()`)
  if (String(username) !== account) {
    // one retry: some boots lose the click to the SPA's first render
    await evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('登录')); if (btn) btn.click(); return true })()`)
    await sleep(6000)
    username = await evaluate(`(() => { try { const raw = localStorage.getItem('dsh-mobile-auth'); return raw === null ? '' : String(JSON.parse(raw).username ?? '') } catch { return '' } })()`)
  }
  await send('Page.navigate', { url: `${WEB}/mobile.html` })
  await sleep(1200)
  await send('Page.navigate', { url: `${WEB}/mobile.html${hash}` })
  await sleep(2500)
  return { ok: String(username) === account, username: String(username) }
}

const inspSignIn = async (account, password) => {
  await phoneViewport(false)
  await send('Page.navigate', { url: `${ENGINE}/insp` })
  let ready = false
  for (let i = 0; i < 20 && ready !== true; i++) {
    await sleep(800)
    ready = await evaluate(`document.getElementById('login-view') !== null && !document.getElementById('login-view').classList.contains('hidden')`)
  }
  await evaluate(`(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
    set(document.getElementById('login-account'), ${JSON.stringify(account)}); set(document.getElementById('login-password'), ${JSON.stringify(password)}); document.getElementById('login-btn').click(); return true
  })()`)
  let queued = false
  for (let i = 0; i < 25 && queued !== true; i++) {
    await sleep(900)
    queued = await evaluate(`document.getElementById('queue-view') !== null && !document.getElementById('queue-view').classList.contains('hidden')`)
  }
  const who = await evaluate(`document.getElementById('who')?.textContent ?? ''`)
  return { ok: queued === true && who.includes(account), who }
}

// ─── the per-step walk (pc pages) ───
const walkPcStep = async (role, step) => {
  const checks = []
  const found = await goto(`${NC}${step.path}`, step.wait)
  checks.push({ name: `${step.name}：页面出现「${step.wait}」`, ok: found === true, detail: found === true ? '' : '45s 内未出现等待文案（可能白屏/被拦）' })
  note(role, `open ${step.path}`, step.name)
  const text = await bodyText()
  const denied = /403|无权限|Forbidden|Not Found/.test(text ?? '')
  checks.push({ name: `${step.name}：无 403/无权限误伤`, ok: !denied, detail: denied ? (text.match(/.*(403|无权限|Forbidden).*/)?.[0] ?? '').slice(0, 80) : '' })
  const bytes = await bodyBytes()
  checks.push({ name: `${step.name}：非白屏渲染`, ok: bytes > 2000, detail: `DOM ${String(bytes)} 字节` })
  if (step.rows === true) {
    const rowCount = await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr')].filter(tr => tr.querySelector('td')).length`)
    checks.push({ name: `${step.name}：表格有数据行`, ok: Number(rowCount) > 0, detail: `${String(rowCount)} 行` })
  }
  if (typeof step.probe === 'string') {
    const probed = await evaluate(`Boolean(${step.probe})`)
    checks.push({ name: `${step.name}：W6 形态探针`, ok: probed === true, detail: probed === true ? '命中' : '探针未命中（形态缺失或改版）' })
  }
  if (step.matrix === true) {
    const hasMatrix = await evaluate(`!!document.querySelector('[data-w3b5="acl-matrix"]') || document.body.innerText.includes('角色 × 集合动作矩阵')`)
    checks.push({ name: `${step.name}：矩阵表渲染`, ok: hasMatrix === true, detail: '' })
  }
  if (step.designerIframe === true) {
    const iframe = await evaluate(`(() => { const f = [...document.querySelectorAll('iframe')].find(f => (f.src || '').includes('/designer')); return f ? f.src : '' })()`)
    checks.push({ name: `${step.name}：设计器 iframe 挂载`, ok: String(iframe).includes('/designer'), detail: String(iframe).slice(0, 90) })
    await evaluate(`(() => { const f = [...document.querySelectorAll('iframe')].find(f => (f.src || '').includes('/designer')); if (f) f.scrollIntoView({ block: 'center' }); return !!f })()`)
    await sleep(900)
  }
  return checks
}

const walkEngineStep = async (role, step) => {
  const checks = []
  await phoneViewport(false)
  const found = await goto(step.url, step.wait)
  checks.push({ name: `${step.name}：页面出现「${step.wait}」`, ok: found === true, detail: found === true ? '' : '未出现等待文案' })
  note(role, `open ${String(step.url).replace(ENGINE, '')}`, step.name)
  const bytes = await bodyBytes()
  checks.push({ name: `${step.name}：非白屏渲染`, ok: bytes > 1500, detail: `DOM ${String(bytes)} 字节` })
  if (typeof step.probe === 'string') {
    const probed = await evaluate(`Boolean(${step.probe})`)
    checks.push({ name: `${step.name}：执行面探针`, ok: probed === true, detail: probed === true ? '命中' : '探针未命中' })
  }
  return checks
}

// ─── psql probes ───
const reconLines = []
const runPsqlProbes = (role, probes) => {
  let all = true
  for (const probe of probes) {
    let value = ''
    try { value = psql(probe.sql) } catch (error) { value = `ERROR ${String(error).slice(0, 80)}` }
    let ok
    if (probe.info === true) { ok = null } else if (probe.want !== undefined) { ok = value === probe.want } else { ok = probe.ok(value) }
    const mark = ok === null ? 'ℹ' : ok ? '✓' : '✗'
    const line = `  ${mark} r${role.n} ${role.role}｜${probe.desc} — ${value}`
    console.log(line)
    reconLines.push(line)
    if (ok === false) all = false
  }
  return { ok: all }
}

// ─── main walk ───
const results = []
const walkRoles = async () => {
  for (const role of ROLES) {
    console.log(`\n== r${role.n} ${role.role}（${role.account}）==`)
    const steps = []
    let ok = true
    const identity = await pcSignIn(role.account, role.password)
    note(role.account, 'pc-signin', identity.ok ? `身份锚点 ${identity.nickname}（${identity.username}）` : '登录失败')
    const signedIn = identity.ok === true
    steps.push({ name: 'PC 登录成功', ok: signedIn, detail: signedIn ? `身份锚点「${identity.nickname}」（${identity.username}）` : `auth:check 返回 ${identity.username || '(空)'}——登录未生效` })
    if (!signedIn) ok = false
    // member/admin matrix isolation contrast (W5 shape)
    await goto(`${NC}${MATRIX_PAGE}`, '角色', 25000)
    await sleep(1500)
    const matrixRenders = await evaluate(`!!document.querySelector('[data-w3b5="acl-matrix"]') || document.body.innerText.includes('角色 × 集合动作矩阵')`)
    if (role.member) {
      steps.push({ name: '隔离：直开权限矩阵页被拦（矩阵不渲染）', ok: matrixRenders !== true, detail: matrixRenders === true ? 'member 渲染出管理员矩阵' : '' })
    } else {
      steps.push({ name: '对照：直开权限矩阵页渲染矩阵', ok: matrixRenders === true, detail: '' })
    }
    if (!steps.at(-1).ok) ok = false
    let mobileIdentity = null
    for (const step of role.steps) {
      if (step.kind === 'mobile') {
        const session = await mobileSignIn(role.account, role.password, step.hash)
        mobileIdentity = session
        note(role.account, `mobile-signin ${step.hash}`, session.ok ? `dsh-mobile-auth=${session.username}` : 'mobile 登录未锚定')
        steps.push({ name: `${step.name}：mobile 真实登录`, ok: session.ok === true, detail: session.ok === true ? `身份 ${session.username}` : 'dsh-mobile-auth 未锚定' })
        if (!session.ok) { ok = false; continue }
        let found = false
        for (let i = 0; i < 15 && found !== true; i++) {
          await sleep(1200)
          found = await evaluate(`document.body.innerText.includes(${JSON.stringify(step.wait)})`)
        }
        steps.push({ name: `${step.name}：出现「${step.wait}」`, ok: found === true, detail: found === true ? '' : '15 次轮询未见等待文案' })
        if (!found) ok = false
        if (typeof step.probe === 'string') {
          const probed = await evaluate(`Boolean(${step.probe})`)
          steps.push({ name: `${step.name}：数据行探针`, ok: probed === true, detail: probed === true ? '命中' : '未命中（可能空态）' })
          if (!probed) ok = false
        }
        note(role.account, `mobile ${step.hash}`, step.name)
        if (step.shot !== undefined) await shot(`w6-b10-r${role.n}-${step.shot}`)
        await phoneViewport(false)
        continue
      }
      if (step.kind === 'insp') {
        const session = await inspSignIn(role.account, role.password)
        note(role.account, 'insp-signin', session.ok ? `向导身份 ${session.who}` : '向导登录失败')
        steps.push({ name: `${step.name}：向导登录+队列`, ok: session.ok === true, detail: session.who.slice(0, 60) })
        if (!session.ok) { ok = false; continue }
        const tabs = await evaluate(`document.querySelectorAll('#queue-tabs button').length`)
        steps.push({ name: `${step.name}：队列分段 ≥2`, ok: Number(tabs) >= 2, detail: `${String(tabs)} 段` })
        if (Number(tabs) < 2) ok = false
        if (step.shot !== undefined) await shot(`w6-b10-r${role.n}-${step.shot}`)
        continue
      }
      if (step.kind === 'observe') {
        await goto(`${NC}${step.path}`, step.wait, 30000)
        await sleep(2000)
        const rendered = await evaluate(`document.body.innerText.includes(${JSON.stringify(step.wait)})`)
        const text = await bodyText()
        const denied = /403|无权限|Forbidden/.test(text ?? '')
        steps.push({ name: `${step.name}（观察，不计分）`, ok: true, detail: `渲染=${String(rendered)} 被拦=${String(denied)} — ${step.note ?? ''}` })
        note(role.account, `observe ${step.path}`, `rendered=${String(rendered)} denied=${String(denied)}`)
        if (step.shot !== undefined) await shot(`w6-b10-r${role.n}-${step.shot}`)
        continue
      }
      if (step.kind === 'pc') {
        const checks = await walkPcStep(role.account, step)
        for (const one of checks) {
          steps.push(one)
          if (!one.ok) ok = false
        }
        if (step.shot !== undefined) await shot(`w6-b10-r${role.n}-${step.shot}`)
        continue
      }
      if (step.kind === 'engine') {
        const checks = await walkEngineStep(role.account, step)
        for (const one of checks) {
          steps.push(one)
          if (!one.ok) ok = false
        }
        if (step.shot !== undefined) await shot(`w6-b10-r${role.n}-${step.shot}`)
        continue
      }
    }
    // every role keeps one journey screenshot even when no step declared one
    const shots = role.steps.filter(s => s.shot !== undefined)
    if (shots.length === 0) await shot(`w6-b10-r${role.n}-walkthrough`)
    const recon = runPsqlProbes(role, role.psql)
    if (!recon.ok) ok = false
    results.push({ role: `${role.role}（${role.account}）`, pass: ok, steps, mobile: mobileIdentity })
    console.log(`r${role.n} ${role.role}: ${ok ? 'PASS' : 'FAIL'} — ${String(steps.filter(s => s.ok).length)}/${String(steps.length)} 步`)
  }
}

try {
  const live = {
    nocobase: await fetch(`${NC}/api/app:getInfo`).then(r => r.status).catch(() => 0),
    engine: await fetch(`${ENGINE}/healthz`).then(r => r.status).catch(() => 0),
    web: await fetch(`${WEB}/`).then(r => r.status).catch(() => 0),
  }
  console.log(`live triple: nc=${String(live.nocobase)} engine=${String(live.engine)} web=${String(live.web)}`)
  if (live.nocobase !== 200 || live.engine !== 200 || live.web !== 200) throw new Error(`live services not all up: ${JSON.stringify(live)}`)
  reconLines.push(`# W6-B10 psql 对账（${new Date().toISOString()}，八角色随行走查）`)
  await walkRoles()
  writeFileSync(`${OUT}w6-b10-walkthrough.json`, JSON.stringify({ generatedAt: new Date().toISOString(), live, results }, null, 2))
  writeFileSync(`${OUT}w6-b10-actions.json`, JSON.stringify(actions, null, 2))
  reconLines.push(`# 合计 ${String(results.length)} 角色，通过 ${String(results.filter(r => r.pass).length)}`)
  writeFileSync(`${OUT}w6-b10-psql-recon.log`, `${reconLines.join('\n')}\n`)
} finally {
  try {
    process.kill(-chromeProc.pid, 'SIGTERM')
  } catch (error) {
    if (String(error?.code) !== 'ESRCH') chromeProc.kill('SIGKILL')
  }
}
const failed = results.filter(row => !row.pass)
console.log(`\nwalkthrough: ${String(results.length - failed.length)}/${String(results.length)} 角色通过`)
if (failed.length > 0) {
  console.log('failed roles:', failed.map(row => row.role).join(', '))
  process.exitCode = 1
}
