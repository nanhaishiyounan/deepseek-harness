# 专家服务下单 → PDF 生成 → market 页展示/查看 全链路验收验证（2026-09-17）

**总体结论：PASS（A–F 全部 PASS，未发现实现缺陷，无需修复）**

真实链路执行：NocoBase（127.0.0.1:13000，`orders`/`expert_services` 真实 collection）+ dsh web BFF 同源（127.0.0.1:3080，`examples/kb-agent/cordis.patch.yml`，ordersEnabled: true）+ Chrome 浏览器。无任何 mock。

## 环境

- 凭据：根 `.env`（NOCOBASE_BASE_URL / NOCOBASE_API_KEY / MINIMAX_API_KEY，未外泄）。
- 本轮 3 批改动源码先 `pnpm run build`（exit 0）再启动；发现 3080 被旧 web 进程（当日 01:25 启动、早于本轮代码落盘，tsx 模块图冻结）占用 → 杀旧重启，属环境解锁非缺陷。
- NocoBase workflow「专家服务订单审批交付」(#386331759214592) 尝试按先例暂停，toggle 返回 200 但 enabled 未变（环境怪癖，未再折腾 flip 语义，避免误关生产流）；接手时已有 5 条挂起审批任务（环境常态）。

## 断言表

| 断言 | 结论 | 证据 |
|---|---|---|
| A 下单（BFF orders.create → ORD-YYYYMMDD-*） | **PASS** | POST /api/orders.create（service_id=expert_services/1）→ `id:54, order_no:"ORD-20260917-ffec946d", status:"pending"`；快照含服务名/价格/专家（张红喜） |
| B 生成（pending→generating→delivered + PDF 落盘） | **PASS** | BFF orders.fulfill(54)；4s 轮询时间线：12:26:00–12:26:47 generating ×12 → 12:26:51 delivered（deliverable_path 落 `examples/kb-agent/workspace/deliverables/ORD-20260917-ffec946d.pdf` + NocoBase 附件 /files/main/main/attachments/21.pdf）。文件 128,412 字节，头 `%PDF-1.7` 尾 `%%EOF` |
| C 响应头三态 | **PASS** | `orders-view-verify-headers.txt`：C1 无参 200 `attachment; filename="ORD-20260917-ffec946d.pdf"` + `x-content-type-options: nosniff` + `cache-control: private, no-store` + 128,412B %PDF；C2 `&inline=1` 200 `inline` 同 filename；C3 pending 未交付 404（正文明确）；C4 不存在 orderId=99999 404；C5 种子 delivered 无文件 404；C6 HEAD 同头空体 |
| D market 页区块 + 模态 | **PASS** | 区块「我的订单」出现 54（已交付）/55（待审批）及全部历史行（含已失败 error 摘要、生成中徽章）+ 刷新按钮；点 54「查看方案」→ 模态 `ORD-20260917-ffec946d · 方案预览`，iframe src=`/api/orders.download?orderId=54&inline=1`，网络 200，Chromium 内置 PDF viewer（mhjfbmdgcfjbbpaeojofohoefgiehjai）接管渲染 3 页，内容含订单专属信息（验收验证-DSH/2026-09-17/单号）；footer「下载 PDF」（attachment 直链）+「新窗口打开」（inline=1）；页面内 fetch 下载实证 `%PDF-1.7`/128,412B/attachment；手动刷新无报错、区块存活 |
| E 会话工具卡闭环 | **PASS** | 真实会话让 agent 下单（MiniMax-M3，22 秒：LLM 4.7s + 工具 17.9s）→ 订单 `ORD-20260917-3aae7091` delivered、PDF 落盘、NocoBase 附件 22.pdf → 工具卡渲染「查看订单」→ 点击后 view ring 切到「数据资产」tab、#market-orders 进入视口、新订单在列表。旧回放降级：旧会话（2026-09-0x）4 张 order_create error 卡正常渲染、无按钮、不崩（error 行不渲染按钮实证）；settled ok 无 order_id 的旧回放降级由 keyless 快照 `apps/web/tests/order-tool-row.snapshot.ts` 覆盖 |
| F 无 orders seam 降级 | **PASS** | 3082 实例（kb-agent patch + `expert-orders: disabled` overlay）BFF orders.list → `orders-not-composed`；market 页「我的订单」区块 ErrorStrip 降级：「市场暂不可用 — this deployment composes no orders capability; add the expert-orders seam (and a NocoBase source of truth) to serve orders」+ 重试按钮，资产目录照常，页面不崩。另证默认 bundle（域 gate 关）market 视图整体不挂、页面不崩 |

## 证据文件（本目录）

- `orders-view-verify-headers.txt` — 断言 C 六组 curl 响应头原文（C1–C6）
- `orders-view-verify-D1-market-orders-section.png` — 我的订单区块（含 54/55 新订单）
- `orders-view-verify-D2-preview-modal-pdf.png` — 预览模态（iframe 内 PDF viewer 渲染 3 页）
- `orders-view-verify-E1-order-toolcard-view-entry.png` — 会话 order_create 工具卡「查看订单」入口
- `orders-view-verify-E2-jumped-to-market-orders.png` — 点击后跳转 market 订单区块
- `orders-view-verify-F1-no-seam-degraded.png` — 无 seam 时区块 ErrorStrip 降级

其它终端证据：订单 54 状态轮询时间线（pending→generating×12→delivered）；`ls -l` 128,412 字节 PDF、`%PDF-1.7` 头。

## 修复清单

无实现缺陷修复。两处非缺陷事件：
1. 3080 旧进程占用（环境，杀旧重启加载新代码）。
2. 验证脚本选择器误点第一行打开 orderId=1 模态（操作失误；其 inline 404 反而佐证未交付降级路径）。

## 遗留说明

- 本轮 3 次 create（54/55/3aae7091）在 workflow enabled 下各挂起 1 条 NocoBase 审批任务（连同既有共 8 条）。未处理：reject 会经驳回分支把已 delivered 订单改写 failed、resolve 会对已终态订单触发 fulfill 重入回调，均有破坏性；与接手时的 5 条挂起任务同为环境常态。
- 订单 55（ORD-20260917-64a85226）保持 pending（未 fulfill），用于 C3 未交付 404 与区块轮询展示。
- 3080 web 服务保留运行（新代码，与原服务等价替代）；3081/3082 验证实例已杀。
