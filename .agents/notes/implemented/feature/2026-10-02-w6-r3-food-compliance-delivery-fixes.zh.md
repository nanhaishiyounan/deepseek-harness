# Agent Note: W6-R3：食品合规交付面修复（标签 SVG、转义、身份、召回操作台、移动端通知）

Status: implemented

[English](2026-10-02-w6-r3-food-compliance-delivery-fixes.md) | 中文

W6-B3 四件套的数据底座过关（追溯 CTE、召回状态机、发号、冻结快照——本轮未动），但 16 维验证 70/100：1 项 Critical + 15 项 Important。本轮只修交付面；每个修复自带负向断言或浏览器活体证明。

## Problem

B3 验证轮点名的合规面问题：条码画不出来、XSS 载荷在渲染中存活、断链不可见、召回台身份报错外泄。

## 落地内容

- **条码 SVG 真正可绘制**（lesson 19）：条形单元改为 `<g>` 内真实的 `<path d="…"/>` 元素（裸 run-length 字符串在所有消费端渲染 0 像素）。标签断言新增浏览器渲染层——headless-Chrome CDP 会话加载 SVG，证明 `querySelectorAll('path') > 0` 且 `getBBox()` 宽度非零（124 条、绘制 248px）；round-trip 腿重读条宽并解码回四个 AI。
- **真实 XML 转义**（lesson 20）：旧 `esc()` 是恒等替换；两个 JSBlock 与 `labelSvg()` 现转义五个预定义实体，`escapeXml` 另剥离 XML 1.0 非法控制字符——GS1 GS 分隔符（U+001D）混入人类可读文本曾让 image 模式 SVG 解码整体失败而 document 模式容忍（img 诊断：HTTP 200 + onError）。负向腿：携带标记的批号在标签 SVG 与效期看板中完全转义、零 script 节点；超 20 字符负载被批号长度门禁 fail-loud 拒绝（JSON 错误体是 application/json，绝非标记）。
- **泳道无 NaN**（lesson 22 前半）：shipment 半列 5.5 曾令 `colCount[5.5]`（undefined → NaN y）。泳道列号统一整数；浏览器判据双向断言 SVG 无 NaN 且节点元素数=footer 计数。
- **凭据推导的召回身份**（lesson 21）：`/recall/create`、`/recall/act` 与新增 `/recall/scope` 从请求的平台会话解析操作者（Bearer → `/api/auth:check` → username，带窄传输重试防 schema 写后的断连窗口）。无凭据 401；body 自报 actor 与会话不符 403（伪造 qc_inspector 探针）；自报缺省 admin 已删除。白名单补入平台 root 的真实 username `nocobase`（其凭据推导 actor），actRecall 的 root 旁路接受同一对。OPTIONS 预检回 204 + CORS，错误响应同样带 CORS 头——跨源页面必须看到 401/403 事实而非被掩盖的 fetch 失败。
- **due_date 三层校验**：createRecall 前置拒绝过去期限；发号 INSERT 带 `WHERE dd IS NULL OR dd >= CURRENT_DATE`（绕过前置的直连 SQL 写入 0 行并 fail-loud）；CLI 汇入同一函数。负向腿（昨天日期被拒）入断言。
- **供应商占位**：无供应商批次印「供应商未维护（法定四要素缺失）」而非静默滤行（法定四要素保持可见）；`--migrate` 对缺 supplier_id 的成品批次输出显式数据质量提示行。
- **召回操作台**（召回管理页 JSBlock，对既有表格增量挂接）：发起表单（问题批次选择器 + GET /recall/scope 范围预览 + 原因 + 期限）与流转行（notify / execute / close，close 必填记录说明）——均以登录会话的 bearer 调引擎。追溯侧栏的 CLI 引导替换为页内「发起召回」按钮（同一凭据推导 POST）。
- **移动端召回通知**：AlertsView 增召回分段，读 alert-center 渠道的 `notificationInAppMessages`。网关按 wfl_alerts 同款做行域：匿名读拒绝；登录用户的 NocoBase id 以 `userId` 过滤下推（username→id memo 支撑）；read 面绕过 collection-scope 行——写仍归引擎。该读独立降级（通知失败不空白化预警列表）。
- **LABEL_ENGINE_BASE 可配**：移动端条码卡按渲染时读取 `window.__LABEL_ENGINE_BASE__`（模块加载期常量错过迟到注入）；未注入保持 demo 引擎源。生产形态是网关 `/label/*` 代理。
- **GS1 规范修正**（lesson 24）：AI(10) 以 mid-FNC1 分隔（元素串中的 GS U+001D；编码器在两种码集下都映射为 FNC1，解码器还原）；STOP 图案改为标准 13 模块终止（去掉多余 `11` 填充）。断言新增外部标准向量腿——STOP 宽度序列 2-3-3-1-1-1-2、校验字符=加权和 mod 103、mid-FNC1 恰在变长 AI(10) 之后、静区 ≥10X——均为 ISO/IEC 15417 与 GS1 通用规范所述事实，独立于本仓库码表。
- **断链提示方向裁剪**（lesson 22 后半）：反向视图只审上游泳道、正向只审下游——单向视图不再报告另一侧缺失。浏览器判据在断链批次上双向核验。
- **审计四件套**（lesson 23）：recall_orders 增 `created_at`（NOT NULL default now，幂等）；`recall_audit` 流水表（event_id/order_id/code/actor/action/payload/ts）以与每次状态迁移相同的数据修改 CTE 接收 initiate/notify/execute/close 行——流水与状态不可能不一致，且单删除级联流水。引擎对每条失败路由记录 route + stack。断言硬门禁：created_at 非空、审计流水=状态迁移序列。
- **演练污染治理**（lesson 25 最小版）：验收演练单 reason 前缀「验收演练」；`--clean-drill`（及断言收尾步）清扫演练单、级联审计行与 alert-center 通知——终态台账只留真实工作。
- **红档线单一事实源**：效期看板的红线天数改读 alert_rules.warn_days（B2 配置中心）而非硬编码 30；图例注明出处。

## 关键取舍

- **身份门走平台会话而非第二套 token**：JSBlock 本就坐在持有 NOCOBASE_TOKEN 的 NocoBase 页面里；经 auth:check 换取 username 保持单一凭据宇宙（W3_TERMINAL_TOKEN 姿态仍只属于终端）。用 check 而非 users:me——本 NocoBase 快照不提供后者。
- **通知行域放在网关**而非 scope 表行：scope 授权会暴露所有人的通知；userId 下推（带 memo）在不改 NocoBase 侧过滤树的前提下让线上答案按人切分。
- **召回操作台增量挂接**（以 `recall-console` 标记的 JSBlock 附到既有 grid）：重铺表格只会白白翻动 uid——与两个 B3 页面的 JSBlock 代码升级重铺同一姿态。
- **演练清理删除而非过滤**：台账是合规证据；无证据价值的演练行即污染。前缀即契约；--clean-drill 幂等。

## 验证证据

demos/acceptance-w6/w6-r3-01..07b（12 张 PNG）+ w6-r3-shot-meta.json（verdicts 21/21）、w6-r3-04-identity-gate.log（HTTP + 页面腿）、gates-r3.log（typecheck ×2 exit 0；vitest 65+8 passed；oxlint staged 对本轮文件 0/0）。回归全绿：w6b3-trace/recall/labels --assert 与 w6b2-rules --assert 全部 PASS。

## Alternatives considered

- **换条码库 vs 修 bwip-js 用法**——选修用法；round-trip 断言锁住行为。

## Consequences

成本：断链批次仍显示（可见而非隐藏）。买到：断链可诊断、XSS 负例在册、条码 round-trip 全绿。
