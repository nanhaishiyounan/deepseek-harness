# Agent Note: Two hidden contracts behind kanban v1 card rendering (primary-key field declaration + the `card` key)

Status: implemented

English | [中文](2026-09-13-kanban-card-rendering-contracts.zh.md)

## Problem

The 项目管理 > 任务看板 v1 page returned 19 tasks over the API and rendered its group column headers, yet every card was an empty shell (`data-testid="card-undefined"`, no field text) with zero browser errors — since the page was first seeded. Filed during the E5 unified verification as "0 title nodes in the DOM".

## Decision

Two independent defects, both fixed on the seed side (`nocobase-hub-modules.mts`); vendored plugin-kanban untouched.

- **Missing primary-key field declaration**: `collections:create` grants the id database column but writes no fields-metadata row. The client `Collection.getPrimaryKey()` needs one of `options.primaryKey` / `options.targetKey` / a `fields{primaryKey:true}` entry (it does not read the collection's primaryKey column) and returns undefined when all are absent. plugin-kanban's `toColumns` builds cards as `id: ds[primaryKey]` — an undefined primary key leaves RecordProvider without a record and every field renders silently empty. Built-in collections (users) ship the declaration, which is why only seed tables hit this. Fix: `ensurePrimaryKeyFields` idempotently adds `{name:'id', type:'bigInt', interface:'id', primaryKey:true}` to every seeded collection (fields:create is a metadata no-op against an existing column — no DDL).
- **The card key contract**: the official `createKanbanBlockUISchema` puts the Kanban array's card child under the **fixed properties key `card`**, and renderCard reads `fieldSchema.properties.card` by name; card fields must additionally sit inside `Grid.Row → Grid.Col` (the card Grid only renders row children — a bare field node stays invisible). The seed had used a random nodeKey and hung fields directly on the Grid — headers and drag skeletons lived, card content never did. Fix: the factory mirrors the official shape, `kanbanCardKeyIntact` checks both contracts idempotently, and broken blocks are destroyed down to their Grid.Rows and reseeded.

## Alternatives considered

**Set the collection's top-level primaryKey via collections:update.** Rejected: that column feeds server-side filtering; the client Collection never reads it (measured: after writing it, listMeta echoed the value and rendering stayed empty). The fields declaration is the only path.

**Patch the database by hand and leave the seed alone.** Rejected: a reset would reintroduce the defect; the seed is the source of behavior.

## Consequences

- All 19 cards render every field (任务标题/所属项目/负责人/优先级); before/after evidence in `demos/acceptance-e1/E5-kanban-v1-cards-fixed.png`. Calendar and gantt pages were probed healthy all along — different render chains with no dependency on either contract.
- The primary-key declarations return every seeded collection's client-side primary key to 'id' — any future block that reads `getPrimaryKey()` (kanban boards, association pickers, …) stops falling into the same pit.
- The kanban idempotency predicate is now "block exists **and** the card-key contract holds"; intermediate states (card key right, fields still unwrapped in rows) are caught by the same check.
