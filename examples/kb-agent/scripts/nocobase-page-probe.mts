/**
 * Headless page probe (playwright from platform/nocobase/node_modules) —
 * stands in for the chrome-devtools MCP browser when its connection drops.
 * Signs in as admin, visits one admin page, waits for a selector, dumps a
 * DOM probe result and a viewport screenshot.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/.page-probe.mts <path> <waitText> <outPng> [probeSelector]
 */
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../../platform/nocobase/package.json', import.meta.url))
const { chromium } = require('playwright')

const [, , pathArg = '/admin/h4srmaf4rurtt17p', waitText = '供应商绩效雷达', outPng = '/tmp/h5-probe.png', probeSelector = ''] = process.argv

// The platform snapshot's playwright expects a chromium revision the cache
// lacks; the system Chrome answers through the channel switch.
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
// Sign in through the real form — the client owns its auth-state mechanism,
// and form login leaves it exactly as a user session would.
await page.goto('http://127.0.0.1:13000/signin', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder(/email|账号|用户名/i).or(page.locator('input[name="email"], input#email, input[type="text"]').first()).first().fill('admin@nocobase.com')
await page.locator('input[type="password"]').first().fill('admin123')
await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("登录"), button:has-text("Sign in")').first().click()
await page.waitForURL(url => !String(url).includes('signin'), { timeout: 30_000 })
await page.goto(`http://127.0.0.1:13000${pathArg}`, { waitUntil: 'domcontentloaded' })
// networkidle never settles on the dev server (constant polling); wait for
// the anchor text instead, with a diagnostic dump when it misses.
try {
  await page.getByText(waitText).first().waitFor({ timeout: 45_000 })
} catch (error) {
  console.log(`probe timeout at ${page.url()} — title=${await page.title()} bodyHead=${(await page.locator('body').innerText().catch(() => '')).slice(0, 300)}`)
  throw error
}
await page.waitForTimeout(2500)
if (probeSelector.length > 0) {
  const probe = await page.evaluate((selector) => {
    const node = document.querySelector(selector)
    return node === null ? null : { tag: node.tagName, text: node.textContent?.slice(0, 500) ?? '' }
  }, probeSelector)
  console.log(`probe ${probeSelector} → ${JSON.stringify(probe)}`)
}
await page.screenshot({ path: outPng })
console.log(`screenshot → ${outPng}`)
await browser.close()
