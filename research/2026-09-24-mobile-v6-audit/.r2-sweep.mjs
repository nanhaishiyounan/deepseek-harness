/**
 * R2 residual sweep: the four secondary pages (me/agents/files/tasks) plus the
 * new-chat sheet were not on the main pass; this runs the same UA-face scan and
 * per-class probes there on both tracks, and hunts a derived row / ask card in
 * the replay chats.
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

const sweep = async (d, track) => {
  await d.goto(`${BASE}/mobile.html#/me`)
  await d.waitFor(`document.querySelector('button[class*="workspace"]') !== null`, { timeout: 8000 })
  note(`[${track}] me workspace: ${JSON.stringify(await probe(d, 'button[class*="workspace"]', ['color', 'background-color']))}`)
  note(`[${track}] me recentRow: ${JSON.stringify(await probe(d, 'button[class*="recentRow"]', ['color', 'background-color']))}`)
  note(`[${track}] me UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)

  await d.goto(`${BASE}/mobile.html#/agents`)
  await d.waitFor(`document.querySelector('button[class*="rosterItem"]') !== null`, { timeout: 8000 })
  note(`[${track}] agents rosterItem: ${JSON.stringify(await probe(d, 'button[class*="rosterItem"]', ['color', 'background-color']))}`)
  note(`[${track}] agents UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)

  await d.goto(`${BASE}/mobile.html#/files`)
  await d.waitFor(`document.body.innerText.includes('AI 生成')`, { timeout: 8000 })
  note(`[${track}] files fileTopMain: ${JSON.stringify(await probe(d, 'button[class*="fileTopMain"]', ['color', 'background-color']))}`)
  note(`[${track}] files UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)

  await d.goto(`${BASE}/mobile.html#/tasks`)
  await d.waitFor(`document.body.innerText.includes('我的') || document.body.innerText.includes('团队')`, { timeout: 8000 })
  note(`[${track}] tasks taskRow: ${JSON.stringify(await probe(d, 'button[class*="taskRow"]', ['color', 'background-color']))}`)
  note(`[${track}] tasks UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)

  // new-chat sheet from the chats header
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.body.innerText.includes('消息') || document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 8000 })
  await d.evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '') === '新建会话')?.click()`)
  await d.waitFor(`document.querySelector('button[class*="rosterRow"]') !== null`, { timeout: 6000 })
  note(`[${track}] newchat rosterRow: ${JSON.stringify(await probe(d, 'button[class*="rosterRow"]', ['color', 'background-color']))}`)
  note(`[${track}] newchat recentRow: ${JSON.stringify(await probe(d, 'button[class*="recentRow"]', ['color', 'background-color']))}`)
  note(`[${track}] newchat UA-leaks: ${JSON.stringify(await d.evaluate(UA_SCAN))}`)

  // derived row / ask card hunt across the replay chats
  await d.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(400)
  await d.goto(`${BASE}/mobile.html#/chats`)
  await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 8000 })
  const rows = await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]').length`)
  let derived = null
  let askCard = null
  for (let i = 0; i < Math.min(rows, 12) && (derived === null || askCard === null); i += 1) {
    await d.evaluate(`document.querySelectorAll('button[class*="sessionRow"]')[${String(i)}]?.click()`)
    await sleep(1100)
    if (derived === null) {
      derived = await probe(d, 'button[class*="derivedRow"]', ['color', 'background-color'])
    }
    if (askCard === null) {
      askCard = await probe(d, 'button[class*="askCard"]', ['color', 'background-color'])
    }
    note(`[${track}] chat[${String(i)}] derived: ${JSON.stringify(derived)} askCard: ${JSON.stringify(askCard)}`)
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`document.querySelectorAll('button[class*="sessionRow"]').length > 0`, { timeout: 5000 })
  }
}

const d = await boot(9343)
try {
  await demoLogin(d, 'dark')
  await sweep(d, 'dark')
  await demoLogin(d, 'light')
  await sweep(d, 'light')
  note(`console errors/exceptions: ${String(d.errors().length)}`)
  writeEvidence('.r2-sweep-evidence.json', evidence)
} finally {
  d.cleanup()
}
