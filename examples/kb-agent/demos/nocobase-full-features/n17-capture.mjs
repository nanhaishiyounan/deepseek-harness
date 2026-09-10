/**
 * N17 acceptance screenshot capture: v12-demo alignment surfaces.
 *
 * Saves PNG evidence for the four user asks (plans/nocobase-full-features
 * N17): ① v2 table pages whose action bar carries Add new + the plugin-ai
 * floating ball, ② the Add-new popup with Chinese fields + Submit, ③ the
 * floating-ball ChatBox answering in Chinese (MiniMax-M3), ④ the 应用中心
 * app hub standing in for the commercial multi-portal plugin, plus the two
 * portals defaulting to zh-CN. The chrome-devtools MCP server rejects
 * workspace writes, so Playwright (from apps/web) is the landing channel;
 * interactive verification happened in the MCP-driven browser.
 *
 * Usage: node examples/kb-agent/demos/nocobase-full-features/n17-capture.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'));
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:13000';

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
  // Business pages, not the builder: N17b keeps the UI editor off so the
  // screenshots show the daily-use chrome.
  localStorage.setItem('NOCOBASE_MAIN_DESIGNABLE', 'false');
}, token);
const page = await context.newPage();

async function shot(name, url, { settle = 2500, maxWait = 120_000, ready } = {}) {
  const start = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => console.log(name, 'goto warn:', e.message));
  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(3000);
    if (ready === undefined) break;
    if (await ready()) break;
  }
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(here, `N17-${name}.png`) });
  console.log(`N17-${name}.png saved (${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

const hasRowValue = async () => {
  const cells = await page.locator('.ant-table-tbody .ant-table-row').first().locator('td').allInnerTexts().catch(() => []);
  return cells.slice(1).some((t) => t.trim().length > 0);
};

// ① v2 table page: data + Add new + Refresh + floating ball (Chinese chrome).
await shot('01-crm-customers-v2', `${base}/admin/n170ttrd6avg0w`, { ready: hasRowValue });
await shot('02-hub-tickets-v2', `${base}/admin/n17gv6nc2z51te`, { ready: hasRowValue });

// ② Add-new popup: Chinese form fields + Submit (official wire, N17).
await shot('03-addnew-popup', `${base}/admin/n170ttrd6avg0w`, {
  ready: async () => false, maxWait: 10_000, settle: 0,
}).catch(() => {});
await page.locator('button:has-text("Add new"), button:has-text("新增"), button:has-text("添加")').first().click();
await page.waitForSelector('.ant-tabs-tab', { timeout: 30_000 });
await page.locator('form').waitFor({ state: 'visible', timeout: 30_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(here, 'N17-03-addnew-popup.png') });
console.log('N17-03-addnew-popup.png saved');

// ③ Floating ball → ChatBox → Atlas answers in Chinese (MiniMax-M3).
await page.goto(`${base}/admin/n170ttrd6avg0w`, { waitUntil: 'domcontentloaded' });
await hasRowValue().catch(() => {});
await page.locator('[aria-label="Open AI chat"], [aria-label="打开 AI 对话"], [aria-label*="AI"]').last().click({ timeout: 30_000 }).catch(async () => {
  // Fallback: the floating ball is a fixed-position div at the right edge.
  await page.mouse.click(1580, 940);
});
await page.waitForSelector('textarea', { timeout: 30_000 });
await page.fill('textarea', '请用一句话介绍你能帮食品出口团队做什么？');
await page.keyboard.press('Enter');
// Wait for a Chinese answer beyond the thinking lines (contains 调度/专家/团队).
await page.waitForSelector('text=/调度|专家|团队/', { timeout: 120_000 }).catch(() => console.log('chat wait timed out'));
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(here, 'N17-04-ai-chat-chinese.png') });
console.log('N17-04-ai-chat-chinese.png saved');

// ④ 应用中心 app hub (multi-portal stand-in) with four Chinese cards.
await shot('05-app-hub', `${base}/admin/pwib7kbe2nk`, {
  ready: async () => (await page.locator('a:has-text("CRM 客户门户")').count()) > 0,
});

// ⑤ Portals default to zh-CN for fresh visitors (no storedLocale).
const portal = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const portalPage = await portal.newPage();
for (const [name, url] of [['06-portal-crm', `${base}/dist/crm/`], ['07-portal-hub', `${base}/dist/hub/`]]) {
  await portalPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => console.log(name, 'goto warn:', e.message));
  await portalPage.waitForTimeout(6000);
  await portalPage.screenshot({ path: path.join(here, `N17-${name}.png`) });
  console.log(`N17-${name}.png saved`);
}
await portal.close();

await browser.close();
console.log('n17-capture: done');
