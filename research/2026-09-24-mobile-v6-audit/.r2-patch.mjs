/**
 * R2 patch pass: three surfaces the main sweep could not reach on their
 * default screens — the work card-head button (the ledger's default 待处理 tab
 * renders no cards, so switch to 进行中), the copy button (needs a replay chat
 * carrying a fenced code block), and the askChip picked state (the found ask
 * session was unsettled; picking an option arms askSelected).
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (s) => { evidence.push(s); console.log(s) }

const UA_SCAN = `(() => {
  const bad = []
  for (const b of document.querySelectorAll('button')) {
    const cls = b.getAttribute('class') ?? ''
    if (cls === '') continue
    const rs = getComputedStyle(b)
    if (rs.backgroundColor === 'rgb(239, 239, 239)' || rs.color === 'rgb(0, 0, 0)') {
      bad.push({ text: (b.textContent ?? '').trim().slice(0, 14), cls: cls.slice(0, 56) })
    }
  }
  return bad
})()`

const goDoing = async (d) => {
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.body.innerText.includes('进行中')`, { timeout: 8000 })
  await d.evaluate(`[...document.querySelectorAll('*')].find(el => (el.childElementCount === 0 || el.className.toString().includes('capsule')) && (el.textContent ?? '').trim() === '进行中')?.click()`)
  await d.waitFor(`document.querySelector('button[class*="cardHeadButton"]') !== null`, { timeout: 6000 })
  await sleep(400)
}

const findCodeBox = async (d) => {
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 8000 })
  const count = await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]').length`)
  for (let i = 0; i < Math.min(count, 10); i += 1) {
    await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]')[${String(i)}]?.click()`)
    const found = await d.waitFor(`document.querySelector('[data-testid="code-box"] button[class*="copyBtn"]') !== null`, { timeout: 2500 })
    if (found) return i
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 5000 })
  }
  return -1
}

const pickChip = async (d) => {
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 1`, { timeout: 8000 })
  await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]')[1]?.click()`)
  await d.waitFor(`document.querySelectorAll('button[class*="askChip"]').length > 0`, { timeout: 6000 })
  await d.evaluate(`document.querySelector('button[class*="askChip"]')?.click()`)
  await d.waitFor(`document.querySelector('button[class*="askChip"][class*="askSelected"]') !== null`, { timeout: 6000 })
  await sleep(500)
  const picked = await probe(d, 'button[class*="askChip"][class*="askSelected"]', ['color', 'background-color', 'border-color'])
  const plain = await probe(d, 'button[class*="askChip"]:not([class*="askSelected"])', ['color', 'background-color', 'border-color'])
  return { picked, plain }
}

const d = await boot(9335)
try {
  await demoLogin(d, 'dark')
  note(`dark login ok`)
  await goDoing(d)
  note(`[dark] cardHeadButton (进行中): ${JSON.stringify(await probe(d, 'button[class*="cardHeadButton"]', ['color', 'background-color']))}`)
  note(`[dark] work-doing UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  await d.shot('r2-03-work-head-dark.png')

  const codeDark = await findCodeBox(d)
  note(`[dark] code-box chat index: ${String(codeDark)}`)
  if (codeDark >= 0) {
    note(`[dark] copyBtn: ${JSON.stringify(await probe(d, '[data-testid="code-box"] button[class*="copyBtn"]', ['color', 'background-color']))}`)
    await d.shot('r2-17-copybtn-dark.png')
  }

  note(`askChip picked/plain (dark): ${JSON.stringify(await pickChip(d))}`)
  await d.shot('r2-08-askchip-two-states.png')

  await demoLogin(d, 'light')
  note(`light login ok`)
  await goDoing(d)
  note(`[light] cardHeadButton (进行中): ${JSON.stringify(await probe(d, 'button[class*="cardHeadButton"]', ['color', 'background-color']))}`)
  note(`[light] work-doing UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  await d.shot('r2-04-work-head-light.png')

  const codeLight = await findCodeBox(d)
  note(`[light] code-box chat index: ${String(codeLight)}`)
  if (codeLight >= 0) {
    note(`[light] copyBtn: ${JSON.stringify(await probe(d, '[data-testid="code-box"] button[class*="copyBtn"]', ['color', 'background-color']))}`)
    await d.shot('r2-18-copybtn-light.png')
  }

  note(`console errors/exceptions: ${String(d.errors().length)}`)
  writeEvidence('.r2-patch-evidence.json', evidence)
} finally {
  d.cleanup()
}
