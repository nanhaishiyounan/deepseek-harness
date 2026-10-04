# W7 设计语言规范「铸造 · Forge」— B1+ 子任务引用锚点

> 源：plans/plan-w7.zh.md §3（2026-10-03 loop-planner 产出）+ w7b0-theme.mts 落地令牌（已生效）。本文是 B1~B6 / M1~M3 批次的唯一视觉基准；色值以本文为 G7 单一来源。
> 定位：食品制造业 ERP 密集数据产品，B2B trust-first 保守区间（DESIGN_VARIANCE 3-4 / MOTION 2-3 / DENSITY 5-7），Fiori/Carbon 品质标准。

## 1. 色板

### 1.1 品牌主色（普鲁士深蓝）

主 `#1E4E8C` / hover `#2A5FA6` / active `#173D70` / soft `#E8F0F9`。蓝语义收敛为「主操作 + 链接」两处，每屏 ≤2 处强调。侧栏深普鲁士 `#16304F`。

### 1.2 语义五态（Fiori Morning Horizon 配对，fg/bg）

| 态 | fg | bg（soft） | 边框 | 用途 |
|---|---|---|---|---|
| Positive | `#256F3A` | `#F5FAE5` | `#CDE5B0` | 合格/生效/已到账/已付讫 |
| Critical | `#E76500` | `#FFF8D6` | `#F2D98C` | 待处理/临期/部分付款/让步接收 |
| Negative | `#AA0808` | `#FFEAF4` | `#F3B8C8` | 不合格/驳回/逾期/超载 |
| Neutral | `#788FA6` | `#EFF1F2` | `#D5DBE2` | 草稿/停用/已关闭/支付方式等元数据 |
| Informational | `#0070F2` | `#E1F4FF` | `#B3DCFF` | 进行中/已提交/已计划 |
| 执行完成（补充态） | `#0E7490` | `#E0F5F7` | `#B3E3E8` | 已完成/已转工单——执行终态，区别于审批 Positive |

Tag 一律 soft 风格：fg 色 + soft bg + 同色 1px 边框 + 999px 胶囊 + 12px 文字（抽屉内 14px）。层 2 globalStyle 已把 `.ant-tag-{preset}` 全部覆写为上表配对（purple/magenta → Neutral）。

### 1.3 中性阶（暖灰）

画布 `#F6F6F4` / 表面 `#FFFFFF` / 表面-次 `#FAFAF9`（表头底+斑马） / 边框 `#E8E8E6` / 边框-强 `#D8D8D5` / 文字-主 `#1F2630`（禁 #000） / 文字-次 `#55606E` / 文字-弱 `#8A94A0`。

### 1.4 图表序列色（蓝系递进 + 中性，禁裸彩虹）

`#1E4E8C → #3A69A4 → #5783BC → #7B9DD1 → #A3BCE2 → #CBDCF0`，灰 `#B8BFC8`。热力三档 = Positive/Critical/Negative（强度挂钩告警等级）。零值不画条。

## 2. STATUS_PALETTE（枚举 → 语义态基准表，recolor 唯一基准）

options.color 仍写 antd preset 名（渲染由 globalStyle soft 覆写闭环）；preset → 态：green=Positive、orange=Critical、red=Negative、default=Neutral、blue=Informational、cyan=执行完成、purple 已废止（→default）。

| 维度 | value → [label, color] |
|---|---|
| 审批 | draft→[草稿,default] pending→[待处理,orange] pending_level2→[二级审批中,blue] submitted→[已提交,blue] approved→[已生效,green] rejected→[已驳回,red] void→[已作废,default] |
| 执行 | planned→[已计划,blue] released→[已下达,blue] in_progress→[执行中,blue] started→[已开工,blue] processing→[处理中,blue] waiting→[等待中,orange] completed→[已完成,cyan] done→[已完成,cyan] closed→[已关闭,default] cancelled→[已取消,default] confirmed→[已确认,green] resolved→[已解决,green] active→[生效,green] inactive→[停用,default] retired→[退役,default] new→[新建,default] |
| 财务 | open→[进行中,blue] partial→[部分付款,orange] paid→[已付讫,green] overdue→[已逾期,red] |
| 质量/转单 | passed→[合格,green] failed→[不合格,red] concession→[让步接收,orange] hold→[待定,orange] converted→[已转单,blue] dismissed→[已忽略,default] |
| 供应链 | qualified→[合格,green] preferred→[优选,blue]（合格≠优选：Positive 只给优选终态，合格走 green 因业务上「合格」即准入通过；restricted→[受限,red] enhanced→[加严,orange]（受限≠加严） potential→[潜在,default] reviewing→[准入评审中,blue]） |
| 客户等级 | A→[A级,green] B→[B级,blue] C→[C级,orange]（价值分级非状态，色为管理动作语义） |
| 支付方式 | 全部→default（中性元数据，不得与回款状态争色——leg03 修复） |
| 维保英文残留 | Preventive→[预防性,blue] Corrective→[纠正性,orange] Inspection→[点检,cyan] Scheduled→[已排程,blue] 'In progress'→[进行中,blue] Done→[已完成,green] |
| B1 域补值（2026-10-03 dry-run 实测枚举全收） | 线索阶段 contacted→[已联系,blue] requirements_confirmed→[需求确认,blue] proposal→[方案报价,blue] negotiation→[商务谈判,orange] won→[赢单,green] lost→[输单,red]；报价/订单 sent→[已发送,blue] accepted→[已接受,green] pending_approval→[待审批,orange] fulfilled→[已履约,green] received→[已收货,green] issued→[已开具,blue]；客户类型 enterprise→[企业客户,blue] trader→[贸易商,cyan] factory→[工厂,default] prospect→[潜在,default] churned→[流失,red]；产品 fixed/times/subscription 与 compliance/logistics/channel/brand/data/ops 全中性；支付补值 letter_of_credit→[信用证,default] acceptance_bill→[承兑汇票,default] bank→[银行转账,default] bill→[票据,default]；采购履约 none→[未收货,orange] no_invoice→[未开票,orange] to_invoice→[待开票,orange] invoiced→[已开票,green] matched→[已匹配,green] exception→[异常,red]；发运 shipped→[已发运,blue] |

映射表定义在 [`w7b1-heal.mts`](../../../examples/kb-agent/scripts/w7b1-heal.mts) `STATUS_PALETTE`（w5b6-heal v2 的后继，B2/B3/B4 继承同表）；未命中的枚举值 heal 不动并 dry-run 报告。

## 3. 字型（系统栈，无外部字体）

家族 `PingFang SC, HarmonyOS Sans SC, Microsoft YaHei, system-ui, sans-serif`。PC 五档：12 辅助 / 13 正文+表头（表头 +600 + #55606E + #FAFAF9 底） / 15 卡片标题 / 18 区块标题 / 28 KPI 数字（单位与 ¥ 60% 尺寸）。数字一律 tabular-nums；金额/数量/编码列加 `font-feature-settings:'tnum'`。字重 400/600 两档。

## 4. 间距/密度/几何

4/8 网格：页面留白 24 / 区块 24 / 卡内边距 20（紧凑 16）/ 表格行高 48-52（td padding-block 14，已入 globalStyle）/ 列内边距 12×8 / 工具条 48。圆角四值：卡 8 / 控件 6 / Tag 999 / 徽标 4。阴影两档（弥散同调）：卡 `0 1px 2px rgba(31,38,48,.04), 0 8px 24px rgba(31,38,48,.06)` / 浮起 `0 4px 12px rgba(31,38,48,.10)`；卡片 1px #E8E8E6 边框与阴影并存。

## 5. 组件规格（heal 对照）

| 组件 | 规格 |
|---|---|
| 统计卡 | 白卡+边框+弥散影；数字 28/600/#1F2630 + 单位 60% + tnum；标签 12/500/#55606E；脚注 10/#8A94A0 |
| 表格 | 表头 13/600/#55606E/#FAFAF9；行高 48-52；斑马 #FAFAF9；hover #F0F6FC；行分隔 1px #EFEFEF；金额右对齐+千分位（`separator:'0,0.00'`+¥ 前缀）+tnum；数量右对齐 `separator:'0,0'`；日期 `YYYY-MM-DD`（datetime `HH:mm`）右对齐；状态列 Tag 左对齐 |
| Tag | soft 配对 + 999px + 12px（§1.2） |
| 按钮 | 主=主色实底 / 次=描边 / 文字钮；6px 圆角；active scale(0.98)；删除 #AA0808 |
| 空态/骨架 | 线性几何图标+主副文案+CTA；骨架与行结构匹配；表格空态禁转圈 |
| 看板卡/日历事件 | 8px 圆角+左 3px 状态色条+标题 13/600+元信息 12 弱色 |
| 页头 | 标题 15-18/600；面包屑 12 弱化；计数胶囊 soft |

## 6. 动效

`160ms cubic-bezier(0.16,1,0.3,1)`；骨架 shimmer 1.2s；弹层 200ms；prefers-reduced-motion 全量降级（globalStyle 已带）。

## 7. 落地层次（谁改哪层）

| 层 | 载体 | 归属批次 |
|---|---|---|
| 1 seed token | themeConfig `w7-forge` 行（w7b0-theme.mts --apply） | B0（已生效；含 pinning sweep 与快照合并） |
| 2 globalStyle | `--w7-*` 全集+表格基底+Tag soft 覆写（同上脚本内 GLOBAL_STYLE） | B0（已生效；B1 增补行高/行分隔 2026-10-03） |
| 3a schema heal | w7b1-heal.mts：枚举 recolor/金额数量右对齐+千分位/日期格式/统计卡重生成 | B1~B4 |
| 3b JSBlock | 页内 `<style>` 引用 `--w7-*`，禁散装内联 | B5 |
| 3c SPA/iframe | labels/引擎侧页独立令牌 | B5 |

回滚：层 1/2 = w7b0-theme.mts --rollback（快照合并+pin 恢复）；层 3a = w7b1-heal.mts --rollback（journal 逆放）。
