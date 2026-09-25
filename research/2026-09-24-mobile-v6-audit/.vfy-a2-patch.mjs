/**
 * A2 verification — patch probes: UA-leak buttons in light, dark toast retry,
 * work doing-tab actions + work-detail timeline, quick-panel flow padding,
 * welcome/bubbles via the roster chat entry.
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-a2-patch.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[P] ${line}`) }
const REPORT_HASH = '#/chat/session-v6-b3-rich'

/** Computed bg/color for every button whose bg or color rides the UA default. */
const uaLeakScan = (d) => d.evaluate(`(() => {
  const out = []
  for (const b of document.querySelectorAll('.dshm-root button')) {
    const rs = getComputedStyle(b)
    const bg = rs.getPropertyValue('background-color')
    const color = rs.getPropertyValue('color')
    const r = b.getBoundingClientRect()
    if (r.width === 0) continue
    if (bg === 'rgb(239, 239, 239)' || color === 'rgb(0, 0, 0)') {
      out.push({ text: (b.textContent ?? '').trim().slice(0, 10), cls: b.className.toString().slice(0, 40), bg, color })
    }
  }
  return out.slice(0, 14)
})()`)

const d = await boot(9371)
try {
  await demoLogin(d, 'light')

  // ---- UA-leak buttons in LIGHT (home + chats) ----
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 10000 })
  await sleep(800)
  note(`light home UA-leaks: ${JSON.stringify(await uaLeakScan(d))}`)
  await d.goto(`${BASE}/mobile.html#/chats`)
  await sleep(700)
  note(`light chats UA-leaks: ${JSON.stringify(await uaLeakScan(d))}`)
  // token-var probe on a leaky button for the report
  note(`sectionLink computed: ${JSON.stringify(await d.evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('查看全部'))
    if (el === undefined) return null
    const rs = getComputedStyle(el)
    return { cls: el.className.toString().slice(0, 40), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color') }
  })()`))}`)

  // ---- quick panel #13: flow padding with the panel open ----
  await d.goto(`${BASE}/mobile.html${REPORT_HASH}`)
  await d.waitFor(`document.querySelector('textarea') !== null`, { timeout: 10000 })
  await sleep(800)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷面板'))?.click()`)
  await sleep(600)
  note(`#13 flow paddings: ${JSON.stringify(await d.evaluate(`(() => {
    const flows = [...document.querySelectorAll('[class*="flow"]')]
    return flows.map(el => ({ cls: el.className.toString().slice(0, 44), padBottom: getComputedStyle(el).getPropertyValue('padding-bottom') })).slice(0, 6)
  })()`))}`)

  // ---- work doing tab + card buttons ----
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 10000 })
  await sleep(800)
  await d.evaluate(`(() => {
    const tab = [...document.querySelectorAll('.adm-capsule-tabs-tab')].find(el => (el.textContent ?? '').includes('进行中'))
    tab?.click()
  })()`)
  await sleep(800)
  const doingDump = await d.evaluate(`(() => {
    const list = document.querySelector('[aria-label="工作列表"]')
    const cards = list ? [...list.querySelectorAll('article')] : []
    return {
      cardCount: cards.length,
      buttons: list === null ? [] : [...list.querySelectorAll('button')].slice(0, 8).map(b => {
        const rs = getComputedStyle(b)
        return { text: (b.textContent ?? '').trim().slice(0, 12), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), radius: rs.getPropertyValue('border-radius') }
      }),
    }
  })()`)
  note(`work doing: ${JSON.stringify(doingDump)}`)
  await d.shot('vfy-a2-33-work-doing-light.png')

  // ---- work detail timeline ----
  await d.evaluate(`(() => { document.querySelector('[aria-label="工作列表"] article')?.click() })()`)
  await sleep(1200)
  const dh = await d.evaluate('location.hash')
  note(`work detail hash: ${String(dh)}`)
  if (String(dh).includes('/work/')) {
    await d.shot('vfy-a2-34-workdetail-light.png')
    const grads = await d.evaluate(`(() => {
      const out = []
      for (const el of document.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage
        if (bg.includes('gradient')) out.push({ cls: String(el.className).slice(0, 44), bg: bg.slice(0, 100) })
      }
      return out.slice(0, 6)
    })()`)
    note(`timeline gradients: ${JSON.stringify(grads)}`)
  }

  // ---- welcome + bubbles through the roster entry ----
  await d.goto(`${BASE}/mobile.html#/agents`)
  await sleep(900)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('智能填表助手'))?.click()
    ?? document.querySelector('button[class*="toolCard"], button[class*="agentCard"]')?.click()`)
  const chatNav = await d.waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 10000 })
  note(`roster chat nav: ${String(chatNav)} hash=${String(await d.evaluate('location.hash'))}`)
  await sleep(1000)
  await d.shot('vfy-a2-35-welcome-light.png')
  note(`welcome: ${JSON.stringify(await d.evaluate(`(() => {
    const text = document.body.innerText
    const starters = [...document.querySelectorAll('[class*="starter"], [class*="welcome"] button')].length
    return { hasGreeting: text.includes('你好') || text.includes('我是'), hasStarterText: /登记|查一查|试试/.test(text), starterButtons: starters }
  })()`))}`)
  await d.TYPE('textarea', '你好')
  await sleep(300)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('发送'))?.click()
    ?? document.querySelector('button[class*="send"]')?.click()`)
  await sleep(1800)
  await d.shot('vfy-a2-36-bubbles-light.png')
  const bubbleDump = await d.evaluate(`(() => {
    const flow = document.querySelector('[class*="flow"]')
    if (flow === null) return []
    return [...flow.querySelectorAll(':scope > * > *, :scope > *')].slice(-6).map(el => {
      const rs = getComputedStyle(el)
      return { cls: String(el.className).slice(0, 40), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color') }
    })
  })()`)
  note(`bubbles: ${JSON.stringify(bubbleDump)}`)

  // ---- dark toast retry ----
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.evaluate('location.reload()')
  await sleep(2000)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷面板'))?.click()`)
  await sleep(600)
  const toolsFound = await d.evaluate(`document.querySelectorAll('button[class*="qpTool"]').length`)
  await d.evaluate(`document.querySelector('button[class*="qpTool"]')?.click()`)
  await sleep(450)
  await d.shot('vfy-a2-37-toast-dark.png')
  note(`dark toast: ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius', 'bottom']))} tools=${String(toolsFound)}`)
  note(`dark home UA-leaks: ${JSON.stringify(await uaLeakScan(d))}`)
  await sleep(1500)
  note(`patch console errors: ${String(d.errors().length)}`)
} finally {
  writeEvidence('.vfy-a2-patch.json', evidence)
  d.cleanup()
  process.exit(0)
}
