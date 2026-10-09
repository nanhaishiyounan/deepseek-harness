# Agent Note: W24-R4 adjacent state words in English prose, the plus bullet, and the probe de-flake

Status: implemented

## Problem

W24-R3 验证（PASS_WITH_DEBT88）留下唯一本批引入 Important + 两条 Minor：①枚举 run 开口过宽——`gateSegment` 对「最近邻段本身是生命周期状态词」无条件开门，英文散文中两个状态词相邻就互相担保：`the frozen qualified partner is reserved` 里 `frozen` 的右邻段 `qualified` 与 `qualified` 的左邻段 `frozen` 互为状态词，全句被序列传播翻译（R3 只测了「英文散文 + 非状态词邻居」与「纯 bullet 枚举面」两侧，漏了中间态）；②markdown 无序列表的 `+` 标记不在 `SEGMENT_BOUNDARY`，`+ qualified` 类加号 bullet 枚举得不到裸枚举面判定；③`r3-bullet-enum-probe.mjs` 两处固定 `waitForTimeout`（2500/2000ms）盲等是 R3 活体证据的 flaky 面，且尾拍 `r3-bullet-enum-after-375.png` 与 `r3-bullet-enum-table-375.png` SHA256 相同（同帧零信息）。

## Decision

1. **枚举 run 开口围栏到 bullet 枚举行（W24-R4）**：新增 `isBulletEnumLine`——行 trim 后以 `-`/`*`/`+`/数字序号 bullet 标记开头且整行是裸枚举面（状态词 + bullet 标记 + 数字序号）；`gateSegment` 增 `enumRun` 参数，状态词邻居臂只在 `enumRun` 为真时开门（`HAS_CJK` 臂不变）。判定依据是「被探测 token 自己所在行」而非「状态词邻居所在行」：散文态（`the frozen qualified partner`）token 落在散文行，门关；枚举态（中文引导句后 `- preferred` 的序列）token 落在 bullet 枚举行，门开——映射沿序列传播的活体形态不回归。
2. **`SEGMENT_BOUNDARY` 补 ASCII 加号 `+`**：markdown 三种无序列表标记（`-`/`*`/`+`）齐备，`+ qualified - restricted` 与 `+ frozen\n+ potential` 均入裸枚举面直映。
3. **探针去 flaky**：两处固定盲等改条件等待——A 段进会话等 `[class*="assistantBubble"] [class*="richText"], li`（10s 超时容错空会话）；B 段等 `[class*="assistantBubble"]` 后另加种植前后页面宽度稳定轮询（`waitForFunction` 两次采样 scrollWidth 一致才种植/读数）。稳定轮询是实测出的必要项：一次未加轮询的重跑在 B 段读到瞬时 `pageScrollWidth: 386`（元素出现 ≠ 布局稳定），布局稳定后种植的对照诊断 0–2000ms 全程 375。零信息截图删除：after-375 与 table-375 同 SHA256，删 after、保留 table-375，`audit2.md` 证据清单注明。

## Testing

- vitest（jsdom）：rich spec 新增两用例——`the frozen qualified partner is reserved` / `The preferred frozen batches` 原样往返（相邻状态词对 frozen+qualified、preferred+frozen 各一），`+ qualified - restricted` 与 `+ frozen\n+ potential` 全译（加号 bullet）；R3 既有四用例（裸枚举面四形态、中文引导句六态 bullet 活体形态、无 Han 邻段枚举 run、`- qualified - restricted - preferred`）原样通过。
- ui-mobile 全量 930 用例 56 文件全绿；`pnpm run typecheck` exit 0。
- 活体（375px，R4 dist `mobile-BA9tZ11B.js` + `build:lib:client`/`build:web` 重建）：`r3-bullet-enum-probe.mjs` 去盲等重跑——20 存储会话 bullet 枚举词零残留、零页面级横向溢出；B 段种植四重实证 `bubbleMinWidth: 0px` / `bubbleClientWidth: 298` / `pageScrollWidth: 375` / `wrapScrollsInternally: true`（784→268），与 R3 记录一致。
- e2e toolcard（`pnpm run test:web -- mobile-assistant-toolcard`）6/6，golden 快照无变化（seed 叙事不含相邻状态词散文与加号 bullet）。

## Alternatives considered

- **状态词邻居臂直接删除（只留 HAS_CJK）**：最小改动，但中文引导句后的 bullet 序列（`合计 30 家…：\n- qualified\n- preferred…`）中后段词左右邻段均为状态词、无 Han，映射丢失，R3 活体形态用例回归——拒绝。
- **按状态词邻居所在行判定**：与按 token 自己所在行判定等价面更窄（散文行上的邻居状态词其所在行也是散文行，两种判法同样关门），但 token 自身所在行是更直接的环境证据（枚举 run 的定义就是 token 自己身处 bullet 枚举行），语义更贴。
- **B 段盲等加倍（2000→4000ms）**：仍是盲等，慢且不保证稳；稳定轮询（两次采样一致）以事件信号替代时长赌注，且同一轮询顺带覆盖种植自身引入的布局变化。

## Consequences

- 代价：`contextualStateWord` 每词多一次行切片与行级裸面判定（叶子短，可忽略）；`+` 入边界后 C++/版本号类 `a+b` 串的段切分变细（词表走独立 matcher，既有断言全绿）。
- 买到：英文散文中相邻状态词不再互相担保翻译（Important 清偿）；加号 bullet 枚举面同权翻译；探针以条件等待 + 稳定轮询产出可复跑证据，零信息截图出清，B 段测量与 R3 基线一致。
- 回滚：`gateSegment` 去掉 `enumRun` 参数恢复单臂判定、`SEGMENT_BOUNDARY` 去掉 `+`、探针还原两处 `waitForTimeout` 与尾拍即恢复 W24-R3 行为。
