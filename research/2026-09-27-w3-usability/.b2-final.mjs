// W3-B2 final evidence: (1) the confirm-gated Delete dialog on a free-state
// collection (cancelled — no data destroyed); (2) the member perspective on a
// subtable drawer (quality_lead reads the inspection readings; write-class
// buttons must be narrowed away).
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/nocobase'
const API = 'http://127.0.0.1:13000'
const signInAs = async (account, password) => {
  const res = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  return (await res.json())?.data?.token
}
const browser = await chromium.launch()

// 1) Delete confirm dialog (admin, crm_contacts first row; CANCEL at the end).
{
  const token = await signInAs('admin@nocobase.com', 'admin123')
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
  await page.goto(`${BASE}/admin/n17f3gnpjv8rfd85`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('.ant-table-row', { timeout: 60_000 }).catch(() => {})
  // 采购联系人（历史）page is a legacy v2 page; the seeded free-state rows live
  // on the crm contacts table — fall back by finding any 删除 action in sight.
  let deleteBtn = page.locator('.ant-table-row').first().locator('button:has-text("删除"), a:has-text("删除")').first()
  if ((await page.locator('.ant-table-row').count()) === 0 || (await deleteBtn.count()) === 0) {
    // 任务列表 carries the Delete too (hub_pj_tasks free-state rows).
    await page.goto(`${BASE}/admin/n17e11csgtbr0w3x`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
    await page.waitForTimeout(800)
    deleteBtn = page.locator('.ant-table-row').first().locator('button:has-text("删除"), a:has-text("删除")').first()
  }
  const rowCount = await page.locator('.ant-table-row').count()
  const actionsText = (await page.locator('.ant-table-row').first().innerText()).replace(/\s+/g, ' ').slice(-60)
  if ((await deleteBtn.count()) > 0) {
    await deleteBtn.click()
    await page.waitForTimeout(1200)
    const modal = page.locator('.ant-modal, .ant-popconfirm, .ant-modal-confirm').first()
    const modalText = (await modal.count()) > 0 ? (await modal.innerText()).replace(/\s+/g, ' ').slice(0, 120) : '(no dialog)'
    await page.screenshot({ path: 'research/2026-09-27-w3-usability/w3-b2-delete-confirm.png' })
    console.log(`DELETE-CONFIRM dialog=${JSON.stringify(modalText)} rowActions=${JSON.stringify(actionsText)}`)
    // Cancel — never destroy data in forensics.
    const cancel = page.locator('.ant-modal .ant-btn, .ant-popover .ant-btn').filter({ hasText: /取消|否|Cancel/ }).first()
    if ((await cancel.count()) > 0) await cancel.click()
    await page.waitForTimeout(600)
    const afterCount = await page.locator('.ant-table-row').count()
    console.log(`DELETE-CANCELLED rowsBefore=${rowCount} rowsAfter=${afterCount}`)
  } else {
    console.log(`DELETE no 删除 action visible on the row (actions=${JSON.stringify(actionsText)})`)
    await page.screenshot({ path: 'research/2026-09-27-w3-usability/w3-b2-delete-absent.png' })
  }
  await page.close()
}

// 2) member perspective: quality_lead opens the inspection drawer (readings visible).
{
  const token = await signInAs('quality_lead@w2b5.demo', 'Quality#2026')
  if (typeof token !== 'string' || token.length === 0) throw new Error('quality_lead sign-in failed')
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
  await page.goto(`${BASE}/admin/w8qmjvyv8p5j7j`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
  await page.waitForTimeout(800)
  let row = page.locator('.ant-table-row', { hasText: 'QI-2026-0010' }).first()
  for (let pageNo = 1; (await row.count()) === 0 && pageNo < 5; pageNo += 1) {
    const next = page.locator('.ant-pagination-next').first()
    if ((await next.count()) === 0 || (await next.getAttribute('aria-disabled')) === 'true') break
    await next.click()
    await page.waitForTimeout(1200)
    row = page.locator('.ant-table-row', { hasText: 'QI-2026-0010' }).first()
  }
  if ((await row.count()) === 0) {
    console.log('MEMBER row not found')
  } else {
    const actionsText = (await row.innerText()).replace(/\s+/g, ' ').slice(-70)
    await row.locator('a:has-text("查看"), button:has-text("查看")').first().click()
    await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
    await page.waitForTimeout(2500)
    const drawer = page.locator('.ant-drawer-content').last()
    const tables = drawer.locator('.ant-table')
    const counts = []
    for (let i = 0; i < await tables.count(); i += 1) counts.push(await tables.nth(i).locator('.ant-table-row').count())
    await page.screenshot({ path: 'research/2026-09-27-w3-usability/w3-b2-member-qm-insp-drawer.png' })
    console.log(`MEMBER quality_lead subtables=${await tables.count()} rows=[${counts.join(',')}] rowActions=${JSON.stringify(actionsText)}`)
  }
  await page.close()
}
await browser.close()
