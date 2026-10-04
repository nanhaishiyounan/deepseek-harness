# W6-B10 八角色演练汇总（自动生成自 w6-b10-walkthrough.json）

生成：2026-10-03T03:14:10.577Z｜live triple nc/engine/web = 200/200/200

| # | 角色（账号） | 结论 | 步数（过/总） | mobile 腿 | 截图 |
|---|---|---|---|---|---|
| r1 | 采购员（buyer） | PASS | 12/12 | ✓ buyer | mobile-docs、po-list |
| r2 | 计划员（planner） | PASS | 12/12 | ✓ planner | maint-calendar、mobile-todos |
| r3 | 车间主任（shop_lead） | PASS | 11/11 | — | bom-versions、cards-terminal |
| r4 | 质检员（qc_inspector） | PASS | 14/14 | — | factory-reports、insp-queue |
| r5 | 仓管员（keeper） | PASS | 16/16 | ✓ keeper | alert-list、expiry-board、mobile-alerts |
| r6 | 销售（sales_rep） | PASS | 12/12 | ✓ sales_rep | crm-pipeline、mobile-so-docs |
| r7 | 财务（finance） | PASS | 15/15 | ✓ finance | cockpit、fin-workbench、mobile-dunning |
| r8 | 管理员（admin@nocobase.com） | PASS | 14/14 | — | alert-rules |

合计：8/8 角色通过，106/106 步绿。逐动作审计：w6-b10-actions.json；随行 psql 对账：w6-b10-psql-recon.log。
