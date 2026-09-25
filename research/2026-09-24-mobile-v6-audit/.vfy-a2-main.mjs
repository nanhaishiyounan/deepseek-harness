/**
 * A2 independent re-verification — mobile lane (390x844): re-walks the audit
 * reproduction paths for findings 1-15 plus the healthy-surface regression
 * sweep, with console/exception collection throughout. Read-only for the
 * :3080 server. Evidence → vfy-a2-*.png + .vfy-a2-main.json.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-a2-main.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[V] ${line}`) }

/** Scan every element for the antd default blue rgb(22,119,255). */
const scan1677 = (d) => d.evaluate(`(() => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    const rs = getComputedStyle(el)
    for (const p of ['color', 'background-color', 'border-top-color', 'fill']) {
      const v = rs.getPropertyValue(p)
      if (v.includes('22, 119, 255')) { hits.push(\`\${el.tagName.toLowerCase()}.\${String(el.className).slice(0,40)} \${p}=\${v}\`) }
    }
  }
  return hits.slice(0, 8)
})()`)

/** Scan visible buttons for the UA default buttonface (reset-narrowing regression). */
const scanButtonface = (d) => d.evaluate(`(() => {
  const hits = []
  for (const b of document.querySelectorAll('button')) {
    const rs = getComputedStyle(b)
    const bg = rs.getPropertyValue('background-color')
    const r = b.getBoundingClientRect()
    if ((bg === 'rgb(240, 240, 240)' || bg === 'rgb(11, 11, 11)') && r.width > 0) {
      hits.push(\`\${String(b.className).slice(0,50)} text=\${(b.textContent ?? '').trim().slice(0,12)} bg=\${bg}\`)
    }
  }
  return hits.slice(0, 10)
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
      if (has) return await d.evaluate('location.hash')
    }
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(500)
  }
  return null
}

const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

const d = await boot(9366)
try {
  // ===================== LIGHT LANE =====================
  await demoLogin(d, 'light')
  note(`login ok, html theme: ${String(await d.evaluate('document.documentElement.dataset.theme'))}`)

  // ---- #2/#14 home quick actions + search + dots ----
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 10000 })
  await sleep(800)
  await d.shot('vfy-a2-02-home-light.png')
  note(`home quick chips: ${JSON.stringify({
    chip: await probe(d, 'button[class*="quick"]', ['background-color', 'color', 'border-radius']),
    search: await probe(d, '[class*="search"], .adm-search-bar input', ['background-color', 'color']),
  })}`)
  note(`#2 buttonface leak scan (home): ${JSON.stringify(await scanButtonface(d))}`)

  // ---- #8 report card actions primary/secondary ----
  const reportHash = await openReportChat(d)
  note(`report chat hash: ${String(reportHash)}`)
  if (reportHash !== null) {
    await sleep(700)
    await d.shot('vfy-a2-08-report-card-light.png')
    note(`#8 report actions: ${JSON.stringify(await d.evaluate(`(() => {
      const card = document.querySelector('[data-testid="report-card"]')
      const out = []
      for (const b of (card?.querySelectorAll('button') ?? [])) {
        const rs = getComputedStyle(b)
        out.push({ text: (b.textContent ?? '').trim().slice(0, 10), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color') })
      }
      return out
    })()`))}`)

    // ---- #1/#6/#12 TaskFormModal light ----
    await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
    await sleep(800)
    await d.shot('vfy-a2-01-taskform-light.png')
    note(`#1/#6 taskform light: ${JSON.stringify({
      body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius']),
      mask: await probe(d, '.adm-mask', ['background-color']),
      mount: await d.evaluate(`(() => { const el = document.querySelector('.adm-popup'); return { inRoot: el?.closest('.dshm-root') !== null, parent: el?.parentElement?.className.toString().slice(0, 40) ?? '' } })()`),
    })}`)
    note(`#12 mask 0.5: ${JSON.stringify(await probe(d, '.adm-mask', ['background-color']))}`)

    // ---- #3/#10 owner Picker light + dump DOM classes ----
    await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
    await d.waitFor(`document.querySelector('.adm-picker-popup, .adm-picker') !== null`, { timeout: 6000 })
    await sleep(800)
    await d.shot('vfy-a2-03-owner-picker-light.png')
    note(`#3/#10 owner picker light: ${JSON.stringify({
      popupBody: await probe(d, '.adm-picker-popup .adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius']),
      header: await probe(d, '.adm-picker-header', ['background-color', 'border-bottom-color']),
      confirm: await probe(d, '.adm-picker-header-button', ['color']),
      wheelItem: await probe(d, '.adm-picker-view-column-item', ['color']),
      domClasses: await d.evaluate(`[...document.querySelectorAll('.adm-picker-popup, .adm-center-popup, .adm-popup')].map(el => el.className.toString().slice(0, 60))`),
    })}`)
    await closePopup(d)

    // ---- #10 DatePicker light ----
    await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
    await d.waitFor(`document.querySelector('.adm-date-picker, .adm-picker-popup') !== null`, { timeout: 6000 })
    await sleep(800)
    await d.shot('vfy-a2-04-date-picker-light.png')
    note(`#10 date picker light: ${JSON.stringify({
      popupBody: await probe(d, '.adm-popup .adm-popup-body', ['background-color', 'border-top-left-radius', 'border-top-right-radius']),
      confirm: await probe(d, '.adm-picker-header-button', ['color']),
    })}`)
    await closePopup(d)
    await closePopup(d)
  }

  // ---- #11 work first screen: ledger above tool grid ----
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  await sleep(900)
  await d.shot('vfy-a2-05-work-firstscreen-light.png')
  note(`#11 work layout: ${JSON.stringify(await d.evaluate(`(() => {
    const tabs = document.querySelector('[class*="statusTabs"], .adm-capsule-tabs')
    const list = document.querySelector('[aria-label="工作列表"]')
    const grid = document.querySelector('[aria-label="AI 同事工具"]')
    const firstCard = list?.querySelector('article, li, button') ?? list
    return {
      tabsTop: tabs?.getBoundingClientRect().top ?? null,
      listTop: list?.getBoundingClientRect().top ?? null,
      firstCardTop: firstCard?.getBoundingClientRect().top ?? null,
      gridTop: grid?.getBoundingClientRect().top ?? null,
      viewportH: window.innerHeight,
    }
  })()`))}`)
  // regression: CapsuleTabs active + work card action buttons
  note(`regression capsule tabs active: ${JSON.stringify(await probe(d, '.adm-capsule-tabs-header-selected', ['color', 'background-color']))}`)
  note(`#2 work action buttons: ${JSON.stringify(await d.evaluate(`(() => {
    const list = document.querySelector('[aria-label="工作列表"]')
    const b = list?.querySelector('button')
    if (b === undefined || b === null) return null
    const rs = getComputedStyle(b)
    return { text: (b.textContent ?? '').trim().slice(0, 10), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color') }
  })()`))}`)

  // ---- #13 quick panel padding + #9 toast light ----
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(700)
  const chatOpened = await d.evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('去聊聊'))
    if (el === undefined) return false
    el.click(); return true
  })()`)
  note(`agents chat opened: ${String(chatOpened)}`)
  if (chatOpened) {
    await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
    await sleep(900)
    // welcome flow regression
    note(`regression welcome flow: ${JSON.stringify(await d.evaluate(`(() => {
      const root = document.querySelector('.dshm-root')
      const aiBubble = root?.querySelector('[class*="bubble"][class*="ai"], [class*="msgAi"]')
      return { hasWelcome: (document.body.innerText.includes('你好') || document.body.innerText.includes('我是')), bodyLen: document.body.innerText.length }
    })()`))}`)
    // open quick panel
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷'))?.click()
      ?? document.querySelector('button[class*="plus"]')?.click()`)
    await sleep(600)
    note(`#13 quick panel: ${JSON.stringify(await d.evaluate(`(() => {
      const flow = document.querySelector('[class*="flow"]')
      const rs = flow === null ? null : getComputedStyle(flow)
      const panel = [...document.querySelectorAll('.adm-popup-body')].pop()
      const flowRect = flow?.getBoundingClientRect()
      const panelRect = panel?.getBoundingClientRect()
      return {
        flowPaddingBottom: rs?.getPropertyValue('padding-bottom') ?? null,
        panelTop: panelRect?.top ?? null,
        panelBottom: panelRect?.bottom ?? null,
        flowScrollHeight: flow?.scrollHeight ?? null,
        flowClientHeight: flow?.clientHeight ?? null,
      }
    })()`))}`)
    await d.shot('vfy-a2-06-quickpanel-light.png')
    // fire a demo toast
    await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')][0]?.click()
      ?? [...document.querySelectorAll('.adm-popup-body button')][0]?.click()`)
    await sleep(400)
    await d.shot('vfy-a2-07-toast-light.png')
    note(`#9 toast light: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'color', 'bottom', 'font-size']))}`)
    note(`#9 toast rect: ${JSON.stringify(await d.evaluate(`(() => { const el = document.querySelector('.adm-toast-main'); return el === null ? null : el.getBoundingClientRect().toJSON() })()`))}`)
    await sleep(1800)
  }

  // ---- #7 NewChatSheet light ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await sleep(700)
  await d.evaluate(`document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"], [aria-label*="新建"]')?.click()
    ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('新建'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-a2-08-newchat-sheet-light.png')
  note(`#7 newchat light: ${JSON.stringify(await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']))}`)
  await closePopup(d)

  // ---- #4 logout dialog light + 1677 scan ----
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(700)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-a2-09-logout-dialog-light.png')
  note(`#4 logout dialog light: ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color']),
    wrapRadius: await probe(d, '.adm-center-popup-wrap', ['border-radius']),
    confirm: await probe(d, '.adm-dialog-button', ['color']),
    primary1677: await scan1677(d),
  })}`)
  await closePopup(d)

  // ---- timeline regression: work detail doing gradient ----
  await d.goto(`${BASE}/mobile.html#/work`)
  await sleep(800)
  const doingId = await d.evaluate(`(() => {
    const btns = [...document.querySelectorAll('[aria-label="工作列表"] button')]
    return btns.length
  })()`)
  note(`work list button count: ${String(doingId)}`)

  // ---- console stress: rapid open/close, ESC, theme flip with popup open ----
  const stressConsole = await d.evaluate('window.__stress = 0') // noop marker
  if (reportHash !== null) {
    await d.goto(`${BASE}/mobile.html${reportHash}`)
    await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 10000 })
    for (let i = 0; i < 3; i += 1) {
      await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
      await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
      await sleep(250)
      await closePopup(d)
    }
    note('stress: rapid open/close x3 done')
    // theme flip with popup open
    await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
    await sleep(400)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('深色') || (b.getAttribute('aria-label') ?? '').includes('主题'))?.click()
      ?? (() => { const s = document.querySelector('[class*="darkToggle"], [class*="themeToggle"]'); s?.click(); return s !== null })()`)
    await sleep(400)
    note(`theme-flip popup open: ${JSON.stringify({
      htmlTheme: await d.evaluate('document.documentElement.dataset.theme'),
      bodyBg: await probe(d, '.adm-popup-body', ['background-color']),
    })}`)
    // ESC close attempt
    await d.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(500)
    await d.shot('vfy-a2-10-stress-esc.png')
    note(`esc left popup open: ${String(await d.evaluate(`document.querySelector('.adm-popup-body') !== null`))}`)
    await closePopup(d)
  }

  // ---- #2 login CTA solid (fresh gate) ----
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(800)
  await d.shot('vfy-a2-11-login-light.png')
  note(`#2 login CTA: ${JSON.stringify({
    cta: await probe(d, '.dshm-root form button, #mobile-root form button[type="submit"], .dshm-root form button[type="submit"]', ['background-color', 'color', 'border-radius']),
    formButtons: await d.evaluate(`(() => {
      const form = document.querySelector('.dshm-root form')
      if (form === null) return null
      return [...form.querySelectorAll('button')].map(b => {
        const rs = getComputedStyle(b)
        return { text: (b.textContent ?? '').trim().slice(0, 8), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), radius: rs.getPropertyValue('border-radius') }
      })
    })()`),
  })}`)

  // ===================== DARK LANE =====================
  await demoLogin(d, 'dark')
  note(`dark login ok, html theme: ${String(await d.evaluate('document.documentElement.dataset.theme'))}`)
  await d.shot('vfy-a2-12-home-dark.png')
  note(`dark page-level: ${JSON.stringify({
    rootBg: await probe(d, '.dshm-root', ['background-color', 'color']),
    card: await probe(d, 'button[class*="quick"]', ['background-color', 'color']),
  })}`)

  if (reportHash !== null) {
    await d.goto(`${BASE}/mobile.html${reportHash}`)
    await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 12000 })
    await sleep(600)
    await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
    await sleep(800)
    await d.shot('vfy-a2-13-taskform-dark.png')
    note(`#3 taskform dark: ${JSON.stringify({
      body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']),
      title: await probe(d, '.adm-popup-body h2', ['color']),
      input: await probe(d, '#task-title', ['background-color', 'color', 'border-color']),
      primary1677: await scan1677(d),
    })}`)

    // picker dark
    await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
    await d.waitFor(`document.querySelector('.adm-picker-popup, .adm-picker') !== null`, { timeout: 6000 })
    await sleep(800)
    await d.shot('vfy-a2-14-owner-picker-dark.png')
    note(`#3 owner picker dark: ${JSON.stringify({
      popupBody: await probe(d, '.adm-picker-popup .adm-popup-body', ['background-color']),
      wheelItem: await probe(d, '.adm-picker-view-column-item', ['color']),
      confirm: await probe(d, '.adm-picker-header-button', ['color']),
      primary1677: await scan1677(d),
    })}`)
    await closePopup(d)
    await closePopup(d)
  }

  // clear-demo dialog dark
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(700)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('清除演示数据'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-a2-15-clear-dialog-dark.png')
  note(`#3 clear dialog dark: ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color']),
    content: await probe(d, '.adm-dialog-content', ['color']),
    confirm: await probe(d, '.adm-dialog-button', ['color']),
    primary1677: await scan1677(d),
  })}`)
  await closePopup(d)

  // toast dark
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(700)
  const chat2 = await d.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('去聊聊')); if (el === undefined) return false; el.click(); return true })()`)
  if (chat2) {
    await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
    await sleep(900)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷'))?.click()
      ?? document.querySelector('button[class*="plus"]')?.click()`)
    await sleep(500)
    await d.evaluate(`[...document.querySelectorAll('button[class*="qpTool"]')][0]?.click()
      ?? [...document.querySelectorAll('.adm-popup-body button')][0]?.click()`)
    await sleep(400)
    await d.shot('vfy-a2-16-toast-dark.png')
    note(`#9 toast dark: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius']))}`)
    await sleep(1600)
  }

  // dark regression: CapsuleTabs / TabBar / SearchBar / bubbles
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  await sleep(700)
  note(`regression dark capsule tabs: ${JSON.stringify(await probe(d, '.adm-capsule-tabs-header-selected', ['color', 'background-color']))}`)
  await d.goto(`${BASE}/mobile.html#/`)
  await sleep(700)
  note(`regression dark tabbar active: ${JSON.stringify(await probe(d, '.adm-tab-bar-item-active', ['color']))}`)
  if (chat2) {
    const hash2 = await d.evaluate('location.hash')
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(600)
    note(`regression dark searchbar: ${JSON.stringify(await probe(d, '.adm-search-bar input, .adm-search-bar', ['background-color', 'color']))}`)
    // bubbles dual-track: send a message in the agent chat
    await d.evaluate(`document.querySelector('[aria-label="会话列表"] button')?.click()`)
    await d.waitFor(`document.querySelector('textarea') !== null`, { timeout: 8000 })
    await d.TYPE('textarea', '你好')
    await sleep(300)
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('发送'))?.click()
      ?? document.querySelector('button[class*="send"]')?.click()`)
    await sleep(1200)
    await d.shot('vfy-a2-17-bubbles-dark.png')
    note(`regression bubbles: ${JSON.stringify(await d.evaluate(`(() => {
      const bubbles = [...document.querySelectorAll('[class*="bubble"]')].slice(-4)
      return bubbles.map(b => {
        const rs = getComputedStyle(b)
        return { cls: b.className.toString().slice(0, 40), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color') }
      })
    })()`))}`)
  }

  // theme persistence: dark stored, reload keeps html[data-theme=dark]
  await d.evaluate(`location.reload()`)
  await sleep(1500)
  note(`theme persist after reload: ${JSON.stringify({
    html: await d.evaluate('document.documentElement.dataset.theme'),
    stored: await d.evaluate(`localStorage.getItem('dsh-mobile-theme')`),
  })}`)
  note(`#2 buttonface leak scan (dark home): ${JSON.stringify(await scanButtonface(d))}`)

  // ---- final console verdict ----
  const errs = d.errors()
  note(`console errors/exceptions: ${String(errs.length)}`)
  note(`console log sample (first 10): ${JSON.stringify(d.consoleLog.slice(0, 10).map(e => ({ type: e.type, text: e.text.slice(0, 120) })))}`)
} finally {
  writeEvidence('.vfy-a2-main.json', evidence)
  d.cleanup()
  process.exit(0)
}
