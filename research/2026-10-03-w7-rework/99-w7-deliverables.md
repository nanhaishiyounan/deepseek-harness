# W7 轮交付总结（B0~B6 + M0~M3，2026-10-03 ~ 2026-10-04）

> 主计划 [`plans/plan-w7.zh.md`](../../../plans/plan-w7.zh.md)；证据根 `demos/acceptance-w7/`（PC 终验 b6/ 与 mobile w7-m\*/w7-b6-mo-\*）；批次底稿 `research/2026-10-03-w7-rework/<批次>/`；Agent Notes `.agents/notes/implemented/architecture/2026-10-*-w7-*.md`。每行结论都有实测证据锚点（数字全部实测，真话债零容忍）。

## 一、批次交付记录（每批一行：做了什么 / 证据 / 验证结论）

| 批次 | 做了什么 | 证据 | 验证结论 |
|---|---|---|---|
| B0+M0 基座 | 「W7 铸造 · Forge」设计语言规范落盘（[`b0/design-language.md`](b0/design-language.md)）；`w7b0-theme.mts` 建 `w7-forge` 主题行（#1E4E8C/暖灰中性阶/globalStyle 令牌基底）demote mfg-standard；114 页 before 基线；mobile `tokens.css` 双轨重写（--dshm-\*/--adm-\* 全映射/三档海拔/字阶五档） | `w7-b0-01..11`、`w7-m0-01..08`、`99-w7-b0-m0-deliverables.md`；Note `2026-10-03-w7-b0-m0-forge-foundation` | theme --assert OK；DOM 抽查主按钮≠#1677ff；PASS90（首轮验证） |
| B1 核心单据域 | 销售 9+采购 8+CRM 5 共 22 页 schema 层 heal：STATUS_PALETTE v3（紫系退役→Neutral/语义五态映射）、金额右对齐+千分位、statCardRaw 工厂升级（28px 富文本单位 60%）+46 卡重生成、B0 验证债七项清偿 | `w7-b1-01..22`、`b1/99-w7-b1-deliverables.md`；Note `…-w7-b1-core-doc-domain-heal` | heal --assert OK；22 页 DOM 表全绿；w6b6/w6b7 断言腿复绿 |
| B2+B3 生产仓储+全域 | B2 生产 15+仓储 14、B3 质量 7+供应链 8+组织 5+资产 3+基础数据 1 共 53 页 heal + W6 相关域断言腿复跑 | `w7-b2-01..29`、`w7-b3-01..24`、`b23/99-w7-b23-deliverables.md`；Note `…-w7-b23-legacy-domain-heal` | heal --assert OK；w6b4/b5/b8 断言腿绿（`b23/w7-b23-regr-*.log`） |
| B4 经营协同看板 | 经营五看板重组、审批中心/流配置复核、四纯看板卡质感、三日历事件规范、v1 排产甘特样式包覆（globalStyle 段）、AI 工作台/应用中心微调 + B1~B3 补债 | `w7-b4-01..27+r01..05`、`b4/99-w7-b4-deliverables.md`；Note `…-w7-b4-collab-kanban-heal` | heal --assert OK（`b4/w7-b4-assert-final.log`）；w6b2/b9 断言腿绿 |
| B5 W6 新页美学 | 21 页：JSBlock 8 纯页+5 挂载块 token 引用式重写（紫系全撤）、驾驶舱伪零条形修复、效期/维保日历图例闭合、追溯 DAG 边框语义化、iframe 四页壳一致性+签到态品牌化（qc_inspector/sales_rep/shop_lead 真实账号补截） | `w7-b5-01..26`、`w7-b5-dom-probe.json/log`、`w7-b5-gates.log`；Note `…-w7-b5-w6-pages-aesthetic` | 23 页 DOM probe 全绿（禁色/圆角/表头/soft Tag）；W6 B3~B9 相关门全 PASS |
| M1 四 Tab 页 | hero 去蓝渐变、台账四格叙事修复、同事头像 HSL 等距色板、会话时间戳弱化、agents 分组层级、work 工具宫格、me 身份卡 | `w7-m1-01..05`；Note `…-w7-m1-m2-mobile-v7-tabs`（M1+M2 合记） | 4 页 DOM 表+交互回归绿 |
| M2 全屏层+空态骨架 | chats/chat 骨架与真实行结构匹配、composer 几何统一（+ 按钮单形态）、todos/docs/tasks/files 空态组件化（图标+主副文案+CTA）、login 输入边界、alerts 时间戳/红橙拉大 | `w7-m2-06..32`（含空态 4+骨架 3）；Note 同上 | 9 面 DOM 表+弱网/空数据演练绿 |
| M3 mobile 终验 | 暗轨 13 独立面全量精修（去饱和/提亮/海拔 23/边框差 14）；Tab 选中态独立 token `--dshm-tab-active`（暗轨 #5783bc，2.75→4.5:1）；welcome/ask ghost-chip 双轨复核（token 引用式 ✓）；work-detail 经真实路由 `#/work/:id` 成拍（qc_inspector+shop_lead 双账号，设备级 workStore 如实标注）；触屏亮变体四色入 B0 令牌册（terminal.css #5783BC） | `w7-m3-01..13`（暗轨 13 面）、`w7-m3-14-dark-probe.json`、`w7-m3-15/16-workdetail-shoplead-*` | 暗轨 probe 六门槛全过；vitest 668/668（复跑两连绿，首轮 1 例 flake 如实注明）；build:lib:client+vite 产物链 03:51 落位 |
| B6 PC 终验 | 114 页 after 一次成拍（114/114）+ 三方索引（B6 after/B0 before/批次图）；美学断言汇总 `w7-b6-matrix.sh`；禁色终查（computed 全元素扫描含引擎 iframe 面）四修复：库位平面图 JSBlock 重建（活跃 code 在 stepParams.jsSettings 不透明对象——手写该形状会破坏渲染，唯一幂等通道=destroy+addBlock，`w7b6-binmap.mts`）、antd Badge preset 高特异性+!important 覆写段（antd CSS-in-JS 复合选择器 (0,3,0) 胜过单类）、probe 自身 evaluate 参数 bug、过程误写 jsSettings 的两轮探查；W6 44 门矩阵复跑 + w6-b10-gates 断言腿复跑 | `b6/after/`114 张+`b6/after-index.md`、`w7-b6-matrix.log`、`w7-b6-matrix-probe.json/log`、`w7-b6-w6matrix.log`、`w7-b6-w6gates.log`+`w7-b6-w6gates-retry.log`、`w7-b6-mo-01..13`；Note `…-w7-b6-m3-final-verification` | 终验矩阵 6 腿全绿（主题+三 heal+114 页禁色清零+B5 结构复验+mobile 门槛）；W6 44 门 0 失败；八角色演练 8/8；typecheck PASS |

## 二、终验三件套（B6 本批）

1. **114 页覆盖铁证**：`research/2026-10-03-w7-rework/b6/after/`——`.w7b6-shot.mjs after all` 单次成拍 114/114（111 flowPage + 3 v1）；[`after-index.md`](b6/after-index.md) 逐页三方对照（终验 after / B0 before / 改造批次图 114 张链接），114/114 无缺口。
2. **美学断言矩阵**：[`w7-b6-matrix.log`](../../../demos/acceptance-w7/w7-b6-matrix.log)——主题断言+三 heal 断言+114 页 computed 禁色清零（含引擎侧 /insp /crm /cards 三 iframe 面顶层探测）+B5 域 23 页结构断言复验+mobile 暗轨六门槛；禁色历史：首轮抓出库位平面图 JSBlock 残留（#1677ff/#52c41a/#ff4d4f）与任务看板 badge cyan（#13c2c2）两处真实泄漏+probe 自身四例误报（evaluate 参数数 bug），全部修复后复跑全绿。
3. **W6 零回退铁证**：[`w7-b6-w6matrix.log`](../../../demos/acceptance-w7/w7-b6-w6matrix.log)——44 门对账矩阵复跑 0 失败 MATRIX ALL PASS；[`w7-b6-w6gates.log`](../../../demos/acceptance-w7/w7-b6-w6gates.log)——w6-b10-gates 断言腿汇总复跑 22 腿（B0~B9 --assert 族+演练 8/8+typecheck+oxlint+pairing+清理腿；首轮 b3-recall/b5-insp 两腿因与 B6 probe 并发竞态 FAIL——ECONNRESET 与演练数据半造；R1 串行重验完整链归档 [`w7-b6-w6gates-retry.log`](../../../demos/acceptance-w7/w7-b6-w6gates-retry.log)（=w7-r1-02，9075B，替换首轮 216B 截断 log）：b5 cleanup→seed→wizard replay 28✓→assert PASS 全程 exit 0、b3-recall assert PASS，其余 20 腿首轮即绿）。
4. **gates-b6 视域**（[`gates-b6.log`](../../../demos/acceptance-w7/gates-b6.log)）：typecheck PASS（w6-gates 腿内）、oxlint staged 0 警 0 错（本批 ts/mts 文件面）、translation pairing 1214 对全绿（W7 七对 Note 三件套重录+结构修齐）、agent-note-format 762 Note 全合规、doc-sync 29 门 0 败 0 跳。

## 三、mobile 双轨终验（M3+B6 合账）

- 图集：暗轨 13 面 `w7-m3-01..13-dark-*`（修复后重拍）+ light 13 面 `w7-b6-mo-01..13-light-*`（tab-active 构建后统一时点）+ shop_lead work-detail 双轨 `w7-m3-15/16`；修复前暗轨形态以批次时点存档为证（`w7-m0-07/08`、`w7-m1-05`、`w7-m2-16`、`vfy-w7-09/10`）。
- DOM 断言：`w7-m3-14-dark-probe.json`——theme=dark、海拔差 23（≥8% 门槛）、正文 12.81:1、次文 5.74:1（≥4.5）、边框差 14、Tab 12px、选中态 4.5:1（≥3）。
- vitest：43 文件 668/668（`w7-b6-mo-vitest.log`；首轮 1 例 draft→review 流转 flaky，复跑两连绿，如实注明）。

## 四、B6 期间发现并修复的债

1. **库位平面图 JSBlock 禁色残留**：B2 heal 只治 schema 层，JSBlock 运行时代码（部署产物）仍带 pre-W7 色板——`w7b6-binmap.mts` 导出 token 化 `BIN_MAP_CODE`，经 `BLOCK_UPDATE_CHANNEL`（=destroy+addBlock——活跃 code 在服务端塑形的 stepParams.jsSettings 里，直接 updateSettings 写不进）销毁重建；建页脚本 `nocobase-h5-wms.mts` 源头同步（export 供复用）。
2. **antd Badge preset 泄漏类**：Tag 覆写不覆盖 `.ant-badge-color-*`（状态点走 --ant-badge-color）——globalStyle 追加 badge preset 语义配对段（七色全映射），w7b0-theme --apply 一次生效。
3. **probe 自身误报**：`page.evaluate` 多参数抛 Playwright "Too many arguments"——改为单对象参数后四页「失败」消失；教训进 Note（Pitfalls）。
4. **w6-b10-gates b5-insp 腿竞态**：gates 的 B5 wizard replay 与 B6 probe 并发打 13000，replay 半途失败（7✓ 后错）留下重复检验单行，断言子查询撞多行——串行重播 preseed 后复跑断言（结果见 §二.3 归档 log）。

## 五、R1 修复轮（B6+M3 终验封口后的证据链自身缺陷窄修，2026-10-04）

业务命题在 B6+M3 已挣得（44/44 门零回退+禁色 live 清零）；R1 只修证据链自身缺陷，证据根 `demos/acceptance-w7/w7-r1-*`：

1. **P0 死路由三图（lesson1）**：B5 code-drift 重建轮换了效期看板/批次追溯/配方版本与变更的 uid，冻结 census 走死 uid 拍出三张字节相同的 404 帧——census 改为每轮从 `desktopRoutes:list` 现场重建（`.w7b6-census.mjs`，编号锚定标题序、uid 全取现值、缺页/增页 fail-loud），probe/shot 每页加 liveness 门（「404…Back Home」文案判死+非空正文判活），三页按现活 uid（w6b3v1vsyqj5u9a/w6b3tctwuy6wn0d/w6b4b2jezsof7xz）补拍补扫全过（`w7-r1-01-reshoot.log`/`w7-r1-01-probe.log`：liveness=PASS + kind=bomver/expiry/dag 结构复验 + 禁色 clean），`after-index.md` 再生 114/114。
2. **B5_KINDS 硬契约（lesson4）**：matched==declared 断言进 probe（23/23，drift 时 fail-loud 打印缺失 uid）。
3. **b5-retry 归档缺口（lesson2）**：216B 截断 log 替换为完整链归档 `w7-b6-w6gates-retry.log`（=w7-r1-02，9075B：cleanup→seed→wizard replay 28✓→assert 全程 exit0 + b3-recall assert PASS）；gates-b6 与本文两处措辞同步更正。
4. **文档通道更正（lesson3）**：`w7b6-binmap.mts` 顶部导出 `BLOCK_UPDATE_CHANNEL='destroy+addBlock'`；B6+M3 Note 双语两处、QUICKSTART 层 3b、本文 §四.1 四处假通道字面量清零、统一引真实通道 `destroy+addBlock`；`w7-r1-03-channel-check.mjs` grep 级一致性检查 GREEN（常量↔四文档）。
5. **暗轨印章对比度（lesson5）**：tokens.css 双轨加 `--dshm-stamp-doing`（亮=引用 work-doing，暗=#5783bc 同 tab-active 阶），work stamp 接入；dark-probe 第七门槛 stamp≥3.0 实测 **3.89**（修复前 2.38，token 链 getComputedStyle 实算 vs 工票卡背景，`w7-r1-04-dark-probe.json`）；build:lib:client+vite 产物链重落、双轨 work-detail 复拍（light #1e4e8c 不变/dark #5783bc，`w7-r1-04-work-detail-*.png`）；ui-mobile vitest 43 文件 668/668 复跑绿（`w7-r1-04-mo-vitest.log`）。
6. **注入类证据（lesson2，production-simulation 主因）**：`w7-r1-05-inject.mjs` 三场景全绿——offline（断网发送 fail-loud 落 outbox→online 冲刷队列清空+消息上屏）、CPU 4× 节流（五面导航 0 个 ≥500ms long task，全量明细归档；首轮曾现 1 例 635ms 波动，如实注明后两轮 0 例封顶 361ms）、死路由（#/work/<不存在 id> 落「该工作不存在或已删除」降级面、零未捕获错误）；前后截图+console log 归档。
7. **顺手项**：w7b0-theme --rollback 演练留档（回滚生效 assert fail-loud→re-apply→assert OK，`w7-r1-06-advisory.log`）；w7-m3-15 首拍残留删除（名实不符的 agents referral 图已清，现行为 M3 修复重拍的 work-detail 件）；本文 M3 证据件数复核 13+1+2 张全对。

R1 回归：w7-b6-matrix 六腿复跑（probe 腿含 liveness 门+B5_KINDS 硬契约、mobile 腿改现场实跑七门槛，结果见 `gates-r1.log`）；W6 44 门不因本批复跑（本批只动证据层+2 个 CSS token+文档+1 个 mts 常量）。

## 六、R2 微收尾轮（R1 验证 CONDITIONAL_PASS 的单行级清偿，2026-10-04）

只动叙述、守卫与检查脚本，不动业务面；归档 log 正文原文逐字不动、更正仅 L40 尾部追加勘误行（§六.4 的 L7 路径直改系越线，R3 已还原历史字面）；证据根 `demos/acceptance-w7/w7-r2-*`：

1. **channel-check 解堵（根因）**：§五.4 行自身复述已退役的假通道字面量、且行内含 `w7b6-binmap.mts`，恰好落进 w7-r1-03 检查的 FAIL 分支（归档 GREEN log 早于该行新增，复现与改写见 `w7-r2-01`）——采验证方推荐路径改写该行（四处假通道字面量清零、统一引真实通道 `destroy+addBlock`），检查复跑 exit 0 GREEN 重录（输出与归档字节一致）；检查脚本中收集后未用的 binmap 死变量删除。
2. **数字真话同步**：`w7-b6-w6gates-retry.log` 实测 wc -c 9075（9089B 为首录时点数字）——本文 §二.3/§五.3 直改 9075B；gates-b6.log/gates-r1.log 系历史产物，正文不动、尾部追加 R2 勘误行（`w7-r2-02`）。
3. **顺手两项（Important#2/#3）**：①probe liveness 单页先死后经 ~1500ms 退避重试一轮再判（双败才 FAIL、log 记两轮；本轮 114 页复跑零触发、全绿 `w7-r2-03`）②ledgerService 两处 String(unknown) 换 wireCell 守卫（string→原值/nullish→'—'/结构化→'#'+id；owner 位 nullish→undefined 保「未认领」语义）+顺删冗余 as WireRow 断言，oxlint 该文件 0 警 0 错、tsc 干净、vitest 668/668 复跑绿（首轮 1 例偶发未再现、复跑两连绿，如实注明；`w7-r2-04`）。
4. **Minor 三项**：m3-15 措辞改「首拍残留删除」（现行 w7-m3-15 为 M3 修复重拍的 work-detail 件）；gates-r1.log L7 after 图根路径改实际路径 research/2026-10-03-w7-rework/b6/after/；见 1 的死变量删除（`w7-r2-05`）。
5. **G5 复写归档处置**：R1 验证方复跑曾复写 12 件归档（matrix-probe/census/dark-probe/inject 系列）——已恢复 R1 提交原档为本位，本轮探针复跑产物只存 w7-r2-03，不复写归档。

R3（2026-10-04，验证 S6/S11 两清偿，`w7-r3-01..03`）：gates-r1.log L7 还原历史字面 `b6/after/`（git diff 仅 1 行回滚，路径更正只留 L40 勘误行披露）；ledgerService wireCell 三分支补测（present-doc null title→'—' U+2014／structured title→'#'+docId 非 '[object Object]'／structured owner→'#'+id），单文件 vitest 绿、全量 671/671 归档 `demos/acceptance-w7/w7-r3-02-vitest-full.log`，w7-r2-04 尾行悬空引用改指该归档。变更文件共 7 个（4 修改 + 3 新增：gates-r1.log／w7-r2-04-wirecell-oxlint.txt／ledger-service.client.spec.ts／本文件改，w7-r3-01..03 新）。

R4（2026-10-04，验证 Go-live 非阻断四件小额清偿，`w7-r4-01`）：R3 行补记变更面 7 文件（4 修改+3 新增）；gates-r1.log 尾部纯追加 L41 勘误闭环行（L7 已还原 R1 历史字面 `b6/after/`，L40「已改为」表述以 R2 时点为准）；.gitignore 追加 `research/*/raw/`（raw 快照保持 untracked byte-verbatim，仅不再列入 git status）；commit message `w7 r4: ledger count fix + archive errata closure + gitignore raw`。

## 七、W8 候选遗留清单（终局盘点）

| # | 项 | 出处 |
|---|---|---|
| 1 | 暗轨品牌色作纯文字链接的场合（若未来出现）需逐面复核 4.5:1——现品牌蓝 #2a5fa6 对卡 2.38:1 仅满足图形 3:1 用途 | M3 probe 推算 |
| 2 | mobile 工作台 workStore 为设备级（demo seed 源），不随账号投影；若要求账号级工作项需服务端投影（W6 B1 台账先例） | M3 work-detail 拍摄实录 |
| 3 | 暗轨 chat 面表单字段标签/输入底对比（AI 审读建议提亮标签 10%、输入底与气泡底拉开 5-8%）——P2 微调 | w7-m3-07 审读 |
| 4 | examples 面 lint 类型感知伪错治理（247/151 文件）——W6 B10 §四.4 原项未动 | W6 遗留续期 |
| 5 | W6 §六功能候选（人事四件套/SPC 图形/批量导出等）与 W7 §8「明确不做」功能项——功能轮次再议 | W6/W7 计划 |
| 6 | iframe 签到墙会话桥接（引擎认平台会话） | W7 计划 §8 |
