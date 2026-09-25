/**
 * Audit 01b — locate a session whose flow carries a report card with the
 * create-task action, then run the full popup matrix on it (TaskFormModal
 * light/dark, owner picker, date picker, switch, empty-submit error) plus the
 * quick-command panel, its demo toast, NewChatSheet light, and the clear-demo
 * dialog in light. Read-only against the live :3080 server.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-01b-taskform.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A1b] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const d = await boot(9362)
try {
  await demoLogin(d, 'light')

  // ---- find a session with the create-task report action -------------------
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(900)
  const count = await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button').length`)
  note(`session rows: ${String(count)}`)

  let target = null
  for (let index = 0; index < count; index += 1) {
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    const ok = await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 6000 })
    if (ok) {
      const has = await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`)
      if (has) { target = index; break }
    }
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(600)
  }
  note(`target session index: ${String(target)}`)
  if (target === null) throw new Error('no session with create-task report card; seed one via the UI first')

  const hash = await d.evaluate('location.hash')

  // ---- TaskFormModal LIGHT ---------------------------------------------------
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(700)
  await d.shot('audit-01-taskform-light.png')
  note(`light taskform: ${JSON.stringify({
    body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius', 'padding-bottom']),
    inner: await probe(d, '.adm-popup-body > div', ['background-color', 'color', 'padding']),
    mask: await probe(d, '.adm-mask', ['background-color']),
    title: await probe(d, '.adm-popup-body h2', ['color', 'font-size']),
    input: await probe(d, '#task-title', ['background-color', 'border-color', 'border-radius', 'color']),
    submit: await probe(d, '.adm-popup-body button', []),
    bodyVars: await d.evaluate(`(() => { const rs = getComputedStyle(document.body); return { admPrimary: rs.getPropertyValue('--adm-color-primary').trim(), dshmCard: rs.getPropertyValue('--dshm-card').trim() } })()`),
    insideRoot: await d.evaluate(`(() => { const el = document.querySelector('.adm-popup'); return el === null ? null : { parentClass: el.parentElement?.className ?? '', inRoot: el.closest('.dshm-root') !== null } })()`),
  })}`)

  // owner picker
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('负责人'))?.click()`)
  await d.waitFor(`document.body.innerText.includes('我自己')`, { timeout: 8000 })
  await sleep(700)
  await d.shot('audit-02-owner-picker-light.png')
  note(`light picker: ${JSON.stringify({
    popup: await probe(d, '.adm-picker-popup .adm-popup-body, .adm-popup-body .adm-picker-popup, .adm-picker', ['background-color', 'border-top-left-radius']),
    header: await probe(d, '.adm-picker-header', ['background-color', 'border-bottom-color']),
    confirm: await probe(d, '.adm-picker-header-button', ['color', 'font-size', 'font-weight']),
    wheelItem: await probe(d, '.adm-picker-view-column-item', ['color', 'font-size']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`)
  await sleep(400)

  // date picker
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('截止时间'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-date-picker, .adm-picker-view') !== null`, { timeout: 8000 })
  await sleep(700)
  await d.shot('audit-03-date-picker-light.png')
  note(`light datepicker: ${JSON.stringify({
    panel: await probe(d, '.adm-date-picker, .adm-picker', ['background-color']),
    confirm: await probe(d, '.adm-picker-header-button', ['color']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`)
  await sleep(400)

  // switch
  await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
  await sleep(400)
  await d.shot('audit-03b-switch-light.png')
  note(`light switch checked: ${JSON.stringify(await probe(d, '.adm-popup-body .adm-switch-checked', ['background-color', 'border-color']))}`)
  await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)

  // empty submit
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('创建任务'))?.click()`)
  await sleep(500)
  await d.shot('audit-04-taskform-error-light.png')
  note(`light error p: ${JSON.stringify(await probe(d, '.adm-popup-body p', ['color', 'font-size']))}`)
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
  await sleep(400)

  // ---- quick-command panel + demo toast --------------------------------------
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('更多') || (b.getAttribute('aria-label') ?? '').includes('快捷'))?.click()`)
  await sleep(300)
  let qpOpen = await d.evaluate(`document.querySelector('.adm-popup-body') !== null`)
  if (!qpOpen) {
    // fallback: the composer's plus button is usually the first unlabeled round button near the input
    qpOpen = await d.evaluate(`(() => {
      const input = document.querySelector('textarea')
      if (input === null) return false
      const bar = input.closest('div')
      const btn = [...document.querySelectorAll('button')].find(b => {
        const r = b.getBoundingClientRect()
        const ir = input.getBoundingClientRect()
        return r.top >= ir.top - 60 && r.top < ir.bottom + 20 && r.left < ir.left
      })
      if (btn === undefined) return false
      btn.click(); return true
    })()`)
    await sleep(500)
  }
  note(`quick panel open: ${String(qpOpen)}`)
  await d.shot('audit-05-quickpanel-light.png')
  const qpProbe = await d.evaluate(`(() => {
    const panel = [...document.querySelectorAll('div')].reverse().find(el => (el.textContent ?? '').includes('演示版暂未开放') === false && el.querySelector('button') !== null && /拍照|相册|文件/.test(el.textContent ?? ''))
    const tools = [...document.querySelectorAll('button')].filter(b => /拍照|相册|文件|图片/.test(b.textContent ?? ''))
    return { toolCount: tools.length, labels: tools.map(t => (t.textContent ?? '').trim()) }
  })()`)
  note(`quick tools: ${JSON.stringify(qpProbe)}`)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => /拍照|相册|文件/.test((b.textContent ?? '')))?.click()`)
  await sleep(600)
  await d.shot('audit-06-toast-light.png')
  note(`light toast: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'color', 'font-size', 'max-width']))}`)
  await sleep(1200)

  // ---- TaskFormModal DARK ----------------------------------------------------
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html${hash}`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 15000 })
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(700)
  await d.shot('audit-07-taskform-dark.png')
  note(`dark taskform: ${JSON.stringify({
    body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius', 'padding-bottom']),
    title: await probe(d, '.adm-popup-body h2', ['color', 'font-size']),
    input: await probe(d, '#task-title', ['background-color', 'border-color', 'color']),
    rootBg: await d.evaluate(`getComputedStyle(document.querySelector('.dshm-root')).backgroundColor`),
  })}`)

  // dark owner picker
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('负责人'))?.click()`)
  await d.waitFor(`document.body.innerText.includes('我自己')`, { timeout: 8000 })
  await sleep(700)
  await d.shot('audit-08-owner-picker-dark.png')
  note(`dark picker: ${JSON.stringify({
    popup: await probe(d, '.adm-picker-popup .adm-popup-body, .adm-picker', ['background-color']),
    header: await probe(d, '.adm-picker-header', ['background-color', 'border-bottom-color']),
    confirm: await probe(d, '.adm-picker-header-button', ['color']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`)
  await sleep(300)
  await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
  await sleep(400)
  note(`dark switch checked: ${JSON.stringify(await probe(d, '.adm-popup-body .adm-switch-checked', ['background-color']))}`)
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
  await sleep(300)

  // ---- NewChatSheet LIGHT ------------------------------------------------------
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`[...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))`, { timeout: 12000 })
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`[...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))`, { timeout: 12000 })
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(600)
  await d.shot('audit-09-newchat-sheet-light.png')
  note(`light newchat: ${JSON.stringify({
    body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']),
    title: await probe(d, '.adm-popup-body h2', ['color']),
    row: await probe(d, '.adm-popup-body ul li button', ['background-color', 'color']),
  })}`)
} finally {
  writeEvidence('.audit-01b-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
