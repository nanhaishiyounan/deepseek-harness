# 智能表单助手（mobile-form-assistant）

[English](README.md) | 中文

M3 移动端的 AI 填表员工：从对话描述抽取业务单据字段、缺槽追问，每张结构化卡片（选择/草稿/回执/报告/审批/计划）都以经校验的 `present_card` 工具调用呈现（移动端渲染为可编辑卡片），仅在用户明确「推送」确认后调用 `nb_create` 写库。旧 dsh 围栏会话仍经客户端只读围栏通道回放。

- `preset.yml` —— 预设名称与描述（roster 发现入口）。
- `agent.cordis.yml` —— agent 平面组合：persona + NocoBase 工具行。不挂检索与破坏性工具——本员工只负责业务单据登记。
- 写入契约由 persona 承载：预览（JSON 草稿）→ 用户放行（`确认推送` 附最终字段）→ `nb_create` → 固定格式回执 `业务表 <collection> 行 id=<n> 已创建`；驳回（`驳回`）即作废不写库。

移动端工作台的「智能表单」入口创建绑定本预设的会话；PC 工作台可打开同一会话看到完全相同的转录（同一 sessions 存储）。移动端演示流程见 [`QUICKSTART.zh.md`](../../QUICKSTART.zh.md)。
