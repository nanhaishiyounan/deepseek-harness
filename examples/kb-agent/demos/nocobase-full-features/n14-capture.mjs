/**
 * N14 acceptance screenshot capture: admin table pages with cell values.
 *
 * Replays the five verified table pages (experts / CRM customers / CRM
 * quotes / hub tickets / AI workbench) and saves PNG evidence to this
 * directory (N14-*.png). The chrome-devtools MCP server rejects writes
 * into the workspace, so Playwright (from apps/web) is the landing
 * channel; interactive verification happened in the MCP-driven browser.
 *
 * Usage: node examples/kb-agent/demos/nocobase-full-features/n14-capture.mjs
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
await context.addInitScript((t) => localStorage.setItem('NOCOBASE_TOKEN', t), token);
const page = await context.newPage();

/**
 * Wait until the first table row carries a non-index cell value, then
 * screenshot — N14's acceptance bar is visible cell values, not just a
 * rendered frame.
 */
async function shot(name, url, { settle = 2500, maxWait = 120_000 } = {}) {
  const start = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => console.log(name, 'goto warn:', e.message));
  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(3000);
    const row = page.locator('.ant-table-tbody .ant-table-row').first();
    const cells = await row.locator('td').allInnerTexts().catch(() => []);
    const hasValue = cells.slice(1).some((t) => t.trim().length > 0);
    if (hasValue) break;
  }
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(here, `N14-${name}.png`) });
  console.log(`N14-${name}.png saved (${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

await shot('01-experts', `${base}/admin/c8rl4krpqqx`);
await shot('02-crm-customers', `${base}/admin/au68dxqrell`);
await shot('03-crm-quotes', `${base}/admin/n89llwk9xhx`);
await shot('04-hub-tickets', `${base}/admin/10xmp7hfhcv`);
await shot('05-ai-workbench', `${base}/admin/sdia2fwjc22`);

await browser.close();
console.log('N14 capture done');
