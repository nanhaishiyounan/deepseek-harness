/**
 * D1-D6 third-round acceptance browser capture through the 3080 gateway.
 * Saves PNG evidence for scenarios A (deep link, list, detail), B (AI-employee
 * assignee picker + save + belongsTo list render), C5 (crm deep link), D (brand
 * home pages). Read-only browsing plus re-saving the same assignee value;
 * no destructive operations.
 *
 * Usage: node examples/kb-agent/demos/acceptance-verify/capture-shots.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'));
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://localhost:3080';

const step = (msg) => console.log(`[capture] ${msg}`);

const signin = await fetch(`${base}/nocobase/api/auth:signIn`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
});
const token = (await signin.json())?.data?.token;
if (!token) throw new Error('sign-in returned no token');
step('signed in, token acquired');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' });
await context.addInitScript((t) => {
  localStorage.setItem('NOCOBASE_TOKEN', t);
}, token);
const page = await context.newPage();
page.setDefaultTimeout(20000);

const snap = async (id) => {
  await page.screenshot({ path: path.join(here, `${id}.png`) });
  step(`saved ${id}.png`);
};
const goto = async (url) => {
  step(`goto ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
};

// Scenario A: my-tasks deep link (empty state for admin), projects list, project detail.
await goto(`${base}/nocobase/dist/hub/my-tasks`);
await page.waitForTimeout(3000);
await snap('scenario-a-mytasks-deeplink-empty-state');

await goto(`${base}/nocobase/dist/hub/projects`);
await page.waitForTimeout(3000);
await snap('scenario-a-projects-list');

await goto(`${base}/nocobase/dist/hub/projects/show/8`);
await page.waitForTimeout(3000);
await snap('scenario-a-project-detail-task');

// Scenario B: open the task edit dialog, expand the assignee picker, pick the
// AI employee dex (得克斯), save, and capture the list re-render.
const taskRow = page.locator('tr', { hasText: '退税口径对账底稿' }).first();
await taskRow.locator('button').first().click();
step('task edit dialog opened');
await page.waitForTimeout(1500);
await snap('scenario-b-task-edit-form');

await page.getByRole('button', { name: /^王一帆$|^得克斯$/ }).first().click();
step('assignee picker opened');
await page.waitForTimeout(1000);
await snap('scenario-b-assignee-picker-ai-employees');

const dexOption = page.getByRole('button', { name: '得克斯', exact: true }).last();
await dexOption.click();
step('picked dex');
await page.waitForTimeout(500);
await page.getByRole('button', { name: '保存修改' }).click();
step('save clicked');
await page.waitForTimeout(2500);
await snap('scenario-b-saved-assignee-in-list');

// Scenario C5: crm deep link renders the SPA.
await goto(`${base}/nocobase/dist/crm/targets`);
await page.waitForTimeout(3000);
await snap('scenario-c5-crm-targets-deeplink');

// Scenario D: brand home pages.
await goto(`${base}/nocobase/dist/hub/overview`);
await page.waitForTimeout(3000);
await snap('scenario-d-hub-home');

await goto(`${base}/nocobase/dist/crm/`);
await page.waitForTimeout(3000);
await snap('scenario-d-crm-home');

// Exploration: logged-out deep link should route to sign-in, not 404.
await context.clearCookies();
await page.evaluate(() => localStorage.clear());
await goto(`${base}/nocobase/dist/hub/my-tasks`);
await page.waitForTimeout(3000);
await snap('explore-loggedout-deeplink');
step(`logged-out deep link landed on ${page.url()}`);

await browser.close();
step('done');
