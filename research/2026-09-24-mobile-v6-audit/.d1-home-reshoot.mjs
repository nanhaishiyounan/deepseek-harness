/**
 * The home-only reshoot after the statCell column rule moved from the alpha
 * stroke to the solid border token. The chat/sheet angles stay on the 03:19
 * archive (the server restart below lost that day's in-memory sessions).
 */
import { boot, demoLogin, writeEvidence } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const d = await boot(9493)
await demoLogin(d, 'light')
await d.waitFor(`document.body.innerText.includes('最近对话')`, { timeout: 15000 })
await sleep(900)
await d.shot('d1-fix-1-home.png')
const evidence = await d.evaluate(`(() => {
  const out = {}
  const cell2 = [...document.querySelectorAll('span[class*="statCell"]')][1]
  if (cell2 !== undefined) {
    const rs = getComputedStyle(cell2)
    out.statCellRule = rs.borderLeftWidth + ' ' + rs.borderLeftStyle + ' ' + rs.borderLeftColor
  }
  out.statValueFs = getComputedStyle(document.querySelector('span[class*="statValue"]')).fontSize
  out.statLabelColor = getComputedStyle(document.querySelector('span[class*="statLabel"]')).color
  const stats = document.querySelector('button[class*="statsCard"]')
  out.statsShadow = stats === null ? null : getComputedStyle(stats).boxShadow.slice(0, 60)
  const quick = document.querySelector('div[class*="quickRow"]')
  out.quickCols = quick === null ? null : getComputedStyle(quick).gridTemplateColumns
  const names = [...document.querySelectorAll('span[class*="rosterName"]')]
  out.rosterNames = names.slice(0, 5).map(n => ({ text: n.textContent, clipped: n.scrollHeight > n.clientHeight + 1 }))
  const list = document.querySelector('div[class*="recentList"]')
  out.recentShadow = list === null ? null : getComputedStyle(list).boxShadow.slice(0, 60)
  const badge = document.querySelector('span[class*="recentBadge"]')
  out.badge = badge === null ? null : { w: Math.round(badge.getBoundingClientRect().width) }
  return out
})()`)
d.cleanup()
writeEvidence('.d1-home-reshoot-evidence.json', evidence)
console.log('done')
