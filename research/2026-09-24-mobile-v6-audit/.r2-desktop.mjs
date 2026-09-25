/**
 * R2 desktop re-verification: the ImageViewer.Multi now mounts through the
 * shell's portal host, so on a ≥720px desktop viewport its mask must stay
 * inside the 430px phone shell. Drives the rich replay chat, opens the viewer
 * off a narrative image (injecting a tiny inline image only when the replay
 * carries none — the mount path under test is identical), and asserts the
 * containment rect.
 */
import { boot, demoLogin, probe, writeEvidence, BASE } from './.vfy-lib.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const evidence = []
const note = (s) => { evidence.push(s); console.log(s) }

const IMG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMjQwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMmU3Y2Y2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IiNmZmYiPuWIhumhSBrZXkg6KeE6YeKPC90ZXh0Pjwvc3ZnPg=='

const d = await boot(9333, { width: 1280, height: 800 })
try {
  await demoLogin(d, 'light')
  note(`desktop root rect: ${JSON.stringify(await probe(d, '.dshm-root', []))}`)

  await d.goto(`${BASE}/mobile.html#/chat/session-v6-b3-rich`)
  await d.waitFor(`document.querySelector('.richText') !== null`, { timeout: 8000 })

  const realImages = await d.evaluate(`document.querySelectorAll('.richText img').length`)
  note(`narrative images present: ${String(realImages)}`)
  if (realImages === 0) {
    // The replay carries no inline image; arm the click-delegation path with
    // one injected <img> (RichContent collects sources from the container's
    // live innerHTML, so the viewer state flow is the production path).
    const armed = await d.evaluate(`(() => {
      const host = document.querySelector('.richText')
      if (host === null) return false
      const img = document.createElement('img')
      img.src = ${JSON.stringify(IMG)}
      img.alt = 'r2-desktop-check'
      host.appendChild(img)
      return true
    })()`)
    note(`injected arm img: ${String(armed)}`)
  }
  await d.evaluate(`document.querySelector('.richText img')?.click()`)
  const opened = await d.waitFor(`document.querySelector('.adm-image-viewer-content, [class*="image-viewer"]') !== null`, { timeout: 6000 })
  note(`viewer opened: ${String(opened)}`)
  await sleep(700)

  const containment = await d.evaluate(`(() => {
    const root = document.querySelector('.dshm-root')
    const mask = document.querySelector('.adm-mask:not([style*="display: none"])')
    const slide = document.querySelector('.adm-image-viewer-content, .adm-image-viewer-slides')
    if (root === null || mask === null) return { ok: false, reason: 'missing root or mask' }
    const r = root.getBoundingClientRect()
    const m = mask.getBoundingClientRect()
    const inside = m.left >= r.left - 1 && m.right <= r.right + 1 && m.top >= r.top - 1 && m.bottom <= r.bottom + 1
    return {
      ok: inside,
      root: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      mask: { left: m.left, right: m.right, top: m.top, bottom: m.bottom },
      viewerInRoot: slide === null ? 'no-slide-el' : (slide.closest('.dshm-root') !== null),
    }
  })()`)
  note(`imageviewer containment: ${JSON.stringify(containment)}`)
  await d.shot('r2-13-desktop-imageviewer.png')
  note(`console errors/exceptions: ${String(d.errors().length)}`)
  writeEvidence('.r2-desktop-evidence.json', evidence)
} finally {
  d.cleanup()
}
