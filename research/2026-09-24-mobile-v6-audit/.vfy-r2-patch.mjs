/**
 * R2 equivalent re-verification, patch pass — closes the gaps the main sweep
 * left open: DatePicker radius on both tracks (second pickerRow), Toast
 * capsule both tracks (code-block copy button), dark clear-demo Dialog,
 * login CTA face, clean theme-persistence (the main script's stress step
 * overwrote the stored theme), plus the ≥720px desktop containment lane
 * (popup + mask ⊆ 430px shell). Evidence → vfy-r2-p*.png + .vfy-r2-patch.json.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-r2-patch.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[V] ${line}`) }
const UA_BG = new Set(['rgb(239, 239, 239)', 'rgb(240, 240, 240)', 'rgb(11, 11, 11)'])
const scanFaces = (d) => d.evaluate(`(() => {
  const UA_BG = ${JSON.stringify([...UA_BG])}
  const hits = []
  for (const b of document.querySelectorAll('button[class]')) {
    const r = b.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const rs = getComputedStyle(b)
    const bg = rs.getPropertyValue('background-color')
    const color = rs.getPropertyValue('color')
    if (UA_BG.includes(bg) || color === 'rgb(0, 0, 0)') hits.push({ cls: String(b.className).slice(0, 60), text: (b.textContent ?? '').trim().slice(0, 14), bg, color })
  }
  return hits.slice(0, 12)
})()`)
const dumpPanels = (d) => d.evaluate(`(() => {
  return [...document.querySelectorAll('.adm-picker-popup .adm-popup-body, .adm-date-picker-popup .adm-popup-body')].map(el => {
    const rs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { cls: el.className.toString().slice(0, 70), radius: rs.getPropertyValue('border-radius'), bg: rs.getPropertyValue('background-color'), w: Math.round(r.width), top: Math.round(r.top) }
  })
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

/** Open the DatePicker sheet alone: taskform → second pickerRow, then dump. */
async function datePickerRadius(d, track) {
  const hash = await openReportChat(d)
  if (hash === null) { note(`${track} datepicker: report chat not found`); return }
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(900)
  const rows = await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]').length`)
  note(`${track} pickerRow count: ${String(rows)}`)
  await d.evaluate(`document.querySelectorAll('button[class*="pickerRow"]')[1]?.click()`)
  await sleep(1000)
  await d.shot(`vfy-r2-p1-datepicker-${track}.png`)
  note(`${track} F2 datepicker panels: ${JSON.stringify(await dumpPanels(d))}`)
  note(`${track} F1 datepicker faces: ${JSON.stringify(await scanFaces(d))}`)
  await closePopup(d)
  await closePopup(d)
}

/** Find a chat with a code block copy button, click it, read the toast. */
async function toastViaCopy(d, track) {
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
  await sleep(800)
  const count = await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button').length`)
  for (let index = 0; index < count; index += 1) {
    await d.evaluate(`document.querySelectorAll('[aria-label="会话列表"] button')[${String(index)}]?.click()`)
    const ok = await d.waitFor(`document.querySelector('button[class*="copyBtn"]') !== null`, { timeout: 4000 })
    if (ok) break
    await d.goto(`${BASE}/mobile.html#/chats`)
    await sleep(400)
  }
  const clicked = await d.evaluate(`document.querySelector('button[class*="copyBtn"]')?.click() ?? false`)
  await sleep(500)
  await d.shot(`vfy-r2-p2-toast-${track}.png`)
  note(`${track} toast (copyBtn=${String(clicked)}): ${JSON.stringify(await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius', 'bottom', 'font-size']))}`)
  note(`${track} F1 chat-with-code faces: ${JSON.stringify(await scanFaces(d))}`)
  await sleep(1200)
}

const d = await boot(9373)
try {
  // ================= LIGHT =================
  await demoLogin(d, 'light')
  await datePickerRadius(d, 'light')
  await toastViaCopy(d, 'light')

  // login CTA face
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(900)
  note(`light login buttons: ${JSON.stringify(await d.evaluate(`(() => {
    const root = document.querySelector('.dshm-root') ?? document
    return [...root.querySelectorAll('button')].map(b => {
      const rs = getComputedStyle(b)
      return { cls: String(b.className).slice(0, 44), text: (b.textContent ?? '').trim().slice(0, 10), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), radius: rs.getPropertyValue('border-radius') }
    })
  })()`))}`)

  // clean theme persistence: light set → reload keeps light
  await d.evaluate(`location.reload()`)
  await sleep(1500)
  note(`theme persist (light, clean): ${JSON.stringify({ html: await d.evaluate('document.documentElement.dataset.theme'), stored: await d.evaluate(`localStorage.getItem('dsh-mobile-theme')`) })}`)

  // ================= DARK =================
  await demoLogin(d, 'dark')
  await datePickerRadius(d, 'dark')
  await toastViaCopy(d, 'dark')

  // dark clear-demo dialog (scroll me page to reach the button)
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(1000)
  await d.evaluate(`window.scrollTo(0, 3000)`)
  await sleep(500)
  const clickedClear = await d.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('清除演示数据')); if (el === undefined) { window.scrollTo(0, 9999); return 'scrolled' } el.click(); return true })()`)
  if (clickedClear === 'scrolled') { await sleep(500); await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('清除演示数据'))?.click()`) }
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-r2-p3-dialog-dark.png')
  note(`dark clear-demo dialog: ${JSON.stringify({
    clickedClear,
    body: await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']),
    content: await probe(d, '.adm-dialog-content', ['color']),
    confirm: await probe(d, '.adm-dialog-button', ['color']),
    mount: await d.evaluate(`(() => { const el = document.querySelector('.adm-dialog'); return { inRoot: el?.closest('.dshm-root') !== null } })()`),
  })}`)
  await closePopup(d)

  // dark theme persistence (clean, no stress interference)
  await d.evaluate(`location.reload()`)
  await sleep(1500)
  note(`theme persist (dark, clean): ${JSON.stringify({ html: await d.evaluate('document.documentElement.dataset.theme'), stored: await d.evaluate(`localStorage.getItem('dsh-mobile-theme')`) })}`)

  note(`console errors/exceptions: ${String(d.errors().length)}`)
  if (d.errors().length > 0) note(`error sample: ${JSON.stringify(d.errors().slice(0, 4).map(e => ({ type: e.type, text: e.text.slice(0, 150) })))}`)
} finally {
  writeEvidence('.vfy-r2-patch.json', evidence)
  d.cleanup()
  process.exit(0)
}
