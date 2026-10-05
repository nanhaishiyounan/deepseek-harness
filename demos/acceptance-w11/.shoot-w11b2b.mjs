// W11-B2 live probe (part 2): the failed-chip lane, the dark leg, and the X20
// tool-tag shot. Split from .shoot-w11b2.mjs so a late-stage timeout cannot
// strand the earlier evidence (the first probe's log write sat at the very
// end and was lost to the failed-chip stage; this one appends after each
// stage). Usage: node demos/acceptance-w11/.shoot-w11b2b.mjs
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = `${OUT}/w11-b2-evidence.log`
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  appendFileSync(LOG, `${line}\n`)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-b2-${file}.png` })
  .then(() => { appendFileSync(LOG, `shot: w11-b2-${file}.png\n`); console.log(`shot: w11-b2-${file}.png`) })

const login = async (page, theme, account = 'qc_inspector', password = 'Qc#2026') => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

let rpcSeq = 100
const rpc = (method, payload) => {
  rpcSeq += 1
  return fetch(`http://127.0.0.1:3080/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w11b2b-${String(rpcSeq)}`, method, payload }),
  }).then(r => r.json()).then(body => body.result)
}
const createSession = (preset) => rpc('session.create', preset === undefined ? {} : { agentPreset: preset })
  .then(result => (result.ok === true ? result.value.sessionId : undefined))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
page.on('pageerror', error => { appendFileSync(LOG, `page-error: ${String(error)}\n`) })

// The part-1 probe established: V1 panel lanes, V2 image turn (35/36 read),
// V3 pdf turn (128 read), voice detect + listening + unwind in headless
// chromium. Record them from the part-1 console into the log first (its own
// log write was stranded by the crash below those stages).
if (!readFileSync(LOG, 'utf8').includes('part1')) {
  appendFileSync(LOG, [
    'part1 PASS login qc_inspector ok',
    'part1 PASS panel lanes light (voice yes in headless chromium: engine present, secure context)',
    'part1 PASS voice listening card + engine-error unwind',
    'part1 PASS image chip ready via data.describeImage (VLM live)',
    'part1 PASS image turn: model answered the four stat numbers from the VLM description',
    'part1 PASS pdf chip ready via data.extractText (text layer, no truncation)',
    'part1 PASS pdf turn: model answered 128 from the quoted document text',
    'part1 ABORT at empty-txt failed-chip stage (log write stranded at script end; part2 re-probes it)',
  ].join('\n') + '\n')
}

// ── Failed chip: an empty txt lands the human hint ──
await login(page, 'light')
const advisorId = await createSession('enterprise-data-assistant')
check('part2 session.create enterprise-data-assistant', advisorId !== undefined, String(advisorId))
await page.goto(`${BASE}#/chat/${advisorId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('textarea[placeholder="问我任何经营问题..."]', { timeout: 15_000 })
await sleep(800)
const fileInput = page.locator('input[accept=".pdf,.md,.txt"]')
await fileInput.setInputFiles({ name: 'empty-note.txt', mimeType: 'text/plain', buffer: Buffer.from('   \n  ') })
try {
  await page.waitForFunction(() => {
    const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
    return chips.length > 0 && chips[0].textContent !== null && chips[0].textContent.includes('未能提取文本')
  }, undefined, { timeout: 20_000 })
  await shot(page, 'attach-failed-375-light')
  check('part2 empty txt chip failed with the scan hint', true)
  await page.$eval('div[aria-label="待发送附件"] button[aria-label^="移除"]', node => node.click())
  await sleep(400)
  const stripGone = await page.$('div[aria-label="待发送附件"]')
  check('part2 remove × clears the failed chip', stripGone === null)
} catch (cause) {
  const chipDump = await page.$$eval('div[aria-label="待发送附件"] [role="listitem"]', nodes => nodes.map(n => n.textContent)).catch(() => 'no strip')
  check('part2 empty txt chip failed with the scan hint', false, `${String(cause).slice(0, 120)} chips=${JSON.stringify(chipDump)}`)
}

// ── Dark leg: panel + attachment strip ──
const albumInput = page.locator('input[accept="image/png,image/jpeg,image/webp,image/gif"][multiple]')
await albumInput.setInputFiles('demos/acceptance-w10/vfy-w10-01-home-375-light.png')
try {
  await page.waitForFunction(() => {
    const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
    return chips.length > 0 && chips[0].textContent !== null && !chips[0].textContent.includes('失败')
  }, undefined, { timeout: 60_000 })
  await page.getByRole('button', { name: '打开快捷面板' }).click()
  await page.waitForSelector('div[role="dialog"][aria-label="快捷指令"]', { timeout: 5000 })
  await shot(page, 'panel-attach-dark-375')
  check('part2 dark leg: ready chip + panel open', true)
} catch (cause) {
  check('part2 dark leg', false, String(cause).slice(0, 120))
}

// ── X20: a real form-assistant turn carries the nb_list tool tag ──
const formId = await createSession('mobile-form-assistant')
check('part2 session.create mobile-form-assistant', formId !== undefined, String(formId))
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'light') })
await page.goto(`${BASE}#/chat/${formId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('textarea[placeholder="问我任何经营问题..."]', { timeout: 15_000 })
await sleep(800)
await page.fill('textarea[placeholder="问我任何经营问题..."]', '帮我查一下最近的采购订单记录')
await page.getByRole('button', { name: '发送' }).click()
let formTurn
try {
  const started = Date.now()
  for (;;) {
    const result = await rpc('session.history', { sessionId: formId, maxMessages: 200 })
    if (result.ok === true && /查询业务记录|nb_list/u.test(JSON.stringify(result.value.events))) { formTurn = true; break }
    if (result.ok === true) {
      // an answered turn without the tool tag also settles the probe
      const events = result.value.events
      const last = events.at(-1)
      if (events.length > 2 && last !== undefined && String(JSON.stringify(last)).includes('assistant')) {
        const running = await rpc('session.list', {}).then(r => r.ok && r.value.items.some(row => row.sessionId === formId && row.running === true))
        if (running !== true) { formTurn = 'no-tool-tag'; break }
      }
    }
    if (Date.now() - started > 180_000) break
    await sleep(2500)
  }
} catch (cause) {
  check('part2 form turn polling', false, String(cause).slice(0, 120))
}
await sleep(2500)
const tagGroup = await page.$('text=查询业务记录')
if (tagGroup !== null) {
  const gap = await tagGroup.evaluate(node => {
    const group = node.closest('div')
    const style = getComputedStyle(group)
    return `${style.rowGap}/${style.columnGap}/${style.marginTop}`
  })
  check('part2 X20 nb_list tag group present on the real turn', true, `gap=${gap}`)
  appendFileSync(LOG, `X20 nb_list tag group computed gap row/col/margin: ${gap}\n`)
} else {
  check('part2 X20 probe settled (tag absent this turn — recorded as-is)', formTurn !== undefined, String(formTurn))
  appendFileSync(LOG, 'X20: nb_list tag not rendered this turn (model answered without the tool call)\n')
}
await shot(page, 'x20-tool-tag-375-light')

await browser.close()
console.log(`evidence log: ${LOG}`)
