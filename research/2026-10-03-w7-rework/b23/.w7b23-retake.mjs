// W7-B2B3 retake: 检验读数 (w7-b3-02) captured a loading state in the batch
// pass — retake with an explicit wait for the table header, rerun the probe
// set, and patch .w7b23-shot-report.json in place.
// Usage: node research/2026-10-03-w7-rework/b23/.w7b23-retake.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const NAME = 'w7-b3-02-检验读数'
const UID = 'w8qmg3yelbk0rzm'

const SOFT_BGS = ['#f5fae5', '#fff8d6', '#ffeaf4', '#eff1f2', '#e1f4ff', '#e0f5f7', '#fafafa']
const LEGACY_HEX = ['#1677ff', '#1d4ed8', '#7c3aed', '#6b7280', '#9ca3af', '#722ed1']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)
await page.goto(`${BASE}/admin/${UID}`)
await page.locator('.ant-table-thead th').first().waitFor({ timeout: 30000 })
await page.waitForTimeout(2600)
await page.screenshot({ path: `${DIR}after/${NAME}.png` })
const probe = await page.evaluate(([softBgs, legacyHexes]) => {
  const SOFT_HEX = new Set(softBgs)
  const LEGACY_RE = new RegExp(legacyHexes.join('|'), 'i')
  const out = {}
  const thead = document.querySelector('.ant-table-thead th')
  if (thead !== null) {
    const cs = getComputedStyle(thead)
    out.thead600 = Number(cs.fontWeight) >= 600
    out.theadBg = cs.backgroundColor !== 'rgb(255, 255, 255)'
  }
  const tags = [...document.querySelectorAll('.ant-tag')].slice(0, 12)
  if (tags.length > 0) {
    out.tagSoft = tags.every((tag) => {
      const bg = getComputedStyle(tag).backgroundColor
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(bg)
      if (m === null) return false
      const alpha = m[4] === undefined ? 1 : Number(m[4])
      const hex = `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}`
      return alpha < 0.3 || SOFT_HEX.has(hex)
    })
    out.tagPill = tags.every((tag) => Number.parseFloat(getComputedStyle(tag).borderRadius) >= 99)
  }
  const numericCell = [...document.querySelectorAll('.ant-table-tbody td')].find((td) => getComputedStyle(td).textAlign === 'right')
  if (numericCell !== undefined) {
    out.numRightTnum = getComputedStyle(numericCell).fontVariantNumeric.includes('tabular-nums')
      || getComputedStyle(numericCell).fontFeatureSettings.includes('tnum')
  }
  const v2Surface = [
    document.querySelector('.ant-table')?.outerHTML ?? '',
    ...[...document.querySelectorAll('form')].map((f) => f.outerHTML),
  ].join('')
  out.noLegacyHex = v2Surface === '' ? true : !LEGACY_RE.test(v2Surface)
  return out
}, [SOFT_BGS, LEGACY_HEX])
await browser.close()

const report = JSON.parse(readFileSync(`${DIR}.w7b23-shot-report.json`, 'utf8'))
report.probes[NAME] = probe
const TABLE_CHECKS = ['thead600', 'theadBg', 'tagSoft', 'tagPill', 'numRightTnum', 'noLegacyHex']
const applicable = TABLE_CHECKS.filter((key) => probe[key] !== undefined)
const misses = applicable.filter((key) => probe[key] !== true)
const shot = report.shots?.find((s) => s.name === `${NAME}.png`)
if (shot !== undefined) shot.bytes = statSync(`${DIR}after/${NAME}.png`).size
report.verdicts.table.fail = report.verdicts.table.fail.filter((f) => f.name !== NAME)
if (misses.length === 0) report.verdicts.table.pass += 1
else report.verdicts.table.fail.push({ name: NAME, misses })
writeFileSync(`${DIR}.w7b23-shot-report.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(`retake ${NAME}: ${applicable.map((k) => `${k}=${probe[k] ? 'PASS' : 'FAIL'}`).join(' ')}`)
process.exit(misses.length > 0 ? 1 : 0)
