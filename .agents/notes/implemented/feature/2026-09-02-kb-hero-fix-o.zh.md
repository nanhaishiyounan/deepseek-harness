# Agent Note：kb hero FIX-O 批次 — 同源计数断言、rail 换行防御、reduced-motion、probe fail-loud、railCount 接线

Status: implemented

[English](2026-09-02-kb-hero-fix-o.md) | 中文

## 问题

六个小缺陷集中在 kb 空白会话 hero 及其所属测试上：场景徽标的 spec 断言硬编码 `'11'`，而组件从 `KB_SCENARIOS.length` 取值（下一次目录同步就会让 spec 在一个并非事实来源的数字上失败）；六卡分类组（supply-chain）宽 1000px，对着 960px 封顶的 portal，在较窄的桌面宽度上卡片行水平溢出 rail；场景卡片的悬停 `transition` 没有 `prefers-reduced-motion` 豁免，与客户端其余四处既有 module-CSS 模式不一致；场景集 spec 在 `preset.yml` 缺 `probe` 时静默回退 `meta.name`，把不完整场景藏在仅按名称的检索后面；`.railCount` CSS module 类存在但没有任何东西渲染它；spec 的 `afterEach` 把 `dispose()` 排在 `rm(root)` 之前串在一条链上，销毁失败会整个跳过临时根清理。

## 决策

### O1：徽标断言与组件读同一张表

`kbherodock.client.spec.tsx` 导入 `KB_SCENARIOS`，把 `String(KB_SCENARIOS.length)` 断言进 `usage.chipScenarios` 模板 —— spec 与徽标从此要么一起漂移，要么都不漂。

### O2：hero rail、动效、fail-loud 与清理加固

- **rail 换行。** 桌面端 `.scenarioCards` 换行，`.scenarioGroup` 增加 `max-width: 100%` —— 没有这个上限，`flex: none` 的组永不收缩，换行无法生效，行依旧溢出。`max-width: 768px` 媒询恢复 `nowrap` 和不设上限的组，窄屏单行横向滚动保持原样。证据：在构建产物上以 800px 视口跑 Playwright（独立 OS 分配端口，kb-workbench 世界），断言 portal 的 `scrollWidth - clientWidth <= 1` 并截取 `.artifacts/hero-800px.png`；supply-chain 卡片实际换到 rail 内第二行。
- **reduced motion。** `@media (prefers-reduced-motion: reduce) { .scenarioCard { transition: none } }` 加入 QuestionComposer/SkillRow/SidebarRoot/Toast 既有模式家族。
- **probe fail-loud。** `ScenarioMeta` 声明 `probe?: string`；结构块逐场景断言 `expect(meta.probe, ...)`，检索关键词读 `meta.probe ?? meta.name!` —— 回退只剩类型完备性，不再是静默降级。
- **railCount 接线。** 新 `scenario.railCount` 键（zh `'{n} 个场景 · 滚动查看'`，en `'{n} scenarios · scroll for more'`）在场景标题内以 `.railCount` span 渲染，`n = KB_SCENARIOS.length` —— 与徽标同源。该类覆盖标题继承的 `text-transform`，用自身的 12px 三级样式。ready-chips spec 以同一派生计数断言该行。
- **清理隔离。** 场景集 `afterEach` 独立收集 `dispose()` 与 `rm(root)` 的失败（`.catch` 进 failures 数组；单个失败重抛，多个包进 `AggregateError`） —— kb-workbench.e2e.ts 的清理模板。

## 备选方案

- **只在 `.scenarioCards` 上加 `flex-wrap: wrap`**：不够 —— 不设上限的 `flex: none` 组按 max-content 宽度定型，行里什么也换不了，依旧溢出；组上限才是让换行可达的关键。
- **rail 行复用 `usage.chipScenarios`**：chip 文案没有"滚动查看"尾缀，在每个调用点拼未翻译的片段比在插件 locale 命名空间里加一个自有键更糟。

## 后果

- `packages/client/ui-kb/src/client/hero/hero.module.css`（组上限、换行、railCount 样式、reduced-motion 块）、`src/client/locales.ts`（新键，zh + en）、`src/client/hero/KbHeroDock.tsx`（railCount span）。
- `packages/client/ui-kb/tests/scenarioview.client.spec.tsx`（派生徽标 + railCount 断言）；`examples/kb-agent/tests/scenarios.spec.ts`（probe fail-loud、隔离的 afterEach）。
- 800px 证据截图是运行期产物（`.artifacts/`，gitignored）；几何断言位于截取后即删除的临时 spec 中。
