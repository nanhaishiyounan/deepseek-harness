/**
 * Audit 04 — remaining surfaces: work detail page, desktop-shell popup
 * overflow + dialog position, pull-to-refresh, login page, CapsuleTabs active
 * color probe, chats SwipeAction gesture. Read-only against :3080.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.audit-04-remaining.mjs
 */
import { boot, demoLogin, probe, writeEvidence } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A4] ${line}`) }
const BASE = 'http://127.0.0.1:3080'

const d = await boot(9365)
try {
  await demoLogin(d, 'light')

  // ---- work detail via a real card button ------------------------------------
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 12000 })
  await sleep(1000)
  const opened = await d.evaluate(`(() => {
    const doingBtn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '查看进度')
      ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '查看结果')
      ?? document.querySelector('button[aria-label^="打开"]')
    if (doingBtn === undefined || doingBtn === null) return false
    doingBtn.click(); return true
  })()`)
  note(`work detail opened: ${String(opened)}`)
  await sleep(1000)
  const detailHash = await d.evaluate('location.hash')
  note(`detail hash: ${detailHash}`)
  await d.shot('audit-25-workdetail-doing-light.png')
  note(`workdetail: ${JSON.stringify({
    progressFill: await probe(d, '[class*="progressFill"]', ['background-image', 'background-color', 'transition-duration', 'transition-timing-function']),
    track: await probe(d, '[class*="progressTrack"]', ['background-color', 'height', 'border-radius']),
    stepRunning: await probe(d, '[class*="stepRunning"]', ['border-color', 'background-color', 'box-shadow']),
    stepDone: await probe(d, '[class*="stepDone"]', ['background-color', 'box-shadow']),
    timeline: await probe(d, '[class*="timeline"]', []),
    stamp: await probe(d, '[class*="stamp"], [class*="WorkStamp"]', ['border-color', 'color']),
  })}`)
  // dark workdetail
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(250)
  await d.goto(`${BASE}/mobile.html${detailHash}`)
  await sleep(1000)
  await d.shot('audit-26-workdetail-doing-dark.png')
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)

  // ---- CapsuleTabs active color (in-root) ------------------------------------
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.querySelector('[aria-label="工作列表"]') !== null`, { timeout: 12000 })
  await sleep(800)
  note(`capsule tabs active: ${JSON.stringify({
    capsuleActive: await probe(d, '.adm-capsule-tab-active', ['background-color', 'color']),
    capsuleWrap: await probe(d, '.adm-capsule-tabs', ['--adm-color-primary']),
  })}`)

  // ---- pull-to-refresh ---------------------------------------------------------
  await d.goto(`${BASE}/mobile.html#/`)
  await d.waitFor(`document.body.innerText.includes('今日台账')`, { timeout: 15000 })
  await sleep(700)
  await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 300 }] })
  for (let y = 320; y <= 470; y += 15) {
    await d.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] })
    await sleep(40)
  }
  await sleep(200)
  await d.shot('audit-27-pull-refresh-light.png')
  note(`ptr: ${JSON.stringify({
    head: await probe(d, '.adm-pull-to-refresh-head-content', ['color', 'font-size']),
  })}`)
  await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(800)

  // ---- chats swipe action gesture ---------------------------------------------
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('[aria-label="会话列表"] button').length > 3`, { timeout: 12000 })
  await sleep(800)
  const rowBox = await d.evaluate(`(() => { const b = document.querySelectorAll('[aria-label="会话列表"] button')[0]; return b.getBoundingClientRect().toJSON() })()`)
  await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 370, y: rowBox.top + rowBox.height / 2 }] })
  for (let x = 350; x >= 200; x -= 15) {
    await d.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: rowBox.top + rowBox.height / 2 }] })
    await sleep(40)
  }
  await sleep(300)
  await d.shot('audit-28-chats-swipe-light.png')
  note(`swipe actions: ${JSON.stringify({
    action: await probe(d, '.adm-swipe-action-action', ['background-color', 'color']),
  })}`)
  await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)

  // ---- desktop shell: taskform overflow + dialog position ----------------------
  await d.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('[aria-label="会话列表"] button').length > 3`, { timeout: 12000 })
  await sleep(900)
  let desktopOpened = false
  for (let index = 0; index < 40 && !desktopOpened; index += 1) {
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(500)
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    desktopOpened = await d.waitFor(`[...document.querySelectorAll('[data-testid="report-card"] button')].some(b => (b.textContent ?? '').includes('创建处理任务'))`, { timeout: 5000 })
    if (desktopOpened) {
      await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
      const up = await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
      if (!up) desktopOpened = false
    }
  }
  note(`desktop taskform opened: ${String(desktopOpened)}`)
  await sleep(700)
  await d.shot('audit-29-desktop-taskform-overflow.png')
  note(`desktop popup rects: ${JSON.stringify(await d.evaluate(`(() => {
    const root = document.querySelector('.dshm-root')?.getBoundingClientRect()
    const pop = document.querySelector('.adm-popup-body')?.getBoundingClientRect()
    const mask = document.querySelector('.adm-mask')?.getBoundingClientRect()
    return { root: root?.toJSON(), popup: pop?.toJSON(), mask: mask?.toJSON() }
  })()`))}`)
  await d.evaluate(`document.querySelector('.adm-popup-body [aria-label="关闭"]')?.click()`)
  await sleep(300)

  // dialog position on desktop
  await d.goto(`${BASE}/mobile.html#/profile`)
  await d.waitFor(`document.body.innerText.includes('清除演示数据')`, { timeout: 12000 })
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('.adm-list-item, div, button')].find(el => (el.textContent ?? '').trim() === '清除演示数据' && el.children.length <= 3)?.click()`)
  const dialogUp = await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 8000 })
  note(`desktop dialog up: ${String(dialogUp)}`)
  await sleep(500)
  await d.shot('audit-30-desktop-dialog-position.png')
  note(`desktop dialog rects: ${JSON.stringify(await d.evaluate(`(() => {
    const root = document.querySelector('.dshm-root')?.getBoundingClientRect()
    const dlg = document.querySelector('.adm-dialog')?.getBoundingClientRect()
    return { rootLeft: root?.left, rootWidth: root?.width, dialog: dlg?.toJSON() }
  })()`))}`)

  // ---- login page light/dark (logout first) ------------------------------------
  await d.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await d.evaluate(`[...document.querySelectorAll('.adm-dialog-button')].find(b => (b.textContent ?? '').includes('取消'))?.click()`)
  await sleep(300)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 8000 })
  await sleep(400)
  await d.shot('audit-31-logout-dialog-light.png')
  note(`logout dialog: ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']),
    confirm: await probe(d, '.adm-dialog-button-danger, .adm-dialog-button:last-child', ['color']),
  })}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-dialog-button')].find(b => (b.textContent ?? '').includes('退出'))?.click()`)
  await sleep(800)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 10000 })
  await sleep(500)
  await d.shot('audit-32-login-light.png')
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(250)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 10000 })
  await sleep(500)
  await d.shot('audit-33-login-dark.png')
  note(`login dark: ${JSON.stringify({
    root: await probe(d, '.dshm-root', ['background-color']),
    input: await probe(d, 'input', ['background-color', 'border-color', 'color']),
  })}`)
} finally {
  writeEvidence('.audit-04-evidence.json', evidence)
  d.cleanup()
  process.exit(0)
}
