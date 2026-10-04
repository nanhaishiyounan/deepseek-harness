# Agent Note: W7-B2+B3 存量域 heal（53 页，页范围圈定 + uiSchema.enum 渲染渠道）

Status: implemented

[English](2026-10-03-w7-b23-legacy-domain-heal.md) | 中文

B2+B3 是「铸造」设计语言下第二个存量页批次：53 页（生产 15 + 仓储 14 + 质量 7 + 供应链 8 + 组织 5 + 资产 3 + 基础数据 1——审计 §3.4–3.8 的存量行；各链 W6 新建页不在范围）。一个 heal 脚本、一套截图/断言 rig、一个 attempt 覆盖两个批次号。

## Problem

全局换肤后 53 页生产/仓储/质量/组织/资产仍是旧貌，且 heal 之后 W6 各域断言腿必须在治理后的 schema 下重新挣绿。

## Decision

- **页范围圈定取代 B1 的 collection 正则**（`examples/kb-agent/scripts/w7b23-heal.mts` `B23_PAGES`）：本批域与 W6 页共享 collection（`mfg_boms` ↔ 配方版本、`qm_*` ↔ 检验工作台、`mfg_ccp_*` ↔ CCP 两页），裸 `mfg_*` matcher 会重刷 W6 页。每个块行沿 parentId 链爬到 BlockGridModel 并读 `gridOwnerRoutes`（grid → tabs 路由 → flowPage）归属到页；只有 53 个审计 schemaUid 之下的行才 heal。断言额外要求 53 页全部出现在归属图中（看板/iframe 页也带 grid），uid 写错会响亮失败而不是空转。
- **运行时枚举 Tag 的渲染源是 collection 字段的 `uiSchema.enum`——B1 漏掉的第四个 option 面。** v2 渲染器读字段定义的 enum，不读 flowModels 的 option 列表；B1 的 recolor 重刷了三个 flowModels 面，而 W4 时代的 label/色（供应商分类彩虹、`normal`=蓝、`A级(低)` 注解胶囊、第 11 行 `standard` 裸值）在屏幕上活了下来，躲过了只测 soft 底色的探针。B2B3 增加 `fieldEnum` walk：对本批 enum 列实际渲染的每个 (collection, fieldPath)，用 STATUS_PALETTE v3 重刷 `uiSchema.enum` 并经 `/api/collections/<c>/fields:update?filterByTk=<f>` 持久化（整表重写，保留其他 uiSchema 键）；断言增加 `fieldEnumMismatch=0/N`，回滚用同一 API 写回 journal 里的 before-enum。**B1 的 22 页仍带 W4 时代字段 enum——B1 交付在渲染面上言过其实的债；补写 crm_/so_/pur_ 字段 enum 是 B4 的前置项，不是可选润色。**
- **STATUS_PALETTE v3 按实测补 111+ 值**（dry-run 枚举后按 v3 规则建表：中性元数据→default、执行→blue、注意→orange、负面→red、完成→cyan）：证照效期窗口（`ok`/`w90`/`w60`/`w30` 绿→红）、IQC 严格度（`relaxed` 免检绿 / `tightened` 加严橙 / `suspended` 暂停检验红）、WMS 事务类型中性、盘点/预留/移库状态族、资产/维保族、HR 状态/请假类型、MRP 建议类型与确认动作、质检类型（中性）与严格度（三态）。一个已知折衷：`frozen` 同时承担状态语义（冻结 库存/批次/库位，橙）与仓库温区元数据（冷冻），在温区列涂了橙——记为遗留，若有所谓再上按字段分palette。
- **枚举外值走数据面而非 schema 面**：一行 `srm_suppliers.iqc_level='standard'` 因值在枚举外渲染原文；SQL 归一为 `normal`（seed 时代脏值），与从不改写数据的 options/fieldEnum recolor 分开。

## Verification

- `w7b23-heal --assert` 全批 OK：71 enum 列 colorMismatch=0 enumNoLeft=0、104 数字列右对齐+千分位、29 日期列格式统一、0 裸文本金额/数量、69/69 统计卡 forge 标记、70 列头 + 3 select 清单达 v3、**61 个字段 enum 渲染源达 v3（fieldEnumMismatch=0）**、53 页全在归属图（46 有列/统计卡面 + 7 纯形态面）。
- 53 页 live DOM 探针（`.w7b23-shot.mjs`）：44 表格页过六检查点（thead≥600、表头底色、tag soft、tag pill、数字右对齐+tnum、v2 面无 legacy hex），6 看板/矩阵页过形态面子集，3 iframe 终端仅拍照（B5 管壳）。一轮假阴（检验读数拍到加载态）以显式 thead 等待补拍——探针在稳定 DOM 上通过。
- fieldEnum 写后 W6 回归腿复跑绿：`w6b4-assert` ALL PASS、`w6b5-insp` assert PASS（先 --seed 演练行并重放向导腿——最初两项失败是读数/报告不在册的数据面，非 heal 破坏）、`w6b8-assert` PASS。`w7b0-theme --assert` OK；`pnpm run typecheck` exit 0；新脚本 oxlint staged 0/0。

## Pitfalls pinned

- **heal 断言的效力取决于它对渲染源的断言。** 探查存的 options 证明不了渲染器在读什么；改任何 option 面之后，先在一页 live 验证 Tag 文本+背景的 computed style 再宣布达成（供应商档案探针抓住了在 schema 断言全绿下存活的 W4 enum）。
- **journal 写入不能是批次第一个文件系统副作用**：第一次 `--apply` 在 research 目录缺失上 ENOENT 阵亡，此前一条 save 已落库，留下一条未记账列。dry-run 与重跑计数之差点名该列；before 态重建后补记。首次写前先 mkdir。
- **视觉模型读截图会误判小号 DOM 文本**（在一页 computed 样式为 600/#fafafa、100 个右对齐格的页面上声称白底表头与左对齐数字）。验收证据以 computed-style 探针为准；截图给人看。
- **批量截图 rig 需要稳定条件而非固定 sleep**：固定 2.6s 等待在 53 页里抓到一次加载 spinner；等第一个 thead 单元格即可消除这类假阴，又不拖慢其余 52 页。

## Alternatives considered

逐页手调 vs 域匹配的一次走查——走查让 B2/B3 复用 B1 的代码路径，dry-run 会把未知枚举值列出来补表而不是跳过。

## Consequences

- B4（经营分析/项目协同/预警/食品合规 + B1 渲染面补写）按自己的页集复用本脚本模式；fieldEnum walk 天然按 collection 生效，集外共享 collection 的页必须挂回归锚（如本批的 w6b4/b5/b8）。
- 批次回滚是一份 journal（`b23/w7-b23-heal-rollback.json`，264 条：69 statcardRegen + 64 columnOptions + 56 fieldOptions + 56 fieldEnum + 16 numberProps + 3 selectOptions）逆序重放；fieldEnum 条目经 fields:update 还原存储 enum。
- 向后遗留：`frozen` 一词两义的 label；JSBlock/iframe 内部（B5）；B1 域字段 enum 补写；统计卡 sparkline/同比仍按 B1 裁定等数据可行性。
