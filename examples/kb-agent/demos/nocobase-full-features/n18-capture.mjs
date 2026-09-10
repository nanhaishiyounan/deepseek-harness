/**
 * N18 acceptance capture: form-level AI fill in the Add-new popup.
 *
 * Saves PNG evidence for the N18 fix (plans/nocobase-full-features N18): ①
 * the popup form now carries the official AI-employee button (AIEmployeeButton
 * on CreateFormModel.actions, wired by nocobase-n18-form-ai.mts), ② typing a
 * free-form Chinese intent makes Dex (MiniMax-M3) call the frontend formFiller
 * tool and populate the form fields in Chinese, ③ the filled values submit
 * into crm_customes and a follow-up list request shows the row (then cleaned
 * up). The chrome-devtools MCP server rejects workspace writes, so Playwright
 * (from apps/web) is the landing channel, same as n17-capture.mjs.
 *
 * Usage: node examples/kb-agent/demos/nocobase-full-features/n18-capture.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'));
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:13000';
const customersPage = `${base}/admin/n170ttrd6avg0w`;
const intent = '漯河一家中型调味品企业，名叫卫味轩食品，行业是调味品生产，A 级客户，状态潜在，类型工厂';

const signin = await fetch(`${base}/api/auth:signIn`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
});
const token = (await signin.json())?.data?.token;
if (!token) throw new Error('sign-in returned no token');
console.log('sign-in OK');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript((t) => {
  localStorage.setItem('NOCOBASE_TOKEN', t);
  localStorage.setItem('NOCOBASE_MAIN_DESIGNABLE', 'false');
}, token);
const page = await context.newPage();

// ① Open the Add-new popup — the Dex avatar button sits in the drawer footer.
await page.goto(customersPage, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.locator('button:has-text("添加")').first().click({ timeout: 30_000 });
await page.locator('form').waitFor({ state: 'visible', timeout: 30_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(here, 'N18-01-form-ai-button.png') });
console.log('N18-01-form-ai-button.png saved');

// ② Click the in-drawer AI avatar, type the intent, wait for formFiller.
const avatar = page.locator('.ant-drawer-content .ant-avatar').last();
await avatar.click({ timeout: 15_000 });
await page.waitForSelector('.ant-drawer-content textarea, textarea', { timeout: 15_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(here, 'N18-02-ai-panel-open.png') });
console.log('N18-02-ai-panel-open.png saved');

const box = page.locator('textarea:visible').last();
await box.fill(intent);
await box.press('Enter');
// Wait for the name input inside the popup form to receive a value (formFiller
// writes through setFieldsValue), then settle for the remaining selects.
// MiniMax-M3 needs the reasoning pass before the formFiller call — observed
// end-to-end latency runs 15-100+s, so poll for up to 150s.
let filled = false;
for (let i = 0; i < 75 && !filled; i++) {
  await page.waitForTimeout(2000);
  const values = await page.locator('.ant-drawer-content form input').evaluateAll((els) => els.map((el) => el.value).filter((v) => v && v.trim()));
  filled = values.some((v) => v.includes('卫味轩'));
}
if (!filled) throw new Error('formFiller did not populate the form within 150s (check llmServices + dex employee)');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(here, 'N18-03-ai-filled-chinese.png') });
console.log('N18-03-ai-filled-chinese.png saved');

// ③ Submit the AI-filled form and confirm the row landed in crm_customers.
// The two-CJK-char button renders as "提 交" (spaced), so match on the primary
// button instead of the exact literal.
await page.locator('.ant-drawer-content button.ant-btn-primary').first().click();
await page.waitForTimeout(3000);
const list = await fetch(`${base}/api/crm_customers:list?filter=${encodeURIComponent(JSON.stringify({ name: { $eq: '卫味轩食品' } }))}&pageSize=1`, {
  headers: { authorization: `Bearer ${token}` },
});
const rows = (await list.json())?.data ?? [];
if (rows.length === 0) throw new Error('submitted row 卫味轩食品 not found in crm_customers');
console.log(`db round-trip OK: crm_customers row ${rows[0].id} (industry=${rows[0].industry}, level=${rows[0].level}, status=${rows[0].status})`);
await page.screenshot({ path: path.join(here, 'N18-04-submitted-row.png') });
console.log('N18-04-submitted-row.png saved');

// Cleanup the acceptance row so verify's data floors stay seed-owned.
const destroy = await fetch(`${base}/api/crm_customers:destroy?filterByTk=${rows[0].id}`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
});
console.log(`cleanup: destroy HTTP ${destroy.status}`);

await browser.close();
console.log('n18-capture: done');
