# Agent Note: W22 — form_draft 卡按钮回到 small 档；草稿字段按 widget 渲染

Status: implemented

[English](2026-10-07-w22-form-draft-widget-controls.md) | 中文

## 问题

form_draft 卡的两条用户反馈。(1) 驳回/确认写入按钮以 44px 字号渲染——`Button size="large"` 消费 `--adm-font-size-10`，而 W9 的 token 重映射把它钉在 44px（display 级），于是每个 large 卡片按钮都成了 display 级巨字。(2) 每个草稿字段都渲染成文本输入框：`EditableValue` 只分流了 relation（经 `RelationSelect` 的 Picker）与 number（`inputMode=decimal`），而协议的 `fields[].widget` 在两侧镜像上早已承载 `text|number|date|select|relation`，`fields[].options`（label/value 对）自 W21 起就是合法 schema——卡片只是忽略了它们。

## 决策

- **按钮回到 small 档与报告卡胶囊规格**（W22-B1）：`size="small"` 加 `.actions :global(.adm-button)` 上的 `height: var(--dshm-touch-sm)`（40px）、`padding-block: 0; padding-inline: 15px`、字重 600——正是 `.reportPrimary/.reportSecondary` 为审批/报告卡钉下的规格。应用于 v3 DraftCard、legacy task-cards 双卡与 ReceiptCard 底部。TaskFormModal 与 ProfileView 仍是 `size="large"`（页面级 CTA，同一 44px 档）；作为跟进项记录，本批不扩面。
- **widget 驱动控件**（W22-B2）：带 options 的 select 字段挂 antd-mobile Picker（数据源即 payload 自带 `options`，触发器为盒装 `fieldPicker` 面上的 `role="button"` span，显示 label、确认回填 value）；date 字段挂 DatePicker（precision day、进出 `YYYY-MM-DD`）；number 保持 `inputMode=decimal` 输入；text 保持盒装输入框。无 options 的 select 降级为盒装输入；锁定的卡上 select/date 字段静置为只读 `fieldStatic` 行。空必填聚焦门的选择器加入 `[role="button"]`，picker 触发器也能获得焦点。
- **日期词汇提取**到 [dateText.ts](../../../../packages/client/ui-mobile/src/client/forms/dateText.ts)：表单页 `FieldWidget` 与 v3 DraftCard 共享 `parseDateText`/`formatDateText`，不再各存一份私有拷贝。
- **options 镜像对齐闭合**：`parseFieldOptions` 过去会把「存在但非法」的 `options` 成员吞掉（草稿仍合法），而工具 schema 走查拒绝同一载荷。现在非法情形返回 null 且整卡拒绝——两侧镜像同拒；fixtures `form-draft.widgets.valid.json`（四类 widget 齐备、required 与 derived 双层 options）与 `form-draft.bad-options.json`（options 为字符串）双侧断言。
- **教学跟随 schema**：form_draft 分支描述与 persona 第 4 步的 payload 模板 + widget 句教学各 widget 的适用时机（select = 有限枚举且必带 options；date = YYYY-MM-DD；number = 数量金额；text = 编号备注名称；relation = 跨表行、不带 options），few-shot 补 date/number/select 带 options 字段形态。`.dsh` 预设投影字节一致（`cmp` 验证）。

## 后果

- 模型说不出枚举词汇（注册表没有该表条目）时会省略 options，字段降级为文本——诚实的降级，活体已验证；有词汇的模型产出 select+options，卡片挂上 Picker（`srm_suppliers.lifecycle_status` 八态词汇活体验证）。
- e2e `mobile-assistant.e2e.ts`（legacy fence）败于既有「6 位验证码」登录形态漂移（W12 账号密码改造）；stash 验证与本批无关。toolcard e2e（4/4、golden aria 快照）承担回放回归锚。
- 跑 web e2e 套件会重建 `apps/web/dist`（且可能重建 client `lib/`）——任何「e2e 期间 stash」或并行运行之后，先重跑 `build:lib:client` + web 构建，否则网关服务的是过期 hash 的 bundle。

## 备选方案

- 给卡片按钮显式钉 14px `--font-size`——放弃：审批/报告/计划卡都走 small 档（经 `--adm-font-size-7` 的 20px），只给草稿卡重定级会分裂卡内动作家族；档位修复保持一个规格。
- 在 schema 层要求 `widget:"select"` 必带 options——放弃：模型没有词汇时必踩的新拒绝面；降级为文本保持宽容契约，教学在词汇存在处推动 options。
- 级联选择与多列 picker——超范围；widget 词汇需要两侧镜像新增 schema 分支，作为下方跟进项记录。

## 跟进

- TaskFormModal（取消/提交）与 ProfileView（退出登录）仍是 `size="large"`（44px 档）；它们是页面级 CTA，但 44px 同样压过页面标题——需要一次有意的重定级。
- `mobile-assistant.e2e.ts` / `mobile-shell.e2e.ts` / `mobile-preview-iframe.e2e.ts` 仍断言 W12 之前的验证码登录形态；需要账号密码握手或像 toolcard e2e 那样的 localStorage 预置。
- 模型可引用的枚举词汇（按集合的 select options）只存在于 persona 文字里；注册表驱动的来源（客户端的 `KNOWN_ENUMS` 表在客户端侧）能让每个集合的 select 都带 options，而不必由用户供给。
