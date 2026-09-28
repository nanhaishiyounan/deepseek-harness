# Agent Note: W3-B4 审批流可视化配置中心（SVG 状态图 + wfl 六表表单化编辑 + fail-loud 一致性探针）

Status: implemented

[English](2026-09-27-w3-b4-approval-config-center.md) | 中文

## Problem

用户反馈：「审批流起码得有可视化配置界面吧」。wfl 六表配置面（flow_configs/states/transitions/approval_records/approval_todos/gate_configs，含 W2-B5 的 extras `amount_threshold`/`invoice_match_tolerance`/数组 `approver_map`）此前只能靠 psql 或种子脚本修改——管理员既看不见流程长什么样，也改不了阈值、审批人、转移条件；且直写有引擎不一致风险（PLAN 风险③：孤儿转移、双激活、extras 与种子条件字面量的阈值漂移）。

## Decision

- **JSBlock SVG 状态图只读渲染 wfl 三表；编辑面是普通 collection 行表单。**「审批流配置」页（协同办公组，w3b4 前缀）自上而下堆叠四个配置表——flow_configs（含 Add-new）、flow_states、flow_transitions、gate_configs——每表带 B1 行详情 drawer 外加 w3b4 `EditActionModel` 弹层，随后一个 JSBlock 以三个 `ctx.makeResource('MultiRecordResource')` 实例（runjs 白名单词汇；h5 库位图先例）读 `wfl_flow_configs`/`flow_states`/`flow_transitions`，每流渲染一个 `<details>`：流头摘要（标题/doc_type/激活/阈值/容差/审批人映射）+ BFS 分层 SVG 节点（状态 + 锚点 + 可编辑角色）+ 边标签 `动作·角色｜条件`。不引入第二工作流引擎、不做拖拽编辑（Frappe BETA builder 仅作形态方向证据）；每次编辑写的都是引擎已在消费的数据行。
- **审计契约落在 `config_note`：表单层必填、探针层断言。** flow_configs 编辑表单对 config_note 标 `required: true`（FormItemModel props），description 指引填写 操作者/时间/旧→新；空 note 提交在客户端被整体拒绝（实测：整次提交被拒、行数据分毫未动）。转移/状态/卡口的编辑走各自表行——其审计面 = 探针的对齐断言 + 所属流行 note（给其余表加审计列属 W4 范围）。
- **一致性探针是一个导出的函数，对全部激活流 fail-loud。** `assertWflConsistency`（位于 nocobase-w3-approval-visual.mts，被 setup-nocobase verify import）断言：每 doc_type 激活互斥、无孤儿转移（state/next_state 必须存在于本流状态表）、从入口状态可达 anchor=1 生效态、approver_map 的用户名全部存在于 users、extras 合法 JSON 且 amount_threshold 为正数、config_note 非空、以及所有 `<= N` 条件字面量等于 `thresholdOf(extras)`（W2-B5 对齐语义——运行时路由读 extras 解析出的 flow.threshold，act() 再交叉匹配转移条件，两个面不容漂移）。非激活草稿流豁免结构断言：激活是管理员的显式开关，loadFlow 只读激活行。CLI 孪生 `--check-consistency` 打印各流结构表并对任一失败以非零码退出；探针本身绝不写库。
- **改 `amount_threshold` 是设计上的两处同写。** extras 字段 description 写明；探针的阈值字面量断言兜住半途而废的编辑。只改 extras 不会打断运行中的引擎（act() 按解析阈值路由，无条件的二级转移行仍能匹配）——红探针就是强迫条件字面量跟上的护栏。
- **菜单 ACL 以显式 rolesDesktopRoutes 绑定 admin+root；数据 ACL 给 member 只读。** `desktopRoutes:listAccessible` 用页面绑定角色与用户角色求交集——没有超级用户旁路（实测：root 账号补上 root 绑定行后才看见页面；一枚陈旧的 `nb_role_main=member` cookie 曾把浏览器会话钉在 member 视角）。build 绑定 admin+root 并销毁自动生成的 member 行；member 另获四张配置表的 view/list/get 全字段授权，将来菜单共享时打开即只读，写路径保持 403（quality_lead 实测）。
- **存量审计回填：**九条 W2-B5 之前的种子流 config_note 为空；build 给每条追加一行明确的 baseline-backfill（标注为回填、绝不冒充编辑），使探针的非空断言从干净基线成立。

## Consequences

- 管理员无需 psql 即可看到每条激活流的形态与摘要（阈值/容差/审批档位），「两处同写」的阈值编辑从口口相传变成可执行的约束。
- 探针给 PLAN 风险③一把每批 verify 都会拉动的 fail-loud 度量尺，漂移的 wfl 配置无法蒙混过关；未激活的草稿流在激活前保持合法。
- setup-nocobase 开始 import 一个业务脚本（nocobase-w3-approval-visual.mts）承载共享探针——一致性口径只有一份，而非 verify 内重实现；该脚本保留 invokedDirectly 守卫，import 无副作用。
- n18 目录与 orphan sweep 多吸收一张表单；其计数下限随证据上调（82）。

## Notes（实战踩坑）

- **runjs authoring 管线在解析前对 code 做 HTML 实体解码。** JS 字符串字面量里裸写 `"""` 会被解码成引号并破坏字符串边界——`runjs-syntax-invalid "Unterminated string constant (1:115)"`；`&/</>` 解码后不是引号所以幸存。JSBlock 的 esc() 将全部实体改写为 `"&" + "amp;"` 式拼接：解码器找不到完整实体序列可改写，运行时输出在两种管线下都正确。另一条 `runjs-render-required` 规则静态要求 code 含 `ctx.render` 调用。
- **`rolesDesktopRoutes` 的主键是 (desktopRouteId, roleName) 复合键——没有行 id。** 用 `filterByTk=row.id` 销毁 member 绑定是静默空操作（id 为 undefined）；正确路径是按 filter 销毁。
- **flowPage 的 tabs 路由行存的是 grid 的父 uid，不是 grid uid。** 把 `tab.schemaUid` 当「grid uid」返回（B3 的 `gridUidOfExistingPage` 至今保留的形态）会让后续块的幂等检查对比错误父节点并重复建块——须经 `flowModels:findOne?parentId=<tab.schemaUid>&subKey=grid` 解析真正的 grid。
- **客户端注册表里不存在 `TextAreaFieldModel`**（"Model class not found"）：多行渲染来自字段自身 uiSchema（`Input.TextArea`），编辑模型用 `InputFieldModel` 即可。
- **`flowSurfaces:addBlock` 的 settings 只接受 code/version/showBlockCard**——任何多余键（如块标题）都会挂 authoring 校验。
- **n18 的目录 pageSize（6000）落后于本批把 flowModels 推过的规模**；现与 lib/verify 一致按 12000 列取，且回滚/重建循环留下的悬空按钮需要再跑一次 orphan sweep（计数收敛 80→81→82）。
- **浏览器自动化无法向渲染出的多行编辑框注入值**（fill 工具的值进不了 React 表单状态；人工键入可用——note 字段确实提交成功过）。旅程中的阈值编辑因此走 EditFormModel 提交的同一 REST 端点（`wfl_flow_configs:update`），即 D6 写路径本身；浏览器证据覆盖表单形态、必填拒绝与图刷新。

## Alternatives considered

**经 NocoBase workflow 插件渲染成第二引擎。**否决（PLAN D6）：会分裂 wfl 表已拥有的状态机；JSBlock + 普通表单通道保持单一数据面。

**保存时服务端钩子在落库前拒绝坏编辑。**本批否决：collection REST 写路径在自研插件之外没有请求内校验缝隙，workflow 回调又是提交后触发。保存后探针契约 + 表单层必填 note 在 verify 时点以 fail-loud 覆盖同一批不变式。

**member 可见菜单且表格只读。**批次文档两种读法都写了；落地选择跟任务书的「仅 admin 可见」+ 数据面 member 只读授权——将来共享菜单只需一行绑定，不必动权限。

## Verification

- 图-表对拍：图的数据源就是同一 list API；`--assert` 打印各流节点/边计数（pur_orders 6 节点/8 边），与 psql 孪生 [w3-b4-psql.txt](../../../../../research/2026-09-27-w3-usability/w3-b4-psql.txt) 一致。
- 编辑旅程（[w3-b4-journey.txt](../../../../../research/2026-09-27-w3-usability/w3-b4-journey.txt)）：pur_orders 200000→150000（extras + 条件字面量 + 审计行）→探针绿→新 ¥180,000 PO 提交后一审路由到 `pending_level2` 且 gm 待办已开；so_orders 配置 500000→新 ¥550,000 SO 路由 `pending_level2`；双双复原基线（pur_orders 200000/容差 0.1，so_orders 移除键）且全程探针绿、每一步都有审计行追加。
- 负例 ×4（[w3-b4-consistency.txt](../../../../../research/2026-09-27-w3-usability/w3-b4-consistency.txt)）：孤儿转移、空 config_note（表单拒绝的 API 孪生）、双激活、阈值漂移各自令探针以预期消息变红，且清理后零残留、探针复绿。
- ACL 双视角：admin 可见菜单项与完整编辑入口（[w3-b4-map-page.png](../../../../../research/2026-09-27-w3-usability/w3-b4-map-page.png)）；member（quality_lead）菜单不可见、URL 直达 404（[w3-b4-member-url-404.png](../../../../../research/2026-09-27-w3-usability/w3-b4-member-url-404.png)）；member API 写探针 403、只读 list 200。
- 零回归：`setup-nocobase.mts verify` 绿（含 B4 新断言块：路由 + 绑定 + JSBlock code + 四表 + 编辑表单 + config_note 必填 + member 授权 + import 的探针）、b9 链 s2 绿、`--assert-ledger` 平衡（32 组/138 条流水）、approval-engine `--selftest` 绿（引擎零改动——approval-engine.mts 无任何代码变更）。
