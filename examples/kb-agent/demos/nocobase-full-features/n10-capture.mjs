/**
 * N10 final-acceptance screenshot capture.
 *
 * Replays the pages already verified interactively via chrome-devtools MCP and
 * saves PNG evidence to this directory (N10-*.png). The MCP server rejects
 * writes into the workspace, so Playwright (from apps/web) is the landing
 * channel; interactive verification happened in the MCP-driven browser.
 *
 * Usage: node examples/kb-agent/demos/nocobase-full-features/n10-capture.mjs
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

/** Wait until main content grows past a bare page title, then screenshot. */
async function shot(name, url, { settle = 2500, maxWait = 120_000 } = {}) {
  const start = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => console.log(name, 'goto warn:', e.message));
  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(3000);
    const main = page.locator('main').last();
    const len = (await main.innerText().catch(() => '')).replace(/\s/g, '').length;
    if (len > 30) break;
  }
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(here, `N10-${name}.png`) });
  console.log(`N10-${name}.png saved (${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

// A/B7: existing business page (business menu group + experts table)
await shot('01-experts', `${base}/admin/c8rl4krpqqx`);

// B1: add-block menu with Map/Comment/Charts/Gantt entries
await page.locator('button[aria-label="UI Editor"], button[title="UI Editor"]').first().click({ timeout: 30_000 }).catch((e) => console.log('ui-editor click warn:', e.message));
await page.waitForTimeout(1500);
await page.locator('button[class*="page:addBlock"]').first().click({ timeout: 30_000 }).catch((e) => console.log('addBlock click warn:', e.message));
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(here, 'N10-02-add-block-menu.png') });
console.log('N10-02-add-block-menu.png saved');
await page.keyboard.press('Escape').catch(() => {});

// B2: CRM chain
await shot('03-leads-kanban', `${base}/admin/glv9vz8cmzi`);
await shot('04-customers', `${base}/admin/w8xjw5rhffx`);
await shot('05-quotes', `${base}/admin/1yokej2tzn1`);
await shot('06-orders', `${base}/admin/h389cqvl33n`);

// B3: Hub four task views + workbench
await shot('07-tasks-kanban', `${base}/admin/2ukpkfhm7ov`);
await shot('08-tasks-table', `${base}/admin/pp1het6gicb`);
await shot('09-tasks-calendar', `${base}/admin/ux7pboxir62`);
await shot('10-tasks-gantt', `${base}/admin/983gipocvrr`);
await shot('11-workbench', `${base}/admin/wkg7n0midsr`);

// B6: portals — deep links have no SPA fallback, so enter at the root and let
// the SPA land on its default page (dashboard / overview).
await shot('12-portal-crm-dashboard', `${base}/dist/crm/`, { settle: 6000 });
await shot('13-portal-hub-overview', `${base}/dist/hub/`, { settle: 6000 });

// B5: AI chat panel with the N10 atlas round (history conversation)
await page.goto(`${base}/dist/crm/`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(6000);
await page.locator('button[aria-label="Open AI chat"]').first().click({ timeout: 30_000 }).catch((e) => console.log('chat open warn:', e.message));
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Conversation list"], button:has-text("Conversation list")').first().click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.locator('[role="menuitem"], [class*="conversation"] li, [class*="conversation-item"]').first().click({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(here, 'N10-14-atlas-chat.png') });
console.log('N10-14-atlas-chat.png saved');

await browser.close();
console.log('capture done');
