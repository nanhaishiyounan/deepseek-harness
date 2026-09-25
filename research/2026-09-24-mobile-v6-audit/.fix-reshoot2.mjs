/**
 * A2 fix re-shoot, part 2 — repairs the four probe paths that missed in part 1
 * (09 List.Item click, 11/14 toast lane, 32 stale dialog + selector, 17 panel
 * radius) against the same live server. Read-only for the server process.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.fix-reshoot2.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A2b] ${line}`) }

async function openReportChat(d) {
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(900)
  const count = await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button').length`)
  for (let index = 0; index < count; index += 1) {
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    const ok = await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 5000 })
    if (ok) {
      const has = await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`)
      if (has) return true
    }
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(500)
  }
  return false
}

/** Open the quick panel in a chat and tap a demo tool to fire the toast. */
async function fireToast(d) {
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(700)
  const opened = await d.evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('去聊聊'))
    if (el === undefined) return false
    el.click(); return true
  })()`)
  if (!opened) return false
  await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
  await sleep(900)
  await d.evaluate(`document.querySelector('[aria-label="打开快捷面板"]')?.click()`)
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')].find(b => (b.textContent ?? '').includes('语音'))?.click()
    ?? document.querySelectorAll('button[class*="qpTool"]')[0]?.click()`)
  await sleep(400)
  return true
}

const d = await boot(9365)
try {
  // ---- light: 11 toast + 17 date-picker radius + 32 login CTA ----------------
  await demoLogin(d, 'light')
  if (await fireToast(d)) {
    await d.shot('fix-11-toast-light.png')
    note(`11 toast light: ${JSON.stringify({ toast: await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'bottom', 'color']) })}`)
    await sleep(1600)
  }

  if (await openReportChat(d)) {
    await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
    await sleep(600)
    await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
    await d.waitFor(`document.querySelector('.adm-picker-view, .adm-date-picker, .adm-calendar-picker-view') !== null || document.querySelector('.adm-popup .adm-popup-body .adm-picker') !== null`, { timeout: 6000 })
    await sleep(700)
    await d.shot('fix-17-date-picker-light.png')
    note(`17 date picker light: ${JSON.stringify({
      sheet: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius']),
      centerBody: await probe(d, '.adm-center-popup-body', ['border-radius', 'background-color']),
      popupCount: await d.evaluate(`document.querySelectorAll('.adm-popup').length`),
    })}`)
    await d.evaluate(`document.querySelector('.adm-mask:last-of-type')?.click()`)
    await sleep(400)
    await d.evaluate(`document.querySelector('.adm-mask')?.click()`)
    await sleep(500)
  }

  // 32: close any leftover dialog by its cancel arm, then land on login
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('取消'))?.click()`)
  await sleep(400)
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(600)
  const noDialog = await d.evaluate(`document.querySelector('.adm-dialog') === null && document.querySelector('.adm-popup') === null`)
  await d.shot('fix-32-login-light.png')
  note(`32 login CTA (dialog cleared=${String(noDialog)}): ${JSON.stringify({
    cta: await probe(d, 'button[class*="submit"]', ['background-color', 'color', 'border-radius', '__rect']),
  })}`)

  // ---- dark: 09 clear-demo dialog + 14 toast inversion ----------------------
  await demoLogin(d, 'dark')
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(800)
  await d.evaluate(`(() => {
    const el = [...document.querySelectorAll('.adm-list-item-content')].find(n => (n.textContent ?? '').includes('清除演示数据'))
    if (el === undefined) return false
    el.click(); return true
  })()`)
  const dialogUp = await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(600)
  await d.shot('fix-09-clear-dialog-dark.png')
  note(`09 clear dialog dark (up=${String(dialogUp)}): ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color']),
    content: await probe(d, '.adm-dialog-content', ['color']),
    title: await probe(d, '.adm-dialog-title', ['color']),
    confirm: await probe(d, '.adm-dialog-button-bold', ['color']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('取消'))?.click()`)
  await sleep(500)

  if (await fireToast(d)) {
    await d.shot('fix-14-toast-dark.png')
    note(`14 toast dark: ${JSON.stringify({ toast: await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius', 'bottom']) })}`)
  }
} finally {
  d.cleanup()
}
writeEvidence('.fix-evidence-2.json', evidence)
console.log('A2b re-shoot complete')
