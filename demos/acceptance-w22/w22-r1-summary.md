# W22-R1 复验证据汇总（business-goal ×10 复读 + user-journey）

日期：2026-10-08（Asia/Shanghai）。网关：`DSH_HOME=examples/kb-agent/.dsh node --import tsx/esm apps/cli/src/bin.ts web --patch examples/kb-agent/cordis.patch.yml`（127.0.0.1:3080，重启后加载 W22-R1 三项服务端机制 + persona 更新）。驱动脚本：验证器原版 `/tmp/verify-w22/repeat.mjs`（网关真实链路、每次新会话、记录原始 payload）。

## ×10 同 prompt 复读（w22-r1-repeatA.log）

Prompt（与 W22 验证 runA 同口径）：`帮我登记一张采购单：向 山东鲁丰食品配料有限公司 采购 200 箱 食品级柠檬酸，单价 25 元，需求日期 2026-10-15，备注 常规订单`

| run | collection | supplier | date | qty | price | 品名在卡 | 轮次 |
|-----|-----------|----------|------|-----|-------|---------|------|
| 1 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_name) | 1 |
| 2 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_name) | 1 |
| 3 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ (qty) | number ✓ | ✓ (product_name) | 1 |
| 4 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_name) | 1 |
| 5 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_name) | 1 |
| 6 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_id) | 1 |
| 7 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_id) | 1 |
| 8 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ (qty) | number ✓ | ✓ (product_id) | 1 |
| 9 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_id) | 1 |
| 10 | pur_orders ✓ | relation ✓ | date ✓ | number ✓ | number ✓ | ✓ (product_id) | 1 |

- **数量/单价 widget 命中：10/10**（W22 runA 基线：quantity text 5/10、qty/price 交替错型，整体 ~50%）
- **必答字段集出现：10/10**（供应商+品名+数量全部在卡；W22 runA 基线：3/10 品名+数量+单价整缺）
- **collection 漂移：0/10**（全部 pur_orders；W22 runA 基线：1/10 hub_inv_products 越权）
- **金额字段（amount）widget：10/10 number**
- **resolver 覆盖面字段格命中：40/40 = 100% ≥ 95%**（supplier/date/qty/price × 10）。备注（可选字段）出现 5/10 次、缺席时不锁（设计如此：只锁核心交易字段）；出现时 widget=text 正确 5/5。
- 单价（unit_price）10/10 在卡且 number（W22 基线中 run4/6/9 整缺）。

## ×3 场景变化（w22-r1-scenario-s1/s2/s3/s3b.log）

| 场景 | prompt 摘要 | 结果 | collection | 必答字段集 | widget 观察 |
|------|------------|------|-----------|-----------|------------|
| S1 供应商准入 | 登记新供应商（名称/联系人/电话） | form_draft 1轮 | srm_suppliers ✓ | name+contact 在卡 ✓ | 全 text（正确） |
| S2 入库登记 | 入库单（品名/数量/来源 TL-88） | form_draft 4轮（ask 链后出卡） | wms_receipts（白名单内；「入库单」措辞被意图匹配到收货表，表单匹配仍是模型决策面+ask_choice 兜底，非本批机制范围） | po_id+qty 在卡 ✓ | qty=number✓ received_at=date✓ receipt_type/status/iqc_status=select+opts✓ |
| S3 收货登记 | 采购收货 PO-2026-0001 收 200 箱 | form_draft 2轮（s3b.log）；另一次 max_rounds（s3.log）为业务正确拒绝——PO-2026-0001 已收满 300/300，模型核对超量后如实转达「没有可收余量」 | wms_receipts ✓ | po_id+qty 在卡 ✓ | qty=number✓ select+opts（receipt_type/iqc_status/status）✓；po_id=text（见残留观察） |

残留观察（如实记录，resolver 覆盖面外）：
- `po_id` 字段在 relation（s3 首次成功样本）与 text（s3b）间漂移——`_id` 后缀未纳入确定性表（用户方案未列入；机械判定表面内只有数量/单价/金额/日期/options→select）。可选后续：`_id` 后缀 → relation。
- 无 options 的状态字段（如 wms_receipts 的 receipt_type 偶发 text 无 opts）保持 W22 note 的诚实降级立场，persona 教学推动带 options。

## user-journey：缺必答一轮补齐出卡（w22-r1-journey.log）

Prompt（故意缺数量）：`帮我登记一张采购单：向 山东鲁丰食品配料有限公司 采购 食品级柠檬酸，单价 25 元，需求日期 2026-10-15`

- 会话卡片序列（解压 session-0b03fa8c…/session.jsonl.zstd 实证）：`ask_field(quantity) → form_draft`
- 第 1 轮：模型按「必答之问」出 ask_field 单问数量（widget 经 resolver 为 number）；自动作答 200 后，第 2 轮出 form_draft，quantity=number 在卡。
- 出卡未带 unit_price（单价 25 已参与 amount 推导；unit_price 属可选层，不在必答锁）——如实记录。

## 回归门禁

- tool-present-card 单测：132/132（含 W22-R1 新增 33 例：widget 变体表 24 例、coercion/label/options/ask_field 镜像、form contract 纯函数 + execute 级 INVALID_ARGS/无 config 不误伤）
- ui-mobile：150/150（protocol.client.spec.ts 新增 widget-coercion 镜像）
- tool-present-card + ui-mobile 联跑：54 文件 976 用例全绿
- toolcard e2e：4/4（golden aria snapshot 稳定）
- `pnpm run typecheck`：通过
- `pnpm run verify-cordis-config`：180 config files passed
- `pnpm run doc-sync`：29/29（含 export-jsdoc、config-catalog 双语、translation pairing 1236 对）
- staged lint / whitespace / notes triplet：lefthook commit 时全过（见 commit）

## 与 W22 验证失败面的对照

| W22 FAIL 项 | W22 基线 | W22-R1 结果 | 机制 |
|-------------|---------|------------|------|
| [Critical] 数量/单价 widget 命中 50% | quantity text、qty/price 错型交替 | 10/10 number | widget resolver 字段名/label 确定性 rewrite |
| [Critical] 必答字段集不稳定（3/10 整缺） | run4/6/9 品名+数量+单价缺 | 10/10 必答全在卡 | formCollections requiredFields fail-closed |
| [Important] collection 漂移 1/10 | run1 hub_inv_products 自造 sku | 0/10 | 17 表白名单整卡拒 |
| [Important] select↔text 漂移 | runB receipt_type 交替 | 带 options 时强制 select；无 options 时诚实降级（教学补强） | resolver options→select + persona |

## 归因修正（W22-R2 补记）

本文件上面表格里的「数量/单价 widget 命中 10/10」归因一栏写「widget resolver 字段名/label 确定性 rewrite」——W22-R1 验证（FAIL 80）的 P4 旁路探针证实该归因不成立：服务端 rewrite 后的载荷从不离开服务端（session log 与模型上下文保持原始声明，execute 结果只有 `{presented: true}`），客户端渲染直接跟随模型声明，resolver 对渲染是死码。10/10 的真实归因是 **persona 教学 + 模型声明恰好命中**，无渲染层保障。W22-R2 把分类规则镜像进客户端渲染折叠层（双通道同口径）后，该读数的机制归因才成立：persona 教学推动声明正确，渲染层确定性分类兜底纠偏——见 `.agents/notes/implemented/feature/2026-10-08-w22-r1-deterministic-widget-form-contract.md` 的 W22-R2 修正节与 `w22-r2-summary.md`。
