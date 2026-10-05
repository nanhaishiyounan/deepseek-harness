// W10-B1 targeted recheck: DOM evidence for the P0s the probe routes missed —
// chats footer overlap, work-light capsule fade + link color, chat composer
// native border, files card border, composer-face avatar color.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const login = async (page, theme, account = 'qc_inspector', password = 'Qc#2026') => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}
const browser = await chromium.launch()
const out = {}

const probe = async (route, theme, hash, width, fn, account, password) => {
  const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, theme, account, password)
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  await sleep(2200)
  out[route] = await page.evaluate(fn)
  await context.close()
}

// chats: footer overlap — last list row bottom vs nav top
await probe('chats-375-light', 'light', '#/chats', 375, () => {
  const nav = document.querySelector('nav[aria-label="底部导航"]')
  const navTop = nav ? nav.getBoundingClientRect().top : -1
  const rows = [...document.querySelectorAll('body *')].filter((el) => {
    const t = (el.textContent || '').trim()
    return el.children.length === 0 && t.length > 8
  })
  let lowest = null
  for (const el of rows) {
    const r = el.getBoundingClientRect()
    if (r.height > 0 && r.bottom > 0 && (lowest === null || r.bottom > lowest.bottom)) {
      lowest = { text: (el.textContent || '').trim().slice(0, 26), bottom: Math.round(r.bottom), cls: String(el.className).slice(0, 40) }
    }
  }
  const scroller = document.querySelector('[class*=chatsPage], [class*=sessionList], main')
  return {
    navTop: Math.round(navTop),
    lowestText: lowest,
    overlapPx: lowest ? Math.round(lowest.bottom - navTop) : null,
    scrollerCls: scroller ? String(scroller.className).slice(0, 50) : null,
  }
})

// work light: capsule tab last item clipped? + 「去聊聊」 link color
await probe('work-375-light', 'light', '#/work', 375, () => {
  const tabs = [...document.querySelectorAll('.adm-capsule-tabs-tab')].map((el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return { text: (el.textContent || '').trim().slice(0, 10), right: Math.round(r.right), w: Math.round(r.width), bg: s.backgroundColor, color: s.color }
  })
  const list = document.querySelector('.adm-capsule-tabs-header, [class*=capsule]')
  const listRight = list ? Math.round(list.getBoundingClientRect().right) : null
  const listOverflowX = list ? getComputedStyle(list).overflowX : ''
  let link = null
  for (const el of document.querySelectorAll('a, button, [role=button], span')) {
    if ((el.textContent || '').trim() === '去聊聊') {
      const s = getComputedStyle(el)
      link = { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), color: s.color, bg: s.backgroundColor, textDecoration: s.textDecorationLine, radius: s.borderRadius }
      break
    }
  }
  const outset = [...document.querySelectorAll('button')].filter((b) => getComputedStyle(b).border.includes('outset')).length
  return { tabs, listRight, listOverflowX, link, outsetButtons: outset }
})

// chat light: composer textarea native border?
await probe('chat-375-light', 'light', '#/chats', 375, () => {
  const ta = document.querySelector('textarea')
  if (ta === null) return { textarea: null }
  const s = getComputedStyle(ta)
  return {
    textarea: {
      placeholder: ta.placeholder.slice(0, 20), border: s.border, borderRadius: s.borderRadius,
      appearance: s.appearance, outline: s.outline, bg: s.backgroundColor, font: s.fontFamily.slice(0, 50),
    },
  }
})

// files: card container borders (the thick black square frame the VLM saw)
await probe('files-375-light', 'light', '#/files', 375, () => {
  const outset = [...document.querySelectorAll('button')].filter((b) => getComputedStyle(b).border.includes('outset'))
  const shapes = {}
  for (const b of document.querySelectorAll('button')) {
    const s = getComputedStyle(b)
    const key = `${s.borderRadius}|${s.border}`
    shapes[key] = (shapes[key] ?? 0) + 1
  }
  return { outsetCount: outset.length, outsetSample: outset.slice(0, 3).map((b) => ({ cls: String(b.className).slice(0, 60), text: (b.textContent || '').trim().slice(0, 20) })), shapes }
})

// ix-composer-focus: the「表单」avatar color (blue leak?)
await probe('ix-composer-focus-375-light', 'light', '#/home', 375, () => {
  const hits = []
  for (const el of document.querySelectorAll('body *')) {
    const t = (el.textContent || '').trim()
    if (/^(表单|合规|数据|AI)$/.test(t) && el.children.length === 0) {
      let node = el
      for (let i = 0; i < 3 && node && hits.length < 8; i++) {
        const s = getComputedStyle(node)
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          hits.push({ text: t.slice(0, 6), hop: i, bg: s.backgroundColor, color: s.color, cls: String(node.className).slice(0, 40) })
          break
        }
        node = node.parentElement
      }
    }
  }
  return { tabBadges: hits }
})

await browser.close()
writeFileSync('demos/acceptance-w10/.w10-b1-recheck.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1).slice(0, 4200))
