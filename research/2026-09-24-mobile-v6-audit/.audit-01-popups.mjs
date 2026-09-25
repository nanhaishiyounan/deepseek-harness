/**
 * Audit 01 — popup/sheet layer (TaskFormModal first, then every other portal
 * surface) in both theme tracks, read-only against the live :3080 server.
 *
 * Shots: audit-01..: taskform light/dark, picker, datepicker, switch,
 *        newchat sheet, clear-demo dialog, toast — each with computed probes.
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-01-popups.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A1] ${line}`) }
const STYLE_PROPS = ['background-color', 'background-image', 'border-radius', 'color', 'border-top-left-radius', 'box-shadow']

async function openChatWithReport(d) {
  // Home → work tab → 填单助手 entry → chat with the demo report card.
  await d.goto('http://127.0.0.1:3080/mobile.html#/work')
  await d.waitFor(`document.querySelector('[aria-label="AI 同事工具"]') !== null`, { timeout: 15000 })
  await sleep(400)
  const entered = await d.evaluate(`(() => {
    const el = [...document.querySelectorAll('button[aria-label^="去聊聊"]')][0]
    if (el === undefined) return false
    el.click(); return true
  })()`)
  if (!entered) throw new Error('no 去聊聊 entry')
  await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 15000 })
  await sleep(800)
  // Wait for a report card action (demo welcome flow carries one) or bail.
  const hasAction = await d.waitFor(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('任务'))`, { timeout: 12000 })
  return hasAction
}

async function snapshotLayer(d, tag) {
  const layers = await d.evaluate(`(() => {
    const pick = (sel, props) => {
      const el = document.querySelector(sel)
      if (el === null) return null
      const rs = getComputedStyle(el)
      const out = { selector: sel, rect: el.getBoundingClientRect().toJSON() }
      for (const p of props) out[p] = rs.getPropertyValue(p)
      return out
    }
    const bodyVars = {}
    const rs = getComputedStyle(document.body)
    for (const v of ['--adm-color-primary', '--adm-color-background', '--dshm-card', '--dshm-primary']) bodyVars[v] = rs.getPropertyValue(v).trim()
    return {
      popupBody: pick('.adm-popup .adm-popup-body', ['background-color', 'border-radius', 'border-top-left-radius', 'padding-bottom']),
      mask: pick('.adm-mask', ['background-color', 'opacity']),
      sheetTitle: pick('.adm-popup-body h2', ['color', 'font-size']),
      fieldInput: pick('#task-title', ['background-color', 'border-color', 'color', 'border-radius']),
      sheetSubmit: pick('[aria-label="创建处理任务"] button:not([aria-label])', []),
      bodyVars,
      sheetBackgroundChain: (() => {
        const el = document.querySelector('.adm-popup-body')
        if (el === null) return null
        // Whether the CSS-modules background won or fell invalid (unset→transparent)
        return { inlineBg: el.style.backgroundColor, computedBg: getComputedStyle(el).backgroundColor, classList: [...el.classList] }
      })(),
    }
  })()`)
  note(`${tag} layers: ${JSON.stringify(layers)}`)
  return layers
}

const d = await boot(9361)
try {
  // ---------- LIGHT ----------
  await demoLogin(d, 'light')
  const reportFound = await openChatWithReport(d)
  note(`report card with task action present: ${String(reportFound)}`)
  await d.shot('audit-00-chat-context-light.png')

  // open TaskFormModal via the report card's create-task action (or fallback: any 任务 button)
  await d.evaluate(`(() => {
    const btns = [...document.querySelectorAll('[data-testid="report-card"] button')]
    const btn = btns.find(b => (b.textContent ?? '').includes('任务')) ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('创建任务'))
    if (btn === undefined) return false
    btn.scrollIntoView({ block: 'center' }); btn.click(); return true
  })()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(600)
  await d.shot('audit-01-taskform-light.png')
  await snapshotLayer(d, 'taskform-light')

  // owner picker
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('负责人'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-picker-popup, .adm-picker') !== null || document.body.innerText.includes('我自己')`, { timeout: 8000 })
  await sleep(600)
  await d.shot('audit-02-owner-picker-light.png')
  note(`picker probe: ${JSON.stringify(await probe(d, '.adm-picker-popup .adm-picker-header, .adm-picker .adm-picker-header', ['background-color', 'color', 'border-bottom-color']))}`)
  note(`picker confirm: ${JSON.stringify(await probe(d, '.adm-picker-header-button', ['color', 'font-size']))}`)
  await d.evaluate(`document.querySelector('.adm-picker-header-button')?.click()`); await sleep(400)

  // date picker
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('截止时间'))?.click()`)
  await d.waitFor(`document.body.innerText.includes('年') && document.querySelector('.adm-date-picker-popup, .adm-picker-view') !== null`, { timeout: 8000 })
  await sleep(600)
  await d.shot('audit-03-date-picker-light.png')
  await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`); await sleep(400)

  // switch on (primary color)
  await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
  await sleep(300)
  note(`switch checked: ${JSON.stringify(await probe(d, '.adm-popup-body .adm-switch-checked', ['background-color', 'border-color']))}`)

  // empty submit → validation error
  await d.evaluate(`document.querySelector('.adm-switch')?.click()`) // back to off
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('创建任务'))?.click()`)
  await sleep(400)
  await d.shot('audit-04-taskform-error-light.png')
  note(`field error: ${JSON.stringify(await probe(d, '.adm-popup-body p', ['color', 'font-size']))}`)
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`); await sleep(300)

  // toast (demo-not-open action in the chat composer)
  await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').length > 0 && (b.textContent ?? '').includes('语音'))
      ?? [...document.querySelectorAll('[aria-label]')].find(b => /语音|图片/.test(b.getAttribute('aria-label')))
    if (btn === undefined) return false
    btn.click(); return true
  })()`)
  await sleep(500)
  await d.shot('audit-05-toast-light.png')
  note(`toast: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'color', 'font-size', 'max-width']))}`)

  // ---------- DARK ----------
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`http://127.0.0.1:3080/mobile.html${location_hash_chat(await d.evaluate('location.hash'))}`)
  await sleep(900)
  await d.evaluate(`(() => {
    const btns = [...document.querySelectorAll('[data-testid="report-card"] button')]
    const btn = btns.find(b => (b.textContent ?? '').includes('任务'))
    if (btn === undefined) return false
    btn.scrollIntoView({ block: 'center' }); btn.click(); return true
  })()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(600)
  await d.shot('audit-06-taskform-dark.png')
  await snapshotLayer(d, 'taskform-dark')
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`); await sleep(300)

  // dark picker
  await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('任务'))
    btn?.click()
  })()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('负责人'))?.click()`)
  await sleep(700)
  await d.shot('audit-07-owner-picker-dark.png')
  note(`dark picker: ${JSON.stringify(await probe(d, '.adm-picker-popup, .adm-picker', ['background-color']))}`)
  note(`dark picker header: ${JSON.stringify(await probe(d, '.adm-picker-header', ['background-color', 'border-bottom-color']))}`)
  await d.evaluate(`document.querySelector('.adm-picker-header-button')?.click()`); await sleep(300)
  note(`dark switch: ${JSON.stringify(await probe(d, '.adm-popup-body .adm-switch', ['background-color', 'border-color']))}`)

  // ---------- NewChatSheet (chats page) ----------
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
  await d.goto('http://127.0.0.1:3080/mobile.html#/chats')
  await d.waitFor(`[...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))`, { timeout: 12000 })
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(600)
  await d.shot('audit-08-newchat-sheet-dark.png')
  note(`newchat sheet: ${JSON.stringify(await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']))}`)
  await d.evaluate(`document.querySelector('.adm-mask')?.click({ force: true }) ?? document.querySelector('.adm-mask')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await sleep(400)

  // ---------- clear-demo Dialog on profile ----------
  await d.goto('http://127.0.0.1:3080/mobile.html#/profile')
  await d.waitFor(`document.body.innerText.includes('清除演示数据')`, { timeout: 12000 })
  await d.evaluate(`[...document.querySelectorAll('*')].find(el => (el.textContent ?? '').trim() === '清除演示数据')?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 8000 })
  await sleep(500)
  await d.shot('audit-09-clear-dialog-dark.png')
  note(`dialog: ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']),
    title: await probe(d, '.adm-dialog-content .adm-dialog-title, .adm-dialog-title', ['color', 'font-size']),
    confirm: await probe(d, '.adm-dialog-button, .adm-dialog-button-primary', ['color', 'background-color']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-dialog-button')].find(b => (b.textContent ?? '').includes('取消'))?.click()`)
  await sleep(300)
} finally {
  writeEvidence('.audit-01-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}

/** keep the current chat hash across the reload for the dark leg */
function location_hash_chat(hash) {
  return hash.startsWith('#/chat/') ? hash : '#/work'
}
