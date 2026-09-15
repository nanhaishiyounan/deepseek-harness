# 批次 G5：finance + procurement + knowledge 三域整模块移植

> 隶属 [PLAN.md](PLAN.md)。前置：G2。本批 65 文件 / 2.01 万行（最大铺量批），含 finance 的 AI 表单挂载点（expenses）随域激活。knowledge 域与 admin 后台的「知识文章」v2 页（F3）同 collection（hub_kb_articles）——数据互通，无冲突。

## 移植清单

| 域 | 文件/行数 | collections | 路由 | 菜单挂组 |
|---|---|---|---|---|
| finance | 22 / 6,870 | hub_fin_invoices/invoice_items/expenses/budgets | /finance /finance/reports /cash-flow /budget /ar-aging /invoices /expenses | group_finance |
| procurement | 21 / 5,997 | hub_po_purchase_orders/suppliers/items | /procurement-spend /purchase-orders /suppliers | group_operations |
| knowledge | 22 / 7,251 | hub_kb_articles/categories/article_feedback | /kb-overview /articles /categories /kb-search /kb-tags | group_knowledge |

```sh
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/finance platform/nocobase-portals/demo-portal-crm/src/pages/finance
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/procurement platform/nocobase-portals/demo-portal-crm/src/pages/procurement
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/knowledge platform/nocobase-portals/demo-portal-crm/src/pages/knowledge
```

## 域特定改动点

1. **路由聚合**：追加 `...financeModule.routes, ...procurementModule.routes, ...knowledgeModule.routes`；
2. **挂组**（Hub [:96-128](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:96)）：`finance-dashboard/hub_fin_invoices/hub_fin_expenses/finance-cashflow/finance-budget/finance-reports → group_finance`；`hub_po_purchase_orders/hub_po_suppliers/po-spend → group_operations`；`knowledge_overview/hub_kb_articles/hub_kb_categories/kb-search/kb-tags → group_knowledge`；`priorityOverride` 补 `hub_po_purchase_orders:20/hub_po_suppliers:21`（operations 组内顺序）；
3. **locale**：并入三域 locale.ts 对；
4. **AI 挂载点自动激活**：expenses 新建表单（[form.tsx:159](../../platform/nocobase-portals/demo-portal-hub/src/pages/finance/expenses/form.tsx:159) formId `hub-expense-create`）随域拷贝生效；
5. **expenses decision 审批面**：域内组件（[expenses/](../../platform/nocobase-portals/demo-portal-hub/src/pages/finance) decision 页），随域拷贝。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g5/`）

1. finance 七页实测：/finance dashboard、/invoices（含 items 子表单新建一张发票）、/expenses（**dex AI 按钮流式填充实测一次** + decision 审批流转一次）、/finance/reports、/cash-flow、/budget、/ar-aging；
2. procurement 三页实测：/purchase-orders（新建一笔含 item 明细）、/suppliers、/procurement-spend（921 行分析页图表渲染）；
3. knowledge 五页实测：/articles（列表 827 行页 + show 695 行详情阅读态 + feedback 提交一条反馈）、/categories、/kb-search（全文搜索出结果）、/kb-tags、/kb-overview；
4. knowledge 数据互通断言：admin 后台「知识文章」页（F3 v2）与 Portal /articles 列表行数一致（同 collection 双面）；
5. 菜单组：Finance/Knowledge 组出现、operations 组补齐 procurement 成员顺序正确——侧栏截图；
6. 悬浮球覆盖 + 深链抽查（/ar-aging、/procurement-spend、/kb-search）；
7. CRM + G2-G4 域零回归抽查（每批代表页各一）；
8. `portal tsc` EXIT=0 + deploy 双跑树哈希一致 + verify 全绿。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 65 文件单批体量大（tsc 迭代轮次多） | 低 | 三域各自独立提交（finance/procurement/knowledge 三个提交），任一域 tsc 不过先提交已过域——铺量批不追求单提交 |
| invoices items 子表单（hub_fin_invoice_items 父子关系）在 CRM 侧 dataProvider 的关联参数 | 低 | 同 portal-sdk dataProvider 同源，Hub 能用 CRM 必能用；实测新建即覆盖 |
| knowledge feedback 写 hub_kb_article_feedback 外键约束 | 低 | F 轮种子链建表含 FK；实测提交即验证 |

回滚：三域独立提交，revert + redeploy 即回。
