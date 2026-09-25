/**
 * R2 re-verification driver: after the F1 per-class button-face restoration,
 * the F2 picker-radius override, and the askChip/ImageViewer follow-ups, this
 * collects per-class computed evidence + UA-default leak scans on both tracks,
 * re-measures the picker radii, and re-checks the A2 surfaces (TaskForm, Toast,
 * #1677ff leak sweep). Read-only for the server; screenshots land as r2-*.png.
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (s) => { evidence.push(s); console.log(s) }

const UA_SCAN = `(() => {
  const bad = []
  for (const b of document.querySelectorAll('button')) {
    const cls = b.getAttribute('class') ?? ''
    if (cls === '') continue
    const rs = getComputedStyle(b)
    const bg = rs.backgroundColor
    const color = rs.color
    if (bg === 'rgb(239, 239, 239)' || color === 'rgb(0, 0, 0)') {
      bad.push({ text: (b.textContent ?? '').trim().slice(0, 14), cls: cls.slice(0, 56), bg, color })
    }
  }
  return bad
})()`

const LEAK_1677 = `(() => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    const rs = getComputedStyle(el)
    if (rs.color === 'rgb(22, 119, 255)' || rs.backgroundColor === 'rgb(22, 119, 255)' || rs.borderTopColor === 'rgb(22, 119, 255)') {
      hits.push((el.className && el.className.toString().slice(0, 40)) || el.tagName)
    }
  }
  return hits
})()`

const openTaskForm = async (d) => {
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('button[class*="pickerRow"]') !== null`, { timeout: 6000 })
}

const closeTopLayer = async (d) => {
  await d.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(400)
}

const collectTrack = async (d, track) => {
  // ---- F1: chats session rows + PageNav back hit ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('button[class*="sessionRow"]') !== null`, { timeout: 8000 })
  await sleep(400)
  note(`[${track}] sessionRow: ${JSON.stringify(await probe(d, 'button[class*="sessionRow"]', ['color', 'background-color']))}`)
  note(`[${track}] backHit: ${JSON.stringify(await probe(d, 'button[class*="backHit"]', ['color', 'background-color']))}`)
  note(`[${track}] chats UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  if (track === 'dark') await d.shot('r2-01-chats-dark.png')

  // ---- F1: home ledger card / roster cards / recent rows / section links ----
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.querySelector('button[class*="statsCard"]') !== null`, { timeout: 8000 })
  await sleep(600)
  note(`[${track}] statsCard: ${JSON.stringify(await probe(d, 'button[class*="statsCard"]', ['color', 'background-color']))}`)
  note(`[${track}] rosterCard: ${JSON.stringify(await probe(d, 'button[class*="rosterCard"]', ['color', 'background-color']))}`)
  note(`[${track}] recentRow: ${JSON.stringify(await probe(d, 'button[class*="recentRow"]', ['color', 'background-color']))}`)
  note(`[${track}] sectionLink: ${JSON.stringify(await probe(d, 'button[class*="sectionLink"]', ['color', 'background-color']))}`)
  note(`[${track}] retryLink: ${JSON.stringify(await probe(d, 'button[class*="retryLink"]', ['color', 'background-color']))}`)
  note(`[${track}] home UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  if (track === 'dark') await d.shot('r2-02-home-dark.png')

  // ---- F1: work card-head buttons ----
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('button[class*="cardHeadButton"]') !== null || document.body.innerText.includes('这个状态还没有工作')`, { timeout: 8000 })
  await sleep(400)
  note(`[${track}] cardHeadButton: ${JSON.stringify(await probe(d, 'button[class*="cardHeadButton"]', ['color', 'background-color']))}`)
  note(`[${track}] toolCard: ${JSON.stringify(await probe(d, 'button[class*="toolCard"]', ['color', 'background-color']))}`)
  note(`[${track}] work UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  await d.shot(track === 'dark' ? 'r2-03-work-head-dark.png' : 'r2-04-work-head-light.png')

  // ---- F1/F2/follow-up surface: the rich replay chat ----
  await d.goto(`${BASE}/mobile.html#/chat/session-v6-b3-rich`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 8000 })
  await sleep(400)
  note(`[${track}] copyBtn: ${JSON.stringify(await probe(d, 'button[class*="copyBtn"]', ['color', 'background-color']))}`)

  // quick panel: qpTool + askChip both live in the chat layer
  await d.evaluate(`document.querySelector('button[class*="plusBtn"]')?.click()`)
  await d.waitFor(`document.querySelector('button[class*="qpTool"]') !== null`, { timeout: 6000 })
  await sleep(300)
  note(`[${track}] qpTool: ${JSON.stringify(await probe(d, 'button[class*="qpTool"]', ['color', 'background-color']))}`)
  note(`[${track}] qpItem: ${JSON.stringify(await probe(d, 'button[class*="qpItem"]', ['color', 'background-color']))}`)
  await d.shot(track === 'dark' ? 'r2-05-quickpanel-dark.png' : 'r2-06-quickpanel-light.png')

  // Toast capsule (A2 regression): the placeholder tool fires the demo toast
  await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')][0]?.click()`)
  await d.waitFor(`document.querySelector('.adm-toast-main') !== null`, { timeout: 5000 })
  note(`[${track}] toast: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius', 'bottom']))}`)
  if (track === 'dark') await d.shot('r2-16-toast-dark.png')
  await sleep(1200)

  // TaskForm (A2 regression + F1 pickerRow/sheetClose) and picker radii (F2)
  await openTaskForm(d)
  note(`[${track}] sheetBody: ${JSON.stringify(await probe(d, '.adm-popup-body[class*="sheetBody"]', ['background-color', 'border-top-left-radius']))}`)
  note(`[${track}] sheetClose: ${JSON.stringify(await probe(d, 'button[class*="sheetClose"]', ['color', 'background-color']))}`)
  note(`[${track}] pickerRow: ${JSON.stringify(await probe(d, 'button[class*="pickerRow"]', ['color', 'background-color']))}`)
  await d.shot(track === 'dark' ? 'r2-15-taskform-dark.png' : 'r2-14-taskform-light.png')

  await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[0]?.click()`)
  await d.waitFor(`document.querySelector('.adm-picker-popup .adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(400)
  note(`[${track}] owner-picker radius: ${JSON.stringify(await probe(d, '.adm-picker-popup .adm-popup-body', ['border-top-left-radius', 'border-top-right-radius', 'background-color']))}`)
  await d.shot(track === 'dark' ? 'r2-11-picker-dark.png' : 'r2-09-picker-light.png')
  await d.evaluate(`[...document.querySelectorAll('.adm-picker-header-button')].pop()?.click()`)
  await sleep(500)

  await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
  await d.waitFor(`document.querySelector('.adm-picker-popup .adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(400)
  note(`[${track}] date-picker radius: ${JSON.stringify(await probe(d, '.adm-picker-popup .adm-popup-body', ['border-top-left-radius', 'border-top-right-radius', 'background-color']))}`)
  await d.shot(track === 'dark' ? 'r2-12-date-picker-dark.png' : 'r2-10-date-picker-light.png')
  await closeTopLayer(d)
  await closeTopLayer(d)

  note(`[${track}] #1677ff leak hits: ${JSON.stringify(await d.evaluate(LEAK_1677))}`)
  note(`[${track}] chat UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
}

const findAskChips = async (d) => {
  // ask_chip sessions are replayed chats; walk the chats list, opening rows
  // until one renders an ask bubble with chip options (settled or live).
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 8000 })
  const count = await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]').length`)
  for (let i = 0; i < Math.min(count, 10); i += 1) {
    await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]')[${String(i)}]?.click()`)
    const found = await d.waitFor(`document.querySelectorAll('button[class*="askChip"]').length > 0`, { timeout: 2500 })
    if (found) {
      const picked = await probe(d, 'button[class*="askChip"][class*="askSelected"]', ['color', 'background-color', 'border-color'])
      const plain = await probe(d, 'button[class*="askChip"]:not([class*="askSelected"])', ['color', 'background-color', 'border-color'])
      return { index: i, picked, plain }
    }
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 5000 })
  }
  return { index: -1, picked: null, plain: null }
}

const d = await boot(9331)
try {
  await demoLogin(d, 'dark')
  note(`dark login ok, html theme: ${await d.evaluate(`document.documentElement.getAttribute('data-theme')`)}`)
  await collectTrack(d, 'dark')

  note(`askChip hunt (dark): ${JSON.stringify(await findAskChips(d))}`)
  await d.shot('r2-08-askchip-two-states.png')

  await demoLogin(d, 'light')
  note(`light login ok, html theme: ${await d.evaluate(`document.documentElement.getAttribute('data-theme')`)}`)
  await collectTrack(d, 'light')

  // login page face (post-logout gate): fresh storage keeps the login layer
  await d.goto(`${BASE}/mobile.html`)
  await d.evaluate('localStorage.clear()')
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 10000 })
  note(`login codeButton: ${JSON.stringify(await probe(d, 'button[class*="codeButton"]', ['color', 'background-color']))}`)
  note(`login UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  await d.shot('r2-07-login-light.png')

  note(`console errors/exceptions: ${String(d.errors().length)}`)
  writeEvidence('.r2-evidence.json', evidence)
} finally {
  d.cleanup()
}
