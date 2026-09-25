/**
 * A2 independent re-verification — supplementary probes for the paths the
 * first pass missed (DatePicker DOM, dialog body radius, login CTA, toast
 * light+dark, quick-panel padding, CapsuleTabs active, work action buttons,
 * AskChoice selected state, welcome/bubbles, work-detail timeline).
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-a2-extra.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[X] ${line}`) }
const REPORT_HASH = '#/chat/session-v6-b3-rich'

const scan1677 = (d) => d.evaluate(`(() => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    const rs = getComputedStyle(el)
    for (const p of ['color', 'background-color', 'border-top-color', 'fill']) {
      if (rs.getPropertyValue(p).includes('22, 119, 255')) hits.push(\`\${el.tagName.toLowerCase()}.\${String(el.className).slice(0,40)} \${p}\`)
    }
  }
  return hits.slice(0, 8)
})()`)

const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

const d = await boot(9368)
try {
  await demoLogin(d, 'light')

  // ---- DatePicker: reopen taskform, second picker row ----
  await d.goto(`${BASE}/mobile.html${REPORT_HASH}`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 12000 })
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(700)
  const rows = await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button[class*="pickerRow"]')].map(b => (b.textContent ?? '').trim().slice(0, 12))`)
  note(`picker rows: ${JSON.stringify(rows)}`)
  await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
  await d.waitFor(`document.querySelectorAll('.adm-popup-body').length >= 2 || document.querySelector('.adm-date-picker') !== null`, { timeout: 6000 })
  await sleep(800)
  await d.shot('vfy-a2-18-date-picker-light.png')
  note(`date picker: ${JSON.stringify({
    bodies: await d.evaluate(`[...document.querySelectorAll('.adm-popup-body')].map(el => {
      const rs = getComputedStyle(el)
      return { cls: el.className.toString().slice(0, 60), bg: rs.getPropertyValue('background-color'), rTL: rs.getPropertyValue('border-top-left-radius'), rTR: rs.getPropertyValue('border-top-right-radius') }
    })`),
    confirm: await probe(d, '.adm-picker-header-button', ['color']),
    vars: await d.evaluate(`(() => { const rs = getComputedStyle(document.querySelector('.adm-picker-popup .adm-popup-body') ?? document.body); return { centerRadius: rs.getPropertyValue('--adm-center-popup-border-radius'), radiusL: rs.getPropertyValue('--adm-radius-l'), radiusM: rs.getPropertyValue('--adm-radius-m') } })()`),
  })}`)
  await closePopup(d)
  await closePopup(d)

  // ---- Dialog body radius (the wrap has none by antd design) ----
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(700)
  const meButtons = await d.evaluate(`[...document.querySelectorAll('button')].map(b => (b.textContent ?? '').trim().slice(0, 10)).filter(Boolean)`)
  note(`me page buttons: ${JSON.stringify(meButtons)}`)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(600)
  note(`dialog body radius: ${JSON.stringify(await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']))}`)
  await closePopup(d)

  // ---- toast light via the known chat's quick panel ----
  await d.goto(`${BASE}/mobile.html${REPORT_HASH}`)
  await d.waitFor(`document.querySelector('textarea') !== null || document.querySelector('[contenteditable]') !== null || document.body.innerText.length > 500`, { timeout: 10000 })
  await sleep(800)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷面板'))?.click()`)
  await sleep(600)
  const qp = await d.evaluate(`(() => {
    const panel = document.querySelector('[aria-label="快捷指令"]')
    const flow = document.querySelector('[class*="flow"]')
    const rs = flow === null ? null : getComputedStyle(flow)
    const lastRow = flow?.lastElementChild?.getBoundingClientRect()
    return {
      panelFound: panel !== null,
      panelRect: panel?.getBoundingClientRect().toJSON() ?? null,
      flowPaddingBottom: rs?.getPropertyValue('padding-bottom') ?? null,
      lastRowBottom: lastRow?.bottom ?? null,
      toolCount: document.querySelectorAll('button[class*="qpTool"]').length,
    }
  })()`)
  note(`#13 quick panel: ${JSON.stringify(qp)}`)
  await d.shot('vfy-a2-19-quickpanel-open-light.png')
  await d.evaluate(`document.querySelector('button[class*="qpTool"]')?.click()`)
  await sleep(400)
  await d.shot('vfy-a2-20-toast-light.png')
  note(`#9 toast light: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'color', 'bottom', 'max-width', 'font-size']))}`)
  note(`#9 toast rect: ${JSON.stringify(await d.evaluate(`document.querySelector('.adm-toast-main')?.getBoundingClientRect().toJSON() ?? null`))}`)
  await sleep(1600)

  // ---- CapsuleTabs active class dump + work action buttons ----
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  await sleep(800)
  const capsuleDump = await d.evaluate(`[...document.querySelectorAll('[class*="capsule"], [class*="statusTabs"]')].slice(0, 8).map(el => ({ cls: el.className.toString().slice(0, 70), color: getComputedStyle(el).getPropertyValue('color'), bg: getComputedStyle(el).getPropertyValue('background-color') }))`)
  note(`work capsule classes: ${JSON.stringify(capsuleDump)}`)
  const tabs = await d.evaluate(`(() => {
    const root = document.querySelector('[class*="statusTabs"]') ?? document.querySelector('.adm-capsule-tabs')
    if (root === null) return []
    return [...root.querySelectorAll('*')].filter(el => el.children.length === 0 && (el.textContent ?? '').trim().length > 0 && (el.textContent ?? '').trim().length < 8).slice(0, 8).map(el => {
      const rs = getComputedStyle(el)
      return { text: (el.textContent ?? '').trim(), cls: el.className.toString().slice(0, 50), color: rs.getPropertyValue('color'), bg: rs.getPropertyValue('background-color') }
    })
  })()`)
  note(`work tab items: ${JSON.stringify(tabs)}`)
  // switch to a non-empty tab and probe card buttons
  const switched = await d.evaluate(`(() => {
    const items = [...document.querySelectorAll('[class*="statusTabs"] *')]
    const doing = items.find(el => (el.textContent ?? '').includes('进行中'))
    if (doing === undefined) return 'not-found'
    doing.click(); return 'clicked'
  })()`)
  note(`work tab switch: ${String(switched)}`)
  await sleep(700)
  const cardButtons = await d.evaluate(`(() => {
    const list = document.querySelector('[aria-label="工作列表"]')
    if (list === null) return null
    const cards = list.querySelectorAll('article, [class*="card"]')
    return {
      cardCount: cards.length,
      buttons: [...list.querySelectorAll('button')].slice(0, 6).map(b => {
        const rs = getComputedStyle(b)
        return { text: (b.textContent ?? '').trim().slice(0, 10), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), radius: rs.getPropertyValue('border-radius') }
      }),
    }
  })()`)
  note(`#2 work card buttons (doing tab): ${JSON.stringify(cardButtons)}`)
  await d.shot('vfy-a2-21-work-doing-light.png')

  // ---- work detail timeline (doing card) ----
  const detailOpened = await d.evaluate(`(() => {
    const list = document.querySelector('[aria-label="工作列表"]')
    const card = list?.querySelector('article, [class*="card"]')
    if (card === null || card === undefined) return false
    card.click(); return true
  })()`)
  note(`work detail opened: ${String(detailOpened)} / hash: ${String(await d.evaluate('location.hash'))}`)
  if (String(await d.evaluate('location.hash')).includes('/work/')) {
    await sleep(900)
    await d.shot('vfy-a2-22-workdetail-light.png')
    note(`timeline: ${JSON.stringify(await d.evaluate(`(() => {
      const grads = []
      for (const el of document.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage
        if (bg.includes('gradient')) grads.push({ cls: String(el.className).slice(0, 50), bg: bg.slice(0, 90) })
      }
      return grads.slice(0, 5)
    })()`))}`)
  }

  // ---- agents page dump (for the roster chat entry) ----
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(900)
  const agentsDump = await d.evaluate(`[...document.querySelectorAll('button')].map(b => ({ label: (b.getAttribute('aria-label') ?? '').slice(0, 20), text: (b.textContent ?? '').trim().slice(0, 12) })).slice(0, 12)`)
  note(`agents buttons: ${JSON.stringify(agentsDump)}`)

  // ---- #15 AskChoice selected state: find the form-flow session ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 10000 })
  await sleep(800)
  const sessionTitles = await d.evaluate(`[...document.querySelectorAll('[aria-label="会话列表"] button')].map(b => (b.textContent ?? '').trim().slice(0, 18))`)
  note(`sessions: ${JSON.stringify(sessionTitles)}`)
  let askHash = null
  const count = sessionTitles.length
  for (let index = 0; index < count; index += 1) {
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    await sleep(900)
    const has = await d.evaluate(`document.body.innerText.includes('采购单') || document.body.innerText.includes('入库单')`)
    if (has) { askHash = await d.evaluate('location.hash'); break }
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(500)
  }
  note(`ask-choice hash: ${String(askHash)}`)
  if (askHash !== null) {
    await sleep(400)
    await d.shot('vfy-a2-23-askchoice-before-light.png')
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('采购单'))?.click()`)
    await sleep(800)
    await d.shot('vfy-a2-24-askchoice-selected-light.png')
    note(`#15 ask choice: ${JSON.stringify(await d.evaluate(`(() => {
      const out = []
      for (const b of document.querySelectorAll('button')) {
        const t = (b.textContent ?? '').trim()
        if (t.includes('采购单') || t.includes('入库单')) {
          const rs = getComputedStyle(b)
          out.push({ text: t.slice(0, 8), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), border: rs.getPropertyValue('border-color') })
        }
      }
      return out
    })()`))}`)
  }

  // ---- welcome + bubbles: start a new colleague chat, send a message ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await sleep(700)
  await d.evaluate(`document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"], [aria-label*="新建"]')?.click()
    ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('新建'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(600)
  const rosterItems = await d.evaluate(`[...document.querySelectorAll('.adm-popup-body button')].map(b => (b.textContent ?? '').trim().slice(0, 10)).slice(0, 8)`)
  note(`newchat roster: ${JSON.stringify(rosterItems)}`)
  await d.evaluate(`document.querySelector('.adm-popup-body button')?.click()`)
  await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
  await sleep(900)
  await d.shot('vfy-a2-25-welcome-light.png')
  note(`welcome: ${JSON.stringify(await d.evaluate(`(() => {
    const text = document.body.innerText
    return { hasWelcome: /你好|我是|可以帮你|试试/.test(text), starterButtons: [...document.querySelectorAll('button')].filter(b => b.closest('[class*="starter"], [class*="welcome"]') !== null).length }
  })()`))}`)
  await d.TYPE('textarea', '你好，帮我登记一张冷链票据')
  await sleep(300)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('发送'))?.click()
    ?? document.querySelector('button[class*="send"]')?.click()`)
  await sleep(1500)
  await d.shot('vfy-a2-26-bubbles-light.png')
  note(`bubbles light: ${JSON.stringify(await d.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*="msg"], [class*="bubble"], [class*="row"]')].slice(-5)
    return rows.map(el => {
      const rs = getComputedStyle(el)
      return { cls: el.className.toString().slice(0, 44), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color') }
    })
  })()`))}`)

  // ---- toast DARK + primary1677 on chat page ----
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.evaluate('location.reload()')
  await sleep(1800)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷面板'))?.click()`)
  await sleep(500)
  await d.evaluate(`document.querySelector('button[class*="qpTool"]')?.click()`)
  await sleep(400)
  await d.shot('vfy-a2-27-toast-dark.png')
  note(`#9 toast dark: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius']))}`)
  note(`chat dark 1677: ${JSON.stringify(await scan1677(d))}`)
  await sleep(1500)

  // ---- login CTA (fresh gate) ----
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(800)
  const loginDump = await d.evaluate(`(() => {
    const out = { buttons: [], form: null }
    out.form = document.querySelector('form') !== null
    for (const b of document.querySelectorAll('.dshm-root button')) {
      const rs = getComputedStyle(b)
      out.buttons.push({ text: (b.textContent ?? '').trim().slice(0, 8), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), radius: rs.getPropertyValue('border-radius'), w: Math.round(b.getBoundingClientRect().width) })
    }
    return out
  })()`)
  note(`#2 login buttons: ${JSON.stringify(loginDump)}`)
  await d.shot('vfy-a2-28-login-light.png')

  note(`extra console errors: ${String(d.errors().length)}`)
} finally {
  writeEvidence('.vfy-a2-extra.json', evidence)
  d.cleanup()
  process.exit(0)
}
