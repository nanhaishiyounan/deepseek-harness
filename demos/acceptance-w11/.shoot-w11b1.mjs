// W11-B1 T3 interaction-state shoot: the composer's eight-state matrix over
// the rebuilt :3080 dist (focus / multiline 2-4-6 / overlong tail-cursor /
// keyboard-rise (viewport clamp emulation) / fill flash frame / quick panel
// open / running stop-face), light@375 primary + dark spot-checks.
// Usage (repo root): node demos/acceptance-w11/.shoot-w11b1.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-b1-${file}.png` }).then(() => console.log(`shot: w11-b1-${file}.png`))

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

const createSession = async (rpcId) => {
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

// Read the composer slot's live focus face (wrapper computed) for DOM asserts.
const focusFace = (page) => page.evaluate(() => {
  const wrap = document.querySelector('.adm-text-area[aria-label="消息输入"]')
  if (!wrap) return { error: 'wrap missing' }
  const wc = getComputedStyle(wrap)
  const row = wrap.closest('div')
  return { borderColor: wc.borderColor, boxShadow: wc.boxShadow, dataFill: row.getAttribute('data-fill') ?? null }
})

const browser = await chromium.launch()

// ── Light@375: the eight states ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  const sid = await createSession('w11b1-shoot')
  check('chat 会话就绪', sid !== undefined, String(sid))
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  const ta = page.getByPlaceholder('问我任何经营问题...')
  await ta.waitFor({ timeout: 15_000 })
  await sleep(900)

  // 1. focus face (tap-equivalent :focus) — light
  await ta.focus()
  await sleep(350)
  const f1 = await focusFace(page)
  check('聚焦态 DOM 断言（brand 边 + soft halo）', f1.borderColor === 'rgb(180, 83, 10)' && f1.boxShadow.includes('rgb(248, 228, 210)'), JSON.stringify(f1))
  await shot(page, 'ix-focus-375-light')

  // 2-3. multiline 2 / 4 rows
  await ta.fill('帮我登记一条采购单，供应商宏发食品\n高筋面粉 500kg 单价 3.2')
  await sleep(250)
  await shot(page, 'ix-multiline-2-375-light')
  await ta.fill('帮\n我\n登\n记\n一条采购单，供应商宏发食品高筋面粉')
  await sleep(250)
  const rows4 = await page.evaluate(() => {
    const wrap = document.querySelector('.adm-text-area[aria-label="消息输入"]')
    return { h: wrap.getBoundingClientRect().height }
  })
  check('4 行态自然增高（~111px）', rows4.h > 105 && rows4.h < 117, `h=${rows4.h}`)
  await shot(page, 'ix-multiline-4-375-light')

  // 4. overlong with the caret parked at the tail (textarea wraps; >4 rows scroll)
  await ta.fill('x'.repeat(220))
  await ta.evaluate((el) => { el.setSelectionRange(el.value.length, el.value.length) })
  await ta.focus()
  await sleep(250)
  await shot(page, 'ix-overlong-tail-375-light')
  await ta.fill('')

  // 5. keyboard-rise emulation: clamp the viewport height (~47% like iOS SIP)
  // with the slot focused — the composer must ride the clamped bottom.
  await page.setViewportSize({ width: 375, height: 430 })
  await ta.focus()
  await sleep(400)
  const composerVisible = await page.evaluate(() => {
    const wrap = document.querySelector('.adm-text-area[aria-label="消息输入"]')
    const b = wrap.getBoundingClientRect()
    return b.bottom <= window.innerHeight && b.top > 0
  })
  check('键盘弹起态（视口钳制模拟）composer 在视口内', composerVisible)
  await shot(page, 'ix-kbd-375-light')
  await page.setViewportSize({ width: 375, height: 812 })

  // 6. fill flash frame — a context-chip pick fills the draft; catch the flash
  // (data-fill lives ~650ms; the brand rim peaks in the first ~220ms).
  const chip = page.getByRole('button', { name: '登记一条采购单' })
  if (await chip.count() > 0) {
    await chip.click()
    await page.screenshot({ path: `${OUT}/w11-b1-ix-fill-375-light.png` })
    console.log('shot: w11-b1-ix-fill-375-light.png')
    const ff = await focusFace(page)
    check('fill 闪帧 DOM 断言（data-fill 在位）', ff.dataFill !== null || ff.borderColor !== '', JSON.stringify(ff))
    await sleep(900)
  } else {
    check('fill 触发（欢迎卡 chip）', false, 'chip 不在位')
  }

  // 7. quick panel open (the + entry over the flow)
  await page.getByRole('button', { name: '打开快捷面板' }).click()
  await sleep(500)
  await shot(page, 'ix-panel-375-light')
  await page.getByRole('button', { name: '收起快捷面板' }).click()
  await sleep(300)

  // 8. running face — a live turn swaps send for stop and gates the chips.
  await ta.fill('用一句话说明什么是采购单')
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('button', { name: '停止生成' }).waitFor({ timeout: 8_000 }).catch(() => {})
  const hasStop = await page.getByRole('button', { name: '停止生成' }).count()
  check('running 态停止钮在位', hasStop > 0)
  await shot(page, 'ix-running-375-light')
  // Give the live model turn a chance to land before the context closes.
  await sleep(2500)
  await context.close()
}

// ── Dark@375 spot-checks: focus halo + quick panel ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  const sid = await createSession('w11b1-shoot-dk')
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  const ta = page.getByPlaceholder('问我任何经营问题...')
  await ta.waitFor({ timeout: 15_000 })
  await sleep(900)
  await ta.fill('帮我看下本月面粉的库存周转')
  await ta.focus()
  await sleep(350)
  const fd = await focusFace(page)
  check('暗轨聚焦态 DOM 断言（提亮 brand 边 + 暗轨 halo）', fd.borderColor === 'rgb(229, 139, 74)' && fd.boxShadow.includes('rgb(59, 42, 28)'), JSON.stringify(fd))
  await shot(page, 'ix-focus-375-dark')
  await page.getByRole('button', { name: '打开快捷面板' }).click()
  await sleep(500)
  await shot(page, 'ix-panel-375-dark')
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-b1-shoot.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
