# 批次 1：壳 + 聊天流 + AI 同事列表（微信式重做第一步）

> 前置：[PLAN.md](PLAN.md) | 产出：可用的微信式 AI 同事聊天界面（不含提交落库闭环）

## 1. 范围

- 引入 antd-mobile v5 + v2 设计令牌落地；
- 两 Tab 壳（消息/我的）重写 `MobileShell`；
- 会话列表（六要素/搜索/筛选 chips/未读本地派生）；
- 聊天流（气泡分侧/日期分隔/工具行/thinking 态/快捷指令/输入条）；
- AI 同事通讯录（agentPreset.list 驱动 + 渐变头像映射）；
- 登录页视觉升级（演示级验证码逻辑不动）；
- e2e/golden 重录（shell + 新 chat 旅程）。

**不做**：草稿卡可编辑与提交闭环（批次 2）；WS 推送（D5）；暗色（批次 2 打磨）；aiEmployees 元数据通道（后续可选）。

## 2. 文件清单

| 文件 | 动作 |
|---|---|
| `packages/client/ui-mobile/package.json` | + `antd-mobile`、`lucide-react` 依赖（MIT；过 license/notices 门禁） |
| `packages/client/ui-mobile/src/client/tokens.css` | 重写：v2 令牌（PLAN §7.1）+ `--adm-*` 覆盖 |
| `packages/client/ui-mobile/src/client/shell/MobileShell.tsx` | 重写：两 Tab（antd-mobile TabBar + SafeArea） |
| `packages/client/ui-mobile/src/client/router.ts` | 路由表更新：`#/chats`（默认）、`#/chat/<id>`、`#/contacts`、`#/me`、`#/login`；旧路由 hash 重定向到 `#/chats` |
| `packages/client/ui-mobile/src/client/messages/MessagesView.tsx` | 重写：会话列表（NavBar+搜索+筛选 chips+列表项六要素+右上角新建）；左滑 SwipeAction（置顶本地态/已读） |
| `packages/client/ui-mobile/src/client/messages/ChatView.tsx` | 重写：聊天流容器（column-reverse 锚底/日期分隔/visualViewport 键盘适配）+ 气泡（AI 左白底/用户右主色底，16px+4px 小角）+ 工具行/thinking（复用 fold 投影与 TOOL_LABELS）+ 底部输入条与快捷指令 chips + 停止生成（session.cancel） |
| `packages/client/ui-mobile/src/client/contacts/ContactsView.tsx`（新） | AI 同事列表：渐变头像（primary→info 基准，按同事色相偏移）、名字、职责、可填表单说明、发消息入口（createSession(preset)→chat） |
| `packages/client/ui-mobile/src/client/profile/ProfileView.tsx` | 改造：身份卡 + 通讯录入口 + 设置（暗色开关占位） |
| `packages/client/ui-mobile/src/client/login/LoginView.tsx` | 视觉升级（antd-mobile 表单件），逻辑不动 |
| `packages/client/ui-mobile/src/client/colleagues.ts`（新） | preset id → 渐变色相/图标/职责文案 的本地映射表（agentPreset 元数据增强层） |
| `packages/client/ui-mobile/src/client/sessionsService.ts` | 增补 `session.search` 方法名与包装 |
| `packages/client/ui-mobile/tests/views.client.spec.tsx` 等 | 随重写更替用例；router/services 用例更新 |
| `apps/web/tests/mobile-shell.e2e.ts` | 重录：登录→两 Tab→会话列表→聊天流（golden 更新） |
| `apps/web/tests/mobile-chat.e2e.ts`（新或并入 shell） | 聊天旅程：进入 AI 同事会话→发送→轮询渲染回复→快捷指令 |

## 3. 关键实现要点

1. **antd-mobile 主题**：`.dshm-root` 上覆盖 `--adm-color-primary: #192b4d` 等全局变量（CSS 变量沿 DOM 继承级联进库组件）；入口 `import 'antd-mobile/es/global'`。
2. **未读角标（本地派生）**：`session.list` 的 `updatedAt` + 本地 localStorage 已读水位对比得出"新消息未读"；刷新后重置——UI 不冒充服务端未读。
3. **聊天流渲染输入**：沿用 `readHistory` → `foldHistory`（[fold.ts](../../packages/client/ui-mobile/src/client/fold.ts)）→ ChatItem 投影；AI 消息（含任务卡草稿，批次 1 先只读展示）渲染为左侧气泡 + 卡片；工具调用渲染为折叠行（中文标签 TOOL_LABELS）。
4. **新建会话**：通讯录点同事 → `createSession(agentPreset)` → 跳 `#/chat/<id>`；右上角 "+" → 通讯录。
5. **列表轮询**：复用 usePoll（会话列表 4s、聊天流 1.2s 运行/5s 空闲——M3 验证参数）。

## 4. 验收标准

1. `pnpm run build` 通过；`pnpm run test`（ui-mobile per-file 100%）通过；hygiene（license/notices）通过。
2. `pnpm run test:web -- mobile-shell`（与 mobile-chat，如拆分）全绿，golden 重录。
3. 真实浏览器 390×844 截图存 `examples/kb-agent/demos/mobile-v2/01-shell-chat/`：登录、会话列表、聊天流（含 AI 回复与工具行）、通讯录、我的，至少 5 张 + GIF。
4. PC 会话页"移动端预览"tab 内呈现同款界面（iframe /mobile）。
5. 首屏 bundle 变化记录：构建 profile 对比 v1（antd-mobile 按需后 gzip 增量写入交付说明）。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| staticLinked 打包 antd-mobile 体积/构建问题 | 批内第一步先做"引入+空壳构建冒烟"，失败即回退评估 tdesign 备选 |
| fold 投影对新 UI 的字段缺口（如日期分隔需要时间戳） | fold 已带事件时间；缺口在视图层补齐，不改 wire |
| e2e golden 重录工作量大 | 只重录受影响断言；seed 模式保留 |
