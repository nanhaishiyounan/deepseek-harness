// W10-R3 three-face stamp probe: the same-source rule live on :3080.
// The R3 close-out moved the chats-list and home-recent stamps from the
// session-title loan onto the colleagueNameOf chain (roster row name, else
// the duty tag), so one unknown preset (AI 食安服务主管) must now read the
// same stamp word — 食安 — on all faces: chats rows, home recents, the roster
// page, and the chat header. Before the fix the list rows borrowed the title
// (GB2760… → AI, 新会话 → AI) and disagreed with the roster/chat stamps.
// Rig: light theme, qc_inspector sign-in, 375px viewport, the freshly built
// dist (mobile-BIajl0ch.js). Exits nonzero on any gate failure; writes the
// JSON next to this script and the four PNG evidences beside it.
// Usage (repo root): node demos/acceptance-w10/w10-r3-stamp-probe.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w10/w10-r3-stamp-probe.json'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const stampOf = async (row) => (await row.$('[class*="avatar_"]'))?.textContent() ?? ''

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-theme', 'light')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1200)

// -- face 1: the chats list rows (the R3 change's own surface) ----------------
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await sleep(2500)
const chats = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow_"]')).map((row) => ({
  stamp: row.querySelector('[class*="avatar_"]')?.textContent ?? '',
  title: row.querySelector('[class*="sessionTitle_"]')?.textContent ?? '',
})))
await page.screenshot({ path: 'demos/acceptance-w10/w10-r3-01-chats-stamp-375.png' })

// -- face 2: the roster page ---------------------------------------------------
await page.goto(`${BASE}#/agents`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
const roster = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="rosterItem_"]')).map((row) => ({
  stamp: row.querySelector('[class*="avatar_"]')?.textContent ?? '',
  name: row.querySelector('[class*="rosterName_"]')?.textContent ?? '',
})))
await page.screenshot({ path: 'demos/acceptance-w10/w10-r3-02-agents-roster-375.png' })

// -- face 3: the chat header of one 食安-stamped session ------------------------
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await sleep(2000)
const rows = await page.$$('button[class*="sessionRow_"]')
let entered = false
for (const row of rows) {
  if (await stampOf(row) === '食安') { await row.click(); entered = true; break }
}
const chat = entered
  ? await page.evaluate(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 2500) })
      return {
        headerStamp: document.querySelector('[class*="headerMain_"] [class*="avatar_"]')?.textContent ?? '',
        title: document.querySelector('[class*="headerTitle_"]')?.textContent ?? '',
      }
    })
  : { headerStamp: '', title: '' }
await page.screenshot({ path: 'demos/acceptance-w10/w10-r3-03-chat-stamp-375.png' })

// -- face 4: the home recent rows (same change, second list surface) ------------
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
await sleep(2000)
const home = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="recentRow_"]')).map((row) => ({
  stamp: row.querySelector('[class*="avatar_"]')?.textContent ?? '',
  title: row.querySelector('[class*="recentTitle_"]')?.textContent ?? '',
})))
await page.screenshot({ path: 'demos/acceptance-w10/w10-r3-04-home-recent-stamp-375.png' })
await browser.close()

// -- gates -----------------------------------------------------------------------
// The borrow target: the roster's own 食安 stamp (unknown id, AI-prefixed name).
const rosterShian = roster.filter(row => row.stamp === '食安')
const chatsShian = chats.filter(row => row.stamp === '食安')
const homeShian = home.filter(row => row.stamp === '食安')
// The retired debt's signature: a list stamp equal to its own title's leading
// pair, or a bare AI stamp on a titled non-local row (the pre-R3 loan face).
const titleLoans = [...chats, ...home].filter(row =>
  (row.title.length >= 2 && row.stamp === row.title.slice(0, 2) && row.stamp !== '食安')
  || (row.title !== '新会话' && row.title !== '' && row.stamp === 'AI' && rosterShian.length > 0))
const gates = [
  ['roster-shian-present', rosterShian.length > 0],
  ['chats-shian-sourced', chatsShian.length > 0],
  ['chat-header-shian', chat.headerStamp === '食安'],
  ['home-recent-shian', homeShian.length > 0],
  ['no-title-loan-rows', titleLoans.length === 0],
  ['three-face-same-word',
    rosterShian.length > 0 && chatsShian.length > 0 && homeShian.length > 0 && chat.headerStamp === '食安'],
]
const probe = {
  at: new Date().toISOString(),
  chats, roster, chat, home,
  gates: gates.map(([name, ok]) => ({ name, ok })),
}
writeFileSync(OUT, `${JSON.stringify(probe, null, 2)}\n`)
const failed = probe.gates.filter((gate) => !gate.ok)
console.log(JSON.stringify({ faces: { chats: chatsShian.length, roster: rosterShian.length, home: homeShian.length, chat: chat.headerStamp }, titleLoans }, null, 2))
console.log(`w10-r3 stamp probe: ${probe.gates.length - failed.length}/${probe.gates.length} gates pass${failed.length === 0 ? ' — ALL PASS' : ` — FAILED: ${failed.map((gate) => gate.name).join(', ')}`}`)
process.exit(failed.length === 0 ? 0 : 1)
