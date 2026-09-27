# Agent Note: W2-B1 AQL 全量清偿——GB/T 2828.1—2012 原始主表网格、箭头解析与四态状态机

Status: implemented

[English](2026-09-27-w2b1-aql-full-table.md) | 中文

## 问题

B8 交付的 AQL 抽样只有三段实测（151-280 / 281-500 / 501-1200 × 1.0/2.5/4.0 三档）与两态切换：段外查表一律 fail-loud，「加严」用「AQL 降一档查正常表」近似。W2-B1（[01-b1-aql-full-table.md](../../../../plans/2026-09-27-w2-evolution/01-b1-aql-full-table.md)）替换为 GB/T 2828.1—2012 水平 II 完整体系：15 批量段 ×（normal 5 档 + tightened 2 档 + reduced 2 档）= 135 行种子、按原始主表网格做箭头规则解析、以及带转移得分机制（9.3.3.2）与累计 5 拒停检（9.4）的四态严格度状态机（normal / tightened / reduced / suspended）。

## 决策

**存原始网格 + `resolvePlan` 纯函数，不存预消化行。** [nocobase-w8-quality.mts](../../../../examples/kb-agent/scripts/nocobase-w8-quality.mts) 的 `PLAN_GRIDS` 把每个（rigor × AQL × 字码）格存为数值格 `{ac, re}` 或箭头格（沿 `CODE_SEQ` 的 `+1` 下 / `-1` 上）；`resolvePlan` 滑到第一个数值格并取**新字码的 n** 加目标格 Ac/Re（第 10.3 条）。种子行是它在 `LOT_BANDS` 上的求值输出。`--selftest` 钉住研究报告五个对拍例（200/150/2000/90/600000）加 135 行分布；灌种前另跑过一次 135 格全量矩阵对拍（期望矩阵转录自调研报告），0 失败。

**两源分歧区按结构规律裁定。** 两份 W2 调研报告在正常表 1.5 列（51-90 至 35001-150000 各行）与 0.65 × 281-500 分歧：主报告 1.5 列没有 0/1 起点格、且 1.5 的 1/2 档位在 2.5 之上——任何合法网格都不可能解析出这种形态。交叉验证报告的逐格实测矩阵（附箭头归属表，100% 闭环）同时满足三条结构规律（每列数字带必含 0/1 起点；AQL 越小同档数字格越靠下；n×AQL% ≈ Ac 期望），故这些格从它。主报告放宽 2.5 × 151-280 的缺格按交叉报告实测补 13,1,2。裁定记录在案，待取得文字层正版 PDF 后按 PLAN 风险表要求抽验 5-10 格。

**tightened 改查真加严主表。** B8 的「降档」近似删除；查表键扩为（lot_band, aql, rigor）三元组。巧合在：151-280 × 2.5 加严真值就是 (G,32,1,2)——与旧近似的 Ac/Re 完全相同，W 轮 demo-chain 断言原样存活；而 151-280 × 1.0 正常从旧实测 (32,1,2) 变为箭头解析后的 (H,50,1,2)。历史判定行保留缓存列（single-shot；严格度切换不追溯改写过往判定）。

**四态按 2012 版原文，不采流传口径。** 停检 = 加严下**累计** 5 批不接收（9.4；「连续 10 批」是 GB 2828-87 旧版遗产）。正常→放宽要求转移得分 ≥30（现行版无界限数表）。转移得分：Ac=0/1 档接收 +2、拒收清零；Ac≥2 档须「AQL 加严一级的正常表方案下仍接收」才 +3（链 4.0→2.5→1.5→1.0→0.65）。0.65 已是入种最严档——+3 分支不可达，保守退化为 +2（开放点；记录于此）。离开正常即清零。h4 枚举（`relaxed/normal/tightened/suspended`）仍是 `srm_suppliers.iqc_level` 的权威词表；主表词表（`reduced`）在引擎边界做映射。

**再提交批与加严累计计数。** `--resubmission` 落判定行标记（`qm_inspections.resubmission`）并跳过全部计数器（9.3.1：再提交批不进转移统计——验收剧本实证：一张**拒收**的再提交批不清 score=30）。「进入加严清零」语义用判定行 rigor 快照（新增 additive 列）实现：从最新判定向前走，遇到第一张 rigor 不是 tightened 的行即断链——normal 判定断链，正是「回正常清零」。

**幂等重灌先销毁再建。** 旧 151-280 × 1.0 行与真表冲突，`seedAqlPlans` 先全量 destroy 再 create 135 行。存量集合的 additive 列必须走 probe 式 `ADDITIVE_COLUMNS` 通道：`COLLECTIONS[].fields` 只在集合首次创建时生效——第一遍部署因此静默落了 `qm_aql_plans.rigor` 全 null（create payload 丢弃未知字段；psql 分布断言抓住，补 probe 条目修复）。kept v2 页面不从 `PAGES` 重渲染，`appendColumnIfMissing` 对在用 AQL 页与质检单页幂等追加 rigor 列（按 dataIndex 判重）。

## 备选与否决

- **中文转载源作主表**——拒绝（PLAN D1）：两份研究报告已证伪大面积旧表冒充，主报告自身的 1.5 列排布违反三条结构律；按其播种会把不可能格烙进 qm_aql_plans。
- **预消化 135 行结果表替代「原始网格 + resolvePlan」**——拒绝：箭头格承载 10.3 条语义（滑动后取新字码的 n 配目标格 Ac/Re），结果表无法重推位移后的 n，也堵死未来对标准原文的重读。
- **GB 2828-87 停检规则（连续 10 批不接收）**——拒绝：2012 版 9.4 条已改为「加严下累计 5 批不接收」；保留旧规会停掉现行标准仍允许运行的供应商。
- **正常→放宽的界限数表**——拒绝：2012 版已废止该表，转移只看转移得分（≥30），未播种界限数。
- **保留 B8 rung-down 近似作加严查表回退**——删除而非保留：真加严表已播种，回退腿是不可达死代码，且同一（批量段、档位）格出现第二个真相源。

## Consequences

`qm_aql_plans` 成为完整 15 段 × 三严格度查表（135 行；setup verify 断言 135/75/30/30 加抽查格）；`inspectInspection` 在入口拒绝停检供应商、n≥N 转全检提示 fail-loud、未入种的（严格度 × 档位）组合 fail-loud 不猜测。`--iqc-resume` / `--iqc-relax` 把「负责部门认可」落为显式 CLI 动作（relax 校验 score≥30）。SUP-008/SUP-009 成为四态演示专用供应商（状态可用 `research/2026-09-27-w2-evolution/w2-b1-acceptance.mts --reset` 复现）。b9 s3 的重放限制（无跳过分支的 single-shot 拒绝——s6 有）是 W 轮既有行为而非回归；其零回归以行值对照覆盖（QI-B9F-0001/OQC1 均为 J/80/5/6，与重灌后真表一致）。

## 验收证据

`research/2026-09-27-w2-evolution/`：`w2-b1-aql-cases.txt`（psql 种子分布、抽查格、判定用例、供应商终态、B8 历史）、`w2-b1-selftest.txt`（箭头五例 + 135 格矩阵对拍）、`w2-b1-acceptance.log`（含 `.mts` 可重放驱动）、`w2-b1-gates.log`（s6/s8、demo-chain 重放、对账、setup verify）、三张 PNG（admin AQL 135 行页含严格度列、质检单页含判定严格度快照、mobile AI 回合从活数据答出 1201-3200 × 2.5 两严格度方案）。
