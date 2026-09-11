# Agent Note: 场景门户信息架构——精选行、分类收纳、即时检索

Status: implemented

[English](2026-09-10-scenario-portal-ia.md) | 中文

## 问题

blank 会话门户把三十张场景卡在八个分类组内全量平铺——无检索、无折叠、无分页。任何视口都背着整个目录，用户读到的就是一面噪声墙（"30 个场景怎么一直都在"）。目录 id 集合、preset 目录同步门禁与 `agentPresets.select` 点击链路本身是对的，保持不动；缺的是呈现层的信息架构。

## 决策

### 三区结构：精选前排行、折叠分类收纳、即时检索

门户仍是静态目录，浏览状态收在 `KbHeroDock`：目录行上的 `featured: true` 标记圈定六张前排卡（market-insight、food-safety-service、cost-pricing、export-compliance、supply-chain-finance、cold-chain——高频业务主线各取一位代表角色），八个分类行以计数徽章 + `aria-expanded` 折叠呈现，检索框对全部三十卡做即时过滤。空查询渲染精选 + 收纳；任意非空查询把两区替换为按分类分组的匹配结果、`匹配 {n} / {total}` 摘要与零命中空态。任何场景两次交互内可达：精选一击直达，其余靠展开分类或输入关键词后再点卡。

### 过滤是目录上的纯函数，不是组件逻辑

`filterScenarios(pool, query)`（六字段、双语言面、大小写不敏感、空查询返回 `null`）、`featuredScenarios(pool)` 与带池参数的 `scenariosByCategory(pool)` 落在 `scenarios.ts` 数据旁，域单测直接断言过滤矩阵（空 → null、`食安` → 跨两类的四命中、`COLD CHAIN` → cold-chain、未命中 → 空数组），不挂 React。组件只持有两个状态格（查询串、已展开分类集合）。

### 目录计数断言迁到收纳区标题

`usage.chipScenarios` 继续在用量 chip 上报全目录数（`30 个场景`），`scenario.railCount` 改为收纳区标题上的 `{n} 个场景 · 分类浏览`——e2e 通道现在精确锚 chip、字面锚标题，并新增三条结构性断言：默认视口卡数 ≤10（DOM 数六 + 视口相交检查）、检索过滤（`食安` 四卡、未命中零卡加空态、清除后恢复六卡）、折叠路径（展开食品安全，点击精选行与常规关键词都照不到的 label-review 卡，经同一确认弹窗启动会话）。

### KbEntry 的可访问名是角标语义，不是标签

提交 57a87db34c 把侧栏入口的 `aria-label` 从 `entry.documentsBadge` 改成 `entry.label`，没有同步 `kbentry.client.spec.tsx` 与 kb-workbench e2e 通道的 `知识库文档数` 角色查询，两边在 HEAD 上皆红。恢复为 `entry.documentsBadge` 的一行改动就是两套测试面已经声明的契约：入口的可访问名道出它携带的角标；而裸 `entry.label` 名还会与 header 切换按钮的同名可访问名在角色查询里相撞。

## 已考虑的替代方案

**分类 chip 切换或 tab。** 放弃：chip 一次只暴露一个分类且多出一个要解除的心智模式；折叠行让每个分类都保持一次可见点击可达，并与检索正交组合。

**分页。** 放弃：场景栏是一组并发入口而非线性阅读列表——分页把场景藏到没有人拥有的序号后面。

**虚拟化。** 放弃：三十张卡远够不着 DOM 压力；问题是呈现，不是渲染成本。

## 后果

目录的 id 集合、分类与两道同步门禁逐字节不变；`featured` 是纯呈现的增量字段，后端与 preset 目录毫无感知。kb-workbench e2e 通道的目录计数断言从平铺文案迁到 chip + 标题对，并新增三条结构性用例（视口上限、检索过滤、折叠路径），域单测免挂 React 直接钉死过滤矩阵。KbEntry 的一行回退让 HEAD 上的 `kbentry.client.spec.tsx` 转绿，通道侧栏查询也不再歧义。视觉打磨（间距节奏、卡片立体感、字级层级）刻意不在本批，随批次四共享页面骨架的视觉批落地。
