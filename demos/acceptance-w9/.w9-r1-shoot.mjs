// W9-R1 repair-round evidence shoot: F1 (typeBadge radius restored from the
// dangling --dshm-r-ctl-corner token), F2 (a hand-typed 【登录身份】 line
// without the injection tail keeps its bubble; a legacy tailed stamp still
// folds — the B2 N5 regression), F3 (the seal gloss/shade track pair drives
// the hero and login seals), F4 (the bubble/stamp-faint global hooks carry
// their faces on the live DOM). All over the real gateway on :3080.
// Usage (repo root): node demos/acceptance-w9/.w9-r1-shoot.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w9'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

const login = async (page, theme) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    if (key !== undefined) localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const browser = await chromium.launch()

// ── Leg A (F1): files page — every typeBadge computes 14px from the token ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await page.goto(`${BASE}#/files`, { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  const probe = await page.evaluate(() => {
    const badges = [...document.querySelectorAll('[class*="typeBadge"]')]
    const at14 = badges.filter(el => getComputedStyle(el).borderRadius === '14px').length
    const cs = getComputedStyle(document.querySelector('.dshm-root'))
    return {
      total: badges.length,
      at14,
      corner: cs.getPropertyValue('--dshm-r-ctl-corner').trim(),
      sample: badges.slice(0, 3).map(el => getComputedStyle(el).borderRadius),
    }
  })
  check('A1 F1 token --dshm-r-ctl-corner 定义于活体级联（14px）', probe.corner === '14px', `corner=${probe.corner}`)
  check('A2 files 页 typeBadge 全部 14px（修复前 102 个 0px）', probe.total > 0 && probe.at14 === probe.total, `at14=${probe.at14}/${probe.total} sample=${probe.sample.join(',')}`)
  await page.screenshot({ path: `${OUT}/w9-r1-01-files-typebadge-radius-restored-375.png` })
  await context.close()
}

// ── Leg B (F3): hero/login seal gloss rides the track-paired tokens ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await sleep(1600)
  const lightSeal = await page.evaluate(() => {
    const seal = document.querySelector('[class*="heroSeal"]')
    const cs = getComputedStyle(seal)
    return { gloss: cs.getPropertyValue('--dshm-seal-gloss').trim(), shade: cs.getPropertyValue('--dshm-seal-shade').trim(), bg: cs.backgroundImage }
  })
  check('B1 亮轨酱印 gloss/shade（#ffffff / #ffffff）', lightSeal.gloss === '#ffffff' && lightSeal.shade === '#ffffff', `gloss=${lightSeal.gloss} shade=${lightSeal.shade}`)
  check('B2 亮轨 hero 渐变吃 token（恒白渐变）', lightSeal.bg.includes('rgb(255, 255, 255)'), lightSeal.bg.slice(0, 60))
  await page.screenshot({ path: `${OUT}/w9-r1-02a-home-seal-light-375.png` })
  await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1600)
  const darkSeal = await page.evaluate(() => {
    const seal = document.querySelector('[class*="heroSeal"]')
    const cs = getComputedStyle(seal)
    return { gloss: cs.getPropertyValue('--dshm-seal-gloss').trim(), shade: cs.getPropertyValue('--dshm-seal-shade').trim(), bg: cs.backgroundImage }
  })
  check('B3 暗轨酱印 gloss/shade（#2e241b / #241a12）', darkSeal.gloss === '#2e241b' && darkSeal.shade === '#241a12', `gloss=${darkSeal.gloss} shade=${darkSeal.shade}`)
  check('B4 暗轨 hero 渐变吃 token（焙面高光）', darkSeal.bg.includes('46, 36, 27'), darkSeal.bg.slice(0, 60))
  await page.screenshot({ path: `${OUT}/w9-r1-02b-home-seal-dark-375.png` })
  // The login twin seal (same gradient pair) — clear the identity and reload
  // so the gate remounts (SPA hash navigation alone would keep the shell).
  await page.evaluate(() => { localStorage.removeItem('dsh-mobile-auth') })
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1400)
  const loginSeal = await page.evaluate(() => {
    const seal = document.querySelector('[class*="stampLogo"]')
    return seal === null ? null : getComputedStyle(seal).backgroundImage
  })
  check('B5 登录页酱印同款渐变（token 化后无 hex 直染）', loginSeal !== null && loginSeal.includes('46, 36, 27'), loginSeal === null ? 'stampLogo not found' : loginSeal.slice(0, 60))
  await page.screenshot({ path: `${OUT}/w9-r1-02c-login-seal-dark-375.png` })
  await context.close()
}

// ── Legs C+D (F4 hooks + F2 hand-typed line): one live assistant chat ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  // A fresh assistant chat over the UI lane; the user types the bare marker.
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await page.getByRole('button', { name: /去聊聊/ }).first().click()
  await sleep(2200)
  const composer = page.locator('textarea').first()
  await composer.fill('【登录身份】foo')
  await sleep(300)
  await page.locator('button[aria-label="发送"]').click()
  await sleep(3200)
  const probe = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.dshm-bubble-paper-user')]
    const last = bubbles.at(-1)
    return {
      userFound: last !== undefined,
      userText: last === undefined ? '' : (last.textContent ?? '').trim(),
      userRadius: last === undefined ? '' : getComputedStyle(last).borderRadius,
      userBg: last === undefined ? '' : getComputedStyle(last).backgroundColor,
    }
  })
  check('D1 手打「【登录身份】foo」（无注入尾巴）用户气泡可见', probe.userFound && probe.userText.includes('【登录身份】foo'), `text=${probe.userText}`)
  check('C1 用户气泡挂全局钩子 dshm-bubble-paper-user', probe.userFound)
  check('C2 钩子承形：radius 18/18/6(/18) + 柿橙底', /^18px 18px 6px( 18px)?$/.test(probe.userRadius) && probe.userBg === 'rgb(180, 83, 10)', `radius=${probe.userRadius} bg=${probe.userBg}`)
  await page.screenshot({ path: `${OUT}/w9-r1-04-handtyped-identity-line-bubble-visible-375.png` })
  // EmptyState faint stamp: the docs page lands the empty section while no
  // catalog projections exist for this identity.
  await page.goto(`${BASE}#/docs`, { waitUntil: 'domcontentloaded' })
  await sleep(1400)
  const faintProbe = await page.evaluate(() => {
    const faint = document.querySelector('.dshm-stamp-faint')
    if (faint === null) return { found: false }
    const cs = getComputedStyle(faint)
    return { found: true, border: cs.borderTopStyle, radius: cs.borderRadius, size: `${cs.width}` }
  })
  check('C4 空态淡印挂全局钩子 dshm-stamp-faint（虚线环 50%）', faintProbe.found && faintProbe.border === 'dashed' && faintProbe.radius === '50%', JSON.stringify(faintProbe))
  await page.screenshot({ path: `${OUT}/w9-r1-03-emptystate-stamp-faint-375.png` })
  // D3 (N5 regression): find a legacy tailed-stamp session over the wire and
  // open it directly — the injected line must stay folded; C3 rides the same
  // session's AI reply for the paper-ai hook.
  const api = async (rpcId, method, payload) => {
    const response = await fetch(`http://127.0.0.1:3080/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    }).then(async r => r.json())
    return response?.result?.ok === true ? response.result.value : undefined
  }
  // The B2 N1 probe session (its durable log holds the forged tailed stamp at
  // seq 7) — the recorded id from w9-b2-negative-probe.log.
  const listed = await api('r1-l', 'session.list', {})
  const sessions = listed?.items ?? []
  let stampedId = 'session-b663e3ac-8573-4d93-be27-48a9a1529ed3'
  {
    const history = await api('r1-h-check', 'session.history', { sessionId: stampedId, maxMessages: 200 })
    const events = history?.events ?? []
    const hit = events.some((wrapped) => {
      const data = wrapped?.event?.data ?? wrapped?.data
      const text = data?.message?.content?.[0]?.text ?? data?.content?.[0]?.text ?? ''
      return typeof text === 'string' && text.startsWith('【登录身份】') && text.includes('——本行由系统注入')
    })
    if (!hit && sessions.length > 0) {
      for (const candidate of sessions.slice(0, 40)) {
        const scan = await api(`r1-h-${candidate.sessionId}`, 'session.history', { sessionId: candidate.sessionId, maxMessages: 200 })
        const found = (scan?.events ?? []).some((wrapped) => {
          const data = wrapped?.event?.data ?? wrapped?.data
          const text = data?.message?.content?.[0]?.text ?? data?.content?.[0]?.text ?? ''
          return typeof text === 'string' && text.startsWith('【登录身份】') && text.includes('——本行由系统注入')
        })
        if (found) { stampedId = candidate.sessionId; break }
      }
    }
  }
  if (stampedId === undefined) {
    check('D3 存量带尾巴 stamp 会话存在（B2 探针会话）', false, 'no tailed-stamp session in the first 25')
  } else {
    await page.goto(`${BASE}#/chat/${stampedId}`, { waitUntil: 'domcontentloaded' })
    await sleep(2600)
    const folded = await page.evaluate(() => {
      const users = [...document.querySelectorAll('.dshm-bubble-paper-user')].map(b => (b.textContent ?? '').trim())
      const ai = document.querySelector('.dshm-bubble-paper-ai')
      return {
        bubbles: users.length,
        tailed: users.filter(t => t.includes('——本行由系统注入')).length,
        aiFound: ai !== null,
        aiBorder: ai === null ? '' : getComputedStyle(ai).borderTopColor,
      }
    })
    check('D3 N5 回归：带尾巴注入行仍折叠（气泡内无注入尾巴）', folded.tailed === 0, `session=${stampedId.slice(0, 18)}… bubbles=${folded.bubbles} tailed=${folded.tailed}`)
    check('C3 AI 气泡挂全局钩子 dshm-bubble-paper-ai（描边在位）', folded.aiFound && folded.aiBorder !== '', `border=${folded.aiBorder}`)
    await page.screenshot({ path: `${OUT}/w9-r1-05-legacy-tailed-stamp-still-folds-375.png` })
  }
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w9-r1-live-probe.log`, `${LOG.join('\n')}\n`)
console.log(`\nwrote ${OUT}/w9-r1-live-probe.log`)
