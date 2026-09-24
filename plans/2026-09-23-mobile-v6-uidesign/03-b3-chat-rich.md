# B3 · 聊天页视觉 + 富消息组件映射 + 快捷面板

> **子任务必载技能**：`high-end-visual-design`、`frontend-design`、`ui-ux-pro-max`（antd-mobile TextArea/Toast/Modal 触面）。
> **前置**：B1/B2 已合并。设计稿参照：聊天气泡/打字指示 135-159 行、富组件 161-266 行、输入栏/快捷面板 268-291 行；渲染引擎 782-813 行（renderRich）、820-900 行（addBubble/openChat）。

## 范围

`#/chat/:id` 全页视觉对齐 + ChatItem 九成员的富组件视觉映射 + 输入栏/快捷面板 + WorkDetail 时间线。**绝对不动**：promptSession→usePoll→foldHistory 链路、围栏协议解析、cardState 相位重放、M1-M4 动作消息语义。

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/client/ui-mobile/src/client/messages/ChatView.tsx` + `chat.module.css` | ①chat-header：返回钮 44px + 头像 + 姓名 16/700 + 状态行（在线=ok 色）+ 更多钮；②气泡：bot=card 底 + border + 左上角 6px + shadow-card，user=`--dshm-user-grad` 渐变 + 白字 + 右上角 6px，max-width 78%，入场 `msgIn .28s`（translateY 9px 起）；③day divider（11.5/sub 居中）；④打字指示器三点动画（`.18s` 递进 delay）——demo 态保留现有触发（发送后 2.5s 无新事件），live 态 RunningRow 同款视觉；⑤底部输入栏：+ 钮 44px 圆角 12（面板开=brand-soft 底品牌色）、输入框圆角 22、渐变圆形发送钮 44px（禁用态 opacity .45） |
| `packages/client/ui-mobile/src/client/messages/chat.module.css`（或新 `quick-panel.module.css`） | 快捷指令面板：底部上滑 sheet（圆角 18 18 0 0 + 上投影），2 列网格 6 指令（46px 高、图标 17px 品牌色）+ 底排 语音/文件/表情 三占位（点击 toast「演示版暂未开放」——**不实现真实语音/文件**）；指令数据源 = 当前会话同事 starter chips（WelcomeCard 同源），点选即以用户消息发出并收起面板 |
| `packages/client/ui-mobile/src/client/forms/v3/DraftCard.tsx` / `ReceiptCard.tsx` + `v3.module.css` | rich-card 基底：card2 底 13px 圆角 + 标题 15/700 + 字段行（56px 标签列 sub 色 + 虚线分隔）；user 侧变体（白 14% 透明底）不适用——现有卡片均在 bot 侧，仅 bot 形态 |
| `packages/client/ui-mobile/src/client/messages/ReportCard.tsx` | 指标网格 → `table` 形态（fixed 列宽、th 12/sub、td 上行染色 ok/下行 danger、tnum）；表格超限仍按围栏契约截断；可选柱状视觉 = `bars-fallback` 纯 CSS（flex 底对齐柱 + `grow .7s` 动画，**不引 echarts**）；动作按钮 → `btn-row` 三态（pri=brand 实底 / ghost=brand-soft / gray=card2+border） |
| `packages/client/ui-mobile/src/client/messages/RichContent.tsx` + `rich.ts` | markdown 代码块 → `code-box`（深底 #131926/暗 #0C111A + 语言标签 11.5 + 复制钮：navigator.clipboard→execCommand 兜底→Toast「已复制」）；`**bold**` 渲染保留（markdown-it 已有） |
| `packages/client/ui-mobile/src/client/messages/ChoiceBubble.tsx` / `WelcomeCard.tsx` | quick chips：44px 高胶囊、14px 品牌色、brand 边框 35% 透明、按下 scale .95；点选行为不变（以用户消息发出） |
| `packages/client/ui-mobile/src/client/messages/FieldAskBubble.tsx` / `ActionBadge.tsx` | 字段追问行/确认动作行 → notice 提示条（brand-soft 底 + info 图标）与 btn-row 组合；确认/驳回动作语义与动作消息不变 |
| `packages/client/ui-mobile/src/client/fold.ts`（degraded 渲染处） | 降级行 → notice 警示形态（保留「协议不可见」e2e 负断言的文本语义） |
| `packages/client/ui-mobile/src/client/work/WorkDetailView.tsx` + `work.module.css` | 执行时间线 → `timeline` 网格（56px 时间列右对齐 + 10px 轴点带 brand-soft 光环 + 2px 轴线，末行无轴线）+ progress 渐变填充条（`width .8s`）；live 轮询/demo 脚本双态逻辑不动 |
| `packages/client/ui-mobile/src/client/forms/task-cards.tsx` + `task-cards.module.css` | task-card 视觉 → `todo-box` 形态（勾选框 19px 圆角 6、done=划线+sub、计数 `0/N` tnum 同步）——勾选仍写 cardState 相位（durable log 重放一致），**不新增本地勾选状态源** |
| `packages/client/ui-mobile/tests/`（触面 spec） | 气泡类名/结构、代码块复制交互、quick-panel 开合与指令发出、ReportCard 表格形态、时间线行结构 |
| `apps/web/tests/mobile-assistant.e2e.ts` + golden | aria golden 重录（`chat.expected.md`）；「协议围栏不可见」负断言必须保持通过 |
| `packages/client/ui-mobile/README.zh.md` + `README.md` | 聊天视觉与快捷面板说明（双语） |

## 关键实现要点

1. **快捷面板挂载点**：ChatView 底部（chat 路由为全屏层，无 tabbar 冲突）；开合状态本地 useState，切路由自动收起（参考设计稿 showPage 里 `remove('show')`）。
2. **渐变应用面收敛**：user 气泡、发送钮、hero（B2）、progress 填充四处用 `--dshm-user-grad`；其余表面一律纯色——防模板化渐变滥用（`high-end-visual-design` 红线）。
3. **代码块复制**：RichContent 渲染的 `<pre><code>` 加复制钮；纯前端交互，不产生会话事件（不违反「模型可见⟺日志可重建」——复制不改模型输入）。
4. **toast**：沿用 antd-mobile Toast，样式微调对齐设计稿（暗底胶囊）；「演示版暂未开放」占位文案仅限语音/文件/表情三钮。
5. **不做清单**（再强调）：rating 五星、echarts、剧本 FLOWS、busy 排队模拟、8 虚构同事。

## 验收标准

- [ ] `pnpm vitest run packages/client/ui-mobile` 全绿；typecheck + oxlint 过；`pnpm run build` 过。
- [ ] e2e 三件套过：`mobile-shell` / `mobile-assistant`（含围栏不可见负断言 + aria golden 已重录）/ `mobile-preview-iframe`。
- [ ] 截图对账（`research/2026-09-23-mobile-v6-uidesign/b3-*.png`，亮暗双轨、390×844）：①`b3-01-chat-welcome`（starter chips 新形态）②`b3-02-chat-draft`（DraftCard rich-card 基底）③`b3-03-chat-ask`（ChoiceBubble/FieldAskBubble）④`b3-04-chat-receipt`（ReceiptCard）⑤`b3-05-chat-report`（ReportCard 表格 + 动作行 + 可选柱状）⑥`b3-06-chat-code`（深底代码块 + 复制钮 toast）⑦`b3-07-quick-panel`（上滑面板 6 指令 + 三占位）⑧`b3-08-typing`（三点动画任一帧）⑨`b3-09-work-timeline`（时间线 + progress）⑩`b3-10-task-card`（todo 勾选态）。种子会话复用 v5 `.shoot.mjs` 的 seed.jsonl 注入模式（读 e2e golden 种子裁到报告回合）。
- [ ] 行为回归：发送真实消息走 promptSession（e2e/日志断言）；工具行（TOOL_LABELS）与降级行语义不变；勾选 task-card 后刷新页面相位仍一致（cardState 重放）。
- [ ] `grep -rn "echarts\|rating\|rate-star" packages/client/ui-mobile/src packages/client/ui-mobile/package.json` 零命中。
- [ ] Agent Note 已附；README 双语已更新。

## 风险与回滚

- ChatView 832 行是最热文件：改动收敛在 JSX 结构与 className，逻辑分支不碰；每步跑 vitest 红名单。回滚按文件 revert。
- aria golden 重录风险：只重录受影响断言；「协议不可见」负断言若因视觉重排失效，修渲染不改断言语义。
- quick-panel 若与 safe-area/键盘弹起冲突：面板 bottom 锚 `calc(输入栏高 + safe-area)`，参照设计稿 `bottom:58px` 语义适配全屏层。
- task-card 勾选若与 cardState 相位模型冲突：**只做视觉映射，交互保持现相位流转**；无法映射的细节（如设计稿纯本地勾选）放弃，记录进 Agent Note。
