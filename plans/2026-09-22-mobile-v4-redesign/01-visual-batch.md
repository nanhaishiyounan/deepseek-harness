# 移动端 v4 重设计 · E2 视觉批次设计决策

> 日期：2026-09-22 | 上游输入：[E1 审计报告](../../research/2026-09-22-mobile-v4-audit/report.md)（30 条丑点 + 16 行组件映射表，产品问题不重写）与 [v3 视觉规格](../2026-09-21-mobile-v3-redesign/03-visual-design.md) | 范围：视觉执行层——产品逻辑（v3 六点重构）与信息架构不动，色彩 token 轨与暗色双轨保留。

## 1. 核心视觉策略：票据四联（材质层级）

v3 方向「冷链票据台账」不变；v4 补上的是 D 轮欠账的**材质分层**——打破「白卡套白卡」（E1 T5）的办法不是加阴影，而是让四类卡片各自对应票据流转中的一联，用底色 + 边框 + 分区线三种材质编码语义：

| 卡片 | 票据角色 | 底色 | 边框 | 内部层次 |
|---|---|---|---|---|
| 叙述气泡 | 话 | 霜白 `--dshm-card` | 1px 冷缘 | 无分区（现状保留） |
| 询问卡（ask） | 问 | `--dshm-primary-soft` 淡墨青底 | 无边框 + 左缘 3px 墨青实条 | 问题 → 选项 |
| 草稿卡（draft） | 票·白联 | 霜白 + `--dshm-shadow-card` | 1px 冷缘 | required 白 / derived `--dshm-muted` 微底 / system 折叠区深一档底，分区头胶囊化 |
| 回执卡（receipt） | 票·讫联 | `--dshm-success-10` 淡检验绿底 | 1px success 40% | 白底 metric 单元 + 单号行 |

暗色双轨同步：问联用暗轨 `--dshm-primary-soft`（#1c2e2b），讫联用暗轨 `--dshm-success-10`——材质语义靠 token 自动跟随，无需 per-theme 覆盖。

一句话：**话是白、问是青、票是纸、讫是绿**——扫一眼颜色就知道这条消息在单据流转里处于哪一环。

## 2. 戳记体系统一（D1）

44px 圆形 PhaseStamp 是唯一 signature，四相位全走同一形态（draft 空心灰环 / pending 空心墨青+DotLoading / submitted 实心检验绿+№行号 / rejected 砖红描边+45°斜杠）。v4 确认所有 v3 卡片（草稿/回执）都渲染同一组件；选择回执胶囊、头像徽章、AI 圆章借用同一「描边圆章」语言。盖印动效（v3-stamp-in）保留。

## 3. 图标与文字符号纪律

全文去 Unicode 图形字符：返回 `‹` → NavBar（lucide 左箭头语义）；发送 `➤` → lucide Send；停止文字钮 → Square 图标 + 胶囊；工具行 `✓/◌/✕` → lucide Check / SpinLoading / X，容器化（muted 底圆角行）；选择对勾 `✓` 字符 → Check 图标戳记章；`▾` details → antd-mobile Collapse 自带 chevron；我的页 `›` → List.Item arrow。业务文案中的裸 FK 引用（「鲜丰（id 7）」）在展示层清洗为「鲜丰」。

## 4. 组件库边界（E1 §3 映射表全量落地）

替换为 antd-mobile v5：NavBar、List+SwipeAction、SearchBar、CapsuleTabs、Badge、Tag、Empty、ErrorBlock、Toast、Collapse、InfiniteScroll、PullToRefresh、TextArea(autoSize)、ImageViewer、SpinLoading。自绘保留面：聊天气泡、四类卡、相位戳、欢迎屏、富渲染管线（03 §7 的裁决延续）。`--adm-*` 主题映射已存在，新组件自动跟随双轨。

## 5. 会话列表投影（C1）

副标题从 roster description 全文换成**末条消息友好投影**：`已登记 №1042 · 采购单`（receipt）→ `正在确认采购单草稿`（draft）→ `等你选择：…`（未答 ask）→ 末条气泡前 24 字（text）。投影由 fold 项派生（`projectionOf(items)`），仅对列表可见前 15 行懒读 history 并按 updatedAt 缓存；roster duty 降为 fallback。列表治理：SwipeAction 左滑置顶（localStorage pin 集）/标记已读；未读点改 Badge 砖红小点；类型徽标改 Tag。

## 6. 结构修正（方向级）

- T1 聊天详情隐藏 tabbar：`#/chat/<id>` 路由渲染全屏层（shell 不渲染 TabBar），56px 还给内容。
- T7 欢迎屏：空会话从「聊天流顶部内嵌卡」改为**垂直居中欢迎屏**——72px 戳形 logo + 显示标题 + 能力清单 + 起点 chips（03 §4.6 规格）。
- M1 我的页：身份卡 + 本月台账两指标 + **最近回执行**（表单/№/金额，从 durable log 派生）+ 常用操作 chips + antd List 设置组；退出登录独立破坏性区块 + Dialog.confirm。
- L1/L4 登录页：戳形 logo 外环 2px 实线可见化（96px 满规格）、内章 76px、双 footer 合一。
