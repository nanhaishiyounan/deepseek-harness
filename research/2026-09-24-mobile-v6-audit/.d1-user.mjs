/**
 * D1 user-screenshot reproduction: same-angle captures against the live
 * :3080 server — home (user shot 2) and the form chat + create-task sheet
 * (user shot 1), plus a 375x667 small-viewport arm for the sheet cutoff
 * check. Read-only for the server; evidence JSON lands next to the shots.
 */
import { boot, demoLogin, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = {}

/** Layout probes shared by both viewport arms of the sheet page. */
async function sheetProbes(d, tag) {
  evidence[tag] = await d.evaluate(`(() => {
    const out = { viewport: { w: window.innerWidth, h: window.innerHeight } }
    const sheet = document.querySelector('[aria-label="创建处理任务"]')
    out.sheetFound = sheet !== null
    if (sheet !== null) {
      const r = sheet.getBoundingClientRect()
      out.sheet = { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), overflowsViewport: r.bottom > window.innerHeight + 1 }
      const scroller = sheet.closest('.adm-popup-body') ?? sheet.parentElement
      out.popup = { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, clipped: scroller.scrollHeight > scroller.clientHeight + 1 }
    }
    const input = document.querySelector('#task-title')
    if (input !== null) {
      const w = input.closest('div[class*="fieldInput"]') ?? input
      const rs = getComputedStyle(w)
      out.titleInput = { border: rs.borderTopWidth + ' ' + rs.borderTopStyle, radius: rs.borderRadius, bg: rs.backgroundColor, h: Math.round(w.getBoundingClientRect().height) }
    }
    const pickers = [...document.querySelectorAll('button[class*="pickerRow"]')]
    out.pickerRows = pickers.map((p) => {
      const rs = getComputedStyle(p)
      const rr = p.getBoundingClientRect()
      return { border: rs.borderBottomWidth + ' ' + rs.borderBottomStyle + ' ' + rs.borderBottomColor, top: rs.borderTopWidth, h: Math.round(rr.height) }
    })
    const strip = document.querySelector('div[class*="sourceStrip"]')
    if (strip !== null) {
      const rs = getComputedStyle(strip)
      out.sourceStrip = { whiteSpace: rs.whiteSpace, overflow: rs.overflow, lines: Math.round(strip.getBoundingClientRect().height / 20) }
    }
    const sug = document.querySelector('div[class*="suggestionBlock"]')
    if (sug !== null) {
      const rs = getComputedStyle(sug)
      out.suggestion = { bg: rs.backgroundColor, radius: rs.borderRadius, labelFs: getComputedStyle(sug.querySelector('span') ?? sug).fontSize }
    }
    return out
  })()`)
}

const d = await boot(9451)
await demoLogin(d, 'light')
await d.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await sleep(700)
await d.shot('d1-user-1-home.png')

evidence.home = await d.evaluate(`(() => {
  const out = {}
  const names = [...document.querySelectorAll('span[class*="rosterName"]')]
  out.roster = {
    count: names.length,
    widths: names.slice(0, 5).map((n) => getComputedStyle(n).maxWidth),
    truncated: names.slice(0, 5).map((n) => ({ text: n.textContent, clientW: n.clientWidth, scrollW: n.scrollWidth, clipped: n.scrollWidth > n.clientWidth })),
    cardW: (() => { const c = document.querySelector('button[class*="rosterCard"]'); return c === null ? null : Math.round(c.getBoundingClientRect().width) })(),
  }
  const stats = document.querySelector('button[class*="statsCard"]')
  if (stats !== null) {
    const rs = getComputedStyle(stats)
    out.statsCard = { shadow: rs.boxShadow.slice(0, 60), border: rs.borderTopWidth + ' ' + rs.borderTopColor }
  }
  const val = document.querySelector('span[class*="statValue"]')
  if (val !== null) out.statValue = { fs: getComputedStyle(val).fontSize, fw: getComputedStyle(val).fontWeight }
  const quick = document.querySelector('div[class*="quickRow"]')
  if (quick !== null) {
    out.quickRow = { flexWrap: getComputedStyle(quick).flexWrap, h: Math.round(quick.getBoundingClientRect().height), chips: [...quick.children].map((c) => Math.round(c.getBoundingClientRect().width)) }
  }
  const badge = document.querySelector('span[class*="recentBadge"]')
  if (badge !== null) out.recentBadge = { w: Math.round(badge.getBoundingClientRect().width), h: Math.round(badge.getBoundingClientRect().height), bg: getComputedStyle(badge).backgroundColor }
  const list = document.querySelector('div[class*="recentList"]')
  if (list !== null) out.recentList = { shadow: getComputedStyle(list).boxShadow.slice(0, 60) }
  return out
})()`)

// User shot 1's page: the form-assistant chat with the risk report card.
await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))?.click()`)
await d.waitFor(`document.querySelector('[aria-label="创建处理任务"]') === null && document.body.innerText.includes('棕榈油')`, { timeout: 20000 }).catch(() => {})
await d.waitFor(`document.body.innerText.includes('棕榈油') || document.body.innerText.includes('风险') || document.body.innerText.includes('智能填表')`, { timeout: 20000 })
await sleep(1200)
await d.shot('d1-user-2-chat.png')

const opened = await d.evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('创建处理任务'))
  if (btn === undefined) return 'no-button'
  btn.click()
  return 'clicked'
})()`)
evidence.sheetOpenAttempt = opened
await d.waitFor(`document.querySelector('[aria-label="创建处理任务"]') !== null`, { timeout: 10000 })
await sleep(600)
await d.shot('d1-user-3-taskform.png')
await sheetProbes(d, 'sheet390')

d.cleanup()

// Small-viewport arm: iPhone SE class — the user shot 1's bottom cutoff.
const s = await boot(9452, { width: 375, height: 667 })
await demoLogin(s, 'light')
await s.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await s.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('鲜丰冷链箱登记'))?.click()`)
await s.waitFor(`document.body.innerText.includes('智能填表') || document.body.innerText.includes('鲜丰')`, { timeout: 20000 })
await sleep(1000)
await s.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
await s.waitFor(`document.querySelector('[aria-label="创建处理任务"]') !== null`, { timeout: 10000 })
await sleep(600)
await s.shot('d1-user-4-taskform-small.png')
await sheetProbes(s, 'sheet375')
s.cleanup()

writeEvidence('.d1-user-evidence.json', evidence)
console.log('done')
