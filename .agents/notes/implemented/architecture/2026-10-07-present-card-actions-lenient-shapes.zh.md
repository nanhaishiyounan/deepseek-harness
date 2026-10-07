# Agent Note: present_card actions 宽容形态——包装键解包、缺 kind 推断、骨架化错误

Status: implemented

[English](2026-10-07-present-card-actions-lenient-shapes.md) | 中文

## 问题

移动端同事（enterprise-data-assistant，网关 :3080）的一次供应链实活会话里，`present_card` 报告卡连续 4 次因同一个 `actions` 错误被折叠，最终靠删掉按钮才出卡——功能性损失绕过。原始会话捕获显示模型的两种写法：包装键（`{"view":{"label":…,"route":…}}`，第 1–3 次）与缺 `kind` 判别字段的扁平对象（第 4 次）。4 次违规文本逐字相同、只列四个 kind 值——既不说判别字段名，也不给具体元素示例——模型没有任何线索到达唯一合法的扁平形态。两个教学放大器：出事会话的 persona 对 present_card 的教学为零（完全依赖工具描述）；工具自身参数描述用紧凑联合记法 `actions?[≤4]{view{label,route}|…}`，读起来正是模型所发的包装键形态。

## 决策

三种语义无损的 actions 写法现在走 resolve 规范化而不是违规，客户端协议解析器镜像同步（折叠层会复验 tool/call 原始参数，服务端已 coerce 的卡要渲染按钮仍需客户端镜像放行）：

- **包装键**解包：单键对象、键为某分支的 const 值、内层为该分支字段，合并为 `{kind, …内层}`；包装键压过内层同名字段。
- **判别字段缺失**时补全：没有任何分支的判别字段在场，且恰好一个分支的其余必填字段齐备（`{label,route}` → view；`{label,title}` → create-task）。显式非法 `kind` 绝不被覆盖；歧义签名（`{label,route,title}`）仍违规。
- **单个 actions 对象**在走查前提升为单元素数组。

判别失败错误现在追加四枚具体 JSON 骨架（`{"kind":"view","label":"…","route":"…"}/…`），由分支 schema 生成、不会漂移；参数描述改为扁平形状+可照抄示例，弃用歧义联合记法。mobile-form-assistant 的 persona few-shot 在 create-task 旁补 view 形态，并加「kind 是同级字段、不是包装键」规则。

## 备选方案

- **只补 persona 教学**——否决其充分性：出事会话挂载的 persona 根本没有 present_card 教学；工具面修复保护所有 preset，persona 修复只保护一个。
- **服务端也折叠 create-task 的 `text` 别名**——暂缓：客户端围栏解析器已折叠；工具路径上服务端的两条路径化违规一轮即可自纠。既有已文档化的不对称。
- **任意数组位置的单对象提升**——否决：无范围限制的数组位置提升会连带放宽 `options`/`metrics`/`fields`，且无诊断证据支撑；提升保持 report-actions 专属。

## 后果

- 用户实测的两种失败写法现在直接通过（服务端接受、客户端渲染按钮）；新的畸形写法失败时带回可照抄的形状。
- 实活矩阵（7 腿）：出卡 7/7、actions 保留 7/7、包装键/缺 kind 复发 0（首发全部 flat-kind）、`matched 0` 为 0。非 actions 残留破口如实记录待后续批次：`table.rows` 对象行、报文体再包 `report` 键、臆造 `rows[].level` 枚举、actions 超 4 枚。
- 错误文本变更随行为同步更新了精确断言用例；fixtures 扩 3 valid + 1 歧义 invalid，两份镜像 spec 共同消费。

## 验证

- `pnpm vitest run packages/interaction/tool-present-card` 与 `pnpm vitest run packages/client/ui-mobile`（共享 fixture 语料的双镜像 spec）；`pnpm run test:web apps/web/tests/mobile-assistant-toolcard.e2e.ts`；`pnpm run typecheck`。
- 实活矩阵台账与截图：[demos/acceptance-w21/](../../../../demos/acceptance-w21/)（w21-r8-diagnosis.md、w21-r8-matrix-runs.jsonl、w21-r8-matrix-summary.json）。
