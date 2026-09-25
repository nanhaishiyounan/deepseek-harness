/**
 * R2 equivalent re-verification, mini pass — dark logout Dialog (the
 * clear-demo confirm never rendered; logout rides the same Dialog.confirm
 * portal), plus the "theme flipped with a popup open" stress: toggle the
 * me-page dark switch, then open the TaskForm sheet in the flipped track and
 * read its computed face. Evidence → vfy-r2-m*.png + .vfy-r2-mini.json.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-r2-mini.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[V] ${line}`) }
const scan1677 = (d) => d.evaluate(`(() => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    const rs = getComputedStyle(el)
    for (const p of ['color', 'background-color', 'border-top-color', 'fill']) {
      if (rs.getPropertyValue(p).includes('22, 119, 255')) hits.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40) + ' ' + p)
    }
  }
  return hits.slice(0, 8)
})()`)
const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

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

const d = await boot(9377)
try {
  await demoLogin(d, 'dark')

  // ---- dark logout dialog ----
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(1000)
  await d.evaluate(`window.scrollTo(0, 999999)`)
  await sleep(600)
  const found = await d.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录')); if (el === undefined) return false; el.click(); return true })()`)
  const dialogShown = await d.waitFor(`document.querySelector('.adm-dialog-body') !== null`, { timeout: 6000 })
  await sleep(600)
  await d.shot('vfy-r2-m1-logout-dialog-dark.png')
  note(`dark logout dialog (clicked=${String(found)} shown=${String(dialogShown)}): ${JSON.stringify({
    body: await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']),
    content: await probe(d, '.adm-dialog-content', ['color']),
    confirm: await probe(d, '.adm-dialog-button', ['color']),
    1677: await scan1677(d),
    mount: await d.evaluate(`(() => { const el = document.querySelector('.adm-dialog'); return el === null ? null : { inRoot: el.closest('.dshm-root') !== null, visible: el.getBoundingClientRect().height > 0 } })()`),
  })}`)
  await closePopup(d)

  // ---- theme flip mid-session, then popup in flipped track ----
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(900)
  const flipped = await d.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[class*="settingRow"], [class*="row"], label, div')]
    const sw = [...document.querySelectorAll('[role="switch"], [class*="switch"]')]
    const dark = sw.find(s => (s.closest('[class*="setting"], [class*="row"]')?.textContent ?? '').includes('深色'))
    if (dark === undefined) return 'no-switch'
    dark.click()
    return 'clicked'
  })()`)
  await sleep(800)
  const afterFlip = await d.evaluate(`({ html: document.documentElement.dataset.theme, stored: localStorage.getItem('dsh-mobile-theme') })`)
  note(`theme flip via switch (${String(flipped)}): ${JSON.stringify(afterFlip)}`)
  const hash = await openReportChat(d)
  if (hash !== null) {
    await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
    await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
    await sleep(800)
    await d.shot('vfy-r2-m2-taskform-after-flip.png')
    note(`taskform after flip (html=${String(await d.evaluate('document.documentElement.dataset.theme'))}): ${JSON.stringify({
      body: await probe(d, '.adm-popup-body', ['background-color', 'border-top-left-radius']),
      title: await probe(d, '.adm-popup-body h2', ['color']),
      1677: await scan1677(d),
    })}`)
    await closePopup(d)
  }

  note(`console errors/exceptions: ${String(d.errors().length)}`)
  if (d.errors().length > 0) note(`error sample: ${JSON.stringify(d.errors().slice(0, 4).map(e => ({ type: e.type, text: e.text.slice(0, 150) })))}`)
} finally {
  writeEvidence('.vfy-r2-mini.json', evidence)
  d.cleanup()
  process.exit(0)
}
