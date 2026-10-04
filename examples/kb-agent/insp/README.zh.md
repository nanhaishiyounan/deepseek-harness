# kb-agent-insp-workbench

[English](README.md) | 中文

W6-B5 QMS 检验工作台：在既有 qm_* 数据底座上的质检员工作台——零依赖触屏 SPA（`src/main.ts`，构建产物 `dist/insp.js` 已提交，由引擎在 `http://127.0.0.1:13110/insp` 提供）+ 服务端（`src/server.ts`，承载引擎 `/insp/*` 各处理器）。队列按来源分组（IQC/IPQC/OQC + 收货超 48h 逾期高亮）；向导卡逐步引导：批量 → AQL 档位 → 从 W2 `qm_aql_plans` 15 段种子查抽样方案（绝不重抄抽样表）→ 逐项实测录入（超差「确认失败」双按钮防误 + 现场拍照留证）→ 实时判定徽章 → 幂等提交（`submit_key` 对 `qm_inspections` 做 CAS 占位）→ 拒收后四路处置（退货/让步特采/返工/报废，复用 W2 `createNc`/`disposeNc` 引擎动词）。出厂检验报告九要素（沪市监食监〔2025〕195 号：产品名称/规格/数量/生产日期或批号/保质期/检验依据/结论/报告人/审核人）从检验单+读数+产品+批次自动装配，缺项显式「未维护」占位；一检验一报告（`qm_factory_reports`，报告编号=检验合格证号），支持打印/PDF。写路由限质检部+admin，操作人会话推导；拒收判定落第六路预警规则 `inspection_fail`。

```sh
node esbuild.mjs                    # rebuild dist/insp.js (committed — a fresh checkout serves without a build step)
node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --seed    # fields + collection + rule + pages + rehearsal rows
node --import tsx/esm examples/kb-agent/scripts/w6b5-insp.mts --assert  # the acceptance matrix (15-band reconciliation included)
node demos/acceptance-w6/w6-b5-shoot.mjs                                # the CDP end-to-end + negative evidence
```
