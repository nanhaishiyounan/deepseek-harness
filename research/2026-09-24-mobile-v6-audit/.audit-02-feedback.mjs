/**
 * Audit 02 — feedback & inline layers: quick-command panel (light/dark), its
 * demo toast, DatePicker panel, the Switch color split (in-root vs portal),
 * ImageViewer (if any image message exists), and the chats skeleton. Read-only
 * against the live :3080 server.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-02-feedback.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A2] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const d = await boot(9363)
try {
  await demoLogin(d, 'light')

  // reopen the report session found by audit-01b (index 30 in the chats list)
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(800)
  await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[30]?.click()`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 10000 })
  await sleep(500)
  const chatHash = await d.evaluate('location.hash')

  // ---- quick-command panel (inline, should follow tokens) -------------------
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '打开快捷面板')?.click()`)
  await sleep(500)
  const qpOpen = await d.evaluate(`document.querySelector('[aria-label="快捷指令"]') !== null`)
  note(`quick panel open: ${String(qpOpen)}`)
  await d.shot('audit-10-quickpanel-light.png')
  note(`quick panel: ${JSON.stringify({
    panel: await probe(d, '[aria-label="快捷指令"]', ['background-color', 'border-radius', 'box-shadow']),
    toolBtn: await probe(d, '[aria-label="快捷指令"] .qpTool button, [aria-label="快捷指令"] button', ['background-color', 'color', 'border-radius']),
  })}`)

  // demo toast via a qp tool
  await d.evaluate(`[...document.querySelectorAll('[aria-label="快捷指令"] button')].pop()?.click()`)
  await sleep(500)
  await d.shot('audit-11-toast-light.png')
  note(`light toast: ${JSON.stringify({
    main: await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'color', 'font-size', 'max-width']),
    inRoot: await d.evaluate(`(() => { const el = document.querySelector('.adm-toast-mask'); return el === null ? null : el.closest('.dshm-root') !== null })()`),
  })}`)
  await sleep(1500)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '收起快捷面板')?.click()`)

  // ---- DatePicker -------------------------------------------------------------
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].find(b => (b.textContent ?? '').includes('截止时间'))?.click()`)
  await d.waitFor(`document.querySelectorAll('.adm-popup').length >= 2 || [...document.querySelectorAll('.adm-picker-header')].some(h => (h.textContent ?? '').includes('确定'))`, { timeout: 8000 })
  await sleep(700)
  await d.shot('audit-12-date-picker-light.png')
  note(`datepicker: ${JSON.stringify({
    header: await probe(d, '.adm-picker-popup .adm-picker-header', ['background-color', 'border-bottom-color']),
    confirm: await probe(d, '.adm-picker-popup .adm-picker-header-button:last-child', ['color']),
    body: await probe(d, '.adm-picker-popup .adm-popup-body, .adm-date-picker .adm-popup-body', ['background-color', 'border-top-left-radius']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`)
  await sleep(300)

  // ---- Switch split evidence: portal switch vs in-root profile switch --------
  await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
  await sleep(400)
  note(`portal switch checkbox (in TaskFormModal): ${JSON.stringify(await probe(d, '.adm-popup-body .adm-switch-checked .adm-switch-checkbox', ['background-color']))}`)
  await d.evaluate(`document.querySelector('.adm-popup-body .adm-switch')?.click()`)
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
  await sleep(300)

  await d.goto(`${BASE}/mobile.html#/profile`)
  await d.waitFor(`document.body.innerText.includes('深色模式')`, { timeout: 12000 })
  // 通知 switch is safe to toggle (local placeholder); flip to sample checked color
  await d.evaluate(`document.querySelectorAll('.adm-switch')[2]?.closest('.adm-list-item')?.click?.() ; document.querySelectorAll('.adm-switch')[2]?.click()`)
  await sleep(400)
  note(`in-root switch checkbox (profile 通知): ${JSON.stringify(await probe(d, '.dshm-root .adm-switch-checked .adm-switch-checkbox', ['background-color']))}`)
  await d.evaluate(`document.querySelectorAll('.adm-switch')[2]?.click()`)
  await sleep(200)

  // ---- dark quick panel + toast -----------------------------------------------
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html${chatHash}`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 12000 })
  await sleep(500)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '打开快捷面板')?.click()`)
  await sleep(500)
  await d.shot('audit-13-quickpanel-dark.png')
  note(`dark quick panel: ${JSON.stringify({
    panel: await probe(d, '[aria-label="快捷指令"]', ['background-color']),
    toolBtn: await probe(d, '[aria-label="快捷指令"] button', ['background-color', 'color']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('[aria-label="快捷指令"] button')].pop()?.click()`)
  await sleep(500)
  await d.shot('audit-14-toast-dark.png')
  note(`dark toast: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color']))}`)
  await sleep(1200)

  // ---- ImageViewer (only if the flow carries an image bubble) -----------------
  const imgCount = await d.evaluate(`document.querySelectorAll('.dshm-root img').length`)
  note(`images in chat flow: ${String(imgCount)}`)
  if (imgCount > 0) {
    await d.evaluate(`document.querySelector('.dshm-root img')?.click()`)
    await sleep(900)
    await d.shot('audit-15-imageviewer-dark.png')
    note(`imageviewer: ${JSON.stringify({
      viewer: await probe(d, '.adm-image-viewer, .adm-image-viewer-slider', ['background-color']),
      inRoot: await d.evaluate(`(() => { const el = document.querySelector('.adm-image-viewer'); return el === null ? null : el.closest('.dshm-root') !== null })()`),
    })}`)
    await d.evaluate(`document.querySelector('.adm-image-viewer')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
    await sleep(400)
  }

  // ---- skeleton: reload chats and catch the loading window --------------------
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.evaluate(`(() => { const el = document.querySelector('#mobile-root'); if (el !== null) { el.style.minHeight = '100%' } })()`)
  // slow the network view by racing: capture immediately after hash navigation
  await d.evaluate(`location.hash = '#/chats'`)
  await sleep(120)
  await d.shot('audit-16-skeleton-chats.png')
  note(`skeleton: ${JSON.stringify(await probe(d, '[aria-label="正在加载会话"], [role="status"]', ['background-color', 'color']))}`)
  await sleep(1500)
} finally {
  writeEvidence('.audit-02-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
