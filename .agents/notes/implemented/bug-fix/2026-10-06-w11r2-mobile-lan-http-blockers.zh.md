# Agent Note: W11-R2 移动端 LAN HTTP 交付障碍——幂等键 secure-context 兜底、附件持久化卫生、批失败 Toast 聚合与登出键清扫

Status: implemented

[English](2026-10-06-w11r2-mobile-lan-http-blockers.md) | 中文

## 问题

W11-R1 复验以 PASS_WITH_DEBT 87.8 收口；Go-live 判定「LAN HTTP 形态在完成本批前不应交付现场」。四项真话债，全部有配方：

- **`newClientMsgId` 裸调 `crypto.randomUUID()`（头号 Critical 存量，w7 引入）**：`sessionsService.ts` 用裸调（secure-context-only）构造发送幂等键——LAN HTTP（`isSecureContext === false`）下点发送在 wire 尝试之前就抛 `TypeError: crypto.randomUUID is not a function`，`setSending(true)` 永不复位、composer 死锁、消息静默丢失。W11-R1 的 `uid()` 兜底覆盖了附件 id 与 rpcId；这处调用点早于该轮并漏网。
- **附件持久化无卫生**：`loadPersisted`/`savePersisted` 信任 `localStorage`——损坏 strip 解析为 `[]` 且滞留；quota 超限写入直接穿透 `commit()` 打断挑件管线；没有任何含 key 名的可 grep 日志。
- **批失败 Toast 只报 N 之一**：Composer 的一次性 failed 附件 Toast 用 `find` 取第一条 fresh failed——三个附件同批次失败时各渲染周期各报一部分真相（同一 commit 的批次只点名第一个成员）。
- **登出残留附件键**：W11-R1 的 strip 持久化在 `dsh-mobile-attachments-<sid>`，但登出路径只清 outbox 与工作队列——离场账号的附件 strip（及草稿编辑残留）泄入下一次登录的存储。

## 决策

- **幂等键改骑 `uid()`**（`newClientMsgId` 以 `uid().replace(/-/g,'').slice(0,8)` 为 nonce——去连字符使 UUID 与 16 字节 hex 兜底两臂都产出 8 位 hex），且键构造**移入 `ChatView.send()` 的 try 块内**：此处的任何失败走同一 catch/finally，`setSending(false)` 必然执行。catch 的 TypeError 分支在键构造本身死亡时重新生成新键——安全，因为失败的构造之下从未派发过任何尝试。
- **持久化卫生对齐 outboxStore**：`savePersisted` 以 try/catch 包 `setItem`，输出结构化 `console.warn` 追踪（`attachments.persist-failed` / `attachments.persist-quota` / `attachments.persist-corrupt`，全部含 key 名）；quota 超限**驱逐最旧的其他会话 strip**（以新增 `savedAt` 字段排序，version 1→2——解析失败的 strip 记为最旧，驱逐顺带清残留）并重试一次；`loadPersisted` 删除损坏或不符合 schema 的 key 而非滞留。`isQuotaExceeded` 以 `name === 'QuotaExceededError'` 判定、不要求 `instanceof Error`——规范中的 DOMException 不是 Error 子类。
- **批失败 Toast 聚合**：Composer 每次 commit 收集**全部** fresh failed 行（对 `attachments` 做 `filter`）并只 Toast 一次——`「N项附件上传失败：『a』原因A；『b』原因B」`——`toasted` 集合仍按行 id 去重。
- **登出清扫单一来源**：新 `localKeys.ts` 导出 `MOBILE_SESSION_KEY_PREFIXES = ['dsh-mobile-draft', 'dsh-mobile-outbox', 'dsh-mobile-attachments']` 与 `sweepSessionKeys()`；`App.onLogout` 在 `clearOutbox`/`clearWorkOutbox`/`clearIdentity` 之后执行（它们仍负责定时器与内存态；sweep 只负责键空间）。前缀之外的键——主题、已读水位、置顶——按设计在登出后保留。

## 后果

ui-mobile 754/754（R2 期新增：views LAN HTTP 终态 2、attachments 卫生 4、composer 批 Toast 1、local-keys 4；原记 745 系低报 9，W11-R4 勘正）、typecheck 绿、改动文件 oxlint 0 errors。活体复验 `w11-r2-live-verify.log` 9/9，跑在**真非 secure 上下文**——`http://w11lan.test:3080` 经 Chromium `--host-resolver-rules` 映射到 127.0.0.1（CLI 按设计拒绝非 loopback 绑定；/api 信任围栏经 `--trusted-host` 加白该 authority）：环境面断言 `isSecureContext === false` 且 `randomUUID === undefined`，零 stub；点发送到达终态（wire 携带 uid 兜底产出的 `m_` 前缀 `clientMsgId`、draft 清空、所开启回合结束后 sending 复位、第二条以不同键再发、history 落账）；同一形态下 ready 附件 strip reload 回填；登出清空全部三类种子键而 theme 键保留。截图 `w11-r2-{01-lan-http-send-terminal, 02-attach-rehydrate-insecure, 03-logout-swept}-375.png`。

lib 产物契约教训复确认：`apps/web` 以 bare import 引 `@deepseek-ai/dsh-client-ui-mobile`（main → `lib/`），源码修复要到达被服务的 dist 必须 `pnpm run build:lib:client` **之后**再跑 apps/web 的 vite build——第一次活体跑在新 dist 之上服务了旧 lib，忠实复现了修复前的崩溃。

## 备选方案

- **键构造留在 try 外、只换 `uid()`**——修掉已知崩溃，但 `promptSession` 之上未来新增的每一行都距同样的 sending 卡死只差一次重构；try 覆盖整个尝试。
- **按 key 名序驱逐而非 `savedAt`**——会话 id 不携带顺序；持久化时间戳每 strip 一个数字，排序正确。
- **`loadPersisted` 兼容读 version-1 strip**——strip 是刷新缓存不是台账；pre-release 立场拒绝旧盘上格式（损坏键删除已处理残留）。
- **各 store 自行向 sweep 注册键**——三次注册调用要保持同步，对比紧挨唯一消费方的一个数组。
