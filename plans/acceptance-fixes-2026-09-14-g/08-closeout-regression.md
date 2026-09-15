# 批次 G8：终审回归收口（全量门禁 + e2e + 证据归档 + Note/handoff）

> 隶属 [PLAN.md](PLAN.md)。前置：G1-G7 全部通过。本批零新功能，纯收口：全量门禁、跨域回归、证据归档、知识沉淀。对齐 F 轮 F5 收口惯例（幂等双跑/typecheck/lint/doc-sync/portal tsc ×2/deploy 双跑/网关冒烟/Note 分类）。

## 收口清单

### 1. 全量门禁（全部 EXIT=0 / 全绿，记入 gates.log）

```sh
# 1) G 轮无新种子脚本，重放 F 轮种子链 ×2 验证幂等不回归
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify   # ×2，输出比对
# 2) 主仓门禁
pnpm run typecheck && pnpm run lint && pnpm run doc-sync
# 3) 双 Portal tsc ×2（Hub 冻结态应零变化）
cd platform/nocobase-portals/demo-portal-crm && pnpm tsc --noEmit
cd platform/nocobase-portals/demo-portal-hub && pnpm tsc --noEmit
# 4) deploy 双跑树哈希一致
node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts   # ×2
# 5) 网关冒烟 ×5
curl -sf :3080/nocobase/dist/crm/ >/dev/null && curl -sf :3080/nocobase/dist/crm/tickets >/dev/null && \
curl -sf :3080/nocobase/dist/crm/overview >/dev/null && curl -sf :3080/nocobase/dist/hub/ >/dev/null && \
curl -sf :3080/nocobase/favicon.ico >/dev/null && echo GATEWAY-OK
# 6) CRM Portal 既有 playwright e2e ×6
cd platform/nocobase-portals/demo-portal-crm && pnpm e2e   # login/smoke/lists/metrics-charts/responsive/drawer-select + lead-conversion-guard
```

verify 重点断言逐条记录：n18ai- ≥25（admin 侧不动，应保持 F 轮数）、双 Portal 探活、AI 悬浮球图标 svg、品牌资产字节级、网关三路 favicon、crm_*/hub_* list probes ~30 条（后端合同未动，应全 200）。

### 2. 跨域回归浏览器实测（十域全巡检）

每域至少 1 页浏览器打开 + 截图（CRM 侧 10 域代表页：overview/deals/tickets/tasks/employees/inventory/asset-registry/invoices/articles/overview-crm-dashboard）+ 悬浮球出现抽查 ×3 域 + AI 表单按钮抽查 ×2（一张截图带 dex 按钮）。Hub Portal 首页截图一张（冻结态正常佐证）。

### 3. 深链全量探活（新域路由 SPA fallback）

```sh
for p in overview tickets helpdesk/dashboard sla-policies faq projects tasks my-tasks \
         employees org-chart leave inventory reorder stock-by-warehouse asset-registry \
         assignments asset-ledger invoices expenses cash-flow budget ar-aging \
         procurement-spend purchase-orders suppliers kb-overview articles kb-search; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3080/nocobase/dist/crm/$p")
  echo "$p: $code"; done   # 全 200 记入 gates.log
```

### 4. Hub 冻结确认

```sh
git -C platform/nocobase-portals/demo-portal-hub status --porcelain   # 预期空（vendored 自带 .git）
git diff 74da6fff60..HEAD -- platform/nocobase-portals/demo-portal-hub   # 主仓侧也应零改动
```

### 5. 知识沉淀

1. **Agent Note**（implemented/architecture）：「NocoBase demo Portal 域模块移植机制」——域模块自包含（module.tsx 聚合模式）/defineAppRoutes 同源/sidebarGroups 分组四段/table-kit 基建/分叉文件三方合并原则（CRM 现状优先）/sales 域不移植裁决与数据分裂规避——按 [notes README](../../../.agents/notes/README.md) 分类规范落盘；
2. **handoff 追加 0.g 节**（[plans/handoff-2026-09-10.zh.md](../handoff-2026-09-10.zh.md) 惯例）：G 轮终态（CRM 十域 + 挂载点清单 + Hub 冻结态 + H 轮遗留项清单）；
3. **QUICKSTART 复读**：G7 改写后的叙述与实际逐句对照（防过度承诺）；
4. **提交链整理**：G1-G8 每批独立提交核对（`git log --oneline 74da6fff60..HEAD` 应为 G 轮全量 + 每批可独立 revert），维持未推送基线。

### 6. H 轮遗留项清单（记录，不做）

- Hub Portal 物理退役（6 处代码/门禁 + 整目录删除 + hub_* probes 语义改写为 CRM 页面合同）——待用户确认 CRM 全覆盖后；
- list-toolkit 与 table-kit 两套列表工具统一；
- CRM 789 行内联 routes.tsx 重构为模块聚合（可选）；
- sales insights/forecast 可选增强（改绑 crm_*）；
- 新域 playwright smoke spec（Hub 域页面无既有 spec）；
- 多语言 locale（zh-CN/en-US 之外的 21 语言，Hub 机翻产物未拷）。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g8/`）

1. gates.log：上述 6 组门禁全部通过（每条命令 + 输出摘要）；
2. 十域巡检截图集 + Hub 冻结佐证截图；
3. 深链探活 28 路全 200 清单；
4. verify ×2 输出一致（幂等）；
5. Agent Note + handoff 0.g + QUICKSTART 复读记录落盘；
6. 提交链 `74da6fff60..HEAD` 每批一提交、无混杂提交。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 全量巡检发现个别域页面渲染异常（G2-G5 已过但组合后互相影响——如 locale 键冲突） | 中 | 单域修复遵循最小改动 + 该域批内回归断言重跑；不影响其他域的提交粒度 |
| e2e 因菜单结构变化失败（smoke 断言旧菜单形态） | 中 | e2e 是 CRM 自己的 spec——菜单分组后 smoke 若断言平铺菜单需同步更新 spec（fixture 修 spec 不修产品，testing 政策） |
| verify 幂等双跑不一致（某断言非确定） | 低 | F 轮已双跑稳定；新差异逐条定位（时间/顺序敏感断言记录已知波动） |

回滚：本批并非零产品改动——G8 提交 `b2bd0c78b7` 含 20 个文件（种子列对齐、`crm/global-search.tsx` 滤镜收敛、auth.setup 等），随提交整体 revert 即回滚；验证与文档部分同样随提交可 revert。
