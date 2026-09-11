# Agent Note: Scenario portal information architecture — featured row, category browse, live search

Status: implemented

English | [中文](2026-09-10-scenario-portal-ia.zh.md)

## Problem

The blank-session portal rendered all thirty scenario cards flat inside eight category groups — no search, no folding, no paging. Every viewport carried the whole catalog; users read the wall as noise ("why are the thirty scenarios always all there"). The catalog ids, the preset-directory sync gate, and the `agentPresets.select` click path were correct and stayed untouched; only the presentation lacked an information architecture.

## Decision

### Three zones: featured front row, collapsed category browse, live search

The portal keeps a static catalog and gains a browse state in `KbHeroDock`: a `featured: true` flag on six catalog rows picks the front cards (market-insight, food-safety-service, cost-pricing, export-compliance, supply-chain-finance, cold-chain — one representative lead per high-frequency business line), the eight category rows render collapsed with count badges and `aria-expanded` toggles, and a searchbox filters all thirty cards live. A blank query renders featured + browse; any non-blank query replaces both zones with grouped matches, a `匹配 {n} / {total}` summary, and an empty state on zero hits. Every scenario stays reachable within two interactions: featured cards in one click, everything else by expanding a category or typing a keyword and clicking the card.

### Filtering is a pure function over the catalog, not component logic

`filterScenarios(pool, query)` (six-field, both language faces, case-insensitive, `null` on blank query), `featuredScenarios(pool)`, and a pool-parameterized `scenariosByCategory(pool)` live in `scenarios.ts` beside the data, so the domain specs assert the filter matrix directly (blank → null, `食安` → four hits across two categories, `COLD CHAIN` → cold-chain, miss → empty) without mounting React. The dock only owns the two state cells (query string, open-category set).

### The catalog-count assertions moved to the browse heading

`usage.chipScenarios` keeps the whole-catalog count on the usage chip (`30 个场景`), and `scenario.railCount` became `{n} 个场景 · 分类浏览` on the browse heading — the e2e lane now pins the chip exactly, the heading literally, and adds three structural assertions: default-viewport card count ≤ 10 (DOM count six plus a viewport-intersection check), search filtering (4 cards on `食安`, zero-plus-empty-state on a miss, six restored on clear), and the folded path (expand 食品安全, click the label-review card that neither the featured row nor the obvious keywords surface, start the session through the same confirm modal).

### KbEntry's accessible name is the badge contract, not the label

Commit 57a87db34c changed the sidebar entry's `aria-label` from `entry.documentsBadge` to `entry.label` without updating `kbentry.client.spec.tsx` or the kb-workbench e2e lane's `知识库文档数` role queries, leaving both red on HEAD. The one-line restore to `entry.documentsBadge` is the contract both test faces already state: the entry's accessible name names the badge it carries, and the plain `entry.label` name would also collide with the header button's identical accessible name in role queries.

## Alternatives considered

**Category chip switcher or tabs.** Rejected: chips expose exactly one category at a time and add a mode to unlearn; folded rows keep every category one visible click away and compose with search.

**Pagination.** Rejected: the rail is a set of concurrent entry points, not a linear reading list — paging hides scenarios behind an ordinal nobody has.

**Virtualization.** Rejected: thirty cards never stress the DOM; the problem was presentation, not rendering cost.

## Consequences

The catalog's id set, categories, and both sync gates stay byte-identical; `featured` is an additive display-only flag, so backends and preset directories see no change. The kb-workbench e2e lane's catalog-count assertions moved from the flat rail copy to the chip-plus-heading pair and gained three structural cases (viewport cap, search filter, folded path), and the domain specs pin the filter matrix without React. The KbEntry one-line restore un-reds `kbentry.client.spec.tsx` on HEAD and keeps the lane's sidebar queries unambiguous. Visual polish (spacing rhythm, card elevation, typography tiers) is deliberately out of scope here and lands with the batch-4 visual pass over the shared page skeleton.
