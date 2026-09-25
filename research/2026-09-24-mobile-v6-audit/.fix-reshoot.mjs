/**
 * A2 fix re-shoot — replays the audit-01/02/06/07/08/09/11/14/17/30/31/32/34/
 * 37/38/41/44 reproduction paths against the rebuilt live server (:3080,
 * PID untouched), saving fix-*.png plus computed-style probes into
 * .fix-evidence.json. Read-only for the server process.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.fix-reshoot.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A2] ${line}`) }
const PROBE_PROPS = ['background-color', 'border-radius', 'border-top-left-radius', 'color']

/** Scan every element in the given root for the antd default blue #1677ff. */
const scan1677 = (d, scope = 'document') => d.evaluate(`(() => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    const rs = getComputedStyle(el)
    for (const p of ['color', 'background-color', 'border-top-color', 'fill']) {
      const v = rs.getPropertyValue(p)
      if (v.includes('22, 119, 255')) { hits.push(\`\${el.tagName.toLowerCase()}.\${el.className} \${p}=\${v}\`) }
    }
  }
  return hits.slice(0, 8)
})()`)

/** Open a chat that carries the demo report card's create-task action. */
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

const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

/** The mobile lane: every portal surface in both tracks. */
async function mobileLane() {
  const d = await boot(9363)
  try {
    await demoLogin(d, 'light')
    // 44: home quick actions (root-cause B face)
    await d.goto(`${BASE}/mobile.html#/`)
    await sleep(800)
    await d.shot('fix-44-home-light.png')
    note(`44 home quick buttons: ${JSON.stringify({
      chip: await probe(d, 'button[class*="quick"], button[class*="chip"]', PROBE_PROPS),
    })}`)

    // 41: report card actions (B face)
    if (await openReportChat(d)) {
      await sleep(700)
      await d.shot('fix-41-report-card-light.png')
      const actions = await d.evaluate(`(() => {
        const card = document.querySelector('[data-testid="report-card"]')
        const out = []
        for (const b of (card?.querySelectorAll('button') ?? [])) {
          const rs = getComputedStyle(b)
          out.push({ text: b.textContent, bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), radius: rs.getPropertyValue('border-radius') })
        }
        return out
      })()`)
      note(`41 report actions: ${JSON.stringify(actions)}`)

      // 01: TaskFormModal light + 02 owner Picker + 17 DatePicker
      await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
      await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
      await sleep(700)
      await d.shot('fix-01-taskform-light.png')
      note(`01 taskform light: ${JSON.stringify({
        body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius']),
        mask: await probe(d, '.adm-mask', ['background-color']),
        hostParent: await d.evaluate(`!!document.querySelector('.dshm-root .adm-popup')`),
      })}`)
      await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
      await d.waitFor(`document.querySelector('.adm-picker') !== null`, { timeout: 6000 })
      await sleep(700)
      await d.shot('fix-02-owner-picker-light.png')
      note(`02 owner picker light: ${JSON.stringify({
        panel: await probe(d, '.adm-center-popup-body', ['background-color', 'border-radius']),
        confirm: await probe(d, '.adm-picker-header-button', ['color']),
        primary1677: await scan1677(d),
      })}`)
      await closePopup(d)
      await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
      await d.waitFor(`document.querySelector('.adm-date-picker') !== null || document.querySelector('.adm-picker') !== null`, { timeout: 6000 })
      await sleep(700)
      await d.shot('fix-17-date-picker-light.png')
      note(`17 date picker light: ${JSON.stringify({ panel: await probe(d, '.adm-center-popup-body', ['background-color', 'border-radius']) })}`)
      await closePopup(d)
      await closePopup(d)
    }

    // 11: toast capsule (quick panel demo tool)
    await d.goto(`${BASE}/mobile.html#/`)
    await sleep(500)
    await d.goto(`${BASE}/mobile.html#/agents`)
    await sleep(600)
    const chatOpened = await d.evaluate(`(() => {
      const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('去聊聊'))
      if (el === undefined) return false
      el.click(); return true
    })()`)
    if (chatOpened) {
      await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
      await sleep(800)
      await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷'))?.click()
        ?? document.querySelector('button[class*="plus"]')?.click()`)
      await sleep(500)
      await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')][0]?.click()
        ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('语音'))?.click()`)
      await sleep(300)
      await d.shot('fix-11-toast-light.png')
      note(`11 toast light: ${JSON.stringify({ toast: await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'bottom', 'color']) })}`)
      await sleep(1600)
    }

    // 08: NewChatSheet light
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(700)
    await d.evaluate(`document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"], [aria-label*="新建"]')?.click()
      ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('新建'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
    await sleep(600)
    await d.shot('fix-08-newchat-sheet-light.png')
    note(`08 newchat light: ${JSON.stringify({ body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']) })}`)
    await closePopup(d)

    // 31: logout dialog light
    await d.goto(`${BASE}/mobile.html#/me`)
    await sleep(700)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
    await sleep(600)
    await d.shot('fix-31-logout-dialog-light.png')
    note(`31 logout dialog light: ${JSON.stringify({
      body: await probe(d, '.adm-dialog-body', ['background-color']),
      wrap: await probe(d, '.adm-center-popup-wrap', ['border-radius']),
      confirm: await probe(d, '.adm-dialog-button', ['color']),
      primary1677: await scan1677(d),
    })}`)
    await closePopup(d)
    await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)

    // 32: login CTA solid (B face)
    await d.goto(`${BASE}/mobile.html#/login`)
    await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
    await sleep(600)
    await d.shot('fix-32-login-light.png')
    note(`32 login CTA: ${JSON.stringify({ cta: await probe(d, 'button[class*="adm-button"]', PROBE_PROPS) })}`)

    // dark track: 06/07/09/14/08-dark
    await demoLogin(d, 'dark')
    if (await openReportChat(d)) {
      await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
      await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
      await sleep(700)
      await d.shot('fix-06-taskform-dark.png')
      note(`06 taskform dark: ${JSON.stringify({
        body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']),
        title: await probe(d, '.adm-popup-body h2', ['color']),
        primary1677: await scan1677(d),
      })}`)
      await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
      await d.waitFor(`document.querySelector('.adm-picker') !== null`, { timeout: 6000 })
      await sleep(700)
      await d.shot('fix-07-owner-picker-dark.png')
      note(`07 owner picker dark: ${JSON.stringify({
        panel: await probe(d, '.adm-center-popup-body', ['background-color', 'color']),
        confirm: await probe(d, '.adm-picker-header-button', ['color']),
      })}`)
      await closePopup(d)
      await closePopup(d)
    }

    // 14: toast dark inversion — flip a visible switch action
    await d.goto(`${BASE}/mobile.html#/me`)
    await sleep(700)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('清除演示数据'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
    await sleep(600)
    await d.shot('fix-09-clear-dialog-dark.png')
    note(`09 clear dialog dark: ${JSON.stringify({
      body: await probe(d, '.adm-dialog-body', ['background-color']),
      content: await probe(d, '.adm-dialog-content', ['color']),
      primary1677: await scan1677(d),
    })}`)
    await closePopup(d)

    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(700)
    await d.evaluate(`document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"], [aria-label*="新建"]')?.click()
      ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('新建'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
    await sleep(600)
    await d.shot('fix-08-newchat-sheet-dark.png')
    note(`08 newchat dark: ${JSON.stringify({ body: await probe(d, '.adm-popup-body', ['background-color']) })}`)
    await closePopup(d)

    // 34: work first screen — ledger above the tool grid
    await d.goto(`${BASE}/mobile.html#/work`)
    await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
    await sleep(800)
    await d.shot('fix-34-work-firstscreen-light.png')
    note(`34 work first screen: ${JSON.stringify({
      tabsRect: await probe(d, '[class*="statusTabs"], .adm-capsule-tabs', ['__rect']),
      listFirstCardTop: await d.evaluate(`(() => {
        const page = document.querySelector('[class*="workPage"]')
        const rect = page?.firstElementChild?.getBoundingClientRect()
        const list = document.querySelector('[aria-label="工作列表"]')
        const grid = document.querySelector('[aria-label="AI 同事工具"]')
        return { listTop: list?.getBoundingClientRect().top, gridTop: grid?.getBoundingClientRect().top }
      })()`),
    })}`)
  } finally {
    d.cleanup()
  }
}

/** The desktop lane: portal containment inside the 430px shell. */
async function desktopLane() {
  const d = await boot(9364, { width: 1280, height: 800 })
  try {
    await demoLogin(d, 'light')
    // 30: desktop dialog contained
    await d.goto(`${BASE}/mobile.html#/me`)
    await sleep(800)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
    await sleep(600)
    await d.shot('fix-30-desktop-dialog.png')
    note(`30 desktop dialog: ${JSON.stringify({
      wrap: await probe(d, '.adm-center-popup-wrap', ['__rect']),
      mask: await probe(d, '.adm-mask', ['__rect']),
      rootRect: await probe(d, '.dshm-root', ['__rect']),
    })}`)
    await closePopup(d)

    // 37: desktop TaskForm contained
    if (await openReportChat(d)) {
      await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
      await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
      await sleep(700)
      await d.shot('fix-37-desktop-taskform.png')
      note(`37 desktop taskform: ${JSON.stringify({
        body: await probe(d, '.adm-popup-body', ['__rect', 'background-color']),
        rootRect: await probe(d, '.dshm-root', ['__rect']),
      })}`)
      await closePopup(d)
    }

    // 38: desktop NewChat contained
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(700)
    await d.evaluate(`document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"], [aria-label*="新建"]')?.click()
      ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('新建'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
    await sleep(600)
    await d.shot('fix-38-desktop-newchat.png')
    note(`38 desktop newchat: ${JSON.stringify({ body: await probe(d, '.adm-popup-body', ['__rect']) })}`)
  } finally {
    d.cleanup()
  }
}

await mobileLane()
await desktopLane()
writeEvidence('.fix-evidence.json', evidence)
console.log('A2 re-shoot complete')
