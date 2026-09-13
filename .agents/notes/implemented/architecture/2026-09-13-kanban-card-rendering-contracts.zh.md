# Agent Note: 看板 v1 卡片渲染的两个隐性契约（主键字段声明 + card 键名）

Status: implemented

[English](2026-09-13-kanban-card-rendering-contracts.md) | 中文

## 问题

「项目管理 > 任务看板」v1 页自建成起 API 返回 19 条任务、分组列头正常渲染，但每张卡片是空骨架（`data-testid="card-undefined"`，无任何字段文本），浏览器零报错。E5 统一验证以"DOM 0 个标题节点"立案。

## 决策

两个独立缺陷叠加，都在种子侧修复（`nocobase-hub-modules.mts`），不改 vendored plugin-kanban：

- **主键字段声明缺失**：`collections:create` 建表只给 id 数据库列、不写 fields 元数据行；客户端 `Collection.getPrimaryKey()` 依赖 `options.primaryKey`/`options.targetKey`/`fields{primaryKey:true}` 三者之一（不读 collection 的 primaryKey 列），全部为空时返回 undefined。plugin-kanban 的 `toColumns` 以 `id: ds[primaryKey]` 组卡片——undefined 主键让 RecordProvider 拿不到记录、字段静默渲染为空。内置表（users）自带主键字段声明所以从未踩坑。修复：`ensurePrimaryKeyFields` 对全部种子表幂等补 `{name:'id', type:'bigInt', interface:'id', primaryKey:true}`（fields:create 对已存在列是元数据 no-op，无 DDL）。
- **卡片键名契约**：官方 `createKanbanBlockUISchema` 把 Kanban 数组的卡片段放在**固定 properties 键 `card`** 下，渲染端 renderCard 按 `fieldSchema.properties.card` 键名取；卡内字段还必须包在 `Grid.Row → Grid.Col` 里（卡内 Grid 只渲染行子节点，裸字段节点不可见）。种子此前用随机 nodeKey 且字段直接挂在 Grid properties 下——列头、拖拽骨架都活着，唯独卡片内容永不出现。修复：工厂对齐官方形态，`kanbanCardKeyIntact` 幂等校验两个契约，坏块销毁 Grid.Row 后重种。

## 备选方案

**改 collections:update 的顶层 primaryKey。** 否决：那是服务端 filter 用的列，客户端 Collection 不读它（实测补写后 listMeta 顶层虽返回、渲染仍空），必须走 fields 声明。

**手工修库不改种子。** 否决：reset 后缺陷即回归；种子是行为真源。

## 结果

- 任务看板 19 张卡片全字段渲染（任务标题/所属项目/负责人/优先级），对照截图 `demos/acceptance-e1/E5-kanban-v1-cards-fixed.png`；日历/甘特经排查本就正常（不同渲染链，不依赖这两个契约）。
- 主键声明让所有种子表的前端主键解析回到 'id'——任何未来按 `getPrimaryKey()` 取主键的块（看板/关联选择器等）不再踩同一坑。
- 看板幂等判据升级为"块存在 **且** card 键契约成立"，坏块自动销毁重种；中间态（card 键对但无 Row 包裹）同样被拦截。
