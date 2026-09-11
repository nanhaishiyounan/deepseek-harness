/**
 * B3 acceptance screenshot capture: the scenario portal's information
 * architecture (plans/acceptance-fixes-2026-09-10/03-scenario-ia.md).
 *
 * Saves PNG evidence against the real composed web server (port 3084):
 * ① the default blank hero — featured six only, every category folded, with
 *    the viewport-cap assertion numbers printed (DOM card count and the
 *    viewport-intersecting count must both stay ≤ 10);
 * ② the live search filtering on 食安 (0 < visible < 30, here 4);
 * ③ the zero-hit empty state;
 * ④ the folded path: one category row expanded in place (featured six plus
 *    the bucket's cards, still within the cap).
 *
 * Usage: node examples/kb-agent/demos/acceptance-b3/b3-capture.mjs
 * Server: DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch
 *         examples/kb-agent/cordis.patch.yml --port 3084 --no-open
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'));
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:3084';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(base, { waitUntil: 'load', timeout: 60_000 });
// Dismiss the first-run welcome if it renders.
const welcome = page.locator('[class*="onboardingOverlay"]');
if (await welcome.count() > 0) {
  await welcome.getByRole('button').click();
  await welcome.waitFor({ state: 'detached', timeout: 15_000 });
}
// A fresh blank session carries the portal; the composer placeholder is its
// readiness signal.
await page.locator('textarea:enabled[placeholder="问一个问题，或描述你的任务"]').waitFor({ timeout: 30_000 });
await page.getByText('食品产业知识库问答').first().waitFor({ timeout: 15_000 });
await page.waitForTimeout(1500);

/** DOM card count plus the viewport-intersecting count (the acceptance pair). */
async function cardCounts() {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="scenarioCard"]'));
    const visible = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < window.innerHeight
        && rect.right > 0 && rect.left < window.innerWidth;
    });
    return { dom: cards.length, visible: visible.length };
  });
}

// ① Default view: featured six, all categories folded.
const before = await cardCounts();
console.log(`① default view: dom=${before.dom} cards, viewport-visible=${before.visible} (cap 10)`);
if (before.dom > 10 || before.visible > 10) throw new Error(`viewport cap violated: ${JSON.stringify(before)}`);
await page.screenshot({ path: path.join(here, 'B3-01-default-featured-only.png') });
console.log('B3-01-default-featured-only.png saved');

// ② Live search: 食安 → four hits across two categories.
const search = page.getByRole('searchbox', { name: '搜索场景' });
await search.fill('食安');
await page.getByText('匹配 4 / 30 个场景').waitFor({ timeout: 15_000 });
await page.waitForTimeout(600);
const filtered = await cardCounts();
console.log(`② search 食安: dom=${filtered.dom} cards, viewport-visible=${filtered.visible} (0 < n < 30)`);
if (filtered.dom <= 0 || filtered.dom >= 30) throw new Error(`filter assertion violated: ${JSON.stringify(filtered)}`);
await page.screenshot({ path: path.join(here, 'B3-02-search-food-safety.png') });
console.log('B3-02-search-food-safety.png saved');

// ③ Zero-hit empty state.
await search.fill('不存在的关键词');
await page.getByText('没有匹配的场景 — 换个关键词试试').waitFor({ timeout: 15_000 });
await page.waitForTimeout(400);
const empty = await cardCounts();
console.log(`③ no-hit keyword: dom=${empty.dom} cards (expect 0)`);
if (empty.dom !== 0) throw new Error(`empty-state assertion violated: ${JSON.stringify(empty)}`);
await page.screenshot({ path: path.join(here, 'B3-03-search-empty.png') });
console.log('B3-03-search-empty.png saved');

// ④ Clear the query, expand one category in place.
await search.fill('');
await page.getByText('精选场景').waitFor({ timeout: 15_000 });
const row = page.getByRole('button', { name: /食品安全/ });
await row.click();
await page.getByText('AI 标签合规审查员').waitFor({ timeout: 15_000 });
await page.waitForTimeout(600);
const expanded = await cardCounts();
console.log(`④ category expanded: dom=${expanded.dom} cards, viewport-visible=${expanded.visible}`);
await page.screenshot({ path: path.join(here, 'B3-04-category-expanded.png') });
console.log('B3-04-category-expanded.png saved');

await browser.close();
console.log('b3-capture: done');
