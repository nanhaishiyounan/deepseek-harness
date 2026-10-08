// W23-B2 追查2 identity-bound pass: prompts ride the buyer's authToken (the
// mobile client's rpc auto-attach, replicated here) so the approvals/todos
// scenarios resolve the acting user; cards read back from the durable logs.
// Usage: node demos/acceptance-w23/b2-zero-metrics-browser.mjs
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const SESSDIR = 'examples/kb-agent/.dsh/sessions/--Users-mac-Documents-github-deepseek-harness--'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CASES = [
  { key: 'z1', preset: 'enterprise-data-assistant', input: '我有哪些待审批的单子？' },
  { key: 'z4', preset: 'enterprise-data-assistant', input: '查看我的待办' },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
const token = await page.evaluate(() => (JSON.parse(localStorage.getItem('dsh-mobile-auth') ?? '{}') ?? {}).token)
console.log('logged in as buyer, token head:', String(token).slice(0, 12))
await browser.close()

let rpcSeq = 0
const rpc = async (method, payload) => {
  const res = await fetch(`http://127.0.0.1:3080/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w23b2i-${Date.now()}-${rpcSeq++}`, method, payload }),
  }).then(r => r.json())
  if (res?.result?.ok === true) return res.result.value
  throw new Error(`${method}: ${JSON.stringify(res?.result?.error ?? res).slice(0, 160)}`)
}

const runs = readFileSync('demos/acceptance-w23/b2-zero-metrics-runs.json', 'utf8').trim() === '' ? [] : JSON.parse(readFileSync('demos/acceptance-w23/b2-zero-metrics-runs.json', 'utf8'))
for (const c of CASES) {
  const created = await rpc('session.create', { agentPreset: c.preset })
  const sid = created.sessionId
  await rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: c.input }], clientTimeZone: 'Asia/Shanghai', authToken: token })
  for (let t = 0; t <= 180; t += 6) {
    await sleep(6000)
    const value = await rpc('session.history', { sessionId: sid, maxMessages: 800 })
    const events = (value?.events ?? []).map(e => e?.event ?? e).filter(Boolean)
    const running = events.some(e => e.type === 'turn/start') && !events.some(e => e.type === 'turn/end')
    if (!running && t > 24) break
  }
  runs.push({ key: c.key, sid, input: c.input })
  appendFileSync('demos/acceptance-w23/b2-title-repro.jsonl', '')
  console.log(`[${c.key}] prompted ${sid}`)
}
writeFileSync('demos/acceptance-w23/b2-zero-metrics-runs.json', JSON.stringify(runs, null, 2))
console.log('runs appended; now run b2-zero-metrics-extract.mjs')
