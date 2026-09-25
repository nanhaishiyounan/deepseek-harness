import { boot, demoLogin } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'
const d = await boot(9492)
await demoLogin(d, 'light')
await d.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await sleep(500)
// Open the all-chats layer and dump its rows.
await d.evaluate(`location.hash = '#/chats'`)
await sleep(1200)
const r = await d.evaluate(`(() => ({
  rows: [...document.querySelectorAll('button[class*="sessionRow"]')].map(b => (b.textContent ?? '').slice(0, 36)),
}))()`)
console.log(JSON.stringify(r, null, 2))
d.cleanup()
