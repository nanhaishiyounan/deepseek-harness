# Agent Note: W23-R5 —— 终局清偿（预览面清洗接线 + 空码分组键 + 实测哈希）

Status: implemented

[English](2026-10-09-w23-r5-preview-wiring-group-keys-idempotent-sanitize.md) | 中文

## 问题

W23-R4 验证三项阻断，同属一族——接线停在了差一层的位置，或漏掉一个边界：

- 两个只读报告预览（`FilesView` 的查看报告、`WorkDetailView` 的查看完整报告）把存储的 artifact 原样交给 `ReportCard`：文件行与聊天分支都已清洗，打开预览却把 artifact 的 title/subtitle 协议 token 重新泄漏出来——而 files-view spec 的全 DOM 断言从未打开过预览（`previewId` 始终未置位），盲区在结构上不可观测。
- `AlertsView` 的分组键以组首行的实体编码为第三段；首行编码为空的 title 折叠组产生 `band::ruleType::`，同带同规则的所有此类组共享一个 React key（重复键、展开态串扰）。R4 曾以「活体数据不携带该形态」为由移除 R3 的 title 回退；验证恰好构造出了该形态。
- R4 落盘的证据哈希未经实测：`3340b0db…` 实为重拍帧的 SHA-1（R4 写的是「与任何证据文件的 sha1/sha256/md5/crc32 均不符」），「实测 sha256 80299dc5…」与任何算法对任何证据文件的摘要均不符；真值 sha256 为 `f5584a1b52be…`。

## 决策

- **预览接线（`ReportCard` 站点穷尽）**：grep `<ReportCard` 共三处渲染站点——FilesView（raw）、WorkDetailView（raw）、FlowItem 的 report 分支（subtitle 已清洗、title 仍 raw）。三处统一改为向卡片交 `sanitizeReportPayload(payload)`——`client/sanitize.ts` 的新导出，以 `sanitizeBody(title)` 与 `sanitizeSubtitle(subtitle)` 复制载荷；存储的 artifact 保持 wire 原字节（复制原文通道与 durable log 永远见不到清洗后的文本）。files-view spec 补「打开预览后全 DOM 无变体」用例；work-detail spec 对查看完整报告补同款。
- **分组键回退**：首行编码非空仍贡献该编码（按共享编码折叠的组的稳定身份）；首行编码为空贡献 `t::{title}::{rowId}`——title 让不同题的组分开，行 id 让被间隔行劈开的两个同题组分开，首行身份保住既有语义（重排换首行即换键、展开态重置）。alerts 套件四形态边界覆盖：空码（撞键复现）、单成员（普通行、无组卡）、全空码、重复身份（同题被 cert_due 行劈开），外加经 30 秒轮询驱动的重排重置锁定。
- **哈希更正（先实测、后誊写）**：对三帧跑 `shasum` / `shasum -a 256`——b2-01/b2-08 同帧（SHA-1 `8c44276fa4e6…`、sha256 `ea42ec630f21…`）；重拍帧 SHA-1 `3340b0dbc090…`、sha256 `f5584a1b52be…`。`b2-verify-report.md`、`r3-verify-report.md` 与 R4 note（en + zh）均已改写为实测摘要。
- **sanitizeBody 幂等**：`suggestions` 的上下文判据改读业务映射后的文本，而非原始串——`suggestions from pur_orders` 映射后携带 CJK，原判据第一次保留、第二次剥除；映射后判据每趟自洽。幂等断言（`sanitize(sanitize(x)) === sanitize(x)`，两层管道）进入 edge spec。
- **黑名单派生**：`ALWAYS_TOKENS` 与 `CONTEXT_PROBE` 由导出的 `PROTOCOL_BLACKLIST`（减去上下文相关的 `suggestions` 成员）派生，JSDoc「在此追加族即生效」的承诺成立——此前只追加进私有数组的扩展会静默不生效。
- **order 动作 token**：`order_create` / `order_status` 以精确 token 入黑名单——活体正文叙述泄漏过的封闭协议动作名。
- **R3 正文层声明**：`r3-verify-report.md` 改为实测口径——存量小写正文泄漏 4 处（B2 时代 durable log 文本，不在渲染修复面）、新 turn 复跑新增 1 处（`r3-f2-replay-probe.json` `newBodyLeakTail: 1`），替换自相矛盾的「零新增泄漏」表述。

## 后果

- ui-mobile 连续三轮 905/905（分文件实测计数：alerts 11、files-view 10、work-detail 26、sanitize 11、sanitize-edge 9）；`pnpm run typecheck` exit 0；toolcard e2e 6/6；`build:lib:client` 已刷新，网关消费的产物携带新清洗管道。
- 按共享编码折叠的组在成员重排后展开态仍存活（编码段不变）；title 折叠组换首行即重置——两个方向都有 spec 锁定。
- 聊天报告标题现在经过 body 清洗；干净标题逐字节不变，只有携带 token 的标题改变了渲染。

## 备选方案

- **在 `ReportCard` 内部清洗**——再次否决（沿用 R3 决策）：卡片保持纯载荷渲染器；各渲染站点向它交清洗视图。
- **纯 title 回退段**——被间隔行劈开的两个同题组会再次撞键；首行行 id 是唯一既逐组唯一、又保住已记录重置语义的选择。
- **所有组都按首行行 id 键控**——丢掉远期带按码折叠组依赖的稳定编码身份。
- **从活体网关重测正文泄漏计数**——当晚的 z2 会话状态无法从仓库复现；更正引用已记录的探针。
