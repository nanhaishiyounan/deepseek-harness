/**
 * N10 portal re-capture: the portal SDK authenticates via cookies, so sign in
 * same-origin first (server sets the session cookie), then screenshot the two
 * portals and the AI chat panel with the N10 atlas round.
 *
 * Usage: node examples/kb-agent/demos/nocobase-full-features/n10-portal-capture.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'));
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:13000';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

// Land on origin once, then sign in same-origin so NocoBase sets session cookies.
await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
const token = await page.evaluate(async () => {
  const r = await fetch('/api/auth:signIn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  });
  const body = await r.json().catch(() => null);
  localStorage.setItem('NOCOBASE_TOKEN', body?.data?.token ?? '');
  return body?.data?.token ?? '';
});
if (!token) throw new Error('portal capture: sign-in returned no token');
console.log('sign-in OK (cookie + token set)');

/**
 * Deep links under /dist/<portal>/... have no server-side SPA fallback, so each
 * capture enters at the portal root and navigates inside the SPA instead.
 */
async function shot(name, url, linkText, settle = 6000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => console.log(name, 'goto warn:', e.message));
  await page.waitForTimeout(settle);
  if (linkText) {
    await page.locator(`a:has-text("${linkText}")`).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: path.join(here, `N10-${name}.png`) });
  const heading = await page.locator('h1, h2').first().innerText().catch(() => '');
  console.log(`N10-${name}.png saved (url: ${page.url().slice(-40)}, heading: ${heading.slice(0, 30)})`);
}

await shot('12-portal-crm-dashboard', `${base}/dist/crm/`, 'Dashboard');
await shot('13-portal-hub-overview', `${base}/dist/hub/`, null);

// AI chat panel: reopen and pull the N10 atlas conversation from the history list.
await page.goto(`${base}/dist/crm/`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(6000);
await page.locator('button[aria-label="Open AI chat"]').first().click({ timeout: 30_000 }).catch((e) => console.log('chat open warn:', e.message));
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Conversation list"], button:has-text("Conversation list")').first().click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(2000);
// The freshest conversation entry contains the N10 question about food-export leads.
const entry = page.locator('[class*="conversation"] li, [class*="conversation-item"], [role="menuitem"]').first();
await entry.click({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(here, 'N10-14-atlas-chat.png') });
console.log('N10-14-atlas-chat.png saved');

await browser.close();
console.log('portal capture done');
