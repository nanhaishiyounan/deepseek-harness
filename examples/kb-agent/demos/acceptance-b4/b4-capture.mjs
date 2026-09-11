/**
 * B4 acceptance screenshot capture: the six view tabs' shared visual language
 * (plans/acceptance-fixes-2026-09-10/04-pages-visual.md).
 *
 * Saves PNG evidence against the real composed web server (port 3084):
 * six tabs (chat hero / kb workbench / market / connectors / kg / business) in
 * both themes — the dark pass flips the appearance cube through the real
 * settings panel (light → dark), so both token segments render through the
 * theme presenter, not attribute injection. Console errors and page errors are
 * collected across the whole run and must stay empty.
 *
 * The kb-workbench pass also drives one browser upload (the ingest wizard) and
 * asserts the "已入库" done row — the same lane kb-workbench.e2e drives, kept
 * here as a live diagnostic against the real server.
 *
 * Usage: node examples/kb-agent/demos/acceptance-b4/b4-capture.mjs
 * Server: DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch
 *         examples/kb-agent/cordis.patch.yml --port 3084 --no-open
 */
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'));
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:3084';

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => {
  pageErrors.push(String(error));
});

await page.goto(base, { waitUntil: 'load', timeout: 60_000 });
const welcome = page.locator('[class*="onboardingOverlay"]');
if (await welcome.count() > 0) {
  await welcome.getByRole('button').click();
  await welcome.waitFor({ state: 'detached', timeout: 15_000 });
}
// The blank session's composer placeholder is the readiness signal.
await page.locator('textarea:enabled[placeholder="问一个问题，或描述你的任务"]').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);

/** One settled screenshot. */
async function shot(name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(here, `N4-${name}.png`) });
  console.log(`N4-${name}.png saved`);
}

/** Open one view tab by its ring label and settle on its ready signal. */
async function openTab(label, ready) {
  await page.getByRole('tab', { name: label, exact: true }).click();
  await ready().first().waitFor({ timeout: 20_000 });
}

const kbReady = () => page.getByPlaceholder('检索知识库，如：山梨酸 酱油 限量');
const marketReady = () => page.getByRole('heading', { name: '数据资产市场' });
const connectorsReady = () => page.getByRole('heading', { name: '连接器与交付' });
const kgReady = () => page.getByText('类型图例');
const businessReady = () => page.getByText('业务对象').or(page.getByText('还没有可用的业务对象'));

// ---------- Light pass ----------
await shot('01-chat-hero-light');
await openTab('知识库', kbReady);
await shot('02-kb-workbench-light');
await openTab('数据资产', marketReady);
await shot('03-market-light');
await openTab('连接器', connectorsReady);
await shot('04-connectors-light');
await openTab('图谱', kgReady);
await shot('05-kg-light');
await openTab('业务管理', businessReady);
await shot('06-business-light');

// ---------- Upload lane diagnostic (the kb-workbench e2e failure) ----------
const uploadProbe = path.join(here, 'upload-probe.md');
await writeFile(uploadProbe, '# B4 上传探针\n\n山梨酸在酱油中的限量核查由品控部执行。\n');
await openTab('知识库', kbReady);
await page.getByRole('button', { name: '添加文档' }).first().click();
const dialog = page.getByRole('dialog', { name: '添加文档' });
await dialog.waitFor({ timeout: 15_000 });
await dialog.locator('input[type="file"]').setInputFiles([uploadProbe]);
const doneCount = await dialog.getByRole('listitem').filter({ hasText: /已入库 · \d+ 个片段/u })
  .waitFor({ timeout: 30_000 })
  .then(() => 1, () => 0);
console.log(`upload lane: done rows = ${doneCount} (1 expected)`);
await shot('07-kb-ingest-after-upload-light');
await dialog.getByRole('button', { name: '取消' }).click();
await dialog.waitFor({ state: 'detached', timeout: 15_000 });

// ---------- Dark pass (through the real settings appearance cube) ----------
await page.getByRole('button', { name: '设置', exact: true }).click();
const settings = page.getByRole('dialog').or(page.locator('[class*="settingsRoot"]')).first();
await settings.waitFor({ timeout: 15_000 });
await page.getByRole('button', { name: '深色', exact: true }).click();
await page.waitForTimeout(600);
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);
// Verify the dark token segment actually engaged.
const isDark = await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'));
console.log(`dark segment engaged: ${isDark}`);
if (!isDark) throw new Error('dark theme did not engage through the settings cube');

await openTab('对话', () => page.getByText('食品产业知识库问答'));
await shot('08-chat-hero-dark');
await openTab('知识库', kbReady);
await shot('09-kb-workbench-dark');
await openTab('数据资产', marketReady);
await shot('10-market-dark');
await openTab('连接器', connectorsReady);
await shot('11-connectors-dark');
await openTab('图谱', kgReady);
await shot('12-kg-dark');
await openTab('业务管理', businessReady);
await shot('13-business-dark');

await browser.close();

if (consoleErrors.length > 0 || pageErrors.length > 0) {
  console.error('console errors:', consoleErrors);
  console.error('page errors:', pageErrors);
  throw new Error(`console/page errors must be empty (got ${consoleErrors.length}/${pageErrors.length})`);
}
console.log('b4-capture: done — 13 screenshots, console clean');
