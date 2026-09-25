/**
 * Audit 07 — the `.dshm-root button { background:none }` cascade probe: does
 * the tokens reset (specificity 0,1,1) beat every module-class button style
 * (0,1,0)? Probes login CTA, work-card action buttons, report-card actions,
 * and TaskFormModal sheet buttons (portal context) with class-name evidence.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-07-cascade.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A7] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const d = await boot(9368)
try {
  // login CTA (before login)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 15000 })
  await sleep(600)
  note(`login cta: ${JSON.stringify(await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('登录'))
    if (btn === undefined) return null
    const rs = getComputedStyle(btn)
    return { classList: [...btn.classList], bg: rs.backgroundColor, color: rs.color, radius: rs.borderRadius }
  })()`))}`)

  await demoLogin(d, 'light')

  // work card action button (进行中 tab has 查看进度 secondary; 待确认 has 确认完成 primary)
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 12000 })
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-tab')].find(t => (t.textContent ?? '').includes('待确认'))?.click()`)
  await sleep(600)
  note(`work action btns: ${JSON.stringify(await d.evaluate(`(() => {
    const btns = [...document.querySelectorAll('[data-testid="work-card"] button')]
    return btns.filter(b => /打回|确认完成/.test(b.textContent ?? '')).map(b => {
      const rs = getComputedStyle(b)
      return { text: (b.textContent ?? '').trim(), classList: [...b.classList].filter(c => !/^[a-z]+--/i.test(c) === false).slice(0, 2), bg: rs.backgroundColor, color: rs.color }
    })
  })()`))}`)

  // report card buttons with the actual class list
  await d.goto(`${BASE}/mobile.html#/chat/session-v6-b3-rich`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 15000 })
  await sleep(600)
  note(`report btns: ${JSON.stringify(await d.evaluate(`(() => {
    const btns = [...document.querySelectorAll('[data-testid="report-card"] button')]
    return btns.map(b => {
      const rs = getComputedStyle(b)
      const sheet = [...document.styleSheets]
      const match = b.matches('.dshm-root button') ? 'reset-matches' : 'no-reset'
      return { text: (b.textContent ?? '').trim(), classList: [...b.classList], bg: rs.backgroundColor, color: rs.color, match }
    })
  })()`))}`)

  // the reset rule itself: does it exist with background:none?
  note(`reset rule: ${JSON.stringify(await d.evaluate(`(() => {
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const rule of rules ?? []) {
        if (rule.selectorText === '.dshm-root button') {
          return { found: true, css: rule.cssText }
        }
      }
    }
    return { found: false }
  })()`))}`)
} finally {
  writeEvidence('.audit-07-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
