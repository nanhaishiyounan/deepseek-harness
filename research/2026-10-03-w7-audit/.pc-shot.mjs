// W7 PC aesthetic audit screenshots (read-only research artifact, not product code).
// Signs into the running NocoBase PC surface at :13000 through the /signin form,
// then captures viewport (1440x900) PNGs of the audited admin pages into shots/.
// Per-page failures are collected and printed at the end; exit code is always 0.
// Usage (repo root): node research/2026-10-03-w7-audit/.pc-shot.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const OUT = fileURLToPath(new URL('./shots/', import.meta.url))

const PAGES = [
  ['leg01-crm-customer.png', 'n17sys042q2lz'],
  ['leg02-crm-leads.png', 'n17rwc527ujwt'],
  ['leg03-sales-payment.png', 'n17f2c15ji684n8g'],
  ['leg04-hr-employee.png', 'n17lhe5qyxu1g'],
  ['leg05-basedata-categories.png', 'n17f3rnd403uzlkc'],
  ['leg06-asset-maintenance.png', 'n17f34o4bhrzg1w'],
  ['leg07-srm-supplier.png', 'h4srm2u9xiqx09jb'],
  ['leg08-wms-stock.png', 'h5wms9v2hly0cg6j'],
  ['leg09-wms-inbound.png', 'h5wmsrh8ls7pkv5i'],
  ['leg10-pur-order.png', 'w3puryzkva06iuhh'],
  ['leg11-pur-request.png', 'w3pura0kyqfx4f9'],
  ['leg12-so-order.png', 'w7mrp4w590rm0ws8'],
  ['leg13-mfg-order.png', 'w5mfgntyu7wy20a'],
  ['leg14-mfg-bom.png', 'w5mfga37ztlt6orc'],
  ['leg15-qc-inspection.png', 'w8qmjvyv8p5j7j'],
  ['leg16-plan-mps.png', 'w7mrpyru4s708nwn'],
  ['leg17-kpi-inventory.png', 'w9kpiatwzi4gjbff'],
  ['leg18-v1-gantt.png', '96yet9a0x45'],
  ['w6-01-cockpit.png', 'w6b9cdzrc2lst1dm'],
  ['w6-02-fin-workbench.png', 'w6b9fgcovvinqe85'],
  ['w6-03-compare-matrix.png', 'w3purb7o0r3yqi45'],
  ['w6-04-insp-workbench.png', 'w6b5icrrgz5z9gu'],
  ['w6-05-trace-dag.png', 'w6b3by6ukynxfou'],
  ['w6-06-expiry-board.png', 'w6b3k0jfsyskif'],
  ['w6-07-maint-calendar.png', 'w6b8eci1cpbqsgtj'],
  ['w6-08-aps-bottleneck.png', 'w6b8a3fg2qshtalw'],
  ['w6-09-pipeline.png', 'w6b6c6iqjj61zo9'],
]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// Sign in through the PC /signin form (read-only surface: form login only).
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)
// NocoBase keeps the session token in localStorage, so the check must run
// in-page with the Bearer header (a cookie-only request would 401 regardless).
const auth = await page.evaluate(async () => {
  const token = (localStorage.getItem('NOCOBASE_TOKEN') ?? '').replace(/^"|"$/g, '')
  const res = await fetch('/api/auth:check', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const body = await res.json().catch(() => null)
  return { status: res.status, username: body?.data?.username ?? null }
})
console.log(`auth:check -> HTTP ${auth.status} (user: ${auth.username ?? 'unknown'})`)
if (auth.status !== 200) {
  console.log('WARN: /api/auth:check did not return 200; shots may capture the sign-in screen')
}

const failures = []
let ok = 0
for (const [name, uid] of PAGES) {
  try {
    await page.goto(`${BASE}/admin/${uid}`)
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(2800)
    await page.screenshot({ path: `${OUT}${name}` })
    ok += 1
    console.log(`shot ${name}`)
  } catch (err) {
    failures.push(`${name} (${uid}): ${String(err.message).split('\n')[0]}`)
    console.log(`FAIL ${name} (${uid}): ${String(err.message).split('\n')[0]}`)
  }
}

console.log('\n== 截图字节数 ==')
for (const [name] of PAGES) {
  try {
    console.log(`${name} ${statSync(`${OUT}${name}`).size} bytes`)
  } catch {
    console.log(`${name} MISSING`)
  }
}

console.log(`\n== 结果: 成功 ${ok}/${PAGES.length}, 失败 ${failures.length} ==`)
if (failures.length > 0) {
  console.log('失败清单:')
  for (const failure of failures) console.log(`  - ${failure}`)
}

await browser.close()
process.exit(0)
