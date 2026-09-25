import { boot, demoLogin } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'
const d = await boot(9491)
await demoLogin(d, 'light')
await d.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await sleep(700)
const r = await d.evaluate(`(() => {
  const rows = [...document.querySelectorAll('button')]
  return {
    btnCount: rows.length,
    withXianfeng: rows.filter(b => (b.textContent ?? '').includes('鲜丰冷链箱登记')).length,
    recentRowTexts: [...document.querySelectorAll('button[class*="recentRow"]')].map(b => (b.textContent ?? '').slice(0, 30)),
    bodyHasXianfeng: document.body.innerText.includes('鲜丰冷链箱登记'),
    hash: location.hash,
  }
})()`)
console.log(JSON.stringify(r, null, 2))
d.cleanup()
