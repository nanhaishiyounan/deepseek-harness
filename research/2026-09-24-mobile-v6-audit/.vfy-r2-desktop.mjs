/**
 * R2 equivalent re-verification, desktop lane — ≥720px viewport: the 430px
 * phone shell centers on the desk; every portal layer (TaskForm sheet, owner
 * Picker + its mask) must stay inside the shell's rect. ImageViewer.Multi
 * rides the same portal host (spec asserts getContainer), so its geometry is
 * covered by the same containment check. Evidence → vfy-r2-d*.png +
 * .vfy-r2-desktop.json. Read-only for :3080.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-r2-desktop.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[V] ${line}`) }

/** All fixed portal layers (popup bodies + masks) vs the 430px shell rect. */
const containment = (d) => d.evaluate(`(() => {
  const shell = document.querySelector('.dshm-root')
  if (shell === null) return { error: 'no shell' }
  const s = shell.getBoundingClientRect()
  const out = { shell: { left: Math.round(s.left), right: Math.round(s.right), top: Math.round(s.top), bottom: Math.round(s.bottom), w: Math.round(s.width) }, layers: [] }
  for (const el of [...document.querySelectorAll('.adm-popup-body, .adm-mask, .adm-dialog, .adm-toast-main')]) {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 && r.height <= 0) continue
    out.layers.push({
      cls: el.className.toString().slice(0, 48),
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
      inside: r.left >= s.left - 0.5 && r.right <= s.right + 0.5,
    })
  }
  return out
})()`)

const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

async function openReportChat(d) {
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(1000)
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

const d = await boot(9375, { width: 1280, height: 900 })
try {
  await demoLogin(d, 'light')
  note(`desktop login ok; viewport 1280x900`)
  const hash = await openReportChat(d)
  note(`report chat hash: ${String(hash)}`)

  // TaskForm sheet containment
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(900)
  await d.shot('vfy-r2-d1-desktop-taskform.png')
  note(`desktop taskform containment: ${JSON.stringify(await containment(d))}`)
  note(`desktop taskform radius/bg: ${JSON.stringify(await probe(d, '.adm-popup-body', ['border-top-left-radius', 'background-color']))}`)

  // owner Picker containment
  await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
  await d.waitFor(`document.querySelector('.adm-picker-popup') !== null`, { timeout: 6000 })
  await sleep(900)
  await d.shot('vfy-r2-d2-desktop-picker.png')
  note(`desktop picker containment: ${JSON.stringify(await containment(d))}`)
  note(`desktop picker radius: ${JSON.stringify(await probe(d, '.adm-picker-popup .adm-popup-body', ['border-radius', 'background-color']))}`)
  await closePopup(d)

  // dialog containment (logout confirm)
  await closePopup(d)
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(900)
  await d.evaluate(`window.scrollTo(0, 3000)`)
  await sleep(400)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-r2-d3-desktop-dialog.png')
  note(`desktop dialog containment: ${JSON.stringify(await containment(d))}`)
  await closePopup(d)

  note(`console errors/exceptions: ${String(d.errors().length)}`)
} finally {
  writeEvidence('.vfy-r2-desktop.json', evidence)
  d.cleanup()
  process.exit(0)
}
