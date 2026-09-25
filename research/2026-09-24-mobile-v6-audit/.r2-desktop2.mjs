/**
 * R2 desktop containment representative: the demo replay data carries no
 * markdown images, so the ImageViewer's own fullscreen layer cannot be armed
 * from real data on desktop (its prop-level mount contract is asserted in
 * tests/rich-content.client.spec.tsx instead). As the geometry-level stand-in
 * this captures a TaskForm popup — the same portal host + translateZ
 * containment the viewer rides — and asserts mask ⊆ 430px shell.
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (s) => { evidence.push(s); console.log(s) }

const d = await boot(9341, { width: 1280, height: 800 })
try {
  await demoLogin(d, 'light')
  note(`desktop root rect: ${JSON.stringify(await probe(d, '.dshm-root', []))}`)
  await d.goto(`${BASE}/mobile.html#/chat/session-v6-b3-rich`)
  await d.waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 8000 })
  await d.evaluate(`[...document.querySelectorAll('[data-testid="report-card"] button')].find(b => (b.textContent ?? '').includes('创建处理任务'))?.click()`)
  await d.waitFor(`document.querySelector('button[class*="pickerRow"]') !== null`, { timeout: 6000 })
  await sleep(500)
  const containment = await d.evaluate(`(() => {
    const root = document.querySelector('.dshm-root')
    const mask = document.querySelector('.adm-mask')
    if (root === null || mask === null) return { ok: false, reason: 'missing root or mask' }
    const r = root.getBoundingClientRect()
    const m = mask.getBoundingClientRect()
    return {
      ok: m.left >= r.left - 1 && m.right <= r.right + 1 && m.top >= r.top - 1 && m.bottom <= r.bottom + 1,
      root: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      mask: { left: m.left, right: m.right, top: m.top, bottom: m.bottom },
      mountInRoot: (document.querySelector('button[class*="pickerRow"]')?.closest('.dshm-root') !== null),
    }
  })()`)
  note(`taskform containment: ${JSON.stringify(containment)}`)
  await d.shot('r2-19-desktop-taskform-containment.png')
  note(`console errors/exceptions: ${String(d.errors().length)}`)
  writeEvidence('.r2-desktop2-evidence.json', evidence)
} finally {
  d.cleanup()
}
