# Agent Note：W11-R1 移动端附件六项修复——outbox 双发收口、secure-context id 兜底、failed 可见性、发送门禁单源、刷新存活与探针真话债

Status: implemented

[English](2026-10-05-w11r1-mobile-composer-attachment-fixes.md) | 中文

## 问题

W11 终验 FAIL 80.5（核心意图全达成）遗留 1 Critical + 5 Important，全部窄修复面：

- **outbox 附件双发（Critical）**：`ChatView.send()` 的离线入队分支只 `setDraft('')` 缺 `lane.clear()`（与在线成功路径不对称）——离线发送后 ready 附件 chip 残留，恢复后补发文字时同一 `📎` quote 随下一条再次上 wire（活体实锤见 `vfy-w11-ps-t1-offline-outbox-attach-lingering-375.png`）。
- **randomUUID 裸调用**：`attachments.ts` 两处 id 与 `rpc.ts` 的 rpcId 直接 `crypto.randomUUID()`（secure-context-only）——LAN HTTP 部署面（无 HTTPS）下拍照/相册/文件三链路与登录全部静默失效（存量 rpc.ts 先炸，附件两处是 W11 新增同型）。
- **attachError 剪裁不可见**：`.attachError` 绝对定位 `bottom:-16px` 悬在 chip 外，`attachRow` 的 `overflow-x:auto` 把它剪掉，且无 Toast——失败原因用户不可见。
- **发送门禁不感知附件**：发送钮 `disabled` 只看 `draft.trim()===''`——纯附件（ready）时按钮死灰，与 `composeWithAttachments`「quotes alone 可发」的语义相悖。
- **ready 附件零持久化**：纯 useState——刷新/切后台回收即丢，用户重挑重传。
- **真话债**：`INDEX.md` 声称 fillDraft A0~A9 再绿，实测 A5 FAIL；根因是探针量错元素（读 textarea 外层 inputShell，`data-fill` 挂在 inputRow），产品无回归。

## 决策

- **finalizeSend 单点收口**：提取 `finalizeSend()`（清 draft + `lane.clear()`）挂在三个发送终态（在线成功 / outbox 入队 / 服务器拒绝）——三个终态的输入区复位对称化，未来发送级清理只改一处。拒绝分支也清空是刻意的：保留 chip 的"重试"路径与离线残留是同构的双发窗口，失败事实由 ErrorToast 单次告知。
- **uid() 兜底**：新增 `uid()`——优先 `crypto.randomUUID`，缺失时 `getRandomValues(16 字节)` 拼 32 位 hex（这些 id 只需不透明唯一性，与服务端无格式契约）；三处调用点统一替换。`getRandomValues` 在非 secure context 仍可用。
- **错误行入 chip**：`.attachChip` 加 `flex-wrap: wrap`，`.attachError` 改 in-flow 第二行（`flex-basis:100%` + `--dshm-fs-caption`）——chip 自身撑高、轨道不再剪裁；同时 Composer 对新增 failed 行做一次性点名 Toast（`toasted` Set 按 id 去重，chip 上的错误行长期携带细节，Toast 只负责即时引起注意）。
- **canSend 单源**：`canSend = (draft.trim() !== '' || hasReadyAttachment) && !sending`——uploading/failed 不上 wire 也就不激活发送（与 compose 过滤同源语义）；发送钮与 Enter 处理器绑同一 flag。
- **会话域持久化**：`useAttachments(sessionId?)`——ready 描述符（id/kind/name/sizeBytes/quote）在 `visibilitychange→hidden` 与 `pagehide` 时写 `dsh-mobile-attachments-<sid>`（quote 必须随行：File 句柄消失后它是内容唯一可恢复形态）；挂载时 useState 初始化器同步回填为 ready 行（thumbUrl 不可恢复，image 回退 glyph）；`commit()` 内联同步持久化，clear/remove 后存储立即收敛——已发送附件不会在刷新后复活。
- **真话债清偿**：探针选择器改 `slot.closest('div[class*="inputRow"]')`；INDEX 两处措辞按实测改写（A1–A4/A6–A9 过、A5 为探针错误、R1 修正后复跑全绿），另附 R1 证据节。

## 后果

ui-mobile 743/743（新增 composer.client 7 + uid 2 + attachments 4 + composer-skin CSS 契约 1 + views outbox 双发 1）、apiproxy 488/488、typecheck 绿、oxlint 0/0。活体复验 `w11-r1-live-verify.log` 16/16：离线入队后 chip 零残留（attachRow=0）、wire 上 3 次重试共享同一 clientMsgId（服务端幂等折叠）、history 恰 1 条带 quote、补发纯文字 wire/history 双侧无附件；failed 错误行 errTop=725 ≤ chipBottom=748 且在滚动轨道内、字号 12px；空 draft+1 ready 附件激活发送钮；randomUUID stub undefined 下登录与附件链路均 ready；reload 后 ready 附件回填。A5 修正探针复跑 A0~A9 + B 11 路由全绿（`w11-b1-regression.log` 更新）。

## 备选方案

- **只给出队分支补 lane.clear()**——最小 diff，但三终态继续不对称，下一个"发送级清理"需求仍会漏挂；finalizeSend 是把对称性固化为结构。
- **uid 采用完整 UUID v4 手工构造（版本/变体位）**——消费方（服务端幂等键、chip key）不读格式，手工位只是仪式。
- **failed 错误行维持绝对定位但抬高 z-index + 轨道留 padding-bottom**——仍依赖轨道几何配合，两行布局让 chip 自己为自己负责。
- **附件持久化写索引仓库（IndexedDB）存 blob**——ready 附件的可用形态是 quote 文本（发送面就是文本），存 blob 是为不存在的"重传原图"功能买单。
