/**
 * D1 after-fix reshoot: the same angles and probes as .d1-user.mjs against
 * the live :3080 server now carrying the fixes — home, chat, the task sheet
 * (390x844), and the 375x667 small-viewport cutoff arm.
 */
import { boot, demoLogin, writeEvidence } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = {}

async function sheetProbes(d, tag) {
  evidence[tag] = await d.evaluate(`(() => {
    const out = { viewport: { w: window.innerWidth, h: window.innerHeight } }
    const sheet = document.querySelector('[aria-label="创建处理任务"]')
    out.sheetFound = sheet !== null
    if (sheet !== null) {
      const r = sheet.getBoundingClientRect()
      out.sheet = { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), overflowsViewport: r.bottom > window.innerHeight + 1 }
      const body = sheet.closest('.adm-popup-body')
      out.popup = { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight }
      const scroller = sheet.querySelector('div[class*="sheetScroller"]')
      out.scroller = scroller === null ? null : { scrollH: scroller.scrollHeight, clientH: scroller.clientHeight, scrolls: scroller.scrollHeight > scroller.clientHeight + 1, overflowY: getComputedStyle(scroller).overflowY }
      const actions = sheet.querySelector('div[class*="sheetActions"]')
      if (actions !== null) {
        const ar = actions.getBoundingClientRect()
        out.actions = { top: Math.round(ar.top), visible: ar.bottom <= window.innerHeight + 1, borderTop: getComputedStyle(actions).borderTopWidth }
      }
    }
    const input = document.querySelector('#task-title')
    if (input !== null) {
      const w = input.closest('div[class*="fieldInput"]') ?? input
      const rs = getComputedStyle(w)
      out.titleInput = { border: rs.borderTopWidth + ' ' + rs.borderTopStyle, radius: rs.borderRadius, h: Math.round(w.getBoundingClientRect().height) }
    }
    out.pickerRows = [...document.querySelectorAll('button[class*="pickerRow"]')].map((p) => {
      const rs = getComputedStyle(p)
      return { border: rs.borderTopWidth + '/' + rs.borderBottomWidth + ' ' + rs.borderTopStyle, radius: rs.borderRadius, h: Math.round(p.getBoundingClientRect().height) }
    })
    const clear = document.querySelector('[aria-label="清除截止时间"]')
    if (clear !== null) {
      const rs = getComputedStyle(clear)
      const cr = clear.getBoundingClientRect()
      out.pickerClear = { w: Math.round(cr.width), h: Math.round(cr.height), bg: rs.backgroundColor, color: rs.color }
    }
    const chevron = sheet === null ? null : sheet.querySelector('svg[class*="pickerChevron"]')
    if (chevron !== null) out.pickerChevron = { color: getComputedStyle(chevron).color }
    const strip = document.querySelector('div[class*="sourceStrip"]')
    if (strip !== null) {
      out.sourceStrip = { clamp: getComputedStyle(strip).webkitLineClamp, lines: Math.round(strip.getBoundingClientRect().height / 18), text: strip.textContent.slice(0, 40) }
    }
    const sug = document.querySelector('div[class*="suggestionBlock"]')
    if (sug !== null) {
      const rs = getComputedStyle(sug)
      out.suggestion = { bg: rs.backgroundColor, leftBar: rs.borderLeftWidth + ' ' + rs.borderLeftColor }
    }
    return out
  })()`)
}

const d = await boot(9481)
await demoLogin(d, 'light')
await d.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await sleep(700)
await d.shot('d1-fix-1-home.png')

evidence.home = await d.evaluate(`(() => {
  const out = {}
  const names = [...document.querySelectorAll('span[class*="rosterName"]')]
  out.roster = {
    count: names.length,
    truncated: names.slice(0, 5).map((n) => {
      const cs = getComputedStyle(n)
      return { text: n.textContent, clamp: cs.webkitLineClamp, clipped: n.scrollHeight > n.clientHeight + 1, lines: Math.round(n.getBoundingClientRect().height / 15) }
    }),
    cardW: (() => { const c = document.querySelector('button[class*="rosterCard"]'); return c === null ? null : Math.round(c.getBoundingClientRect().width) })(),
  }
  const stats = document.querySelector('button[class*="statsCard"]')
  if (stats !== null) out.statsCard = { shadow: getComputedStyle(stats).boxShadow.slice(0, 60) }
  const val = document.querySelector('span[class*="statValue"]')
  if (val !== null) out.statValue = { fs: getComputedStyle(val).fontSize }
  const label = document.querySelector('span[class*="statLabel"]')
  if (label !== null) out.statLabel = { color: getComputedStyle(label).color }
  const quick = document.querySelector('div[class*="quickRow"]')
  if (quick !== null) {
    out.quickRow = { display: getComputedStyle(quick).display, cols: getComputedStyle(quick).gridTemplateColumns, chips: [...quick.children].map((c) => Math.round(c.getBoundingClientRect().width)) }
  }
  const badge = document.querySelector('span[class*="recentBadge"]')
  if (badge !== null) out.recentBadge = { w: Math.round(badge.getBoundingClientRect().width), h: Math.round(badge.getBoundingClientRect().height) }
  const list = document.querySelector('div[class*="recentList"]')
  if (list !== null) out.recentList = { shadow: getComputedStyle(list).boxShadow.slice(0, 60) }
  const row = document.querySelector('button[class*="recentRow"]')
  if (row !== null) out.recentRow = { minH: getComputedStyle(row).minHeight, pad: getComputedStyle(row).padding }
  const row2 = [...document.querySelectorAll('button[class*="recentRow"]')][1]
  if (row2 !== null) out.recentRowDivider = getComputedStyle(row2).borderTopWidth + ' ' + getComputedStyle(row2).borderTopColor
  return out
})()`)

// The fresh server may still be streaming the session list; wait for the row.
if (await d.waitFor(`[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))`, { timeout: 20000 }) !== true) throw new Error('recent row never appeared')
await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))?.click()`)
await d.waitFor(`document.body.innerText.includes('智能填表') && !document.body.innerText.includes('今天有')`, { timeout: 20000 })
await sleep(1200)
await d.shot('d1-fix-2-chat.png')

await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
if (await d.waitFor(`document.querySelector('[aria-label="创建处理任务"]') !== null`, { timeout: 10000 }) !== true) throw new Error('task sheet never opened')
await sleep(600)
await d.shot('d1-fix-3-taskform.png')
await sheetProbes(d, 'sheet390')

d.cleanup()

const s = await boot(9482, { width: 375, height: 667 })
await demoLogin(s, 'light')
await s.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await s.waitFor(`[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))`, { timeout: 20000 })
await s.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))?.click()`)
await s.waitFor(`document.body.innerText.includes('智能填表') && !document.body.innerText.includes('今天有')`, { timeout: 20000 })
await sleep(1000)
await s.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
if (await s.waitFor(`document.querySelector('[aria-label="创建处理任务"]') !== null`, { timeout: 10000 }) !== true) throw new Error('task sheet never opened (375)')
await sleep(600)
await s.shot('d1-fix-4-taskform-small.png')
await sheetProbes(s, 'sheet375')

// The dark-track sibling of the fixed sheet (both tracks must carry the fix).
const k = await boot(9483)
await demoLogin(k, 'dark')
await k.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await k.waitFor(`[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))`, { timeout: 20000 })
await k.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))?.click()`)
await k.waitFor(`document.body.innerText.includes('智能填表') && !document.body.innerText.includes('今天有')`, { timeout: 20000 })
await sleep(1000)
await k.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
if (await k.waitFor(`document.querySelector('[aria-label="创建处理任务"]') !== null`, { timeout: 10000 }) !== true) throw new Error('task sheet never opened (dark)')
await sleep(600)
await k.shot('d1-fix-5-taskform-dark.png')
k.cleanup()

writeEvidence('.d1-fix-evidence.json', evidence)
console.log('done')
