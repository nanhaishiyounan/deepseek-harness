// W10-B3 DOM cross-verification: computed-style assertions over the P0 fix
// set on the rebuilt :3080 gateway — (a) no UA button outset/borders anywhere,
// (b) the dark-track capsule tab fill rides the dark dial (no #f5f5f5), (c) the
// industrial blue rgb(30,78,140) has zero computed hits on sampled surfaces,
// (d) the roster cards hold their natural height, (e) the composer slot is
// rounded, (f) the capsule tab list is scrollable when it overflows.
// Usage (repo root): node demos/acceptance-w10/.dom-verify-w10b3.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })

const login = async (theme) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

// (a)(c)(d) home light: buttons, roster, industrial blue sweep
await login('light')
await page.goto(`${BASE}#/home`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
let probe = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')]
  const outset = buttons.filter((el) => {
    const s = getComputedStyle(el)
    return s.borderStyle === 'outset' || (s.borderWidth !== '0px' && s.borderStyle !== 'none' && el.matches('.dshm-root button') === false)
  })
  const rosterCards = [...document.querySelectorAll('[aria-label="AI 同事"] button')]
  const rosterHeights = rosterCards.map((el) => Math.round(el.getBoundingClientRect().height))
  // Sweep every element's colors for the industrial blue on this surface.
  const blue = []
  for (const el of document.querySelectorAll('.dshm-root *')) {
    const s = getComputedStyle(el)
    if (s.color === 'rgb(30, 78, 140)' || s.backgroundColor === 'rgb(30, 78, 140)') blue.push(el.className)
  }
  const badge = document.querySelector('[class*="alertBadge"] .adm-badge-content, [class*="alertBadge"]')
  return {
    buttonCount: buttons.length,
    outsetCount: outset.length,
    outsetSamples: outset.slice(0, 3).map((el) => `${el.className}:${getComputedStyle(el).borderStyle}`),
    rosterCount: rosterCards.length,
    rosterHeights,
    blueHits: blue.length,
    badgeText: badge?.textContent ?? null,
    badgeColor: badge !== null ? getComputedStyle(badge).color : null,
  }
})
check('home buttons: zero UA outset borders', probe.outsetCount === 0, `${probe.buttonCount} buttons, outset=${probe.outsetCount} ${probe.outsetSamples.join('|')}`)
check('home roster: natural card heights', probe.rosterCount > 0 && probe.rosterHeights.every((h) => h >= 70), `${probe.rosterCount} cards, heights=${probe.rosterHeights.join(',')}`)
check('home: industrial blue zero computed hits', probe.blueHits === 0, `hits=${probe.blueHits}`)

// (e) composer slot radius on chat — verified further below after opening a row

// (b) dark capsule tabs + composer radius
await login('dark')
await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
await page.waitForTimeout(2000)
const work = await page.evaluate(() => {
  const tab = document.querySelector('.adm-capsule-tabs-tab')
  const list = document.querySelector('.adm-capsule-tabs-tab-list')
  const tabStyle = tab !== null ? getComputedStyle(tab) : null
  const blue = []
  for (const el of document.querySelectorAll('.dshm-root *')) {
    const s = getComputedStyle(el)
    if (s.color === 'rgb(30, 78, 140)' || s.backgroundColor === 'rgb(30, 78, 140)') blue.push(String(el.className))
  }
  return {
    tabBg: tabStyle?.backgroundColor ?? null,
    tabColor: tabStyle?.color ?? null,
    tabFont: tabStyle?.fontSize ?? null,
    listOverflowX: list !== null ? getComputedStyle(list).overflowX : null,
    listScrollable: list !== null ? list.scrollWidth > list.clientWidth : null,
    blueHits: blue.length,
  }
})
check('work dark: capsule fill is the dark dial', work.tabBg !== null && work.tabBg !== 'rgb(245, 245, 245)', `bg=${work.tabBg}`)
check('work dark: capsule words readable', work.tabColor !== null && work.tabColor !== 'rgb(245, 245, 245)', `color=${work.tabColor}`)
check('work capsule list scrollable on overflow', work.listOverflowX === 'scroll' || work.listScrollable === false, `overflowX=${work.listOverflowX} scrollable=${work.listScrollable}`)
check('work dark: capsule caption grade', work.tabFont === '12px', `font=${work.tabFont}`)
check('work dark: industrial blue zero computed hits', work.blueHits === 0, `hits=${work.blueHits}`)

// (d-dark) the dark-track roster stamp ink on home dark
await page.goto(`${BASE}#/home`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const homeDark = await page.evaluate(() => {
  const avatar = document.querySelector('[aria-label="AI 同事"] button [class*="avatar"]')
  const badgeFace = document.querySelector('[class*="alertBadge"].adm-badge') ?? document.querySelector('[class*="alertBadge"] .adm-badge')
  const badgeWord = document.querySelector('[class*="alertBadge"] .adm-badge-content')
  return {
    avatarColor: avatar !== null ? getComputedStyle(avatar).color : null,
    badgeFace: badgeFace !== null ? getComputedStyle(badgeFace).backgroundColor : null,
    badgeColor: badgeWord !== null ? getComputedStyle(badgeWord).color : null,
  }
})
check('home dark: alert badge face is the lifted danger', homeDark.badgeFace === 'rgb(239, 128, 120)', `face=${homeDark.badgeFace}`)
check('home dark: stamp ink is paper white', homeDark.avatarColor === 'rgb(255, 248, 238)', `color=${homeDark.avatarColor}`)
check('home dark: alert badge deep words on lifted danger', homeDark.badgeColor === 'rgb(36, 23, 8)', `color=${homeDark.badgeColor}`)

// (e) composer radius — open a chat through the chats list
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await page.click('[class*="sessionRow"]')
await page.waitForSelector('.adm-text-area', { timeout: 15_000 })
await page.waitForTimeout(1200)
const composer = await page.evaluate(() => {
  const slot = document.querySelector('.adm-text-area')
  if (slot === null) return { radius: null }
  return { radius: getComputedStyle(slot).borderRadius }
})
check('chat composer: capsule radius on the slot', composer.radius !== null && composer.radius !== '0px', `radius=${composer.radius}`)

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\nw10-b3 dom verify: ${results.length - failed.length}/${results.length} pass${failed.length === 0 ? ' — ALL PASS' : ` — FAILED: ${failed.map((r) => r.name).join(', ')}`}`)
process.exit(failed.length === 0 ? 0 : 1)
