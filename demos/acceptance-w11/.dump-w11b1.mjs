// One-shot DOM dump of the composer textarea chain (debug helper).
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto('http://127.0.0.1:3080/mobile.html#/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
const created = await fetch('http://127.0.0.1:3080/api/session.create', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: 'w11b1-dump', method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
}).then(r => r.json())
const sid = created?.result?.value?.sessionId
console.log('session:', sid)
await page.goto(`http://127.0.0.1:3080/mobile.html#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
await new Promise(r => setTimeout(r, 600))
const dump = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('textarea').forEach(ta => out.push(`TA aria=[${ta.getAttribute('aria-label')}] ph=[${ta.getAttribute('placeholder')}] cls=${ta.className}`))
  let el = document.querySelector('textarea')
  for (let i = 0; i < 6 && el; i++) { out.push(`L${i} ${el.tagName} cls=${el.className} aria=${el.getAttribute('aria-label') ?? '-'}`); el = el.parentElement }
  return out.join('\n')
})
console.log(dump)
await browser.close()
