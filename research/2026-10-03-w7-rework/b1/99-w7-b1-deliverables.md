# W7-B1 交付索引：核心单据域 22 页 heal + B0 验证前置债清偿

> 批次：plan-w7.zh.md §4 B1（销售 9 + 采购 8 + CRM 5 = 22 页）。实施 2026-10-03。前置债①~⑦ 为验证方 B0 批次明确要求，先于 B1 主体清偿。

## 前置债清偿（①~⑦）

| # | 项 | 落点 | 证据 |
|---|---|---|---|
| ① | apply×2 快照覆盖致回滚退化 | `w7b0-theme.mts` apply 与站立快照合并（created/previousDefaultId/w7RowBefore 沿用旧值；退化快照按 PREVIOUS_UID 反查自愈） | 重跑 --apply 后快照 `previousDefaultId: 5` 恢复（22:05 旧代码写丢为 null） |
| ② | themeId 固化清除脚本化 | pinning sweep 并入三模式：apply 内置 sweepPins（journal 首见合并，B0 手工两条记录并入）、rollback 内置 restorePins、assert 检查 | `b0/w7-b0-user-themeid-rollback.json`（3 条：nocobase/qc_inspector/buyer） |
| ③ | assert 劈叉态漏报 | assert 增查 users systemSettings 残留；负向自证：注入 buyer(19) themeId=5 → assert exit=1（`users pinned to a non-w7-forge theme: buyer→5`）→ apply sweep → assert OK | `b0/w7-b0-negative-selftest.log` |
| ④ | design-language.md 落盘 | 计划 §3 + 已生效令牌提炼为 B1+ 引用锚点（色板/字型/间距/组件规格/落地层次） | `b0/design-language.md` |
| ⑤ | STATUS_PALETTE 基准表 | 语义五态 → 全域业务枚举映射（含 Tag soft 背景值与 preset→态对应），定义于 `w7b1-heal.mts` STATUS_PALETTE v3，文档化于 design-language.md §2；B1 dry-run 实测枚举全收（41 个未映射值补齐后清零） | §2 表 + dry-run log |
| ⑥ | 「可见面清零」措辞收窄 | 改为「B0 DOM probe 抽样 5 页主按钮 computed 背景 rgb(30,78,140)；全站 114 页未逐页实测」 | `99-w7-b0-m0-deliverables.md` 遗留节 |
| ⑦ | M0 断言③补跑 | 登录→审批→台账链路：qc_inspector 登录 ✓ → todos 队列可达（空态文案正常显示，无待审批项，翻转腿如实申报无可操作对象）→ docs 台账可达已鉴权 ✓ | `m0/w7-m0-chain.log` + `m0/chain-01..03-*.png` |

## B1 主体改动

| 文件 | 内容 |
|---|---|
| `examples/kb-agent/scripts/w7b1-heal.mts` | 新建：B1 域 heal（--dry-run/--apply/--assert/--rollback），STATUS_PALETTE v3 + 六类 walk（recolor/enumSwap/numberSwap/numberProps/dateProps/alignRight/alignLeft/statcardRegen + columnOptions/selectOptions 两面扩展） |
| `examples/kb-agent/scripts/nocobase-flow-page-lib.mts` | statCardRaw 工厂升级 W7 规格：数字 28/600/#1F2630 + 单位 60%（rich {u|} 段）、标签 12/500/#55606E、脚注 10/#8A94A0，`/* w7 forge statcard */` 标记行（改工厂即改 B2~B4 基线） |
| `examples/kb-agent/scripts/w7b0-theme.mts` | GLOBAL_STYLE 增补表格行高（thead padding-block 12 / td 14+12 内边距 → 行高 48-52）与行分隔 1px #EFEFEF（B1 形态标准），经 --apply 幂等生效 |

## heal 命中面（apply 全量）

- recolor=31（enum 列 options → v3）+ columnOptions（列头筛选 options 29 清单全达）+ selectOptions（表单/筛选 select 英文 label → v3 中文，crm_deals/pur_rfqs/pur_requests 等 16 清单全达）
- numberProps=16（金额 ¥+0,0.00 / 数量 0,0 千分位补齐）、dateProps=2（YYYY-MM-DD 统一）、alignRight/alignLeft=0（W5-B6 已做，幂等复核通过）
- statcardRegen=46（46 张 w4b3 统计卡重生成 W7 规格 raw，旧 #1d4ed8/#6b7280/#9ca3af 全清）

## 22 页清单与改造内容

| 页（uid 尾） | 域 | 改造 |
|---|---|---|
| 客户 n17sys042q2lz | CRM | 状态/类型 Tag v3（enterprise/trader/factory 分类中性化、prospect/churned 五态）、金额列千分位、统计卡×2 重生成 |
| 销售线索 n17rwc527ujwt | CRM | 线索阶段七值五态化（won 赢单 green/lost 输单 red/negotiation Critical）、预计金额 ¥+千分位、筛选 select 中文化、统计卡×2 |
| 联系人 n17c3lkyg9zjd6 | CRM | 统计卡重生成、表头/行高 globalStyle 生效 |
| 产品与服务 n17f2wwpqs60dtk | CRM | 定价模式/类别中性化、单价千分位、统计卡×2 |
| 客户仪表盘 n17f2jumvap76nm8 | CRM | 同客户页枚举对齐、统计卡 |
| 订单 n17vu68623sj9i | 销售 | crm_deals 状态枚举（fulfilled 已履约 green）、金额列、统计卡×3 |
| 报价单 n17v6xfvzxoj0f | 销售 | sent/accepted/pending_approval 五态、报价金额、统计卡×3 |
| 回款 n17f2c15ji684n8g | 销售 | 支付方式全中性（leg03 修复：不与回款状态争色）、received 已到账 green、金额列右对齐+¥、统计卡×3 |
| 发票 n17f2utwb01mi3ha | 销售 | issued 已开具 blue、金额、统计卡×3 |
| 销售仪表盘 n17f2y9wfrggxyo | 销售 | 同回款枚举、统计卡×2 |
| 销售订单 w7mrp4w590rm0ws8 | 销售 | shipping_status（none 未发运 orange/shipped 已发运 blue，leg10 同款修复）、主子表金额千分位、统计卡×4 |
| 销售看板 w3b3utj5a15khmq | 销售 | Kanban 卡 Tag soft 生效（DOM 断言 tagSoft/tagPill PASS）、卡片几何走 globalStyle |
| 交期日历 w3b3x8ymuxey8q | 销售 | 日历事件块经 globalStyle 卡片基底覆盖（无表格面，断言口径 noLegacyHex PASS） |
| 计划日历 w3b3ass8lwvxiy | 销售 | 同上 |
| 采购申请 w3pura0kyqfx4f9 | 采购 | doc_status/转单族枚举、数量列千分位、select 中文化、统计卡×4 |
| 询价管理 w3purlvif0v23bun | 采购 | sent 已发出 blue、主子表、统计卡×3 |
| 供应商报价 w3pur9w1c3yg3rjd | 采购 | 得分列 qty 千分位、交期、统计卡×3 |
| 比价表 w3purb7o0r3yqi45 | 采购 | v2 表格面：已报价 green/已落选 default/草稿、金额列；JSBlock 比价矩阵紫系 → B5 层 3b（v2 面 noLegacyHex PASS） |
| 采购订单 w3puryzkva06iuhh | 采购 | receiving_status/invoice_status（未收货/未开票 orange——leg10 履约/财务风险色彩区分）、金额 ¥、统计卡×4；泳道 JSBlock → B5 |
| 发票匹配 w3pur45681oxtcsi | 采购 | match_result（matched green/exception red）、金额、统计卡×4；三单匹配 JSBlock → B5 |
| 付款申请 w3pur3an4pwnr1eo | 采购 | pay_method 中性、pay 状态五态、金额、统计卡×4 |
| 采购看板 w3b3x35bfqctwkn | 采购 | Kanban 卡 Tag soft（DOM 断言 PASS） |

## 证据链

| 类别 | 路径 / 结果 |
|---|---|
| heal 断言 | `w7b1-heal --assert` OK：enumColumns=36 colorMismatch=0、numberNoRight=0/46、numberNoSeparator=0/46、dateNoRight=0/17、dateNoFormat=0/17、bareNumeric=0、statcards=46 statcardLegacy=0、columnOptionMismatch=0/29、selectOptionMismatch=0/16 |
| after 截图 22 | `b1/after/w7-b1-*.png`（与 b0/before 同机位 1440×900）+ `.w7b1-shot-report.json` |
| DOM 美学断言 | 22/22 全 PASS：18 表格页 thead600+theadBg+tagSoft+tagPill+numRightTnum+noLegacyHex 全绿；2 看板页 tagSoft+tagPill+noLegacyHex；2 日历页 noLegacyHex（无表格面） |
| 主题断言 | `w7b0-theme --assert` OK（含 pin 残留检查） |
| W6 回归 | `w6b6-crm --assert` PASS（seed 补演练数据后全绿：结构/铺页/管道对拍/客户360/转单/预警枚举）；`w6b7-sourcing --assert` PASS（定标链/权重/XSS 残留 0） |
| 回滚面 | `b1/w7-b1-heal-rollback.json`（journal 逐条逆放）；主题面 `b0/w7-b0-theme-rollback.json` + user-pin journal |
| run log | `b1/w7-b1-heal-run.txt` |

## 遗留（进入后续批次）

- 比价表/采购订单/发票匹配三页 JSBlock 内硬编码色（#1677ff/#7C3AED 量级）→ B5 层 3b（v2 表格/表单面已实测无残留）。
- 统计卡 sparkline/同比：statCardRaw 已留 rich 单位结构，趋势小图属数据可行性问题，B2+ 视页面数据条件决定；本批以「数字 28/600/单位 60%/tnum 卡规格」收口。
- 列表页空态双文案（未设筛选 vs 筛选无结果）：v2 平台表格空态由平台渲染，CSS 层无法改文案；v2 面板能力记 B6 终验复核项。
- w6b6 演练 seed 数据此前不在册（3 项 id=0 失败为数据面非结构面）——已按 gates 惯例 `--seed` 重建后 PASS；后续批次跑该腿前先 seed。
- 工作树未提交改动含本批脚本与证据（提交动作归上层）。
