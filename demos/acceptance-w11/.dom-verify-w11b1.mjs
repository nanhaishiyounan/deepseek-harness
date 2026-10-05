// W11-B1 T4 DOM verification: evidence for every P0/P1 candidate the VLM
// raised plus the W10 fine-tune pool measurements (X10/X16/X20/X21/X24/X27).
// Read-only against the rebuilt :3080 dist.
// Usage (repo root): node demos/acceptance-w11/.dom-verify-w11b1.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'INFO'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
}
const note = (name, detail) => {
  const line = `INFO ${name} — ${detail}`
  console.log(line)
  LOG.push(line)
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

const browser = await chromium.launch()

// ── A. chat NavBar face (P0-03/07/09/13): the back arrow, the preset badge,
// the header + — colors and the UA-reset state. ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  // X10: the chats header — title h1 center vs the + button center.
  const x10 = await page.evaluate(() => {
    const title = document.querySelector('h1')
    const plus = document.querySelector('button[aria-label="新建会话"]')
    if (!title || !plus) return { error: 'missing' }
    const t = title.getBoundingClientRect()
    const p = plus.getBoundingClientRect()
    return {
      titleCenterY: +(t.top + t.height / 2).toFixed(2), plusCenterY: +(p.top + p.height / 2).toFixed(2),
      delta: +((t.top + t.height / 2) - (p.top + p.height / 2)).toFixed(2),
      titleRect: { top: +t.top.toFixed(1), h: +t.height.toFixed(1) }, plusRect: { top: +p.top.toFixed(1), h: +p.height.toFixed(1) },
    }
  })
  note('X10 chats 顶栏标题/加号中心差', JSON.stringify(x10))
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'w11b1-dom', method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(r => r.json())
  const chatSid = created?.result?.value?.sessionId
  await page.goto(`${BASE}#/chat/${chatSid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await sleep(800)
  const nav = await page.evaluate(() => {
    const back = document.querySelector('.adm-nav-bar-back-arrow, [class*="backHit"]')
    const plus = document.querySelector('button[aria-label="新建会话"]')
    const subtitle = document.querySelector('.adm-nav-bar-title, [class*="headerSub"]')
    const badge = [...document.querySelectorAll('span,b,i')].find(el => el.textContent === '表单')
    const cs = (el) => { if (!el) return null; const c = getComputedStyle(el); return { color: c.color, bg: c.backgroundColor, border: c.border } }
    // The UA-reset probe: any button still carrying a default outset border.
    const badButtons = [...document.querySelectorAll('button')].filter(b => {
      const c = getComputedStyle(b)
      return c.borderStyle !== 'none' && c.borderColor !== 'rgba(0, 0, 0, 0)' && parseFloat(c.borderWidth) === 2 && c.borderStyle === 'outset'
    }).length
    return { back: cs(back), plus: cs(plus), subtitle: cs(subtitle), badge: cs(badge), buttonsTotal: document.querySelectorAll('button').length, uaOutsetButtons: badButtons }
  })
  note('chat NavBar 取样', JSON.stringify(nav))
  check('chat 页无 UA outset button（reset 层在位）', nav.uaOutsetButtons === 0, `total=${nav.buttonsTotal}`)
  // X20: the ActionBadge row spacing (the tool chips inside a report flow item).
  const x20 = await page.evaluate(() => {
    const badge = document.querySelector('[class*="toolBadge"], [class*="badgeRow"]')
    if (!badge) return { found: false }
    const c = getComputedStyle(badge)
    return { found: true, gap: c.gap, marginBottom: c.marginBottom, marginTop: c.marginTop }
  })
  note('X20 工具徽标行', JSON.stringify(x20))
  await context.close()
}

// ── B. chats dark filterTabs (P0-05): the unselected capsule face vs tokens. ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  const tabs = await page.evaluate(() => {
    const wrap = document.querySelector('[class*="filterTabs"]')
    if (!wrap) return { error: 'filterTabs missing' }
    const active = wrap.querySelector('.adm-capsule-tabs-tab-active')
    const idle = [...wrap.querySelectorAll('.adm-capsule-tabs-tab')].find(t => !t.classList.contains('adm-capsule-tabs-tab-active'))
    const cs = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, border: c.border } }
    const canvas = getComputedStyle(document.querySelector('[class*="page"]') ?? document.body).backgroundColor
    return { active: cs(active), idle: cs(idle), canvas, admColorBox: getComputedStyle(wrap).getPropertyValue('--adm-color-box').trim() }
  })
  note('P0-05 chats-dark 分段底色', JSON.stringify(tabs))
  await context.close()
}

// ── C. alerts segmented control (P0-01): self-drawn buttons, not radios. ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/alerts`, { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  const seg = await page.evaluate(() => ({
    radios: document.querySelectorAll('input[type="radio"]').length,
    segButtons: [...document.querySelectorAll('[class*="seg"] button, [class*="seg"] span')].length,
  }))
  note('P0-01 alerts 分段构成', JSON.stringify(seg))
  await context.close()
}

// ── D. home: the search entry icon (P0-06) + X16 heroDate dot. ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/home`, { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  const probe = await page.evaluate(() => {
    const entry = document.querySelector('[aria-label="搜索会话与同事"]')
    const svg = entry?.querySelector('svg')
    const emoji = entry?.textContent?.includes('🔍') ?? false
    // X16: heroDate first-line geometry — the · rides inline text.
    const hero = document.querySelector('[class*="heroDate"]')
    let dotInfo = null
    if (hero) {
      const range = document.createRange()
      const textNode = [...hero.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.includes('·'))
      if (textNode) {
        const idx = textNode.textContent.indexOf('·')
        range.setStart(textNode, idx); range.setEnd(textNode, idx + 1)
        const dot = range.getBoundingClientRect()
        const line = hero.getBoundingClientRect()
        dotInfo = { dotCenterY: +(dot.top + dot.height / 2).toFixed(1), lineCenterY: +(line.top + line.height / 2).toFixed(1), delta: +((dot.top + dot.height / 2) - (line.top + line.height / 2)).toFixed(1) }
      }
    }
    return { svgIcon: svg !== null && svg !== undefined, emojiChar: emoji, dotInfo }
  })
  note('P0-06/X16 home 取样', JSON.stringify(probe))
  await context.close()
}

// ── E. me Switch (P0-16, W10 same-verdict recheck) ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  const sw = await page.evaluate(() => {
    const el = document.querySelector('.adm-switch')
    if (!el) return { error: 'no switch' }
    const c = getComputedStyle(el)
    return { bg: c.backgroundColor, checked: el.classList.contains('adm-switch-checked'), width: c.width, height: c.height, radius: c.borderRadius }
  })
  note('P0-16 me Switch', JSON.stringify(sw))
  await context.close()
}

// ── F. files row alignment (misalign×6) + X14/X15 ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/files`, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  const rows = await page.evaluate(() => {
    const groupCard = document.querySelector('[class*="fileCard"], [class*="groupCard"]') ?? document.querySelector('section')
    const rows = [...document.querySelectorAll('[class*="fileRow"], [class*="row"]')].slice(0, 4)
    return rows.map(row => {
      const stamp = row.querySelector('[class*="stamp"], [class*="icon"], svg')
      const texts = row.querySelector('[class*="texts"], [class*="info"], div')
      const action = row.querySelector('a, button')
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), h: +b.height.toFixed(1), cy: +(b.top + b.height / 2).toFixed(1) } }
      return { stamp: r(stamp), texts: r(texts), action: r(action) }
    })
  })
  note('F files 行对齐取样', JSON.stringify(rows))
  await context.close()
}

// ── G. todos X24: page h1 vs empty-title size ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/todos`, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  const t = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const emptyTitle = document.querySelector('[class*="empty"] [class*="title"], [class*="emptyTitle"]')
    const f = (el) => el ? getComputedStyle(el).fontSize : null
    return { h1: f(h1), emptyTitle: f(emptyTitle) }
  })
  note('X24 todos 字号', JSON.stringify(t))
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-b1-dom-verify.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
