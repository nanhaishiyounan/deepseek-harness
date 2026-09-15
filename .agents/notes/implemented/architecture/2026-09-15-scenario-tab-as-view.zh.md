# Agent Note: Scenario portal as its own view tab

Status: implemented

[English](2026-09-15-scenario-tab-as-view.md) | 中文

## 问题

30 场景精选门户（精选场景）此前渲染在会话输入区的座位上——该座位跨所有业务 tab 常驻。于是每次切到连接器、图谱、业务或资产 tab，场景门户都会再次出现，这正是用户最刺眼的抱怨（「不要每次点连接器、图谱什么的都展示！！！！」）。

## 决策

hero 从座位迁为一等 view。tab 是纯 slot 名单表（无路由），因此改动只是一次注册：ui-kb 声明 `scenarios` view，并停止在 `conversation.input.dock` 上注册 `kb-portal`（座位声明本身保留，queue/todo/goal 住户不动）。`KbHeroDock` 改造为视图组件：渲染条件从 blank-only 放宽为场景 tab 激活即渲染，删除 `workbenchMounted` 让位逻辑，`KbHeroHeadline` 留守 chat。`scenarios.ts` 不动，catalog-sync 门禁零影响。

## 备选方案

**保留座位、逐 tab 隐藏。** 每个 tab 都得认识场景门户；下次加 tab 时同类泄露必然回潮。view 座位把隐藏变成结构性事实。

**为 tab 引入路由。** tab 条刻意由 slot 名驱动；为单独一个面板分叉导航状态得不偿失。

**把门户挪进 KB workbench。** workbench 已为自己的视图做让位；再嵌一层让位链等于把同一个条件泄露下移一级。

## Consequences

场景门户只在进入自己的 tab 时渲染一次，其他任何地方不再出现；输入区座位保留其余住户不动。空白会话仍保留 headline 与示例问题。场景目录与同步门禁零改动，后续场景编辑不携带 tab 侧耦合。
