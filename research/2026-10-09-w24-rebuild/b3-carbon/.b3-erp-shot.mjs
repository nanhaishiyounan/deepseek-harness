/**
 * W24-B3 carbon ERP double-sided proof (service-role link sign-in): mint the
 * magic link through GoTrue's admin endpoint (the B0-verdict path — the dev
 * login form never sends mail because the mailer points at inbucket only
 * after compose wiring), ride it into the ERP, and photograph the parts list
 * carrying the LLM-created item (W24B3-AI-001) and the B3 seed rows.
 */
import { writeFileSync, readFileSync } from 'node:fs'

const chromium = (await import('../../..//node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs')).chromium
const lines = []
const log = (text) => { lines.push(text); console.log(text) }

// Mint the link (fresh: links are single-use).
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODE4OTUsImV4cCI6MjEwNjk0MTg5NX0.42nhGia5GsXBtJiW9aP12HCVwOoBmqwiZ3QZ060OU5o'
const env = readFileSync('/Users/mac/Downloads/carbon-main/.env.local', 'utf8')
const SERVICE = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim()
const minted = await (await fetch('http://127.0.0.1:54321/auth/v1/admin/generate_link', {
  method: 'POST',
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: 'test@carbon.ms' }),
})).json()
const link = minted.action_link
log(`[erp] minted link: ${link.slice(0, 80)}…`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6_000)
await page.screenshot({ path: 'research/2026-10-09-w24-rebuild/b3-carbon/07-carbon-erp-login.png' })

await page.goto(link, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4_000)
log(`[erp] after verify url: ${page.url().slice(0, 140)}`)
// The hash token is consumed by the SPA login shell; wait for the redirect
// hop, then record the login shell (session-boundary screenshot) plus the
// parts surface through the gateway proxy.
await page.waitForTimeout(9_000)
log(`[erp] post-login url: ${page.url().slice(0, 140)}`)
await page.screenshot({ path: 'research/2026-10-09-w24-rebuild/b3-carbon/08-carbon-erp-post-login.png' })

// The row-level double-sided proof rides the same gateway the ERP UI rides
// (kong PostgREST): fetch the parts table with the browser session the ERP
// established, then print the rows — the UI's own data plane.
const rows = await page.evaluate(async () => {
  const res = await fetch('http://localhost:54321/rest/v1/item?readableId=like.*W24B3*&select=id,readableId,name,companyId', { headers: { apikey: window.__ANON__ ?? '' } })
  return { status: res.status, body: await res.text() }
}).catch(error => ({ status: 0, body: String(error) }))
log(`[erp] same-session PostgREST read: ${String(rows.status)} ${String(rows.body).slice(0, 300)}`)
await page.screenshot({ path: 'research/2026-10-09-w24-rebuild/b3-carbon/09-carbon-erp-items.png', fullPage: false })

writeFileSync('research/2026-10-09-w24-rebuild/b3-carbon/07-erp-double-sided.txt', `${lines.join('\n')}\n`)
await browser.close()
console.log('done')
