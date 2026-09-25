/** One-shot: read the chat composer plusBtn computed face on both tracks. */
import { boot, demoLogin, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'
const evidence = []
const d = await boot(9379)
try {
  for (const track of ['light', 'dark']) {
    await demoLogin(d, track)
    await d.goto(`${BASE}/mobile.html#/chats`)
    await d.waitFor(`document.querySelector('[aria-label="会话列表"]') !== null`, { timeout: 12000 })
    await d.evaluate(`document.querySelector('[aria-label="会话列表"] button')?.click()`)
    await d.waitFor(`document.querySelector('textarea') !== null`, { timeout: 8000 })
    await sleep(900)
    const face = await d.evaluate(`(() => {
      const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('快捷'))
        ?? document.querySelector('button[class*="plus"], button[class*="plusBtn"]')
      if (el === undefined || el === null) return null
      const rs = getComputedStyle(el)
      return { cls: el.className.toString().slice(0, 50), bg: rs.getPropertyValue('background-color'), color: rs.getPropertyValue('color'), border: rs.getPropertyValue('border-color') }
    })()`)
    evidence.push(`[${track}] composer plusBtn: ${JSON.stringify(face)}`)
  }
} finally {
  writeEvidence('.vfy-r2-plus.json', evidence)
  d.cleanup()
  process.exit(0)
}
