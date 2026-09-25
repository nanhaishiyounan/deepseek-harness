/**
 * Audit 03 — page-level matrix: every route in light+dark, DatePicker redo,
 * portal-switch color, work detail, the 430px desktop shell popup overflow,
 * and the pull-to-refresh indicator. Read-only against the live :3080 server.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-03-pages.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A3] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const ROUTES = [
  ['home', '#/'],
  ['agents', '#/agents'],
  ['work', '#/work'],
  ['tasks', '#/tasks'],
  ['files', '#/files'],
  ['chats', '#/chats'],
  ['profile', '#/profile'],
]

async function openReportSession(d) {
  for (let index = 0; index < 40; index += 1) {
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`document.querySelectorAll('[aria-label="会话列表"] button').length > ${String(index)}`, { timeout: 12000 })
    await sleep(700)
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    const ok = await d.waitFor(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`, { timeout: 5000 })
    if (ok) return true
  }
  return false
}

async function shotTaskForm(d, tag) {
  const opened = await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))
    if (btn === undefined) return false
    btn.scrollIntoView({ block: 'center' }); btn.click(); return true
  })()`)
  if (!opened) { note(`${tag}: create-task button missing`); return false }
  await d.waitFor(`document.querySelector('.adm-popup-body h2') !== null && (document.querySelector('.adm-popup-body h2').textContent ?? '').includes('创建处理任务')`, { timeout: 8000 })
  await sleep(700)
  return true
}

const d = await boot(9364)
try {
  await demoLogin(d, 'light')
  const ok = await openReportSession(d)
  note(`report session: ${String(ok)}`)

  // ---- DatePicker redo (light) ----------------------------------------------
  if (await shotTaskForm(d, 'datepicker-light')) {
    await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('截止时间'))?.click()`)
    const dp = await d.waitFor(`[...document.querySelectorAll('.adm-picker-header')].length > 0`, { timeout: 8000 })
    note(`datepicker open: ${String(dp)}`)
    await sleep(700)
    await d.shot('audit-17-date-picker-light.png')
    note(`datepicker: ${JSON.stringify({
      header: await probe(d, '.adm-picker-header', ['background-color', 'border-bottom-color']),
      confirm: await probe(d, '.adm-picker-header .adm-picker-header-button:last-child', ['color']),
      popupBody: await probe(d, '.adm-picker-popup .adm-popup-body', ['background-color', 'border-top-left-radius']),
    })}`)
    await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`)
    await sleep(400)
    // portal switch checked color
    await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
    await sleep(400)
    note(`portal switch checked checkbox: ${JSON.stringify(await probe(d, '.adm-popup-body .adm-switch.adm-switch-checked .adm-switch-checkbox', ['background-color']))}`)
    await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
    await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
    await sleep(300)
  }

  // ---- page matrix light ------------------------------------------------------
  for (const [name, hash] of ROUTES) {
    await d.goto(`${BASE}/mobile.html${hash}`)
    await sleep(900)
    await d.shot(`audit-18-${name}-light.png`)
  }
  // work detail (first doing item)
 await d.goto(`${BASE}/mobile.html#/work`)
 await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  const detail = await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button[aria-label^="打开"]')].find(b => (b.getAttribute('aria-label') ?? '').includes('供应商'))
      ?? document.querySelector('button[aria-label^="打开"]')
    if (btn === undefined || btn === null) return false
    btn.click(); return true
  })()`)
  note(`work detail opened: ${String(detail)}`)
  await sleep(900)
  await d.shot('audit-19-workdetail-light.png')
  note(`workdetail progress: ${JSON.stringify({
    fill: await probe(d, 'progress, [class*="progressFill"]', ['background-image', 'background-color']),
  })}`)

  // ---- page matrix dark -------------------------------------------------------
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  const detailHash = await d.evaluate('location.hash')
  const DARK_ROUTES = [...ROUTES, ['workdetail', detailHash]]
  for (const [name, hash] of DARK_ROUTES) {
    await d.send('Page.navigate', { url: 'about:blank' })
    await sleep(250)
    await d.goto(`${BASE}/mobile.html${hash}`)
    await sleep(900)
    await d.shot(`audit-20-${name}-dark.png`)
  }

  // ---- desktop shell (1280×832): popup overflow + halo ------------------------
  await d.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 15000 })
  await sleep(700)
  await d.shot('audit-21-desktop-shell-light.png')
  note(`desktop shell: ${JSON.stringify({
    root: await probe(d, '.dshm-root', ['border-radius', 'box-shadow', 'max-width']),
    bodyBg: await d.evaluate(`getComputedStyle(document.body).backgroundColor`),
  })}`)

  // open the task form on desktop → popup spans full viewport width
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(800)
  await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[30]?.click()`)
  await d.waitFor(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`, { timeout: 8000 })
  await shotTaskForm(d, 'desktop-taskform')
  await d.shot('audit-22-desktop-taskform-overflow.png')
  note(`desktop popup: ${JSON.stringify({
    popupBody: await probe(d, '.adm-popup-body', ['background-color']),
    rootRect: await d.evaluate(`(() => { const r = document.querySelector('.dshm-root').getBoundingClientRect(); return { left: r.left, width: r.width } })()`),
    popupRect: await d.evaluate(`(() => { const r = document.querySelector('.adm-popup-body').getBoundingClientRect(); return { left: r.left, width: r.width } })()`),
  })}`)
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
  await sleep(300)

  // clear-demo dialog on desktop (mask spans viewport, dialog centered on viewport not shell)
  await d.goto(`${BASE}/mobile.html#/profile`)
  await d.waitFor(`document.body.innerText.includes('清除演示数据')`, { timeout: 12000 })
  await d.evaluate(`[...document.querySelectorAll('*')].find(el => (el.textContent ?? '').trim() === '清除演示数据')?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 8000 })
  await sleep(500)
  await d.shot('audit-23-desktop-dialog-position.png')
  note(`desktop dialog: ${JSON.stringify({
    rootRect: await d.evaluate(`(() => { const r = document.querySelector('.dshm-root').getBoundingClientRect(); return { left: r.left, width: r.width } })()`),
    dialogRect: await d.evaluate(`(() => { const r = document.querySelector('.adm-dialog').getBoundingClientRect(); return { left: r.left, width: r.width, top: r.top } })()`),
  })}`)

  // ---- pull-to-refresh indicator (mobile viewport, home) ----------------------
  await d.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(250)
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 15000 })
  await sleep(600)
  // drag down from mid-list via synthetic touch
  await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 300 }] })
  for (let y = 320; y <= 460; y += 20) {
    await d.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] })
    await sleep(30)
  }
  await d.shot('audit-24-pull-refresh.png')
  await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(600)
  note(`ptr indicator: ${JSON.stringify(await probe(d, '.adm-pull-to-refresh-head-content, .adm-pull-to-refresh', ['color', 'font-size']))}`)
} finally {
  writeEvidence('.audit-03-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
