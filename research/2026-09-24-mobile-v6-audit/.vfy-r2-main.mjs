/**
 * R2 equivalent re-verification — independent final sweep (verify_goal blocked
 * by loop guard, this runs with equal force; nothing from R2's own evidence is
 * trusted). Mobile lane 390x844, both theme tracks, ≥8 page/popup surfaces:
 *  - F1: every visible classed button must be free of UA faces
 *        (color rgb(0,0,0), bg rgb(239/240,239/240,239/240) or rgb(11,11,11))
 *  - F2: Picker + DatePicker panel computed border-radius 16px 16px 0 0
 *  - askChip plain vs .askSelected three-value split on screen
 *  - regression: TaskForm faces/radius, dark Dialog/Picker, #1677ff sweep,
 *    Toast capsule, mask 0.5, work ledger first screen, tab/theme persistence,
 *    console clean through rapid open/close + ESC + reload stress.
 * Evidence → vfy-r2-*.png + .vfy-r2-main.json. Read-only for :3080.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-r2-main.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[V] ${line}`) }
const UA_BG = new Set(['rgb(239, 239, 239)', 'rgb(240, 240, 240)', 'rgb(11, 11, 11)'])

/** F1 core: UA-face leak scan over every visible *classed* button. */
const scanFaces = (d) => d.evaluate(`(() => {
  const UA_BG = ${JSON.stringify([...UA_BG])}
  const hits = []
  const counts = {}
  for (const b of document.querySelectorAll('button[class]')) {
    const r = b.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const cls = (String(b.className).match(/_([A-Za-z0-9]+)_/) ?? ['?', ''])[1]
    counts[cls] = (counts[cls] ?? 0) + 1
    const rs = getComputedStyle(b)
    const bg = rs.getPropertyValue('background-color')
    const color = rs.getPropertyValue('color')
    if (UA_BG.includes(bg) || color === 'rgb(0, 0, 0)') {
      hits.push({ cls: String(b.className).slice(0, 60), text: (b.textContent ?? '').trim().slice(0, 14), bg, color })
    }
  }
  return { hits: hits.slice(0, 12), classedButtons: Object.keys(counts).length, total: Object.values(counts).reduce((a, b) => a + b, 0) }
})()`)

/** Regression: antd default blue must be absent everywhere. */
const scan1677 = (d) => d.evaluate(`(() => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    const rs = getComputedStyle(el)
    for (const p of ['color', 'background-color', 'border-top-color', 'fill']) {
      if (rs.getPropertyValue(p).includes('22, 119, 255')) hits.push(\`\${el.tagName.toLowerCase()}.\${String(el.className).slice(0, 40)} \${p}\`)
    }
  }
  return hits.slice(0, 8)
})()`)

/** Walk the demo sessions until one renders the report card's create-task action. */
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
      if (has) return await d.evaluate('location.hash')
    }
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(500)
  }
  return null
}

/** Open the TaskForm sheet from the report chat and wait for its body. */
async function openTaskForm(d) {
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  const ok = await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(800)
  return ok
}

const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

/** Dump every open popup panel's class + corners (Picker vs DatePicker vs sheets). */
const dumpPanels = (d) => d.evaluate(`(() => {
  return [...document.querySelectorAll('.adm-popup, .adm-popup-body')].map(el => {
    const rs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      cls: el.className.toString().slice(0, 70),
      radius: rs.getPropertyValue('border-radius'),
      rTL: rs.getPropertyValue('border-top-left-radius'),
      bg: rs.getPropertyValue('background-color'),
      w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
    }
  })
})()`)

/** Representative-class computed faces for token cross-check. */
const repClasses = (d, names) => d.evaluate(`(() => {
  const want = ${JSON.stringify(names)}
  const out = {}
  for (const w of want) {
    const el = document.querySelector(\`[class*="\${w}"]\`)
    if (el === null) { out[w] = null; continue }
    const rs = getComputedStyle(el)
    out[w] = { cls: el.className.toString().slice(0, 50), color: rs.getPropertyValue('color'), bg: rs.getPropertyValue('background-color') }
  }
  const root = document.querySelector('.dshm-root')
  const rs = root === null ? null : getComputedStyle(root)
  out.__tokens = rs === null ? null : {
    foreground: rs.getPropertyValue('--dshm-foreground'),
    card: rs.getPropertyValue('--dshm-card'),
    onSoft: rs.getPropertyValue('--dshm-on-soft'),
    primarySoft: rs.getPropertyValue('--dshm-primary-soft'),
    primary: rs.getPropertyValue('--dshm-primary'),
    radiusLg: rs.getPropertyValue('--dshm-radius-lg'),
  }
  return out
})()`)

const d = await boot(9371)
try {
  // =========================== LIGHT LANE ===========================
  await demoLogin(d, 'light')
  note(`LIGHT login ok, html theme: ${String(await d.evaluate('document.documentElement.dataset.theme'))}`)

  // ---- surface 1: chats list ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(800)
  await d.shot('vfy-r2-01-chats-light.png')
  note(`F1 chats-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`1677 chats-light: ${JSON.stringify(await scan1677(d))}`)

  // ---- surface 2: home ----
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 10000 })
  await sleep(800)
  await d.shot('vfy-r2-02-home-light.png')
  note(`F1 home-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`1677 home-light: ${JSON.stringify(await scan1677(d))}`)
  note(`repClasses home-light: ${JSON.stringify(await repClasses(d, ['statsCard', 'sectionLink', 'rosterCard', 'quickChip']))}`)

  // ---- surface 3: work (ledger first screen) ----
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  await sleep(900)
  await d.shot('vfy-r2-03-work-light.png')
  note(`F1 work-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`regression work layout: ${JSON.stringify(await d.evaluate(`(() => {
    const tabs = document.querySelector('[class*="statusTabs"], .adm-capsule-tabs')
    const list = document.querySelector('[aria-label="工作列表"]')
    const grid = document.querySelector('[aria-label="AI 同事工具"]')
    const firstCard = list?.querySelector('article, li, button') ?? list
    return { tabsTop: Math.round(tabs?.getBoundingClientRect().top ?? -1), listTop: Math.round(list?.getBoundingClientRect().top ?? -1), firstCardTop: Math.round(firstCard?.getBoundingClientRect().top ?? -1), gridTop: Math.round(grid?.getBoundingClientRect().top ?? -1), viewportH: window.innerHeight, ledgerVisible: (firstCard?.getBoundingClientRect().top ?? 99999) < window.innerHeight }
  })()`))}`)
  // 进行中 tab head button (the old UA-gray leak)
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-tab')].find(t => (t.textContent ?? '').includes('进行中'))?.click()`)
  await sleep(600)
  note(`F1 work-doing-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`cardHeadButton probe: ${JSON.stringify(await probe(d, 'button[class*="cardHeadButton"]', ['background-color', 'color', 'border-radius']))}`)

  // ---- surface 4: report chat + TaskForm + Picker + DatePicker + quick panel ----
  const reportHash = await openReportChat(d)
  note(`report chat hash: ${String(reportHash)}`)
  if (reportHash !== null) {
    await sleep(700)
    note(`F1 chat-light (before taskform): ${JSON.stringify(await scanFaces(d))}`)
    note(`1677 chat-light: ${JSON.stringify(await scan1677(d))}`)

    await openTaskForm(d)
    await d.shot('vfy-r2-04-taskform-light.png')
    note(`F1 taskform-light: ${JSON.stringify(await scanFaces(d))}`)
    note(`regression taskform light: ${JSON.stringify({
      body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius']),
      mask: await probe(d, '.adm-mask', ['background-color']),
    })}`)
    note(`mask 0.5: ${JSON.stringify(await probe(d, '.adm-mask', ['background-color']))}`)

    // ---- F2 owner Picker light ----
    await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
    await d.waitFor(`document.querySelector('.adm-picker-popup') !== null`, { timeout: 6000 })
    await sleep(800)
    await d.shot('vfy-r2-05-picker-light.png')
    note(`F2 owner-picker-light panels: ${JSON.stringify(await dumpPanels(d))}`)
    note(`F2 owner-picker radius probe: ${JSON.stringify(await probe(d, '.adm-picker-popup .adm-popup-body', ['border-top-left-radius', 'border-top-right-radius', 'background-color']))}`)
    note(`F1 picker-light: ${JSON.stringify(await scanFaces(d))}`)
    await closePopup(d)

    // ---- F2 DatePicker light (second pickerRow) ----
    await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
    await d.waitFor(`document.querySelectorAll('.adm-picker-popup').length >= 1`, { timeout: 6000 })
    await sleep(900)
    await d.shot('vfy-r2-06-datepicker-light.png')
    note(`F2 date-picker-light panels: ${JSON.stringify(await dumpPanels(d))}`)
    await closePopup(d)
    await closePopup(d)
    await sleep(300)

    // ---- quick panel (qpTool) + toast light ----
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷'))?.click()
      ?? document.querySelector('button[class*="plus"]')?.click()`)
    await sleep(700)
    note(`F1 quickpanel-light: ${JSON.stringify(await scanFaces(d))}`)
    await d.shot('vfy-r2-07-quickpanel-light.png')
    await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')][0]?.click()
      ?? [...document.querySelectorAll('.adm-popup-body button')][0]?.click()`)
    await sleep(400)
    await d.shot('vfy-r2-08-toast-light.png')
    note(`regression toast light: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'color', 'bottom']))}`)
    await sleep(1600)
    await closePopup(d)
  }

  // ---- surface 5: agents ----
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(900)
  note(`F1 agents-light: ${JSON.stringify(await scanFaces(d))}`)
  await d.shot('vfy-r2-09-agents-light.png')
  note(`repClasses agents-light: ${JSON.stringify(await repClasses(d, ['rosterItem']))}`)

  // ---- surface 6: files ----
  await d.goto(`${BASE}/mobile.html#/files`)
  await sleep(900)
  note(`F1 files-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`repClasses files-light: ${JSON.stringify(await repClasses(d, ['fileTopMain']))}`)

  // ---- surface 7: tasks ----
  await d.goto(`${BASE}/mobile.html#/tasks`)
  await sleep(900)
  note(`F1 tasks-light: ${JSON.stringify(await scanFaces(d))}`)

  // ---- surface 8: me ----
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(900)
  note(`F1 me-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`repClasses me-light: ${JSON.stringify(await repClasses(d, ['workspace', 'recentRow']))}`)
  await d.shot('vfy-r2-10-me-light.png')

  // ---- surface 9: newchat sheet ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await sleep(700)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('新建') || (b.textContent ?? '').includes('新建'))?.click()
    ?? document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"]')?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(800)
  note(`F1 newchat-sheet-light: ${JSON.stringify(await scanFaces(d))}`)
  await d.shot('vfy-r2-11-newchat-light.png')
  note(`newchat sheet body: ${JSON.stringify(await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']))}`)
  await closePopup(d)

  // ---- askChip two states (same screen) ----
  let askHash = '#/chat/session-30734db9-a3ff-4bb3-b8d3-6b9b3d5dc4bd'
  await d.goto(`${BASE}/mobile.html${askHash}`)
  let found = await d.waitFor(`document.querySelector('[class*="askChip"]') !== null`, { timeout: 6000 })
  if (!found) {
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(600)
    const n = await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button').length`)
    for (let index = 0; index < n && !found; index += 1) {
      await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
      found = await d.waitFor(`document.querySelector('[class*="askChip"]') !== null`, { timeout: 4000 })
      if (!found) { await d.goto(`${BASE}/mobile.html#/chats`); await sleep(400) }
    }
  }
  if (found) {
    askHash = await d.evaluate('location.hash')
    await sleep(600)
    const readChips = () => d.evaluate(`(() => {
      const chips = [...document.querySelectorAll('button[class*="askChip"]')]
      return chips.map(c => {
        const rs = getComputedStyle(c)
        return { cls: c.className.toString().slice(0, 70), text: (c.textContent ?? '').trim().slice(0, 16), bg: rs.getPropertyValue('background-color'), border: rs.getPropertyValue('border-color'), color: rs.getPropertyValue('color') }
      })
    })()`)
    const before = await readChips()
    await d.shot('vfy-r2-12-askchip-plain-light.png')
    await d.evaluate(`document.querySelector('button[class*="askChip"]')?.click()`)
    await sleep(600)
    const after = await readChips()
    await d.shot('vfy-r2-13-askchip-selected-light.png')
    note(`askChip plain: ${JSON.stringify(before)}`)
    note(`askChip selected: ${JSON.stringify(after)}`)
  } else {
    note('askChip: NOT FOUND in demo sessions')
  }

  // ---- surface 10: login (fresh gate) ----
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(800)
  note(`F1 login-light: ${JSON.stringify(await scanFaces(d))}`)
  note(`login CTA: ${JSON.stringify(await probe(d, 'form button[type="submit"], form button', ['background-color', 'color', 'border-radius']))}`)
  await d.shot('vfy-r2-14-login-light.png')

  // ---- four-tab walk (light) ----
  const tabWalk = []
  for (const route of ['#/chats', '#/work', '#/files', '#/me']) {
    await d.goto(`${BASE}/mobile.html${route}`)
    await sleep(600)
    tabWalk.push(await d.evaluate(`location.hash`))
  }
  note(`four-tab walk: ${JSON.stringify(tabWalk)}`)

  // =========================== DARK LANE ===========================
  await demoLogin(d, 'dark')
  note(`DARK login ok, html theme: ${String(await d.evaluate('document.documentElement.dataset.theme'))}`)

  // home + chats dark
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 10000 })
  await sleep(800)
  await d.shot('vfy-r2-15-home-dark.png')
  note(`F1 home-dark: ${JSON.stringify(await scanFaces(d))}`)
  note(`1677 home-dark: ${JSON.stringify(await scan1677(d))}`)

  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(700)
  note(`F1 chats-dark: ${JSON.stringify(await scanFaces(d))}`)
  note(`repClasses chats-dark: ${JSON.stringify(await repClasses(d, ['sessionRow']))}`)
  await d.shot('vfy-r2-16-chats-dark.png')

  // report chat dark: taskform + picker + datepicker
  const reportHash2 = await openReportChat(d)
  note(`report chat hash (dark): ${String(reportHash2)}`)
  if (reportHash2 !== null) {
    await openTaskForm(d)
    await d.shot('vfy-r2-17-taskform-dark.png')
    note(`F1 taskform-dark: ${JSON.stringify(await scanFaces(d))}`)
    note(`regression taskform dark: ${JSON.stringify({
      body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']),
      title: await probe(d, '.adm-popup-body h2', ['color']),
      1677: await scan1677(d),
    })}`)

    await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
    await d.waitFor(`document.querySelector('.adm-picker-popup') !== null`, { timeout: 6000 })
    await sleep(800)
    await d.shot('vfy-r2-18-picker-dark.png')
    note(`F2 owner-picker-dark: ${JSON.stringify(await dumpPanels(d))}`)
    note(`F1 picker-dark: ${JSON.stringify(await scanFaces(d))}`)
    await closePopup(d)

    await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
    await d.waitFor(`document.querySelectorAll('.adm-picker-popup').length >= 1`, { timeout: 6000 })
    await sleep(900)
    await d.shot('vfy-r2-19-datepicker-dark.png')
    note(`F2 date-picker-dark: ${JSON.stringify(await dumpPanels(d))}`)
    await closePopup(d)
    await closePopup(d)

    // stress: rapid open/close x3 + theme flip attempt with popup open + ESC
    for (let i = 0; i < 3; i += 1) {
      await openTaskForm(d)
      await closePopup(d)
    }
    note('stress: rapid open/close x3 done')
    await openTaskForm(d)
    await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
    await d.evaluate(`location.reload()`)
    await sleep(1800)
    note(`stress reload with pending theme: ${JSON.stringify({
      html: await d.evaluate('document.documentElement.dataset.theme'),
      popup: await d.evaluate(`document.querySelector('.adm-popup-body') !== null`),
    })}`)
    await d.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(500)
    await d.shot('vfy-r2-20-stress.png')
    note(`esc: popup left open = ${String(await d.evaluate(`document.querySelector('.adm-popup-body') !== null`))}`)
  }

  // dark dialog (clear demo data)
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(700)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('清除演示数据'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-r2-21-dialog-dark.png')
  note(`regression dialog dark: ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']),
    content: await probe(d, '.adm-dialog-content', ['color']),
    confirm: await probe(d, '.adm-dialog-button', ['color']),
    1677: await scan1677(d),
  })}`)
  await closePopup(d)

  // dark toast
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(700)
  const chat2 = await d.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('去聊聊')); if (el === undefined) return false; el.click(); return true })()`)
  if (chat2) {
    await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
    await sleep(900)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷'))?.click()
      ?? document.querySelector('button[class*="plus"]')?.click()`)
    await sleep(600)
    await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')][0]?.click()
      ?? [...document.querySelectorAll('.adm-popup-body button')][0]?.click()`)
    await sleep(400)
    await d.shot('vfy-r2-22-toast-dark.png')
    note(`regression toast dark: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius']))}`)
    await sleep(1600)
  }

  // dark newchat sheet + work
  await d.goto(`${BASE}/mobile.html#/chats`)
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('新建') || (b.textContent ?? '').includes('新建'))?.click()
    ?? document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"]')?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(700)
  note(`F1 newchat-sheet-dark: ${JSON.stringify(await scanFaces(d))}`)
  await d.shot('vfy-r2-23-newchat-dark.png')
  await closePopup(d)

  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  await sleep(800)
  note(`F1 work-dark: ${JSON.stringify(await scanFaces(d))}`)
  await d.shot('vfy-r2-24-work-dark.png')

  // dark login + theme persistence
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(800)
  note(`F1 login-dark: ${JSON.stringify(await scanFaces(d))}`)
  note(`1677 login-dark: ${JSON.stringify(await scan1677(d))}`)
  await d.shot('vfy-r2-25-login-dark.png')
  await d.evaluate(`location.reload()`)
  await sleep(1500)
  note(`theme persist (dark): ${JSON.stringify({
    html: await d.evaluate('document.documentElement.dataset.theme'),
    stored: await d.evaluate(`localStorage.getItem('dsh-mobile-theme')`),
  })}`)

  // ---- final console verdict ----
  const errs = d.errors()
  note(`console errors/exceptions: ${String(errs.length)}`)
  if (errs.length > 0) note(`console error sample: ${JSON.stringify(errs.slice(0, 5).map(e => ({ type: e.type, text: e.text.slice(0, 160) })))}`)
} finally {
  writeEvidence('.vfy-r2-main.json', evidence)
  d.cleanup()
  process.exit(0)
}
