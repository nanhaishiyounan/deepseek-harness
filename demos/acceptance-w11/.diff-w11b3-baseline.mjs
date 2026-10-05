// W11-B3 baseline spot-check: pixel-diff the B3 chats/home re-sweep against
// the B1 route matrix (the post-fix baseline) inside a headless chromium
// canvas — a near-zero diff proves the B2 lanes introduced no route-face drift.
// Usage (repo root): node demos/acceptance-w11/.diff-w11b3-baseline.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const OUT = 'demos/acceptance-w11'
const PAIRS = [
  ['chats-375-light', 'w11-b1-chats-375-light.png', 'w11-b3-chats-375-light.png'],
  ['chats-375-dark', 'w11-b1-chats-375-dark.png', 'w11-b3-chats-375-dark.png'],
  ['home-375-light', 'w11-b1-home-375-light.png', 'w11-b3-home-375-light.png'],
  ['home-375-dark', 'w11-b1-home-375-dark.png', 'w11-b3-home-375-dark.png'],
]

const browser = await chromium.launch()
const page = await browser.newPage()
const lines = []
for (const [name, baseFile, newFile] of PAIRS) {
  const base64 = (f) => `data:image/png;base64,${readFileSync(`${OUT}/${f}`).toString('base64')}`
  const stats = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode failed'))
      img.src = src
    })
    const [ia, ib] = [await load(a), await load(b)]
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` }
    }
    const canvas = new OffscreenCanvas(ia.width, ia.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(ia, 0, 0)
    const da = ctx.getImageData(0, 0, ia.width, ia.height).data
    ctx.clearRect(0, 0, ia.width, ia.height)
    ctx.drawImage(ib, 0, 0)
    const db = ctx.getImageData(0, 0, ia.width, ia.height).data
    let diff = 0
    let maxDelta = 0
    for (let i = 0; i < da.length; i += 4) {
      const delta = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]))
      if (delta > 8) diff += 1
      if (delta > maxDelta) maxDelta = delta
    }
    return { pixels: da.length / 4, diff, ratio: diff / (da.length / 4), maxDelta }
  }, [base64(baseFile), base64(newFile)])
  const line = `${name}: ${JSON.stringify(stats)}`
  console.log(line)
  lines.push(line)
}
await browser.close()
writeFileSync(`${OUT}/w11-b3-baseline-diff.log`, `${lines.join('\n')}\n`)
