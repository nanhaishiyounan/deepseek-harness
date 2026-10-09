# Agent Note: W24-R3 bullet enum face, hyphen segment boundary, and the chat page width floor

Status: implemented

## Problem

W24-R2 验证遗留唯一本批引入 Important + 用户两条运行反馈：①markdown bullet 列表的供应商生命周期枚举词分裂——`- qualified` 类孤立枚举词的左右最近句段各是 `-`（ASCII 连字符不在 `SEGMENT_BOUNDARY`，整个连字符自成一个段），两侧无 Han，W24-R2 句段门判 false，`restricted` 无条件映射而五个上门词保英文，同屏五英一中（活体 `vfy-w24r2-enum-list-split-375.png`：「供应商质检与冷链要求」会话底部 6 个 bullet，5 英文 + 1 中文「受限」）；②W24 md 表格 wrap 修复的副作用：`table { min-width: max-content }` 抬高了 AI 气泡（assistant 行的 flex item）的 `min-width: auto` 自动下限，顶破 `.dshm-bubble-paper-ai` 的 `max-width: min(80vw, 300px)`，溢出传播到页面级——用户看到「整个会话页面水平滚动了」（对话页面不该页面级横向滚动）。另：`r1-unread-dot-after-probe.json` 仍是 R1 dist 的 `-8px` 值（R2 已改 `-4px` 并在 `vfy-w24r2-unread-probe.json` 另存副本，但原文件未刷新入库）。

## Decision

1. **`SEGMENT_BOUNDARY` 纳入 ASCII 连字符 `-` 与星号 `*`**：bullet 标记、`**bold**` 包裹、行内 ` - ` 分隔都必须切开句段，枚举词不再被两侧的连字符孤立成无 Han 段。
2. **句段门两处开口（枚举 run + 裸枚举面）**：`gateSegment` 判定最近邻段含 Han **或本身是生命周期状态词**（`LIFECYCLE_WORD_SET`，源自 `SUPPLIER_LIFECYCLE_STATES` 单一事实源）——bullet 列表中后段词的最近邻段是前一个状态词，映射沿枚举序列传播；`isBareEnumFace` 判定整叶分段后非空段全为状态词或纯数字序号（`- qualified - restricted - preferred`、`**qualified**`、`1. qualified`），按裸枚举面直映——它是 W24-R1「整叶即枚举值」例外向 bullet 标记与数字序号的泛化，取代原 `whole.trim() === token` 特例分支。英文散文保词不回归：'The preferred supplier list' 的最近邻段是 `The`/`supplier`（非状态词、无 Han），门保持关闭。
3. **会话页宽度下限（用户反馈②）**：`.assistantBubble` 加 `min-width: 0`——flex item 的自动最小宽度让 max-content 表格顶破 300px 气泡上限并撑出页面级横向滚动；归零后宽度上限恢复生效，宽表只在 `.md-table-wrap` 内部滚动。
4. **证据刷新**：`r1-unread-dot.mjs after` 以当前 bundle 重跑，`-4px` 值入 `r1-unread-dot-after-probe.json`（原 -8px 记录是 R1 dist 产物）。

## Follow-ups

- 卡降级叙事泄漏 + 引用裸 id：present_card 降级为纯叙事（choice 无 widget 支持等场景）后，协议 token 与「（id 7）」类裸 id 引用经叙事正文泄漏——`sanitizeBizText` 词表层不剥协议族也不吞裸 id 括注，需叙事面补剥离。
- RichContent 叙事面黑名单统一（W24-R2 已记）：叙事走 `sanitizeBizText`、报告卡走 `sanitizeReportPayload`（`PROTOCOL_BLACKLIST` 剥离档）两层分叉，统一需叙事管线重构，继续挂账。

## Testing

- vitest（jsdom）：rich spec 新增三用例（裸枚举面四形态全译 / 中文引导句 + 六态 bullet 列表活体形态全译 / 无 Han 邻段的枚举 run 传播），sanitize spec 新增 DOM describe（RichContent 渲染 bullet 列表 6 li 全中文且全 DOM 无英文枚举词残留；英文散文句在叙事 DOM 原样）；既有英文保词三句、混排句段、八态循环断言原样通过。
- ui-mobile 全量 937 用例：935 绿 + 2 失败均为既有负载 flake（views.client.spec.tsx 的 review-card/workspace 时序，W24-R1 批已记录同款），该文件单独复跑 108/108 全绿。
- 活体（375px，R3 dist `mobile-DmktTKa7.js` + 网关重启后）：`r3-bullet-enum-probe.mjs` A 段遍历 chats 列表全部 20 个存储会话——bullet 行零英文枚举词残留、零页面级横向溢出（`sessionsWithUntranslatedStateBullets: 0` / `sessionsWithPageOverflowX: 0`，翻译样本含「状态 冻结」「受限供应商」）。R2 拍下五英一中的原发会话与叙事 md 表格会话均已不在列表（验证一次性会话），两处缺口分别由 vitest DOM fixture（含中文引导句的六态 bullet 列表）与 B 段注入取证把守：B 段向真实叙事气泡栽入 8 列宽 `.md-table-wrap` 节点（节点合成、类名/样式表/布局引擎均为活体 bundle 自有，R2 computedStyle 探针先例），四重实证——`bubbleMinWidth: 0px`（规则进 bundle）、`bubbleClientWidth: 298`（784px 宽表未撑破 300px 上限）、`pageScrollWidth: 375` 零页面级溢出、`wrapScrollsInternally: true`（784→268 容器内滚）。
- `r1-unread-dot.mjs after` 以 R3 bundle 重跑刷新 `r1-unread-dot-after-probe.json`：8/8 未读点 `top: 2px`、`right: -4px` 入库（原 -8px 记录是 R1 dist 产物，R2 验证时只另存了 `vfy-w24r2-unread-probe.json` 副本）。
- 回归另含 `pnpm run typecheck`（exit 0）、staged lint（lefthook pre-commit）、e2e toolcard（`apps/web/tests/mobile-assistant-toolcard.e2e.ts` 6/6，golden 快照无变化——seed 叙事不含 bullet 枚举面）、`pnpm run verify-agent-note-format`（791 过）。

## Alternatives considered

- **只加连字符边界 vs 边界 + 枚举 run 开口**：只加边界时 bullet 首词（左邻中文引导句）映射，但序列中后段词左右邻段仍是前后的英文状态词，五英一中只缩不除；枚举 run 开口让映射沿序列传播，裸枚举面再兜底无引导句的整叶。
- **裸枚举面按整叶判 vs 按行判**：RichContent 管线对整个 text run 一次 `sanitizeBizText`（含空行与多段叙事），整叶判定只在 run 本身就是纯枚举面时直映，带中文引导句的活体形态由枚举 run 开口覆盖；按行判需重排 sanitize 与分块顺序，无额外收益。
- **数字序号段当门信号 vs 只当裸面合法段**：'the 3 preferred suppliers' 的英文语序会让数字左邻段误开门；数字只作为裸枚举面的合法段（`1. qualified` 单叶直映），不进门信号。

## Consequences

- 代价：`contextualStateWord` 每词多一次整叶分段扫描（叶子短，可忽略）；`-`/`*` 入边界后 `9/26-28` 类日期串的段切分变细（仅影响句段探测粒度，词表/AQL/streak 走独立 matcher，既有断言全绿）。
- 买到：bullet 枚举面同屏全译（不再五英一中）；英文散文保词、混排半保词、中文语境映射三头自洽不回归；会话页面级横向滚动消失、宽表只在 wrap 容器内滚；未读点 -4px 以当前 bundle 入库。
- 回滚：`SEGMENT_BOUNDARY` 去掉 `-*` 两字符、`gateSegment` 摘除 `LIFECYCLE_WORD_SET` 臂、`isBareEnumFace` 换回整叶等值比较即恢复 W24-R2 行为；`.assistantBubble` 的 `min-width: 0` 一行回退（活体 overflowX 探针会先红）。
