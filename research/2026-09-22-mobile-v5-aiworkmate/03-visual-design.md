# 移动端 v5 AI Workmate · 视觉设计规格（视觉三选项裁决 + 落地规格）

> 日期：2026-09-22 | 作者：视觉设计 Agent（design-workflow 阶段三，方法论合同：frontend-design + high-end-visual-design skill——两遍设计-自评循环、三大 AI 默认脸回避、材质层次与精确嵌套）| 上游：[PLAN.md §3.5 D5](../../plans/2026-09-22-mobile-v5-aiworkmate/PLAN.md)（三选项表 + 裁决标准四条）、[01-design-and-impl.md §3](../../plans/2026-09-22-mobile-v5-aiworkmate/01-design-and-impl.md)（视觉决策合同与五条验收线）、[v3 视觉规格](../../plans/2026-09-21-mobile-v3-redesign/03-visual-design.md)（§8.2-4 否决记录、§2 token 表格式）、v4 落地资产（[tokens.css](../../packages/client/ui-mobile/src/client/tokens.css:1)、[PhaseStamp.tsx](../../packages/client/ui-mobile/src/client/forms/v3/PhaseStamp.tsx:33)、[v3.module.css](../../packages/client/ui-mobile/src/client/forms/v3/v3.module.css:1)、[messages.module.css](../../packages/client/ui-mobile/src/client/messages/messages.module.css:1)，355 测试全绿 + 14 张 verify 截图锁定）| 参考输入：`/Users/mac/Downloads/ai-coworker-mobile-h5(1).html`（仅形态参考）| 视口：390×844 主目标 | 本文所有色值/字号/尺寸为规格，不是建议。

## 1. 三选项裁决

### 1.1 结论：选 B——延续 v4 墨青冷链票据台账，演进为「工作台账」语言

**方向陈述：AI Workmate 工作台账——v3 把一句话做成一张可盖章的票，v5 把一天的协作做成一本可流转的台账：每件工作是一张工单，AI 誊写、人盖章、四态流转、联联可查。**

v5 的叙事升级（单据登记闭环机 → AI Workmate 工作台）没有改变视觉世界的对象：工作项（`WorkItem`）与表单草稿（`form_draft`）同为「一张待办的单」——工作四态 `todo/doing/review/done` 与 v3 表单四相位 `draft/pending/submitted/rejected` 一一对应同构（§5.2）。票据台账语言不是勉强承载 8 路由，而是天然覆盖：**8 页 = 一本台账的八联**——首页是封面联（今日汇总）、对话是交互联（AI 誊写）、工作是流转联（四态分区）、工作详情是经手记录联（时间线）、任务/文件是索引联与存档联、同事是印鉴联（角色戳）、我的是存根联（身份与设置）。「一票多联」正是票据世界的原生结构，8 路由从同一种材质上长出来，体系性由叙事本身保证，不靠每页换装饰。

### 1.2 四条裁决标准逐条

| 标准 | 判定 | 论据 |
|---|---|---|
| ① 高级审美（非模板脸） | 通过 | v5 的审美增量是台账语言的体系扩展：票头、工作态戳、装订线时间线、报告戳、角色戳——全部是信息编码（相位、来源、进度、角色）而非装饰（§3、§6）。v4 墨青轨本身已过 v3 §8.3 三大默认脸校验，v5 不引入任何渐变、发光、玻璃拟态。 |
| ② 食品行业 B 端语境协调 | 通过 | 墨青/冷雾白/检验绿的行业来源（HACCP 青蓝油墨、冷库雾白、检验单油墨）在 v5 语境（冷链/品控/单据）下不变。暖棕在食品行业指向烘焙与粮仓，与冷链单据世界反向。 |
| ③ 结构化卡片/工作四态/新 8 页的体系性承载 | 通过 | ReportCard 用 v4 已验证的 muted 指标格 + 语义色圆点 + tabular 数字语言组装（§6.4）；工作四态全部映射现有语义 token，零新色相（§5）；8 页共用「票头/分区线/戳记/票号栈」四件套，一联一职（§1.1）。 |
| ④ 参考 HTML 仅形态参考 | 通过 | 吸收五项形态（metrics 网格、风险条目、对比 table、actions 按钮排、typing 指示），皮肤全部落在墨青轨（§10 吸收表）。430px 壳、暖棕皮肤、透明 AI 气泡三项不采纳。 |

### 1.3 换轨成本对照（A/C 否决理由）

| 选项 | 直接成本 | 判决性理由 |
|---|---|---|
| A 暖棕纸感整轨 | token 双轨整轨替换 + PhaseStamp/四联材质/16 组件面全部重适配 + 14 张锁定截图与 golden 全部重录 | 三重否决：与 v3 §8.2-4 否决记录的关系无法超越（§2 详述）；暖棕与冷链语境反向（标准②）；参考 HTML 一旦成为皮肤即违反标准④「皮肤不照抄」——它被引入的条件就是「仅形态参考」。 |
| C 全新方向 | 同 A | 食品冷链世界里与墨青票据语言真正异质的方向只剩工业仪表盘脸（近黑底+荧光数据，即 AI 默认脸②近亲）；frontend-design 重新扎根（检验报告单、冷库标签、库位卡）得到的材料与墨青票据同源同族，产出只会是 B 的变体，成本却按 A 支付。v4 刚落地且无视觉否定反馈，v5 的任务是 IA 重构不是视觉翻案。 |
| **B 墨青票据演进** | **增量 token 11 个（其中字面值新增仅 1 个双值 token）+ v4 资产修正 4 处（§7.2，均为 1-2 行 CSS 级）** | 唯一同时满足四条标准且与产品叙事同构的选项。 |

## 2. 与 v3 自评 8.2-4 否决记录的关系（显式章节）

[v3 §8.2 第 4 条](../../plans/2026-09-21-mobile-v3-redesign/03-visual-design.md)否决的是「米白纸感 + 衬线 + terracotta」整个方向，理由三条：撞 AI 默认脸①；中文移动端衬线小字号渲染差；票据世界的中文原型（三联单/出库单）本来就是黑体+油墨，不是书卷。

**本裁决维持该否决，不翻案，并把否决边界向前推进一步：**

1. **暖棕 ≠ terracotta 成立，但不足以翻案。** 参考 HTML 的 `#6b4f3a` 确实不是 terracotta（橙红陶土，约 `#C86F4E` 一族），是低饱和深咖啡棕，且参考 HTML 用系统无衬线栈——它不是 v3 否决的字面组合。但 v3 否决的三条理由中有两条与色相精度无关：衬线渲染差一条 A 方案可以躲开（无衬线），「票据世界黑体+油墨」一条躲不开——**v5 的叙事对象仍是单据与工作台账，工作单的中文原型还是黑体+油墨**，暖纸底在这个世界里仍是异材质。IA 从单据机扩展为 Workmate 工作台改变了页面的数量与职分，没有改变纸的类型。
2. **结构化卡片语境差异不构成新论据。** 参考 HTML 的结构化卡（metrics 网格/风险条目）证明的是「AI 产出应该用结构化卡承载」，这一论点 v5 全盘接受——以形态吸收的方式（§10），吸收进墨青轨。语境变化论证的是卡片结构，不是皮肤色相；用后者换轨是把论据错配。
3. **v3 否决记录追加一条 v5 边界（本文新增，供后续版本引用）：任何「暖纸底 + 暖棕系强调」的移动端提案，除非产品的行业语境离开冷链/品控，否则默认维持否决。** 食链通的暖色永远只进语义位（琥珀待审、砖红驳回、常温褐），不进底色与品牌轴。

## 3. Aesthetic Direction 与 signature（两遍设计-自评循环全过程）

### 3.1 方向陈述

见 §1.1。翻译成视觉决策：底色冷雾白、卡面霜白、正文青墨、品牌墨青的四层不变；v4 的四联材质（霜白草稿卡、绿洗回执、primary-soft 询问卡、虚线票号条）全量继承；v5 新增**「报告联」材质**（霜白 + 报字戳 + 票据分区线，§6.4）与**「票头」构件**（primary-soft 底的台账抬头行，§6.1）。所有新组件从这六种材质里取材，不开新面。

### 3.2 Signature 元素：戳记家族（PhaseStamp → WorkStamp/报告戳/角色戳）

v3 的 signature 是 44px 相位戳——「人审=盖章、落库=生效」的唯一放声处。v5 把它从单一元素扩展为**戳记家族**：同一套材质语法（描边圆章、11px 章、配件=呼吸点/斜杠/对勾/单字），四种印章各司其职：

| 印章 | 尺寸 | 承载信息 | 出处 |
|---|---|---|---|
| 相位戳 PhaseStamp | 44px | 表单卡生命周期（draft/pending/submitted/rejected） | v3 原样继承 |
| 工作戳 WorkStamp | 44px（详情）/ 28px（列表） | 工作四态（todo/doing/review/done） | v5 新增，§5 |
| 报告戳 | 28px | ReportCard 的产出类型与身份 | v5 新增，§6.4 |
| 角色戳 | 36px（横滑卡 44px 详情） | AI 同事的角色印鉴（填/参/数/合） | v5 新增，§6.6 |

家族纪律：全应用只有这四种章 + 登录/欢迎屏的 72px 戳形 logo；头像、空态、徽标继续借用章语言（v3 既定）。**戳记仍是信息编码（相位/状态/类型/角色），不是装饰**——frontend-design 的 structure-is-information 原则在 v5 的落点。

### 3.3 第一遍 brainstorm（默认答案清单）

按 frontend-design 方法论先跑一遍「通用 AI Workmate 工作台 app」的第一反应（即不假思索会产出的版本）：

1. 首页 = 渐变品牌底统计大卡（蓝紫或墨青渐变 + 白色大数三列）。
2. 工作四态 = 通用状态色（蓝/橙/绿/灰）+ CapsuleTabs。
3. 执行过程 = 蓝色圆点时间线（点+竖线，激活点放大发光）。
4. ReportCard = 浮起白卡 + 大阴影 + 圆角大按钮排（主按钮品牌蓝）。
5. AgentsView = 每角色一枚渐变头像 + sparkles 图标。
6. TabBar = 品牌色激活 + 图标点击弹跳微动效。
7. 二级页转场 = spring 弹入（scale 0.96→1 + 上滑）。
8. typing = 聊天输入区上方灰色「正在思考…」文字。

### 3.4 逐项自评与修订

1. **「渐变统计大卡」→ 修订为票头 + 2×2 统计格**：渐变是 AI 默认感放大器（v3 §8.2-2 已否决渐变双件套），大渐变卡同时是模板 dashboard 脸的第一特征。改为：今日台账卡 = primary-soft 票头行（台账抬头 + 查看入口）+ 2×2 muted 统计格（值 22/600 tabular 四态色、标签 11）——统计数字本身用四态色编码，数字即状态，不靠底色渲染情绪（§6.1）。
2. **「四态通用蓝橙绿灰」→ 修订为墨青票据语义轨**：蓝不在品牌轨（v3 §8.2-1 已驱逐藏蓝）；四态映射 todo=青灰/doing=墨青/review=琥珀/done=检验绿，与表单四相位同构同色位——两套生命周期在一个应用里共用一套色彩语义，对称性即体系性（§5.1）。零新增色相。
3. **「蓝色圆点发光时间线」→ 修订为装订线时间线**：装订线 = 左侧 12px 虚线（`--dshm-stroke-soft`）+ 12px 步点章（done=检验绿实心、current=墨青描边+呼吸点、future=青灰描边空心）。这是票据「经手记录」列的形态——线是装订，点是印章，不发光不放大（§6.3）。发光是消费 app 的能量语言，台账的语言是油墨。
4. **「浮起白卡 + 大阴影」→ 修订为报告联材质**：ReportCard 与表单卡同级（同为 AI 产出的载体），用同一卡基（霜白 + 冷缘 1px + 极轻影）+ 新构件报字戳与票据分区线区分身份。大阴影浮卡是 SaaS 后台脸的默认（v3 §8.2-3 已否决），且聊天流内多卡大阴影会产生横向「漂浮带」，破坏流的纵向台账感（§6.4）。
5. **「渐变头像 + sparkles」→ 修订为角色戳**：沿用 v3 §8.2-2 的判决理由；AI 同事的身份用「印鉴」表达（36px primary-soft 底 + 墨青描边 + 角色单字），与表单/会话头像的单色戳语言一族（§6.6）。sparkles 图标全局禁用（AI 默认脸标志物）。
6. **「TabBar 图标弹跳」→ 修订为无图标动效**：v3 动效纪律（全应用只服务信息变化）延续；Tab 切换的确认由 fade 转场 + 激活色变化承担，弹跳是装饰性动能，删（§8）。
7. **「spring 弹入转场」→ 修订为 240ms 微滑淡入**：spring 曲线（过冲回弹）是消费 app 的物理语言；台账的页面运动是「翻页/推入」——translateX(24px)→0 + opacity，240ms `cubic-bezier(0.2, 0.8, 0.2, 1)`，无过冲（§8）。high-end-visual-design 的 custom-bezier 要求在此落为一条克制曲线，而非炫技曲线。
8. **「灰色文字 typing」→ 修订为戳点呼吸**：typing 指示用三枚 6px 墨青圆点交错呼吸（1.2s 循环）+「正在处理」11px 青灰——三点即三枚微型章，与 DotLoading（pending/doing 戳）同一呼吸语言，不引入新形态（§8）。

### 3.5 第二遍校验（三大 AI 默认脸 + brief 四条 + skill 适配裁决）

**三大默认脸**：① 奶油底+衬线+terracotta——底色仍是冷雾白（青灰调非暖调）、字体仍系统黑体栈、暖色仍在语义位（§2 追加边界执行）；② 近黑底+荧光绿——暗轨仍是青黑 + 低饱和墨青提亮，v5 未新增任何高饱和色；③ 报纸发丝线+零圆角——10/16/18px 圆角与卡内分区线不变，报告联的分区线在卡内不在全页。v5 新增面（票头/时间线/报告戳）逐件过检：无渐变、无发光、无玻璃拟态、无 sparkles。

**brief 四条**：即 §1.2 裁决标准表，逐条通过。

**high-end-visual-design skill 适配裁决**（该 skill 面向 $150k agency 级 landing/marketing 场景，部分手法与移动端工作台的克制纪律冲突，显式取舍如下）：

- 取：材质层次思想——票头的水洗底、统计格的 muted 嵌格、报告联的分区线，本质是该 skill「nested architecture（外壳+内芯的材质分层）」在票据世界的表达：不做玻璃双圈，做「纸联分层」。
- 取：自定义贝塞尔曲线纪律——v5 定义 `--dshm-ease-slide/--dshm-ease-stamp` 两条曲线 token（§4），全应用动效只允许引用这两条 + `ease-out`。
- 取：性能守卫——只动 transform/opacity，blur 只允许出现在吸底 TabBar 与弹层遮罩（且 TabBar 用纯色卡底即可满足，不强制 blur）。
- 弃：双圈 bezel（rounded-[2rem] 外壳）——票据卡是 16px 圆角的纸，不是 machined hardware；staggered reveal 与 800ms+ 重入场——聊天流与列表的入场是 180ms 级（§8）；Z 轴叠卡与旋转——移动端触控冲突，弃。

**校验通过，规格定稿。**

## 4. 色彩系统：token 增量双轨表

### 4.1 增量原则

选 B 意味着 v3/v4 的全量 token（[tokens.css](../../packages/client/ui-mobile/src/client/tokens.css:10) 亮轨 + [:80](../../packages/client/ui-mobile/src/client/tokens.css:80) 暗轨）原样继承，本文只列增量。增量分三类：**字面双值型**（亮暗两轨各落一值）、**引用型**（`var()` 指向现有 token，单点定义、暗轨自动跟随被引用值的暗轨——这是刻意的单点设计，不是双轨缺失）、**主题无关型**（尺寸/时长/曲线，亮轨块定义一次）。

### 4.2 亮色轨增量（追加进 `.dshm-root`）

```css
.dshm-root {
  /* v5 · 工作台账增量（03 §4） */
  --dshm-work-todo: var(--dshm-muted-foreground);   /* 待处理 = 青灰（引用型） */
  --dshm-work-doing: var(--dshm-primary);           /* 进行中 = 墨青（引用型） */
  --dshm-work-review: var(--dshm-warning);          /* 待确认 = 临期琥珀（引用型） */
  --dshm-work-done: var(--dshm-success);            /* 已完成 = 检验绿（引用型） */
  --dshm-on-soft: #0b5d56;          /* primary-10/primary-soft 底上的前景（字面双值型，§7.2） */
  --dshm-stamp-lg: 44px;           /* 详情级戳（相位/工作） */
  --dshm-stamp-sm: 28px;           /* 列表级戳（工作/报告） */
  --dshm-stamp-avatar: 36px;       /* 角色戳 */
  --dshm-motion-fast: 160ms;       /* Tab fade / 点选 */
  --dshm-motion-page: 240ms;       /* 二级页推入 */
  --dshm-ease-slide: cubic-bezier(0.2, 0.8, 0.2, 1);   /* 无过冲衰减推入 */
  --dshm-ease-stamp: cubic-bezier(0.2, 1.4, 0.4, 1);   /* 盖章曲线（从 v3.module.css 提升） */
}
```

### 4.3 暗色轨增量（追加进 `.dshm-root[data-theme='dark']`）

```css
.dshm-root[data-theme='dark'] {
  --dshm-on-soft: #e4ebe9;         /* 暗轨 chip 前景改用前景色：#4ca79c on #1c2e2b 仅 3.9:1（§7.2） */
}
```

暗轨完整性对照表（每个新 token 的暗轨表现，引用型/主题无关型列出跟随值以供审计）：

| token | 亮轨 | 暗轨 | 类型 |
|---|---|---|---|
| `--dshm-work-todo` | `#5c716d`（青灰） | `#9bb0ab`（跟随 muted-foreground） | 引用型 |
| `--dshm-work-doing` | `#0b5d56`（墨青） | `#4ca79c`（跟随 primary） | 引用型 |
| `--dshm-work-review` | `#a85a10`（琥珀） | `#d08a3e`（跟随 warning） | 引用型 |
| `--dshm-work-done` | `#1f7a4d`（检验绿） | `#4e9e6f`（跟随 success） | 引用型 |
| `--dshm-on-soft` | `#0b5d56` | `#e4ebe9` | 字面双值型 |
| `--dshm-stamp-lg/sm/avatar` | 44/28/36px | 同值（主题无关） | 主题无关型 |
| `--dshm-motion-fast/page` | 160/240ms | 同值（主题无关） | 主题无关型 |
| `--dshm-ease-slide/stamp` | 贝塞尔曲线 | 同值（主题无关） | 主题无关型 |

### 4.4 字体层级（沿用 + 一处升格）

v3 字阶全量沿用（[03 §3](../../plans/2026-09-21-mobile-v3-redesign/03-visual-design.md) 九档）。v5 增补两档工作台专用位，不推翻既有档位：

| 角色 | 字号/行高 | 字重 | 字体栈 | 用途 |
|---|---|---|---|---|
| 页面问候（新） | 20/28 | 600 | sans | HomeView 顶部问候语 |
| 统计大数（新） | 22/28 | 600 | num（等宽 tabular） | HomeView 统计格值、WorkView 态计数 |

数字纪律延续：全应用 tabular-nums；票号栈（`--dshm-font-num`）使用位从三处（行号/单号/金额）扩至四处——**工作编号**（`WK-2026-0014`，WorkDetailView 票头与任务行）。

## 5. 工作四态视觉语言

### 5.1 四态色与形态映射

| 态 | 色token | 亮值 | 对应表单相位 | 戳形态（WorkStamp） | 列表降级 | 大数降级 |
|---|---|---|---|---|---|---|
| todo 待处理 | `--dshm-work-todo` | `#5c716d` | draft | 空心，青灰 2px 描边，章「待处理」 | 8px 青灰实心点 | 值 22/600 青灰 |
| doing 进行中 | `--dshm-work-doing` | `#0b5d56` | pending | 空心，墨青 2px 描边，章「进行中」+ 内部 DotLoading | 8px 墨青实心点 | 值 22/600 墨青 |
| review 待确认 | `--dshm-work-review` | `#a85a10` | ——（语义=「待审」，承 v3 pending 徽标的琥珀位） | 空心，琥珀 2px 描边，章「待确认」 | 8px 琥珀实心点 | 值 22/600 琥珀 |
| done 已完成 | `--dshm-work-done` | `#1f7a4d` | submitted | 实心检验绿底 + 对勾（on-primary 前景），章内「✓」 | 8px 检验绿实心点 | 值 22/600 检验绿 |

四态与三相位的色位对应关系：todo↔draft（青灰空心）、doing↔pending（主色描边+呼吸）、done↔submitted（绿实心+配件）。review 无表单对应位，取 v3「待审」徽标的琥珀——**同一色彩语义（琥珀=等人工审阅）跨两个生命周期复用**，用户只需学一次。

### 5.2 与 PhaseStamp 的关系：同家族扩展，非复用组件

裁决：**新建 WorkStamp，共用戳材质类家族**。工程形态：把 [v3.module.css](../../packages/client/ui-mobile/src/client/forms/v3/v3.module.css:87) 的 `.stamp` 材质基类（44px/圆/2px 描边/11px 章/配件伪元素）抽为可共享的戳基类（建议落在新的 `stamp.module.css` 或 v3.module.css 导出 composes），WorkStamp 引用基类 + 四个态修饰类（`work_todo/doing/review/done`）。不复用 `PhaseStamp` 组件本体的原因：`CardPhase` 是表单相位 union，工作四态是独立状态机（review 可打回 doing，表单无此转移），类型上不应共用；视觉上必须同族——**形态语言共享，状态语义分离**。

尺寸梯度：详情页 44px（`--dshm-stamp-lg`，与 PhaseStamp 并列同级）、工作列表卡 28px（`--dshm-stamp-sm`，列表密度下的印章缩样，章文字 10px）。done 戳内是 14px 对勾（lucide Check 或 CSS 绘制）而非行号——**行号是「落库」语义（submitted 专属），对勾是「完成」语义**，两个家族成员靠配件区分。

### 5.3 四态的三种降级形态（同一 token 三处消费）

1. **戳形态**（§5.1 列）——工作详情卡 44px / 工作列表卡 28px。
2. **点形态**——任务行（TasksView/WorkView 字段行）8px 实心点，色随态。
3. **数形态**——HomeView 统计格与 CapsuleTabs 计数徽标的数字色。
点与数不承载描边/配件（密度所限），色 token 三处同源——四态色只允许通过 `--dshm-work-*` 四个 token 引用，组件禁止直写语义色名（保证未来调色单点改）。

## 6. 组件规格

前提（v3 既定沿用）：内容列左右 12px 页边距；聊天流内卡片全宽 326px（390 − 24 − 40 AI 侧占位）；一级页区块间 16px、区块内标题行上下 8px；卡片材质 = 霜白底 + 冷缘 1px + 16px 圆角 + 极轻影（v4 `.card`）。

### 6.1 HomeView（`#/`，Tab1 AI 同事）

```
┌────────────────────────────┐
│ 早上好，王经理              │  问候 20/28 600 青墨；padding 16
│                            │
│ ┌────────────────────────┐ │
│ │今日台账·09-22周二 查看台账›│ │  票头行：primary-soft 底、圆角10、
│ └────────────────────────┘ │  h36、内边距 8 12；左文 11 num 前景色，
│ ┌─────────┬─────────┐      │  右链 12/600 --dshm-on-soft
│ │   3     │   1     │      │  统计格 2×2：muted 底、圆角10、
│ │ 待处理   │ 进行中   │      │  内边距 10；值 22/28 600 num tabular
│ ├─────────┼─────────┤      │  四态色（§5.3）；标签 11/16 400
│ │   2     │   5     │      │  前景色（§7.2 修正）；格间距 8
│ │ 待确认   │ 已完成   │      │  整卡点击 → #/work
│ └─────────┴─────────┘      │
│ AI 同事            查看全部 ›│  区块标题行：13/500 青灰 + 12 链接
│ ┌──────┐┌──────┐┌──────┐   │  横滑角色卡：w88 h76 霜白 border 圆角12，
│ │ (36) ││ (36) ││ (36) │   │  竖排居中；角色戳 36（primary-soft 底 +
│ │智能填表││经营参谋││数据助手│   │  墨青描边单字 14/600）+ 名 12/500；
│ └──────┘└──────┘└──────┘   │  横滑不回弹隐藏箭头；点击 → 发起对话
│ 最近对话            查看全部 ›│  复用 sessionRow 紧凑版 ×3（64 行高，
│ │(44) 宏发冷链箱采购    昨天 │ │  v4 资产原样），尾项无分割线
│ │(44) 三味食品建档      周一 │ │
│ 快捷任务                    │  区块标题行
│ [问风险汇总][生成周报]       │  starter chips：h32 全圆角、
│ [登记采购单][查库存]         │  primary-soft 底、字 12 --dshm-on-soft、
│                            │  wrap gap 8；点击 → 预填输入发起对话
└────────────────────────────┘
```

数据映射（PLAN §2.1）：统计 = workStore 四态计数 + durable 回执派生；最近对话 = sessions 投影前 3；快捷任务 = 静态四枚（风险/周报直接触发 report 类提问，登记采购单/查库存走既有 preset 能力）。问候语按本地时段取「早上好/下午好/晚上好」+ 登录身份名。

### 6.2 WorkView（`#/work`，Tab3 工作）

```
┌────────────────────────────┐
│ 工作                        │  header 17/600 sticky 卡底（v4 header 语言）
│ (待处理 3)(进行中 1)        │  CapsuleTabs 全圆角 12px：枚举四态、
│ (待确认 2)(已完成 5)        │  选中墨青底 on-primary 字、计数 num；
│                            │  计数 = 对应态 workStore 计数
│ ┌────────────────────────┐ │
│ │ (28)接口联调延期处理     │ │  任务卡：霜白 16 圆角、padding 12 14；
│ │      待处理             │ │  卡头 = WorkStamp 28（态章）+ 标题 15/500
│ │ 来自对话·风险汇总     ›  │ │  来源徽标：10px 胶囊 primary-10 底
│ │ 负责人 张三              │ │  --dshm-on-soft 字，点击回源会话锚点
│ │ 截止    09-24 · 还剩2天  │ │  字段行 h32：label 12 青灰 + 值 14/500
│ │ [ 开始处理 ]             │ │  临期（≤2天）截止值琥珀色
│ └────────────────────────┘ │  态操作区（h36）：
│ ┌────────────────────────┐ │   todo → 主按钮「开始处理」→ doing
│ │ (28)供应商周报生成       │ │   doing → 呼吸点+「查看进度」次钮→详情
│ │      进行中 · 第2/3步    │ │   review → 主「确认完成」+ 次「打回」
│ └────────────────────────┘ │   done → 结果摘要行 12 青灰 +「查看结果」
│                            │  空态：antd Empty 定制描述
│                            │  「这个状态还没有工作」+ CTA→#/chats
└────────────────────────────┘
```

态操作语义与 workStore 状态机一致（todo→doing→review→done，review 可打回 doing）；「开始处理」在列表内直接翻态并本地 Toast，不跳页——列表是快操作台，详情是完整记录。

### 6.3 WorkDetailView（`#/work/:id`，全屏层）

```
┌────────────────────────────┐
│ ‹ 接口联调延期处理           │  NavBar（antd）标题 15/500 截断
│ ┌────────────────────────┐ │
│ │ WK-2026-0014  (44)待确认 │ │  票头卡：左工作编号 13 num tabular
│ │ 创建 09-22 09:35         │ │  青灰、右 WorkStamp 44（态章 §5.2）；
│ └────────────────────────┘ │  次行创建时间 11 青灰
│ ┌─ 来源 ─────────────────┐ │
│ │ │帮我看看项目现在有什么风险│ │  上下文卡：分区头 11/500 青灰（v3 tierHead
│ │ │                        │ │  语言）；引用块 muted 底圆角10、
│ │ 回到源对话 ›             │ │  左缘 3px 墨青竖条、文字 13/20 前景色、
│ └────────────────────────┘ │  两行截断；回链 13/600 primary
│ ┌─ 执行时间线 ────────────┐ │
│ │ ● 读取风险条目      09:33│ │  装订线：左 12px 虚线 stroke-soft，
│ │ ◉ 生成处理建议      09:34│ │  步点 12（done=绿实心/current=墨青
│ │ ○ 写入任务台账       —   │ │  描边+呼吸/future=青灰描边空心）；
│ └────────────────────────┘ │  步名 14/500 前景色、时间 11 num 青灰；
│ ┌─ 结果（绿洗联）─────────┐ │  步行 min-h 40；新步入场 180ms（§8）
│ │ ✓ 处理建议已生成          │ │  结果卡（review/down 后显示）：
│ │ 与技术负责人确认新联调时间…│ │  receipt 材质（绿洗+success-rim）+
│ │ 查看完整报告 ›            │ │  20px 检验绿对勾章 + 标题 15/600 +
│ └────────────────────────┘ │  摘要 13/20 两行截断 + 回源链接
│ [ 确认完成 ]  [ 打回修改 ]   │  吸底操作区：card 底 border-top +
└────────────────────────────┘  按钮随态（review=主+次 / doing=查看
                                执行会话 / done=「回到聊天」主）
```

时间线数据：真实态 = 执行会话 fold 投影（工具调用/消息步），演示态 = 同构模拟步骤注入——**组件单一，数据源双态**（PLAN §3.4）。操作区按钮行为：确认完成 = workStore 翻 done + 源会话发真实 user 动作消息（「模型可见⟺日志可重建」红线）；回到聊天 = navigate 回源会话锚点。

### 6.4 ReportCard（v5 签名组件，聊天流内，零歧义规格）

payload 按 [PLAN §3.3](../../plans/2026-09-22-mobile-v5-aiworkmate/PLAN.md)：`title / subtitle? / metrics[]（label+value+kind+tone）/ rows[]（label+hint+level）/ table?（columns+rows）/ actions[]（label+kind: 'view'|'create-task'|'send'|'link'+payload）`。卡基 = v4 `.card`（霜白 16 圆角 border 极轻影）全宽 326px，padding 14；分区线 = 卡头下 1px `--dshm-stroke-soft`，段间距 12。

```
┌────────────────────────────┐
│ 项目风险汇总        ╭────╮  │  卡头：标题 15/24 600 青墨 +
│ 3 项需要关注         │ 报 │  │  subtitle 12/18 400 青灰（左列）；
│ ────────────────────╰────╯  │  右侧报告戳 28（primary-soft 底 +
│ ┌──────┬──────┬──────┐      │  墨青 2px 描边、字 11/600
│ │  3   │  1   │  2   │      │  --dshm-on-soft；章字=报告类型首字：
│ │ 高风险 │ 中风险 │ 待确认 │      │  风险「险」/周报「报」/对比「比」）
│ └──────┴──────┴──────┘      │  metrics 网格：3 列 1fr、gap 8、
│ ──────────────────────────── │  超出 3 枚自动换行（3+3）、渲染上限 6；
│ ● 接口联调延期               │  格 = muted 底圆角10 padding 8 10；
│   预计影响测试开始 1～2 天 ›  │  值 20/26 600 num tabular、tone 映射
│ ◍ 测试资源不足               │  positive→success / negative→
│   当前有 4 个任务等待测试     │  destructive / neutral→前景色；
│ ○ 需求仍有 2 项待确认         │  标签 11/16 400 前景色（§7.2 修正）
│   建议今天完成确认            │  rows 条目：min-h 44、行间
│ ──────────────────────────── │  stroke-soft 分隔；dot 8px（high→
│ ┌──────────────────────────┐ │  destructive / mid→warning / low→
│ │能力    │  A  │  B  │  C  │ │  muted-foreground）+ label 14/22 500
│ │AI 平台 │ 强  │  中  │  强  │ │  前景色 + hint 12/18 400 青灰；
│ └──────────────────────────┘ │  行内 action（可选）13/600 primary
│ ──────────────────────────── │  下划线文字钮、右对齐
│ [创建处理任务]  [生成周报]     │  table（可选）：列头 12/500 青灰 on
└────────────────────────────┘   muted 行底；格 13、数字列 tabular；
                                 行高 32；首列青灰余列青墨 500
                                 （v4 richText 表格语言）；超宽横滚
                                 actions 排：flex wrap gap 8、上距 12；
                                 主按钮 h36 圆角10 padding 0 16 字 13/600
                                 墨青底 on-primary 字、按压 --dshm-primary-press；
                                 次按钮同尺寸 transparent 底 + 冷缘 1px +
                                 前景色字；渲染上限 3 枚（超出丢弃，
                                 persona 提示词同步约束 actions ≤3）
```

主次判定：`actions` 中存在 `kind:'create-task'` 时它必为主按钮且居末位（拇指热区）；否则首枚为主。kind 行为：`create-task` → TaskFormModal（§6.5）、`view` → 路由跳转、`send` → 回聊天发消息、`link` → 外链（WebView 或复制）。段渲染条件：metrics/rows/table/actions 各自仅在 payload 段非空时渲染（含分区线，空段不产生空线）。协议隐形：围栏、snake_case 字段名、表名永不渲染（v3 §4.5 纪律延续）；损坏 payload 走降级为代码块路径。

### 6.5 TaskFormModal（底部弹层）

```
┌────────────────────────────┐
│ 创建处理任务             ✕   │  弹层头 17/600 + 关闭钮；底部弹层
│ ──────────────────────────── │  圆角16 顶部、背景卡底、遮罩
│ ┌──────────────────────────┐ │  rgba(0,0,0,.45)
│ │ 来自：接口联调延期（风险）  │ │  源摘要条：primary-10 底圆角10、
│ └──────────────────────────┘ │  padding 8 12、字 13 --dshm-on-soft
│ 任务标题                     │  表单行：label 12/500 青灰 上距 12；
│ ┌──────────────────────────┐ │  Input h44 圆角10 霜白底冷缘边
│ │ 接口联调延期处理           │ │  （v3 fieldInput 语言）；
│ └──────────────────────────┘ │  负责人 = Picker 触发行（v3
│ 负责人 ›      张三           │ │  fieldPicker 语言）值右对齐；
│ 截止时间 ›    09-24（周五）   │ │  截止 = DatePicker 触发行；
│ ┌──────────────────────────┐ │  AI 建议只读区：muted 底圆角10、
│ │ AI 建议                   │ │  padding 10 12、label 11 青灰 +
│ │ 今天与技术负责人确认新联调  │ │  文本 13/20 前景色（不可编辑，
│ │ 时间，更新排期后同步周报。  │ │  无覆盖入口——建议供人读）
│ └──────────────────────────┘ │
│ [    取消    ][  创建任务   ] │  按钮区 h44：次（transparent 冷缘）+
└────────────────────────────┘   主（墨青底 on-primary）1:1.4
```

弹层由 antd-mobile 弹层组件承载（Modal 或 Popup 由实现取其一，视觉规格如上不变）。提交：workStore.create + Toast「已创建任务 ·{标题}」+ navigate `#/work/:id`。验证：标题非空 + 截止默认明日 09:00 + 负责人默认「我」（demo 身份）。

### 6.6 AgentsView（`#/agents`，二级页）

```
┌────────────────────────────┐
│ ‹ AI 同事                   │  NavBar 返回 + 标题
│ ┌────────────────────────┐ │
│ │ (44) 智能填表助手  [表单] │ │  角色卡：霜白 16 圆角 padding 14，
│ │  一句话登记六类单据        │ │  整卡可点（尾随 chevron ›）；
│ │  [采购][入库][质检][供应商] │ │  卡头 = 角色戳 44（§3.2 材质：
│ └────────────────────────┘ │  primary-soft 底墨青描边单字 16/600）
│ ┌────────────────────────┐ │  + 显示名 16/24 600 + 类型徽标 10px
│ │ (44) 经营参谋      [参谋] │ │  胶囊（primary-10 底 --dshm-on-soft）；
│ │  经营问答 · 数据分析        │ │  职责 13/20 400 青灰两行截断；
│ │  [风险][周报][对比]        │ │  能力 chips：h24 圆角8 muted 底、
│ └────────────────────────┘ │  字 11 前景色、wrap gap 6（≤4 枚）
│ （企业数据助手 / 合规官同构）  │  点击 → 发起该角色会话（chat）
└────────────────────────────┘
```

角色集合 = 现有 4 preset（roster 原样，不虚构后端能力；显示名映射属 01 阶段一裁决，视觉规格与其解耦：卡渲染任何「显示名+职责+能力 chips」三元组）。

### 6.7 TasksView（`#/tasks`，二级页）

```
┌────────────────────────────┐
│ ‹ 任务                      │  NavBar 返回 + 标题
│ (我的 7)(团队 4)            │  CapsuleTabs 两枚（§6.2 同语言）
│ ● 接口联调延期处理    09-24  │  任务行：h56、行间 stroke-soft；
│ ● 供应商周报生成      09-25  │  左 8px 态点（§5.3）+ 标题 14/500
│ ◍ 检验报告归档        09-26  │  单行截断 + 右截止 11 num 青灰
│ ○ 库存月度盘点        10-01  │  （临期琥珀）；按截止升序；
│                            │  点击 → #/work/:id；
│ 团队（seed 可辨识）          │  团队组 = 首启 seed（任务行尾
│ ● 供应商资质年审 09-30 王经理 │  11px 负责人名），可辨识不冒充
└────────────────────────────┘
```

「我的」= workStore owner=我 派生；「团队」= seed 数据（PLAN D2）。空态：Empty + 「去对话里让 AI 同事派个活」CTA。

### 6.8 FilesView（`#/files`，二级页）

```
┌────────────────────────────┐
│ ‹ 文件                      │  NavBar 返回 + 标题
│ AI 生成                     │  分区标题行 13/500 青灰
│ (报) 项目风险汇总            │  文件行：h60、行间 stroke-soft；
│      来自 接口联调延期 · 09-22 │  类型徽标 24px 圆角6（primary-soft 底
│ (报) 供应商能力对比          │  --dshm-on-soft 单字 12/600：报/表/件）
│      来自 供应商周报 · 09-21 │  + 名 14/500 单行 + 元信息 11 青灰
│ 最近文件                    │  （来源工作 · 时间）+ 尾随收藏星
│ (件) 检验报告-0920.pdf ★     │  （lucide Star 20px；active 琥珀填充，
│      09-20                  │  inactive 冷缘描边——收藏是本地态，
│ 收藏                        │  琥珀=暖色语义位家族 §2）
│ (报) 项目风险汇总        ★  │  行点击 → 回源（会话锚点/工作详情），
└────────────────────────────┘  预览不新造面
```

三分区（AI 生成/最近文件/收藏）各配 Empty 短文案；AI 生成 = workStore 产物投影（report 文本），最近/收藏含 seed 可辨识。

### 6.9 底部 TabBar（4 项，chrome 白名单页渲染）

```
┌──────┬──────┬──────┬──────┐
│  ⌂   │  💬¹ │  ▤   │  👤  │  图标 lucide 20px：House /
│ AI同事│ 对话  │ 工作  │ 我的 │  MessageCircle（Badge 未读角标
└──────┴──────┴──────┴──────┘   destructive）/ ClipboardList / User
```

- 高 56px（`--dshm-tabbar-height`）+ SafeArea；卡底不透明 + 上缘冷缘 1px（不引入 blur）。
- 激活 = 图标与文字 primary 色 + 600 字重；未激活 = muted-foreground + 400；文字 10/14。
- antd-mobile TabBar 承载（v4 现状扩展），`--adm-color-primary` 已映射墨青自动跟随双轨。
- 图标无微动效（§3.4-6 判决）；切换转场走页面 fade（§8）。
- chrome 白名单：`home | chats | work | me` 四页渲染；chat/work-detail/tasks/files/agents/login 全屏层隐藏（PLAN §2.1）。

## 7. WCAG 对比度核算表

核算方法：WCAG 相对亮度公式（v3 §2.5 同方法）。正文级 ≥4.5:1（<18.66px 粗体 / <24px 常规）；大字与信息图形 ≥3:1。

### 7.1 v5 新增组合核算

| 前景 / 背景 | 对比度 | 用途 | 判定 |
|---|---|---|---|
| 前景色 `#1c2b29` / muted 格 `#e8efed` | 12.6:1 | 统计格/指标格标签、引用块文字 | AAA |
| 前景色 `#1c2b29` / 票头 `#e3eeec` | 12.4:1 | 票头台账抬头文字 | AAA |
| `--dshm-on-soft` `#0b5d56` / `#e3eeec` | 6.5:1 | starter chip / 报告戳字 / 快捷任务（12px） | AA |
| `--dshm-on-soft` `#0b5d56` / primary-10 on 卡 ≈`#e6f0ee` | 6.7:1 | 来源徽标 / 源摘要条 / actionBadge（亮轨，12-13px） | AA |
| 青灰 `#5c716d` / 卡 `#ffffff` | 5.2:1 | rows hint / 时间线步时间（12px） | AA |
| todo 青灰 `#5c716d` / 卡白（22/600 统计大数） | 5.2:1 | 大字级 ≥3:1 | AA+ |
| doing 墨青 `#0b5d56` / 卡白（大数） | 7.7:1 | 大字级 | AAA |
| review 琥珀 `#a85a10` / 卡白（大数） | 5.1:1 | 大字级 | AA+ |
| done 检验绿 `#1f7a4d` / 卡白（大数） | 5.3:1 | 大字级 | AA+ |
| 检验绿 `#1f7a4d` / muted `#e8efed`（时间线完成步点） | 4.6:1 | 信息图形 ≥3:1 | AA |
| 青灰 `#5c716d` / 卡白（future 步点描边） | 5.2:1 | 信息图形（§7.2-4 修正后） | AA |
| primary / 卡白（typing 呼吸点） | 7.7:1 | 图形 | AAA |
| 暗轨 `#e4ebe9` / 暗卡 `#172220` | 12.6:1 | 暗轨正文/标签 | AAA |
| 暗轨 on-soft `#e4ebe9` / `#1c2e2b` | 9.3:1 | 暗轨 chip 前景（§7.2-2 修正后） | AAA |
| 暗轨 primary `#4ca79c` / 暗卡 `#172220` | 5.7:1 | 暗轨 TabBar 激活 / 大数 / 步点 | AA |
| 暗轨琥珀 `#d08a3e` / 暗卡（大数/截止临期） | 4.9:1 | AA | AA |
| 暗轨青灰 `#9bb0ab` / 暗卡（大数/标签） | 7.1:1 | AA+ | AA |
| 暗轨绿 `#4e9e6f` / 暗卡（大数/步点） | 4.6:1 | AA | AA |

其余沿用 v3 §2.5 已核值（青墨/冷雾白 13.0、白/墨青 7.7、绿/白 5.3、琥珀/白 5.1、砖红/白 5.1、暗轨语义色 on 暗卡 4.6-4.9）。

### 7.2 v4 存量组合复核：三处 FAIL 与修正（B 方案的审计增量）

选 B 不等于 v4 资产一字不动——本次核算暴露三处存量不达标，修正全部是 1-2 行 CSS 级，随 v5 实现落地：

1. **青灰 11px 标签 on muted 格：`#5c716d` / `#e8efed` = 4.46:1，FAIL（差 0.04）。** 影响面：[v3.module.css](../../packages/client/ui-mobile/src/client/forms/v3/v3.module.css:427) `.metricLabel`、[messages.module.css](../../packages/client/ui-mobile/src/client/messages/messages.module.css:667) `.metricMiniLabel`。修正：**muted 底上的 ≤13px 标签前景统一 `--dshm-foreground`**（12.6:1）；层级改由字号/字重区分（11/400 vs 20-22/600），不改材质。v5 新组件（统计格/指标格）直接执行此规则（§6.1/§6.4 已写入）。
2. **暗轨 chip 前景 primary on primary-soft：`#4ca79c` / `#1c2e2b` = 3.9:1，FAIL；actionBadge primary on primary-10 on 暗卡 ≈3.25:1，FAIL。** 影响面：[messages.module.css:302](../../packages/client/ui-mobile/src/client/messages/messages.module.css:302) `.starter`、[:435](../../packages/client/ui-mobile/src/client/messages/messages.module.css:435) `.askChip`、[:506](../../packages/client/ui-mobile/src/client/messages/messages.module.css:506) `.actionBadge`、[:685](../../packages/client/ui-mobile/src/client/messages/messages.module.css:685) `.choiceCapsule`（前两处字 12px、后两处 12-13px，均正文级）。修正：**新增字面双值 token `--dshm-on-soft`（亮 `#0b5d56` 6.5:1 / 暗 `#e4ebe9` 9.3:1），四处 chip 前景统一改引用**（§4.2/§4.3 已落值；亮轨视觉零变化——亮值就是 primary）。
3. **回执绿洗上的青灰小字：`#5c716d` on 绿洗 blend ≈`#dbe9e4` = 4.16:1，FAIL。** 影响面：回执卡内的 `.stepLabel`（11px）。修正：绿洗面上的 ≤13px 文字前景统一 `--dshm-foreground`。与修正 1 合并为一条总规则：**非纯卡白底（muted/primary-10/primary-soft/绿洗）上的小字一律前景色 token**。
4. **（图形级顺带修正）** 时间线/流程条的未达步点描边不得用冷缘 `#d5e0dd`（on 白 1.35:1，信息图形不达 3:1）——v3 流程条已完成态不涉及，v5 时间线 future 步点规格直接用青灰描边（5.2:1），写死在 §6.3。

修正后全表无 FAIL；三条总规则（on-soft 前景 / 洗底小字用前景色 / 未达图形用青灰）并入实现清单（§11）。

**B3 补记（2026-09-23，B2 验收 findings）**：深色态「我」头像字与次级文字实测偏弱——「我」字原为暗轨 on-primary `#0d1413` 落在硬编码头像底 `#1c2b29` 上（≈1.2:1），次级/说明文字 `#9bb0ab` 理论 7.1:1 但小字号下观感临界。裁决（对比度优先于原 token 值）：头像底改 `var(--dshm-primary)`（亮 7.7:1 / 暗 6.5:1，两轨同规）；暗轨 `--dshm-muted-foreground` 提亮 `#9bb0ab → #b0c1bb`（on 暗卡 ≈9.0:1），上表 7.1:1 行以本补记为准。

## 8. 动效清单（克制原则，全应用七处，只服务信息变化）

| # | 动效 | 规格 | 触发 | reduced-motion |
|---|---|---|---|---|
| 1 | 新消息/新卡片入场 | translateY(8px)→0 + opacity，180ms ease-out | 聊天流新 item | 瞬时显示 |
| 2 | 选项点选反馈 | 背景填充 120ms + 已答组降不透明度 200ms | ask 三形态 | transition:none |
| 3 | 相位戳盖章 | scale 1.25→1 + rotate −8°→−3°，200ms `--dshm-ease-stamp`；WorkStamp 翻 done 同款 | submitted / 工作翻 done | 瞬时 |
| 4 | 二级页推入 | translateX(24px)→0 + opacity 0→1，240ms `--dshm-ease-slide`，mount 时执行一次（离开不动画——hash 路由卸载瞬时） | tasks/files/agents/work-detail/chat 进入 | 瞬时 |
| 5 | Tab 页切换 | opacity 0→1，160ms ease-out，mount 一次 | home/chats/work/me 互切 | 瞬时 |
| 6 | typing 戳点呼吸 | 三枚 6px 墨青点 opacity 交错循环，1.2s infinite | 演示态流式模拟 + 真实态 running 轮询窗口（同形态） | 静态三点 |
| 7 | 时间线步骤进入 | translateY(6px)→0 + opacity，180ms ease-out | 执行时间线新增步骤 | 瞬时 |

纪律：只动 transform/opacity；无 spring 过冲、无发光、无图标弹跳、无 TabBar 微动效（§3.4-6/7 判决）；弹层/Toast 用 antd-mobile 默认动效（v3 既定）；暗色切换无动效。全部尊重 `prefers-reduced-motion: reduce`。

## 9. antd-mobile v5 边界表

| 用 antd-mobile | 自绘（CSS module） | 理由 |
|---|---|---|
| TabBar + SafeArea（4 Tab） | TabBar 内 lucide 图标与文字样式 | 汇报中 [MobileShell](../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx:47) 现状扩展 |
| NavBar（二级页与全屏层返回） | HomeView 全部（票头/统计格/横滑角色卡/快捷 chips） | 工作台门面是品牌核心面 |
| CapsuleTabs（WorkView 四态 / TasksView 两组 / 会话过滤） | WorkStamp / PhaseStamp / 报告戳 / 角色戳（戳家族） | signature 元素 |
| Modal/Popup（TaskFormModal、弹层兜底） | ReportCard | v5 签名组件，无对应组件 |
| Picker / DatePicker / Input（表单控件） | 执行时间线（装订线+步点） | 台账经手记录的独有形态 |
| Toast（创建任务/翻态反馈） | 任务卡 / 任务行 / 文件行 | fold/workStore 投影非纯展示 |
| SwipeAction（会话列表） | 会话行、气泡、ask 三形态、富渲染（v4 全量继承） | v3 §7 既定 |
| SearchBar / Badge（未读角标） | 票头、来源徽标、类型徽标、能力 chips | 票据构件 |
| Collapse（系统折叠区） | typing 戳点呼吸 | 与 DotLoading 区分的品牌点 |
| DotLoading（pending/doing 戳内呼吸） | 收藏星、快捷任务 chips（starter 语言） | 本地态轻元素 |
| Empty（工作/任务/文件空态） | 登录页/欢迎屏品牌区 | v3 §7 既定 |

主题映射不变：`--adm-*` 全量经 var() 挂接 `--dshm-*`（[tokens.css:55](../../packages/client/ui-mobile/src/client/tokens.css:55)），v5 增量 token（on-soft、work 四态）不进 antd 面（纯自绘消费）。

## 10. 参考 HTML 形态吸收表（裁决标准④落地）

| 参考 HTML 元素 | 形态吸收去向 | 皮肤裁决 |
|---|---|---|
| metrics 三列网格（20px 大数 + 10px 标签） | ReportCard metrics（§6.4）+ HomeView 统计格（§6.1） | 格改 muted 底 + 前景色标签（§7.2-1）；值 tone 色映射 |
| 风险条目（dot + label + hint + 行内按钮） | ReportCard rows（§6.4） | dot 色相改语义轨（红/琥珀/青灰）；行内按钮改下划线文字钮 |
| 对比 table（列头灰 + 分隔线） | ReportCard table（§6.4） | 沿用 v4 richText 表格语言（列头 on muted 行底、首列青灰） |
| actions 按钮排（primary + secondary） | ReportCard actions（§6.4）+ 各态操作区 | primary 改墨青底、h36 圆角10；次按钮冷缘描边 |
| typing 指示（文字「正在思考」） | typing 戳点呼吸（§8-6） | 文字改三戳点 +「正在处理」，与 DotLoading 家族呼吸同频 |
| quick replies 快捷输入行 | HomeView 快捷任务 chips（§6.1） | starter 语言（primary-soft 底）复用，不新增输入区上方横条（与 v3 上下文 chips 职责冲突） |
| 430px 壳 | 不采纳 | 主目标 390×844（v3 既定），PC 预览壳已有 390 壳 |
| 暖棕 `#6b4f3a` / 米白 `#f6f6f4` 皮肤 | 不采纳 | §1/§2 裁决与否决记录 |
| 透明 AI 气泡（AI 说话不用底） | 不采纳 | v3 气泡语言（霜白底+冷缘）是聊天流的台账基线，report 卡已承载结构化产出 |

## 11. 实现落地清单（v4 资产修正项汇总，交 04-implementation-spec）

1. [tokens.css](../../packages/client/ui-mobile/src/client/tokens.css:1)：亮轨追加 §4.2 增量块、暗轨追加 `--dshm-on-soft`（§4.3）。
2. 戳基类抽取：`.stamp` 材质家族可共享化 + WorkStamp 四态修饰类（§5.2）。
3. WCAG 修正三条总规则落地（§7.2）：`.metricLabel/.metricMiniLabel` 前景改前景色；`.starter/.askChip/.actionBadge/.choiceCapsule` 前景改 `var(--dshm-on-soft)`；回执绿洗小字前景改前景色。
4. 新组件 CSS module：home/work（含时间线）/report 卡/角色卡/文件行，全部只消费 `--dshm-*` token（业务层零硬编码 hex，维持 v4 仅 3 处现状并争取清零）。
5. 动效 token 化（§8）：七处动效引用 motion/ease token；reduced-motion 媒体查询逐处降级。
6. 截图基线更新：14 张 verify 截图按 8 路由重录（v5 证据目录 `verify-*.png`），浅暗双轨关键页全覆盖。
