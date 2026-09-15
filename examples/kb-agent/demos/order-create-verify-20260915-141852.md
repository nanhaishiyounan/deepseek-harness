# order_create 超时修复实机验证（2026-09-15）

前置：真实 NocoBase（http://127.0.0.1:13000）在线；生产 workflow「专家服务订单审批交付」#386331759214592 已暂停（teardown 恢复）。
order_create 工具预算 timeoutMs = 180000（timeout-policy 包装生效）
  ✓ 组合 pin 的 orderCreateTimeoutMs=180000 已挂到工具定义

order_create 返回（总耗时 25723ms）：
```text
订单已创建并完成生成：ORD-20260915-bf38b907
- 服务：海外仓风险应对咨询
- 状态：已交付
- 方案 PDF：/var/folders/7g/d_16wgkj6f5bfrfnnyygzmdr0000gn/T/order-verify-CeYHxB/deliverables/ORD-20260915-bf38b907.pdf
- 业务后台附件：/files/main/main/attachments/12.pdf
```
  ✓ 不再是 TOOL_TIMEOUT/报错（isError=false，60s 预算下此前超时）
  ✓ 订单 ORD-20260915-bf38b907 状态 delivered（同步闭环完成）
  ✓ 交付物是真 PDF: /var/folders/7g/d_16wgkj6f5bfrfnnyygzmdr0000gn/T/order-verify-CeYHxB/deliverables/ORD-20260915-bf38b907.pdf
  ✓ NocoBase 附件 URL: /files/main/main/attachments/12.pdf
  ✓ 真源回读订单行一致（ORD-20260915-bf38b907）

## 分段计时（1s 轮询订单行状态首见时刻，边界含 ±1s 轮询粒度）
- create（落库 pending）：未观测到
- 进入 generating（kb 检索 + 起草 + PDF + 上传开始）：未观测到（pending→generating 约 未观测到）
- 交付 delivered：未观测到（generating→delivered 约 未观测到）
- 工具总耗时：25723ms，工具预算 180000ms（修复前 60000ms）
- 独立实测参考：MiniMax-M3 同款 draft 提示词直连计时 38.9s（TTFB 0.9s）；NocoBase REST 单次读写 12-21ms

**PASS** — 同一单（expert_services/2 张红喜·海外仓风险应对咨询）在 180s 预算内同步交付落库，不再 60s 超时。
