# Agent Note: W7-B1 核心单据域 heal（STATUS_PALETTE v3 + 列治理 + 统计卡重生成）+ B0 验证债清偿

Status: implemented

[English](2026-10-03-w7-b1-core-doc-domain-heal.md) | 中文

B1 是「铸造」设计语言下第一个存量页批次：22 页（销售 9 + 采购 8 + CRM 5）schema 层 heal，外加 B0 验证方要求在 B1 开工前清偿的七项前置债。

## Problem

审计把这 22 页核心单据域判为 A 级密度最高簇（旧色板、金额列不对齐、统计卡比例失调），且 B0 验证方要求 B1 开工前清偿七项前置债。

## 决策

- **STATUS_PALETTE v3**（[`examples/kb-agent/scripts/w7b1-heal.mts`，w5b6 v2 的后继）：value 映射 antd preset 名，渲染端由层 2 globalStyle 输出语义五态 soft 配对；purple 废止（→Neutral）。v2→v3 语义修正：`started` orange→blue（执行属信息态，orange 留给需关注态）、支付方式降中性（leg03：支付通道不得与状态色板混用）、供应链准入分级拆分（`qualified` green / `preferred` blue，`enhanced` orange / `restricted` red）、采购履约/财务风险着色（`none` 未收货 / `no_invoice` 未开票 orange——leg10：风险态不得同灰不可分）。全表唯一文档化于 [`research/2026-10-03-w7-rework/b0/design-language.md` §2（B2~B4 继承的 recolor 基准表）；dry-run 列出表未覆盖的枚举值——补表而非跳过。
- **walk 范围**：按归属 collection `/^(crm_|so_|pur_)/`——n17 存量销售台账（订单/报价单/回款/发票）建在 `crm_*` 集合上，CRM 主数据与销售单据共用一个 matcher 且不溢出到 hub 页（B2 领地）。
- **field 模型之外的 option 面**：枚举选项存于三处——列下 DisplayEnumFieldModel、TableColumnModel 自身 `props.options`（列头筛选下拉源）、筛选/编辑表单下 SelectFieldModel（仍是英文 label）。三面齐改；SelectFieldModel 的归属沿祖先链找最近的 `resourceSettings`/`fieldSettings` collection 属主（select 行自身不带）。
- **statCardRaw 在 [`nocobase-flow-page-lib.mts` 升级**（改工厂即改后续批次基线）：数字 28/600/#1F2630 + 币种单位 60%（ECharts `rich` `{u|}` 段）、标签 12/500/#55606E、脚注 10/#8A94A0，加 `/* w7 forge statcard */` 标记行。46 张存量 w4b3 卡按「解析存量 raw（alias 取聚合读取、title/footnote 取 JSON 字面量、单位取 `const text =` 拼接段、小数位取 `maximumFractionDigits`）→ 新工厂重生成」收口；heal 以标记判收敛，幂等。
- **表格密度走 globalStyle 而非逐页 props**：表头 `padding-block:12px`、单元格 14px 块向 + 12px 行向（行高≈48-52px）、行分隔 `1px #EFEFEF`，并入唯一主题脚本的 GLOBAL_STYLE 后 `--apply`——B0 仍是层 1/2 的唯一入口。
- **B0 债①-③**（w7b0-theme.mts）：apply 与站立快照合并而非覆盖（二次 --apply 曾把 `previousDefaultId` 写丢为 null 致回滚退化；已被写坏的快照按 PREVIOUS_UID 行反查自愈）；用户固化 sweep（themeId 优先于 default 切换）并入 apply/assert/rollback 三模式且带首见 journal；assert 对任何固化残留报 FAIL——注入伪固化实测 exit=1 负向自证，sweep 后复绿。

## 验证

- `w7b1-heal --assert` OK：36 enum 列 colorMismatch=0、46 数字列右对齐+千分位、17 日期列格式统一、金额/数量裸文本 0、统计卡 46/46 带新标记且旧 hex 零残留、列头 options 29 清单 + 表单/筛选 select 16 清单全达 v3。
- 22 页 live DOM 探针（`.w7b1-shot.mjs`）：全部表格页 thead≥600、表头底非白、tag soft（alpha<0.3 或 soft 配对白名单——含 antd default Tag 的中性底 `#FAFAFA`）、tag 胶囊、数字格右对齐+tabular-nums、v2 面（表格+表单）无旧 hex 全 PASS；看板页 tag/几何探针 PASS；日历页 hex 清扫 PASS。
- W6 回归腿：补种演练数据后 `w6b6-crm --assert` PASS、`w6b7-sourcing --assert` PASS——最初三项 id=0 失败是演练 seed 不在册（数据面），非 heal 破坏（heal 只动 flowModels props/stepParams，不触数据行）。
- M0 断言③补跑（`m0/.w7m0-chain.mjs`）：登录→待办→台账链路绿；审批翻转腿无在册待办（空队列，如实记录）。

## 坑位钉死

- **幂等三模式脚本的重复 --apply 必须合并而非重写回滚快照**。第二次运行时 `previousDefault` 合法为 null（w7-forge 已是 default），覆盖即静默丢失 mfg-standard 恢复目标。
- **枚举 options 分布在三类节点上**（field 模型/列行/表单 SelectFieldModel）——只 heal 第一类会让筛选下拉仍是英文与旧配色。
- **DOM tag-soft 白名单必须含 antd default Tag 的中性底 `#FAFAFA`**——不透明 `rgb(250,250,250)`、alpha 1，语义上正是 Neutral；只按六对 soft 色断言会把健康页误判 FAIL。
- **旧 hex 清扫必须声明面**：整页 innerHTML 会在三页 JSBlock 内置硬编码（B5 范围）上失败；v2 断言只跑 `.ant-table` + `form` 的 outerHTML。
- **依赖演练行的 gate 脚本在任何 cleanup 之后会退化成 id=0 失败**——assert 前先 seed，并把数据面失败项与结构面检查分开归因，再怀疑被测改动。

## 替代方案

- **enum options recolor vs 只走 globalStyle**——options 承载 label（中文化）与语义映射；globalStyle 只能改漆色，救不了英文 label 和错误 preset。
- **逐页重写统计卡 vs 工厂+解析重生成**——一次工厂升级加存量 raw 解析器，后续批次与 heal 后的卡走同一代码路径。

## 后果

- B2~B4 换域 matcher 复跑 `w7b1-heal.mts`；未知枚举值在 dry-run 输出中浮现并扩入同一张表。
- 整批回滚 = 两本 journal：`b1/w7-b1-heal-rollback.json`（逆放；`flowModels:save` 是 props 合并语义，before 缺失的键必须显式写 null）与 `b0/` 下主题/用户固化两本。
