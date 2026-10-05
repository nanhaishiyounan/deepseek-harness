# W9 mobile 设计语言「酱园琥珀 · Sauce Amber」— 定稿

> 裁决批 B3 产出（2026-10-05）。本文是 W9 mobile 视觉重设计（B4 tokens 重写 / B5 首屏+聊天流 / B6 全页面）的唯一视觉基准；token 值以本文为单一来源。
> 溯源：用户第三次点名「mobile 的 UIUX 还是很难看」，W9 planning 定稿五条视觉根因（R1 密度无呼吸 / R2 色彩寡淡 / R3 antd-mobile 默认形态通用感 / R4 字体节奏平 / R5 缺品牌记忆点）。W8 结论是准则合规而品味不足，本语言是对品味的定向回答。
> 证据：`w9-b3-01-design-directions.png`（三案对照）、`w9-b3-02-{d1,d2,d3}-home-mock-375.png`、`w9-b3-03-{d1,d2,d3}-chat-mock-375.png`、`mock/*.html`（6 个可复渲染源）。

## 一、裁决记录（内部打分，不问用户）

### 1.1 三候选与深化名

| 种子 | 深化定名 | 一句话气质 | 签名元素 |
|------|---------|-----------|---------|
| D1 暖食工坊 | **酱园琥珀** | 酱油发酵的暖：暖纸画布 + 柿橙主色 + 深焙墨 + 圆形酱印 | 「鲜酿」酱印圆章（继承 W7 stamp 印章基因） |
| D2 晨检锐蓝 | 晨光仪表 | 清晨质检的冷峻：深墨蓝大色块 hero + 48px tabular 数字面板 + 细线分层 | 「今日晨检面板」大数字 |
| D3 墨纸编辑部 | 食谱书页 | 精装食谱的书卷：纸感米白 + 宋体浓墨 display + 朱砂印落款 | 「验」朱砂方印 + 宋体章节排版 |

三案 mock 已真实渲染对照（三案在色温/字体/卡片形态/记忆元素四维均为五星差异，肉眼可判「不像同一个模板」）。

### 1.2 六标准打分表（每条 0~5，合计 30）

| 标准 | D1 酱园琥珀 | D2 晨光仪表 | D3 食谱书页 |
|------|:---:|:---:|:---:|
| ① 品牌记忆点强度 | **5** | 3 | 4 |
| ② 食品行业气质契合 | **5** | 3 | 3 |
| ③ 375px 小屏适配 | 4 | **5** | 3 |
| ④ 与 PC 端 W7 铸造共存 | 4.5 | **5** | 4 |
| ⑤ 可达性约束兼容（W8 语义保留） | 4.5 | **5** | 4 |
| ⑥ 实现成本（B4~B6 落地） | 4 | **4.5** | 3 |
| **合计** | **27.0** | 25.5 | 21.0 |

### 1.3 裁决理由（直指五根因）

**胜出：D1 酱园琥珀。** 五根因的治法：

- **R1 密度无呼吸 → 暖纸分层 + 大圆角卡片 + 统计四格改两列大卡**。卡片间距 20px（原 12/16）、区块间距 28px、圆角 20px 让每张卡自成一块「酱坛」，留白是设计的一部分而非剩余空间。
- **R2 色彩寡淡 → 暖纸画布 + 柿橙主色双情绪面**。#FBF5EB 暖纸底让首屏永远有温度；#B4530A 柿橙在 CTA/关键数字/选中态三处形成每屏 2~4 次的暖色心跳（替代 W7「蓝 ≤2 命中」的克制纪律——暖色允许更多命中，因为暖纸底天然消化饱和度）。
- **R3 组件通用感 → 印章语言全面替换 antd-mobile 默认形态**。气泡=纸标签（非对称尾角 18/6px）、chips=胶囊章（左端朱点）、TabBar=暖纸托盘+选中朱底圆角图标槽、发送钮=圆形柿橙印章、回执卡=台账纸+圆章角标。每个形态都来自「酱园标签/封印」的物件世界。
- **R4 字体节奏平 → 六级字阶 + 双字重 + mono 数字轨**。display 30/800 与 body 14/400 形成 2.1 倍尺寸阶差与 800/400 字重对比；所有数字（统计/金额/单号）走 mono 栈 tabular 大号（≥26px），文字与数字双轨节奏。
- **R5 缺品牌记忆点 → 酱印签名系统**。home hero 的「鲜酿」圆章（日期环绕+批次号）、回执卡的「收讫」章、AI 同事色环字章——印章是 W7 stamp logo 的直系暖系进化，跨 PC/mobile 同基因。

**D2 落选理由**：共存性最好（同源蓝）但正因如此——它是 W7 铸造的「加深版」，用户三次点名的「难看」正是蓝灰工厂风的延续；数字面板记忆点在工业产品里同质化严重（Fiori/思杰/金蝶云之家均此路）；行业契合弱（冷调与食品温度错位）。
**D3 落选理由**：字体个性最强、留白最奢侈，但宋体细笔画在 375px 低分屏对比度折损（③）、编辑部气质与制造业现场错位（②）、12 路由全铺衬线排版系统成本最高（⑥）。

### 1.4 融合条目（落选案优点吸收进 D1）

| # | 来源 | 融合内容 |
|---|------|---------|
| F1 | D2 | **数字纪律**：所有统计/金额/单号一律 mono 栈 + `tabular-nums` + ≥26px（hero 数字 32~44px），保证数据可信感不因暖调软化（治 R4 的数字面） |
| F2 | D3 | **标题字重节奏**：display 级与正文保持 ≥2 倍尺寸阶差 + 800/400 双字重极限对比（不引入衬线字体，规避小屏渲染风险） |
| F3 | D3 | **落款印位**：回执卡右下角外飘小印（旋转 -6°、可压边），像台账上的收讫章——已纳入 D1 组件清单 ReceiptCard 规格 |

## 二、设计原则（五条）

1. **暖纸为底，章为言**：画布永远是暖纸，情绪由柿橙的有限心跳（CTA/关键数字/选中态）给出，身份由印章给出；除品牌蓝锚点外不引入冷色相。
2. **留白即容器**：卡间距 20 / 区块 28 / 页边 20 的间距阶是内容结构本身；宁可一屏少一块，不可挤压卡片内距（卡内 ≥16px padding）。
3. **形态来自物件**：组件形态词汇全部取自酱园物件——纸标签（气泡）、胶囊章（chips）、圆印（发送/头像）、台账纸（回执）；禁止使用未改造的 antd-mobile 默认形态。
4. **文字与数字双轨**：文字走系统黑体六级阶 + 800/400 双字重；数字走 mono 栈 tabular，尺寸 ≥26px 才有资格当「数字」。
5. **可达性语义不回退**：W8 的 focus-ring / 触控 44/40 / 16px 输入 / 对比度门槛全部保留，只换值不删语义；探针 gate 项只增不减。

## 三、Token 全表（亮/暗双轨）

> 命名沿用 `--dshm-*` 前缀（B4 直接替换 tokens.css 值域）。对比度按 WCAG 相对亮度公式验算：正文 ≥4.5:1，大字/图形 ≥3:1。

### 3.1 品牌与画布

| Token | 亮轨 | 暗轨 | 用途 / 对比度 |
|-------|------|------|--------------|
| `--dshm-canvas` | `#fbf5eb` | `#191310` | 画布（暖纸 / 焙黑） |
| `--dshm-card` | `#ffffff` | `#2a221c` | 卡面（墨 12:1 / 12.6:1） |
| `--dshm-card2` | `#f6eddf` | `#1f1913` | fold 区 / 输入井 |
| `--dshm-brand` | `#b4530a` | `#e58b4a` | 柿橙主色（亮对画布 4.7:1、对白卡 5.0:1；暗对卡 6.2:1） |
| `--dshm-brand-deep` | `#8f4106` | `#c26f33` | 按压态 / 深一阶 |
| `--dshm-brand-soft` | `#f8e4d2` | `#3b2a1c` | 主色 soft 底（chip/选中槽） |
| `--dshm-on-brand` | `#ffffff` | `#241708` | 主色实底上的前景（亮 5.0:1） |
| `--dshm-anchor` | `#8f4106` | `#f09a5e` | 链接/「全部 ›」/表单助手章锚（亮=柿橙深阶对白卡 7.2:1 / 暗=柿橙提亮阶对卡 7.0:1）〔W10 修订：清除 W7 品牌蓝锚，并入柿橙系〕 |
| `--dshm-ink` | `#3d2b1f` | `#f2e3d3` | 墨·主文字（亮对画布 12.0:1 / 对卡 13.5:1；暗对卡 12.6:1） |
| `--dshm-ink-sub` | `#6f5b49` | `#c3ab93` | 墨·次文字（亮对画布 6.0:1；暗对卡 7.2:1） |
| `--dshm-ink-weak` | `#9a8570` | `#8d7b66` | 仅装饰/骨架/时间戳壳，**不负载正文** |
| `--dshm-line` | `#eadfc9` | `#453728` | 描边线 |
| `--dshm-line-strong` | `#dfc9a6` | `#57452f` | 回执卡描边（深一阶） |

### 3.2 语义五态（Fiori 语义对 · 暖化取值；fg 对白卡 / 暗轨对卡）

| Token | 亮 fg | 亮 soft | 暗 fg | 暗 soft | 语义（与 W7 五态一一对应） |
|-------|-------|---------|-------|---------|--------------------------|
| `--dshm-success` | `#4a7031` | `#eaf2dc` | `#8fbe72` | `#22301b` | 合格/生效/已完成（5.8:1 / 7.5:1） |
| `--dshm-warning` | `#b35600` | `#fbefd9` | `#f2a93b` | `#33270f` | 待处理/临期（4.95:1 / 8.1:1） |
| `--dshm-danger` | `#a93226` | `#f9e4e0` | `#ef8078` | `#3a1d18` | 不合格/驳回/逾期（6.6:1 / 6.1:1） |
| `--dshm-info` | `#2e6e8e` | `#e0eef4` | `#6fb1ce` | `#16303c` | 进行中/已提交（5.6:1 / 6.6:1） |
| `--dshm-neutral` | `#7a6a58` | `#f1e8da` | `#b3a28c` | `#2e261c` | 草稿/停用/元数据（5.3:1 / 6.4:1） |

### 3.3 气泡与印章

| Token | 亮轨 | 暗轨 | 用途 |
|-------|------|------|------|
| `--dshm-bubble-user-bg` | `#b4530a` | `#a85f1f` | 用户气泡（白字亮 5.0:1 / 暗 6.1:1） |
| `--dshm-bubble-user-fg` | `#ffffff` | `#fdf3e7` | 用户气泡前景 |
| `--dshm-bubble-ai-bg` | `#ffffff` | `#2a221c` | AI 气泡（纸标签） |
| `--dshm-bubble-ai-border` | `#eadfc9` | `#453728` | AI 气泡描边 |
| `--dshm-seal-ring` | `#b4530a` | `#e58b4a` | 印章环线（酱印/收讫章描边） |
| `--dshm-seal-face` | `#ffffff` | `#241a12` | 印面底 |
| `--dshm-stamp-avatar-1..4` | `#93382a / #1d5f5a / #2e5e34 / #7a5230` | 同亮（章色恒定） | AI 同事四字章（W7 stamp 盘直接继承）〔W10 修订：1 号章由 W7 蓝 `#1e4e8c` 改暖红棕 `#93382a`，去蓝残留〕 |
| `--dshm-stamp-ink` | `#fff8ee` | 同亮（双轨恒定） | 章面字色（章底恒深，纸白字 ≥7:1）〔W10 新增〕 |

### 3.4 字体阶（六阶 + mono 轨；治 R4）

| Token | 值 | 用途 |
|-------|-----|------|
| `--dshm-fs-display` | `30px` / 800 / 行高 1.25 / 字距 -0.5px | hero 问候、章中心字 |
| `--dshm-fs-title` | `20px` / 800 / 行高 1.3 | 区块标题（「AI 同事」「今日台账」） |
| `--dshm-fs-heading` | `17px` / 700 / 行高 1.4 | 卡片标题、页面标题 |
| `--dshm-fs-body` | `14px` / 400 / 行高 1.6 | 正文（从 W7 的 13px 上调——呼吸感的一部分） |
| `--dshm-fs-caption` | `12px` / 500 / 行高 1.5 | 标签、脚注、Tab 文字 |
| `--dshm-fs-num-lg` | `32px` / 700 / mono / tabular | 统计大数字（hero 可到 44px） |
| `--dshm-fs-num-md` | `26px` / 700 / mono / tabular | 台账行数字 |
| `--dshm-fs-input` | `16px` | **输入下限不变**（iOS 聚焦缩放防线） |
| `--dshm-font-num` | `'SF Mono', ui-monospace, 'Menlo', monospace` | 数字轨字体栈 |
| `--dshm-font-sans` | `-apple-system, 'PingFang SC', 'HarmonyOS Sans SC', 'Noto Sans SC', sans-serif` | 文字轨（系统栈，无外部字体） |

### 3.5 间距 / 圆角 / 阴影 / 动效

| Token | 值 | 用途 |
|-------|-----|------|
| `--dshm-space-1..6` | `4 / 8 / 12 / 16 / 20 / 28px` | 4px 基数阶（卡间距=5、区块=6、页边=5） |
| `--dshm-r-card` | `20px` | 卡片/回执/追问卡 |
| `--dshm-r-ctl` | `14px` | 控件/输入槽 |
| `--dshm-r-bubble` | `18px`（尾角 6px） | 气泡（非对称纸标签形） |
| `--dshm-r-seal` | `999px`（圆） | 印章/胶囊章 |
| `--dshm-shadow-card` | `0 1px 2px rgba(61,43,31,.04), 0 8px 24px rgba(61,43,31,.05)` | 卡（暖调弥散，禁纯黑） |
| `--dshm-shadow-raised` | `0 4px 12px rgba(61,43,31,.10)` | 浮起/回执 |
| `--dshm-shadow-seal` | `0 4px 12px rgba(180,83,10,.30)` | 主 CTA 印章投影（柿橙染影） |
| `--dshm-motion-fast` | `220ms cubic-bezier(0.22,0.9,0.3,1)` | 微交互（选中/chips） |
| `--dshm-motion-page` | `220ms cubic-bezier(0.22,0.9,0.3,1)` | 页面推入（保持 W8 时长） |
| `--dshm-motion-stamp` | `260ms cubic-bezier(0.2,1.4,0.4,1)` | 印章落章（回执出现时的盖印动效） |

### 3.6 结构常量（W8 资产，值不变）

`--dshm-touch: 44px` / `--dshm-touch-sm: 40px` / `--dshm-tabbar-height: 58px`（视觉加 padding 至 84px 含 safe-area）/ 其余引用型 token（work 四态、stamp 尺寸阶、ease 曲线族）语义不变、值随基表连动。

## 四、antd-mobile `--adm-*` 覆盖映射表

> 挂载点不变：`.dshm-root` + `html[data-theme]` 双声明（portal 场景沿 W8 机制）。B4 逐行替换值。

| `--adm-*` | 取值（亮 / 暗同 token） | 说明 |
|-----------|------------------------|------|
| `--adm-color-primary` | `var(--dshm-brand)` | 柿橙接管主操作 |
| `--adm-color-success` | `var(--dshm-success)` | |
| `--adm-color-warning` | `var(--dshm-warning)` | |
| `--adm-color-danger` | `var(--dshm-danger)` | |
| `--adm-color-text` | `var(--dshm-ink)` | 深焙墨 |
| `--adm-color-text-secondary` | `var(--dshm-ink-sub)` | |
| `--adm-color-weak` | `var(--dshm-ink-sub)` | weak 级提一档（不再用 ink-weak 承载可读文本） |
| `--adm-color-border` | `var(--dshm-line)` | |
| `--adm-color-box` | `var(--dshm-card2)` | |
| `--adm-color-background` | `var(--dshm-card)` | |
| `--adm-color-background-body` | `var(--dshm-canvas)` | 暖纸画布 |
| `--adm-font-family` | `var(--dshm-font-sans)` | |
| `--adm-radius-s` | `8px` | 小控件（印内小件） |
| `--adm-radius-m` | `var(--dshm-r-ctl)` | 14px |
| `--adm-radius-l` | `var(--dshm-r-card)` | 20px |
| `--adm-center-popup-border-radius` | `var(--dshm-r-card)` | Picker/Dialog 面板 |
| `--adm-font-size-1..10` | `9 / 11 / 12 / 14 / 15 / 17 / 20 / 24 / 30 / 44px` | 六阶重排（grade5=15 卡片标题级；grade9=display；grade10=hero 数字级） |
| `.adm-tab-bar-item-active` | `color: var(--dshm-tab-active)` | 亮 `#b4530a`（对 bar 4.9:1）/ 暗 `#f09a5e`（7.8:1） |
| `.adm-picker-popup .adm-popup-body` | `border-radius: 20px 20px 0 0` | 沿 W8 同 specificity 覆写 |
| `.adm-toast-*` | 墨底纸字胶囊（亮）/ 纸底墨字（暗） | 沿 W8 覆写换值 |

## 五、组件形态改造清单（替换 antd-mobile 默认形态；治 R3/R5）

| 组件 | 形态规格（非默认） |
|------|-------------------|
| **气泡（user）** | 柿橙实底、白字、圆角 18/18/**6**/18（右下尾角小=纸标签收口）；max-width 放宽到 `min(80vw, 300px)`（治 R1） |
| **气泡（AI）** | 白纸卡 + 焙线描边 1px + 圆角 18/18/18/**6**（左下尾角小）；暖调弥散影一档 |
| **chips（上下文/建议）** | 胶囊章：白底 + 焙线 1.5px + **左端 7px 朱点**；选中态=soft 底；高度 40（touch-sm） |
| **chips（快捷 CTA）** | 柿橙实底胶囊 + 白字 + 柿橙染影（`shadow-seal`）——全屏唯一实底 chip |
| **TabBar** | 暖纸托盘（`rgba(255,252,246,.96)` + blur14）；选中项=朱底圆角图标槽（10px 圆角 soft 底）+ 墨字加粗；未选中=次墨 |
| **Composer** | 输入槽=胶囊纸槽（白底+焙线描边）；发送钮=**46px 圆形柿橙印章**（染影）；chips 行置于槽上方 |
| **回执卡 ReceiptCard** | 台账纸：白卡 + 深一阶焙边 1.5px + 头部「收」圆章 38px + 状态 soft 章胶囊 + **右下角外飘落款印**（F3 融合，36px 方印旋转 -6° 可压边）+ 明细行虚线分隔 |
| **追问卡 FieldAskBubble** | 白卡 20px 圆角 + 「补一项」soft 章标签 + 17px/700 问句 + 建议胶囊章行 |
| **统计卡** | 两列大卡（替代四格紧凑）；数字 32px mono + 语义色 + 单位 13px 次墨；副标签 soft 章胶囊 |
| **头像（AI 同事）** | 色环字章：圆底字章（四色恒定）+ 外圈卡色环 + 在线点；用户=柿橙章 |
| **EmptyState** | 情绪化空态：40px 圆形淡印（虚线环 + 印内单字如「空」）+ 主文案 + 引导 CTA；禁转圈 |
| **Skeleton** | 暖纸色脉冲（card2 → soft 交替），与卡片形态同构（20px 圆角） |

## 六、品牌记忆点定义（治 R5）

1. **酱印签名（logo 区）**：home hero 右侧 84px 圆章——双环（实线外环 + 虚线内环）+ 中心竖排「鲜酿」二字（22px/800）+ 底部 mono 批次号（`B-1005`，取当日批次/日期派生）。它是 W7 stamp logo 的 mobile 暖系化身：同是「印章」，PC 铸造蓝章，mobile 酱园琥珀章。
2. **hero 情绪**：问候 display 30/800 + 节气文案（「今日霜降」）——节气是食品行业的自然时间轴，替代冷冰冰的日期行；预警数用柿橙粗体点睛。
3. **落款印系统**：回执「收讫」章、空态「空」章、AI 尾随说明的发送者小章——印章出现在「完成/确认/身份」三个语义位，形成跨页面的记忆连续性。
4. **空态情绪化**：空态不是灰图标+「暂无数据」，而是虚线环淡印 + 一句有人味的话（如「今天的单子都登好了」）+ 主 CTA。

## 七、W8 可达性 token 保留清单（语义枚举，只换值不删语义）

| W8 语义 | 新值承诺 | 验证 |
|---------|---------|------|
| `--dshm-focus-ring` 键盘焦点环 | 亮 `0 0 0 3px rgba(180,83,10,.40)` / 暗 `0 0 0 3px rgba(229,139,74,.55)` | 探针 gate 保留 |
| `--dshm-touch: 44px` 主触控 | 不变 | gate `touch ≥44` |
| `--dshm-touch-sm: 40px` 次触控 | 不变 | gate `touchSm ≥40` |
| `--dshm-fs-input: 16px` 输入下限 | 不变（iOS 聚焦缩放防线） | gate `inputFloor ≥16` |
| `--dshm-link` 正文链接 | 亮 `#8f4106`（对白卡 7.2:1）/ 暗 `#f09a5e`（对卡 7.0:1）〔W10 修订：去工业蓝〕 | gate `linkVsCard ≥4.5` |
| `--dshm-tab-active` Tab 选中态 | 亮 `#b4530a`（4.9:1）/ 暗 `#f09a5e`（7.8:1） | gate `tabActive ≥3` |
| 正文对比度 | 墨对卡 12:1+（亮）/ 12.6:1（暗）；柿橙对画布 4.7:1 | gate `textVsCard ≥4.5` |
| Tab 键盘可达（role=tab + Enter/Space） | 不变（MobileShell 资产） | views spec 复跑 |
| 探针 gate 项数 | **11 项语义全保留，只增不减**（w9 探针从 w8-b1-light-probe.mjs 派生，阈值随新 token 连动更新） | `vfy-w9-gates-*.log` |

暗轨对比度全表自检：见 §3.1/3.2 各行括注——所有正文级配对 ≥4.5:1，图形/状态级 ≥3:1，无例外。

## 八、B4~B6 落地指引（自包含，零追问开工）

### B4 — 视觉基座重铸（tokens + 全局壳）

1. 按本文 §3 全表重写 `packages/client/ui-mobile/src/client/tokens.css` 双轨：`.dshm-root, html[data-theme='light']` 与 `.dshm-root[data-theme='dark'], html[data-theme='dark']` 两段完整替换值域；`--dshm-*` 命名不变的 token 直接换值，新增 token（`--dshm-canvas/card/ink/ink-sub/line-line-strong/seal-ring/seal-face/fs-display/title/num-lg/num-md/space-1..6/r-seal/shadow-seal/motion-stamp/neutral` 等）按 §3 增补；W7 遗留未引用 token（`--dshm-user-grad`、`--dshm-nav-line` 若无消费方）同批清理。
2. §4 `--adm-*` 映射逐行替换（font-size 阶从五级重排为六阶，`--adm-font-size-10` 升到 44px）；`.adm-tab-bar-item-active` / picker 圆角 / toast 覆写块换值。
3. §七 保留清单逐项落值（focus-ring 换柿橙系、link/tab-active 按新值），双声明挂载机制不动。
4. 壳形态：`shell.module.css` TabBar 按本文 §五「TabBar」规格重制（暖纸托盘 + 朱底图标槽）；`ui.tsx` 的 EmptyState/Skeleton 按本文 §五 规格（虚线环淡印 / 暖纸脉冲）。
5. 派生 `demos/acceptance-w9/w9-b4-light-probe.mjs`（从 `demos/acceptance-w8/w8-b1-light-probe.mjs`）：gate 语义 ≥11 项不减少，阈值连动（tab-active 对比度参照值换 `#b4530a`）；跑双轨探针 + `w9-b4-01-shell-light-375.png` / `w9-b4-02-shell-dark-375.png`；`pnpm run build:lib:client` 后复验产物。
6. 验收即 plan B4 清单：PROBE_EXIT=0、43+ spec 全绿、typecheck + lint。

### B5 — 首屏 + 聊天流（核心两屏突破）

1. `HomeView.tsx` + `home.module.css`：hero 按本文 §六（酱印签名 + 节气问候 + 柿橙预警点睛；印章组件可先以纯 CSS 圆环实现，批次号取当日 `B-MMDD`）；统计四格改两列大卡（数字 32 mono）；chips 按 §五（唯一实底 CTA）；间距阶全部走 §3.5 space 阶（卡间 20/区块 28）。
2. 聊天流：`chat.module.css` 气泡形态按 §五（user 尾角右下 6px / AI 尾角左下 6px、max-width `min(80vw,300px)`）；`FlowItem.tsx` 回执卡头加「收」圆章 + 右下外飘落款印（F3）；FieldAskBubble 按追问卡规格；`Composer.tsx` 圆形柿橙印章发送钮 + 胶囊纸槽；chips 行朱点胶囊。**只动视觉层，数据流零改动**（plan B5 约束）。
3. B1 的 `fillDraft` 视觉反馈：填入瞬间输入槽短暂印高亮（`data-fill` + 220ms 过渡 soft 底）。
4. 证据：`w9-b5-01-home-{375,390}x{light,dark}.png` 四象限 + `w9-b5-02-chat-*` 四象限 + before/after 对照 + `w9-b5-chat-flow.gif`；探针在两屏 gates pass（F5）。
5. 回归：43+ spec、afterSeq 轮询、draft/outbox、B1 fillDraft、B2 旧会话折叠显示。

### B6 — 全页面落地

1. 九域视图（work/tasks/files/agents/me/todos/alerts/docs/login）+ 表单按 B4 基座与 §五 组件词汇投影：列表行高 ≥56、行间分隔走 `--dshm-line`、状态 Tag 全部 soft 章胶囊形态、行内数字 mono ≥16px 右对齐。
2. 表单深度换肤：antd-mobile 输入/选择器按 §4（`--adm-radius-m` 14px、box 色 card2、边焙线）；TaskFormModal 头部加业务章角标（采/销/库 单字章，沿 PlanCard seal 语言）。
3. `colleagues.ts` 渲染面：AI 同事卡用色环字章 + duty 章胶囊。
4. 证据：12 路由 `w9-b6-{01..12}-{slug}-375-{light|dark}.png` 矩阵 + `w9-b6-13-form-{light,dark}-375.png` + 登录页双轨；探针抽 3 页 pass。

## 九、已知 mock 瑕疵附录（不阻塞裁决，B4/B5 落地时消化）

1. D1 home 状态栏右侧指示文本与安全区贴边（`mock/d1-home.html` statusbar 文案）——产品壳有真实状态栏，不迁移。
2. D3 chat 落款印与「已提交」章有轻微重叠（`mock/d3-chat.html`）——D3 未胜出，仅存档；D1 的 ReceiptCard 规格已把落款印定为右下角外飘避让。
3. D2 chat placeholder 灰字对画布 ~3.2:1——placeholder 属非正文提示层，产品落地沿用 W8 惯例（ink-sub 起）。
