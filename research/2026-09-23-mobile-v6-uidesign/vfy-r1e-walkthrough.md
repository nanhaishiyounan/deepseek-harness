# vfy-r1e — Hands-On Exploration walkthrough（R1 修复批次浏览器终验）

- 日期：2026-09-24（本地 08:00 前后）
- 执行者：verify-executor hands-on 组（独占 dev server + chrome-devtools）
- Server：`pnpm dsh web --no-open --patch apps/web/tests/mobile.overlay.yml` → http://127.0.0.1:3080（/mobile 200）
- 视口：430x932@2 与 390x844@2（emulate viewport）
- Context：页面 12（默认 context，演示登录 13800138000；runmode 切 demo）

## 场景执行记录

### A — ProfileView 回执序 ✅
- `#/me` 最近回执：№21(¥4,500) → №20(¥30,000) → №19(¥10,000)，新→旧（sessions newest-first + `receipts.slice(0,3)`，ProfileView.tsx:98）。
- 本机 seeded 数据无 №1042-1044（前组会话数据不在本 server），按任务降级断言成立。
- 点 №21 → `#/chat/session-b1398077…`，滚动定位回执卡：「已登记·采购单」+绿对勾+№21 徽标+¥4,500+PO-2026-0850+三步绿点（对话/确认/已落库）全绿，无协议泄漏。
- 与 r1-01（№1042/¥6,400/三步绿点/无泄漏）交叉对账：同一模板形态一致。

### B — 双击防护 ✅
- WorkView 工具卡「标准模式」同 tick `btn.click(); btn.click()`：`session.create` 仅 1 次（reqid=149），hashchange 1 条。
- AgentsView 行「标准模式」同 tick 双击：`session.create` 仅 1 次（reqid=165），hashchange 1 条。
- 行级锚定（fetch seam 延迟 create 2.5s）：行 A `disabled=true`+「创建中」DotLoading、行 B `disabled=false`；busy 期间点行 B `createCalls` 保持 1（startingRef 全局锁 + startingId 行级视觉）。

### C — typing 回合结束消失 ✅（事件流经页面内 fetch seam 注入）
- 环境限制：server 无 minimax adapter（prompt 返回 `model-unavailable: no adapter serves provider "minimax"`），无真实模型回合。
- 真实失败路径：prompt 被拒 → 输入框草稿保留、无假呼吸点、瞬时 ErrorToast（Toast.show），可重试。
- 模拟回合（patch window.fetch：prompt ok:true + history 状态机）：
  - 发送后输入框清空；t=2.5s `_typingRow_1pur4_302` 渲染（呼吸点出现，role=status）。
  - `__arriveNow()` 事件到达 → 下一 poll（≈1.5s）typing false；末条完整 AI 回复渲染。
  - 再等 10.5s：typingResidual=false、statusNodes=0，无残留。
- 与 r1-02 对账一致（呼吸点消失+末条完整回复+输入框就绪）。

### E — HomeView 离线错误态 ✅
- emulate Offline + hash 导航（#/chats→#/）强制 HomeView remount（roster/sessions 均 useAsync 无轮询）：
  - 两条 role=alert：「同事目录加载失败：Failed to fetch 重试」「最近对话加载失败：Failed to fetch 重试」，重试链接 x2。
  - emptyStates=[]（无「暂无会话/还没有对话/未配置」空态文案）。
  - 分区降级：问候/台账统计/快捷入口保留。
- 恢复网络 + 点两个重试：800ms 内 alerts=0、roster 4 卡恢复、最近对话恢复。

### F — 暗色 v3 按钮对比度 ✅
- 深色模式（localStorage dsh-mobile-theme=dark）+ №21 会话 v3 待确认卡：
  - ghost「驳回」：rgb(232,236,244) on rgb(27,44,74) → **11.78:1**
  - 主「确认写入」：rgb(232,236,244) on rgb(21,27,38) → **14.58:1**
  - 验收线 ≥3.5:1，均通过；与静态审计 11.8:1 吻合。

## 探索记录
- Console：全程无 error/warn；仅 1 条 issue 级提示「A form field element should have an id or name attribute」。
- 视口溢出：#/ #/chats #/agents #/work #/me #/tasks #/files 在 390 下 scrollWidth==innerWidth，无横向溢出；chat 430 同样无溢出。
- 主题持久化：切暗色 reload 后 bodyBg 保持 rgb(10,14,21)。
- 长名称：rosterName/Role/Tag 三处 text-overflow:ellipsis（agents.module.css:148-177）；DOM 注入 30 字名实测 nameClippedToEllipsis=true、行不溢出。
- 回执 0 条：ProfileView `recent.length > 0` 才渲染区块（182 行）——0 条时整块隐藏，无空态文案。
- Network：全程 session.*/agentPreset.list/nocobase.* 均 200，无 4xx/5xx 静默。

## 截图清单（本目录）
vfy-r1e-00-home-light-430 / 01-profile-receipts-430 / 02-chat-receipt-1042-430（空态-无效会话）/ 03-chat-receipt-no21-430 / 04-receipt-card-detail-430 / 05-receipt-no21-card-430 / 06-typing-visible-430 / 07-typing-cleared-final-430 / 08-home-error-offline-430 / 09-home-recovered-430 / 10-v3-buttons-dark-430 / 11-home-dark-390

## Server 收尾
- 验收完成后 `pkill -f "apps/cli/src/bin.ts .* web"` 释放 3080。
