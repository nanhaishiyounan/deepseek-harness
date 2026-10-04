#!/usr/bin/env node
/**
 * W6-R2 C-1 four-step closure smoke (live services, CDP headless):
 *   ① keeper signs in on mobile (:3080/mobile) — home carries the 我的预警
 *      chip with its count badge (the R2 minor);
 *   ② #/alerts renders keeper's routed rows, each open row carrying its own
 *      认领 action (the R2 fix);
 *   ③ the in-row 认领 click rides nocobase.alertAct → the engine stamps
 *      owner=keeper status=acknowledged (psql proof below);
 *   ④ PC alert-center (admin) shows the same row acknowledged — 双端回显一致.
 * Outputs: demos/acceptance-w6/w6-r2-01-*.png + w6-r2-01-closure.log.
 */
import { spawn, execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const NC = 'http://localhost:13000'
const WEB = 'http://localhost:3080'
const PORT = 9346
const OUT = new URL('./', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ALERTS_PAGE = '/admin/w6b2dwgwk6zc3i'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (line) => { console.log(line); lines.push(line) }
const lines = []
const meta = { generatedAt: new Date().toISOString(), steps: {} }

const env = readFileSync(new URL('../../platform/nocobase/.env', import.meta.url), 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psql = (sql) => execSync(`psql -h ${envOf('DB_HOST') ?? 'localhost'} -p ${envOf('DB_PORT') ?? '5432'} -U ${envOf('DB_USER') ?? 'postgres'} -d ${envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase'} -t -A -c ${JSON.stringify(sql)}`, { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim()

// The claim target: the newest open expiry row routed to keeper.
const target = psql("SELECT id || '|' || entity_code || '|' || COALESCE(reopen_count,0) FROM wfl_alerts WHERE rule_type='expiry' AND status='open' AND notify_users::jsonb ? 'keeper' ORDER BY id DESC LIMIT 1;")
const [targetId, targetCode] = target.split('|')
log(`w6-r2-01: 认领目标行 #${targetId}（${targetCode}，keeper 路由的 open 效期行）`)
if (targetId === undefined) throw new Error('no open keeper-routed expiry row')

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r2-smoke-profile', '--window-size=1440,900', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()

let target0 = null
for (let attempt = 0; attempt < 20 && target0 === null; attempt++) {
  await sleep(1000)
  try { target0 = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json() } catch { /* not up yet */ }
}
const ws = new WebSocket(target0.webSocketDebuggerUrl)
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
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value
const shot = async (name) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${name}`)
  log(`w6-r2-01: shot ${name}`)
}

// ① mobile keeper sign-in.
await send('Page.navigate', { url: `${WEB}/mobile` })
await sleep(3000)
await evaluate('localStorage.clear()')
await send('Page.navigate', { url: 'about:blank' })
await sleep(500)
await send('Page.navigate', { url: `${WEB}/mobile#/login` })
await sleep(3000)
let mobileFilled = false
for (let probe = 0; probe < 12 && mobileFilled !== true; probe++) {
  await sleep(2000)
  mobileFilled = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input')]
    const account = inputs.find(i => (i.placeholder ?? '').includes('业务账号') && i.type !== 'password')
    const pass = inputs.find(i => i.type === 'password')
    if (account === undefined || pass === undefined) return false
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(account, 'keeper'); set(pass, 'Keeper#2026'); return true
  })()`)
}
if (mobileFilled !== true) throw new Error('mobile sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(6000)
const mobileIdentity = await evaluate(`(() => { const raw = localStorage.getItem('dsh-mobile-auth'); return raw === null ? null : JSON.parse(raw).username })()`)
meta.steps.mobileIdentity = mobileIdentity
if (mobileIdentity !== 'keeper') throw new Error(`mobile identity=${String(mobileIdentity)}`)
log(`w6-r2-01: ① keeper 登录成功（mobile identity=keeper）`)

// The home chip + its count badge (the R2 minor — the badge mounts after the
// async count read; poll a few seconds).
let badgeText = ''
for (let probe = 0; probe < 10 && badgeText === ''; probe++) {
  await sleep(1000)
  badgeText = await evaluate(`(() => {
    const chips = [...document.querySelectorAll('button')].filter(b => (b.textContent ?? '').includes('我的预警'))
    if (chips.length === 0) return ''
    const badge = chips[0].parentElement?.querySelector('.adm-badge, [class*=badge]')
    return badge === null || badge === undefined ? '' : (badge.textContent ?? 'dot')
  })()`)
}
meta.steps.homeBadge = badgeText
log(`w6-r2-01: 首页「我的预警」chip 角标=${badgeText === '' ? '（未渲染）' : badgeText}`)
await shot('w6-r2-01a-mobile-home-badge.png')

// ② the alerts page: routed rows + per-row actions.
await send('Page.navigate', { url: `${WEB}/mobile#/alerts` })
let rowState = null
for (let attempt = 0; attempt < 20 && rowState === null; attempt++) {
  await sleep(2000)
  rowState = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid=alert-row]')]
    if (rows.length === 0) return document.querySelector('[class*=emptyCard]') !== null || document.querySelector('[class*=errorCard]') !== null ? [] : null
    return rows.map(r => ({ text: r.textContent ?? '', hasClaim: r.querySelector('[aria-label^="认领预警"]') !== null }))
  })()`)
}
if (rowState === null || rowState.length === 0) throw new Error(`mobile alerts rows=${String(rowState?.length ?? -1)}`)
const claimable = rowState.filter(r => r.hasClaim).length
meta.steps.alertRows = rowState.length
meta.steps.claimButtons = claimable
log(`w6-r2-01: ② #/alerts 渲染 ${String(rowState.length)} 行（open 行带认领按钮 ${String(claimable)} 个）`)
if (claimable === 0) throw new Error('no claim button rendered — the R2 row actions are missing')
await shot('w6-r2-01b-mobile-alerts-before.png')

// ③ the claim click on the target row's button (aria-label carries the entity code).
const before = psql(`SELECT COALESCE(owner,'NULL') || '|' || status FROM wfl_alerts WHERE id = ${targetId};`)
log(`w6-r2-01: ③ 点击前 psql：#${targetId} owner/status=${before}`)
const clicked = await evaluate(`(() => {
  const btn = document.querySelector('[aria-label=${JSON.stringify(`认领预警 ${targetCode}`)}]')
  if (btn === null) return false
  btn.click(); return true
})()`)
if (clicked !== true) throw new Error(`claim button for ${targetCode} not found`)
let after = ''
for (let probe = 0; probe < 15 && !after.startsWith('keeper|'); probe++) {
  await sleep(1000)
  after = psql(`SELECT COALESCE(owner,'NULL') || '|' || status FROM wfl_alerts WHERE id = ${targetId};`)
}
meta.steps.psqlAfterClaim = after
log(`w6-r2-01: ③ 认领后 psql：#${targetId} owner/status=${after}（应 keeper|acknowledged）`)
if (after !== 'keeper|acknowledged') throw new Error(`psql after claim=${after}`)
// The refreshed row shows 已认领 · keeper and (as keeper owns it) the 关闭 button.
let acknowledged = false
for (let probe = 0; probe < 15 && acknowledged !== true; probe++) {
  await sleep(1000)
  acknowledged = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid=alert-row]')]
    return rows.some(r => (r.textContent ?? '').includes('已认领 · keeper') && r.querySelector('[aria-label^="关闭预警"]') !== null)
  })()`)
}
meta.steps.mobileAcknowledged = acknowledged
log(`w6-r2-01: ③ mobile 回显已认领 + 关闭按钮=${String(acknowledged)}`)
await shot('w6-r2-01c-mobile-alerts-after-claim.png')

// ④ PC readback: admin opens the alert center; the same row shows 已认领/keeper.
await evaluate('localStorage.clear()')
await send('Page.navigate', { url: 'about:blank' })
await sleep(500)
let filled = false
for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
  await send('Page.navigate', { url: `${NC}/signin` })
  for (let probe = 0; probe < 12 && filled !== true; probe++) {
    await sleep(2000)
    filled = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      const pass = [...document.querySelectorAll('input[type=password]')]
      if (inputs.length < 1 || pass.length < 1) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true
    })()`)
  }
}
if (filled !== true) throw new Error('PC sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(5000)
const pcIdentity = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)
meta.steps.pcIdentity = pcIdentity
await send('Page.navigate', { url: `${NC}${ALERTS_PAGE}` })
let pcSeen = false
let pcTableRows = 0
for (let attempt = 0; attempt < 30 && pcSeen !== true; attempt++) {
  await sleep(2000)
  const probe = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.offsetHeight > 10)
    const text = rows.map(r => r.textContent ?? '').join('\\n')
    return { rows: rows.length, seenKeeper: text.includes('keeper') && text.includes('已认领'), seenTarget: text.includes(${JSON.stringify(targetCode)}) }
  })()`)
  pcTableRows = probe?.rows ?? 0
  pcSeen = probe?.seenKeeper === true && probe?.seenTarget === true
}
meta.steps.pcReadback = { rows: pcTableRows, seenKeeperAck: pcSeen }
log(`w6-r2-01: ④ PC 预警中心（admin=${pcIdentity}）表格 ${String(pcTableRows)} 行，含 ${targetCode} 的 已认领/keeper=${String(pcSeen)}`)
await shot('w6-r2-01d-pc-alert-center-readback.png')
if (pcSeen !== true) throw new Error('PC readback did not show the acknowledged row')

writeFileSync(`${OUT}w6-r2-01-closure.log`, `${lines.join('\n')}\n`)
writeFileSync(`${OUT}w6-r2-01-meta.json`, `${JSON.stringify(meta, null, 2)}\n`)
log('w6-r2-01: 四步闭环冒烟 PASS（登录→名下预警→认领→psql+双端回显）')
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
