/**
 * R2 diagnosis: why the 进行中 tab shows no card-head button, and which chats
 * carry .richText / code boxes at all (the copyBtn and desktop ImageViewer
 * surfaces need real narrative containers).
 */
import { boot, demoLogin, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (s) => { evidence.push(s); console.log(s) }

const d = await boot(9337)
try {
  await demoLogin(d, 'dark')
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.body.innerText.includes('进行中')`, { timeout: 8000 })
  note(`work tabs dom: ${JSON.stringify(await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-title, .adm-tabs-tab, [class*="apsule"]')].map(el => ({ tag: el.tagName, cls: el.className.toString().slice(0, 50), text: (el.textContent ?? '').trim().slice(0, 12) })).slice(0, 12)`))}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-title')].find(el => (el.textContent ?? '').trim() === '进行中')?.click()`)
  await sleep(1200)
  note(`after 进行中 click: cardHead=${String(await d.evaluate(`document.querySelectorAll('button[class*="cardHeadButton"]').length`))} bodyHead=${JSON.stringify((await d.evaluate(`document.body.innerText.slice(0, 220)`)) ?? '')}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-title')].find(el => (el.textContent ?? '').trim() === '待确认')?.click()`)
  await sleep(1000)
  note(`after 待确认 click: cardHead=${String(await d.evaluate(`document.querySelectorAll('button[class*="cardHeadButton"]').length`))}`)
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-title')].find(el => (el.textContent ?? '').trim() === '待处理')?.click()`)
  await sleep(1000)
  note(`after 待处理 click: cardHead=${String(await d.evaluate(`document.querySelectorAll('button[class*="cardHeadButton"]').length`))}`)

  // scan chats for richText / code-box / img
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 8000 })
  const rows = await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]').length`)
  for (let i = 0; i < Math.min(rows, 12); i += 1) {
    const label = await d.evaluate(`(document.querySelectorAll('button[class*="sessionRow"]')[${String(i)}]?.textContent ?? '').trim().slice(0, 18)`)
    await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]')[${String(i)}]?.click()`)
    await sleep(1100)
    const marks = await d.evaluate(`({ rich: document.querySelectorAll('.richText').length, code: document.querySelectorAll('[data-testid="code-box"]').length, img: document.querySelectorAll('.richText img').length, ask: document.querySelectorAll('[data-testid="ask-choice"],[data-testid="field-ask"]').length })`)
    note(`chat[${String(i)}] "${label}": ${JSON.stringify(marks)}`)
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 5000 })
  }
  writeEvidence('.r2-diag-evidence.json', evidence)
} finally {
  d.cleanup()
}
