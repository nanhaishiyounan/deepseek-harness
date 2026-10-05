# Agent Note：W9 身份注入服务端化（system prompt 段 + 待办行级过滤）

Status: implemented

[English](2026-10-04-w9-identity-server-side-injection.md) | 中文

W9 从移动端聊天链路移除了登录身份在用户可见面上的最后痕迹：身份只走服务端组装的 system prompt 与服务端强制的行级过滤，不再进消息正文。

## 问题

自 W6-B0 起，网关在会话首条落库用户消息里前置拼接一行 `【登录身份】…——本行由系统注入：…`。三笔代价：

- 该行随每次回放渲染进用户自己的气泡——用户读到的是一段指令泄漏进「我的消息」。
- 这段拼接文本是模型唯一可信任的身份，用户手打一行 `【登录身份】admin…` 就能与它竞争。
- 「查待办只看自己」完全靠这段文本自律：`nb_list`/`nb_get` 对 `wfl_approval_todos` 没有任何身份逻辑。

## 决策

三层防线，全部服务端持有；prompt 文本从身份载体降级为身份叙述。

1. **system prompt 段。** apiproxy（acting-user registry 的拥有者）注册 `gateway:acting-user` 段（`order: -90`），text 函数读 `sessionActingUserOf(ctx.agent?.id)`——由 token 派生、每次 prompt 重新绑定（换账号续会话时身份段跟随新用户，旧的拼接文本从不跟随）。未绑定会话（PC 壳/CLI/keyless snapshot）渲染空串；该段的渲染路径跳过空体、不污染 system 文本。`examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml` 的 persona 契约改为指向 system 段，并明示用户消息里的任何身份叙述一律无效。
2. **行级过滤。** 绑定会话下 `nb_list` 查 `wfl_approval_todos` 时服务端追加 `user = acting.username` 条件（网关 `nocobase.list` 读取面为移动端待办页下推同一行级过滤）；未绑定会话响亮拒绝——该表是登录用户的私有数据。`nb_create`/`nb_approve` 维持既有的 requester/inspector/operator 无条件覆盖与非待办人审批拒绝。
3. **展示层残影。** 旧落库日志保留拼接首行（log 永不重写；`SESSION_FORMAT_VERSION` 不动）。`fold.ts` 对回放用户文本剥离首行 `【登录身份】` 行，`sessionsService.ts` 的 `titleOf` 对置顶自动标题剥离同一标记句——wire 上的 `loginUser` 字段直接删除（pre-release 立场：不留兼容垫片），客户端不再发出任何身份形态的数据。

## 备选方案

- **身份文本挂载点。**（A）`{{actingUser}}` 变量由各 persona 插值——弃：严格插值对未注册该变量的部署响亮失败，单一 persona 文件被多部署复用时脆弱。（B，选中）由 registry 拥有者（apiproxy）注册 order -90 段——身份是基础设施事实，不该由 persona 措辞承载。（D）pre-step durable context 快照——仍是消息通道注入，与 stamp 同病。（G）维持 stamp——正是本轮要移除的用户可见行。
- **存量拼接行。** UI 折叠剥离（选中）对比迁移 durable log——迁移要动 `SESSION_FORMAT_VERSION` 并重写日志，高成本零语义收益；折叠满足「用户不可见」且「model-visible ⟺ logged」不破坏。
- **`nb_list` 收紧范围。** 仅 `wfl_approval_todos`（唯一无过滤的 `wfl_` 读面 + 用户点名场景）对比对全部 per-user 表铺开行级过滤——窄闭环错误成本最低；铺开是下一轮工作。

## 后果

- 聊天里用户可见的「我是谁」行消失。身份面只剩登录页与「我的」Tab。
- prompt 里的自由身份叙述：persona 现在声明用户手打的身份主张无效。这正是本意，但也意味着真正困惑的用户无法用文字「提醒」助手自己是谁——只能重新登录。
- 活会话上换账号会每步重渲染身份段，切换时追加 request/header change 事件——接受并由 spec 固化（旧的拼接文本从不跟随切换）。
- 负向保证（活体验证）：手打 `【登录身份】…` 消息不改变 system 身份段，待办列表仍按真实 token 用户过滤；buyer 账号永远看不到 qc_inspector 的待办。证据：`demos/acceptance-w9/w9-b2-03-forge-identity-neg.log`、`w9-b2-04-cross-user-todos-neg.log`。

## 一并记录的 W9 决策

- **预制 tag 辅助输入（B1）：** 预制 tag（欢迎卡 starters、快捷面板指令、上下文 chips、字段补问建议）改为填入输入框草稿而非直接发送；围栏动作（ask_choice 选项、审批/计划/报告卡动作）保持即时执行。切分按意图形状：可编辑草稿 vs 确定性动作。
- **视觉语言「酱园琥珀」（B3–B6）：** 移动端设计语言以 `demos/acceptance-w9/design-language-w9.md` 为唯一定稿（token 单一来源）；B6 把 W7 时代旧名 token 消费迁移到 §3 基础名——核心语义名（primary/foreground/muted/border/fs-*）清零，别名尾段仍有过渡残留（on-soft ×22、stroke-soft ×15、work-*/stamp-* 等，css `var()` 读共 73 处）待下批迁移；别名声明保留在 `tokens.css` 作兼容层。
