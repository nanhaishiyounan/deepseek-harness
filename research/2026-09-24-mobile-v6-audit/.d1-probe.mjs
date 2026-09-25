import { boot, demoLogin } from './.vfy-lib.mjs'
const d = await boot(9471)
await demoLogin(d, 'light')
await d.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
const r = await d.evaluate(`(() => ({
  url: location.hash,
  hasStats: document.querySelector('button[class*="statsCard"]') !== null,
  names: document.querySelectorAll('span[class*="rosterName"]').length,
  rows: document.querySelectorAll('button[class*="recentRow"]').length,
  bodyHead: document.body.innerText.slice(0, 60),
}))()`)
console.log(JSON.stringify(r, null, 2))
d.cleanup()
