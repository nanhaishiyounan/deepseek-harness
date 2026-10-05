// W11-B3 re-audit DOM evidence: the live computed styles behind every
// non-ua-default P0/P1 candidate the VLM raised on the B2/B3 shots — panel
// card faces on the dark track, tool-tile ink, listening-card contrast, the
// attachment chip's own paint (vs the claimed native control), the input-row
// trio's center line, and the header subtitle. One run, one log.
// Usage (repo root): node demos/acceptance-w11/.dom-verify-w11b3.mjs
import { appendFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const LOG = 'demos/acceptance-w11/w11-b3-dom-verify.log'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const log = (line) => { console.log(line); appendFileSync(LOG, `${line}\n`) }
appendFileSync(LOG, `--- run ${new Date().toISOString()} ---\n`)

/** WCAG contrast of two rgb(a) strings. */
const contrastOf = (a, b) => {
  const parse = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v)
    const [, r, g, bl, al = '1'] = m
    return [Number(r), Number(g), Number(bl), Number(al)]
  }
  const lum =([r, g, b, a]) => {
    const mix = (bg) => r * a + bg[0] * (1 - a)
    return -1 // unused
  }
  const channel = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const rel = ([r, g, b, a], bg = [255, 255, 255, 1]) => {
    const rr = r * a + bg[0] * (1 - a)
    const gg = g * a + bg[1] * (1 - a)
    const bb = b * a + bg[2] * (1 - a)
    return 0.2126 * channel(rr) + 0.7152 * channel(gg) + 0.0722 * channel(bb)
  }
  const ca = parse(a); const cb = parse(b)
  const la = rel(ca, cb); const lb = rel(cb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const login = async (page, theme) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}
const rpc = (method, payload) => fetch('http://127.0.0.1:3080/api/session.create', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: 'w11b3-dom', method, payload }),
}).then(r => r.json())

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })

for (const theme of ['light', 'dark']) {
  await login(page, theme)
  const created = await rpc('session.create', { agentPreset: 'mobile-form-assistant' })
  const sid = created.result.value.sessionId
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await sleep(1000)

  // A/B/E/G: panel faces + tool ink + subtitle + placeholder + trio alignment
  await page.getByRole('button', { name: '打开快捷面板' }).click()
  await page.waitForSelector('div[role="dialog"][aria-label="快捷指令"]', { timeout: 5000 })
  await sleep(500)
  const panel = await page.evaluate((contrastSrc) => {
    const contrastOf = eval(`(${contrastSrc})`)
    const read = (el) => {
      if (el === null) return null
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, color: s.color, border: s.borderColor, radius: s.borderRadius }
    }
    const qpItem = document.querySelector('[class*="qpItem"]')
    const qpTool = document.querySelector('[class*="qpTool"]')
    const qpTitle = document.querySelector('[class*="qpTitle"]')
    const panelBox = document.querySelector('div[role="dialog"][aria-label="快捷指令"]')
    const subtitle = document.querySelector('[class*="navSub"]') ?? document.querySelector('h1 + p, [class*="subtitle"]')
    const placeholder = document.querySelector('.adm-text-area-element')
    const plusBtn = document.querySelector('[class*="plusBtn"]')
    const send = document.querySelector('[class*="send"]')
    const shell = document.querySelector('[class*="inputShell"]')
    const centers = [plusBtn, shell, send].map(el => {
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return Math.round(r.top + r.height / 2)
    })
    return {
      panelBox: read(panelBox), qpItem: read(qpItem), qpTool: read(qpTool), qpTitle: read(qpTitle),
      qpToolContrast: qpTool === null ? null : Number(contrastOf(getComputedStyle(qpTool).color, getComputedStyle(qpTool).backgroundColor).toFixed(2)),
      subtitle: subtitle === null ? null : { text: subtitle.textContent?.slice(0, 18), color: read(subtitle)?.color },
      placeholderColor: placeholder === null ? null : getComputedStyle(placeholder).color,
      trioCenters: centers,
    }
  }, contrastOf.toString())
  log(`[${theme}] panel=${JSON.stringify(panel)}`)

  // C: listening card (voice lane runs in headless chromium: engine present)
  const voice = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[class*="qpTool"]')]
    return btns.map(b => b.textContent)
  })
  log(`[${theme}] panel tool labels=${JSON.stringify(voice)}`)
}

// D: attachment chip paint (dark leg) — inject one failing pick for a fast chip
await login(page, 'dark')
const created2 = await rpc('session.create', { agentPreset: 'enterprise-data-assistant' })
const sid2 = created2.result.value.sessionId
await page.goto(`${BASE}#/chat/${sid2}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('textarea[placeholder="问我任何经营问题..."]', { timeout: 15_000 })
await sleep(800)
const fileInput = page.locator('input[accept=".pdf,.md,.txt"]')
await fileInput.setInputFiles({ name: 'empty-note.txt', mimeType: 'text/plain', buffer: Buffer.from('  \n ') })
await page.waitForFunction(() => {
  const chips = document.querySelectorAll('div[aria-label="待发送附件"] [role="listitem"]')
  return chips.length > 0 && chips[0].textContent !== null && chips[0].textContent.includes('未能提取文本')
}, undefined, { timeout: 20_000 })
const chip = await page.evaluate(() => {
  const el = document.querySelector('[class*="attachChip"]')
  if (el === null) return null
  const s = getComputedStyle(el)
  const remove = el.querySelector('button')
  return {
    tag: el.tagName, role: el.getAttribute('role'),
    bg: s.backgroundColor, color: s.color, border: `${s.borderWidth} ${s.borderStyle} ${s.borderColor}`, radius: s.borderRadius,
    removeIsButton: remove?.tagName, removeBg: remove === null ? null : getComputedStyle(remove).backgroundColor,
    nativeInputVisible: [...document.querySelectorAll('input[type="file"]')].every(i => i.offsetParent === null),
  }
})
log(`[dark] attachChip=${JSON.stringify(chip)}`)

// C-follow: listening card text contrast — force the card via the real voice toggle
await page.getByRole('button', { name: '打开快捷面板' }).click()
await page.waitForSelector('div[role="dialog"][aria-label="快捷指令"]', { timeout: 5000 })
const voiceBtn = page.locator('[class*="qpTool"]', { hasText: '语音' })
if (await voiceBtn.count() > 0) {
  await voiceBtn.click()
  await sleep(1500)
  const card = await page.evaluate((contrastSrc) => {
    const contrastOf = eval(`(${contrastSrc})`)
    const el = document.querySelector('[class*="listeningCard"]')
    if (el === null) return { present: false }
    const s = getComputedStyle(el)
    const text = el.querySelector('[class*="listenText"]')
    const ts = text === null ? null : getComputedStyle(text)
    return {
      present: true, bg: s.backgroundColor, textColor: ts?.color,
      contrast: ts === null ? null : Number(contrastOf(ts.color, s.backgroundColor).toFixed(2)),
    }
  }, contrastOf.toString())
  log(`[voice] listeningCard=${JSON.stringify(card)}`)
} else {
  log('[voice] listeningCard= voice tile absent (three-lane panel)')
}

await browser.close()
log('done')
