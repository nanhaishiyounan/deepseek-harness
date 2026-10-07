# W21-R8 报告：present_card actions 嵌套结构自纠失败——诊断、修复、复验

诊断全文（4 次失败逐次取证 + A/B/C 根因分类）：[w21-r8-diagnosis.md](w21-r8-diagnosis.md)

## 一、诊断结论（摘要）

- 会话：`session-270d0b42`（enterprise-data-assistant 同事入口，gateway :3080/mobile）。4 次失败的 actions 原始形态：第 1–3 次 `{"view":{"label":…,"route":…}}` 包装键（工具参数描述的紧凑联合记法 `{view{label,route}|…}` 正是这样读的），第 4 次扁平缺 `kind`；第 5 次删除 actions 后出卡。
- 4 次错误逐字相同：`payload.actions[N] 应为 "view"/"create-task"/"send"/"link" 之一（判别字段缺失或无法识别，收到对象）`——只列 kind 值，不说字段名 `kind`，不给形状示例（根因 **A**）。
- 出事会话 persona（enterprise-data-assistant）对 present_card 教学为 0；mobile-form-assistant 的 few-shot 只示例 create-task（根因 **B**）；resolve 对语义无损形态全拒（根因 **C**）。

## 二、修复（文件清单）

| 面 | 文件 | 内容 |
|---|---|---|
| server resolve | [`packages/interaction/tool-present-card/src/index.ts`](../../packages/interaction/tool-present-card/src/index.ts) | ①判别失败错误追加四枚 schema 生成的 JSON 骨架（`每枚形如 {"kind":"view",…}/…`）②包装键解包 `unwrapSingleKeyDiscriminant` ③缺 kind 唯一必填签名推断 `inferMissingDiscriminant`（显式非法 kind 不覆盖、歧义仍拒）④report actions 单对象提升 ⑤参数描述 actions 段改扁平形状+可照抄示例 ⑥模块头 W21-R8 契约段 |
| client 镜像 | [`packages/client/ui-mobile/src/client/protocol.ts`](../../packages/client/ui-mobile/src/client/protocol.ts) | `coerceReportActionShape`（包装键解包+缺 kind 推断，签名表镜像服务端分支必填走查）+ `parseReport` actions 单对象提升 |
| fixtures | `packages/interaction/tool-present-card/tests/fixtures/report.actions-{wrapper-key,missing-kind,single-object}.valid.json` + `report.actions-ambiguous.invalid.json` | 双端 spec 共同消费（3 valid + 1 歧义 invalid） |
| server spec | [`packages/interaction/tool-present-card/tests/present-card.spec.ts`](../../packages/interaction/tool-present-card/tests/present-card.spec.ts) | VALID+3、STRUCTURAL+1（歧义骨架断言）、旧判别错误文本随行为更新为含骨架版本、W21-R8 coerce 4 用例（解包等值/推断/提升/歧义拒绝） |
| client spec | [`packages/client/ui-mobile/tests/protocol.client.spec.ts`](../../packages/client/ui-mobile/tests/protocol.client.spec.ts) | VALID+3 / INVALID+1 |
| persona | [`examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml`](../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml) | report few-shot 补 `{"kind":"view","label":"查看相关单据","route":"#/work"}`；新增「actions 嵌套形状」硬约束（kind 同级、禁包装嵌套/禁省略、失败照错误形状修正、禁删 actions 绕过）；`.dsh` 投影字节一致同步 |
| docs | tool-present-card README{,.zh}.md（W21-R8 段）、docs/tool-catalog{.md,.zh.md}（gen-tool-catalog 再生成 + zh 同步）、Agent Note 三件套（architecture/2026-10-07-present-card-actions-lenient-shapes） | |
| 复验工具 | [`demos/acceptance-w21/w21-r8-matrix.mjs`](w21-r8-matrix.mjs) | 7 腿矩阵（s×5+a×2），原始 actions 形态分类、保留率/首过率/自纠轮数断言与记录 |

部署面：apps/web dist 重建（mobile bundle 含新协议）；gateway 以原命令行重启（`node --import tsx/esm apps/cli/src/bin.ts web --patch examples/kb-agent/cordis.patch.yml --no-open`，日志 /tmp/dsh-web-gateway.log），重启后 `/mobile=200`。

## 三、复验矩阵（真实模型，台账 w21-r8-matrix-runs.jsonl）

| 腿 | 预设 | 首过 | 自纠轮数 | 原始 actions 形态 | kinds | DOM 按钮 | 出卡 | ok |
|---|---|---|---|---|---|---|---|---|
| s#1 | enterprise-data-assistant | ✅ | 0 | flat-kind | view×4 | 3 | ✅ | PASS |
| s#2 | enterprise-data-assistant | ❌ | 2 | flat-kind | view×3+send | 3 | ✅ | FAIL（非 actions 位残留，见下） |
| s#3 | enterprise-data-assistant | ✅ | 0 | flat-kind | view×2+create-task+send | 3 | ✅ | PASS |
| s#4 | enterprise-data-assistant | ✅ | 0 | flat-kind | view×3 | 3 | ✅ | PASS |
| s#5 | enterprise-data-assistant | ❌ | 2 | flat-kind | view×3+create-task | 3 | ✅ | FAIL（非 actions 位残留，见下） |
| a#1 | mobile-form-assistant | ✅ | 0 | flat-kind | view+send | 2 | ✅ | PASS |
| a#2 | mobile-form-assistant | ✅ | 0 | flat-kind | create-task | 1 | ✅ | PASS |

**本批验收指标**：最终出卡 **7/7**；actions 保留 **7/7**（无一处删 actions 绕过）；用户实测的 wrapper-key/缺 kind 复发 **0/7**（7 腿首发全部 flat-kind——参数描述新记法+persona 教学直接命中）；错误全部带字段路径，`matched 0` 为 0；s 腿首过 3/5、a 腿 2/2。

**s#2/s#5 残余根因（非 actions 破口，如实记录）**：
- s#2 第 1 轮：`rows[0].level 应为 "high"/"medium"/"low"之一（收到 "critical"）`（臆造枚举值）+ `table.rows[0..N] 应为数组（收到对象）`（**表格行传对象形态——新发现的常见畸形位**）；第 2 轮：`payload.actions 最多4项`（按钮塞 5 枚，count bound 带路径）；第 3 轮出卡。
- s#5 第 1 轮：`payload.type 缺失`——模型把报文体包在 `report` 键下（`{"report":{…}}` 再包一层）；第 2 轮 `payload.id/title/metrics 缺失 + payload.report 不是声明字段`（同根因的路径化展开）；第 3 轮出卡。
- 二者均 2 轮自纠后出卡且 actions 保留；FAIL 判定来自沿用 W21-R2 的严格 DOM 门（出卡前失败尝试在 UI 留下「已折叠」条目=错误可见的既定行为）。候选后续批次：table.rows 对象行宽容（按 columns 映射有列序歧义风险，需单独设计）、报文体去包装、level 枚举教学。

## 四、回归门禁

- `pnpm vitest run packages/interaction/tool-present-card`：**90/90 绿**（+5：3 valid fixture 腿、1 歧义 structural 腿、4 coerce 用例含1 处行为更新断言）
- `pnpm vitest run packages/client/ui-mobile`：**833/833 绿**（protocol 镜像 spec 145/145，含 +3 valid / +1 invalid fixture 腿；与 tool-present-card 合跑 54 文件 923/923）
- `pnpm run test:web apps/web/tests/mobile-assistant-toolcard.e2e.ts`：**4/4 绿**（golden 无漂移，未 refresh；过程中暴露并修复了两处 lib 面编译收窄——selectByConstDiscriminant 内联 object 收窄与 inferMissingDiscriminant 数组可变性，运行时等价）
- `pnpm run typecheck`：**0 错误**
- 本批文件 staged oxlint（.oxlintrc.staged.json）：0 错误
- `pnpm run verify-tool-catalog` / `verify-translation-pairing`（README、tool-catalog、Agent Note 三对）：通过（--write 重录后 verify）

## 五、commit

单 commit（W21-R8，lefthook 过，只 commit 不 push）；证据落盘 demos/acceptance-w21/ 前缀 w21-r8-（诊断、preflight、runs.jsonl、summary、console、7 张截图）。
