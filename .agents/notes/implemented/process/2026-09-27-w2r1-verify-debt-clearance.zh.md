# Agent Note: W2 终验点名清偿微批次（W2-R1）

Status: implemented

[English](2026-09-27-w2r1-verify-debt-clearance.md) | 中文

## 问题

W2 终验 92 分 PASS_WITH_DEBT 留下四类债与两处顺手项：W2-B7 Note 的 Evidence 引用不存在的 `w2-b7-setup-verify.txt`；`setup-nocobase.mts verify` 成功横幅缺 w2-b7 断言清单项（断言本体自 W2-B7 起已在）；`kpi-run.mts` 的 `ar_balance` 无镜像断言（`ap_balance` 侧有）、`approval-engine.mts` 的 `parseNightlyEnv` 负例只活在部署文档里；三处「季初」措辞与实现不符（实现是季初月每日触发、`calcScorecard` 幂等重算，非仅季初当日）。另有证据卫生（`w2-b7-arap-page.png` ≡ `details.png` 同 sha256、negatives.txt 首段 exit 标注矛盾）、KPI 卡 375px 视口金额截断（¥280,820 → ¥280,82）、business-advisor 对照表缺 `ap_balance` 映射行、`projection.ts` 审批中间态误判为「已驳回」、`ApprovalCard.tsx` 双 JSDoc。

## 决策

- **Note 引用走实跑归档而非收敛**：verify 横幅先补 w2-b7 项（`kpi_snapshots` 25 码下限 with ap_balance／应收应付对账 page 四明细块 + ar/ap 趋势图／persona sources + `.dsh` mirrors），再实跑一次 verify 归档为 `w2-b7-setup-verify.txt`——归档文本与断言清单同步，同时充当本批次的 verify 全绿证据；Note L34 措辞随之落在两份归档事实上。
- **selftest 镜像对称**：`ar_balance` 补三条断言（镜像口径 1500／未批准订单不计 1200／空月 =0 非 null），样例与 `ap_balance` 侧同构（未批准 so_orders 不计、未来 `paid_at` 不抵减）；`parseNightlyEnv` 三负例（`25:99`／`abc`／`Mars/Olympus`）连同全缺省默认值（enabled=false、02:30、Asia/Shanghai）进 `--selftest`。
- **季初语义统一为「季初月每日幂等重算」**：`runNightlySteps` 的 `quarterStart = month % 3 === 1` 每天为真，`calcScorecard` 对运行中季度幂等重算——JSDoc、QUICKSTART.zh、DEPLOY.md、DEPLOY.zh 四处措辞对齐这一实现。
- **KPI 卡窄视口最小修**：`.reportMetrics` 用 `repeat(auto-fit, minmax(min(112px, 100%), 1fr))`（112px 是 8 字符金额在 16px 数字字号下的最小格宽；`min()` 防单列溢出），`.metricMiniValue` 用 `clamp(16px, 4.8vw, 20px)`——375px 视口放不下三列时自动降两列，六指标卡呈 2×3 且金额完整。
- **persona 双源同步**：business-advisor 对照表在「应收余额 ar_balance」后补「应付余额 ap_balance」，`agent.cordis.yml` 与 `.dsh` 镜像同改（verify 的 mirror-diff 门禁约束两者字节一致）。
- **中间态三态措辞**：approval 投影在 approved／rejected 之外（pending、pending_level2、reviewing 等）一律「审批中」，不再二值误判为「已驳回」。

## 备选方案

- **Note 引用收敛到已存在的 `w2-b7-final-verify.txt`**——被否：横幅补项后实跑归档同时产出本批次的 verify 全绿证据，「两份归档各证一次」比「一份归档证两次」更可查。
- **更小的网格下限（minmax(96px)）保住三列**——被否：¥280,820 需要约 112px 格宽，96px 下金额仍靠 clamp 压字号硬塞；两列布局是设计意图而非妥协。
- **`parseNightlyEnv` 负例只留部署文档**——被否：负例与实现同文件、selftest 已有 try/catch 断言词汇，固化成本一行一条，文档措辞与代码不会再漂。

## 后果

W2 终验 Findings 清单的全部 Important 与 Minor 项清偿完毕；`.shoot` 取证脚本随证据入库（`w2-r1-shoot-details.mts`／`w2-r1-shoot-mobile.mts`，playwright 经 apps/web 依赖解析）。证据卫生面：`w2-b7-arap-details.png` 重拍为对账页中下部视角（回款 + 采购发票明细块，与页首视角 sha256 去重），`w2-b7-nightly-negatives.txt` 首段 exit 标注以实跑复核段为准。

## 验证

`setup-nocobase.mts verify` 全绿（横幅含 w2-b7 项，归档 `w2-b7-setup-verify.txt`）；`kpi-run.mts --selftest` 与 `approval-engine.mts --selftest` 绿（含新断言，成功消息同步）；`pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 39 文件 677 用例全绿；修复经 `build:lib:client` + apps/web 重建进入 3080 网关产物（mobile CSS hash 更新且含 minmax/clamp），375×667 五连截图（`w2-r1-mobile-375-1..5.png`）全部金额完整，六指标卡呈 2×3；typecheck、oxlint staged、note 门禁（格式 + 配对 hash 重写）绿。
