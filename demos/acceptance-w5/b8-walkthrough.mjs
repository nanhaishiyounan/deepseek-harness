/**
 * W5-B8 acceptance walkthrough driver (research artifact, not product code).
 * Drives a headless Chrome over CDP against the live NocoBase :13000 and
 * walks the eight role journeys with the REAL accounts (the six W5-B8
 * seeds + qc_inspector + admin): each role signs in, walks its 3~5 core
 * steps, gets DOM assertions (no 403, content renders, rows present, the
 * member/admin menu isolation), and lands one screenshot (b8-r1..r8) in
 * demos/acceptance-w5/. Results land in b8-walkthrough.json for
 * w5b8-closure.mts --assert to gate on.
 *
 * Usage: node demos/acceptance-w5/b8-walkthrough.mjs
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9336
const BASE = 'http://localhost:13000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** One role's journey: pages walked in order + which step the screenshot rides on. */
const ROLES = [
  {
    n: 1, role: '采购员', account: 'buyer', password: 'Buyer#2026', member: true,
    steps: [
      { name: '采购订单列表', path: '/admin/w3puryzkva06iuhh', wait: 'PO-2026', rows: true },
      { name: 'PO 详情三段式抽屉', path: '/admin/w3puryzkva06iuhh', wait: 'PO-2026', drawer: { row: 'PO-2026-0003', tabs: ['单据明细', '审批记录', '关联单据'] } },
      { name: '付款申请列表', path: '/admin/w3pur3an4pwnr1eo', wait: '付款', rows: true },
    ],
    shotOn: 'PO 详情三段式抽屉',
  },
  {
    n: 2, role: '计划员', account: 'planner', password: 'Planner#2026', member: true,
    steps: [
      { name: '主生产计划', path: '/admin/w7mrpyru4s708nwn', wait: '计划', rows: true },
      { name: 'MRP 快照', path: '/admin/w7mrpowj6l93nn0a', wait: 'MRP', rows: true },
      { name: '生产订单列表', path: '/admin/w5mfgntyu7wy20a', wait: 'MO-2026', rows: true },
    ],
    shotOn: 'MRP 快照',
  },
  {
    n: 3, role: '车间主任', account: 'shop_lead', password: 'Lead#2026', member: true,
    steps: [
      { name: '生产订单列表', path: '/admin/w5mfgntyu7wy20a', wait: 'MO-2026', rows: true },
      { name: '生产订单详情抽屉', path: '/admin/w5mfgntyu7wy20a', wait: 'MO-2026', drawer: { row: 'MO-2026', tabs: ['单据明细', '审批记录'] } },
      { name: '报工记录', path: '/admin/w6mfglmxq9mhbkur', wait: '报工', rows: true },
    ],
    shotOn: '生产订单详情抽屉',
  },
  {
    n: 4, role: '质检员', account: 'qc_inspector', password: 'Qc#2026', member: true,
    steps: [
      { name: '质检单列表', path: '/admin/w8qmjvyv8p5j7j', wait: 'QI-', rows: true },
      { name: '检验单详情抽屉', path: '/admin/w8qmjvyv8p5j7j', wait: 'QI-', drawer: { row: 'QI-', tabs: ['单据明细'] } },
      { name: '审批中心待办', path: '/admin/w1w167h6joi0ck6', wait: '审批' },
    ],
    shotOn: '检验单详情抽屉',
  },
  {
    n: 5, role: '仓管员', account: 'keeper', password: 'Keeper#2026', member: true,
    steps: [
      { name: '库存查询', path: '/admin/h5wms9v2hly0cg6j', wait: '库位', rows: true },
      { name: '收货单列表', path: '/admin/h5wmsrh8ls7pkv5i', wait: 'RCV-', rows: true },
      { name: '月度收发存', path: '/admin/h5wmslacezwb94s', wait: '期初', rows: true },
      { name: '预留管理', path: '/admin/h5wms9zlhetpzwl', wait: '预留' },
    ],
    shotOn: '库存查询',
  },
  {
    n: 6, role: '销售', account: 'sales_rep', password: 'Sales#2026', member: true,
    steps: [
      { name: '销售订单列表', path: '/admin/w7mrp4w590rm0ws8', wait: 'SO-2026', rows: true },
      { name: 'SO 详情三段式抽屉', path: '/admin/w7mrp4w590rm0ws8', wait: 'SO-2026', drawer: { row: 'SO-2026', tabs: ['单据明细', '审批记录', '关联单据'] } },
      { name: 'CRM 客户', path: '/admin/n17sys042q2lz', wait: '客户', rows: true },
    ],
    shotOn: 'SO 详情三段式抽屉',
  },
  {
    n: 7, role: '财务', account: 'finance', password: 'Finance#2026', member: true,
    steps: [
      { name: '应收应付对账', path: '/admin/w9kpisldougonly', wait: '应收' },
      { name: '付款申请列表', path: '/admin/w3pur3an4pwnr1eo', wait: 'PAY', rows: true },
      { name: '审批中心待办', path: '/admin/w1w167h6joi0ck6', wait: '审批' },
    ],
    shotOn: '应收应付对账',
  },
  {
    n: 8, role: '管理员', account: 'admin@nocobase.com', password: 'admin123', member: false,
    steps: [
      { name: '权限矩阵页', path: '/admin/w3b5m8kwiakieq', wait: '角色', matrix: true },
      { name: '审批流配置（设计器 iframe）', path: '/admin/w3b4u2r9nnjqvi', wait: '审批流配置', designerIframe: true },
      { name: '审批中心待办', path: '/admin/w1w167h6joi0ck6', wait: '审批' },
    ],
    shotOn: '审批流配置（设计器 iframe）',
  },
]

mkdirSync(OUT, { recursive: true })
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/b8-walk-profile', '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', chunk => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()
let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
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

/** The walk-page assertion bundle; returns [{name, ok, detail}]. */
const walkStep = async (step) => {
  const checks = []
  const found = await goto(`${BASE}${step.path}`, step.wait)
  checks.push({ name: `${step.name}：页面出现「${step.wait}」`, ok: found === true, detail: found === true ? '' : '45s 内未出现等待文案（可能白屏/被拦）' })
  const text = await bodyText()
  const denied = /403|无权限|Forbidden|Not Found/.test(text ?? '')
  checks.push({ name: `${step.name}：无 403/无权限误伤`, ok: !denied, detail: denied ? (text.match(/.*(403|无权限|Forbidden).*/)?.[0] ?? '').slice(0, 80) : '' })
  const bytes = await bodyBytes()
  checks.push({ name: `${step.name}：非白屏渲染`, ok: bytes > 2000, detail: `DOM ${String(bytes)} 字节` })
  if (step.rows === true) {
    const rowCount = await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr')].filter(tr => tr.querySelector('td')).length`)
    checks.push({ name: `${step.name}：表格有数据行`, ok: Number(rowCount) > 0, detail: `${String(rowCount)} 行` })
  }
  if (step.matrix === true) {
    const hasMatrix = await evaluate(`!!document.querySelector('[data-w3b5="acl-matrix"]') || document.body.innerText.includes('角色 × 集合动作矩阵')`)
    checks.push({ name: `${step.name}：矩阵表渲染`, ok: hasMatrix === true, detail: '' })
  }
  if (step.designerIframe === true) {
    // The iframe embed is the only platform-supported mount for foreign
    // iframes; its src rides the engine base (:13110) with the doc_type.
    const iframe = await evaluate(`(() => { const f = [...document.querySelectorAll('iframe')].find(f => (f.src || '').includes('/designer')); return f ? f.src : '' })()`)
    checks.push({ name: `${step.name}：设计器 iframe 挂载`, ok: String(iframe).includes('/designer'), detail: String(iframe).slice(0, 90) })
  }
  if (step.drawer !== undefined) {
    const opened = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.ant-table-tbody tr')].find(tr => tr.innerText.includes(${JSON.stringify(step.drawer.row)}))
      if (!row) return 'no-row'
      const btn = [...row.querySelectorAll('button')].find(b => ['查看','详情'].some(t => b.textContent.trim().includes(t)))
      if (!btn) return 'no-btn'
      btn.click(); return 'clicked'
    })()`)
    await sleep(3200)
    const drawerOpen = await evaluate(`!!document.querySelector('.ant-drawer-content') || !!document.querySelector('.ant-drawer')`)
    checks.push({ name: `${step.name}：抽屉打开`, ok: opened === 'clicked' && drawerOpen === true, detail: `${String(opened)} drawer=${String(drawerOpen)}` })
    const tabText = await evaluate(`[...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim()).join('|')`)
    const tabsOk = step.drawer.tabs.every(tab => String(tabText).includes(tab))
    checks.push({ name: `${step.name}：三段式标签页齐`, ok: tabsOk, detail: String(tabText).slice(0, 90) })
  }
  return checks
}

/**
 * Sign out (drop the local token) then sign in as the account. The app may
 * keep serving the shell from its in-memory token right after the storage
 * clear — reload the sign-in page until the two-input form actually shows
 * (three attempts), then submit.
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
  // W5-R2: the nickname never renders in the post-login DOM (the old regex
  // probe always missed; the tautology hid it) — the session's own auth:check
  // (with the stored token; a bare fetch carries no header) is the honest
  // identity anchor.
  const identity = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => ({ nickname: String(j.data?.nickname ?? ''), username: String(j.data?.username ?? ''), email: String(j.data?.email ?? '') })).catch(() => ({ nickname: '', username: '', email: '' }))`)
  // admin signs in by email while its username is 'nocobase' — accept either
  // the username or the email as the identity match.
  const ok = String(identity?.username) === account || String(identity?.email) === account
  return { nickname: String(identity?.nickname ?? ''), username: String(identity?.username ?? ''), ok }
}

const results = []
const walkRoles = async () => {
for (const role of ROLES) {
  console.log(`\n== r${role.n} ${role.role}（${role.account}）==`)
  const steps = []
  let ok = true
  const identity = await signInAs(role.account, role.password)
  // W5-R2: the old `nickname !== '' || goto(...) === false` was a
  // tautology (goto with no waitText always returns false); the session's
  // /api/users:check username is the real assertion now.
  const signedIn = identity.ok === true
  steps.push({ name: '登录成功', ok: signedIn, detail: signedIn ? `身份锚点「${identity.nickname}」（${identity.username}）` : `auth:check 返回 ${identity.username || '(空)'}（期望 ${role.account}）——登录未生效` })
  if (!signedIn) ok = false
  // Data isolation contrast: the admin-only 权限矩阵 page under a direct
  // URL — the collapsed-group sidebar text is not a reliable probe, so the
  // isolation claim rides the rendered matrix itself (members never get
  // the block; admin does).
  await goto(`${BASE}/admin/w3b5m8kwiakieq`, '角色', 25000)
  await sleep(1500)
  const matrixRenders = await evaluate(`!!document.querySelector('[data-w3b5="acl-matrix"]') || document.body.innerText.includes('角色 × 集合动作矩阵')`)
  if (role.member) {
    steps.push({ name: '隔离：直开权限矩阵页被拦（矩阵不渲染）', ok: matrixRenders !== true, detail: matrixRenders === true ? 'member 渲染出管理员矩阵' : '' })
  } else {
    steps.push({ name: '对照：直开权限矩阵页渲染矩阵', ok: matrixRenders === true, detail: '' })
  }
  if (!steps.at(-1).ok) ok = false
  for (const step of role.steps) {
    const checks = await walkStep(step)
    for (const one of checks) {
      steps.push(one)
      if (!one.ok) ok = false
    }
    if (step.name === role.shotOn) {
      if (step.designerIframe === true) {
        // W5-R2: the designer iframe sits ~5370px down the page — scroll
        // it into the viewport before the shot or the canvas never lands
        // in frame (the verifier's vfy-b8-designer-iframe.png proved the
        // scroll-then-shoot shape).
        await evaluate(`(() => { const f = [...document.querySelectorAll('iframe')].find(f => (f.src || '').includes('/designer')); if (f) f.scrollIntoView({ block: 'center' }); return !!f })()`)
        await sleep(900)
      }
      await shot(`b8-r${role.n}-walkthrough`)
    }
  }
  results.push({ role: `${role.role}（${role.account}）`, pass: ok, steps })
  console.log(`r${role.n} ${role.role}: ${ok ? 'PASS' : 'FAIL'} — ${String(steps.filter(s => s.ok).length)}/${String(steps.length)} 步`)
}
}

try {
  await walkRoles()
  writeFileSync(`${OUT}b8-walkthrough.json`, JSON.stringify(results, null, 2))
} finally {
  // W5-R2: the detached+unref chrome used to outlive the driver (a hung
  // maker left it running for 31 minutes) — kill the process group before
  // the driver exits, whatever the walk outcome.
  try {
    process.kill(-chromeProc.pid, 'SIGTERM')
  } catch (error) {
    // ESRCH: the group already exited; anything else still gets SIGKILL.
    if (String(error?.code) !== 'ESRCH') chromeProc.kill('SIGKILL')
  }
}
const failed = results.filter(row => !row.pass)
console.log(`\nwalkthrough: ${String(results.length - failed.length)}/${String(results.length)} 角色通过`)
if (failed.length > 0) {
  console.log('failed roles:', failed.map(row => row.role).join(', '))
  process.exitCode = 1
}
