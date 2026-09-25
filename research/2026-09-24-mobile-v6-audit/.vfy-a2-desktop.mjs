/**
 * A2 verification — desktop lane (1280x800): portal containment inside the
 * 430px shell for Dialog / TaskForm / NewChatSheet + mask scoping + #1677ff.
 * Usage: node research/2026-09-24-mobile-v6-audit/.vfy-a2-desktop.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[D] ${line}`) }
const REPORT_HASH = '#/chat/session-v6-b3-rich'
const closePopup = async (d) => { await d.evaluate(`document.querySelector('.adm-mask')?.click()`); await sleep(500) }

const d = await boot(9370, { width: 1280, height: 800 })
try {
  await demoLogin(d, 'light')
  note(`root rect: ${JSON.stringify(await d.evaluate(`document.querySelector('.dshm-root')?.getBoundingClientRect().toJSON()`))}`)

  // ---- #30 desktop dialog containment ----
  await d.goto(`${BASE}/mobile.html#/me`)
  await sleep(900)
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('退出登录'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-dialog') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-a2-29-desktop-dialog.png')
  note(`#30 dialog: ${JSON.stringify({
    wrap: await probe(d, '.adm-center-popup-wrap', ['__rect']),
    mask: await probe(d, '.adm-mask', ['__rect']),
    bodyBg: await probe(d, '.adm-dialog-body', ['background-color', 'border-radius']),
  })}`)
  await closePopup(d)

  // ---- #37 desktop TaskForm containment ----
  await d.goto(`${BASE}/mobile.html${REPORT_HASH}`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 12000 })
  await sleep(600)
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(800)
  await d.shot('vfy-a2-30-desktop-taskform.png')
  note(`#37 taskform: ${JSON.stringify({
    body: await probe(d, '.adm-popup-body', ['__rect', 'background-color', 'border-top-left-radius']),
    mask: await probe(d, '.adm-mask', ['__rect']),
    toast1677: await d.evaluate(`(() => {
      const hits = []
      for (const el of document.querySelectorAll('*')) {
        const rs = getComputedStyle(el)
        for (const p of ['color', 'background-color', 'border-top-color', 'fill']) {
          if (rs.getPropertyValue(p).includes('22, 119, 255')) hits.push(\`\${el.tagName}.\${String(el.className).slice(0,30)}\`)
        }
      }
      return hits.slice(0, 5)
    })()`),
  })}`)
  await closePopup(d)

  // ---- #38 desktop NewChat containment ----
  await d.goto(`${BASE}/mobile.html#/chats`)
  await sleep(800)
  await d.evaluate(`document.querySelector('button[class*="plusEntry"], button[class*="headerPlus"], [aria-label*="新建"]')?.click()
    ?? [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('新建'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-a2-31-desktop-newchat.png')
  note(`#38 newchat: ${JSON.stringify({
    body: await probe(d, '.adm-popup-body', ['__rect', 'background-color']),
    mask: await probe(d, '.adm-mask', ['__rect']),
  })}`)

  // ---- desktop picker containment (bonus: portal host chain on desktop) ----
  await closePopup(d)
  await d.goto(`${BASE}/mobile.html${REPORT_HASH}`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 12000 })
  await sleep(500)
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('.adm-popup-body') !== null`, { timeout: 8000 })
  await sleep(500)
  await d.evaluate(`document.querySelector('button[class*="pickerRow"]')?.click()`)
  await d.waitFor(`document.querySelector('.adm-picker-popup') !== null`, { timeout: 6000 })
  await sleep(700)
  await d.shot('vfy-a2-32-desktop-picker.png')
  note(`desktop picker: ${JSON.stringify({
    body: await probe(d, '.adm-picker-popup .adm-popup-body', ['__rect', 'background-color']),
  })}`)
  note(`desktop console errors: ${String(d.errors().length)}`)
} finally {
  writeEvidence('.vfy-a2-desktop.json', evidence)
  d.cleanup()
  process.exit(0)
}
