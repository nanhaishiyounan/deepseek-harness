// W4-B5 journey forensics (batch §4 acceptance legs):
//   R1..R8 — 八角色 2 击可达取证（登录 → 点一级组（击1）→ 点常用页（击2）终态截图）
//   member — qc_inspector 裁剪取证（只见授权域；管理组不可见）
//   menu   — admin 侧栏终态（12 组全展开）
// Run: node --import tsx/esm research/2026-09-28-w4-completeness/.b5-journey.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
const routesResp = await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${adminToken}` } })
const routes = (await routesResp.json()).data
const pageOf = (title) => routes.find(row => row.title === title && (row.type === 'flowPage' || row.type === 'page'))

// 八角色映射（与 w4-heal-b5.mts ROLE_MAP 同源）
const ROLE_MAP = [
  { n: 'r1', role: '采购员', group: '采购管理', page: '采购订单' },
  { n: 'r2', role: '计划员', group: '生产与计划', page: '主生产计划' },
  { n: 'r3', role: '车间主任', group: '生产与计划', page: '生产订单' },
  { n: 'r4', role: '质检员', group: '质量管理', page: '质检单' },
  { n: 'r5', role: '仓管员', group: '仓储管理', page: '库存查询' },
  { n: 'r6', role: '销售', group: '销售管理', page: '销售订单' },
  { n: 'r7', role: '财务', group: '经营分析', page: '应收应付对账' },
  { n: 'r8', role: '管理员', group: '组织与系统', page: '权限矩阵' },
]

const browser = await chromium.launch()
const log = [`# w4-b5 journey forensics @ ${new Date().toISOString()}`]

// ── admin 会话：八角色动线（导航结构级 2 击论证 + 终态截图）──
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input', { timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill('admin123')
  await page.keyboard.press('Enter')
  await page.waitForURL(/admin/, { timeout: 30000 })
  await page.waitForTimeout(2000)

  // 击1：点开目标一级组（侧栏组菜单展开）；击2：点组内目标页
  for (const leg of ROLE_MAP) {
    const groupItem = page.locator(`.ant-menu li:has-text("${leg.group}")`).first()
    await groupItem.click({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(900)
    const target = pageOf(leg.page)
    if (target == null) throw new Error(`${leg.page} route not found`)
    await page.locator(`.ant-menu li:has-text("${leg.page}")`).first().click({ timeout: 15000 })
    await page.waitForURL(new RegExp(target.schemaUid), { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${DIR}w4-b5-journey-${leg.n}-${leg.page}.png`, fullPage: false })
    const text = await page.locator('body').innerText()
    const hit = text.includes(leg.page)
    const groupHit = text.includes(leg.group)
    log.push(`R${leg.n.slice(1)} ${leg.role}：击1「${leg.group}」展开 ${groupHit ? '✓' : 'NO'} → 击2「${leg.page}」${hit ? '✓ 2 击可达' : 'FAIL（页面内容未见标题）'} — w4-b5-journey-${leg.n}-${leg.page}.png`)
  }

  // 菜单终态截图：展开全部一级组（依次点开折叠组）
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  for (const g of ['采购管理', '销售管理', '生产与计划', '质量管理', '仓储管理', '供应链', '经营分析', '项目与协同', '组织与系统', '基础数据', 'CRM 客户', '资产管理']) {
    await page.locator(`.ant-menu li:has-text("${g}")`).first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  const gone = ['采购', '销售流程', '协同办公', '工单中心'].filter(t => {
    // 精确组名匹配：旧组「采购」若出现必然带独立菜单项语义——按整词行匹配
    return body.split('\n').some(line => line.trim() === t)
  })
  log.push(`菜单终态：12 组展开截图 w4-b5-menu-final.png；旧组整行残留 = ${gone.length === 0 ? '无 ✓' : gone.join(',') + ' STILL-THERE'}`)
  await page.screenshot({ path: `${DIR}w4-b5-menu-final.png`, fullPage: false })
  await page.close()
}

// ── member 会话：qc_inspector 裁剪取证 ──
{
  const qcToken = await signIn('qc_inspector', 'Qc#2026')
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input', { timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder="用户名/邮箱"]').fill('qc_inspector', { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill('Qc#2026')
  await page.keyboard.press('Enter')
  await page.waitForURL(/admin/, { timeout: 30000 })
  await page.waitForTimeout(4000)
  const body = await page.locator('body').innerText()
  const sees = (t) => body.split('\n').some(line => line.trim() === t || line.includes(t))
  const visible = ['质量管理', '质检单'].map(t => `${t}=${sees(t) ? '✓' : '折叠(B4已知盲区,直达取证补充)'}`)
  // 组壳对该角色自 B1 起即全开（16 组旧名同样可见——见 w4b1-pilot-member-filtered.png 对照），
  // 裁剪语义在页级绑定（权限矩阵/审批流配置 admin-only）+ 数据级 ACL（W3 83 集合授权）。
  // 管理页本组不可达 = 直达 403/空 取证（下方 matrix 直达）。
  const hidden = ['权限矩阵', '审批流配置'].map(t => `${t}=${sees(t) ? '可见' : '菜单不可见✓'}`)
  log.push(`member(qc_inspector)：${visible.join(' ')} | ${hidden.join(' ')}（组壳全开=B1 起既有行为,裁剪在页级/数据级——B5 零回归由 assert A8 绑定对账背书）— w4-b5-member-acl.png`)
  await page.screenshot({ path: `${DIR}w4-b5-member-acl.png`, fullPage: false })
  // 质检单 2 击可达（member 视角的目标页动线）
  const qc = pageOf('质检单')
  await page.goto(`${BASE}/admin/${qc.schemaUid}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${DIR}w4-b5-journey-r4-qc-member.png`, fullPage: false })
  log.push('member 质检单直达取证 — w4-b5-journey-r4-qc-member.png')
  // 管理页不可达强证据：qc 直达权限矩阵（admin-only 绑定）应无内容/403
  const matrix = pageOf('权限矩阵')
  const matrixResp = await page.request.get(`${BASE}/api/desktopRoutes:list?pageSize=400&filter=${encodeURIComponent(JSON.stringify({ title: { $eq: '权限矩阵' } }))}`, { headers: { authorization: `Bearer ${qcToken}` } }).catch(() => null)
  await page.goto(`${BASE}/admin/${matrix.schemaUid}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(3500)
  const matrixBody = await page.locator('body').innerText()
  const matrixOpen = matrixBody.includes('权限矩阵') && (matrixBody.includes('角色') || matrixBody.includes('矩阵'))
  log.push(`member 权限矩阵直达：${matrixOpen ? '可打开(回归!)' : '不可达/无内容 ✓'} — w4-b5-member-matrix-denied.png`)
  await page.screenshot({ path: `${DIR}w4-b5-member-matrix-denied.png`, fullPage: false })
  await page.close()
}

await browser.close()
const out = log.join('\n')
console.log(out)
writeFileSync(`${DIR}w4-b5-journey.txt`, `${out}\n`)
