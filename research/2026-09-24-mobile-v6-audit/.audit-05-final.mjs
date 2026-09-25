/**
 * Audit 05 — final gap pass: work-page empty state + doing tab, work detail
 * timeline probes, desktop TaskForm full-width overflow proof, chats PTR +
 * SwipeAction gestures, SearchBar/CapsuleTabs in-root color probes.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-05-final.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A5] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const d = await boot(9366)
try {
  await demoLogin(d, 'light')

  // ---- work page: scroll to empty state, then switch to 进行中 ----------------
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 12000 })
  await sleep(800)
  await d.evaluate(`document.querySelector('[aria-label="工作列表"]').scrollIntoView({ block: 'start' })`)
  await sleep(400)
  await d.shot('audit-34-work-emptystate-light.png')
  note(`empty state: ${JSON.stringify({
    errorBlock: await probe(d, '.adm-error-block', ['--adm-color-primary', 'background-color']),
    emptyText: await d.evaluate(`document.querySelector('[aria-label="工作列表"]').innerText.slice(0, 80)`),
  })}`)
  // capsule active color (correct class name)
  note(`capsule active: ${JSON.stringify(await probe(d, '.adm-capsule-tabs-tab-active', ['background-color', 'color']))}`)

  // switch to 进行中 tab and open the detail
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-tab')].find(t => (t.textContent ?? '').includes('进行中'))?.click()`)
  await sleep(600)
  const opened = await d.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '查看进度')
      ?? [...document.querySelectorAll('button[aria-label^="打开"]')][0]
    if (btn === undefined || btn === null) return false
    btn.click(); return true
  })()`)
  note(`detail via doing tab: ${String(opened)}`)
  await sleep(1000)
  const detailHash = await d.evaluate('location.hash')
  note(`detail hash: ${detailHash}`)
  await d.shot('audit-35-workdetail-doing-light.png')
  note(`workdetail probes: ${JSON.stringify({
    fill: await probe(d, '[class*="progressFill"]', ['background-image', 'transition-duration', 'transition-timing-function']),
    track: await probe(d, '[class*="progressTrack"]', ['background-color', 'height', 'border-radius']),
    running: await probe(d, '[class*="stepRunning"]', ['border-color', 'background-color', 'box-shadow']),
    done: await probe(d, '[class*="stepDone"]', ['background-color', 'box-shadow']),
    demoBanner: await probe(d, '[class*="demoBanner"]', ['background-color', 'color']),
  })}`)
  // dark detail
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(250)
  await d.goto(`${BASE}/mobile.html${detailHash}`)
  await sleep(1000)
  await d.shot('audit-36-workdetail-doing-dark.png')
  note(`dark workdetail: ${JSON.stringify({
    running: await probe(d, '[class*="stepRunning"]', ['border-color', 'background-color']),
    actions: await probe(d, '[class*="detailActions"]', ['background-color', 'border-top-color']),
  })}`)
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)

  // ---- find report session hash on mobile, then replay on desktop -------------
  let reportHash = null
  for (let index = 0; index < 40 && reportHash === null; index += 1) {
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(450)
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    const ok = await d.waitFor(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`, { timeout: 5000 })
    if (ok) reportHash = await d.evaluate('location.hash')
  }
  note(`report hash: ${String(reportHash)}`)

  if (reportHash !== null) {
    await d.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
    await d.goto(`${BASE}/mobile.html${reportHash}`)
    await d.waitFor(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`, { timeout: 15000 })
    await sleep(600)
    await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
    await sleep(700)
    await d.shot('audit-37-desktop-taskform-fullwidth.png')
    note(`desktop overflow: ${JSON.stringify(await d.evaluate(`(() => {
      const root = document.querySelector('.dshm-root')?.getBoundingClientRect()
      const pop = document.querySelector('.adm-popup-body')?.getBoundingClientRect()
      const mask = document.querySelector('.adm-mask')?.getBoundingClientRect()
      return { root: { left: root?.left, width: root?.width }, popup: { left: pop?.left, width: pop?.width, top: pop?.top, bottom: pop?.bottom }, mask: { width: mask?.width, height: mask?.height } }
    })()`))}`)
    await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
    await sleep(200)

    // newchat sheet overflow on desktop too
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`[...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))`, { timeout: 12000 })
    await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('新建会话'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
    await sleep(600)
    await d.shot('audit-38-desktop-newchat-fullwidth.png')
    note(`desktop newchat: ${JSON.stringify(await d.evaluate(`(() => {
      const root = document.querySelector('.dshm-root')?.getBoundingClientRect()
      const pop = document.querySelector('.adm-popup-body')?.getBoundingClientRect()
      return { rootWidth: root?.width, popupWidth: pop?.width, popupLeft: pop?.left }
    })()`))}`)
    await d.evaluate(`document.querySelector('.adm-mask')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
    await sleep(300)

    // back to mobile viewport
    await d.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  }

  // ---- chats: PTR + SwipeAction + SearchBar ------------------------------------
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('[aria-label="会话列表"] button').length > 3`, { timeout: 12000 })
  await sleep(800)
  note(`searchbar: ${JSON.stringify(await probe(d, '.adm-search-bar-input-box, input[type="search"]', ['background-color', 'border-radius']))}`)

  // PTR on chats list
  await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 260 }] })
  for (let y = 280; y <= 430; y += 15) {
    await d.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] })
    await sleep(40)
  }
  await sleep(250)
  await d.shot('audit-39-chats-ptr.png')
  note(`ptr head: ${JSON.stringify(await probe(d, '.adm-pull-to-refresh-head-content', ['color', 'font-size']))}`)
  await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(900)

  // swipe action (chats row)
  const rowBox = await d.evaluate(`(() => { const b = document.querySelectorAll('[aria-label="会话列表"] button')[0]; return b.getBoundingClientRect().toJSON() })()`)
  const midY = rowBox.top + rowBox.height / 2
  await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 360, y: midY }] })
  for (let x = 340; x >= 170; x -= 15) {
    await d.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: midY }] })
    await sleep(40)
  }
  await sleep(300)
  await d.shot('audit-40-chats-swipe.png')
  note(`swipe: ${JSON.stringify({
    action: await probe(d, '.adm-swipe-action-action', ['background-color', 'color']),
    count: await d.evaluate(`document.querySelectorAll('.adm-swipe-action-action').length`),
  })}`)
  await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
} finally {
  writeEvidence('.audit-05-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
