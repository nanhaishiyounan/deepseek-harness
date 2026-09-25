/**
 * R2 final pass: the work ledger's card-head button. The capsule tabs carry
 * badge counts inside the tab label ("进行中 1"), so the earlier exact-text
 * click missed; this clicks by includes and re-probes both tracks.
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

const cardHead = async (d, track) => {
  await d.goto(`${BASE}/mobile.html#/work`)
  await d.waitFor(`document.body.innerText.includes('进行中')`, { timeout: 8000 })
  await d.evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-tab')].find(el => (el.textContent ?? '').includes('进行中'))?.click()`)
  await d.waitFor(`document.querySelector('button[class*="cardHeadButton"]') !== null`, { timeout: 6000 })
  await sleep(400)
  note(`[${track}] cardHeadButton (进行中): ${JSON.stringify(await probe(d, 'button[class*="cardHeadButton"]', ['color', 'background-color']))}`)
  note(`[${track}] work-doing UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)
  await d.shot(track === 'dark' ? 'r2-03-work-head-dark.png' : 'r2-04-work-head-light.png')
}

const d = await boot(9339)
try {
  await demoLogin(d, 'dark')
  await cardHead(d, 'dark')
  await demoLogin(d, 'light')
  await cardHead(d, 'light')
  note(`console errors/exceptions: ${String(d.errors().length)}`)
  writeEvidence('.r2-final-evidence.json', evidence)
} finally {
  d.cleanup()
}
