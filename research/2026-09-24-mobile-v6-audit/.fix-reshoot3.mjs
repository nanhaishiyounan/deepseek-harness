/**
 * A2 fix re-shoot, part 3 — the toast lane through the report chat (the
 * audit-02 path: quick panel via the composer's + toggle, qp tool toast) in
 * both tracks, and the login CTA after a real document reload.
 *
 * Usage: node research/2026-09-24-mobile-v6-audit/.fix-reshoot3.mjs
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.audit-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[A2c] ${line}`) }

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

async function fireToast(d) {
  if (!(await openReportChat(d))) return false
  await sleep(600)
  await d.evaluate(`document.querySelector('[aria-label="打开快捷面板"]')?.click()`)
  const panel = await d.waitFor(`document.querySelector('[aria-label="快捷指令"]') !== null`, { timeout: 6000 })
  if (!panel) return false
  await sleep(500)
  await d.evaluate(`[...document.querySelectorAll('[aria-label="快捷指令"] button')].pop()?.click()`)
  await sleep(450)
  return true
}

const d = await boot(9366)
try {
  // 11: light toast capsule
  await demoLogin(d, 'light')
  if (await fireToast(d)) {
    await d.shot('fix-11-toast-light.png')
    note(`11 toast light: ${JSON.stringify({ toast: await probe(d, '.adm-toast-main', ['background-color', 'border-radius', 'bottom', 'color']) })}`)
    await sleep(1500)
  }

  // 14: dark toast inversion
  await d.evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  if (await fireToast(d)) {
    await d.shot('fix-14-toast-dark.png')
    note(`14 toast dark: ${JSON.stringify({ toast: await probe(d, '.adm-toast-main', ['background-color', 'color', 'border-radius', 'bottom']) })}`)
    await sleep(1500)
  }

  // 32: login CTA after a real reload clears the in-memory identity
  await d.evaluate(`localStorage.removeItem('dsh-mobile-auth')`)
  await d.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await d.goto(`${BASE}/mobile.html#/login`)
  await d.waitFor(`document.body.innerText.includes('食链通')`, { timeout: 12000 })
  await sleep(600)
  await d.shot('fix-32-login-light.png')
  note(`32 login CTA: ${JSON.stringify({
    cta: await probe(d, 'button[class*="submit"]', ['background-color', 'color', 'border-radius', '__rect']),
  })}`)
} finally {
  d.cleanup()
}
writeEvidence('.fix-evidence-3.json', evidence)
console.log('A2c re-shoot complete')
