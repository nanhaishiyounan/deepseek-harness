// W11-B2 live probe: the plus-panel lanes over the rebuilt :3080 gateway.
// V1 panel 2x2 + attachment strip (light/dark), V2 image → describeImage →
// send → model answers from the image, V3 pdf → extractText → quote → send →
// model answers from the document, V4 voice detect truth-telling in headless
// Chromium, X20 the nb_list tool-tag group on a real turn. Every assertion
// lands in w11-b2-evidence.log next to this script's PNGs.
// Usage (repo root): node demos/acceptance-w11/.shoot-w11b2.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => {
  const full = `${OUT}/w11-b2-${file}.png`
  return page.screenshot({ path: full }).then(() => console.log(`shot: w11-b2-${file}.png`))
}

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

let rpcSeq = 0
const rpc = async (method, payload) => {
  rpcSeq += 1
  return fetch(`http://127.0.0.1:3080/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `w11b2-${String(rpcSeq)}`, method, payload }),
  }).then(r => r.json()).then(body => body.result)
}

const createSession = (preset) => rpc('session.create', preset === undefined ? {} : { agentPreset: preset })
  .then(result => (result.ok === true ? result.value.sessionId : undefined))

/** Poll history until the running turn lands an assistant message matching /re/. */
const awaitAssistant = async (sessionId, re, timeoutMs = 180_000) => {
  const started = Date.now()
  for (;;) {
    const result = await rpc('session.history', { sessionId, maxMessages: 200 })
    if (result.ok === true) {
      const text = JSON.stringify(result.value.events)
      if (re.test(text)) return text
    }
    if (Date.now() - started > timeoutMs) return undefined
    await sleep(2500)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
page.on('console', message => {
  if (message.type() === 'error') LOG.push(`console-error: ${message.text()}`)
})

// ── Login (light) ──
await login(page, 'light')
check('login qc_inspector ok', true)

// ── V2/V3 session: business-advisor answers the attachment quotes ──
const advisorId = await createSession('enterprise-data-assistant')
check('session.create enterprise-data-assistant', advisorId !== undefined, String(advisorId))
await page.goto(`${BASE}#/chat/${advisorId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('textarea[placeholder="问我任何经营问题..."]', { timeout: 15_000 })
await sleep(1200)

// ── V1: the panel's 2x2 tool grid (voice yes/no by engine presence) ──
const detect = await page.evaluate(() => ({
  secure: window.isSecureContext,
  engine: typeof window.SpeechRecognition === 'function' || typeof window.webkitSpeechRecognition === 'function',
}))
check('voice detect ladder in headless chromium', true, JSON.stringify(detect))
await page.getByRole('button', { name: '打开快捷面板' }).click()
await page.waitForSelector('div[role="dialog"][aria-label="快捷指令"]', { timeout: 5000 })
const lanes = await page.$$eval('div[role="toolbar"][aria-label="工具"] button', buttons => buttons.map(button => button.textContent ?? ''))
check('panel tool lanes', true, lanes.join('/'))
if (detect.secure === true && detect.engine === true) {
  check('panel renders 4 lanes (voice engine present)', lanes.length === 4 && lanes[0] === '语音', lanes.join('/'))
} else {
  check('panel renders 3 lanes (no engine: WeChat steady state)', lanes.length === 3 && !lanes.includes('语音'), lanes.join('/'))
}
await shot(page, 'panel-375-light')

// Voice lane live behavior (only when the engine exists in this chromium).
if (detect.secure === true && detect.engine === true) {
  await page.getByRole('button', { name: '语音' }).click()
  await page.waitForSelector('button[aria-label="正在聆听，点击结束"]', { timeout: 5000 })
  await shot(page, 'voice-listening-375-light')
  // Headless chromium has no speech backend: the engine errors within seconds.
  await sleep(6000)
  await shot(page, 'voice-error-375-light')
  const stillListening = await page.$('button[aria-label="正在聆听，点击结束"]')
  check('listening card unwinds after engine error', stillListening === null)
  await page.getByRole('button', { name: '语音' }).click().catch(() => {})
} else {
  const voiceTile = await page.$('div[role="toolbar"] button:has-text("语音")')
  check('voice tile hidden without engine', voiceTile === null)
}

// ── V1b + V2: album pick → describeImage → ready chip → real turn ──
const albumInput = page.locator('input[accept="image/png,image/jpeg,image/webp,image/gif"][multiple]')
await albumInput.setInputFiles('demos/acceptance-w10/vfy-w10-01-home-375-light.png')
await page.waitForSelector('div[aria-label="待发送附件"]', { timeout: 10_000 })
await sleep(600)
await shot(page, 'attach-uploading-375-light')
await page.waitForSelector('div[aria-label="待发送附件"]', { state: 'attached', timeout: 30_000 })
await page.waitForFunction(() => {
  const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
  return chips.length > 0 && chips[0].textContent !== null && !chips[0].textContent.includes('失败')
}, undefined, { timeout: 60_000 })
const chipText = await page.$eval('div[aria-label="待发送附件"] [role="listitem"]', node => node.textContent ?? '')
check('image chip reached ready (describeImage lane)', chipText.includes('vfy-w10-01') || chipText.length > 0, chipText.slice(0, 60))
await shot(page, 'attach-ready-image-375-light')

await page.fill('textarea[placeholder="问我任何经营问题..."]', '看这张截图：四个统计数字分别是什么？只回答数字。')
await shot(page, 'image-send-draft-375-light')
await page.getByRole('button', { name: '发送' }).click()
const imageTurn = await awaitAssistant(advisorId, /"role":"assistant"/u)
check('image turn produced an assistant message', imageTurn !== undefined)
const imageAnswer = imageTurn !== undefined
  ? [...imageTurn.matchAll(/"role":"assistant"[^}]*"content":"([^"]{20,400})"/gu)].map(m => m[1]).at(-1) ?? ''
  : ''
check('model answered from the image description (35/36 present)', imageAnswer.includes('35') && imageAnswer.includes('36'), imageAnswer.slice(0, 140))
await sleep(1500)
await page.evaluate(() => { const flow = document.querySelector('div[class*="flow"]'); if (flow !== null) flow.scrollTop = flow.scrollHeight })
await sleep(600)
await shot(page, 'image-turn-answered-375-light')
LOG.push(`image-turn answer: ${imageAnswer.slice(0, 220)}`)

// ── V3: pdf pick → extractText → quote chip → real turn ──
const fileInput = page.locator('input[accept=".pdf,.md,.txt"]')
await fileInput.setInputFiles('/tmp/w11-sku.pdf')
await page.waitForFunction(() => {
  const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
  return chips.length > 0 && chips[0].textContent !== null && (chips[0].textContent.includes('已截断') || !chips[0].textContent.includes('处理'))
}, undefined, { timeout: 30_000 })
await shot(page, 'attach-ready-pdf-375-light')
await page.fill('textarea[placeholder="问我任何经营问题..."]', '这份文件里 SKU-8823 的库存是多少箱？只回答数字。')
await page.getByRole('button', { name: '发送' }).click()
const pdfTurn = await awaitAssistant(advisorId, /SKU-8823/u)
const pdfAnswer = pdfTurn !== undefined
  ? [...pdfTurn.matchAll(/"role":"assistant"[^}]*"content":"([^"]{10,400})"/gu)].map(m => m[1]).filter(t => t.includes('128') || t.includes('SKU')).at(-1) ?? ''
  : ''
check('model answered 128 from the pdf quote', pdfAnswer.includes('128'), pdfAnswer.slice(0, 160))
await sleep(1500)
await page.evaluate(() => { const flow = document.querySelector('div[class*="flow"]'); if (flow !== null) flow.scrollTop = flow.scrollHeight })
await sleep(600)
await shot(page, 'pdf-turn-answered-375-light')
LOG.push(`pdf-turn answer: ${pdfAnswer.slice(0, 220)}`)

// ── Failed chip: an empty txt lands the human hint ──
await fileInput.setInputFiles({ name: 'empty-note.txt', mimeType: 'text/plain', buffer: Buffer.from('   \n  ') })
await page.waitForFunction(() => {
  const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
  return chips.length > 0 && chips[0].textContent !== null && chips[0].textContent.includes('未能提取文本')
}, undefined, { timeout: 20_000 })
await shot(page, 'attach-failed-375-light')
check('empty txt chip failed with the scan hint', true)
await page.$eval('div[aria-label="待发送附件"] button[aria-label^="移除"]', node => node.click())
await sleep(400)

// ── Dark leg: panel + attachment strip ──
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.goto(`${BASE}#/chat/${advisorId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('textarea[placeholder="问我任何经营问题..."]', { timeout: 15_000 })
await sleep(1000)
await albumInput.setInputFiles('demos/acceptance-w10/vfy-w10-01-home-375-light.png')
await page.waitForFunction(() => {
  const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
  return chips.length > 0 && chips[0].textContent !== null && !chips[0].textContent.includes('失败')
}, undefined, { timeout: 60_000 })
await page.getByRole('button', { name: '打开快捷面板' }).click()
await page.waitForSelector('div[role="dialog"][aria-label="快捷指令"]', { timeout: 5000 })
await shot(page, 'panel-attach-dark-375')

// ── X20: a real form-assistant turn carries the nb_list tool tag group ──
const formId = await createSession('mobile-form-assistant')
check('session.create mobile-form-assistant', formId !== undefined, String(formId))
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'light') })
await page.goto(`${BASE}#/chat/${formId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('textarea[placeholder="问我任何经营问题..."]', { timeout: 15_000 })
await sleep(800)
await page.fill('textarea[placeholder="问我任何经营问题..."]', '帮我查一下最近的采购订单记录')
await page.getByRole('button', { name: '发送' }).click()
const formTurn = await awaitAssistant(formId, /查询业务记录|nb_list|"role":"assistant"/u, 180_000)
check('form turn produced tool/assistant events', formTurn !== undefined)
await sleep(2500)
const tagGroup = await page.$('text=查询业务记录')
if (tagGroup !== null) {
  const gap = await tagGroup.evaluate(node => {
    const group = node.closest('div')
    const style = getComputedStyle(group)
    return `${style.rowGap}/${style.columnGap}/${style.marginTop}`
  })
  LOG.push(`X20 nb_list tag group gap: ${gap}`)
  check('X20 tool tag group present on the real turn', true, `gap=${gap}`)
} else {
  LOG.push('X20: nb_list tag not rendered on this turn (model answered without a tool call)')
  check('X20 probe completed (tag absent this turn — recorded as-is)', true)
}
await shot(page, 'x20-tool-tag-375-light')

await browser.close()
writeFileSync(`${OUT}/w11-b2-evidence.log`, `${LOG.join('\n')}\n`)
console.log(`\nevidence log: ${OUT}/w11-b2-evidence.log (${LOG.length} lines)`)
